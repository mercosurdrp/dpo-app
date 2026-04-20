/**
 * export-master.ts
 * ------------------------------------------------------------
 * Exporta los datos MASTER del manual DPO (catálogo universal)
 * de la DB Supabase actual a un archivo SQL listo para
 * bootstrap de un nuevo tenant (ej: "Mercosur Distribuciones").
 *
 * NO exporta datos operativos (auditorías, respuestas, planes,
 * empleados, perfiles, SOPs, asistencias, foxtrot, etc.).
 *
 * Uso:
 *   npx tsx scripts/dpo-tenant/export-master.ts
 *
 * Output:
 *   scripts/dpo-tenant/seeds/master_seed.sql
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * ------------------------------------------------------------
 */

// Cargar variables desde .env.local (el resto del repo delega el
// load a Next.js, pero este script se corre standalone con `npx tsx`).
import { config as loadEnv } from "dotenv"
import * as fs from "node:fs"
import * as path from "node:path"

loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

import { createClient } from "@supabase/supabase-js"

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Orden de export: respeta FK parent -> child.
// NOTA: `capacitacion_dpo_puntos` va al final porque referencia
// tanto a `capacitaciones` como a `preguntas`.
const MASTER_TABLES = [
  "pilares",
  "bloques",
  "preguntas",
  "checklist_items",
  "s5_items_catalogo",
  "owd_items",
  "capacitaciones",
  "capacitacion_dpo_puntos",
] as const

type TableName = (typeof MASTER_TABLES)[number]

// Columnas JSONB conocidas por tabla. Se serializan con JSON.stringify
// y el literal se emite como '...'::jsonb. Si en el futuro se agregan
// columnas JSONB nuevas, agregarlas acá.
//
// AMBIGÜEDAD: information_schema.columns daría el tipo exacto, pero
// requiere un RPC o acceso directo a pg_catalog que el service_role
// client no expone por defecto vía supabase-js. Se opta por la lista
// explícita: es más segura y auditable.
const JSONB_COLUMNS: Record<string, Set<string>> = {
  preguntas: new Set(["puntaje_criterio"]),
}

// Reset en memoria para capacitaciones: el nuevo tenant arranca con
// la definición del curso pero sin fecha/lugar/instructor reales y en
// estado "programada" + visible=true (admins las ven para planificar).
// `material_url` se conserva (es parte del contenido, no del evento).
function applyCapacitacionReset<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row }
  if ("fecha" in out) out.fecha = null
  if ("lugar" in out) out.lugar = null
  if ("instructor" in out) out.instructor = null
  if ("visible" in out) out.visible = true
  if ("estado" in out) out.estado = "programada"
  // `created_by` referencia profiles(id) que NO se exporta.
  // En el nuevo tenant esos UUIDs no existen -> setear a NULL para
  // evitar violaciones de FK al aplicar el seed.
  if ("created_by" in out) out.created_by = null
  return out as T
}

// ------------------------------------------------------------
// Helpers de serialización SQL
// ------------------------------------------------------------

