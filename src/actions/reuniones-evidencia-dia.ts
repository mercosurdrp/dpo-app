"use server"

import { getNpsDashboard } from "@/actions/nps"
import { getRmdDashboard } from "@/actions/rmd"
import { subirImagenGenerada } from "@/actions/reuniones-seccion-fotos"
import {
  renderEvidenciaDiaPng,
  type EvidenciaKpi,
} from "@/lib/reuniones/evidencia-og"

type Result<T> = { data: T } | { error: string }

function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)
}

function fmtFechaCorta(iso: string | null): string {
  const d = (iso ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—"
  const [, m, day] = d.split("-")
  return `${day}/${m}`
}

/**
 * Genera la imagen-resumen del día de la sección RMD/NPS (con los KPIs reales
 * del dashboard) y la guarda como evidencia en la galería de la reunión.
 */
export async function capturarEvidenciaDia(
  reunionId: string,
  seccion: "rmd" | "nps",
  fecha: string,
): Promise<Result<{ id: string }>> {
  try {
    let titulo: string
    let kpis: EvidenciaKpi[]
    let pie = ""

    if (seccion === "rmd") {
      const res = await getRmdDashboard()
      if ("error" in res) return { error: res.error }
      const r = res.data.resumen
      titulo = `RMD ${r.anio}`
      kpis = [
        { label: "RMD promedio (1-5)", value: fmtNum(r.rmd, 2) },
        { label: "Entregas puntuadas", value: fmtNum(r.rmd_respuestas) },
        {
          label: "Detractoras (1-3)",
          value: fmtNum(r.detractores),
          sub:
            r.pct_detractores == null
              ? undefined
              : `${fmtNum(r.pct_detractores, 1)}% del total`,
        },
        { label: "Clientes que puntuaron", value: fmtNum(r.clientes) },
        {
          label: "Ultima puntuacion",
          value: fmtFechaCorta(r.ultima_puntuacion),
        },
      ]
      pie = r.actualizado_en
        ? `Actualizado al ${fmtFechaCorta(r.actualizado_en)}`
        : ""
    } else {
      const res = await getNpsDashboard()
      if ("error" in res) return { error: res.error }
      const r = res.data.resumen
      titulo = `NPS ${r.anio}`
      kpis = [
        { label: "NPS acumulado", value: fmtNum(r.nps, 1) },
        { label: "Encuestas", value: fmtNum(r.encuestas) },
        { label: "Promotores", value: fmtNum(r.promoters) },
        { label: "Pasivos", value: fmtNum(r.pasivos) },
        { label: "Detractores", value: fmtNum(r.detractores) },
        {
          label: "RMD promedio (1-5)",
          value: fmtNum(r.rmd, 2),
          sub: `${fmtNum(r.rmd_respuestas)} entregas`,
        },
      ]
      pie = r.actualizado_en
        ? `Actualizado al ${fmtFechaCorta(r.actualizado_en)}`
        : ""
    }

    const png = await renderEvidenciaDiaPng({
      tipo: seccion,
      titulo,
      fecha,
      kpis,
      pie,
    })

    const nombre = `${seccion}-dia-${(fecha ?? "").slice(0, 10)}.png`
    const descripcion = `${seccion.toUpperCase()} del dia ${fmtFechaCorta(
      fecha,
    )} (captura automatica)`

    return await subirImagenGenerada(
      reunionId,
      seccion,
      nombre,
      descripcion,
      png,
      "image/png",
    )
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error generando la captura del día",
    }
  }
}
