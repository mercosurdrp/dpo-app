import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/types/database"

/**
 * Registro de uso del Radar de Rechazos: quién abre la pantalla y quién baja el
 * PDF de críticos, y a qué hora. Tabla `radar_rechazos_uso`.
 *
 * Nació el 20/10/2026: dos de los tres clientes que rechazaron por sin dinero
 * ese día estaban en el radar, y no había forma de saber si Ventas lo mira.
 *
 * NO es "use server": se importa solo desde la page y la route del PDF. Si se
 * exportara como server action cualquiera podría inflar el registro.
 */

export type AccionUsoRadar = "ABRIR" | "PDF"

/**
 * Inserta un evento. Nunca tira: si la tabla no existe o la base no responde,
 * el radar se tiene que ver igual. Llamarlo dentro de `after()` para no sumarle
 * latencia a la respuesta.
 */
export async function registrarUsoRadar(
  profile: Pick<Profile, "id" | "nombre" | "email" | "role">,
  accion: AccionUsoRadar,
  fechaEntrega: string | null,
  historica: boolean,
): Promise<void> {
  try {
    const { error } = await createAdminClient().from("radar_rechazos_uso").insert({
      user_id: profile.id,
      nombre: profile.nombre,
      email: profile.email,
      role: profile.role,
      accion,
      fecha_entrega: fechaEntrega,
      historica,
    })
    if (error) console.error("[radar-uso] no se pudo registrar:", error.message)
  } catch (err) {
    console.error("[radar-uso] no se pudo registrar:", err)
  }
}

export interface UsoRadarEvento {
  id: string
  user_id: string | null
  nombre: string | null
  email: string | null
  role: string | null
  accion: AccionUsoRadar
  fecha_entrega: string | null
  historica: boolean
  created_at: string
}

/**
 * Eventos de los últimos `dias` días, del más nuevo al más viejo. Lee con la
 * sesión del usuario: la RLS solo deja ver a admin y supervisor.
 */
export async function getUsoRadar(
  dias: number,
): Promise<{ data: UsoRadarEvento[] } | { error: string }> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const supa = await createClient()
  const eventos: UsoRadarEvento[] = []
  // Paginado por created_at (la columna del filtro, con índice) para no
  // cortar en las 1000 filas por defecto de PostgREST.
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await supa
      .from("radar_rechazos_uso")
      .select("id, user_id, nombre, email, role, accion, fecha_entrega, historica, created_at")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(desdeFila, desdeFila + 999)
    if (error) return { error: error.message }
    eventos.push(...((data ?? []) as UsoRadarEvento[]))
    if (!data || data.length < 1000) break
  }
  return { data: eventos }
}