function escapeString(s: string): string {
  // Doblar comillas simples (estándar SQL). No usamos E'...' así que
  // los backslashes se emiten tal cual; Postgres con
  // standard_conforming_strings=on (default moderno) los interpreta literal.
  return s.replace(/'/g, "''")
}

function sqlLiteral(value: unknown, column: string, table: TableName): string {
  if (value === null || value === undefined) return "NULL"

  // JSONB explícitos (catalogados)
  if (JSONB_COLUMNS[table]?.has(column)) {
    const json = JSON.stringify(value)
    return `'${escapeString(json)}'::jsonb`
  }

  if (typeof value === "boolean") return value ? "true" : "false"

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Valor numérico no finito en ${table}.${column}: ${value}`,
      )
    }
    return String(value)
  }

  if (typeof value === "bigint") return value.toString()

  if (value instanceof Date) {
    return `'${value.toISOString()}'`
  }

  // Arrays (text[], uuid[], jsonb[], etc.) -> literal Postgres ARRAY[...]
  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Sin saber el tipo, dejamos '{}' casteado — Postgres suele inferirlo
      // del destino. Si una tabla master guardara arrays vacíos y el cast
      // fallara, habría que agregar el tipo explícito.
      return `'{}'`
    }
    const items = value.map((v) => {
      if (v === null || v === undefined) return "NULL"
      if (typeof v === "number") return String(v)
      if (typeof v === "boolean") return v ? "true" : "false"
      if (typeof v === "string") return `'${escapeString(v)}'`
      // Sub-objeto dentro de un array no-JSONB: inesperado en tablas master.
      return `'${escapeString(JSON.stringify(v))}'`
    })
    return `ARRAY[${items.join(", ")}]`
  }

  // Objetos planos: probablemente JSONB que no estaba catalogado.
  // Los serializamos como jsonb para no perder datos, pero logueamos.
  if (typeof value === "object") {
    console.warn(
      `[warn] Columna ${table}.${column} devolvió un objeto y no está en JSONB_COLUMNS; se serializa como ::jsonb por seguridad.`,
    )
    return `'${escapeString(JSON.stringify(value))}'::jsonb`
  }

  // string
  return `'${escapeString(String(value))}'`
}

function buildInsert(
  table: TableName,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  if (rows.length === 0) return ""
  const colList = columns.map((c) => `"${c}"`).join(", ")
  const valuesLines = rows.map((row) => {
    const vals = columns.map((col) => sqlLiteral(row[col], col, table))
    return `  (${vals.join(", ")})`
  })
  return (
    `INSERT INTO "${table}" (${colList}) VALUES\n` +
    valuesLines.join(",\n") +
    `;\n`
  )
}

// ------------------------------------------------------------
// Fetch con paginación (supabase-js trae 1000 por default)
// ------------------------------------------------------------

const PAGE_SIZE = 1000

async function fetchAll(
  table: TableName,
): Promise<Array<Record<string, unknown>>> {
  const acc: Array<Record<string, unknown>> = []
  let from = 0
  // Loop hasta que la página venga incompleta
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Error leyendo ${table}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    acc.push(...(data as Array<Record<string, unknown>>))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return acc
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  const outDir = path.resolve(
    process.cwd(),
    "scripts",
    "dpo-tenant",
    "seeds",
  )
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, "master_seed.sql")

  const timestamp = new Date().toISOString()
  const chunks: string[] = []
  chunks.push(`-- Generado por export-master.ts el ${timestamp}`)
  chunks.push(`-- Datos MASTER del manual DPO para bootstrap de nuevos tenants.`)
  chunks.push(`BEGIN;`)
  chunks.push(``)

  // Para que el TRUNCATE CASCADE no se queje por FKs no-deferrable entre
  // master tables, podríamos hacer un único TRUNCATE multi-tabla. Pero el
  // requerimiento pide un TRUNCATE por tabla, así que los emitimos en
  // orden inverso (hijos primero) para que cada uno sea válido aun sin
  // CASCADE. El CASCADE se mantiene por si hay tablas operativas con FKs
  // hacia estos masters.
  for (const t of [...MASTER_TABLES].reverse()) {
    chunks.push(`TRUNCATE TABLE "${t}" CASCADE;`)
  }
  chunks.push(``)

  // Set de capacitaciones que sobreviven (siempre todas, pero dejamos el
  // filter por si en el futuro se quieren excluir algunas).
  const survivingCapacitacionIds = new Set<string>()

  for (const table of MASTER_TABLES) {
    const rowsRaw = await fetchAll(table)
    let rows = rowsRaw

    if (table === "capacitaciones") {
      rows = rows.map((r) => applyCapacitacionReset(r))
      for (const r of rows) {
        const id = r.id
        if (typeof id === "string") survivingCapacitacionIds.add(id)
      }
    }

    if (table === "capacitacion_dpo_puntos") {
      const before = rows.length
      rows = rows.filter((r) => {
        const capId = r.capacitacion_id
        return typeof capId === "string" && survivingCapacitacionIds.has(capId)
      })
      const filtered = before - rows.length
      if (filtered > 0) {
        console.log(
          `  (filtradas ${filtered} filas de capacitacion_dpo_puntos por capacitación ausente)`,
        )
      }
    }

    console.log(`${table}: ${rows.length} filas`)

    if (rows.length === 0) {
      chunks.push(`-- ${table}: sin filas`)
      chunks.push(``)
      continue
    }

    // Columnas: Object.keys de la primera fila. supabase-js devuelve
    // todas las columnas de la tabla con SELECT *, así que esto cubre
    // cualquier columna nueva agregada por migraciones futuras.
    const columns = Object.keys(rows[0])

    chunks.push(`-- ${table}: ${rows.length} filas`)
    chunks.push(buildInsert(table, columns, rows))
  }

  chunks.push(`COMMIT;`)
  chunks.push(``)

  fs.writeFileSync(outFile, chunks.join("\n"), "utf8")
  console.log(`\nEscrito: ${outFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
