// Lo que "ve" el bot de Planeamiento: la cobertura de stock por SKU de la
// rutina de Pronóstico (DPO Planeamiento 3.2), con la MISMA action que la
// pantalla (`getDatosPronostico`: stock kardex + venta promedio 15 días de
// chess-dashboard, clasificada contra la política de inventario).
//   - SKUs sin stock y con venta (quiebre): meta 0.
//   - % de SKUs debajo de la cobertura mínima de su segmento.
//   - % de SKUs encima de la máxima (informativo: sin meta cargada).
// La lista de SKUs en quiebre o con cobertura crítica va en `novedades`.

import { runAsSystem } from "@/lib/system-context"
import { getDatosPronostico } from "@/actions/pronostico"
import { estadoIndicador } from "@/lib/reuniones/semaforo"
import type { ContextoPilar, IndicadorContexto } from "./contexto"
import type { BotPilar } from "./tipos"

/**
 * Tope de SKUs debajo del mínimo. La política no fija uno: 5 % es el punto de
 * partida para calibrar (cambiarlo acá si Planeamiento define otro).
 */
const META_PCT_DEBAJO = 5
/** Venta mínima para que un SKU sin stock cuente como quiebre (bultos/día). */
const VPD_MIN_QUIEBRE = 0.5
/** Cobertura por debajo de la cual se lista el SKU aunque tenga stock. */
const DIAS_CRITICOS = 2

const num = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)
const r1 = (n: number) => Math.round(n * 10) / 10

function indicador(
  id: string,
  nombre: string,
  unidad: string,
  meta: number | null,
  valor: number | null,
  fecha: string,
): IndicadorContexto {
  const estado = estadoIndicador({ id, meta, mejor_si: "menor" }, valor)
  const punto = valor == null ? null : { fecha, valor, texto: null, estado }
  return {
    id,
    nombre,
    unidad,
    meta,
    gatillo: null,
    mejor_si: "menor",
    ultimo: punto,
    serie: punto ? [punto] : [],
    mtd: valor,
    mtd_texto: null,
    estado_mtd: estado,
    racha_fuera: 0,
    racha_toda_la_serie: false,
    // Foto del stock de hoy: se juzga por el valor actual, sin racha.
    umbral_mensual: true,
    foto: true,
  }
}

export async function armarContextoPlaneamiento(bot: BotPilar, hoy: string): Promise<ContextoPilar> {
  const res = await runAsSystem("bot-pilar", () => getDatosPronostico())
  if (!("data" in res)) throw new Error(`getDatosPronostico: ${res.error}`)
  const d = res.data
  if (!d.resumen) throw new Error(d.coberturaError ?? "Sin datos de cobertura de chess-dashboard")

  const quiebres = d.cobertura
    .filter((c) => (c.stockBultos ?? 0) <= 0 && (c.vpdBultos ?? 0) >= VPD_MIN_QUIEBRE)
    .sort((a, b) => (b.vpdBultos ?? 0) - (a.vpdBultos ?? 0))
  const criticos = d.cobertura
    .filter((c) => (c.stockBultos ?? 0) > 0 && c.coberturaDias != null && c.coberturaDias < DIAS_CRITICOS)
    .sort((a, b) => (a.coberturaDias ?? 0) - (b.coberturaDias ?? 0))

  const indicadores = [
    indicador("plan_quiebres", "SKUs sin stock con venta", "SKUs", 0, quiebres.length, hoy),
    indicador("plan_pct_debajo", "SKUs debajo de la cobertura mínima", "%", META_PCT_DEBAJO, r1(d.resumen.pctDebajo), hoy),
    indicador("plan_pct_encima", "SKUs encima de la cobertura máxima", "%", null, r1(d.resumen.pctEncima), hoy),
  ]

  const nombre = (s: string) => s.replace(/\s+/g, " ").trim()
  const novedades: string[] = []
  if (quiebres.length > 0) {
    novedades.push(
      `🚨 *Sin stock y con venta:* ${quiebres
        .slice(0, 6)
        .map((c) => `${nombre(c.descripcion)} (vende ${num(c.vpdBultos ?? 0)} bul/día)`)
        .join(" · ")}${quiebres.length > 6 ? ` y ${quiebres.length - 6} más` : ""}`,
    )
  }
  if (criticos.length > 0) {
    novedades.push(
      `⚠️ *Cobertura de menos de ${DIAS_CRITICOS} días:* ${criticos
        .slice(0, 5)
        .map((c) => `${nombre(c.descripcion)} (${num(c.coberturaDias ?? 0)} días)`)
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
