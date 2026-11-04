/**
 * PDF "Estado de la flota contra el plan preventivo": cómo viene cada unidad
 * hoy contra el estándar configurado (tarea por tarea: último realizado,
 * próximo vencimiento, cuánto falta, estado). Mismo cálculo que la pantalla
 * (`loadEstadoPlan`), así el PDF no puede decir otra cosa que la app.
 *
 * GET /api/vehiculos/plan-pdf/estado
 */
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { loadEstadoPlan } from "@/lib/vehiculos/plan-mantenimiento"
import { daysBetween, today, type LecturaSugerida } from "@/lib/vehiculos/lecturas"
import {
  VEHICULO_TIPO_LABELS,
  type EstadoPlanCelda,
  type EstadoPlanVehiculo,
  type EstadoTareaMantenimiento,
  type MantenimientoPlanOverride,
  type MantenimientoPlanTarea,
} from "@/types/database"
import {
  COLOR,
  drawFirmas,
  drawKpis,
  drawParrafo,
  drawSeccion,
  drawTabla,
  espacio,
  fmtFecha,
  fmtFechaHora,
  fmtFrecuencia,
  fmtInt,
  hoyISO,
  pluralTareas,
  renderPdf,
  type Chip,
  type Doc,
} from "../_comun"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Cuántas filas lista "Qué programar primero". */
const TOP_PRIORIDADES = 15

const ESTADO_LABEL: Record<EstadoTareaMantenimiento, string> = {
  ok: "Al día",
  proximo: "Próxima",
  vencido: "Vencida",
  sin_datos: "Sin datos",
}

const ESTADO_CHIP: Record<EstadoTareaMantenimiento, Chip> = {
  ok: { bg: COLOR.okFondo, fg: COLOR.ok },
  proximo: { bg: COLOR.proximoFondo, fg: COLOR.proximo },
  vencido: { bg: COLOR.vencidoFondo, fg: COLOR.vencido },
  sin_datos: { bg: COLOR.sinDatosFondo, fg: COLOR.sinDatos },
}

const ESTADO_COLOR: Record<EstadoTareaMantenimiento, string> = {
  ok: COLOR.ok,
  proximo: COLOR.proximo,
  vencido: COLOR.vencido,
  sin_datos: COLOR.sinDatos,
}

const PESO_ESTADO: Record<EstadoTareaMantenimiento, number> = {
  vencido: 3,
  proximo: 2,
  ok: 1,
  sin_datos: 0,
}

