export const maxDuration = 60

import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { EMPRESA_NOMBRE } from "@/lib/empresa"
import { leerObjetos } from "@/lib/clima-store"
import type { ClimaPlan } from "@/actions/clima-tipos"

const PRIORIDAD: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}

const ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

const ORDEN_PRIORIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 }

/**
 * Exporta los planes de acción de clima con las columnas del formato clásico
 * de RRHH, para llevarlos al comité o compartirlos fuera de la app.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const res = await leerObjetos<ClimaPlan>("clima:plan:")
    if ("error" in res) {
      return NextResponse.json({ error: res.error }, { status: 500 })
    }

    const ids = [
      ...new Set(res.data.map((p) => p.responsable_id).filter(Boolean)),
    ] as string[]
    const nombres = new Map<string, string>()
    if (ids.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, nombre")
        .in("id", ids)
      for (const p of (data ?? []) as Array<{ id: string; nombre: string }>) {
        nombres.set(p.id, p.nombre)
      }
    }

    const filas = res.data
      .sort(
        (a, b) =>
          ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
          a.created_at.localeCompare(b.created_at),
      )
      .map((p, i) => ({
        ID: i + 1,
        Prioridad: PRIORIDAD[p.prioridad] ?? p.prioridad,
        Foco: p.foco ?? "",
        "Eje / Driver": p.eje ?? "",
        Dimensión: p.dimension ?? "",
        Ítem: p.pregunta ?? "",
        Hallazgo: p.hallazgo ?? "",
        Ola: p.ola_id ?? "",
        "Acción concreta": p.accion,
        Responsable:
          (p.responsable_id ? nombres.get(p.responsable_id) : null) ??
          p.responsable_texto ??
          "",
        Plazo: p.plazo ?? "",
        "Fecha objetivo": p.fecha_objetivo ?? "",
        "Indicador de éxito / Meta": p.indicador_exito ?? "",
        Estado: ESTADO[p.estado] ?? p.estado,
      }))

    const ws = XLSX.utils.json_to_sheet(filas)
    ws["!cols"] = [
      { wch: 5 },
      { wch: 10 },
      { wch: 18 },
      { wch: 28 },
      { wch: 24 },
      { wch: 30 },
      { wch: 48 },
      { wch: 10 },
      { wch: 56 },
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 44 },
      { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Plan de Acción")

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    const hoy = new Date().toISOString().slice(0, 10)
    const nombre = `Plan de Accion Clima - ${EMPRESA_NOMBRE} - ${hoy}.xlsx`

    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre.replace(
          /[^\x20-\x7E]/g,
          "_",
        )}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error exportando" },
      { status: 500 },
    )
  }
}
