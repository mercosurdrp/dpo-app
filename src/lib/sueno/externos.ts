/**
 * KPIs del árbol del Sueño cuya fuente vive FUERA de dpo-app (en
 * deposito-esteban / WMS). En vez de la RPC `sueno_kpi_detalle`, su valor
 * anual y su detalle mensual se traen por API del depósito.
 *
 * Hoy: `prod_picking`      (Bul/HH) ← /api/productividad/picking-resumen
 *      `wnp`               (HL/HH)  ← /api/productividad/wnp-resumen
 *      `precision_picking` (%)      ← /api/productividad/precision-resumen
 *      `wqi`               (PPM)    ← /api/productividad/wqi-resumen
 *      `dqi`               (PPM)    ← /api/dqi (el mismo de /indicadores/dqi)
 *      `tqi`               (PPM)    ← /api/indicadores (dpo_base): Reporte DPO
 *      `fgli`              (PPM)      2026, UNA llamada por año. Volumen
 *                                     AFECTADO, sin faltantes de entrega.
 *
 * 🚨 Desde el 2026-09-17 TQI y FGLI siguen la definición del Reporte DPO 2026
 * (TQI = DC-K1279, FGLI = DC-K0030) tal como la reproduce el tablero del
 * depósito: la rotura de almacén es el volumen AFECTADO (lo que entra a
 * reempaque aunque se recupere), así que WQI + DQI = TQI y TQI + vencidos +
 * diferencias de inventario = FGLI. Antes (14/09 al 17/09) medían merma final
 * y daban ~3× menos; esa versión queda en `fetchFgliMermaFinalResumen` para
 * la sección de presupuesto, que compara contra bultos descartados.
 *
 * 🚨 Cada entrada de acá es UN fetch más en el render del home (el árbol NO
 * está bajo Suspense y corta a los 5s), así que el endpoint tiene que estar
 * cacheado del lado del depósito. `hs_extras` salió del registro el 2026-07-30
 * junto con su nodo: el endpoint `hs-extras-resumen` sigue vivo, pero traerlo
 * en cada visita al home cuando ya nadie lo dibuja era tiempo regalado.
 *
 * Patrón calcado de `warehouse/auto-indicadores.ts`: fetch con timeout corto,
 * cache in-memory por proceso (1h) y tolerancia total a fallos (si el depósito
 * no responde, el caller cae al valor persistido en la tabla / al detalle vacío).
 * Los fetches concurrentes a la misma URL se deduplican (single-flight): el
 * FGLI reusa las promesas de WQI y DQI en vez de pegarle dos veces al depósito.
 */

const DEPOSITO_API_BASE =
  process.env.DEPOSITO_API_URL ?? "https://deposito-regionpampeana.vercel.app"

const TIMEOUT_MS = 5000
// `/api/indicadores/serie-diaria` re-arma el mes (movimientos + Sheets) y mide
// 1,5-5 s en caliente: con el timeout genérico se caía de a ratos. Mismo margen
// que usa `warehouse/auto-indicadores.ts`.
const SERIE_DIARIA_TIMEOUT_MS = 20_000
// `/api/indicadores` arma el mes completo del tablero (~20 KB, 1-3 s en frío).
const INDICADORES_TIMEOUT_MS = 10_000
const TTL_MS = 60 * 60 * 1000 // 1h: el blob del WMS se regenera 1 vez al día

export interface ResumenExternoMes {
  mes: number
  valor: number | null
  /**
   * Tamaño del mes: nº de registros (picking), horas-hombre (WNP), bultos
   * pickeados (precisión), HL afectados por rotura (WQI) o el primer sumando
   * de un KPI derivado (WQI en el TQI, TQI en el FGLI). null cuando el
   * endpoint no lo informa (DQI).
   */
  registros: number | null
  /**
   * 2º dato del mes, según el KPI: bultos con error (precisión), HL
   * entregados (WQI) o el segundo sumando de un KPI derivado (DQI en el TQI,
   * inventario en el FGLI) — la otra pata del cociente / de la suma.
   */
  bultos?: number
}
export interface ResumenExterno {
  anio: number
  promedio_anual: number | null
  registros_anual: number
  generado_en: string | null
  meses: ResumenExternoMes[]
}

