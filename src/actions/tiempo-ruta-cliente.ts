"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

// Tiempo en ruta abierto por CLIENTE y por ciudad.
//
// El cálculo vive en la base (migración 20260721160000): vista
// `v_tiempo_ruta_ciclos` + funciones `tiempo_ruta_clientes` / `tiempo_ruta_ciudades`.
// Se hace ahí y no acá porque son ~37.000 paradas y el ranking necesita medianas:
// traerlas al server para calcular en JS sería tirar varios MB por request.
//
// 🚨 Lecturas obligatorias antes de tocar esto:
//   - el ciclo por cliente INCLUYE el manejo desde la parada anterior, no es
//     tiempo de atención puro. Un cliente lejano puntúa alto por distancia;
//   - por eso se compara contra la mediana de SU ciudad, y se usa MEDIANA (el
//     promedio fabrica falsos positivos con un solo outlier);
//   - la SUMA de minutos recuperables NO es una meta: por definición la mitad de
//     los clientes está sobre la mediana. Lo accionable es el top N.

export interface ClienteTiempoRuta {
  id_cliente: string
  cliente: string
  ciudad: string
  visitas: number
  mediana_cliente: number
  mediana_ciudad: number
  exceso_min: number
  min_recuperables: number
  /** Bultos típicos (mediana) de la entrega. */
  bultos_med: number
  /**
   * Minutos por bulto: separa al que tarda porque DESCARGA MUCHO (normal) del que
   * tarda por espera / acceso / cobranza (accionable). Un PDV con 0,7 min/bulto
   * está trabajando bien aunque figure alto en minutos absolutos.
   */
  min_por_bulto: number
}

export interface CiudadTiempoRuta {
  ciudad: string
  paradas: number
  mediana_ciudad: number
  clientes_sobre_mediana: number
  horas_recuperables: number
}

export interface TiempoRutaClientesData {
  clientes: ClienteTiempoRuta[]
  ciudades: CiudadTiempoRuta[]
  desde: string
  hasta: string
  /** Paradas que entraron al cálculo en el rango (denominador honesto). */
  paradas: number
  /** true si la migración todavía no está aplicada en esta Supabase. */
  sinDatos: boolean
}

/** Falta la migración en esta base: no es un error a mostrar, es "todavía no". */
const NO_EXISTE = new Set(["PGRST202", "PGRST205", "42P01", "42883"])

export async function getTiempoRutaClientes(
  desde: string,
  hasta: string,
  minVisitas = 8,
): Promise<{ data: TiempoRutaClientesData } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [cliRes, ciuRes] = await Promise.all([
      supabase.rpc("tiempo_ruta_clientes", {
        p_desde: desde,
        p_hasta: hasta,
        p_min_visitas: minVisitas,
      }),
      supabase.rpc("tiempo_ruta_ciudades", {
        p_desde: desde,
        p_hasta: hasta,
        p_min_visitas: minVisitas,
      }),
    ])

    const vacio: TiempoRutaClientesData = {
      clientes: [],
      ciudades: [],
      desde,
      hasta,
      paradas: 0,
      sinDatos: true,
    }

    if (cliRes.error) {
      if (NO_EXISTE.has(cliRes.error.code ?? "")) return { data: vacio }
      return { error: cliRes.error.message }
    }
    if (ciuRes.error) {
      if (NO_EXISTE.has(ciuRes.error.code ?? "")) return { data: vacio }
      return { error: ciuRes.error.message }
    }

    const num = (v: unknown): number => (v == null ? 0 : Number(v))

    const clientes: ClienteTiempoRuta[] = (cliRes.data ?? []).map(
      (r: Record<string, unknown>) => ({
        id_cliente: String(r.id_cliente ?? ""),
        cliente: String(r.cliente ?? "(sin nombre)"),
        ciudad: String(r.ciudad ?? "Otras"),
        visitas: num(r.visitas),
        mediana_cliente: num(r.mediana_cliente),
        mediana_ciudad: num(r.mediana_ciudad),
        exceso_min: num(r.exceso_min),
        min_recuperables: num(r.min_recuperables),
        bultos_med: num(r.bultos_med),
        min_por_bulto: num(r.min_por_bulto),
      }),
    )

    const ciudades: CiudadTiempoRuta[] = (ciuRes.data ?? []).map(
      (r: Record<string, unknown>) => ({
        ciudad: String(r.ciudad ?? "Otras"),
        paradas: num(r.paradas),
        mediana_ciudad: num(r.mediana_ciudad),
        clientes_sobre_mediana: num(r.clientes_sobre_mediana),
        horas_recuperables: num(r.horas_recuperables),
      }),
    )

    return {
      data: {
        clientes,
        ciudades,
        desde,
        hasta,
        paradas: ciudades.reduce((a, c) => a + c.paradas, 0),
        sinDatos: clientes.length === 0 && ciudades.length === 0,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}
