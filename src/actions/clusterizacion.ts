"use server"

import {
  consultarClusterClientes,
  consultarEquiposFrioPorCliente,
  consultarCensoThomasPorPdv,
  type EquipoFrioCliente,
  type CensoThomasResultado,
} from "@/lib/mercosur-dashboard"
import { getCostoPorPdvYtd } from "./costo-pdv"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import type {
  ClusterId,
  CuadranteId,
  CuboId,
  DominioId,
  FrenteId,
  ClienteClusterizado,
  ClusterResumen,
  ClusterizacionData,
  ConquistaPdv,
} from "./clusterizacion-tipos"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA =
  "La clusterización de clientes solo está disponible en Pampeana."

// ESTADO (pasa/no pasa): solo cuentan los rechazos por CAUSA DEL CLIENTE.
// El resto de motivos (error de preventa, distribución, sin stock, etc.) son
// fallas internas y NO hacen "no pasa".
const MOTIVOS_CULPA_CLIENTE = new Set(["SIN DINERO", "CERRADO", "SIN ENVASES"])
// SALUD (sano/atención): caro o flojo de servir.
const DROP_BAJO = 3 // bultos por visita por debajo de esto = caro de servir
const RMD_BAJO = 4.5 // RMD promedio por debajo de esto = mal servicio

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const orden = [...valores].sort((a, b) => a - b)
  const mid = Math.floor(orden.length / 2)
  return orden.length % 2 === 0
    ? (orden[mid - 1] + orden[mid]) / 2
    : orden[mid]
}

// ── Cruce con el Censo Thomas ─────────────────────────────────────────────────
// Bandas de dominio (share of market CMQ en el PDV).
const SOM_DOMINADO = 0.7
const SOM_INVADIDO = 0.4
// Facilidad de ataque por cubo: el mismo HL de competencia vale más donde el
// cliente es barato de servir y viene creciendo (mejor retorno del esfuerzo).
const FACILIDAD_CUBO: Record<CuboId, number> = {
  estrella: 1,
  promesa: 1,
  rentable: 0.9,
  hormiga: 0.85,
  motor: 0.7,
  pesado: 0.6,
  dilema: 0.55,
  critico: 0.4,
}
// Marca CMQ espejo por segmento de la marca de competencia top del PDV
// (batallas del módulo censo: VALUE↔1890, Schneider/CORE↔Brahma-Quilmes, etc.).
const ESPEJO_CMQ: Record<string, string> = {
  VALUE: "1890",
  CORE: "Brahma/Quilmes",
  "CORE PLUS": "Andes Origen",
  PREMIUM: "Stella Artois",
  "SUPER PREMIUM": "Corona",
  "0.0% SIN ALCOHOL": "0.0% CMQ",
}

function dominioDe(som: number): DominioId {
  return som >= SOM_DOMINADO ? "dominado" : som >= SOM_INVADIDO ? "compartido" : "invadido"
}

function clasificar(ingresoAlto: boolean, crecePositivo: boolean): ClusterId {
  if (ingresoAlto) return crecePositivo ? "ganador" : "basico"
  return crecePositivo ? "en_crecimiento" : "ventas_bajas"
}

/**
 * Calificaciones RMD por cliente (promedio y cantidad) desde la ventana indicada.
 */
