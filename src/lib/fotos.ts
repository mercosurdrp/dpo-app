/**
 * Fotos de cálculos pesados (tabla `indicadores_fotos`).
 *
 * Un cálculo caro (Cuadro mensual, KPI de combustible) se guarda como foto
 * con su hora. Quien lo necesita lee la foto al instante y, si está vencida,
 * el cliente pide recalcularla en segundo plano (`refrescarFotos`) y refresca
 * la página. Así nadie espera 10 s mirando una pantalla en blanco: ve la foto
 * de hoy a la mañana y, unos segundos después, la fresca.
 *
 * Sólo servidor: lee y escribe con el cliente admin (service role).
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const CLAVE_CUADRO_MENSUAL = "cuadro-mensual"
export const claveKpiCombustible = (anio: number) => `kpi-combustible-${anio}`

/** Edad a partir de la cual una foto se considera vencida (los syncs son 1×día). */
export const FOTO_MAX_EDAD_MS = 3 * 60 * 60 * 1000

export interface Foto<T> {
  datos: T
  generadoEn: string
  duracionMs: number | null
}

export async function leerFoto<T>(clave: string): Promise<Foto<T> | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("indicadores_fotos")
      .select("datos, generado_en, duracion_ms")
      .eq("clave", clave)
      .maybeSingle()
    if (error || !data) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any
    return {
      datos: r.datos as T,
      generadoEn: r.generado_en,
      duracionMs: r.duracion_ms ?? null,
    }
  } catch {
    return null
  }
}

export async function guardarFoto<T>(
  clave: string,
  datos: T,
  duracionMs: number,
  generadoPor: string | null = null,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("indicadores_fotos").upsert(
      {
        clave,
        datos,
        generado_en: new Date().toISOString(),
        duracion_ms: Math.round(duracionMs),
        generado_por: generadoPor,
      },
      { onConflict: "clave" },
    )
  } catch (err) {
    console.error(`[fotos] no se pudo guardar ${clave}:`, err)
  }
}

export function fotoVencida(generadoEn: string | null | undefined, maxEdadMs = FOTO_MAX_EDAD_MS): boolean {
  if (!generadoEn) return true
  const t = Date.parse(generadoEn)
  return !Number.isFinite(t) || Date.now() - t > maxEdadMs
}

/**
 * Cuáles de estas claves no tienen foto o la tienen vencida. La página lo
 * manda al cliente para que dispare el recálculo en segundo plano.
 */
export async function clavesVencidas(claves: string[]): Promise<string[]> {
  if (claves.length === 0) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("indicadores_fotos")
      .select("clave, generado_en")
      .in("clave", claves)
    const porClave = new Map<string, string>()
    for (const r of (data ?? []) as { clave: string; generado_en: string }[]) {
      porClave.set(r.clave, r.generado_en)
    }
    return claves.filter((c) => fotoVencida(porClave.get(c)))
  } catch {
    return claves
  }
}

/**
 * Devuelve la foto si existe (aunque esté vencida: el refresco es en segundo
 * plano); si no hay ninguna, calcula en vivo y la guarda. `calcular` corre en
 * el contexto del request, así que puede usar la sesión del usuario.
 */
export async function conFoto<T>(
  clave: string,
  calcular: () => Promise<T>,
  generadoPor: string | null = null,
): Promise<{ datos: T; generadoEn: string; desdeFoto: boolean }> {
  const foto = await leerFoto<T>(clave)
  if (foto) return { datos: foto.datos, generadoEn: foto.generadoEn, desdeFoto: true }
  const t0 = Date.now()
  const datos = await calcular()
  await guardarFoto(clave, datos, Date.now() - t0, generadoPor)
  return { datos, generadoEn: new Date().toISOString(), desdeFoto: false }
}

/** Recalcula en vivo y pisa la foto. Para el refresco en segundo plano. */
export async function renovarFoto<T>(
  clave: string,
  calcular: () => Promise<T>,
  generadoPor: string | null = null,
): Promise<T> {
  const t0 = Date.now()
  const datos = await calcular()
  await guardarFoto(clave, datos, Date.now() - t0, generadoPor)
  return datos
}