/** key del KPI → cómo resolver su valor externo. */
export const KPI_EXTERNOS: Record<
  string,
  {
    /** Trae el resumen anual+mensual del depósito (o null si no disponible). */
    resumen: (anio: number) => Promise<ResumenExterno | null>
    /** Texto del popover. */
    explicacion: string
    /** Encabezado de la columna "detalle" del popover (default: "Registros"). */
    detalleLabel?: string
    /** Encabezado de la 2ª columna de detalle; sin esto no se dibuja. */
    detalle2Label?: string
  }
> = {
  prod_picking: {
    resumen: fetchPickingResumen,
    explicacion:
      "Prod Picking = bultos por hora-hombre (Bul/HH) del WMS. El número es el " +
      "promedio anual de los registros operario×día; el detalle muestra el " +
      "promedio de cada mes y cuántos registros lo componen. Fuente: depósito " +
      "(deposito-esteban /productividad).",
  },
  wnp: {
    resumen: fetchWnpResumen,
    explicacion:
      "WNP = HL despachados ÷ horas-hombre del almacén (indicador #20). El número " +
      "anual es la productividad ACUMULADA real (Σ HL ÷ Σ horas del año), no el " +
      "promedio de los meses; el detalle muestra el WNP de cada mes y las horas que " +
      "lo componen. Fuente: depósito (deposito-esteban /indicadores).",
    detalleLabel: "Horas",
  },
  precision_picking: {
    resumen: fetchPrecisionResumen,
    explicacion:
      "Precisión de picking = (bultos pickeados − bultos con error) ÷ bultos " +
      "pickeados × 100. El número anual es la precisión PONDERADA por volumen " +
      "(Σ bultos y Σ errores del año), no el promedio de los meses. Excluye los " +
      "errores de tipo SISTEMA (no son del operario) y no muestra nada antes de " +
      "abril 2026: los errores recién se registran desde entonces, así que un " +
      "100% anterior sería falso. Fuente: planilla de errores de picking del " +
      "depósito (la misma que la reunión de logística).",
    detalleLabel: "Bultos",
    detalle2Label: "Bultos c/error",
  },
  wqi: {
    resumen: fetchWqiResumen,
    explicacion:
      "WQI = HL afectados por rotura ÷ HL entregados × 1.000.000 (PPM). El " +
      "numerador es el volumen que ENTRA a reempaque (sin los traslados en " +
      "bloque, que no son rotura) más las roturas de almacén que no pasan por el " +
      "sector; el denominador son los HL entregados de Chess, netos de notas de " +
      "crédito. El número anual es el PPM PONDERADO (Σ HL afectados ÷ Σ HL " +
      "entregados), no el promedio ni la suma de los PPM mensuales. Es el " +
      "sumando de almacén del TQI (#8 del Reporte DPO): WQI + DQI = TQI. " +
      "Fuente: depósito (deposito-esteban /indicadores).",
    detalleLabel: "HL afectado",
    detalle2Label: "HL entregado",
  },
  dqi: {
    resumen: fetchDqiResumen,
    explicacion:
      "DQI = HL rotos EN LA ENTREGA (categoría «rotura distribución»: lo que se " +
      "rompe en el camión o en el PDV) ÷ HL entregados × 1.000.000 (PPM). Es el " +
      "mismo indicador de Indicadores → DQI (DPO Entrega 1.4); el número anual es " +
      "el acumulado ponderado del tablero del depósito, no el promedio de los " +
      "meses. Es el sumando de entrega del TQI (#9 del Reporte DPO): WQI + DQI " +
      "= TQI. Fuente: depósito (deposito-esteban /api/dqi).",
  },
  tqi: {
    resumen: fetchTqiResumen,
    explicacion:
      "TQI (Total Quality Index, KPI 5 del Reporte DPO 2026, DC-K1279) = (#8 HL " +
      "rotura total del almacén + #9 HL rotura total de la entrega) ÷ #28 HL " +
      "despachados × 1.000.000 (PPM). Mide el volumen AFECTADO: la rotura de " +
      "almacén incluye todo lo que entra a reempaque aunque después se " +
      "recupere, más la rotura de depósito y de acarreo; la de entrega es lo " +
      "que se rompe en el camión o en el PDV. Por eso WQI + DQI = TQI. El " +
      "número anual es Σ HL rotos ÷ Σ HL despachados del año, no el promedio " +
      "de los meses. Fuente: tablero del depósito (deposito-esteban " +
      "/indicadores, base del Reporte DPO), mismo número que muestra ahí.",
    detalleLabel: "HL rotos",
    detalle2Label: "HL entregado",
  },
  fgli: {
    resumen: fetchFgliResumen,
    explicacion:
      "FGLI (Finished Goods Loss Index, KPI 11 del Reporte DPO 2026, DC-K0030) " +
      "= (#6 diferencias de inventario + #53 roturas de almacén y entrega + #45 " +
      "obsolescencia) ÷ #28 HL despachados × 1.000.000 (PPM). Las roturas son " +
      "las del TQI (volumen afectado); las diferencias son |faltantes| + " +
      "|sobrantes| del cierre mensual cargado en la grilla DPO (si el mes no " +
      "está cargado, el neto del recuento); la obsolescencia son los HL de la " +
      "categoría Vencidos. NO incluye faltantes de entrega ni de acarreo (esos " +
      "van al SCL y al «HL perdidos» de la reunión de warehouse). El detalle " +
      "muestra los HL perdidos de cada mes y cuánto de eso es inventario + " +
      "vencidos; el resto es rotura (TQI). Fuente: tablero del depósito " +
      "(deposito-esteban /indicadores, base del Reporte DPO).",
    detalleLabel: "HL perdidos",
    detalle2Label: "Inventario + vencidos",
  },
}

