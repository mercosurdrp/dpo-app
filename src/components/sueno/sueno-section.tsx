import { getProfile } from "@/lib/session"
import { getSuenoArbol } from "@/actions/sueno"
import { IS_MISIONES } from "@/lib/empresa"
import { ArbolSueno } from "./arbol-sueno"

/**
 * Sección "Árbol del Sueño" para el inicio de la app. Server component:
 * obtiene los valores y el rol, y delega el render al client component.
 *
 * Solo Pampeana por ahora (en Misiones la tabla no existe → se oculta).
 */
export async function SuenoSection() {
  if (IS_MISIONES) return null

  const [profile, res] = await Promise.all([getProfile(), getSuenoArbol()])
  if ("error" in res) return null

  const editable = profile?.role === "admin"
  return (
    <ArbolSueno nodos={res.data.nodos} editable={editable} anio={res.data.anio} />
  )
}
