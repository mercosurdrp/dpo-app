// Lo que "ve" el bot de Flota. No tiene grilla de reunión: lee la MISMA
// action que la tarjeta de Flota y Ruteo de la reunión de logística
// (`getFlotaRuteoReunion`, mismos números que el tablero de Indicadores de
// Flota) y la adherencia al checklist del mes. Los KPIs son acumulados del
// mes, así que se juzgan sobre el acumulado (umbral_mensual) y no tienen
// racha diaria. Lo accionable del día (unidades paradas, services próximos,
// checklists que faltaron) va en `novedades`, armadas por el código.

import { createAdminClient } from "@/lib/supabase/admin"
import { runAsSystem } from "@/lib/system-context"
import { getFlotaRuteoReunion } from "@/actions/reuniones-flota-ruteo"
import { calcularAdherenciaChecklist } from "@/lib/vehiculos/checklist-adherencia"
import { esFeriado } from "@/lib/feriados-ar"
import { estadoIndicador } from "@/lib/reuniones/semaforo"
import type { ContextoPilar, IndicadorContexto } from "./contexto"
import type { BotPilar } from "./tipos"

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

const num = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nombrePropio = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

function diaAnterior(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Último día con reparto antes de hoy: sin domingos ni feriados. */
function ultimoOperativo(hoy: string): string {
  let d = diaAnterior(hoy)
  while (new Date(d + "T12:00:00").getDay() === 0 || esFeriado(d)) d = diaAnterior(d)
  return d
}

function indicador(
  id: string,
  nombre: string,
  unidad: string | null,
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
    umbral_mensual: true,
  }
}

export async function armarContextoFlota(bot: BotPilar, hoy: string): Promise<ContextoPilar> {
  const supabase = createAdminClient()
  const res = await runAsSystem("bot-pilar", () => getFlotaRuteoReunion(hoy))
  if (!("data" in res)) throw new Error(`getFlotaRuteoReunion: ${res.error}`)
  const f = res.data.flota

  const { data: metasRows } = await supabase
    .from("flota_metas")
    .select("kpi, meta")
    .in("kpi", ["utilizacion", "checklist_adherencia"])
  const meta = (kpi: string) => {
    const m = (metasRows as Array<{ kpi: string; meta: number | null }> | null)?.find((x) => x.kpi === kpi)
    return m?.meta == null ? null : Number(m.meta)
  }

  // Adherencia al checklist del mes (hasta ayer: el día en curso no se exige).
  const ayer = ultimoOperativo(hoy)
  const adh = await calcularAdherenciaChecklist(supabase, `${hoy.slice(0, 7)}-01`, hoy).catch(
    () => null,
  )

  const indicadores = [
    indicador("flota_disponibilidad", "Disponibilidad", "%", f.disponibilidadTarget, "mayor", r1(f.disponibilidadPct), ayer),
    indicador("flota_utilizacion", "Utilización", "%", meta("utilizacion"), "mayor", r1(f.utilizacionPct), ayer),
    indicador("flota_combustible", "Rendimiento de combustible", "km/l", f.combustibleTarget, "mayor", f.combustibleKml, ayer),
    indicador("flota_services_vencidos", "Services vencidos", "services", f.servicesTarget ?? 0, "menor", f.servicesVencidos, ayer),
    indicador("flota_checklist", "Adherencia al checklist", "%", meta("checklist_adherencia"), "mayor", r1(adh?.pct ?? null), ayer),
  ]

  const novedades: string[] = []
  if (f.noDisponiblesHoy.length > 0) {
    novedades.push(
      `🚫 *Paradas hoy:* ${f.noDisponiblesHoy
        .map((u) => `${u.dominio} (${u.motivo ?? u.causa}, ${u.diasParada} ${u.diasParada === 1 ? "día" : "días"})`)
        .join(" · ")}`,
    )
  }
  if (f.proximosServices.length > 0) {
    novedades.push(
      `🔜 *Services próximos:* ${f.proximosServices
        .slice(0, 5)
        .map((s) => {
          const falta = s.kmRestante != null
            ? `faltan ${num(s.kmRestante)} km`
            : s.diasRestantes != null ? `faltan ${s.diasRestantes} días` : "a programar"
          return `${s.dominio} (${falta}${s.proximaFecha ? `, ~${ddmm(s.proximaFecha)}` : ""})`
        })
        .join(" · ")}`,
    )
  }
  const faltaron = (adh?.faltantes ?? []).filter((x) => x.fecha === ayer)
  if (faltaron.length > 0) {
    const dia = `${DIAS_SEMANA[new Date(ayer + "T12:00:00").getDay()]} ${ddmm(ayer)}`
    const que = { retorno: "sin retorno", liberacion: "sin liberación", ambos: "sin ninguno" } as const
    novedades.push(
      `📋 *Checklist del ${dia}:* ${faltaron
        .map((x) => `${x.dominio} ${que[x.falta]}${x.chofer ? ` (${nombrePropio(x.chofer)})` : ""}`)
        .join(" · ")}`,
    )
  }
  if (f.combustibleCargasSinRegistrar > 0) {
    novedades.push(
      `⛽ ${f.combustibleCargasSinRegistrar} ${f.combustibleCargasSinRegistrar === 1 ? "carga" : "cargas"} de combustible sin registrar en el mes: el km/l se calcula sin esos tramos.`,
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