async function getRmdPorCliente(
  desde: string,
): Promise<Map<number, { suma: number; n: number }>> {
  const supabase = await createClient()
  const acc = new Map<number, { suma: number; n: number }>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("nps_rmd_cliente")
      .select("cod_cliente, puntuacion")
      .gte("fecha_puntuacion", desde)
      .range(from, from + PAGE - 1)
    if (error) break // RMD es opcional: si falla, seguimos sin él
    if (!data || data.length === 0) break
    for (const r of data as { cod_cliente: number; puntuacion: number }[]) {
      const prev = acc.get(r.cod_cliente) ?? { suma: 0, n: 0 }
      prev.suma += r.puntuacion
      prev.n += 1
      acc.set(r.cod_cliente, prev)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return acc
}

/**
 * Entregas rechazadas por cliente en la ventana [desde, hasta], separando las
 * que son por CAUSA DEL CLIENTE (sin dinero/cerrado/sin envases) del total.
 */
interface RechazoAcum {
  total: number
  /** Entregas (comprobantes) rechazadas POR CULPA DEL CLIENTE, una por entrega. */
  eventos: { fecha: string; motivo: string; bultos: number }[]
}

async function getRechazoPorCliente(
  desde: string,
  hasta: string,
): Promise<Map<number, RechazoAcum>> {
  const supabase = await createClient()
  // 🚨 `rechazos` tiene UNA FILA POR LÍNEA DE PRODUCTO. Una entrega rechazada =
  // un comprobante (serie + nrodoc), que puede tener muchas líneas. Primero junto
  // las líneas por entrega; recién después contamos entregas.
  type Entrega = { id_cliente: number; fecha: string; bultos: number; motivos: Map<string, number> }
  const entregas = new Map<string, Entrega>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("rechazos")
      .select("id_cliente, fecha, serie, nrodoc, ds_rechazo, bultos_rechazados")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) break // rechazo es opcional: si falla, seguimos sin él
    if (!data || data.length === 0) break
    for (const r of data as {
      id_cliente: number; fecha: string; serie: number | null; nrodoc: number | null
      ds_rechazo: string | null; bultos_rechazados: number | null
    }[]) {
      const key = `${r.id_cliente}|${r.serie ?? "?"}|${r.nrodoc ?? "?"}`
      const e = entregas.get(key) ?? { id_cliente: r.id_cliente, fecha: r.fecha, bultos: 0, motivos: new Map() }
      e.bultos += Number(r.bultos_rechazados ?? 0)
      const motivo = (r.ds_rechazo ?? "").trim().toUpperCase()
      e.motivos.set(motivo, (e.motivos.get(motivo) ?? 0) + 1)
      entregas.set(key, e)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  // Cada entrega = 1 evento; su motivo es el predominante de sus líneas.
  const acc = new Map<number, RechazoAcum>()
  for (const e of entregas.values()) {
    const prev = acc.get(e.id_cliente) ?? { total: 0, eventos: [] }
    prev.total += 1
    let motivo = "", max = 0
    for (const [m, c] of e.motivos) if (c > max) { max = c; motivo = m }
    if (MOTIVOS_CULPA_CLIENTE.has(motivo)) {
      prev.eventos.push({ fecha: e.fecha, motivo, bultos: e.bultos })
    }
    acc.set(e.id_cliente, prev)
  }
  return acc
}

/**
 * Mapeo promotor → supervisor de venta, derivado de `rechazos` (que trae el par
 * ds_vendedor/ds_supervisor). El mapeo es 1:1, así que con la primera aparición
 * alcanza. Se usa para poder filtrar el explorador por supervisor.
 */
async function getSupervisorPorPromotor(desde: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const m = new Map<string, string>()
  const { data } = await supabase
    .from("rechazos")
    .select("ds_vendedor, ds_supervisor")
    .gte("fecha", desde)
    .not("ds_vendedor", "is", null)
    .not("ds_supervisor", "is", null)
    .limit(10000)
  for (const r of (data ?? []) as { ds_vendedor: string; ds_supervisor: string }[]) {
    const k = r.ds_vendedor.trim().toUpperCase()
    if (!m.has(k)) m.set(k, r.ds_supervisor)
  }
  return m
}

/** Resta `meses` a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function restarMeses(fechaYmd: string, meses: number): string {
  const [y, m, d] = fechaYmd.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1 - meses, d))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

export async function getClusterizacion(
  semestreId?: string,
): Promise<Result<ClusterizacionData>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  let ventas
  try {
    ventas = await consultarClusterClientes(semestreId)
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudieron leer las ventas: ${e.message}`
          : "No se pudieron leer las ventas.",
    }
  }

  const { periodo, clientes: rows } = ventas
  // Ocultamos a los que no compraron en los últimos 45 días (drop size 0): no
  // son representativos para el análisis de servicio reciente.
  const conDrop = rows.filter((r) => r.dias_45d > 0 && r.bultos_45d > 0)
  if (conDrop.length === 0) {
    return {
      data: {
        periodo,
        umbral_ingresos: 0,
        umbral_costo: 0,
        resumen: [],
        clientes: [],
        censo_nombre: null,
        umbral_potencial: 0,
        conquista: [],
      },
    }
  }

  // RMD de los últimos 6 meses (muestra suficiente por cliente).
  const rmdDesde = periodo.sem_hasta ? restarMeses(periodo.sem_hasta, 6) : ""
  const rmdMap = rmdDesde ? await getRmdPorCliente(rmdDesde) : new Map()

  // Rechazos de los últimos 45 días [drop_desde, sem_hasta] (foto reciente):
  // un rechazo de enero no debe condenar al cliente en junio.
  const rechazoMap =
    periodo.drop_desde && periodo.sem_hasta
      ? await getRechazoPorCliente(periodo.drop_desde, periodo.sem_hasta)
      : new Map<number, RechazoAcum>()

  // Supervisor por promotor (para el filtro del explorador).
  const supMap = periodo.sem_hasta
    ? await getSupervisorPorPromotor(restarMeses(periodo.sem_hasta, 6))
    : new Map<string, string>()

  // Costo logístico $/HL del año (YTD) por PDV, reusando el indicador Costo/PDV
  // (misma función que alimenta su solapa "Acumulado", para que los números
  // coincidan). Es opcional: si no hay meses cargados o la RPC falla, queda vacío
  // y la columna muestra "—".
  const anioYtd = periodo.sem_hasta ? parseInt(periodo.sem_hasta.slice(0, 4), 10) : 0
  const costoHlMap = new Map<number, number>()
  if (anioYtd) {
    const costoYtd = await getCostoPorPdvYtd(anioYtd)
    if (!("error" in costoYtd)) {
      for (const f of costoYtd.data) {
        if (f.hl > 0) costoHlMap.set(f.id_cliente, f.costo_x_hl)
      }
    }
  }

  // Equipos de frío (EDF) instalados por PDV, desde la base del dashboard
  // (edf_activos). Opcional: si falla, la columna muestra "sin frío".
  let frioMap = new Map<number, EquipoFrioCliente>()
  try {
    frioMap = await consultarEquiposFrioPorCliente()
  } catch {
    frioMap = new Map<number, EquipoFrioCliente>()
  }

  // Censo Thomas (mercado vs competencia) del censo más reciente. Opcional: si
  // el módulo censo no está disponible, la solapa Mercado muestra el aviso.
  let censo: CensoThomasResultado | null = null
  try {
    censo = await consultarCensoThomasPorPdv()
  } catch {
    censo = null
  }

  // Umbral de potencial cautivo = p75 del HL de competencia entre los PDV de la
  // cartera activa que tienen competencia adentro (separa "potencial alto").
  let umbralPotencial = 0
  if (censo) {
    const comps: number[] = []
    for (const r of conDrop) {
      const cp = censo.pdvs.get(r.id_cliente)
      if (cp?.con_volumen) {
        const comp = cp.hl_total - cp.hl_cmq
        if (comp > 0) comps.push(comp)
      }
    }
    if (comps.length > 0) {
      const orden = [...comps].sort((a, b) => a - b)
      umbralPotencial = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.75))]
    }
  }

  // Umbral de costo = mediana del $/HL del año (separa "caro" de "barato").
  const umbralCosto = mediana([...costoHlMap.values()])

  // Umbral de facturación = mediana de la facturación del semestre.
  const umbral = mediana(conDrop.map((r) => r.facturacion_sem))

  const clientes: ClienteClusterizado[] = conDrop.map((r) => {
    const crecimiento_pct =
      r.facturacion_sem_prev > 0
        ? (r.facturacion_sem - r.facturacion_sem_prev) / r.facturacion_sem_prev
        : null // sin venta el año anterior → cliente nuevo
    const crecePositivo = crecimiento_pct === null || crecimiento_pct >= 0
    const ingresoAlto = r.facturacion_sem >= umbral
    const drop_size = r.dias_45d > 0 ? r.bultos_45d / r.dias_45d : 0
    // Costo $/HL del año y cuadrante Valor×Costo (sin dato de costo → null).
    const costo_x_hl_ytd = costoHlMap.get(r.id_cliente) ?? null
    const costo_alto = costo_x_hl_ytd == null ? null : costo_x_hl_ytd >= umbralCosto
    const cuadrante: CuadranteId | null =
      costo_alto == null
        ? null
        : ingresoAlto
          ? costo_alto
            ? "optimizar"
            : "proteger"
          : costo_alto
            ? "revisar"
            : "mantener"
    // Cubo del diagrama 3D: facturación (z) × costo (x) × crecimiento (y).
    const cubo: CuboId | null =
      costo_alto == null
        ? null
        : ingresoAlto
          ? costo_alto
            ? crecePositivo
              ? "motor"
              : "pesado"
            : crecePositivo
              ? "estrella"
              : "rentable"
          : costo_alto
            ? crecePositivo
              ? "dilema"
              : "critico"
            : crecePositivo
              ? "promesa"
              : "hormiga"
    // Cruce con el censo: dominio, frente estratégico, score de ataque y batalla.
    const cp = censo?.pdvs.get(r.id_cliente)
    const conCenso = !!cp?.con_volumen && cp.hl_total > 0
    const censo_hl_mercado = conCenso ? cp!.hl_total : null
    const censo_hl_comp = conCenso ? Math.max(0, cp!.hl_total - cp!.hl_cmq) : null
    const censo_som = conCenso ? cp!.som : null
    const dominio: DominioId | null = censo_som != null ? dominioDe(censo_som) : null
    const potencialAlto =
      censo_hl_comp != null && umbralPotencial > 0 && censo_hl_comp >= umbralPotencial
    let frente: FrenteId | null = null
    if (conCenso && cubo) {
      if (potencialAlto && ingresoAlto) frente = "casa_propia"
      else if (potencialAlto) frente = "gigantes"
      else if (dominio === "dominado" && ingresoAlto) frente = "muro"
      else if (cubo === "dilema" || cubo === "critico") frente = "veredicto"
      else frente = "sin_frente"
    }
    const score_ataque =
      censo_hl_comp != null && cubo ? censo_hl_comp * FACILIDAD_CUBO[cubo] : null
    const batalla =
      conCenso && cp!.comp_marca && cp!.comp_marca_hl > 0
        ? `${cp!.comp_marca} → ${ESPEJO_CMQ[cp!.comp_segmento ?? ""] ?? "portfolio CMQ"}`
        : null
    const rmd = rmdMap.get(r.id_cliente)
    const rmd_prom = rmd ? rmd.suma / rmd.n : null
    const rech = rechazoMap.get(r.id_cliente)
    const rechazos_culpa = rech?.eventos.length ?? 0
    const rechazos_total = rech?.total ?? 0
    const rechazos_detalle = rech
      ? [...rech.eventos].sort((a, b) => b.fecha.localeCompare(a.fecha))
      : []
    // ESTADO: rechazó al menos una vez por su culpa.
    const estado: "pasa" | "no_pasa" = rechazos_culpa >= 1 ? "no_pasa" : "pasa"
    // SALUD: drop bajo o RMD bajo.
    const drop_bajo = drop_size < DROP_BAJO
    const rmd_bajo = rmd_prom != null && rmd_prom < RMD_BAJO
    const salud: "sano" | "atencion" = drop_bajo || rmd_bajo ? "atencion" : "sano"
    return {
      id_cliente: r.id_cliente,
      nombre: r.nombre,
      localidad: r.localidad,
      promotor: r.promotor,
      supervisor: r.promotor ? supMap.get(r.promotor.trim().toUpperCase()) ?? null : null,
      segmento: r.segmento,
      cluster: clasificar(ingresoAlto, crecePositivo),
      ingresos_actual: r.facturacion_sem,
      ingresos_anterior: r.facturacion_sem_prev,
      crecimiento_pct,
      bultos_actual: r.bultos_45d,
      dias_actual: r.dias_45d,
      drop_size,
      costo_x_hl_ytd,
      costo_alto,
      cuadrante,
      cubo,
      equipos_frio_n: frioMap.get(r.id_cliente)?.cantidad ?? 0,
      equipos_frio_tipos: frioMap.get(r.id_cliente)?.tipos ?? null,
      rmd_prom,
      rmd_n: rmd ? rmd.n : 0,
      rechazos_culpa,
      rechazos_total,
      rechazos_detalle,
      estado,
      drop_bajo,
      rmd_bajo,
      salud,
      censo_hl_mercado,
      censo_hl_comp,
      censo_som,
      dominio,
      frente,
      score_ataque,
      batalla,
    }
  })

  // Conquista: PDVs censados CON volumen de mercado donde no tenemos venta este
  // año (no aparecen en comprobantes YTD). Invisibles para la clusterización.
  const conquista: ConquistaPdv[] = []
  if (censo) {
    const activos = new Set(rows.map((r) => r.id_cliente))
    for (const [id, cp] of censo.pdvs) {
      if (!cp.con_volumen || cp.hl_total <= 0 || activos.has(id)) continue
      conquista.push({
        id_cliente: id,
        hl_total: cp.hl_total,
        hl_cmq: cp.hl_cmq,
        som: cp.som,
        canal: cp.canal,
        subcanal: cp.subcanal,
        promotor_censo: cp.promotor_censo,
        comp_marca: cp.comp_marca,
        comp_marca_hl: cp.comp_marca_hl,
      })
    }
    conquista.sort((a, b) => b.hl_total - a.hl_total)
  }

  // Resumen por cluster.
  const facturacionTotalGlobal = clientes.reduce((s, c) => s + c.ingresos_actual, 0)
  const orden: ClusterId[] = ["ganador", "en_crecimiento", "basico", "ventas_bajas"]
  const resumen: ClusterResumen[] = orden.map((cl) => {
    const grupo = clientes.filter((c) => c.cluster === cl)
    const ingresos_total = grupo.reduce((s, c) => s + c.ingresos_actual, 0)
    const dropSizes = grupo.filter((c) => c.dias_actual > 0).map((c) => c.drop_size)
    const conRmd = grupo.filter((c) => c.rmd_prom !== null)
    const rmd_n = conRmd.reduce((s, c) => s + c.rmd_n, 0)
    const rmd_prom =
      conRmd.length > 0
        ? conRmd.reduce((s, c) => s + (c.rmd_prom as number) * c.rmd_n, 0) / (rmd_n || 1)
        : null
    return {
      cluster: cl,
      clientes: grupo.length,
      ingresos_total,
      pct_clientes: clientes.length > 0 ? grupo.length / clientes.length : 0,
      pct_ingresos:
        facturacionTotalGlobal > 0 ? ingresos_total / facturacionTotalGlobal : 0,
      drop_size_prom:
        dropSizes.length > 0
          ? dropSizes.reduce((s, v) => s + v, 0) / dropSizes.length
          : 0,
      rmd_prom,
      rmd_n,
      no_pasan: grupo.filter((c) => c.estado === "no_pasa").length,
      en_atencion: grupo.filter((c) => c.salud === "atencion").length,
      sanos: grupo.filter((c) => c.salud === "sano").length,
    }
  })

  return {
    data: {
      periodo,
      umbral_ingresos: umbral,
      umbral_costo: umbralCosto,
      resumen,
      clientes,
      censo_nombre: censo?.censo_nombre ?? null,
      umbral_potencial: umbralPotencial,
      conquista,
    },
  }
}
