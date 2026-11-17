import Link from "next/link"
import { ArrowLeft, Route } from "lucide-react"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { getVrlMensual } from "@/actions/priorizacion-entrega"
import { getFueraRuta, getFueraRutaMensual } from "@/actions/fuera-ruta"
import { IS_MISIONES } from "@/lib/empresa"
import { FUERA_RUTA_CHESS_DESDE } from "@/lib/fuera-ruta/chess"
import { FueraRutaPanel, AcumuladoMensualPanel } from "../fuera-ruta-panels"
import { FechaFueraRuta } from "./fecha-fuera-ruta"

export const dynamic = "force-dynamic"

/** Hoy en Argentina (YYYY-MM-DD). */
function hoyArg(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
}

/**
 * Fuera de ruta de Priorización de entrega, en página propia: el detalle de un
 * día y el acumulado mensual (fuera de ruta vs. VRL). Antes eran dos solapas
 * al lado de las ciudades del ranking.
 */
export default async function FueraDeRutaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  if (IS_MISIONES) redirect("/indicadores")

  const { fecha: f } = await searchParams
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f ?? "") ? f! : hoyArg()

  const [fueraRutaRes, frMensualRes, vrl] = await Promise.all([
    getFueraRuta(fecha),
    getFueraRutaMensual(13),
    getVrlMensual(13),
  ])
  const fueraRuta =
    "error" in fueraRutaRes
      ? {
          fecha, filas: [], total_monto: 0, total_bultos: 0, total_hl: 0,
          fuente: fecha >= FUERA_RUTA_CHESS_DESDE ? "chess" as const : "sheet" as const,
          fuente_ok: false, dias_pactados_en: null, foto: null, no_salieron: 0,
        }
      : fueraRutaRes.data
  const fueraRutaMensual = "error" in frMensualRes ? [] : frMensualRes.data
  const vrlMeses = "error" in vrl ? [] : vrl.data

  return (
    <div className="space-y-4">
      <Link
        href={`/planeamiento/priorizacion-entrega?fecha=${fecha}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Priorización de entrega
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Route className="h-6 w-6" /> Fuera de ruta
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedidos entregados fuera del día pactado del cliente, y el acumulado mensual junto al VRL.
          </p>
        </div>
        <FechaFueraRuta fecha={fecha} />
      </div>

      <Card>
        <CardContent className="pt-4">
          <FueraRutaPanel fueraRuta={fueraRuta} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Acumulado mensual</h2>
          <AcumuladoMensualPanel fueraRutaMensual={fueraRutaMensual} vrl={vrlMeses} />
        </CardContent>
      </Card>
    </div>
  )
}
