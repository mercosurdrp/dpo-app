/**
 * Carga inicial de la Matriz SKAP (matriz de habilidades, Pilar Gente 4.4).
 *
 * Fuente: los dos Excel de /root/fausto/matrizSkap, extraídos a scripts/skap-seed.json
 *   - SKAP_ALMACE7 2026.xlsx  → pickero / autoelevadorista / mantenimiento (validado por Esteban)
 *   - SKAP-_Distribucion.xlsx → chofer / ayudante (SOLO la estructura: la gente
 *     de ese Excel es de Misiones; acá se asigna el personal de Pampeana)
 *
 * Va por conexión directa a Postgres (DATABASE_URL) y no por supabase-js, que
 * no levanta en Node 20 (le falta WebSocket nativo).
 *
 * Idempotente: se puede correr las veces que haga falta.
 *   npx tsx scripts/seed-matriz-skap.ts
 */
import fs from "fs"
import path from "path"
import { Client } from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

interface Seed {
  roles: Record<
    string,
    { orden: number; bloque: string; criticidad: string; habilidad: string; estandar: number }[]
  >
  planes: {
    rol: string
    habilidad: string | null
    alcance: string
    hs_teoricas: number | null
    hs_practicas: number | null
    experto: string
    instructor: string
    tutor: string
    metodo: string
    criterio: string
    material: string
  }[]
  evaluaciones: {
    rol: string
    persona: string
    habilidad: string
    std_individual: number | null
    evaluacion: number | null
  }[]
}

const seed: Seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts", "skap-seed.json"), "utf8"),
)

/** Choferes marcados por Fausto; el resto de Distribución (activos) es ayudante. */
const LEGAJOS_CHOFER = [62, 47, 28, 13, 64, 34, 50, 88, 11, 21]
const LEGAJOS_AYUDANTE = [54, 45, 29, 60, 55, 35, 25, 140, 56, 18, 65]

/** Nombre como figura en el Excel de almacén → legajo en la tabla empleados. */
const ALMACEN_A_LEGAJO: Record<string, number> = {
  "VEIDOSKI, GERMAN": 135,
  "SALA, MARCOS": 110,
  "SELENZO, PABLO": 425283564,
  "PABLO, SELENZO": 425283564, // la hoja AE lo escribe al revés
  "GALVEZ,  RUBEN": 36467481,
  "TROLI, ALEJO": 112,
  "OVEJERO, HUGO": 43907801,
  "CERBIN, DIEGO": 30,
  "MARTINEZ, PEDRO": 107,
}

const ROLES_ALMACEN: Record<string, string> = {
  pickero: "pickero",
  autoelevadorista: "autoelevadorista",
}

/** Fecha con la que entra la evaluación que Esteban ya tenía hecha en el Excel. */
const FECHA_EVAL_ALMACEN = "2026-01-01"

