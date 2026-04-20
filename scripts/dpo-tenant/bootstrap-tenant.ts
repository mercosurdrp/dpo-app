/**
 * bootstrap-tenant.ts
 * ------------------------------------------------------------
 * Prepara una DB Supabase RECIEN CREADA (proyecto nuevo y limpio)
 * para usarse como tenant del manual DPO (ej: "Mercosur
 * Distribuciones" en Misiones).
 *
 * Uso:
 *   export DEST_SUPABASE_URL=https://xxx.supabase.co
 *   export DEST_SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   # Opcional (recomendado): string de conexion a Postgres para
 *   # ejecutar el SQL crudo de migraciones/seed sin depender de un
 *   # RPC 'exec_sql' que no existe por defecto en un proyecto nuevo.
 *   export DEST_SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
 *
 *   npx tsx scripts/dpo-tenant/bootstrap-tenant.ts \
 *     --admin-email admin@mercosurdistribuciones.local \
 *     --admin-password <pass-seguro-min-8-chars> \
 *     --admin-nombre "Admin Distribuciones"
 *
 * Pasos (en orden):
 *   1. Aplicar todas las migraciones SQL de supabase/migrations/*.sql
 *      en orden lexicografico.
 *   2. Limpiar tablas con seed hardcoded que no corresponde al tenant
 *      nuevo (empleados, capacitaciones, catalogo_vehiculos).
 *   3. Ejecutar seeds/master_seed.sql (catalogo universal del manual).
 *   4. Crear usuario admin (auth + profile con role='admin').
 *   5. Crear 4 slots vacios de responsables 5S para el mes actual.
 *   6. Crear los 6 buckets de storage (idempotente; las migraciones
 *      ya crean 5 de ellos, este paso asegura que esten todos).
 *   7. Verificar contadores y emitir tabla resumen.
 *
 * Requiere:
 *   - pg         (ya en dependencies)
 *   - @supabase/supabase-js (ya en dependencies)
 *   - tsx        (via npx)
 *
 * NOTA: este script NO configura integraciones externas (Chess API,
 * Foxtrot API, OpenAI). Ver README.md de esta misma carpeta.
 * ------------------------------------------------------------
 */

import { config as loadEnv } from "dotenv"
import fs from "node:fs"
import path from "node:path"

// Carga .env.local por si el usuario prefiere setear las vars ahi.
// Las DEST_* igual tienen prioridad sobre cualquier otro valor.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { Client as PgClient } from "pg"

// ------------------------------------------------------------
// Helpers de logging
// ------------------------------------------------------------

const log = {
  info: (msg: string) => console.log(`  ${msg}`),
  step: (n: number, msg: string) =>
    console.log(`\n==> Paso ${n}: ${msg}`),
  ok: (msg: string) => console.log(`  [OK] ${msg}`),
  warn: (msg: string) => console.warn(`  [WARN] ${msg}`),
  err: (msg: string) => console.error(`  [ERR] ${msg}`),
}

function fatal(msg: string, code = 1): never {
  console.error(`\nFATAL: ${msg}`)
  process.exit(code)
}

// ------------------------------------------------------------
// Parseo de argumentos
// ------------------------------------------------------------

interface CliArgs {
  adminEmail: string
  adminPassword: string
  adminNombre: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    switch (a) {
      case "--admin-email":
        args.adminEmail = next
        i++
        break
      case "--admin-password":
        args.adminPassword = next
        i++
        break
      case "--admin-nombre":
        args.adminNombre = next
        i++
        break
    }
  }
  const missing: string[] = []
  if (!args.adminEmail) missing.push("--admin-email")
  if (!args.adminPassword) missing.push("--admin-password")
  if (!args.adminNombre) missing.push("--admin-nombre")
  if (missing.length > 0) {
    fatal(
      `Faltan argumentos: ${missing.join(", ")}.\n` +
        `Uso:\n  npx tsx scripts/dpo-tenant/bootstrap-tenant.ts \\\n` +
        `    --admin-email <email> \\\n` +
        `    --admin-password <password> \\\n` +
        `    --admin-nombre "<nombre completo>"`,
    )
  }
  return args as CliArgs
}

