import type { SupabaseClient } from "@supabase/supabase-js"
import type { ReunionActividadConResponsable } from "@/types/database"

export const HERRAMIENTA_LABEL: Record<string, string> = {
  cinco_porques: "5XQ",
  causa_efecto: "Espina",
  pdca: "PDCA",
}

/** Suma a cada acción las herramientas de gestión que tiene colgadas
 *  (plan_herramientas_gestion.reunion_actividad_id). Si la consulta falla,
 *  devuelve las acciones tal cual: la marca es un adorno, no bloquea nada. */
export async function adjuntarHerramientas(
  supabase: SupabaseClient,
  actividades: ReunionActividadConResponsable[],
): Promise<ReunionActividadConResponsable[]> {
  const ids = actividades.map((a) => a.id)
  if (ids.length === 0) return actividades
  const { data, error } = await supabase
    .from("plan_herramientas_gestion")
    .select("id, tipo, reunion_actividad_id")
    .in("reunion_actividad_id", ids)
  if (error || !data) return actividades
  const porActividad = new Map<string, { id: string; tipo: string }[]>()
  for (const h of data as { id: string; tipo: string; reunion_actividad_id: string }[]) {
    const lista = porActividad.get(h.reunion_actividad_id) ?? []
    lista.push({ id: h.id, tipo: h.tipo })
    porActividad.set(h.reunion_actividad_id, lista)
  }
  return actividades.map((a) =>
    porActividad.has(a.id) ? { ...a, herramientas: porActividad.get(a.id) } : a,
  )
}

/** Marca (en reuniones_actividades.etiquetas) de la acción creada a partir de
 *  la contramedida de una herramienta: evita duplicarla al reeditar. */
export function marcaContramedida(herramientaId: string): string {
  return `contramedida:${herramientaId}`
}
