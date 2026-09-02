export const maxDuration = 60

import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { ESTADO_CAPACITACION_LABELS } from "@/lib/constants"
import { estadoDerivado, formatDuracion } from "@/lib/capacitacion-estado"
import { calcularAdherencia, type ItemAdherencia } from "@/lib/capacitacion-adherencia"
import { HAY_PAC, META_CUMPLIMIENTO, PAC_2026_ORIGEN, PAC_2026_TOTAL } from "@/lib/pac-2026"
import type {
  Capacitacion,
  AsistenciaConEmpleado,
  ResultadoCapacitacion,
} from "@/types/database"

const RESULTADO_LABELS: Record<ResultadoCapacitacion, string> = {
  aprobado: "Aprobado",
  desaprobado: "Desaprobado",
  pendiente: "Pendiente",
}

function fmtBool(v: boolean | null | undefined): string {
  if (v === true) return "Sí"
  if (v === false) return "No"
  return ""
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ""
  return iso.length >= 10 ? iso.slice(0, 10) : iso
}

// Fecha y hora en zona Argentina (para auditoría), formato DD/MM/AAAA HH:mm
const fmtRealAR = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return fmtRealAR.format(d).replace(", ", " ")
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "auditor"].includes(profile.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const { data: capsData, error: capsError } = await supabase
      .from("capacitaciones")
      .select("*")
      .order("fecha", { ascending: false })

    if (capsError) {
      return NextResponse.json({ error: capsError.message }, { status: 500 })
    }

    const caps = (capsData ?? []) as Capacitacion[]

    const asistencias: AsistenciaConEmpleado[] = []
    if (caps.length > 0) {
      const capIds = caps.map((c) => c.id)
      const PAGE_SIZE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from("asistencias")
          .select("*, empleado:empleados(*)")
          .in("capacitacion_id", capIds)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        const batch = (data ?? []) as AsistenciaConEmpleado[]
        asistencias.push(...batch)
        if (batch.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
    }

    const asistByCap = new Map<string, AsistenciaConEmpleado[]>()
    for (const a of asistencias) {
      const arr = asistByCap.get(a.capacitacion_id) ?? []
      arr.push(a)
      asistByCap.set(a.capacitacion_id, arr)
    }

    // Fecha/hora REAL de realización: el ÚLTIMO intento de examen por
    // empleado+capacitación (created_at = cuándo rindió). Es el que coincide
    // con la nota/resultado registrados en la asistencia.
    const ultimoIntento = new Map<string, string>() // `${capId}|${empId}` -> created_at
    if (caps.length > 0) {
      const capIds = caps.map((c) => c.id)
      const PAGE_SIZE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from("examen_intentos")
          .select("capacitacion_id, empleado_id, created_at")
          .in("capacitacion_id", capIds)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        const batch = (data ?? []) as {
          capacitacion_id: string
          empleado_id: string
          created_at: string
        }[]
        for (const it of batch) {
          if (!it.created_at) continue
          const key = `${it.capacitacion_id}|${it.empleado_id}`
          const prev = ultimoIntento.get(key)
          if (!prev || it.created_at > prev) ultimoIntento.set(key, it.created_at)
        }
        if (batch.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
    }

    type Row = Record<string, string | number | null>
    const rows: Row[] = []
    const itemsAdherencia: ItemAdherencia[] = []

    const today = new Date().toISOString().slice(0, 10)
    for (const c of caps) {
      const list = asistByCap.get(c.id) ?? []
      const aprobados = list.filter((a) => a.resultado === "aprobado").length
      const estadoReal = estadoDerivado({
        estado: c.estado,
        total_asistentes: list.length,
        aprobados,
      })
      const estadoLabel =
        ESTADO_CAPACITACION_LABELS[estadoReal] ?? estadoReal
      itemsAdherencia.push({
        id: c.id,
        titulo: c.titulo,
        fecha: c.fecha,
        pilar: c.pilar,
        estadoReal,
      })
      const base = {
        Capacitación: c.titulo,
        Pilar: c.pilar ?? "",
        Instructor: c.instructor,
        Fecha: fmtDate(c.fecha),
        Duración: formatDuracion(c.duracion_horas),
        Estado: estadoLabel,
        Lugar: c.lugar ?? "",
        Descripción: c.descripcion ?? "",
        Visible: fmtBool(c.visible),
      }

      if (list.length === 0) {
        rows.push({
          ...base,
          Empleado: "",
          Legajo: "",
          Sector: "",
          Presente: "",
          "Fecha y hora real": "",
          Nota: "",
          Resultado: "",
          Observaciones: "",
        })
        continue
      }

      list.sort((a, b) =>
        (a.empleado?.nombre ?? "").localeCompare(b.empleado?.nombre ?? "")
      )

      for (const a of list) {
        // Fecha/hora real: último intento; si no hubo examen pero está
        // presente, se usa cuándo se marcó la asistencia (updated_at).
        const realIso =
          ultimoIntento.get(`${c.id}|${a.empleado_id}`) ??
          (a.presente ? a.updated_at : null)
        rows.push({
          ...base,
          Empleado: a.empleado?.nombre ?? "",
          Legajo: a.empleado?.legajo ?? "",
          Sector: a.empleado?.sector ?? "",
          Presente: fmtBool(a.presente),
          "Fecha y hora real": fmtDateTime(realIso),
          Nota: a.nota ?? "",
          Resultado: a.resultado
            ? RESULTADO_LABELS[a.resultado as ResultadoCapacitacion] ??
              a.resultado
            : "",
          Observaciones: a.observaciones ?? "",
        })
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        "Capacitación",
        "Pilar",
        "Instructor",
        "Fecha",
        "Duración (h)",
        "Estado",
        "Lugar",
        "Descripción",
        "Visible",
        "Empleado",
        "Legajo",
        "Sector",
        "Presente",
        "Fecha y hora real",
        "Nota",
        "Resultado",
        "Observaciones",
      ],
    })

    ws["!cols"] = [
      { wch: 38 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 22 },
      { wch: 40 },
      { wch: 8 },
      { wch: 28 },
      { wch: 10 },
      { wch: 16 },
      { wch: 10 },
      { wch: 18 },
      { wch: 8 },
      { wch: 14 },
      { wch: 40 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Capacitaciones")
    XLSX.utils.book_append_sheet(wb, hojaAdherencia(itemsAdherencia, today), "Adherencia Cronograma")

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    const filename = `capacitaciones_${today}.xlsx`

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("Export capacitaciones error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error exportando",
      },
      { status: 500 }
    )
  }
}

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

/**
 * Hoja de adherencia al cronograma: mismos números y mismas definiciones que el
 * panel de /capacitaciones (`calcularAdherencia`), para que la pantalla, este
 * Excel y el seguimiento del PAC no se contradigan.
 */
/** El PAC es de Pampeana: en Misiones la columna del plan no aplica y se saca. */
function sinPac<T>(fila: T[]): T[] {
  return HAY_PAC ? fila : fila.filter((_, i) => i !== 1)
}

function hojaAdherencia(items: ItemAdherencia[], today: string) {
  const a = calcularAdherencia(items, today)
  const metaPct = Math.round(META_CUMPLIMIENTO * 100)
  const filas: (string | number | null)[][] = [
    [`ADHERENCIA AL CRONOGRAMA DE CAPACITACIONES ${a.anio}`],
    [`Corte al ${today}. Meta: ${metaPct} % de cumplimiento a fin de año.`],
    [],
    ["INDICADOR", "VALOR", "DETALLE"],
    [
      "Adherencia YTD (%)",
      a.adherenciaYtd,
      `${a.cumplidasVencidas} cumplidas de ${a.vencidas} ya vencidas`,
    ],
    ["Atrasadas", a.atrasadas.length, "Vencidas sin cerrar"],
    [
      "Cumplimiento anual (%)",
      a.cumplimientoAnual,
      `${a.cumplidasAnual} cumplidas de ${a.totalAnual} calendarizadas`,
    ],
    [`Necesarias para el ${metaPct} %`, a.metaCantidad, `Faltan ${a.faltanParaMeta}`],
    [
      "Ritmo requerido (por mes)",
      a.ritmoRequerido,
      `${a.mesesHastaFinCronograma} ${a.mesesHastaFinCronograma === 1 ? "mes" : "meses"} hasta ${MESES_CORTOS[a.ultimoMesCalendarizado]} (fin del cronograma cargado)`,
    ],
    [
      "Margen",
      a.margen,
      a.margen >= 0
        ? `Se pueden caer ${a.margen} de las ${a.totalAnual - a.cumplidasAnual} pendientes`
        : `Meta inalcanzable: faltan ${-a.margen} fechas por calendarizar`,
    ],
    ...(HAY_PAC ? [["PAC aprobado (plan)", PAC_2026_TOTAL, PAC_2026_ORIGEN]] : []),
    [],
    ["AVANCE MES A MES"],
    sinPac(["Mes", "PAC (plan)", "Calendarizadas", "Vencidas", "Cumplidas", "Adelantadas", "Atrasadas", "Adherencia %"]),
    ...a.porMes.map((m) => sinPac([
      MESES_CORTOS[m.mes],
      m.pac,
      m.calendarizadas,
      m.vencidas,
      m.cumplidas,
      m.adelantadas,
      m.atrasadas,
      m.adherencia,
    ])),
    [],
    ["AVANCE POR PILAR"],
    sinPac(["Pilar", "PAC (plan)", "Calendarizadas", "Vencidas", "Cumplidas", "Adelantadas", "Atrasadas", "Adherencia %"]),
    ...a.porPilar.map((p) => sinPac([
      p.pilar,
      p.pac,
      p.calendarizadas,
      p.vencidas,
      p.cumplidas,
      p.adelantadas,
      p.atrasadas,
      p.adherencia,
    ])),
    [],
    ["ATRASADAS — VENCIDAS SIN CERRAR"],
    ["Capacitación", "Pilar", "Fecha", "Días de atraso"],
    ...a.atrasadas.map((c) => [
      c.titulo,
      c.pilar ?? "",
      c.fecha,
      Math.max(
        0,
        Math.round(
          (Date.parse(today + "T12:00:00") - Date.parse(c.fecha + "T12:00:00")) / 86400000
        )
      ),
    ]),
    [],
    ["Definiciones: Calendarizada = cargada en el año sin cancelar · Vencida = fecha ≤ hoy ·"],
    ["Cumplida = estado Completada (todos los asistentes rindieron) · Atrasada = vencida y no cumplida ·"],
    ["Adelantada = cumplida antes de su fecha: suma al cumplimiento anual, todavía no a la adherencia."],
  ]
  const ws = XLSX.utils.aoa_to_sheet(filas)
  ws["!cols"] = [{ wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]
  return ws
}