export function esKpiExterno(key: string): boolean {
  return key in KPI_EXTERNOS
}

const cache = new Map<string, { value: unknown; expiresAt: number }>()
// Single-flight: N llamadas simultáneas a la misma URL con cache frío disparan
// UN fetch. Importa porque `resolverValoresExternos` resuelve todos los KPI en
// paralelo y el FGLI vuelve a pedir el WQI y el DQI que ya están en vuelo.
const enVuelo = new Map<string, Promise<unknown>>()

function fetchJsonCached<T>(url: string, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  const hit = cache.get(url)
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T | null)
  const pendiente = enVuelo.get(url)
  if (pendiente) return pendiente as Promise<T | null>

  const promesa = (async (): Promise<T | null> => {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) return null
      const data = (await res.json()) as T
      cache.set(url, { value: data, expiresAt: Date.now() + TTL_MS })
      return data
    } catch {
      return null
    } finally {
      enVuelo.delete(url)
    }
  })()
  enVuelo.set(url, promesa)
  return promesa
}

async function fetchPickingResumen(anio: number): Promise<ResumenExterno | null> {
  return fetchJsonCached<ResumenExterno>(
    `${DEPOSITO_API_BASE}/api/productividad/picking-resumen?anio=${anio}`,
  )
}

async function fetchWnpResumen(anio: number): Promise<ResumenExterno | null> {
  return fetchJsonCached<ResumenExterno>(
    `${DEPOSITO_API_BASE}/api/productividad/wnp-resumen?anio=${anio}`,
  )
}

async function fetchPrecisionResumen(anio: number): Promise<ResumenExterno | null> {
  return fetchJsonCached<ResumenExterno>(
    `${DEPOSITO_API_BASE}/api/productividad/precision-resumen?anio=${anio}`,
  )
}