// ------------------------------------------------------------
// Config (credenciales DESTINO)
// ------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === "") {
    fatal(
      `Falta la variable de entorno ${name}.\n` +
        `Seteala con:\n  export ${name}=...\n` +
        `Necesitamos DEST_SUPABASE_URL y DEST_SUPABASE_SERVICE_ROLE_KEY.\n` +
        `Recomendado: DEST_SUPABASE_DB_URL (postgres connection string) para\n` +
        `que el script pueda ejecutar las migraciones SQL directamente.`,
    )
  }
  return v
}

function deriveDbUrlFromSupabase(_supabaseUrl: string): string | null {
  // El host de DB en Supabase es db.<ref>.supabase.co, pero NO podemos
  // inferir la PASSWORD de la DB desde el service_role_key. Por eso
  // este script exige DEST_SUPABASE_DB_URL explicitamente.
  //
  // AMBIGUEDAD: los proyectos nuevos de Supabase vienen con un password
  // generado que el usuario tiene que copiar del dashboard (Settings >
  // Database > Connection string). No hay forma programatica de
  // obtenerlo con solo el service_role_key.
  return null
}

// ------------------------------------------------------------
// Ejecucion de SQL crudo (pg client)
// ------------------------------------------------------------

async function connectPg(dbUrl: string): Promise<PgClient> {
  const client = new PgClient({
    connectionString: dbUrl,
    // Supabase requiere SSL. El certificado del pooler/direct connection
    // no siempre verifica contra la CA del sistema, asi que aceptamos
    // la conexion encriptada sin verificar la cadena (el riesgo real
    // queda cubierto porque el usuario controla el DNS del host).
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

async function execSqlFile(client: PgClient, filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, "utf8")
  // pg 'simple query' protocol soporta multi-statement cuando NO pasamos
  // parametros. Mantiene DO $$ ... $$ y funciones con dollar-quote
  // intactas porque es el mismo texto que le pasarias al `psql`.
  try {
    await client.query(sql)
  } catch (err) {
    const name = path.basename(filePath)
    throw new Error(
      `Fallo ejecutando ${name}: ${(err as Error).message}\n` +
        `(abortando; revisar el SQL y/o el estado de la DB destino)`,
    )
  }
}

// ------------------------------------------------------------
// Paso 1: migraciones
// ------------------------------------------------------------

async function applyMigrations(client: PgClient): Promise<void> {
  const migrationsDir = path.resolve(
    process.cwd(),
    "supabase",
    "migrations",
  )
  if (!fs.existsSync(migrationsDir)) {
    fatal(`No existe el directorio de migraciones: ${migrationsDir}`)
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort() // orden lexicografico: 001_..., 002_..., ..., 032_...

  if (files.length === 0) {
    fatal(`No se encontraron archivos .sql en ${migrationsDir}`)
  }

  log.info(`Encontradas ${files.length} migraciones. Aplicando en orden...`)
  for (const f of files) {
    const full = path.join(migrationsDir, f)
    process.stdout.write(`   - ${f} ... `)
    await execSqlFile(client, full)
    process.stdout.write("OK\n")
  }
  log.ok(`${files.length} migraciones aplicadas.`)
}

// ------------------------------------------------------------
// Paso 2: limpiar tablas con seed hardcoded
// ------------------------------------------------------------
//
// Tablas que las migraciones INSERTAN con datos operativos de la DB
// original (Mercosur DRP) y que el tenant nuevo NO debe heredar.
// Ver scripts/dpo-tenant/TABLAS_A_LIMPIAR.md para el detalle de
// de donde viene cada seed.
//
// Se limpian en orden hijos -> padres para no romper FKs. Las tablas
// vinculadas a empleados (asistencias, examen_intentos, mapeo_*,
// s5_sector_responsables, etc.) se vacian via CASCADE de empleados.

const TABLAS_A_LIMPIAR = [
  // Operativo vinculado a empleados originales (por si la migracion 026
  // migro datos de asistencias -> examen_intentos antes de vaciar):
  "examen_intentos",
  // capacitaciones: migracion 007 no inserta filas, pero master_seed.sql
  // va a poblar este catalogo. Vaciamos por si existiera algun registro
  // espureo de ejecuciones anteriores.
  "capacitaciones",
  // catalogo_vehiculos: migracion 031_vehiculos_sector.sql inserta 4
  // vehiculos del deposito original (Mercosur DRP). El tenant nuevo
  // debe arrancar vacio y cargar sus propios dominios.
  "catalogo_vehiculos",
  // empleados: migracion 007_capacitaciones.sql hace un INSERT fijo de
  // ~25 empleados de Mercosur DRP.
  "empleados",
] as const

async function cleanOperationalSeeds(client: PgClient): Promise<void> {
  for (const t of TABLAS_A_LIMPIAR) {
    // CASCADE para vaciar tambien las tablas dependientes (asistencias,
    // mapeo_empleado_*, s5_sector_responsables, etc.) sin tener que
    // enumerarlas explicitamente. Las tablas master (pilares, preguntas,
    // checklist_items, s5_items_catalogo, owd_items) NO tienen FK hacia
    // estas, asi que el catalogo del manual queda intacto.
    process.stdout.write(`   - TRUNCATE ${t} CASCADE ... `)
    await client.query(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE;`)
    process.stdout.write("OK\n")
  }
  log.ok(`${TABLAS_A_LIMPIAR.length} tablas limpiadas.`)
}

// ------------------------------------------------------------
// Paso 3: aplicar master_seed.sql
// ------------------------------------------------------------

async function applyMasterSeed(client: PgClient): Promise<void> {
  const seedPath = path.resolve(
    process.cwd(),
    "scripts",
    "dpo-tenant",
    "seeds",
    "master_seed.sql",
  )
  if (!fs.existsSync(seedPath)) {
    fatal(
      `No existe ${seedPath}.\n` +
        `Generalo primero con:\n  npx tsx scripts/dpo-tenant/export-master.ts`,
    )
  }
  const size = fs.statSync(seedPath).size
  log.info(`Aplicando master_seed.sql (${(size / 1024).toFixed(1)} KB)...`)
  await execSqlFile(client, seedPath)
  log.ok(`master_seed.sql aplicado.`)
}

// ------------------------------------------------------------
// Paso 4: crear admin
// ------------------------------------------------------------

async function createAdmin(
  supabase: SupabaseClient,
  client: PgClient,
  args: CliArgs,
): Promise<string> {
  // createUser auto-dispara el trigger on_auth_user_created (ver
  // migracion 001) que inserta una fila en profiles con role 'viewer'
  // por default. Despues hacemos UPDATE para elevarlo a 'admin'.
  const { data, error } = await supabase.auth.admin.createUser({
    email: args.adminEmail,
    password: args.adminPassword,
    email_confirm: true,
    user_metadata: { nombre: args.adminNombre, role: "admin" },
  })
  if (error) {
    throw new Error(`No se pudo crear el usuario admin: ${error.message}`)
  }
  const userId = data.user?.id
  if (!userId) {
    throw new Error("createUser devolvio sin id de usuario.")
  }
  log.ok(`Usuario auth creado (id=${userId})`)

  // Elevar role=admin y asegurar active=true + nombre correcto.
  // El trigger ya inserto la fila; hacemos UPSERT por si el trigger
  // estuviera deshabilitado en algun entorno.
  const upsertSql = `
    INSERT INTO profiles (id, email, nombre, role, active)
    VALUES ($1, $2, $3, 'admin', true)
    ON CONFLICT (id) DO UPDATE
      SET role = 'admin',
          active = true,
          nombre = EXCLUDED.nombre,
          email = EXCLUDED.email;
  `
  await client.query(upsertSql, [userId, args.adminEmail, args.adminNombre])
  log.ok(`Profile promovido a role=admin`)
  return userId
}

// ------------------------------------------------------------
// Paso 5: slots vacios de responsables 5S
// ------------------------------------------------------------
//
// AMBIGUEDAD: en la migracion 028, s5_sector_responsables.empleado_id
// es NOT NULL. El requerimiento pedia insertar filas con empleado_id
// = null, lo que violaria esa constraint. Como no es critico para
// arrancar (la UI simplemente mostrara "sin asignar"), saltamos este
// paso cuando la columna sigue siendo NOT NULL y logueamos para que
// el usuario lo sepa. Si en el futuro una migracion relaja la
// constraint, este paso lo aprovechara sin cambios.

async function createEmptyS5Sectors(client: PgClient): Promise<void> {
  // Detectar si empleado_id admite NULL.
  const { rows } = await client.query<{ is_nullable: "YES" | "NO" }>(
    `SELECT is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 's5_sector_responsables'
        AND column_name  = 'empleado_id'`,
  )
  const nullable = rows[0]?.is_nullable === "YES"
  if (!nullable) {
    log.warn(
      "s5_sector_responsables.empleado_id es NOT NULL en el esquema actual; " +
        "se omite la creacion de slots vacios (se crearan cuando el admin " +
        "asigne responsables reales desde la UI).",
    )
    return
  }

  // Periodo = primer dia del mes corriente (la tabla espera siempre dia 01).
  const today = new Date()
  const periodo = `${today.getUTCFullYear()}-${String(
    today.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`

  for (let n = 1; n <= 4; n++) {
    await client.query(
      `INSERT INTO s5_sector_responsables (periodo, sector_numero, empleado_id, nombre)
       VALUES ($1, $2, NULL, NULL)
       ON CONFLICT (periodo, sector_numero) DO NOTHING`,
      [periodo, n],
    )
  }
  log.ok(`4 slots 5S creados para periodo ${periodo}.`)
}

// ------------------------------------------------------------
// Paso 6: buckets de storage
// ------------------------------------------------------------
//
// Las migraciones 004, 005, 021, 025 y 030 ya hacen INSERT INTO
// storage.buckets. Este paso es defensivo: llama al admin API de
// Supabase Storage para asegurar que los 5 buckets existan incluso
// si alguna migracion fallara silenciosamente. Agregamos tambien un
// bucket 'capacitaciones' por si material_url necesita uno propio
// (actualmente usa 'evidencias'); el README aclara los 6.
//
// AMBIGUEDAD: el requerimiento habla de 6 buckets. En el codebase
// solo se referencian 5 (sops, evidencias, dpo-evidencia,
// reportes-seguridad, linea-etica). El sexto se incluye como
// 'capacitaciones' para uso futuro del modulo de examenes; si no
// hace falta, el admin puede borrarlo desde el dashboard.

interface BucketSpec {
  id: string
  public: boolean
}

const BUCKETS: BucketSpec[] = [
  { id: "sops", public: true },
  { id: "evidencias", public: true },
  { id: "dpo-evidencia", public: true },
  { id: "reportes-seguridad", public: true },
  { id: "linea-etica", public: true },
  { id: "capacitaciones", public: true },
]

async function ensureBuckets(supabase: SupabaseClient): Promise<void> {
  const { data: existing, error: listErr } =
    await supabase.storage.listBuckets()
  if (listErr) {
    log.warn(
      `No se pudo listar buckets via admin API (${listErr.message}). ` +
        `Las migraciones ya intentaron crearlos; verificar manualmente ` +
        `en el dashboard de Supabase.`,
    )
    return
  }
  const existingIds = new Set((existing ?? []).map((b) => b.id))
  for (const b of BUCKETS) {
    if (existingIds.has(b.id)) {
      log.info(`bucket '${b.id}' ya existe`)
      continue
    }
    const { error } = await supabase.storage.createBucket(b.id, {
      public: b.public,
    })
    if (error) {
      log.warn(`No se pudo crear bucket '${b.id}': ${error.message}`)
    } else {
      log.ok(`bucket '${b.id}' creado`)
    }
  }
}

// ------------------------------------------------------------
// Paso 7: verificacion
// ------------------------------------------------------------

interface CountSpec {
  label: string
  table: string
  esperado?: number | string
  vacio?: boolean
}

const COUNTS: CountSpec[] = [
  { label: "pilares", table: "pilares", esperado: 7 },
  { label: "preguntas", table: "preguntas", esperado: 168 },
  { label: "checklist_items", table: "checklist_items", esperado: 30 },
  { label: "s5_items_catalogo", table: "s5_items_catalogo", esperado: 49 },
  { label: "capacitaciones", table: "capacitaciones" },
  { label: "empleados", table: "empleados", esperado: 0, vacio: true },
  {
    label: "catalogo_vehiculos",
    table: "catalogo_vehiculos",
    esperado: 0,
    vacio: true,
  },
  { label: "profiles", table: "profiles", esperado: 1 },
]

interface CountResult {
  label: string
  table: string
  actual: number
  esperado: number | string | undefined
  vacio: boolean
  ok: boolean
}

async function verifyCounts(client: PgClient): Promise<CountResult[]> {
  const out: CountResult[] = []
  for (const spec of COUNTS) {
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${spec.table}"`,
    )
    const actual = parseInt(rows[0]?.count ?? "0", 10)
    const ok =
      spec.esperado === undefined
        ? true
        : typeof spec.esperado === "number"
          ? actual === spec.esperado
          : true
    out.push({
      label: spec.label,
      table: spec.table,
      actual,
      esperado: spec.esperado,
      vacio: spec.vacio === true,
      ok,
    })
  }
  return out
}

function printSummary(
  results: CountResult[],
  adminEmail: string,
): void {
  console.log("\n==> Resumen:")
  const width = 22
  for (const r of results) {
    const mark = r.ok ? "v" : "!"
    const pad = r.label.padEnd(width)
    const suffix = r.vacio ? " (vacio - admin debe cargar)" : ""
    console.log(`  ${mark} ${pad}${String(r.actual).padStart(4)}${suffix}`)
  }
  console.log(`  v ${"admin".padEnd(width)}${adminEmail}`)
  console.log("")
  const allOk = results.every((r) => r.ok)
  if (allOk) {
    console.log("  Bootstrap completado. Ver README.md para los pasos manuales restantes.")
  } else {
    console.log(
      "  Bootstrap completado CON DIFERENCIAS. Revisar los conteos antes de usar.",
    )
  }
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const destUrl = requireEnv("DEST_SUPABASE_URL")
  const destKey = requireEnv("DEST_SUPABASE_SERVICE_ROLE_KEY")

  // DB URL: si no la pasan, avisamos claramente. No podemos derivarla
  // porque el password de la DB no se puede inferir del service_role.
  let destDbUrl = process.env.DEST_SUPABASE_DB_URL ?? ""
  if (!destDbUrl) {
    const derived = deriveDbUrlFromSupabase(destUrl)
    if (derived) destDbUrl = derived
  }
  if (!destDbUrl) {
    fatal(
      "Falta DEST_SUPABASE_DB_URL (postgres connection string).\n" +
        "Sacala del dashboard: Project Settings > Database > Connection\n" +
        "string > URI (mode: direct connection). Formato:\n" +
        "  postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres\n" +
        "Luego: export DEST_SUPABASE_DB_URL=postgresql://...",
    )
  }

  console.log("DPO-App :: bootstrap-tenant")
  console.log(`  DEST Supabase URL: ${destUrl}`)
  console.log(`  DEST DB host:      ${new URL(destDbUrl).host}`)
  console.log(`  Admin email:       ${args.adminEmail}`)
  console.log(`  Admin nombre:      ${args.adminNombre}`)

  const supabase = createClient(destUrl, destKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const client = await connectPg(destDbUrl)
  try {
    log.step(1, "Aplicando migraciones SQL")
    await applyMigrations(client)

    log.step(2, "Limpiando tablas con seed operativo")
    await cleanOperationalSeeds(client)

    log.step(3, "Aplicando master_seed.sql")
    await applyMasterSeed(client)

    log.step(4, "Creando usuario admin")
    await createAdmin(supabase, client, args)

    log.step(5, "Creando slots vacios de responsables 5S")
    await createEmptyS5Sectors(client)

    log.step(6, "Asegurando buckets de storage")
    await ensureBuckets(supabase)

    log.step(7, "Verificando conteos")
    const results = await verifyCounts(client)
    printSummary(results, args.adminEmail)

    console.log("\nCredenciales admin (guardalas en un lugar seguro):")
    console.log(`  email:    ${args.adminEmail}`)
    console.log(`  password: ${args.adminPassword}`)
    console.log(`  nombre:   ${args.adminNombre}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("\n[FAIL]", err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) {
    console.error(err.stack)
  }
  process.exit(1)
})
