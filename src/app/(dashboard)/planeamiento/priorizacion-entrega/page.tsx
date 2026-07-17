import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getPriorizacionEntrega, getVrlMensual } from "@/actions/priorizacion-entrega"
import { getFueraRuta, getFueraRutaMensual } from "@/actions/fuera-ruta"
import { IS_MISIONES } from "@/lib/empresa"
import { PriorizacionClient, FueraRutaSolo } from "./priorizacion-client"

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

  const [res, vrl, fueraRutaRes, frMensualRes] = await Promise.all([
    getPriorizacionEntrega(fechaEntrega),
    // 13 meses: la pestaña Acumulado muestra el año completo hacia atrás.
    getVrlMensual(13),
    getFueraRuta(fechaEntrega),
    getFueraRutaMensual(13),
  ])
  const vrlMeses = "error" in vrl ? [] : vrl.data
  const fueraRuta =
    "error" in fueraRutaRes
      ? { fecha: fechaEntrega, filas: [], total_monto: 0, total_bultos: 0, total_hl: 0, sheet_ok: false }
      : fueraRutaRes.data
  const fueraRutaMensual = "error" in frMensualRes ? [] : frMensualRes.data

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>

      {"error" in res ? (
        // Sin pedidos pendientes (p. ej. una fecha pasada): el registro de fuera
        // de ruta se muestra igual, que para eso es un registro con historia.
        <FueraRutaSolo
          error={res.error}
          fueraRuta={fueraRuta}
          vrl={vrlMeses}
          fueraRutaMensual={fueraRutaMensual}
        />
      ) : (
        <PriorizacionClient
          data={res.data}
          vrl={vrlMeses}
          fueraRuta={fueraRuta}
          fueraRutaMensual={fueraRutaMensual}
        />
      )}
    </div>
  )
}
