"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import { requireAuth, requireRole } from "@/lib/session"
// leerClave/escribirClave son helpers genéricos de app_config (nacieron en
// Clima pero no tienen nada específico de ese módulo). Misma razón que allá:
// acá no se puede aplicar DDL, así que los datos manuales van a app_config.
import { leerClave, escribirClave } from "@/lib/clima-store"
import {
  HUELLA_PARAMS_DEFAULT,
  esAutoelevador,
  normalizarPlanta,
  type FuenteDato,
  type HuellaAnual,
  type HuellaManualMes,
  type HuellaMes,
  type HuellaParams,
} from "@/lib/huella/definiciones"

type Result<T> = { data: T } | { error: string }

const CLAVE_PARAMS = "huella:params"
const claveManual = (anio: number) => `huella:manual:${anio}`

const PASO = 1000

/** Lee paginando (PostgREST corta en 1000 filas). */
async function fetchAll<T>(
  q: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = []
  for (let desde = 0; ; desde += PASO) {
    const { data, error } = await q(desde, desde + PASO - 1)
    if (error) return { error: error.message }
    const filas = (data ?? []) as T[]
    rows.push(...filas)
    if (filas.length < PASO) break
  }
  return { rows }
}

function diasDelMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number)
  return new Date(a, m, 0).getDate()
}

export async function getHuellaAnual(anio: number): Promise<Result<HuellaAnual>> {
  await requireAuth()

  const supabase = createAdminClient()
  const desde = `${anio}-01-01`
  const hasta = `${anio}-12-31`

  const [params, manual, comb, ventas] = await Promise.all([
    leerClave<Partial<HuellaParams>>(CLAVE_PARAMS),
    leerClave<Record<string, HuellaManualMes>>(claveManual(anio)),
    fetchAll<{ fecha: string; dominio: string | null; litros: number | null; tipo_combustible: string | null }>(
      (d, h) =>
        supabase
          .from("registro_combustible")
          .select("fecha, dominio, litros, tipo_combustible")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(d, h),
    ),
    fetchAll<{ fecha: string; total_hl: number | null }>((d, h) =>
      supabase
        .from("ventas_diarias")
        .select("fecha, total_hl")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(d, h),
    ),
  ])

  if ("error" in comb) return { error: `registro_combustible: ${comb.error}` }
  if ("error" in ventas) return { error: `ventas_diarias: ${ventas.error}` }

  const p: HuellaParams = { ...HUELLA_PARAMS_DEFAULT, ...(params ?? {}) }
  const man: Record<string, HuellaManualMes> = manual ?? {}

  // Flete contratado: la base de acarreo-rdf es otro proyecto Supabase.
  const acarreo = createAcarreoClient()
  let viajes: Array<{ fecha: string; planta: string | null }> = []
  if (acarreo) {
    const res = await fetchAll<{ fecha: string; planta: string | null }>((d, h) =>
      acarreo.from("viajes").select("fecha, planta").gte("fecha", desde).lte("fecha", hasta).range(d, h),
    )
    if ("error" in res) return { error: `viajes (acarreo): ${res.error}` }
    viajes = res.rows
  }

  // ---- Agregados por mes ----
  const mesDe = (f: string) => f.slice(0, 7)
  const hlMes = new Map<string, number>()
  for (const v of ventas.rows) {
    const m = mesDe(v.fecha)
    hlMes.set(m, (hlMes.get(m) ?? 0) + (Number(v.total_hl) || 0))
  }

  const gasoilMes = new Map<string, number>() // flota de ruta, sin urea ni autoelevadores
  const autoMes = new Map<string, number>() // autoelevadores medidos
  for (const r of comb.rows) {
    const litros = Number(r.litros) || 0
    if (!litros) continue
    if ((r.tipo_combustible || "").toLowerCase() === "urea") continue
    const m = mesDe(r.fecha)
    if (esAutoelevador(r.dominio)) autoMes.set(m, (autoMes.get(m) ?? 0) + litros)
    else gasoilMes.set(m, (gasoilMes.get(m) ?? 0) + litros)
  }

  const fleteMes = new Map<string, { viajes: number; km: number }>()
  for (const v of viajes) {
    const m = mesDe(v.fecha)
    const km = p.kmPlantas[normalizarPlanta(v.planta)] ?? p.kmDefault
    const acc = fleteMes.get(m) ?? { viajes: 0, km: 0 }
    acc.viajes += 1
    acc.km += km
    fleteMes.set(m, acc)
  }

  // ---- Meses a mostrar: hasta el mes actual si es el año en curso ----
  const hoy = new Date()
  const ultimoMes = anio === hoy.getFullYear() ? hoy.getMonth() + 1 : anio < hoy.getFullYear() ? 12 : 0

  const meses: HuellaMes[] = []
  for (let n = 1; n <= ultimoMes; n++) {
    const mes = `${anio}-${String(n).padStart(2, "0")}`
    const hl = hlMes.get(mes) ?? 0
    const m = man[mes] ?? {}

    // Scope 1 — gasoil flota: factura > registro confiable > máx(registro, estimado por HL)
    const registrado = gasoilMes.get(mes) ?? 0
    const estimado = hl * p.ratioLitrosHl
    let gasoilFlotaL: number
    let gasoilFuente: FuenteDato
    if (m.gasoilFacturaL != null) {
      gasoilFlotaL = m.gasoilFacturaL
      gasoilFuente = "factura"
    } else if (mes >= p.gasoilConfiableDesde) {
      gasoilFlotaL = registrado
      gasoilFuente = "registrado"
    } else if (registrado >= estimado) {
      gasoilFlotaL = registrado
      gasoilFuente = registrado > 0 ? "registrado" : "sin dato"
    } else {
      gasoilFlotaL = estimado
      gasoilFuente = "estimado"
    }

    // Scope 1 — autoelevadores: medido desde que se registra; antes, estimado
    // con las horas de horómetro típicas (h/día × l/h × días del mes).
    let autoL: number
    let autoFuente: FuenteDato
    if (m.autoelevadorL != null) {
      autoL = m.autoelevadorL
      autoFuente = "factura"
    } else if (mes >= p.autoMedidoDesde) {
      autoL = autoMes.get(mes) ?? 0
      autoFuente = "registrado"
    } else {
      autoL = p.autoHorasDia * p.autoLitrosHora * diasDelMes(mes)
      autoFuente = "estimado"
    }

    const refrigeranteKg = Number(m.refrigeranteKg) || 0
    const s1 = ((gasoilFlotaL + autoL) * p.feGasoil + refrigeranteKg * p.gwpRefrigerante) / 1000

    // Scope 2 — electricidad (falta hasta que se carguen los kWh del mes)
    const kwh = m.kwh != null ? Number(m.kwh) : null
    const s2 = kwh != null ? (kwh * p.feKwh) / 1000 : null

    // Scope 3 — flete de abastecimiento
    const flete = fleteMes.get(mes) ?? { viajes: 0, km: 0 }
    const s3 = (flete.km * (p.fleteConsumoL100 / 100) * p.feGasoil) / 1000

    const totalConocido = s1 + (s2 ?? 0) + s3
    meses.push({
      mes,
      hl,
      gasoilFlotaL,
      gasoilFuente,
      autoL,
      autoFuente,
      refrigeranteKg,
      s1,
      kwh,
      s2,
      fleteViajes: flete.viajes,
      fleteKm: flete.km,
      s3,
      totalConocido,
      intensidadKgHl: hl > 0 ? (totalConocido * 1000) / hl : null,
    })
  }

  const tot = meses.reduce(
    (a, x) => ({
      hl: a.hl + x.hl,
      s1: a.s1 + x.s1,
      s2: x.s2 != null ? (a.s2 ?? 0) + x.s2 : a.s2,
      s3: a.s3 + x.s3,
      totalConocido: a.totalConocido + x.totalConocido,
      mesesSinKwh: a.mesesSinKwh + (x.s2 == null ? 1 : 0),
      fleteViajes: a.fleteViajes + x.fleteViajes,
      fleteKm: a.fleteKm + x.fleteKm,
    }),
    { hl: 0, s1: 0, s2: null as number | null, s3: 0, totalConocido: 0, mesesSinKwh: 0, fleteViajes: 0, fleteKm: 0 },
  )

  return {
    data: {
      anio,
      meses,
      totales: {
        ...tot,
        intensidadKgHl: tot.hl > 0 ? (tot.totalConocido * 1000) / tot.hl : null,
      },
      params: p,
      manual: man,
    },
  }
}

