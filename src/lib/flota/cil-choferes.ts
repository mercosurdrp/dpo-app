import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Quién es el chofer de cada unidad, con su usuario de la app.
 *
 * 🚨 Sale de QUIÉN CARGA el checklist diario de esa unidad, no de
 * `vehiculos_ficha.chofer_asignado`: la ficha guarda el nombre tipeado a mano
 * ("Angel Frias") y el perfil se llama distinto ("FRIAS ANGEL ERMINDO"), así que
 * para mandarle un aviso habría que adivinar el usuario a partir del texto. El
 * checklist, en cambio, lo carga el chofer con su propio usuario todos los días:
 * el `created_by` ES el chofer, sin traducción en el medio.
 *
 * La ficha se usa igual, pero sólo para mostrar el nombre cuando la unidad no
 * tiene checklists en la ventana (una unidad recién incorporada, o parada).
 */

export interface ChoferUnidad {
  dominio: string
  /** El usuario al que se le avisa. `null` si no se pudo determinar. */
  userId: string | null
  /** Para mostrar: el nombre del perfil, o el de la ficha si no hay usuario. */
  nombre: string | null
  /** De dónde salió, para poder explicarlo en pantalla. */
  origen: "checklists" | "ficha" | null
}

/** Ventana de checklists que se mira para decidir de quién es la unidad. */
export const DIAS_VENTANA_CHOFER = 60

export async function choferesPorUnidad(
  supabase: SupabaseClient,
  dominios: string[],
  desde: string,
): Promise<Map<string, ChoferUnidad>> {
  const out = new Map<string, ChoferUnidad>()
  if (dominios.length === 0) return out

  const [chkRes, fichaRes] = await Promise.all([
    supabase
      .from("checklist_vehiculos")
      .select("dominio, created_by")
      .in("dominio", dominios)
      .gte("fecha", desde),
    supabase
      .from("vehiculos_ficha")
      .select("dominio, chofer_asignado")
      .in("dominio", dominios),
  ])

  const fichas = new Map(
    ((fichaRes.data || []) as Array<{ dominio: string; chofer_asignado: string | null }>).map(
      (f) => [f.dominio, f.chofer_asignado],
    ),
  )

  // (dominio, usuario) → cuántos checklists cargó.
  const cuenta = new Map<string, Map<string, number>>()
  for (const r of (chkRes.data || []) as Array<{
    dominio: string
    created_by: string | null
  }>) {
    if (!r.created_by) continue
    if (!cuenta.has(r.dominio)) cuenta.set(r.dominio, new Map())
    const m = cuenta.get(r.dominio)!
    m.set(r.created_by, (m.get(r.created_by) ?? 0) + 1)
  }

  // Los perfiles de todos los candidatos, de una sola vez.
  const candidatos = [...new Set([...cuenta.values()].flatMap((m) => [...m.keys()]))]
  const perfiles = new Map<string, { nombre: string | null; active: boolean }>()
  if (candidatos.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, nombre, active")
      .in("id", candidatos)
    for (const p of (data || []) as Array<{
      id: string
      nombre: string | null
      active: boolean | null
    }>) {
      perfiles.set(p.id, { nombre: p.nombre, active: p.active !== false })
    }
  }

  for (const dominio of dominios) {
    const m = cuenta.get(dominio)
    // 🚨 De más a menos checklists y descartando los usuarios dados de baja: una
    // unidad puede pasar de mano y el que la llevaba el mes pasado sigue
    // apareciendo en la ventana.
    const ganador = [...(m?.entries() ?? [])]
      .filter(([id]) => perfiles.get(id)?.active)
      .sort((a, b) => b[1] - a[1])[0]
    if (ganador) {
      out.set(dominio, {
        dominio,
        userId: ganador[0],
        nombre: perfiles.get(ganador[0])?.nombre ?? null,
        origen: "checklists",
      })
    } else {
      const deLaFicha = fichas.get(dominio) ?? null
      out.set(dominio, {
        dominio,
        userId: null,
        nombre: deLaFicha,
        origen: deLaFicha ? "ficha" : null,
      })
    }
  }

  return out
}

/** `YYYY-MM-DD` de hace `dias` días a partir de `hasta`. */
export function fechaMenosDias(hasta: string, dias: number): string {
  const [y, m, d] = hasta.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
}
