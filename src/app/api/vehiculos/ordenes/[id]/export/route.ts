/**
 * Excel de UNA orden de trabajo (botón dentro del detalle de la OT).
 *
 * GET /api/vehiculos/ordenes/[id]/export
 */
export const maxDuration = 60

import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { requireAuth } from "@/lib/session"
import { MANTENIMIENTO_ESTADO_LABELS } from "@/types/database"
import type { OrdenExport } from "../_shared"
import { descTarea, fetchOrdenExport, nombreArchivoOt, subtotalRepuestos, TIPO_OT_LABELS } from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "")

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await ctx.params
  let res: OrdenExport | null
  try {
    res = await fetchOrdenExport(id)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }
  if (!res) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })
  const { orden: m, nombresTareas } = res

  const tareas = m.tareas ?? []
  const repuestos = m.repuestos ?? []
  const subRep = subtotalRepuestos(m)

  // Hoja armada a mano (cabecera clave/valor + secciones), no tabular plana.
  const aoa: Array<Array<string | number | null>> = [
    [`Orden de trabajo${m.numero_ot ? ` N° ${m.numero_ot}` : ""} · ${m.dominio}`],
    [],
    ["Unidad", m.dominio],
    ["Fecha", fmtFecha(m.fecha)],
    ["Tipo", TIPO_OT_LABELS[m.tipo] ?? m.tipo],
    ["Estado", MANTENIMIENTO_ESTADO_LABELS[m.estado] ?? m.estado],
    ["Service general", m.es_service_general ? "Sí" : "No"],
    [
      m.odometro != null ? "Odómetro (km)" : "Horómetro (hs)",
      m.odometro ?? (m.horometro != null ? Number(m.horometro) : null),
    ],
    ["Taller / proveedor", m.taller ?? ""],
    ["N° de OT", m.numero_ot ?? ""],
    ["N° de factura", m.numero_factura ?? ""],
    ["Entrada al taller", m.entrada_taller ? new Date(m.entrada_taller).toLocaleString("es-AR") : ""],
    ["Salida del taller", m.salida_taller ? new Date(m.salida_taller).toLocaleString("es-AR") : ""],
    ["Origen", m.origen === "cloudfleet" ? `Cloudfleet #${m.cloudfleet_number ?? ""}` : "Carga manual"],
    ["Observaciones", m.observaciones ?? ""],
    [],
    ["Trabajo realizado / mano de obra"],
    ["Descripción", "Costo"],
    ...tareas.map((t): Array<string | number | null> => [
      descTarea(t, nombresTareas),
      t.costo != null ? Number(t.costo) : null,
    ]),
    ...(m.horas_mano_obra != null || m.costo_mano_obra != null
      ? [
          [
            `Mano de obra${m.horas_mano_obra != null ? ` (${Number(m.horas_mano_obra)} hs)` : ""}`,
            m.costo_mano_obra != null ? Number(m.costo_mano_obra) : null,
          ] as Array<string | number | null>,
        ]
      : []),
    [],
    ["Repuestos"],
    ["Descripción", "Cantidad", "Costo unitario", "Subtotal"],
    ...repuestos.map((r): Array<string | number | null> => [
      r.descripcion,
      Number(r.cantidad),
      r.costo_unitario != null ? Number(r.costo_unitario) : null,
      r.costo_unitario != null ? Number(r.cantidad) * Number(r.costo_unitario) : null,
    ]),
    ...(repuestos.length === 0 ? [["Sin repuestos cargados"] as Array<string | number | null>] : []),
    [],
    ["Subtotal repuestos", subRep || null],
    ["Costo mano de obra", m.costo_mano_obra != null ? Number(m.costo_mano_obra) : null],
    ["COSTO TOTAL", m.costo != null ? Number(m.costo) : null],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!cols"] = [{ wch: 42 }, { wch: 16 }, { wch: 14 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `OT ${m.numero_ot ?? ""}`.trim().slice(0, 31) || "OT")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoOt(m, "xlsx")}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
