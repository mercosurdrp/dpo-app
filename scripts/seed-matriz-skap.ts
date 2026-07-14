/**
 * Carga inicial de la Matriz SKAP (matriz de habilidades, Pilar Gente 4.4).
 *
 * Fuente: los dos Excel de /root/fausto/matrizSkap, ya extraídos a skap-seed.json
 *   - SKAP_ALMACE7 2026.xlsx  → pickero / autoelevadorista / mantenimiento (validado por Esteban)
 *   - SKAP-_Distribucion.xlsx → chofer / ayudante (SOLO la estructura: la gente
 *     del Excel es de Misiones, acá se asigna el personal de Pampeana)
 *
 * Idempotente: se puede correr varias veces.
 *   npx tsx scripts/seed-matriz-skap.ts
 */
import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type Rol = "chofer" | "ayudante" | "pickero" | "autoelevadorista" | "mantenimiento"

interface Seed {
  roles: Record<string, { orden: number; bloque: string; criticidad: string; habilidad: string; estandar: number }[]>
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
  evaluaciones: { rol: string; persona: string; habilidad: string; std_individual: number | null; evaluacion: number | null }[]
}

const seed: Seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts", "skap-seed.json"), "utf8"),
)

/** Legajos de Pampeana. Los choferes los marcó Fausto; el resto de Distribución es ayudante. */
const LEGAJOS_CHOFER = [62, 47, 28, 13, 64, 34, 50, 88, 11, 21]
const LEGAJOS_AYUDANTE = [54, 45, 29, 60, 55, 35, 25, 140, 56, 18, 65]

/** Nombre como figura en el Excel de almacén → legajo en la tabla empleados. */
const ALMACEN_A_LEGAJO: Record<string, number> = {
  "VEIDOSKI, GERMAN": 135,
  "SALA, MARCOS": 110,
  "SELENZO, PABLO": 425283564,
  "PABLO, SELENZO": 425283564, // el Excel lo escribe al revés en la hoja AE
  "GALVEZ,  RUBEN": 36467481,
  "TROLI, ALEJO": 112,
  "OVEJERO, HUGO": 43907801,
  "CERBIN, DIEGO": 30,
  "MARTINEZ, PEDRO": 107,
}

/** Fecha de la evaluación que ya tenía cargada Esteban en el Excel. */
const FECHA_EVAL_ALMACEN = "2026-01-01"

async function main() {
  // --- empleados por legajo
  const { data: empleados, error: errEmp } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, activo")
  if (errEmp) throw new Error(errEmp.message)
  const porLegajo = new Map(empleados!.map((e) => [e.legajo, e]))

  // --- 1. habilidades
  const habRows = Object.entries(seed.roles).flatMap(([rol, habs]) =>
    habs.map((h) => ({
      rol,
      bloque: h.bloque,
      criticidad: h.criticidad,
      habilidad: h.habilidad,
      estandar: h.estandar,
      orden: h.orden,
      activo: true,
    })),
  )
  const { error: errHab } = await supabase
    .from("skap_habilidades")
    .upsert(habRows, { onConflict: "rol,habilidad" })
  if (errHab) throw new Error(`habilidades: ${errHab.message}`)
  console.log(`✓ habilidades: ${habRows.length}`)

  const { data: habs } = await supabase.from("skap_habilidades").select("id, rol, habilidad")
  const habId = new Map(habs!.map((h) => [`${h.rol}|${h.habilidad}`, h.id]))

  // --- 2. planes de formación
  const planRows = seed.planes
    .filter((p) => p.habilidad && habId.has(`${p.rol}|${p.habilidad}`))
    .map((p) => ({
      habilidad_id: habId.get(`${p.rol}|${p.habilidad}`)!,
      alcance: p.alcance || null,
      hs_teoricas: p.hs_teoricas,
      hs_practicas: p.hs_practicas,
      experto: p.experto || null,
      instructor: p.instructor || null,
      tutor: p.tutor || null,
      metodo: p.metodo || null,
      criterio_evaluacion: p.criterio || null,
      material: p.material || null,
    }))
  const { error: errPlan } = await supabase
    .from("skap_plan_formacion")
    .upsert(planRows, { onConflict: "habilidad_id" })
  if (errPlan) throw new Error(`planes: ${errPlan.message}`)
  console.log(`✓ planes de formación: ${planRows.length}`)

  // --- 3. asignaciones de rol
  const asignaciones: { empleado_id: string; rol: Rol; activo: boolean }[] = []
  const faltantes: string[] = []

  function asignar(legajo: number, rol: Rol, etiqueta: string) {
    const emp = porLegajo.get(legajo)
    if (!emp) return faltantes.push(`${etiqueta} (legajo ${legajo}) no está en empleados`)
    asignaciones.push({ empleado_id: emp.id, rol, activo: true })
  }

  LEGAJOS_CHOFER.forEach((l) => asignar(l, "chofer", "chofer"))
  LEGAJOS_AYUDANTE.forEach((l) => asignar(l, "ayudante", "ayudante"))

  const rolAlmacen: Record<string, Rol> = { pickero: "pickero", autoelevadorista: "autoelevadorista" }
  const personasAlmacen = new Set(seed.evaluaciones.map((e) => `${e.rol}|${e.persona}`))
  for (const clave of personasAlmacen) {
    const [rol, persona] = clave.split("|")
    if (!rolAlmacen[rol]) continue
    const legajo = ALMACEN_A_LEGAJO[persona]
    if (!legajo) {
      faltantes.push(`${persona} (${rol}) no tiene legajo mapeado`)
      continue
    }
    asignar(legajo, rolAlmacen[rol], persona)
  }

  const { error: errAsig } = await supabase
    .from("skap_asignaciones")
    .upsert(asignaciones, { onConflict: "empleado_id,rol" })
  if (errAsig) throw new Error(`asignaciones: ${errAsig.message}`)
  console.log(`✓ asignaciones: ${asignaciones.length}`)

  // --- 4. evaluaciones de almacén (las que ya cargó Esteban)
  const evalRows = seed.evaluaciones
    .filter((e) => e.evaluacion !== null || e.std_individual !== null)
    .map((e) => {
      const legajo = ALMACEN_A_LEGAJO[e.persona]
      const emp = legajo ? porLegajo.get(legajo) : undefined
      const hid = habId.get(`${e.rol}|${e.habilidad}`)
      if (!emp || !hid) return null
      return {
        empleado_id: emp.id,
        habilidad_id: hid,
        fecha_evaluacion: FECHA_EVAL_ALMACEN,
        nivel: e.evaluacion,
        estandar_individual: e.std_individual,
        observaciones: null,
        evaluador_id: null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const { error: errEval } = await supabase
    .from("skap_evaluaciones")
    .upsert(evalRows, { onConflict: "empleado_id,habilidad_id,fecha_evaluacion" })
  if (errEval) throw new Error(`evaluaciones: ${errEval.message}`)
  console.log(`✓ evaluaciones importadas de almacén: ${evalRows.length}`)

  if (faltantes.length > 0) {
    console.log("\n⚠ No se pudieron asignar:")
    faltantes.forEach((f) => console.log("   -", f))
  }
  console.log(
    "\nNota: Mantenimiento queda con habilidades pero sin personas ni plan de formación:\n" +
      "  la hoja 'Plan Formación Mantenimiento' del Excel trae el plan del GUINCHERO,\n" +
      "  no las competencias de la matriz de Mantenimiento. Hay que corregirlo con Esteban.",
  )
}

main().catch((e) => {
  console.error("✗", e.message)
  process.exit(1)
})
