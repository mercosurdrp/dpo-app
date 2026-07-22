"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import {
  ARBOL_SUENO,
  KPI_AGREGACION_MENSUAL,
  agregarMensual,
  esKpiManualMensual,
  type MejorSi,
  type SuenoNodo,
} from "@/lib/sueno/arbol-config"
import { estadoSemaforo } from "@/lib/sueno/semaforo"
import {
  KPI_EXTERNOS,
  esKpiExterno,
  resolverValoresExternos,
} from "@/lib/sueno/externos"
import { otifResumen } from "@/lib/sueno/otif"
import { tiempoPdvAnual, tlpAnual } from "@/lib/tlp/calc"
import { tiempoRutaAnual } from "@/lib/tlp/tiempo-ruta"

/**
 * TLP vivo para el árbol: mismo cálculo que /indicadores/tlp, YTD del año.
 * Tolerante a fallos → null (el caller cae al valor persistido en la tabla).
 */
async function resolverTlpVivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
): Promise<Awaited<ReturnType<typeof tlpAnual>>> {
  try {
    return await tlpAnual(supabase, year)
  } catch {
    return null
  }
}

/** Tiempo en ruta vivo: horas promedio (ponderadas) que dura una salida. */
async function resolverTiempoRutaVivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
): Promise<Awaited<ReturnType<typeof tiempoRutaAnual>>> {
  try {
    return await tiempoRutaAnual(supabase, year)
  } catch {
    return null
  }
}

async function resolverTiempoPdvVivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
): Promise<Awaited<ReturnType<typeof tiempoPdvAnual>>> {
  try {
    return await tiempoPdvAnual(supabase, year)
  } catch {
    return null
  }
}

/**
 * OTIF e In-Full vivos. No pueden salir de `sueno_kpi_refresh`: su denominador
 * (HL solicitados por el PDV) incluye el VRC, que está en la Railway del
 * dashboard Mercosur. Tolerante a fallos → null (cae al valor de la tabla).
 */
async function resolverOtifVivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
): Promise<Awaited<ReturnType<typeof otifResumen>>> {
  try {
    return await otifResumen(supabase, year)
  } catch {
    return null
  }
}

interface ValorRow {
  kpi_key: string
  valor_ytd: number | null
  meta: number | null
  gatillo: number | null
  mejor_si: MejorSi
  nota: string | null
  updated_at: string | null
}

interface MensualRow {
  kpi_key: string
  mes: number
  valor: number
}

/**
 * Valores mensuales del año agrupados por KPI. Tolerante a que la tabla
 * todavía no exista (PGRST205) → mapa vacío.
 */
async function fetchMensualesDelAnio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
): Promise<Map<string, MensualRow[]>> {
  const { data, error } = await supabase
    .from("sueno_kpi_mensual")
    .select("kpi_key,mes,valor")
    .eq("anio", year)
    .order("mes")
  const out = new Map<string, MensualRow[]>()
  if (error) return out
  for (const r of (data ?? []) as MensualRow[]) {
    const list = out.get(r.kpi_key) ?? []
    list.push(r)
    out.set(r.kpi_key, list)
  }
  return out
}

function anioActual(): number {
  return new Date().getFullYear()
}

/**
 * Devuelve los 17 nodos del árbol enriquecidos con los valores cargados para
 * el año. Resiliente: si la tabla aún no existe en esta Supabase (PGRST205),
 * cae a las metas por defecto del config para que la pantalla no rompa.
 */
