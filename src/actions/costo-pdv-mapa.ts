"use server"

import { requireAuth } from "@/lib/session"
import { getPool } from "@/lib/mercosur-dashboard"

/** Coordenadas de entrega de un PDV, para pintarlo en el mapa de Costo por PDV. */
export interface CoordenadaPdv {
  id_cliente: number
  lat: number
  lng: number
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
export async function getCoordenadasPdv(): Promise<{ data: CoordenadaPdv[] } | { error: string }> {
  await requireAuth()
  try {
    const pool = getPool()
    const res = await pool.query<{ id_cliente: number; lat: string | number; lng: string | number }>(
      `SELECT c.id_cliente,
              COALESCE(c.latitud_entrega, c.latitud)   AS lat,
              COALESCE(c.longitud_entrega, c.longitud) AS lng
         FROM clientes c
        WHERE COALESCE(c.latitud_entrega, c.latitud) IS NOT NULL
          AND COALESCE(c.longitud_entrega, c.longitud) IS NOT NULL`,
    )
    const data: CoordenadaPdv[] = []
    for (const r of res.rows) {
      const lat = Number(r.lat)
      const lng = Number(r.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) continue
      data.push({ id_cliente: Number(r.id_cliente), lat, lng })
    }
    return { data }
  } catch (e) {
    console.error("[costo-pdv-mapa] error consultando coordenadas:", e)
    return { error: "No se pudieron leer las coordenadas de los clientes. Probá de nuevo en un rato." }
  }
}
