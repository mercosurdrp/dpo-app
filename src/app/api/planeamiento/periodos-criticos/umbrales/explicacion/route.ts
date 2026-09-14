import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import {
  cantidadP,
  intensidadDia,
  type DiaClasificable,
} from "@/app/(dashboard)/planeamiento/periodos-criticos/_lib/intensidad"

export const dynamic = "force-dynamic"

/**
 * De dónde sale cada umbral del calendario de períodos críticos, y qué da el
 * cruce de los tres con esos umbrales.
 *
 * Los umbrales están guardados como números sueltos en `pc_umbrales` y no se
 * explican solos: en una auditoría hay que poder decir por qué 648 HL y no 720,
 * o por qué 2% de rechazo. Este endpoint recalcula, sobre el año base (el
 * anterior al vigente), en qué percentil cae cada umbral, cuántos días dan esa
 * P, y cuántos días juntan PPP / PP / P.
 *
 * No propone valores ni corrige nada: describe los que están cargados. Lee la
 * misma vista que el calendario, así los conteos coinciden con lo que se ve.
 */

interface Percentiles {
  p50: number
  p75: number
  p90: number
  p95: number
  max: number
}

type Fila = DiaClasificable & {
  fecha: string
  dow: number
  hl: number
  otif_estimado: number
  pct_ausentismo: number
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Percentil (0-100) en el que cae `valor` dentro de la serie. */
function percentilDe(serie: number[], valor: number): number {
  if (serie.length === 0) return 0
  const debajo = serie.filter((v) => v < valor).length
  return Math.round((debajo / serie.length) * 100)
}

function percentiles(serie: number[]): Percentiles {
  if (serie.length === 0) return { p50: 0, p75: 0, p90: 0, p95: 0, max: 0 }
  const s = [...serie].sort((a, b) => a - b)
  const en = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return {
    p50: en(0.5),
    p75: en(0.75),
    p90: en(0.9),
    p95: en(0.95),
    max: s[s.length - 1],
  }
}

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()

  const [{ data: cfg }, { data: umb }] = await Promise.all([
    supabase.from("pc_config").select("anio_vigente").eq("id", 1).single(),
    supabase.from("pc_umbrales").select("*").eq("id", 1).single(),
  ])
  if (!cfg || !umb) {
    return NextResponse.json({ error: "Falta configuración" }, { status: 500 })
  }

  // El calendario se arma sobre el año ANTERIOR al vigente (R3.4.1: "volumen
  // diario vendido del año anterior").
  const anioBase = Number(cfg.anio_vigente) - 1

  const { data: dias, error } = await supabase
    .from("v_pc_calendario_dia_multianio")
    .select("fecha, dow, hl, otif_estimado, pct_ausentismo, trigger_vol, trigger_otif, trigger_aus")
    .eq("anio", anioBase)
    .order("fecha", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Domingo no hay reparto: incluirlo correría todos los percentiles hacia
  // abajo y haría parecer excepcional un día normal.
  const habiles = ((dias ?? []) as unknown as Fila[]).filter(
    (d) => Number(d.dow) !== 0 && num(d.hl) > 0,
  )

  const serieHl = habiles.map((d) => num(d.hl))
  const serieRech = habiles.map((d) => num(d.otif_estimado))
  const serieAus = habiles.map((d) => num(d.pct_ausentismo))

  // Distribución del ausentismo diario: viene en escalones (1 de 30, 2 de 30…),
  // así que se lista por valor y no por percentil.
  const ausPorValor = new Map<number, number>()
  for (const v of serieAus) {
    const k = Math.round(v * 10000) / 10000
    ausPorValor.set(k, (ausPorValor.get(k) ?? 0) + 1)
  }

  const umbralPico = num(umb.vol_pico)
  const umbralRechazo = num(umb.otif_min)
  const umbralAus = num(umb.ausentismo_max)

  const cuenta = (f: (d: Fila) => boolean) => habiles.filter(f).length
  const fechas = (f: (d: Fila) => boolean) => habiles.filter(f).map((d) => d.fecha)

  return NextResponse.json({
    anioBase,
    diasBase: habiles.length,
    volumen: {
      umbralPico,
      percentiles: percentiles(serieHl),
      percentilDelPico: percentilDe(serieHl, umbralPico),
      diasSuperanPico: cuenta((d) => d.trigger_vol),
      // El umbral no sale de un percentil: es la capacidad física de la flota.
      capacidad: {
        camiones: num(umb.camiones),
        hlPorCamion: num(umb.hl_por_camion),
        pctOcupacion: num(umb.pct_ocupacion),
      },
    },
    rechazo: {
      umbral: umbralRechazo,
      metaOficial: 0.017,
      percentiles: percentiles(serieRech),
      percentilDelUmbral: percentilDe(serieRech, umbralRechazo),
      promedioBase:
        serieRech.length > 0
          ? Math.round((serieRech.reduce((a, b) => a + b, 0) / serieRech.length) * 10000) / 10000
          : null,
      diasSuperan: cuenta((d) => d.trigger_otif),
    },
    ausentismo: {
      umbral: umbralAus,
      distribucion: [...ausPorValor.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([valor, dias]) => ({ valor, dias })),
      diasSuperan: cuenta((d) => d.trigger_aus),
    },
    cruce: {
      ppp: cuenta((d) => intensidadDia(d) === "CRITICO"),
      pp: cuenta((d) => intensidadDia(d) === "ATENCION"),
      p: cuenta((d) => cantidadP(d) === 1),
      fechasPPP: fechas((d) => intensidadDia(d) === "CRITICO"),
    },
  })
}
