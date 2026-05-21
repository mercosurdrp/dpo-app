import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { connection } from "next/server"
import { getSobrecargasIndicador } from "@/actions/sobrecargas"
import { IS_MISIONES } from "@/lib/empresa"
import { requireAuth } from "@/lib/session"
import { SobrecargasClient } from "./sobrecargas-client"

const ROLES_PUEDEN_SYNC = ["admin", "admin_rrhh", "supervisor"]

export default async function SobrecargasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Garantiza render dynamic en Next.js 16: cada request lee searchParams
  // y la hora actual del servidor en vivo (no prerendered).
  await connection()
  const profile = await requireAuth()
  const canSync = ROLES_PUEDEN_SYNC.includes(profile.role)

  if (!IS_MISIONES) {
    return (
      <div className="space-y-4">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          El indicador de Sobrecargas solo está disponible en Misiones.
        </div>
      </div>
    )
  }

  const sp = await searchParams
  const mesParam = typeof sp.mes === "string" ? sp.mes : undefined
  const debugMode = sp.debug === "1"
  const serverNowISO = new Date().toISOString()
  const res = await getSobrecargasIndicador(mesParam)

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      {debugMode && (
        <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs text-fuchsia-900 font-mono whitespace-pre-wrap">
          {"DEBUG sobrecargas:\n"}
          {"  sp (raw): " + JSON.stringify(sp) + "\n"}
          {"  mesParam: " + JSON.stringify(mesParam) + "\n"}
          {"  serverNowISO: " + serverNowISO + "\n"}
          {"  data.mes: " + ("error" in res ? "(ERROR)" : res.data.mes) + "\n"}
          {"  mesesDisponibles: " + ("error" in res ? "-" : JSON.stringify(res.data.mesesDisponibles)) + "\n"}
          {"  serie.mes[]: " + ("error" in res ? "-" : JSON.stringify(res.data.serie.map((s) => s.mes)))}
        </div>
      )}
      {"error" in res ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h1 className="text-lg font-semibold text-red-900">
            No se pudo cargar el indicador de Sobrecargas
          </h1>
          <p className="mt-1 text-sm text-red-700">{res.error}</p>
        </div>
      ) : (
        <SobrecargasClient data={res.data} canSync={canSync} />
      )}
    </div>
  )
}
