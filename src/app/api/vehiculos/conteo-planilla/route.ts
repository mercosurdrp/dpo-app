// Planilla de conteo físico del pañol (DPO Flota 2.3 / R2.3.2), para imprimir
// y contar con lápiz: cada pieza con su ubicación, su mínimo y el stock del
// sistema, y columnas en blanco para lo contado, la diferencia y la causa.
// Después se carga en Repuestos → Conteo de stock, que es donde queda la
// exactitud del mes.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
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
  fmtInt,
  hoyISO,
  renderPdf,
} from "../plan-pdf/_comun"

interface Fila {
  codigo: string
  nombre: string
  unidad: string
  ubicacion: string
  minimo: string
  sistema: string
  abc: string
}

export async function GET() {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (IS_MISIONES) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const supabase = await createClient()
  const [repRes, confRes, conteoRes] = await Promise.all([
    supabase.from("mantenimiento_repuestos").select("codigo, nombre, unidad, ubicacion, stock_min, stock_actual, clase_abc, en_panol").order("ubicacion").order("nombre"),
    supabase.from("mantenimiento_config").select("recuento_frecuencia_dias").maybeSingle(),
    supabase.from("mantenimiento_conteos").select("fecha, realizado_por").order("fecha", { ascending: false }).limit(1),
  ])
  if (repRes.error) return NextResponse.json({ error: repRes.error.message }, { status: 500 })

  const filas: Fila[] = ((repRes.data || []) as Array<{
    codigo: string | null
    nombre: string
    unidad: string | null
    ubicacion: string | null
    stock_min: number | null
    stock_actual: number
    clase_abc: string | null
    en_panol: boolean | null
  }>)
    .filter((r) => r.en_panol !== false)
    .map((r) => ({
      codigo: r.codigo ?? "—",
      nombre: r.nombre,
      unidad: r.unidad ?? "",
      ubicacion: r.ubicacion ?? "—",
      minimo: r.stock_min != null ? fmtInt(Number(r.stock_min)) : "—",
      sistema: fmtInt(Number(r.stock_actual)),
      abc: r.clase_abc ?? "—",
    }))

  const frecuencia = (confRes.data?.recuento_frecuencia_dias as number | null) ?? null
  const ultimo = (conteoRes.data || [])[0] as { fecha: string; realizado_por: string } | undefined
  const ahora = new Date()

  const pdf = await renderPdf(
    {
      titulo: "Planilla de conteo físico del pañol",
      subtitulo:
        "Contar la existencia real de cada pieza, anotar la diferencia contra el sistema y su causa. Cargar después en Mantenimiento / Repuestos / Conteo de stock.",
      derechaTop: "Pilar Flota · Punto 2.3",
      derechaSub: `Emitida ${fmtFechaHora(ahora)}`,
      pie: "Mercosur · DPO · Conteo físico de repuestos · Evidencia pilar Flota 2.3 (R2.3.2)",
      info: { Title: "Planilla de conteo físico del pañol", Subject: "Recuento de repuestos de flota (DPO 2.3)" },
    },
    (doc) => {
      drawKpis(doc, [
        { label: "Piezas del pañol", valor: String(filas.length), sub: "a contar al 100 %" },
        { label: "Frecuencia", valor: frecuencia ? `${frecuencia} d` : "—", sub: "declarada en la app" },
        { label: "Último conteo", valor: ultimo ? fmtFecha(ultimo.fecha) : "—", sub: ultimo ? ultimo.realizado_por : "sin conteos" },
        { label: "Fecha de este conteo", valor: "____ / ____ / ______", sub: "Contó: ______________________" },
      ])
      espacio(doc, 6)
      drawSeccion(doc, "Piezas", "Ordenadas por ubicación. «Sistema» es el stock que la app tenía al imprimir.")
      drawTabla(doc, filas, [
        { header: "Ubicación", width: 70, get: (f) => f.ubicacion },
        { header: "Código", width: 40, get: (f) => f.codigo },
        { header: "Repuesto", width: 150, bold: true, get: (f) => f.nombre + (f.unidad ? ` (${f.unidad})` : "") },
        { header: "ABC", width: 26, align: "center", get: (f) => f.abc },
        { header: "Mín", width: 30, align: "right", get: (f) => f.minimo },
        { header: "Sistema", width: 40, align: "right", get: (f) => f.sistema },
        { header: "Contado", width: 46, align: "right", get: () => "" },
        { header: "Dif.", width: 34, align: "right", get: () => "" },
        { header: "Causa de la diferencia", width: 110, get: () => "" },
      ])
      espacio(doc, 6)
      drawParrafo(
        doc,
        "Causas posibles: egreso no registrado (se usó sin cargar) · ingreso no registrado (compra sin cargar) · error del conteo anterior · rotura o pérdida · otro. Toda diferencia se ajusta en la app como movimiento con su causa (SOP Repuestos e Inventario, 4.3); una diferencia sin explicación se trata como desvío y se lleva a la reunión semanal de flota.",
        { size: 7.5, color: COLOR.gris }
      )
      drawFirmas(doc, ["Firma responsable del pañol", "Firma Gestor de Flota (valida)"])
    }
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Mercosur-Planilla-Conteo-Panol-${hoyISO()}.pdf"`,
    },
  })
}
