/**
 * Excel del libro de gastos de mantenimiento (pestaña Gastos).
 *
 * GET /api/vehiculos/gastos/export?mes=YYYY-MM&tipo=factura|boleta|caja_chica
 */
export const maxDuration = 60

import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { requireAuth } from "@/lib/session"
import {
  GASTO_MEDIO_PAGO_LABELS,
  GASTO_TIPO_LABELS,
  GASTO_TIPO_MANTENIMIENTO_LABELS,
  type MantenimientoGasto,
} from "@/types/database"
import { fetchGastosExport } from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const mes = req.nextUrl.searchParams.get("mes")
  const tipo = req.nextUrl.searchParams.get("tipo")

  let gastos: MantenimientoGasto[]
  try {
    gastos = await fetchGastosExport({ mes, tipo })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  const rows = gastos.map((g) => ({
    Fecha: g.fecha?.slice(0, 10) ?? "",
    "Fecha de carga": g.fecha_carga?.slice(0, 10) ?? "",
    Tipo: GASTO_TIPO_LABELS[g.tipo] ?? g.tipo,
    Proveedor: g.proveedor ?? "",
    "Tipo mantenimiento": g.tipo_mantenimiento
      ? GASTO_TIPO_MANTENIMIENTO_LABELS[g.tipo_mantenimiento] ?? g.tipo_mantenimiento
      : "",
    Monto: Number(g.monto),
    "Mes imputación": g.mes_imputacion,
    "N° comprobante": g.numero_comprobante ?? "",
    "N° orden de trabajo": g.orden_trabajo ?? "",
    "Medio de pago": g.medio_pago ? GASTO_MEDIO_PAGO_LABELS[g.medio_pago] ?? g.medio_pago : "",
    "Cuenta contable": g.cuenta_contable ?? "",
    "Centro de costo": g.centro_costo ?? "",
    Unidad: g.dominio ?? "",
    Imputación: g.estado_imputacion === "imputado" ? "Imputado" : "Sin imputar",
    Pago: g.estado_pago === "pagado" ? "Pagado" : "Pendiente",
    Observaciones: g.observaciones ?? "",
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [
    { wch: 11 }, // Fecha
    { wch: 13 }, // Fecha de carga
    { wch: 11 }, // Tipo
    { wch: 28 }, // Proveedor
    { wch: 18 }, // Tipo mantenimiento
    { wch: 12 }, // Monto
    { wch: 12 }, // Mes imputación
    { wch: 16 }, // N° comprobante
    { wch: 16 }, // N° OT
    { wch: 16 }, // Medio de pago
    { wch: 16 }, // Cuenta contable
    { wch: 16 }, // Centro de costo
    { wch: 10 }, // Unidad
    { wch: 11 }, // Imputación
    { wch: 10 }, // Pago
    { wch: 40 }, // Observaciones
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Gastos")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

  const filename = `gastos-mantenimiento${mes ? `-${mes}` : ""}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