export async function GET() {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  // El módulo es solo Pampeana (la flota de Misiones se gestiona en Cloudfleet).
  if (IS_MISIONES) return NextResponse.json({ error: "not_found" }, { status: 404 })

  let datos: Awaited<ReturnType<typeof loadEstadoPlan>>
  try {
    datos = await loadEstadoPlan()
  } catch (e) {
    return NextResponse.json(
      { error: "db", message: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }

  const ahora = new Date()
  const pdf = await renderPdf(
    {
      titulo: "Estado de la flota contra el plan preventivo",
      subtitulo:
        "Cada unidad, tarea por tarea, contra el estándar configurado en DPO: último realizado, próximo vencimiento y cuánto falta.",
      derechaTop: "Pilar Flota · Punto 2.2",
      derechaSub: `Situación al ${fmtFechaHora(ahora)}`,
      pie: "Mercosur · DPO · Estado de la flota contra el plan preventivo · Evidencia pilar Flota 2.2",
      info: {
        Title: "Estado de la flota contra el plan preventivo",
        Subject: "Cumplimiento del plan de mantenimiento por unidad (DPO Flota 2.2)",
      },
    },
    (doc) => cuerpo(doc, datos)
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Mercosur-Estado-Flota-Mantenimiento-${hoyISO()}.pdf"`,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Filas derivadas
// ─────────────────────────────────────────────────────────────────────────
interface FilaTarea {
  dominio: string
  tarea: MantenimientoPlanTarea
  celda: EstadoPlanCelda
  frecuencia: string
  ultimo: string
  proximo: string
  faltan: string
  consumido: string
}

interface ResumenUnidad {
  e: EstadoPlanVehiculo
  esHoras: boolean
  lectura: LecturaSugerida | undefined
  filas: FilaTarea[]
  conteo: Record<EstadoTareaMantenimiento, number>
  general: EstadoTareaMantenimiento
}

function armarUnidad(
  e: EstadoPlanVehiculo,
  tareasById: Map<string, MantenimientoPlanTarea>,
  overridesPorKey: Map<string, MantenimientoPlanOverride>,
  ultimasLecturas: Record<string, LecturaSugerida[]>,
  hoy: string
): ResumenUnidad {
  const esHoras = (e.vehiculo.tipo ?? "camion") === "autoelevador"
  const dominio = e.vehiculo.dominio
  const conteo: Record<EstadoTareaMantenimiento, number> = {
    ok: 0,
    proximo: 0,
    vencido: 0,
    sin_datos: 0,
  }
  const filas: FilaTarea[] = []

  for (const c of e.celdas) {
    const tarea = tareasById.get(c.tareaId)
    if (!tarea) continue
    conteo[c.estado] += 1
    const o = overridesPorKey.get(`${dominio}|${c.tareaId}`)

    const frecuencia = fmtFrecuencia({
      km: o?.frecuencia_km ?? tarea.frecuencia_km,
      meses: o?.frecuencia_meses ?? tarea.frecuencia_meses,
      horas: o?.frecuencia_horas ?? tarea.frecuencia_horas,
    })

    let ultimo = "Nunca registrada"
    if (c.ultimaFecha) {
      const medida = esHoras
        ? c.ultimoHorometro != null
          ? `${fmtInt(c.ultimoHorometro)} hs`
          : null
        : c.ultimoOdometro != null
          ? `${fmtInt(c.ultimoOdometro)} km`
          : null
      ultimo = medida ? `${fmtFecha(c.ultimaFecha)} · ${medida}` : fmtFecha(c.ultimaFecha)
    }

    const proximoPartes: string[] = []
    if (c.proximoKm != null) proximoPartes.push(`${fmtInt(c.proximoKm)} km`)
    if (c.proximasHoras != null) proximoPartes.push(`${fmtInt(c.proximasHoras)} hs`)
    if (c.proximaFecha) proximoPartes.push(fmtFecha(c.proximaFecha))

    const faltanPartes: string[] = []
    if (c.proximasHoras != null && e.horasActuales != null) {
      const d = c.proximasHoras - e.horasActuales
      faltanPartes.push(d >= 0 ? `${fmtInt(d)} hs` : `pasó ${fmtInt(-d)} hs`)
    }
    if (c.proximoKm != null && e.kmActual != null) {
      const d = c.proximoKm - e.kmActual
      if (d >= 0) {
        faltanPartes.push(
          `${fmtInt(d)} km${c.diasProyectados != null ? ` (~${fmtInt(c.diasProyectados)} días)` : ""}`
        )
      } else {
        faltanPartes.push(`pasó ${fmtInt(-d)} km`)
      }
    }
    if (c.proximaFecha) {
      const d = daysBetween(hoy, c.proximaFecha)
      faltanPartes.push(d >= 0 ? `${fmtInt(d)} días` : `venció hace ${fmtInt(-d)} días`)
    }

    filas.push({
      dominio,
      tarea,
      celda: c,
      frecuencia,
      ultimo,
      proximo: proximoPartes.length ? proximoPartes.join(" / ") : "—",
      faltan: faltanPartes.length ? faltanPartes.join(" / ") : "—",
      consumido: c.pctConsumido != null ? `${fmtInt(c.pctConsumido)} %` : "—",
    })
  }

  const general: EstadoTareaMantenimiento =
    conteo.vencido > 0 ? "vencido" : conteo.proximo > 0 ? "proximo" : conteo.ok > 0 ? "ok" : "sin_datos"

  return {
    e,
    esHoras,
    lectura: ultimasLecturas[dominio]?.[0],
    filas,
    conteo,
    general,
  }
}

function medidaActual(u: ResumenUnidad): string {
  if (u.esHoras) return u.e.horasActuales != null ? `${fmtInt(u.e.horasActuales)} hs` : "sin lectura"
  return u.e.kmActual != null ? `${fmtInt(u.e.kmActual)} km` : "sin lectura"
}

function modeloUnidad(u: ResumenUnidad): string {
  const v = u.e.vehiculo
  const base = v.modelo?.trim() || v.descripcion?.trim() || "—"
  return v.anio ? `${base} (${v.anio})` : base
}

// ─────────────────────────────────────────────────────────────────────────
// Cuerpo
// ─────────────────────────────────────────────────────────────────────────
function cuerpo(doc: Doc, datos: Awaited<ReturnType<typeof loadEstadoPlan>>) {
  const hoy = today()
  const overridesPorKey = new Map(datos.overrides.map((o) => [`${o.dominio}|${o.tarea_id}`, o]))
  const unidades = datos.estados.map((e) =>
    armarUnidad(e, datos.tareasById, overridesPorKey, datos.ultimasLecturas, hoy)
  )

  const total: Record<EstadoTareaMantenimiento, number> = { ok: 0, proximo: 0, vencido: 0, sin_datos: 0 }
  for (const u of unidades) {
    for (const k of Object.keys(total) as EstadoTareaMantenimiento[]) total[k] += u.conteo[k]
  }
  const evaluadas = total.ok + total.proximo + total.vencido + total.sin_datos
  const conDatos = total.ok + total.proximo + total.vencido
  const alDiaPct = conDatos > 0 ? Math.round((total.ok / conDatos) * 100) : null

  drawKpis(doc, [
    { label: "Unidades", valor: String(unidades.length), sub: "en el catálogo" },
    { label: "Tareas evaluadas", valor: String(evaluadas), sub: "unidad x tarea" },
    {
      label: "Al día",
      valor: String(total.ok),
      sub: alDiaPct != null ? `${alDiaPct} % con datos` : "sin datos",
      color: COLOR.ok,
    },
    { label: "Próximas", valor: String(total.proximo), sub: "a programar", color: COLOR.proximo },
    { label: "Vencidas", valor: String(total.vencido), sub: "fuera de plan", color: COLOR.vencido },
    { label: "Sin datos", valor: String(total.sin_datos), sub: "sin OT cerrada", color: COLOR.sinDatos },
  ])

  // Resumen por unidad: la peor primero, que es lo que hay que mirar.
  const ordenadas = [...unidades].sort(
    (a, b) =>
      PESO_ESTADO[b.general] - PESO_ESTADO[a.general] ||
      b.conteo.vencido - a.conteo.vencido ||
      b.conteo.proximo - a.conteo.proximo ||
      a.e.vehiculo.dominio.localeCompare(b.e.vehiculo.dominio)
  )

  drawSeccion(
    doc,
    "Resumen por unidad",
    "Estado general = la peor tarea de la unidad. Km / hs actual: última lectura de odómetro u horómetro registrada."
  )
  drawTabla(doc, ordenadas, [
    { header: "Unidad", width: 52, bold: true, get: (u) => u.e.vehiculo.dominio },
    { header: "Modelo", width: 100, get: modeloUnidad },
    { header: "Tipo", width: 66, get: (u) => VEHICULO_TIPO_LABELS[u.e.vehiculo.tipo ?? "camion"] },
    { header: "Km / hs", width: 66, align: "right", get: medidaActual },
    { header: "Lectura", width: 54, align: "center", get: (u) => fmtFecha(u.lectura?.fecha) },
    { header: "Al día", width: 36, align: "center", get: (u) => String(u.conteo.ok) },
    {
      header: "Próx.",
      width: 36,
      align: "center",
      get: (u) => String(u.conteo.proximo),
      color: (u) => (u.conteo.proximo ? COLOR.proximo : COLOR.grisClaro),
    },
    {
      header: "Venc.",
      width: 36,
      align: "center",
      get: (u) => String(u.conteo.vencido),
      color: (u) => (u.conteo.vencido ? COLOR.vencido : COLOR.grisClaro),
    },
    {
      header: "S/d",
      width: 40,
      align: "center",
      get: (u) => String(u.conteo.sin_datos),
      color: (u) => (u.conteo.sin_datos ? COLOR.sinDatos : COLOR.grisClaro),
    },
    {
      header: "Estado",
      width: 58,
      align: "center",
      get: (u) => ESTADO_LABEL[u.general],
      chip: (u) => ESTADO_CHIP[u.general],
    },
  ])

  // Qué programar primero: vencidas y próximas de toda la flota, lo más consumido arriba.
  const prioridades = unidades
    .flatMap((u) => u.filas)
    .filter((f) => f.celda.estado === "vencido" || f.celda.estado === "proximo")
    .sort(
      (a, b) =>
        PESO_ESTADO[b.celda.estado] - PESO_ESTADO[a.celda.estado] ||
        (b.celda.pctConsumido ?? 0) - (a.celda.pctConsumido ?? 0)
    )

  drawSeccion(
    doc,
    "Qué programar primero",
    prioridades.length > TOP_PRIORIDADES
      ? `Las ${TOP_PRIORIDADES} tareas más urgentes de ${prioridades.length} vencidas o próximas en toda la flota, de la más consumida a la menos.`
      : "Tareas vencidas o próximas a vencer en toda la flota, de la más consumida a la menos."
  )
  drawTabla(
    doc,
    prioridades.slice(0, TOP_PRIORIDADES),
    [
      { header: "Unidad", width: 54, bold: true, get: (f) => f.dominio },
      { header: "Tarea", width: 150, get: (f) => f.tarea.nombre },
      { header: "Último", width: 92, get: (f) => f.ultimo },
      { header: "Próximo", width: 84, get: (f) => f.proximo },
      { header: "Faltan", width: 84, get: (f) => f.faltan, color: (f) => ESTADO_COLOR[f.celda.estado] },
      { header: "Cons.", width: 40, align: "right", get: (f) => f.consumido },
      {
        header: "Estado",
        width: 52,
        align: "center",
        get: (f) => ESTADO_LABEL[f.celda.estado],
        chip: (f) => ESTADO_CHIP[f.celda.estado],
      },
    ],
    { vacio: "Nada vencido ni próximo a vencer: la flota está al día con el plan." }
  )

  // Detalle por unidad, en el orden del catálogo (tipo, dominio).
  for (const u of unidades) {
    const v = u.e.vehiculo
    const partes = [
      `${u.esHoras ? "Horómetro" : "Km"} actual: ${medidaActual(u)}${u.lectura ? ` (lectura del ${fmtFecha(u.lectura.fecha)})` : ""}`,
      `${pluralTareas(u.filas.length)} del plan`,
    ]
    if (u.conteo.vencido) partes.push(`${u.conteo.vencido} vencidas`)
    if (u.conteo.proximo) partes.push(`${u.conteo.proximo} próximas`)
    if (u.conteo.sin_datos) partes.push(`${u.conteo.sin_datos} sin datos`)

    drawSeccion(
      doc,
      `${v.dominio} · ${modeloUnidad(u)} · ${VEHICULO_TIPO_LABELS[v.tipo ?? "camion"]}`,
      partes.join(" · ") + "."
    )
    drawTabla(
      doc,
      u.filas,
      [
        { header: "Tarea", width: 132, bold: true, get: (f) => f.tarea.nombre },
        { header: "Frecuencia", width: 72, get: (f) => f.frecuencia },
        { header: "Último", width: 90, get: (f) => f.ultimo },
        { header: "Próximo", width: 82, get: (f) => f.proximo },
        { header: "Faltan", width: 84, get: (f) => f.faltan, color: (f) => ESTADO_COLOR[f.celda.estado] },
        { header: "Cons.", width: 36, align: "right", get: (f) => f.consumido },
        {
          header: "Estado",
          width: 52,
          align: "center",
          get: (f) => ESTADO_LABEL[f.celda.estado],
          chip: (f) => ESTADO_CHIP[f.celda.estado],
        },
      ],
      { vacio: "Esta unidad no tiene tareas del plan (sin plantilla para su tipo)." }
    )
  }

  espacio(doc, 4)
  drawParrafo(
    doc,
    "Generado desde los mismos datos que la pantalla Mantenimiento de camiones: el estado de cada tarea se calcula con el último cierre en una orden de trabajo completada, la frecuencia efectiva (excepción de la unidad o plantilla de su tipo) y la última lectura de odómetro u horómetro. «Sin datos» significa que la tarea nunca se cerró en una OT para esa unidad, no que esté vencida.",
    { size: 7.5, color: COLOR.gris }
  )
  drawFirmas(doc)
}
