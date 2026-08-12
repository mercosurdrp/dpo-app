/**
 * Almacenamiento del módulo Clima sobre la tabla `app_config` (clave/valor).
 *
 * Por qué acá y no en tablas propias: en esta VM no hay forma de aplicar DDL
 * (no hay connection string de Postgres ni MCP autenticado), y dejarle a
 * alguien el SQL para pegar a mano significaría que la función queda muerta
 * hasta que se acuerde. `app_config` ya existe en las dos empresas, ya guarda
 * JSON largo y se maneja con la service role.
 *
 * El volumen lo justifica: dos olas por año (≈550 resultados y ≈270
 * comentarios cada una) y unas decenas de planes de acción.
 *
 * Formato de las claves:
 *   clima:ola:<codigo>                 → la ola (H1 2026, H2 2025…)
 *   clima:res:<codigo>:<n>             → resultados, en trozos de 250
 *   clima:com:<codigo>:<n>             → comentarios de texto, en trozos
 *   clima:plan:<uuid>                  → un plan de acción
 *   clima:avance:<plan_id>:<uuid>      → un avance de ese plan
 *
 * Todo pasa por la service role (`createAdminClient`): la RLS de `app_config`
 * solo deja escribir a jefatura y acá escriben también supervisores y el
 * responsable de un plan. El permiso se valida ANTES, en cada server action.
 *
 * Este módulo NUNCA se importa desde un componente de cliente: lo usan solo
 * los server actions de Clima, que ya validaron sesión y rol.
 */
import { createAdminClient } from "@/lib/supabase/admin"

/** Filas por trozo. Con 250 cada valor queda en ~30 KB. */
const POR_TROZO = 250
const PASO_LECTURA = 1000

type Fila = { clave: string; valor: string }

function db() {
  return createAdminClient()
}

/** Lee todas las claves con ese prefijo, paginando (PostgREST corta en 1000). */
export async function leerPrefijo(
  prefijo: string,
): Promise<{ data: Fila[] } | { error: string }> {
  const supabase = db()
  const out: Fila[] = []
  for (let desde = 0; ; desde += PASO_LECTURA) {
    const { data, error } = await supabase
      .from("app_config")
      .select("clave, valor")
      .like("clave", `${prefijo}%`)
      .order("clave")
      .range(desde, desde + PASO_LECTURA - 1)
    if (error) return { error: error.message }
    const filas = (data ?? []) as Fila[]
    out.push(...filas)
    if (filas.length < PASO_LECTURA) break
  }
  return { data: out }
}

export async function leerClave<T>(clave: string): Promise<T | null> {
  const supabase = db()
  const { data } = await supabase
    .from("app_config")
    .select("valor")
    .eq("clave", clave)
    .maybeSingle()
  const valor = (data as { valor: string } | null)?.valor
  if (!valor) return null
  try {
    return JSON.parse(valor) as T
  } catch {
    return null
  }
}

export async function escribirClave(
  clave: string,
  valor: unknown,
  autorId?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = db()
  const { error } = await supabase.from("app_config").upsert(
    {
      clave,
      valor: JSON.stringify(valor),
      updated_by: autorId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clave" },
  )
  return error ? { error: error.message } : { ok: true }
}

export async function borrarClave(
  clave: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = db()
  const { error } = await supabase.from("app_config").delete().eq("clave", clave)
  return error ? { error: error.message } : { ok: true }
}

export async function borrarPrefijo(
  prefijo: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = db()
  const { error } = await supabase
    .from("app_config")
    .delete()
    .like("clave", `${prefijo}%`)
  return error ? { error: error.message } : { ok: true }
}

/**
 * Guarda una lista larga partida en trozos numerados, borrando primero los
 * trozos viejos: así una reimportación con menos filas no deja restos.
 */
export async function escribirLista(
  prefijo: string,
  items: unknown[],
  autorId?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const limpieza = await borrarPrefijo(prefijo)
  if ("error" in limpieza) return limpieza

  const supabase = db()
  const filas: Array<{
    clave: string
    valor: string
    updated_by: string | null
    updated_at: string
  }> = []
  const ahora = new Date().toISOString()
  for (let i = 0; i * POR_TROZO < items.length; i++) {
    filas.push({
      // El índice va con ceros para que el orden alfabético sea el numérico.
      clave: `${prefijo}${String(i).padStart(4, "0")}`,
      valor: JSON.stringify(items.slice(i * POR_TROZO, (i + 1) * POR_TROZO)),
      updated_by: autorId ?? null,
      updated_at: ahora,
    })
  }
  if (!filas.length) return { ok: true }

  for (let i = 0; i < filas.length; i += 20) {
    const { error } = await supabase
      .from("app_config")
      .upsert(filas.slice(i, i + 20), { onConflict: "clave" })
    if (error) return { error: error.message }
  }
  return { ok: true }
}

/** Devuelve la lista completa que guardó `escribirLista`. */
export async function leerLista<T>(
  prefijo: string,
): Promise<{ data: T[] } | { error: string }> {
  const res = await leerPrefijo(prefijo)
  if ("error" in res) return res
  const out: T[] = []
  for (const fila of res.data) {
    try {
      const trozo = JSON.parse(fila.valor)
      if (Array.isArray(trozo)) out.push(...(trozo as T[]))
    } catch {
      // Un trozo ilegible no puede tumbar la pantalla entera.
    }
  }
  return { data: out }
}

/** Objetos sueltos guardados uno por clave (planes, avances). */
export async function leerObjetos<T>(
  prefijo: string,
): Promise<{ data: T[] } | { error: string }> {
  const res = await leerPrefijo(prefijo)
  if ("error" in res) return res
  const out: T[] = []
  for (const fila of res.data) {
    try {
      out.push(JSON.parse(fila.valor) as T)
    } catch {
      // idem
    }
  }
  return { data: out }
}

/**
 * Bucket de evidencia. Se reusa el de los planes de acción de la app, con
 * prefijo propio, para no depender de crear uno nuevo.
 */
export const CLIMA_BUCKET = "planes-avances"
export const CLIMA_PREFIJO_ARCHIVOS = "clima"
