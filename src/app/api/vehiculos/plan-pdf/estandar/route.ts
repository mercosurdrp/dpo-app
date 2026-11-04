/**
 * PDF "Estándar de mantenimiento preventivo": las plantillas del plan tal como
 * están configuradas en DPO (solapa Plan / Plantillas), por tipo de unidad, con
 * el ciclo de services que resulta de esas frecuencias y las excepciones por
 * unidad. Es la evidencia del pilar Flota, punto 2.2 (R2.2.2 / R2.2.6).
 *
 * GET /api/vehiculos/plan-pdf/estandar
 *
 * Lee las tablas directo (las actions de `mantenimiento-vehiculos` son
 * "use server" y no se importan desde un route handler).
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  MANTENIMIENTO_CATEGORIA_LABELS,
  VEHICULO_TIPO_LABELS,
  type CatalogoVehiculo,
  type MantenimientoPlanOverride,
  type MantenimientoPlanTarea,
  type VehiculoTipo,
} from "@/types/database"
import {
  COLOR,
  drawFirmas,
  drawKpis,
  drawParrafo,
  drawSeccion,
  drawTabla,
  espacio,
  fmtFechaHora,
  fmtFrecuencia,
  fmtInt,
  hoyISO,
  pluralTareas,
  pluralUnidades,
  renderPdf,
  type Doc,
} from "../_comun"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ORDEN_TIPOS: VehiculoTipo[] = ["camion", "camioneta", "utilitario", "acoplado", "autoelevador"]

/** Cuántos services muestra la tabla de ciclo (24 x 20.000 km = 480.000 km, como la de fábrica). */
const SERVICES_DEL_CICLO = 24

export async function GET() {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  // El módulo es solo Pampeana (la flota de Misiones se gestiona en Cloudfleet).
  if (IS_MISIONES) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const supabase = await createClient()
  const [vehRes, tareasRes, overridesRes] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("*").eq("active", true).order("dominio"),
    supabase.from("mantenimiento_plan_tareas").select("*").order("tipo_vehiculo").order("orden"),
    supabase.from("mantenimiento_plan_overrides").select("*").order("dominio"),
  ])
  const err = vehRes.error ?? tareasRes.error ?? overridesRes.error
  if (err) return NextResponse.json({ error: "db", message: err.message }, { status: 500 })

  const vehiculos = (vehRes.data ?? []) as CatalogoVehiculo[]
  const tareas = (tareasRes.data ?? []) as MantenimientoPlanTarea[]
  const overrides = (overridesRes.data ?? []) as MantenimientoPlanOverride[]

  const pdf = await renderPdf(
    {
      titulo: "Estándar de mantenimiento preventivo",
      subtitulo:
        "Plan por tipo de unidad configurado en DPO. Cada tarea vence por lo que ocurra primero: km, meses u horas.",
      derechaTop: "Pilar Flota · Punto 2.2",
      derechaSub: `Emitido el ${fmtFechaHora(new Date())}`,
      pie: "Mercosur · DPO · Estándar de mantenimiento preventivo · Evidencia pilar Flota 2.2 (R2.2.2, R2.2.6)",
      info: {
        Title: "Estándar de mantenimiento preventivo",
        Subject: "Plan preventivo por tipo de unidad (DPO Flota 2.2)",
      },
    },
    (doc) => cuerpo(doc, vehiculos, tareas, overrides)
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Mercosur-Estandar-Mantenimiento-${hoyISO()}.pdf"`,
    },
  })
}

