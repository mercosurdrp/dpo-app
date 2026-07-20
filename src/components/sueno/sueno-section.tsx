import { getProfile } from "@/lib/session"
import { getSuenoArbol } from "@/actions/sueno"
import { IS_MISIONES } from "@/lib/empresa"
import { ArbolSueno } from "./arbol-sueno"

/**
 * Placeholder mientras el Árbol se calcula. Va como `fallback` del <Suspense>
 * que lo envuelve en el inicio y en /mis-capacitaciones: getSuenoArbol()
 * recalcula TLP, tiempo en PDV y tiempo en ruta del año, y sin streaming ese
 * cálculo retrasaba la página entera — justo las dos donde cae todo el que
 * se loguea.
 */
export function SuenoSkeleton() {
  return (
    <div className="mb-6 animate-pulse rounded-xl border border-slate-200 bg-white p-6">
      <div className="h-5 w-48 rounded bg-slate-200" />
      <div className="mt-4 flex gap-3">
        <div className="h-20 flex-1 rounded-lg bg-slate-100" />
        <div className="h-20 flex-1 rounded-lg bg-slate-100" />
        <div className="h-20 flex-1 rounded-lg bg-slate-100" />
      </div>
    </div>
  )
}

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
