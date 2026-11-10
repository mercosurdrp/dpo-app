import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Claves estables de las preguntas del manual DPO. El `id` de `preguntas` es un
 * UUID aleatorio distinto en cada base (Pampeana, Misiones), así que un UUID
 * fijo en el código sólo anda en la base donde se copió. La `key` es la misma.
 */
export const PREGUNTA_KEY = {
  ENTREGA_1_1: "5_1_23_73",
  ENTREGA_1_2: "5_1_23_74",
  ENTREGA_1_3: "5_1_23_75",
  ENTREGA_1_4: "5_1_23_76",
} as const

const cache = new Map<string, string>()

/** Devuelve el id de la pregunta con esa key, o null si no existe en esta base. */
export async function preguntaIdPorKey(supabase: SupabaseClient, key: string): Promise<string | null> {
  const hit = cache.get(key)
  if (hit) return hit
  const { data } = await supabase.from("preguntas").select("id").eq("key", key).maybeSingle()
  const id = (data?.id as string | undefined) ?? null
  if (id) cache.set(key, id)
  return id
}