async function main() {
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  const { rows: empleados } = await db.query<{ id: string; legajo: number; nombre: string }>(
    "SELECT id, legajo, nombre FROM empleados",
  )
  const porLegajo = new Map(empleados.map((e) => [e.legajo, e]))

  // --- 1. habilidades
  const habs = Object.entries(seed.roles).flatMap(([rol, hs]) => hs.map((h) => ({ ...h, rol })))
  for (const h of habs) {
    await db.query(
      `INSERT INTO skap_habilidades (rol, bloque, criticidad, habilidad, estandar, orden)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (rol, habilidad) DO UPDATE
         SET bloque = EXCLUDED.bloque, criticidad = EXCLUDED.criticidad,
             estandar = EXCLUDED.estandar, orden = EXCLUDED.orden`,
      [h.rol, h.bloque, h.criticidad, h.habilidad, h.estandar, h.orden],
    )
  }
  console.log(`✓ habilidades: ${habs.length}`)

  const { rows: habRows } = await db.query<{ id: string; rol: string; habilidad: string }>(
    "SELECT id, rol, habilidad FROM skap_habilidades",
  )
  const habId = new Map(habRows.map((h) => [`${h.rol}|${h.habilidad}`, h.id]))

  // --- 2. planes de formación
  let planes = 0
  for (const p of seed.planes) {
    const hid = p.habilidad ? habId.get(`${p.rol}|${p.habilidad}`) : undefined
    if (!hid) continue
    await db.query(
      `INSERT INTO skap_plan_formacion
         (habilidad_id, alcance, hs_teoricas, hs_practicas, experto, instructor, tutor, metodo, criterio_evaluacion, material)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (habilidad_id) DO UPDATE
         SET alcance = EXCLUDED.alcance, hs_teoricas = EXCLUDED.hs_teoricas,
             hs_practicas = EXCLUDED.hs_practicas, experto = EXCLUDED.experto,
             instructor = EXCLUDED.instructor, tutor = EXCLUDED.tutor,
             metodo = EXCLUDED.metodo, criterio_evaluacion = EXCLUDED.criterio_evaluacion,
             material = EXCLUDED.material`,
      [
        hid,
        p.alcance || null,
        p.hs_teoricas,
        p.hs_practicas,
        p.experto || null,
        p.instructor || null,
        p.tutor || null,
        p.metodo || null,
        p.criterio || null,
        p.material || null,
      ],
    )
    planes++
  }
  console.log(`✓ planes de formación: ${planes}`)

  // --- 3. asignaciones de rol
  const faltantes: string[] = []
  let asignadas = 0

  async function asignar(legajo: number, rol: string, etiqueta: string) {
    const emp = porLegajo.get(legajo)
    if (!emp) {
      faltantes.push(`${etiqueta} (legajo ${legajo}) no está en empleados`)
      return
    }
    await db.query(
      `INSERT INTO skap_asignaciones (empleado_id, rol) VALUES ($1,$2)
       ON CONFLICT (empleado_id, rol) DO UPDATE SET activo = true`,
      [emp.id, rol],
    )
    asignadas++
  }

  for (const l of LEGAJOS_CHOFER) await asignar(l, "chofer", "chofer")
  for (const l of LEGAJOS_AYUDANTE) await asignar(l, "ayudante", "ayudante")

  const personasAlmacen = new Set(seed.evaluaciones.map((e) => `${e.rol}|${e.persona}`))
  for (const clave of personasAlmacen) {
    const [rol, persona] = clave.split("|")
    if (!ROLES_ALMACEN[rol]) continue
    const legajo = ALMACEN_A_LEGAJO[persona]
    if (!legajo) {
      faltantes.push(`${persona} (${rol}) no tiene legajo mapeado`)
      continue
    }
    await asignar(legajo, ROLES_ALMACEN[rol], persona)
  }
  console.log(`✓ asignaciones: ${asignadas}`)

  // --- 4. evaluaciones de almacén (las que ya había cargado Esteban)
  let evals = 0
  for (const e of seed.evaluaciones) {
    if (e.evaluacion === null && e.std_individual === null) continue
    const legajo = ALMACEN_A_LEGAJO[e.persona]
    const emp = legajo ? porLegajo.get(legajo) : undefined
    const hid = habId.get(`${e.rol}|${e.habilidad}`)
    if (!emp || !hid) continue
    await db.query(
      `INSERT INTO skap_evaluaciones (empleado_id, habilidad_id, fecha_evaluacion, nivel, estandar_individual)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (empleado_id, habilidad_id, fecha_evaluacion) DO UPDATE
         SET nivel = EXCLUDED.nivel, estandar_individual = EXCLUDED.estandar_individual`,
      [emp.id, hid, FECHA_EVAL_ALMACEN, e.evaluacion, e.std_individual],
    )
    evals++
  }
  console.log(`✓ evaluaciones importadas de almacén: ${evals}`)

  if (faltantes.length > 0) {
    console.log("\n⚠ No se pudieron asignar:")
    faltantes.forEach((f) => console.log("   -", f))
  }
  console.log(
    "\nNota: Mantenimiento queda con sus habilidades pero sin personas ni plan de formación.\n" +
      "  La hoja 'Plan Formación Mantenimiento' del Excel trae el plan del GUINCHERO,\n" +
      "  no las competencias de la matriz de Mantenimiento. A corregir con Esteban.",
  )

  await db.end()
}

main().catch((e) => {
  console.error("✗", e.message)
  process.exit(1)
})
