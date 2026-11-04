// PDF «Análisis de incidencias de mantenimiento correctivo» (DPO Flota 2.4 /
// R2.4.2) para la carpeta de evidencia: resumen del período, estratificación
// por sistema, unidad, mes y taller, matriz unidad × sistema y, por sistema, la
// conclusión y la acción cargadas en la app. Mismos datos que la solapa.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { analizarCorrectivos, type FilaEstrato } from "@/lib/flota/correctivo-analisis"
import { labelSistema } from "@/lib/flota/sistemas-ot"
import type { MantenimientoRealizado, MantenimientoSistema } from "@/types/database"
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
  type Doc,
} from "../plan-pdf/_comun"

const fmtMoney = (v: number) => `$ ${fmtInt(Math.round(v))}`

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (IS_MISIONES) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const meses = Math.min(24, Math.max(3, Number(req.nextUrl.searchParams.get("meses") ?? 12) || 12))
  const supabase = await createClient()
  const desdeQ = new Date()
  desdeQ.setMonth(desdeQ.getMonth() - meses - 1)
  const [otRes, concRes] = await Promise.all([
    supabase
      .from("mantenimiento_realizados")
      .select("*, tareas:mantenimiento_realizado_tareas(*), repuestos:mantenimiento_realizado_repuestos(*)")
      .eq("tipo", "correctivo")
      .gte("fecha", desdeQ.toISOString().slice(0, 10))
      .order("fecha", { ascending: false }),
    supabase.from("correctivo_sistema_analisis").select("*"),
  ])
  if (otRes.error) return NextResponse.json({ error: otRes.error.message }, { status: 500 })
  const conclusiones = new Map(
    ((concRes.data || []) as Array<{ sistema: MantenimientoSistema; observacion: string | null; plan_accion: string | null; plan_estado: string | null }>).map(
      (c) => [c.sistema, c]
    )
  )
  const hoy = hoyISO()
  const a = analizarCorrectivos({ mantenimientos: (otRes.data || []) as MantenimientoRealizado[], hoy, meses })
  const ahora = new Date()

  const colsEstrato = (titulo: string) => [
    { header: titulo, width: 150, bold: true, get: (f: FilaEstrato) => f.label },
    { header: "OT", width: 36, align: "right" as const, get: (f: FilaEstrato) => String(f.n) },
    { header: "% acum.", width: 48, align: "right" as const, get: (f: FilaEstrato) => `${f.pctAcumN.toFixed(0)} %` },
    { header: "Unid.", width: 40, align: "right" as const, get: (f: FilaEstrato) => String(f.unidades) },
    { header: "Costo", width: 80, align: "right" as const, get: (f: FilaEstrato) => fmtMoney(f.costo) },
    { header: "% costo", width: 48, align: "right" as const, get: (f: FilaEstrato) => `${f.pctCosto.toFixed(0)} %` },
    { header: "Días parado", width: 60, align: "right" as const, get: (f: FilaEstrato) => String(f.diasParado), color: (f: FilaEstrato) => (f.diasParado > 0 ? COLOR.vencido : null) },
    { header: "Roturas", width: 48, align: "right" as const, get: (f: FilaEstrato) => String(f.roturas) },
    { header: "Internas", width: 50, align: "right" as const, get: (f: FilaEstrato) => String(f.internas) },
  ]

  const pdf = await renderPdf(
    {
      titulo: "Análisis de incidencias de mantenimiento correctivo",
      subtitulo: `OT correctivas externas e internas del ${fmtFecha(a.desde)} al ${fmtFecha(a.hasta)}, estratificadas por sistema, unidad, mes y taller, con la conclusión y la acción por sistema.`,
      derechaTop: "Pilar Flota · Punto 2.4",
      derechaSub: `Situación al ${fmtFechaHora(ahora)}`,
      pie: "Mercosur · DPO · Análisis de correctivos · Evidencia pilar Flota 2.4 (R2.4.2)",
      info: { Title: "Análisis de incidencias de mantenimiento correctivo", Subject: "DPO Flota 2.4" },
    },
    (doc: Doc) => {
      const t = a.totales
      drawKpis(doc, [
        { label: "OT correctivas", valor: String(t.n), sub: `${t.externas} externas · ${t.internas} internas` },
        { label: "Costo", valor: fmtMoney(t.costo), sub: `${t.unidades} unidades` },
        { label: "Días parado", valor: String(t.diasParado), sub: "fuera de servicio", color: t.diasParado > 10 ? COLOR.vencido : COLOR.ok },
        { label: "Roturas de flota", valor: String(t.roturas), sub: `${t.auxilios} auxilios en ruta`, color: t.roturas > 0 ? COLOR.proximo : COLOR.ok },
        { label: "Tiempo en taller", valor: t.horasTallerPromedio != null ? `${t.horasTallerPromedio.toFixed(0)} h` : "—", sub: "promedio entrada→salida" },
      ])
      espacio(doc, 6)

      drawSeccion(doc, "Por sistema del vehículo", "Pareto de OT: el % acumulado dice cuántos sistemas explican el grueso del correctivo.")
      drawTabla(doc, a.porSistema, colsEstrato("Sistema"))
      espacio(doc, 4)
      drawSeccion(doc, "Conclusión y acción por sistema", "Lo que el equipo concluyó del análisis y la contramedida de fondo (R2.4.2 / R2.4.4).")
      const filasConc = a.porSistema.map((f) => {
        const c = conclusiones.get(f.clave as MantenimientoSistema)
        return {
          sistema: f.label,
          n: f.n,
          obs: c?.observacion ?? "(sin conclusión cargada)",
          plan: c?.plan_accion ? `${c.plan_estado === "cerrado" ? "[cerrada] " : "[en curso] "}${c.plan_accion}` : "(sin acción cargada)",
        }
      })
      drawTabla(doc, filasConc, [
        { header: "Sistema", width: 90, bold: true, get: (r) => `${r.sistema} (${r.n})` },
        { header: "Conclusión", width: 220, get: (r) => r.obs },
        { header: "Acción", width: 220, get: (r) => r.plan },
      ])
      espacio(doc, 4)

      drawSeccion(doc, "Por unidad", "Qué camión concentra el correctivo.")
      drawTabla(doc, a.porUnidad, colsEstrato("Unidad"))
      espacio(doc, 4)
      drawSeccion(doc, "Por mes", "Tendencia del período.")
      drawTabla(doc, a.porMes, colsEstrato("Mes"))
      espacio(doc, 4)
      drawSeccion(doc, "Por taller", "Interno (depósito) contra externo (taller), y qué taller.")
      drawTabla(doc, a.porTaller, colsEstrato("Taller"))
      espacio(doc, 4)

      drawSeccion(doc, "Matriz unidad × sistema", "OT correctivas por celda.")
      const sistemas = a.sistemas
      drawTabla(
        doc,
        a.dominios,
        [
          { header: "Unidad", width: 60, bold: true, get: (d: string) => d },
          ...sistemas.map((s) => ({
            header: labelSistema(s).slice(0, 14),
            width: 40,
            align: "center" as const,
            get: (d: string) => {
              const c = a.matriz.find((x) => x.dominio === d && x.sistema === s)
              return c ? String(c.n) : "·"
            },
            color: (d: string) => {
              const c = a.matriz.find((x) => x.dominio === d && x.sistema === s)
              return c && c.n >= 3 ? COLOR.vencido : c && c.n === 2 ? COLOR.proximo : null
            },
          })),
          { header: "Total", width: 40, align: "right" as const, get: (d: string) => String(a.matriz.filter((x) => x.dominio === d).reduce((acc, x) => acc + x.n, 0)) },
        ]
      )
      espacio(doc, 6)
      drawParrafo(
        doc,
        "Fuente: Órdenes de Trabajo de la app (mantenimiento_realizados), tipo correctivo, sin canceladas. Interna = taller «Depósito» u OT nacida del plan de acción del checklist. Costo = el mayor entre la cabecera y el desglose de la OT. Días parado = fuera de servicio cargado en la OT. Sistema = clasificación de la OT (confirmada o deducida del texto, marcada con ~ en la pantalla).",
        { size: 7.5, color: COLOR.gris }
      )
      drawFirmas(doc, ["Firma Gestor de Flota", "Firma Supervisor de Distribución"])
    }
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Mercosur-Analisis-Correctivos-${hoyISO()}.pdf"`,
    },
  })
}
