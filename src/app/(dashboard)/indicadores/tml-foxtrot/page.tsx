import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getTmlFoxtrotRango } from "@/actions/tml-foxtrot"
import { IS_MISIONES } from "@/lib/empresa"
import { TmlFoxtrotClient } from "./tml-foxtrot-client"
import type { TmlFoxtrotPeriodo } from "@/types/database"

interface PageProps {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>
}

const AR_TZ = "America/Argentina/Buenos_Aires"
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ })
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const PERIODOS: TmlFoxtrotPeriodo[] = ["dia", "semana", "mes", "ytd", "personalizado"]

function hoyAr(): string {
  return ymd.format(new Date())
}

// Traduce el período elegido a un rango concreto de fechas [desde, hasta].
function rangoDePeriodo(
  periodo: TmlFoxtrotPeriodo,
  qDesde?: string,
  qHasta?: string,
): { desde: string; hasta: string } {
  const hoy = hoyAr()
  const [y, m] = hoy.split("-")

  switch (periodo) {
    case "semana": {
      // Lunes de la semana en curso → hoy.
      const d = new Date(`${hoy}T12:00:00.000Z`)
      const dow = d.getUTCDay() // 0=domingo … 6=sábado
      d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
      return { desde: d.toISOString().slice(0, 10), hasta: hoy }
    }
    case "mes":
      return { desde: `${y}-${m}-01`, hasta: hoy }
    case "ytd":
      return { desde: `${y}-01-01`, hasta: hoy }
    case "personalizado":
      return {
        desde: qDesde && FECHA_RE.test(qDesde) ? qDesde : hoy,
        hasta: qHasta && FECHA_RE.test(qHasta) ? qHasta : hoy,
      }
    default:
      return { desde: hoy, hasta: hoy }
  }
}

export default async function TmlFoxtrotPage({ searchParams }: PageProps) {
  if (!IS_MISIONES) redirect("/indicadores/tml")

  const sp = await searchParams
  const periodo: TmlFoxtrotPeriodo = PERIODOS.includes(sp.periodo as TmlFoxtrotPeriodo)
    ? (sp.periodo as TmlFoxtrotPeriodo)
    : "dia"
  const { desde, hasta } = rangoDePeriodo(periodo, sp.desde, sp.hasta)
  const res = await getTmlFoxtrotRango(desde, hasta, periodo)

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
          <h1 className="text-2xl font-bold text-slate-900">TML — Foxtrot</h1>
          <p className="mt-2 text-red-500">Error: {res.error}</p>
        </div>
      ) : (
        <TmlFoxtrotClient initial={res.data} />
      )}
    </div>
  )
}