async function fetchWqiResumen(anio: number): Promise<ResumenExterno | null> {
  return fetchJsonCached<ResumenExterno>(
    `${DEPOSITO_API_BASE}/api/productividad/wqi-resumen?anio=${anio}`,
  )
}

/**
 * DQI anual + mensual. El depósito no tiene un `dqi-resumen`: `/api/dqi` es
 * el endpoint mensual de /indicadores/dqi, pero cada respuesta ya trae el
 * acumulado del año (`anual_acum`) y la serie de los 12 meses (`serie_real`,
 * null en los meses que no pasaron), así que alcanza con UNA llamada. Se pide
 * el último mes del año (diciembre para años cerrados, el mes en curso para
 * el vigente) para que el acumulado cubra todo lo que hay.
 */
async function fetchDqiResumen(anio: number): Promise<ResumenExterno | null> {
  const hoy = new Date()
  const mes = anio < hoy.getFullYear() ? 12 : hoy.getMonth() + 1
  const j = await fetchJsonCached<{
    indicadores?: { dqi?: { anual_acum: number | null; serie_real: (number | null)[] } }
    _cached_at?: string
  }>(`${DEPOSITO_API_BASE}/api/dqi?year=${anio}&month=${mes}`)
  const dqi = j?.indicadores?.dqi
  if (!dqi) return null
  return {
    anio,
    promedio_anual: dqi.anual_acum ?? null,
    registros_anual: 0,
    generado_en: j?._cached_at ?? null,
    meses: (dqi.serie_real ?? []).map((valor, i) => ({
      mes: i + 1,
      valor: valor ?? null,
      registros: null,
    })),
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Pérdidas del mes en MERMA FINAL (HL descartados) leídas de la serie diaria
 * del depósito. Ya NO es la fuente del árbol (ver `fetchDpoBase`): la usa la
 * sección "Presupuesto y sustentabilidad", que compara contra la Q en bultos
 * del presupuesto (bultos que se dan de baja, no volumen afectado).
 *
 * No hay resumen anual en el depósito: se lee `/api/indicadores/serie-diaria`
 * de cada mes del año (~100 KB y 1,5-5 s cada uno, en paralelo, cacheados 1 h
 * y con single-flight, así TQI y FGLI comparten los mismos pedidos). Las
 * series de pérdida vienen ACUMULADAS en el mes (MTD): el total del mes es el
 * último día con dato. El HL entregado viene por día y se suma. Un mes que no
 * responde queda en null, y con él el acumulado anual: la card cae al valor
 * persistido en la tabla, que el cron de respaldo escribe a diario.
 */
interface SerieDiariaPerdidas {
  /** Roturas almacén + distribución que se DESCARTARON (merma final), MTD. */
  roturas?: Record<string, number | null>
  vencidos?: Record<string, number | null>
  /** Diferencia NETA del recuento mensual; entra entera al cierre del conteo. */
  diferencias_hl?: Record<string, number | null>
  hl_entregado_dia?: Record<string, number | null>
}

interface PerdidasMes {
  mes: number
  roturas: number
  vencidos: number
  diferencias: number
  entregado: number
}

function ultimoConDato(serie: Record<string, number | null> | undefined): number {
  if (!serie) return 0
  let ultimo = 0
  for (const fecha of Object.keys(serie).sort()) {
    const v = serie[fecha]
    if (v != null && Number.isFinite(v)) ultimo = v
  }
  return ultimo
}

/** Un elemento por mes del año hasta el mes en curso; null = mes sin dato. */
async function fetchPerdidasDelAnio(anio: number): Promise<(PerdidasMes | null)[]> {
  const hoy = new Date()
  if (anio > hoy.getFullYear()) return []
  const ultimoMes = anio < hoy.getFullYear() ? 12 : hoy.getMonth() + 1
  const series = await Promise.all(
    Array.from({ length: ultimoMes }, (_, i) =>
      fetchJsonCached<SerieDiariaPerdidas>(
        `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${anio}&month=${i + 1}`,
        SERIE_DIARIA_TIMEOUT_MS,
      ),
    ),
  )
  return series.map((s, i) => {
    const entregado = Object.values(s?.hl_entregado_dia ?? {}).reduce<number>(
      (acc, v) => acc + (v ?? 0),
      0,
    )
    if (!s || entregado <= 0) return null
    return {
      mes: i + 1,
      roturas: ultimoConDato(s.roturas),
      vencidos: ultimoConDato(s.vencidos),
      diferencias: ultimoConDato(s.diferencias_hl),
      entregado,
    }
  })
}

/**
 * Arma un resumen en PPM = Σ HL perdidos ÷ Σ HL entregados × 1M (mes a mes y
 * acumulado del año). `perdido` elige qué pérdidas suman; `detalle2` es el 2º
 * dato de cada mes para el modal.
 */
function resumenPpm(
  anio: number,
  meses: (PerdidasMes | null)[],
  perdido: (m: PerdidasMes) => number,
  detalle2: (m: PerdidasMes) => number,
): ResumenExterno | null {
  if (meses.length === 0 || meses.every((m) => m == null)) return null
  let perdidoAnual = 0
  let entregadoAnual = 0
  const completo = meses.every((m) => m != null)
  const filas: ResumenExternoMes[] = meses.map((m, i) => {
    if (!m) return { mes: i + 1, valor: null, registros: null }
    const p = perdido(m)
    perdidoAnual += p
    entregadoAnual += m.entregado
    return {
      mes: m.mes,
      valor: r1((p / m.entregado) * 1_000_000),
      registros: r2(p),
      bultos: r2(detalle2(m)),
    }
  })
  return {
    anio,
    promedio_anual:
      completo && entregadoAnual > 0
        ? r1((perdidoAnual / entregadoAnual) * 1_000_000)
        : null,
    registros_anual: r2(perdidoAnual),
    generado_en: null,
    meses: filas,
  }
}

/**
 * FGLI en merma final = (HL rotos descartados + vencidos + diferencia NETA de
 * inventario) ÷ HL entregados × 1M. Base del Handbook Almacén 3.4 y del
 * presupuesto; no es la del árbol.
 */
export async function fetchFgliMermaFinalResumen(anio: number): Promise<ResumenExterno | null> {
  const meses = await fetchPerdidasDelAnio(anio)
  return resumenPpm(
    anio,
    meses,
    (m) => m.roturas + m.vencidos + m.diferencias,
    (m) => m.vencidos + m.diferencias,
  )
}

/**
 * TQI y FGLI del Reporte DPO 2026, leídos del endpoint mensual del depósito
 * (`/api/indicadores`, el mismo de /indicadores). Desde el 2026-09-17 trae
 * `dpo_base.actual` con la base numerada del reporte para CADA mes del año
 * (una sola llamada de ~20 KB, contra 9-12 de ~100 KB a la serie diaria):
 *   #8  HL rotura total del almacén = volumen AFECTADO (ingreso a reempaque
 *       + rotura de depósito + rotura de acarreo)
 *   #9  HL rotura total de la entrega (camión / PDV)
 *   #53 = #8 + #9
 *   #45 HL perdidos por obsolescencia (vencidos)
 *   #6  HL perdidos por diferencias de inventario (|faltantes| + |sobrantes|
 *       cargados en la grilla DPO; si el mes no está cargado, el neto del
 *       recuento)
 *   #28 HL despachados en concepto de venta (= HL entregados)
 *   TQI  (DC-K1279) = #53 ÷ #28 × 1M
 *   FGLI (DC-K0030) = (#6 + #53 + #45) ÷ #28 × 1M
 * Sin faltantes de entrega. Se pide el último mes del año (diciembre para
 * años cerrados, el mes en curso para el vigente); el acumulado anual se
 * recalcula como Σ HL ÷ Σ #28 y coincide con `indicadores.*.anual_acum`
 * (verificado 2026-09-17: 2026 TQI 1.555 / FGLI 1.723; 2025 1.866 / 2.359).
 */
interface DpoBaseMes {
  n6?: number | null
  n28?: number | null
  n45?: number | null
  n53?: number | null
  tqi_hl?: number | null
  fgli_hl?: number | null
}
interface IndicadoresDeposito {
  dpo_base?: { actual?: Record<string, DpoBaseMes | null> }
  _cached_at?: string
}

async function fetchDpoBase(anio: number): Promise<IndicadoresDeposito | null> {
  const hoy = new Date()
  if (anio > hoy.getFullYear()) return null
  const mes = anio < hoy.getFullYear() ? 12 : hoy.getMonth() + 1
  return fetchJsonCached<IndicadoresDeposito>(
    `${DEPOSITO_API_BASE}/api/indicadores?year=${anio}&month=${mes}`,
    INDICADORES_TIMEOUT_MS,
  )
}

/**
 * Arma un resumen en PPM = Σ HL ÷ Σ #28 × 1M (mes a mes y acumulado del año)
 * desde la base del Reporte DPO. `perdido` elige qué HL suman; `detalle2` es
 * el 2º dato de cada mes para el modal. Meses sin #28 quedan en null.
 */
function resumenDpo(
  anio: number,
  j: IndicadoresDeposito | null,
  perdido: (m: DpoBaseMes) => number,
  detalle2: (m: DpoBaseMes) => number,
): ResumenExterno | null {
  const actual = j?.dpo_base?.actual
  if (!actual) return null
  let perdidoAnual = 0
  let entregadoAnual = 0
  const filas: ResumenExternoMes[] = []
  for (let mes = 1; mes <= 12; mes++) {
    const m = actual[String(mes)]
    const entregado = m?.n28 ?? 0
    if (!m || entregado <= 0) {
      filas.push({ mes, valor: null, registros: null })
      continue
    }
    const p = perdido(m)
    perdidoAnual += p
    entregadoAnual += entregado
    filas.push({
      mes,
      valor: r1((p / entregado) * 1_000_000),
      registros: r2(p),
      bultos: r2(detalle2(m)),
    })
  }
  if (entregadoAnual <= 0) return null
  return {
    anio,
    promedio_anual: r1((perdidoAnual / entregadoAnual) * 1_000_000),
    registros_anual: r2(perdidoAnual),
    generado_en: j?._cached_at ?? null,
    meses: filas,
  }
}

/** TQI (Reporte DPO KPI 5) = (#8 + #9) ÷ #28 × 1M. Detalle: HL rotos / HL entregados. */
async function fetchTqiResumen(anio: number): Promise<ResumenExterno | null> {
  return resumenDpo(
    anio,
    await fetchDpoBase(anio),
    (m) => m.tqi_hl ?? m.n53 ?? 0,
    (m) => m.n28 ?? 0,
  )
}

/** FGLI (Reporte DPO KPI 11) = (#6 + #53 + #45) ÷ #28 × 1M. Detalle: HL perdidos / inventario + vencidos. */
async function fetchFgliResumen(anio: number): Promise<ResumenExterno | null> {
  return resumenDpo(
    anio,
    await fetchDpoBase(anio),
    (m) => m.fgli_hl ?? (m.n53 ?? 0) + (m.n45 ?? 0) + (m.n6 ?? 0),
    (m) => (m.n45 ?? 0) + (m.n6 ?? 0),
  )
}

/**
 * Resuelve el valor anual (para la card) de todos los KPIs externos del año.
 * Devuelve un mapa key → valor (o null si el depósito no respondió). Nunca
 * lanza: cada externo se resuelve por separado.
 */
export async function resolverValoresExternos(
  anio: number,
): Promise<Map<string, number | null>> {
  const entries = Object.entries(KPI_EXTERNOS)
  const out = new Map<string, number | null>()
  await Promise.all(
    entries.map(async ([key, cfg]) => {
      const r = await cfg.resumen(anio)
      out.set(key, r?.promedio_anual ?? null)
    }),
  )
  return out
}
