/**
 * Mapa de Costo por PDV: cálculo y fotos.
 *
 * El mapa de un período (mes cargado o acumulado del año) es el costo por PDV de
 * ese período cruzado con las coordenadas de entrega de Chess. Como el costo se
 * carga UNA vez por mes, no tiene sentido recalcularlo en cada apertura: se
 * guarda como foto en `indicadores_fotos` (misma mecánica que el Cuadro mensual)
 * y se regenera sólo cuando se carga el costo de un mes (`generarFotosMapaMes`)
 * o cuando un editor aprieta "Renovar" en la solapa. Las coordenadas viajan
 * adentro de la foto, así que el mapa queda fijo aunque Chess cambie una
 * dirección hasta la próxima renovación.
 *
 * Sólo servidor.
 */
import { getCostoPorPdv, getCostoPorPdvYtd, type CostoPorPdvRow } from "@/actions/costo-pdv"
import { getPool } from "@/lib/mercosur-dashboard"
import { borrarFotos, claveMapaCosto, conFoto, renovarFoto, type PeriodoMapaCosto } from "@/lib/fotos"

/** Un PDV en el mapa: lo justo para pintarlo y para el tooltip. */
export interface PdvMapa {
  id: number
  nombre: string
  ciudad: string
  bultos: number
  comprobantes: number
  hl: number
  costo_total: number
  costo_x_hl: number
  pct_venta: number
  /** null = sin coordenadas válidas en Chess (cuenta en el resumen por ciudad, no se dibuja). */
  lat: number | null
  lng: number | null
}

export interface MapaCosto {
  periodo: PeriodoMapaCosto
  puntos: PdvMapa[]
  /** Meses que entraron al acumulado (sólo tipo ytd). */
  meses: number[]
}

// Caja aproximada de la región Pampeana que atiende el CD (San Nicolás, Pergamino,
// Ramallo, Arrecifes, Colón y alrededores). Lo que cae afuera es una coordenada mal
// cargada en Chess (0/0, lat/lng invertidas, etc.) y no se dibuja: un solo punto en el
// Atlántico arruina el encuadre del mapa.
const LAT_MIN = -35.5
const LAT_MAX = -32.0
const LNG_MIN = -62.5
const LNG_MAX = -58.5

/**
 * Coordenadas de TODOS los clientes de Chess con georreferencia válida (activos y
 * anulados: un PDV con costo en un mes viejo puede haberse dado de baja después).
 * Fuente: tabla `clientes` del dashboard Mercosur (Railway), la misma que usa
 * Buscar Cliente; prioriza la coordenada de entrega sobre la fiscal.
 */
async function leerCoordenadas(): Promise<Map<number, { lat: number; lng: number }>> {
  const pool = getPool()
  const res = await pool.query<{ id_cliente: number; lat: string | number; lng: string | number }>(
    `SELECT c.id_cliente,
            COALESCE(c.latitud_entrega, c.latitud)   AS lat,
            COALESCE(c.longitud_entrega, c.longitud) AS lng
       FROM clientes c
      WHERE COALESCE(c.latitud_entrega, c.latitud) IS NOT NULL
        AND COALESCE(c.longitud_entrega, c.longitud) IS NOT NULL`,
  )
  const m = new Map<number, { lat: number; lng: number }>()
  for (const r of res.rows) {
    const lat = Number(r.lat)
    const lng = Number(r.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) continue
    m.set(Number(r.id_cliente), { lat, lng })
  }
  return m
}

/** Calcula el mapa en vivo (costo del período + coordenadas). Tarda unos segundos. */
export async function calcularMapaCosto(periodo: PeriodoMapaCosto): Promise<MapaCosto> {
  const [res, coords] = await Promise.all([
    periodo.tipo === "mes"
      ? getCostoPorPdv(periodo.anio, periodo.mes).then((r) => ("error" in r ? r : { data: r.data, meses: [{ mes: periodo.mes }] }))
      : getCostoPorPdvYtd(periodo.anio),
    leerCoordenadas(),
  ])
  if ("error" in res) throw new Error(res.error)
  const filas: CostoPorPdvRow[] = res.data
  const meses = res.meses.map((m) => m.mes)
  return {
    periodo,
    meses,
    puntos: filas.map((f) => {
      const c = coords.get(f.id_cliente)
      return {
        id: f.id_cliente,
        nombre: f.nombre_cliente,
        ciudad: f.ciudad,
        bultos: f.bultos,
        comprobantes: f.comprobantes,
        hl: f.hl,
        costo_total: f.costo_total,
        costo_x_hl: f.costo_x_hl,
        pct_venta: f.pct_venta,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
      }
    }),
  }
}

/** Foto del período; si no existe, la calcula y la guarda. */
export async function leerMapaCosto(periodo: PeriodoMapaCosto, generadoPor: string | null) {
  return conFoto<MapaCosto>(claveMapaCosto(periodo), () => calcularMapaCosto(periodo), generadoPor)
}

/** Recalcula y pisa la foto del período. */
export async function renovarMapaCostoFoto(periodo: PeriodoMapaCosto, generadoPor: string | null) {
  const datos = await renovarFoto<MapaCosto>(claveMapaCosto(periodo), () => calcularMapaCosto(periodo), generadoPor)
  return { datos, generadoEn: new Date().toISOString() }
}

/**
 * Al cargar el costo de un mes: arma la foto de ese mes y la del acumulado del
 * año, que con el mes nuevo quedó vieja. Best-effort: si alguna falla (timeout de
 * la RPC, Railway caído), se borra la foto vieja para que la próxima apertura de
 * la solapa la calcule en vivo en lugar de mostrar un dato desactualizado.
 */
export async function generarFotosMapaMes(anio: number, mes: number, generadoPor: string | null): Promise<void> {
  const periodos: PeriodoMapaCosto[] = [
    { tipo: "mes", anio, mes },
    { tipo: "ytd", anio },
  ]
  for (const p of periodos) {
    try {
      await renovarMapaCostoFoto(p, generadoPor)
    } catch (err) {
      console.error(`[costo-pdv-mapa] no se pudo generar la foto ${claveMapaCosto(p)}:`, err)
      await borrarFotos([claveMapaCosto(p)])
    }
  }
}
