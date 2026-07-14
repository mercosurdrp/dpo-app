import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getPriorizacionEntrega, getVrlMensual } from "@/actions/priorizacion-entrega"
import { IS_MISIONES } from "@/lib/empresa"
import { PriorizacionClient } from "./priorizacion-client"

export const dynamic = "force-dynamic"

/**
 * Fecha de entrega por defecto: el DÍA HÁBIL SIGUIENTE.
 * El circuito es: los pedidos se toman un día → al día siguiente se rutean, se pickean
 * y se preparan → se entregan al otro. La pantalla se abre el día del RUTEO, así que
 * lo que hay que priorizar es lo que se entrega mañana.
 */
function proximaFechaEntrega(): string {
  const hoy = new Date()
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1))
  // Domingo no se entrega: pasa al lunes.
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default async function PriorizacionEntregaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  if (IS_MISIONES) redirect("/indicadores")

  const { fecha } = await searchParams
  const fechaEntrega = /^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") ? fecha! : proximaFechaEntrega()

  const [res, vrl] = await Promise.all([
    getPriorizacionEntrega(fechaEntrega),
    getVrlMensual(6),
  ])
  const vrlMeses = "error" in vrl ? [] : vrl.data

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
          <h1 className="text-2xl font-bold text-slate-900">Priorización de Entrega</h1>
          <p className="mt-2 text-red-500">{res.error}</p>
        </div>
      ) : (
        <PriorizacionClient data={res.data} vrl={vrlMeses} />
      )}
    </div>
  )
}
