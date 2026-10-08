import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import { IS_MISIONES } from "@/lib/empresa"
import { getCuadroMensualIndicadores } from "@/actions/cuadro-mensual"
import { CLAVE_CUADRO_MENSUAL, clavesVencidas } from "@/lib/fotos"
import { RefrescoFotos } from "@/components/fotos/refresco-fotos"
import { CuadroMensualClient } from "./cuadro-mensual-client"

export const dynamic = "force-dynamic"

export default async function CuadroMensualPage() {
  // Solo Pampeana.
  if (IS_MISIONES) notFound()

  // Se sirve la última foto (abre al instante); si venció, el cliente la
  // recalcula en segundo plano y refresca la página.
  const res = await getCuadroMensualIndicadores()
  // Después del get: si no había foto, el get la acaba de crear.
  const fotosVencidas = await clavesVencidas([CLAVE_CUADRO_MENSUAL])

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <RefrescoFotos claves={fotosVencidas} />
      {"error" in res ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h1 className="text-lg font-semibold text-red-900">
            No se pudo generar el cuadro mensual
          </h1>
          <p className="mt-1 text-sm text-red-700">{res.error}</p>
        </div>
      ) : (
        <CuadroMensualClient data={res.data} />
      )}
    </div>
  )
}