/** Guarda los datos manuales de un mes (kWh, refrigerante, gasoil por factura). */
export async function guardarHuellaManualMes(
  anio: number,
  mes: string,
  datos: HuellaManualMes,
): Promise<Result<true>> {
  const profile = await requireRole(["admin", "supervisor"])
  if (!/^\d{4}-\d{2}$/.test(mes)) return { error: "Mes inválido" }

  const actual = (await leerClave<Record<string, HuellaManualMes>>(claveManual(anio))) ?? {}
  const limpio: HuellaManualMes = {
    kwh: datos.kwh != null ? Number(datos.kwh) : null,
    refrigeranteKg: datos.refrigeranteKg != null ? Number(datos.refrigeranteKg) : null,
    gasoilFacturaL: datos.gasoilFacturaL != null ? Number(datos.gasoilFacturaL) : null,
    autoelevadorL: datos.autoelevadorL != null ? Number(datos.autoelevadorL) : null,
    notas: datos.notas ?? null,
  }
  for (const k of ["kwh", "refrigeranteKg", "gasoilFacturaL", "autoelevadorL"] as const) {
    if (limpio[k] != null && !Number.isFinite(limpio[k])) return { error: `Valor inválido en ${k}` }
  }
  actual[mes] = limpio
  const res = await escribirClave(claveManual(anio), actual, profile.id)
  return "error" in res ? res : { data: true }
}

/** Guarda los factores/parámetros del cálculo. */
export async function guardarHuellaParams(params: HuellaParams): Promise<Result<true>> {
  const profile = await requireRole(["admin", "supervisor"])
  const numericos: Array<keyof HuellaParams> = [
    "feGasoil",
    "feKwh",
    "fleteConsumoL100",
    "kmDefault",
    "ratioLitrosHl",
    "autoLitrosHora",
    "autoHorasDia",
    "gwpRefrigerante",
  ]
  for (const k of numericos) {
    if (!Number.isFinite(Number(params[k])) || Number(params[k]) < 0)
      return { error: `Parámetro inválido: ${k}` }
  }
  const res = await escribirClave(CLAVE_PARAMS, params, profile.id)
  return "error" in res ? res : { data: true }
}