function cuerpo(
  doc: Doc,
  vehiculos: CatalogoVehiculo[],
  tareas: MantenimientoPlanTarea[],
  overrides: MantenimientoPlanOverride[]
) {
  const tipos = ORDEN_TIPOS.filter((tipo) => tareas.some((t) => t.tipo_vehiculo === tipo))
  const activas = tareas.filter((t) => t.activo)
  const tipoDe = (v: CatalogoVehiculo): VehiculoTipo => v.tipo ?? "camion"
  const alcanzadas = vehiculos.filter((v) => tipos.includes(tipoDe(v))).length
  const tareasById = new Map(tareas.map((t) => [t.id, t]))

  drawKpis(doc, [
    { label: "Tipos de unidad", valor: String(tipos.length), sub: "con plan preventivo definido" },
    {
      label: "Tareas activas",
      valor: String(activas.length),
      sub: `de ${tareas.length} configuradas`,
      color: COLOR.acento,
    },
    {
      label: "Unidades alcanzadas",
      valor: String(alcanzadas),
      sub: `de ${vehiculos.length} activas en el catálogo`,
    },
    {
      label: "Excepciones por unidad",
      valor: String(overrides.length),
      sub: overrides.length ? "ajustes puntuales a la plantilla" : "todas siguen su plantilla",
      color: overrides.length ? COLOR.proximo : COLOR.ok,
    },
  ])

  drawSeccion(doc, "Criterios del plan")
  for (const linea of [
    "Cada tarea tiene una frecuencia por kilómetros, por meses y/o por horas de uso; vence la primera que se cumpla.",
    "La frecuencia efectiva de una unidad es la de su excepción, si tiene una; si no, la de la plantilla de su tipo.",
    "Próxima a vencer: 90 % o más del ciclo consumido, 1.000 km o menos restantes, 15 días o menos por calendario, o 30 días o menos al ritmo real de km de la unidad.",
    "Vencida: superó el km, las horas o la fecha límite. Sin datos: la tarea nunca se cerró en una orden de trabajo completada.",
    "El cumplimiento sale de las órdenes de trabajo completadas; el km actual, de las lecturas de odómetro (checklist diario, cargas de combustible y OT).",
  ]) {
    drawParrafo(doc, linea, { vineta: true })
  }
  espacio(doc, 6)

  for (const tipo of tipos) {
    const lista = tareas
      .filter((t) => t.tipo_vehiculo === tipo)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
    const activasTipo = lista.filter((t) => t.activo)
    const unidades = vehiculos.filter((v) => tipoDe(v) === tipo)

    drawSeccion(
      doc,
      `${VEHICULO_TIPO_LABELS[tipo]} · ${pluralTareas(activasTipo.length)} activas`,
      unidades.length
        ? `${pluralUnidades(unidades.length)}: ${unidades.map((u) => u.dominio).join(", ")}.`
        : "Sin unidades activas de este tipo en el catálogo."
    )

    drawTabla(
      doc,
      lista,
      [
        { header: "#", width: 22, align: "center", get: (_, i) => String(i + 1) },
        { header: "Tarea", width: 190, bold: true, get: (t) => t.nombre },
        { header: "Categoría", width: 78, get: (t) => MANTENIMIENTO_CATEGORIA_LABELS[t.categoria] },
        {
          header: "Cada km",
          width: 58,
          align: "right",
          get: (t) => (t.frecuencia_km != null ? fmtInt(t.frecuencia_km) : "—"),
        },
        {
          header: "Cada meses",
          width: 60,
          align: "right",
          get: (t) => (t.frecuencia_meses != null ? String(t.frecuencia_meses) : "—"),
        },
        {
          header: "Cada horas",
          width: 60,
          align: "right",
          get: (t) => (t.frecuencia_horas != null ? fmtInt(t.frecuencia_horas) : "—"),
        },
        {
          header: "Estado",
          width: 56,
          align: "center",
          get: (t) => (t.activo ? "Activa" : "Inactiva"),
          chip: (t) =>
            t.activo
              ? { bg: COLOR.okFondo, fg: COLOR.ok }
              : { bg: COLOR.sinDatosFondo, fg: COLOR.sinDatos },
        },
      ],
      { atenuada: (t) => !t.activo, vacio: "Sin tareas configuradas" }
    )

    drawCiclo(doc, tipo, activasTipo)
  }

  drawSeccion(
    doc,
    "Excepciones por unidad",
    "Frecuencias distintas a la plantilla para una unidad puntual. «Hereda» toma el valor de la plantilla; «No aplica» saca la tarea de esa unidad."
  )
  drawTabla(
    doc,
    overrides,
    [
      { header: "Dominio", width: 70, bold: true, get: (o) => o.dominio },
      { header: "Tarea", width: 190, get: (o) => tareasById.get(o.tarea_id)?.nombre ?? "—" },
      {
        header: "Cada km",
        width: 60,
        align: "right",
        get: (o) => (o.frecuencia_km != null ? fmtInt(o.frecuencia_km) : "hereda"),
      },
      {
        header: "Cada meses",
        width: 60,
        align: "right",
        get: (o) => (o.frecuencia_meses != null ? String(o.frecuencia_meses) : "hereda"),
      },
      {
        header: "Cada horas",
        width: 60,
        align: "right",
        get: (o) => (o.frecuencia_horas != null ? fmtInt(o.frecuencia_horas) : "hereda"),
      },
      {
        header: "Aplica",
        width: 60,
        align: "center",
        get: (o) => (o.activo ? "Sí" : "No aplica"),
        chip: (o) =>
          o.activo
            ? { bg: COLOR.okFondo, fg: COLOR.ok }
            : { bg: COLOR.vencidoFondo, fg: COLOR.vencido },
      },
    ],
    { vacio: "No hay excepciones: todas las unidades siguen la plantilla de su tipo." }
  )

  espacio(doc, 4)
  drawParrafo(
    doc,
    "Documento generado desde la configuración vigente en DPO (Mantenimiento de camiones, solapa Plan / Plantillas). Las tareas de neumáticos (rotación, alineación y balanceo) se controlan en la solapa Neumáticos, con su propio intervalo por tipo de unidad.",
    { size: 7.5, color: COLOR.gris }
  )
  drawFirmas(doc)
}