export async function getSuenoArbol(
  anio?: number,
): Promise<{ data: { anio: number; nodos: SuenoNodo[] } } | { error: string }> {
  try {
    await requireAuth()
    const year = anio ?? anioActual()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("sueno_kpi_valores")
      .select("kpi_key,valor_ytd,meta,gatillo,mejor_si,nota,updated_at")
      .eq("anio", year)

    if (error && error.code !== "PGRST205") return { error: error.message }

    const byKey = new Map<string, ValorRow>()
    for (const r of (data ?? []) as ValorRow[]) byKey.set(r.kpi_key, r)

    // KPIs externos (fuente en deposito-esteban): traen su valor anual en vivo.
    // Si el depósito no responde, se cae al valor persistido en la tabla.
    const externos = await resolverValoresExternos(year)

    // KPIs manuales con carga mensual: el YTD sale de los meses cargados.
    const mensuales = await fetchMensualesDelAnio(supabase, year)

    // TLP y Tiempo en PDV en vivo (mismo cálculo que /indicadores/tlp); si
    // fallan, caen al valor de la tabla.
    // OTIF e In-Full también van en vivo: su denominador incluye el VRC, que
    // vive fuera de Supabase, así que `sueno_kpi_refresh` no puede calcularlos
    // y el valor persistido puede quedar viejo o pisado.
    const [tlpVivo, pdvVivo, rutaVivo, otifVivo] = await Promise.all([
      resolverTlpVivo(supabase, year),
      resolverTiempoPdvVivo(supabase, year),
      resolverTiempoRutaVivo(supabase, year),
      resolverOtifVivo(supabase, year),
    ])

    const nodos: SuenoNodo[] = ARBOL_SUENO.map((cfg) => {
      const row = byKey.get(cfg.key)
      const meta = row?.meta ?? cfg.metaDefault
      const externoVal =
        cfg.key === "tlp"
          ? (tlpVivo?.ytd ?? null)
          : cfg.key === "tiempo_pdv"
            ? (pdvVivo?.ytd ?? null)
            : cfg.key === "tiempo_ruta"
              ? (rutaVivo?.ytd ?? null)
              : cfg.key === "otif"
                ? (otifVivo?.otifYtd ?? null)
                : cfg.key === "in_full"
                  ? (otifVivo?.inFullYtd ?? null)
                  : externos.get(cfg.key)
      const mensualYtd = esKpiManualMensual(cfg.key)
        ? agregarMensual(cfg.key, (mensuales.get(cfg.key) ?? []).map((m) => m.valor))
        : null
      const valorYtd =
        externoVal !== undefined && externoVal !== null
          ? externoVal
          : (mensualYtd ?? row?.valor_ytd ?? null)
      const gatillo = row?.gatillo ?? null
      const mejorSi = row?.mejor_si ?? cfg.mejorSi
      return {
        ...cfg,
        mejorSi,
        anio: year,
        valorYtd,
        meta,
        gatillo,
        nota: row?.nota ?? null,
        updatedAt: row?.updated_at ?? null,
        estado: estadoSemaforo(valorYtd, meta, gatillo, mejorSi),
      }
    })

    return { data: { anio: year, nodos } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

const MES_LABEL = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const EXPLICACION: Record<string, string> = {
  vlc_hl:
    "VLC/HL = costo logístico del mes (Distribución + Almacén, cargados en Planeamiento → Costo por Punto de Venta) ÷ HL vendidos (facturado Chess neto). El YTD pondera por volumen: suma de costos ÷ suma de HL de los meses con costo cargado.",
  otif: "OTIF = In-Full + On Time = (rechazos + stock out + VRL + VRC) ÷ HL solicitados por el PDV. Es el % de volumen PERDIDO: cuanto más bajo, mejor. El denominador son los HL que pidió el PDV: vendidos (facturado Chess neto) + rechazos + VRL + VRC — el rechazo se despachó y volvió, así que no está en «vendidos» y hay que sumarlo. El VRL (reprogramado logístico) arranca el 18/07/2026 y el VRC (comercial) en julio 2026: los meses anteriores no tienen el componente On Time y por eso dan más bajo de lo real.",
  rechazo: "Rechazo = bultos rechazados ÷ bultos DISTRIBUIDOS (%). Por mes, con los bultos rechazados. Ojo: usa otro denominador que OTIF e In-Full (que van sobre los HL solicitados por el PDV), así que no son comparables entre sí.",
  in_full: "In-Full = (rechazos + stock out + cancelaciones) ÷ HL solicitados por el PDV (facturado Chess neto + rechazos + VRL + VRC) (%). Es el % perdido por no entregar completo. Las cancelaciones todavía no tienen fuente en la app y hoy suman 0.",
  tri: "TRI = accidentes REGISTRABLES del año (LTI + MDI + MTI), tomados de los reportes de seguridad cargados como accidente. Los FAI (primeros auxilios) no son registrables: por eso el detalle muestra también los accidentes totales del mes.",
  lti: "LTI = accidentes con días perdidos, tomados de los reportes de seguridad cargados como accidente. El detalle muestra además los accidentes totales de cada mes.",
  n_incidentes: "Cantidad de incidentes de seguridad reportados, por mes.",
  comportamientos: "Cantidad de actos / comportamientos inseguros reportados, por mes.",
  sin_dinero:
    "Cantidad de VECES que los clientes rechazaron por «Sin dinero»: cada cliente × fecha cuenta 1 (los artículos de un mismo rechazo no suman aparte; el mismo cliente en otra fecha vuelve a contar). Por mes, con los bultos rechazados.",
  cerrado:
    "Cantidad de VECES que los clientes rechazaron por «Cerrado»: cada cliente × fecha cuenta 1 (los artículos de un mismo rechazo no suman aparte; el mismo cliente en otra fecha vuelve a contar). Por mes, con los bultos rechazados.",
}

/** Encabezado de la columna "detalle" del modal para KPIs automáticos
 *  cuyo dato acompañante no son bultos rechazados. */
const DETALLE_LABEL: Record<string, string> = {
  vlc_hl: "HL vendidos",
  tri: "Accidentes del mes",
  lti: "Accidentes del mes",
}

export interface SuenoDetalleMes {
  mes: number
  etiqueta: string
  valor: number
  detalle: number | null
  /** 2° dato del mes, opcional (hoy solo `hs_extras`: bultos vendidos). */
  detalle2?: number | null
}

export interface SuenoDetalle {
  kpiKey: string
  label: string
  unidad: string
  fuente: "auto" | "manual"
  explicacion: string
  meses: SuenoDetalleMes[]
  /** Encabezado de la columna "detalle" (default: "Bultos rech."). */
  detalleLabel?: string
  /** Encabezado de la 2ª columna de detalle; sin esto la columna no se dibuja. */
  detalle2Label?: string
}

/** Detalle mensual de un KPI (para el modal que explica el número). */
export async function getSuenoDetalle(
  kpiKey: string,
  anio?: number,
): Promise<{ data: SuenoDetalle } | { error: string }> {
  try {
    await requireAuth()
    const year = anio ?? anioActual()
    const cfg = ARBOL_SUENO.find((n) => n.key === kpiKey)
    if (!cfg) return { error: "KPI desconocido" }

    // TLP: detalle mensual en vivo, mismo cálculo que /indicadores/tlp.
    if (kpiKey === "tlp") {
      const supabaseTlp = await createClient()
      const vivo = await resolverTlpVivo(supabaseTlp, year)
      const meses: SuenoDetalleMes[] = (vivo?.meses ?? []).map((m) => ({
        mes: m.mes,
        etiqueta: MES_LABEL[m.mes - 1] ?? String(m.mes),
        valor: m.tlp,
        detalle: m.viajes,
      }))
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: vivo ? "auto" : "manual",
          explicacion: vivo
            ? "TLP = cajas equivalentes entregadas ÷ horas-hombre en ruta (horas del checklist de retorno × dotación del camión). Mismo cálculo que Indicadores → TLP; el YTD acumula CEq y horas-hombre del año. Metas por ciudad en /indicadores/tlp."
            : "No se pudo calcular el TLP en vivo en este momento.",
          meses,
          detalleLabel: "Viajes",
        },
      }
    }

    // Tiempo en Ruta: detalle mensual en vivo (el insumo del TLP).
    if (kpiKey === "tiempo_ruta") {
      const supabaseRuta = await createClient()
      const vivo = await resolverTiempoRutaVivo(supabaseRuta, year)
      const meses: SuenoDetalleMes[] = (vivo?.meses ?? []).map((m) => ({
        mes: m.mes,
        etiqueta: MES_LABEL[m.mes - 1] ?? String(m.mes),
        valor: m.horas,
        detalle: m.viajes,
      }))
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: vivo ? "auto" : "manual",
          explicacion: vivo
            ? "Tiempo en Ruta = horas que dura una salida, el insumo del TLP (que las multiplica por la dotación). Mide lo mismo que el TLP: desde abril sale del CHECKLIST de retorno (retorno − liberación del camión, que arrancó el 9-abr); antes de abril, de FOXTROT contando solo las rutas limpias, las que se cerraron el mismo día que arrancaron (con todas, enero daría 11,8 hs por salida, un número falso). El promedio es PONDERADO: Σ horas ÷ Σ viajes, así una salida pesa igual venga de la ciudad que venga. Apertura por ciudad en Indicadores → TLP."
            : "No se pudo calcular el tiempo en ruta en vivo en este momento.",
          meses,
          detalleLabel: "Viajes",
        },
      }
    }

    // Tiempo en PDV: detalle mensual en vivo (mismo cálculo que el árbol del TLP).
    if (kpiKey === "tiempo_pdv") {
      const supabasePdv = await createClient()
      const vivo = await resolverTiempoPdvVivo(supabasePdv, year)
      const meses: SuenoDetalleMes[] = (vivo?.meses ?? []).map((m) => ({
        mes: m.mes,
        etiqueta: MES_LABEL[m.mes - 1] ?? String(m.mes),
        valor: m.valor,
        detalle: m.clientes,
      }))
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: vivo ? "auto" : "manual",
          explicacion: vivo
            ? "Tiempo en PDV = minutos que el camión pasa en cada cliente. Foxtrot NO lo mide (las columnas de paradas salen del GPS y llegan vacías), así que se DESPEJA del tiempo en ruta: (tiempo en ruta del checklist − manejo planificado − tramos depósito↔ruta) ÷ clientes visitados. El manejo es el planificado por Foxtrot, no el real: si el camión tardó más en la calle o esperó, ese exceso queda imputado al PDV. Apertura por ciudad en Indicadores → TLP."
            : "No se pudo calcular el tiempo en PDV en vivo en este momento.",
          meses,
          detalleLabel: "Clientes",
        },
      }
    }

    // KPI externo (deposito-esteban): detalle mensual desde la API del depósito.
    if (esKpiExterno(kpiKey)) {
      const ext = KPI_EXTERNOS[kpiKey]
      const resumen = await ext.resumen(year)
      const meses: SuenoDetalleMes[] = (resumen?.meses ?? [])
        .filter((m) => m.valor !== null)
        .map((m) => ({
          mes: m.mes,
          etiqueta: MES_LABEL[m.mes - 1] ?? String(m.mes),
          valor: Number(m.valor ?? 0),
          detalle: m.registros,
          detalle2: m.bultos ?? null,
        }))
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: resumen ? "auto" : "manual",
          explicacion: resumen
            ? ext.explicacion
            : "No se pudo leer la productividad del depósito en este momento.",
          meses,
          detalleLabel: ext.detalleLabel ?? "Registros",
          detalle2Label: ext.detalle2Label,
        },
      }
    }

    // OTIF e In-Full: salen de `otifResumen` (Supabase + Railway), no de la RPC
    // de detalle — su denominador incluye el VRC, que vive fuera de Supabase.
    if (kpiKey === "otif" || kpiKey === "in_full") {
      const esOtif = kpiKey === "otif"
      const supabaseOtif = await createClient()
      const resumen = await otifResumen(supabaseOtif, year)
      const meses: SuenoDetalleMes[] = (resumen?.meses ?? [])
        .filter((m) => (esOtif ? m.otifPct : m.inFullPct) !== null)
        .map((m) => ({
          mes: m.mes,
          etiqueta: MES_LABEL[m.mes - 1] ?? String(m.mes),
          valor: (esOtif ? m.otifPct : m.inFullPct) as number,
          detalle:
            Math.round(
              (m.hlRechazo +
                m.hlStockout +
                (esOtif ? m.hlVrl + (m.hlVrc ?? 0) : 0)) * 10,
            ) / 10,
        }))
      // El VRC entra al denominador de los dos: si no se pudo leer, el aviso va
      // en ambos, no solo en el OTIF.
      const explicacionBase = esOtif ? EXPLICACION.otif : EXPLICACION.in_full
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: "auto",
          explicacion:
            resumen?.vrcDisponible === false
              ? `${explicacionBase}\n\n⚠️ El VRC (reprogramado comercial) no se pudo leer, así que falta en el denominador: el número está apenas por encima del real.`
              : explicacionBase,
          meses,
          detalleLabel: "HL perdidos",
        },
      }
    }

    const explicacion = EXPLICACION[kpiKey]
    if (!explicacion) {
      // KPI manual: el detalle son los meses cargados a mano (sueno_kpi_mensual).
      const supabaseManual = await createClient()
      const { data: rows } = await supabaseManual
        .from("sueno_kpi_mensual")
        .select("mes,valor")
        .eq("kpi_key", kpiKey)
        .eq("anio", year)
        .order("mes")
      const mesesManual: SuenoDetalleMes[] = ((rows ?? []) as {
        mes: number
        valor: number
      }[]).map((r) => ({
        mes: r.mes,
        etiqueta: MES_LABEL[r.mes - 1] ?? String(r.mes),
        valor: Number(r.valor),
        detalle: null,
      }))
      const regla =
        KPI_AGREGACION_MENSUAL[kpiKey] === "suma"
          ? "la suma"
          : "el promedio"
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: "manual",
          explicacion:
            mesesManual.length > 0
              ? `Indicador de carga manual mes a mes: el YTD es ${regla} de los meses cargados. Se edita con el lápiz de la tarjeta (solo admin).`
              : "Indicador de carga manual: todavía no tiene meses cargados. Se cargan con el lápiz de la tarjeta (solo admin).",
          meses: mesesManual,
        },
      }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc("sueno_kpi_detalle", {
      p_kpi: kpiKey,
      p_anio: year,
    })
    if (error && error.code !== "PGRST202") return { error: error.message }

    const meses: SuenoDetalleMes[] = ((data ?? []) as {
      mes: number
      valor: number | null
      detalle: number | null
    }[]).map((r) => ({
      mes: r.mes,
      etiqueta: MES_LABEL[r.mes - 1] ?? String(r.mes),
      valor: Number(r.valor ?? 0),
      detalle: r.detalle == null ? null : Number(r.detalle),
    }))

    return {
      data: {
        kpiKey,
        label: cfg.label,
        unidad: cfg.unidad,
        fuente: "auto",
        explicacion,
        meses,
        detalleLabel: DETALLE_LABEL[kpiKey],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Recalcula los KPIs con fuente automática (YTD) desde las tablas vivas. Solo admin. */
export async function refreshSuenoAuto(
  anio?: number,
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const year = anio ?? anioActual()
    const supabase = await createClient()
    const { error } = await supabase.rpc("sueno_kpi_refresh", { p_anio: year })
    if (error) return { error: error.message }

    // OTIF e In-Full van DESPUÉS y pisan lo que dejó el refresh de arriba: esa
    // función todavía escribe el complemento (98,x) y el árbol los publica como
    // % de pérdida. No pueden salir de una RPC porque su denominador incluye el
    // VRC, que vive en la Railway. Ver 20260720140000_sueno_otif_infull.sql.
    const resumen = await otifResumen(supabase, year)
    const ahora = new Date().toISOString()
    for (const [key, valor] of [
      ["otif", resumen?.otifYtd],
      ["in_full", resumen?.inFullYtd],
    ] as const) {
      if (valor == null) continue
      await supabase
        .from("sueno_kpi_valores")
        .update({ valor_ytd: valor, updated_at: ahora })
        .eq("kpi_key", key)
        .eq("anio", year)
    }

    revalidatePath("/")
    revalidatePath("/mis-capacitaciones")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Valores mensuales cargados de un KPI manual (para precargar el form de edición). */
export async function getSuenoMensual(
  kpiKey: string,
  anio?: number,
): Promise<{ data: { mes: number; valor: number }[] } | { error: string }> {
  try {
    await requireAuth()
    if (!esKpiManualMensual(kpiKey)) return { data: [] }
    const year = anio ?? anioActual()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("sueno_kpi_mensual")
      .select("mes,valor")
      .eq("kpi_key", kpiKey)
      .eq("anio", year)
      .order("mes")
    // PGRST205 = la tabla todavía no existe en esta Supabase → sin meses.
    if (error && error.code !== "PGRST205") return { error: error.message }
    return {
      data: ((data ?? []) as { mes: number; valor: number }[]).map((r) => ({
        mes: r.mes,
        valor: Number(r.valor),
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Guarda los valores mensuales de un KPI manual y recalcula su YTD
 * (promedio o suma según el KPI). Un valor null borra el mes. Solo admin.
 */
export async function setSuenoMensual(input: {
  kpi_key: string
  anio?: number
  valores: { mes: number; valor: number | null }[]
}): Promise<{ ok: true; valorYtd: number | null } | { error: string }> {
  try {
    const profile = await requireRole(["admin"])
    const year = input.anio ?? anioActual()

    if (!esKpiManualMensual(input.kpi_key)) {
      return { error: "Este KPI no admite carga mensual manual" }
    }
    if (input.valores.some((v) => !Number.isInteger(v.mes) || v.mes < 1 || v.mes > 12)) {
      return { error: "Mes inválido" }
    }

    const supabase = await createClient()

    const aGuardar = input.valores.filter((v) => v.valor != null)
    const aBorrar = input.valores.filter((v) => v.valor == null).map((v) => v.mes)

    if (aGuardar.length > 0) {
      const { error } = await supabase.from("sueno_kpi_mensual").upsert(
        aGuardar.map((v) => ({
          kpi_key: input.kpi_key,
          anio: year,
          mes: v.mes,
          valor: v.valor as number,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "kpi_key,anio,mes" },
      )
      if (error) return { error: error.message }
    }

    if (aBorrar.length > 0) {
      const { error } = await supabase
        .from("sueno_kpi_mensual")
        .delete()
        .eq("kpi_key", input.kpi_key)
        .eq("anio", year)
        .in("mes", aBorrar)
      if (error) return { error: error.message }
    }

    // Recalcular el YTD desde lo que quedó en la tabla y persistirlo en
    // sueno_kpi_valores (así el resto de la app sigue leyendo valor_ytd).
    const { data: rows, error: readError } = await supabase
      .from("sueno_kpi_mensual")
      .select("valor")
      .eq("kpi_key", input.kpi_key)
      .eq("anio", year)
    if (readError) return { error: readError.message }

    const valorYtd = agregarMensual(
      input.kpi_key,
      ((rows ?? []) as { valor: number }[]).map((r) => Number(r.valor)),
    )

    const { error: upsertError } = await supabase.from("sueno_kpi_valores").upsert(
      {
        kpi_key: input.kpi_key,
        anio: year,
        valor_ytd: valorYtd,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kpi_key,anio" },
    )
    if (upsertError) return { error: upsertError.message }

    revalidatePath("/")
    revalidatePath("/mis-capacitaciones")
    return { ok: true, valorYtd }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Carga/edita el valor de un KPI. Solo admin. */
export async function setSuenoValor(input: {
  kpi_key: string
  anio?: number
  valor_ytd?: number | null
  meta?: number | null
  gatillo?: number | null
  mejor_si?: MejorSi
  nota?: string | null
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin"])
    const year = input.anio ?? anioActual()

    // Validar que el kpi_key exista en la topología
    if (!ARBOL_SUENO.some((n) => n.key === input.kpi_key)) {
      return { error: "KPI desconocido" }
    }

    const supabase = await createClient()
    const { error } = await supabase.from("sueno_kpi_valores").upsert(
      {
        kpi_key: input.kpi_key,
        anio: year,
        valor_ytd: input.valor_ytd ?? null,
        meta: input.meta ?? null,
        gatillo: input.gatillo ?? null,
        ...(input.mejor_si ? { mejor_si: input.mejor_si } : {}),
        nota: input.nota ?? null,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kpi_key,anio" },
    )

    if (error) return { error: error.message }

    revalidatePath("/")
    revalidatePath("/mis-capacitaciones")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
