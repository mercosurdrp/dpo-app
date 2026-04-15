import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPreRutaEnVivo } from "@/actions/pre-ruta-en-vivo"
import { PreRutaClient } from "./pre-ruta-client"

export default async function PreRutaEnVivoPage() {
  const res = await getPreRutaEnVivo()

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
        <PreRutaClient initial={res.data} />
      )}
    </div>
  )
}
