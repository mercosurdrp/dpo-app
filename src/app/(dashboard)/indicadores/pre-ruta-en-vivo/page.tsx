import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPreRutaEnVivo } from "@/actions/pre-ruta-en-vivo"
import { getTmlFoxtrotMapByDominio } from "@/actions/tml-foxtrot"
import { IS_MISIONES } from "@/lib/empresa"
import { PreRutaClient } from "./pre-ruta-client"

export const dynamic = "force-dynamic"

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function PreRutaEnVivoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const fechaParam = typeof sp.fecha === "string" && FECHA_RE.test(sp.fecha) ? sp.fecha : undefined
  const hoy = new Date().toISOString().slice(0, 10)
  const fecha = fechaParam ?? hoy
  const isHoy = fecha === hoy

  const [res, tmlFoxtrotByDominio] = await Promise.all([
    getPreRutaEnVivo(fecha),
    // Foxtrot solo aplica al día actual (es estado vivo)
    IS_MISIONES && isHoy ? getTmlFoxtrotMapByDominio() : Promise.resolve({}),
  ])

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      {"error" in res ? (
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pre-Ruta en Vivo</h1>
          <p className="mt-2 text-red-500">Error: {res.error}</p>
        </div>
      ) : (
        <PreRutaClient initial={res.data} tmlFoxtrotByDominio={tmlFoxtrotByDominio} />
      )}
    </div>
  )
}
