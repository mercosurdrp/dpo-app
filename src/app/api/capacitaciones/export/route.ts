export const maxDuration = 60

import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { ESTADO_CAPACITACION_LABELS } from "@/lib/constants"
import { estadoDerivado } from "@/lib/capacitacion-estado"
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

    type Row = Record<string, string | number | null>
    const rows: Row[] = []

    const today = new Date().toISOString().slice(0, 10)
    for (const c of caps) {
      const list = asistByCap.get(c.id) ?? []
      const presentes = list.filter((a) => a.presente).length
      const rendidos = list.filter((a) => a.resultado && a.resultado !== "pendiente").length
      const pendientes = list.filter((a) => !a.resultado || a.resultado === "pendiente").length
      const estadoReal = estadoDerivado(
        {
          estado: c.estado,
          fecha: c.fecha,
          total_asistentes: list.length,
          presentes,
          rendidos,
          pendientes,
        },
        today
      )
      const estadoLabel =
        ESTADO_CAPACITACION_LABELS[estadoReal] ?? estadoReal
      const base = {
        Capacitación: c.titulo,
        Pilar: c.pilar ?? "",
        Instructor: c.instructor,
        Fecha: fmtDate(c.fecha),
        "Duración (h)": c.duracion_horas ?? "",
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
        rows.push({
          ...base,
          Empleado: a.empleado?.nombre ?? "",
          Legajo: a.empleado?.legajo ?? "",
          Sector: a.empleado?.sector ?? "",
          Presente: fmtBool(a.presente),
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
      { wch: 8 },
      { wch: 14 },
      { wch: 40 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Capacitaciones")

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
