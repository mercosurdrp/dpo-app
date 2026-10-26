// Lo que "ve" el bot de Seguridad: los reportes de seguridad (/reportes-
// seguridad) y sus planes. No hay grilla: los indicadores salen de las tablas
// reportes_seguridad y reporte_seguridad_planes, igual que la pantalla.
//   - Días sin accidentes (meta: la de la pantalla, app_config).
//   - Planes de reportes vencidos (fecha planificada pasada y sin completar).
//   - Reportes SIF de los últimos 30 días sin ningún plan.
// Lo accionable del día (reportes nuevos, qué planes vencieron) va en
// `novedades`, armadas por el código.

import { createAdminClient } from "@/lib/supabase/admin"
import { esFeriado } from "@/lib/feriados-ar"
import { estadoIndicador } from "@/lib/reuniones/semaforo"
import type { ContextoPilar, IndicadorContexto } from "./contexto"
import type { BotPilar } from "./tipos"

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
/** Mismo default que la pantalla de reportes (META_DIAS_DEFAULT). */
const META_DIAS_DEFAULT = 300
const VENTANA_SIF_DIAS = 30

const TIPO: Record<string, string> = {
  accidente: "accidente",
  incidente: "incidente",
  acto_inseguro: "acto inseguro",
  acto_seguro: "acto seguro",
  ruta_riesgo: "ruta de riesgo",
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const corto = (s: string, n = 70) => {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00")
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + "T12:00:00Z") - Date.parse(desde + "T12:00:00Z")) / 86_400_000)
}

/** Último día con operación antes de hoy: sin domingos ni feriados. */
function ultimoOperativo(hoy: string): string {
  let d = sumarDias(hoy, -1)
  while (new Date(d + "T12:00:00").getDay() === 0 || esFeriado(d)) d = sumarDias(d, -1)
  return d
}

function indicador(
  id: string,
  nombre: string,
  unidad: string,
  meta: number | null,
  mejor_si: "mayor" | "menor",
  valor: number | null,
  fecha: string,
): IndicadorContexto {
  const estado = estadoIndicador({ id, meta, mejor_si }, valor)
  const punto = valor == null ? null : { fecha, valor, texto: null, estado }
  return {
    id,
    nombre,
    unidad,
    meta,
    gatillo: null,
    mejor_si,
    ultimo: punto,
    serie: punto ? [punto] : [],
    mtd: valor,
    mtd_texto: null,
    estado_mtd: estado,
    racha_fuera: 0,
    racha_toda_la_serie: false,
    // Son fotos al día de hoy: se juzgan por el valor actual, sin racha.
    umbral_mensual: true,
    foto: true,
  }
}

interface Reporte {
  id: string
  fecha: string
  tipo: string
  sif: boolean | null
  area: string | null
  descripcion: string
}

interface PlanReporte {
  reporte_id: string
  descripcion: string
  fecha_planificada: string | null
  fecha_completado: string | null
}

export async function armarContextoSeguridad(bot: BotPilar, hoy: string): Promise<ContextoPilar> {
  const supabase = createAdminClient()
  const desdeSif = sumarDias(hoy, -VENTANA_SIF_DIAS)
  const ayer = ultimoOperativo(hoy)

  const [ultAcc, recientes, planes, cfg] = await Promise.all([
    supabase
      .from("reportes_seguridad")
      .select("fecha")
      .eq("tipo", "accidente")
      .lte("fecha", hoy)
      .order("fecha", { ascending: false })
      .limit(1),
    supabase
      .from("reportes_seguridad")
      .select("id, fecha, tipo, sif, area, descripcion")
      .gte("fecha", desdeSif)
      .lt("fecha", hoy)
      .order("fecha", { ascending: false }),
    supabase
      .from("reporte_seguridad_planes")
      .select("reporte_id, descripcion, fecha_planificada, fecha_completado"),
    supabase.from("app_config").select("valor").eq("clave", "seguridad_meta_dias").maybeSingle(),
  ])
  const err = ultAcc.error ?? recientes.error ?? planes.error
  if (err) throw new Error(`seguridad: ${err.message}`)

  const fila = cfg.data as { valor: string } | null
  const metaDias = !fila ? META_DIAS_DEFAULT : fila.valor === "" ? null : Number(fila.valor)
  const fechaAcc = (ultAcc.data?.[0] as { fecha: string } | undefined)?.fecha ?? null
  const diasSinAcc = fechaAcc ? diasEntre(fechaAcc.slice(0, 10), hoy) : null

  const reportes = (recientes.data ?? []) as Reporte[]
  const todosPlanes = (planes.data ?? []) as PlanReporte[]
  const conPlan = new Set(todosPlanes.map((p) => p.reporte_id))
  const vencidos = todosPlanes
    .filter((p) => !p.fecha_completado && p.fecha_planificada && p.fecha_planificada < hoy)
    .sort((a, b) => (a.fecha_planificada! < b.fecha_planificada! ? -1 : 1))
  const sifSinPlan = reportes.filter((r) => r.sif && !conPlan.has(r.id))

  const indicadores = [
    indicador("seg_dias_sin_accidentes", "Días sin accidentes", "días", metaDias, "mayor", diasSinAcc, ayer),
    indicador("seg_planes_vencidos", "Planes de seguridad vencidos", "planes", 0, "menor", vencidos.length, ayer),
    indicador("seg_sif_sin_plan", `Reportes SIF sin plan (últimos ${VENTANA_SIF_DIAS} días)`, "reportes", 0, "menor", sifSinPlan.length, ayer),
  ]

  const novedades: string[] = []
  // Reportes cargados desde el último día operativo (en un lunes, el sábado).
  const nuevos = reportes.filter((r) => r.fecha.slice(0, 10) >= ayer)
  if (nuevos.length > 0) {
    const dia = `${DIAS_SEMANA[new Date(ayer + "T12:00:00").getDay()]} ${ddmm(ayer)}`
    // Mismo texto cargado varias veces (pasa con los reportes del chofer): uno solo.
    const vistos = new Set<string>()
    const lineas = nuevos
      .filter((r) => {
        const k = `${r.tipo}|${r.descripcion.trim().toLowerCase()}`
        if (vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      .slice(0, 5)
      .map((r) => {
        const sif = r.sif ? " SIF" : ""
        const area = r.area ? ` en ${r.area}` : ""
        const plan = conPlan.has(r.id) ? "" : " (sin plan)"
        return `• ${TIPO[r.tipo] ?? r.tipo}${sif}${area}: «${corto(r.descripcion)}»${plan}`
      })
    novedades.push(`🆕 *Reportes desde el ${dia}:*`, ...lineas)
  }
  if (vencidos.length > 0) {
    novedades.push(
      `⏰ *Planes vencidos:* ${vencidos
        .slice(0, 4)
        .map((p) => `«${corto(p.descripcion, 50)}» (era para el ${ddmm(p.fecha_planificada!)})`)
        .join(" · ")}`,
    )
  }

  return {
    bot: bot.key,
    pilar: bot.nombre,
    hoy,
    reunion_tipo: bot.reunion_tipo,
    indicadores,
    novedades,
  }
}
