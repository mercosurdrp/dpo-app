import { redirect } from "next/navigation"
import { getProfile } from "@/lib/session"
import { moduloHabilitado } from "@/lib/portal-empleado"

/**
 * Corte de una página del portal cuando el módulo no existe en esta empresa.
 * El empleado vuelve a su Inicio; el resto, al tablero. Reemplaza los
 * `if (IS_MISIONES) redirect("/")` de cada página, que al empleado lo
 * mandaban a `/` (que no puede ver) y de ahí el guard lo rebotaba otra vez.
 */
export async function requireModuloPortal(id: string): Promise<void> {
  if (moduloHabilitado(id)) return
  const profile = await getProfile()
  redirect(profile?.role === "empleado" ? "/mis-capacitaciones" : "/")
}