/**
 * Tabla de ciclo al estilo de la política de fábrica (Nº / km / qué entra):
 * a partir de las frecuencias configuradas, qué tareas vencen en cada service.
 * El "service base" es el conjunto que cae en TODOS los services (la frecuencia
 * más corta); las demás se listan donde les toca.
 */
function drawCiclo(doc: Doc, tipo: VehiculoTipo, activas: MantenimientoPlanTarea[]) {
  const porHoras = tipo === "autoelevador"
  const unidad = porHoras ? "hs" : "km"
  const frec = (t: MantenimientoPlanTarea) => (porHoras ? t.frecuencia_horas : t.frecuencia_km)
  const conEje = activas.filter((t) => frec(t) != null && (frec(t) as number) > 0)
  if (conEje.length === 0) return

  const base = Math.min(...conEje.map((t) => frec(t) as number))
  const enBase = conEje.filter((t) => frec(t) === base)
  const fueraDeBase = conEje.filter((t) => frec(t) !== base)
  const porCalendario = activas.filter((t) => frec(t) == null && t.frecuencia_meses != null)

  drawSeccion(
    doc,
    `Ciclo de services · ${VEHICULO_TIPO_LABELS[tipo]}`,
    `Qué vence en cada service según las frecuencias configuradas. El service base es el conjunto de tareas de cada ${fmtInt(base)} ${unidad}; las tareas por calendario corren aparte del ${porHoras ? "horómetro" : "kilometraje"}.`
  )

  drawParrafo(
    doc,
    `Service base (cada ${fmtInt(base)} ${unidad}, ${pluralTareas(enBase.length)}): ${enBase
      .map((t) => t.nombre)
      .join(" · ")}.`,
    { size: 8 }
  )
  if (porCalendario.length) {
    drawParrafo(
      doc,
      `Por calendario: ${porCalendario
        .map((t) => `${t.nombre} (${fmtFrecuencia({ km: null, meses: t.frecuencia_meses, horas: null })})`)
        .join(" · ")}.`,
      { size: 8 }
    )
  }
  espacio(doc, 2)

  const filas = Array.from({ length: SERVICES_DEL_CICLO }, (_, i) => {
    const n = i + 1
    const k = base * n
    const extras = fueraDeBase.filter((t) => k % (frec(t) as number) === 0)
    return { n, k, extras }
  })

  drawTabla(doc, filas, [
    { header: "Nº", width: 26, align: "center", get: (f) => String(f.n) },
    { header: unidad === "km" ? "Km" : "Horas", width: 60, align: "right", bold: true, get: (f) => fmtInt(f.k) },
    {
      header: "Tareas que vencen",
      width: 430,
      get: (f) =>
        f.extras.length
          ? `Service base + ${f.extras.map((t) => t.nombre).join(" + ")}`
          : "Service base",
      color: (f) => (f.extras.length ? COLOR.texto : COLOR.gris),
    },
  ])
}
