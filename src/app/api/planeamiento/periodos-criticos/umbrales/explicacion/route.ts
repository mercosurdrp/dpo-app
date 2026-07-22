import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

/**
 * De dónde sale cada umbral del calendario de períodos críticos.
 *
 * Los umbrales están guardados como números sueltos en `pc_umbrales` y no se
 * explican solos: en una auditoría hay que poder decir por qué 792 HL y no 800.
 * Este endpoint recalcula, sobre el año base (el anterior al vigente), en qué
 * percentil cae cada umbral y cuántos días lo superan.
 *
 * No propone valores ni corrige nada: describe los que están cargados. Si
 * alguien cambió un umbral a mano, acá se ve en qué percentil quedó.
 *
 * El de clientes se contrasta además contra la CAPACIDAD DE FLOTA (camiones
 * activos × clientes por camión al p90): ese umbral no es estadístico sino
 * operativo — es el punto donde se acaban los camiones.
 */

interface Percentiles {
  p50: number
  p75: number
  p90: number
  p95: number
  max: number
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
    .from("pc_volumen_diario")
    .select("fecha,bultos_distribuidos,clientes_distribuidos,otif_distribuido")
    .gte("fecha", `${anioBase}-01-01`)
    .lte("fecha", `${anioBase}-12-31`)
    .order("fecha", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Domingo no hay reparto: incluirlo correría todos los percentiles hacia
  // abajo y haría parecer excepcional un día normal.
  const habiles = (dias ?? []).filter((d) => {
    const dow = new Date(d.fecha + "T12:00:00").getDay()
    return dow !== 0 && num(d.bultos_distribuidos) > 0
  })

  const serieHl = habiles.map((d) => num(d.bultos_distribuidos))
  const serieCli = habiles
    .map((d) => num(d.clientes_distribuidos))
    .filter((v) => v > 0)
  const serieRech = habiles
    .filter((d) => d.otif_distribuido !== null)
    .map((d) => 1 - num(d.otif_distribuido))

  const pHl = percentiles(serieHl)
  const pCli = percentiles(serieCli)

  // Capacidad de flota: cuántos clientes entran en los camiones activos.
  const { data: flota } = await supabase
    .from("dim_flota_capacidad")
    .select("dominio")
    .eq("activo", true)
  const camionesActivos = (flota ?? []).length

  // Clientes por camión del año base, al p90 (día exigido, no el promedio).
  const { data: ocup } = await supabase
    .from("ocupacion_bodega_diaria")
    .select("fecha,patente")
    .gte("fecha", `${anioBase}-01-01`)
    .lte("fecha", `${anioBase}-12-31`)

  const camionesPorFecha = new Map<string, Set<string>>()
  for (const o of ocup ?? []) {
    const set = camionesPorFecha.get(o.fecha) ?? new Set<string>()
    set.add(o.patente)
    camionesPorFecha.set(o.fecha, set)
  }
  const clientesPorCamion: number[] = []
  for (const d of habiles) {
    const cam = camionesPorFecha.get(d.fecha)?.size ?? 0
    const cli = num(d.clientes_distribuidos)
    if (cam > 0 && cli > 0) clientesPorCamion.push(cli / cam)
  }
  const pCpc = percentiles(clientesPorCamion)
  const capacidadClientes =
    camionesActivos > 0 && pCpc.p90 > 0
      ? Math.round(camionesActivos * pCpc.p90)
      : null

  const umbralPico = num(umb.vol_pico)
  const umbralClientes = num(umb.clientes)
  const umbralRechazo = num(umb.otif_min)

  return NextResponse.json({
    anioBase,
    diasBase: habiles.length,
    volumen: {
      umbralPico,
      umbralAlto: num(umb.vol_alto),
      umbralMedio: num(umb.vol_medio),
      percentiles: pHl,
      percentilDelPico: percentilDe(serieHl, umbralPico),
      diasSuperanPico: serieHl.filter((v) => v >= umbralPico).length,
      // Los umbrales alto y medio se derivaron del pico, no de percentiles
      // propios: se declara para que nadie los defienda como estadísticos.
      derivados: {
        altoPctDelPico: umbralPico > 0 ? Math.round((num(umb.vol_alto) / umbralPico) * 100) : 0,
        medioPctDelPico: umbralPico > 0 ? Math.round((num(umb.vol_medio) / umbralPico) * 100) : 0,
      },
    },
    clientes: {
      umbral: umbralClientes,
      percentiles: pCli,
      percentilDelUmbral: percentilDe(serieCli, umbralClientes),
      diasSuperan: serieCli.filter((v) => v > umbralClientes).length,
      capacidadFlota: {
        camionesActivos,
        clientesPorCamionP90: Math.round(pCpc.p90 * 10) / 10,
        clientesPorCamionMax: Math.round(pCpc.max * 10) / 10,
        capacidadClientes,
      },
    },
    rechazo: {
      umbral: umbralRechazo,
      metaOficial: 0.017,
      promedioBase:
        serieRech.length > 0
          ? Math.round((serieRech.reduce((a, b) => a + b, 0) / serieRech.length) * 10000) / 10000
          : null,
      diasSuperan: serieRech.filter((v) => v > umbralRechazo).length,
    },
    minTriggers: num(umb.min_triggers),
  })
}
