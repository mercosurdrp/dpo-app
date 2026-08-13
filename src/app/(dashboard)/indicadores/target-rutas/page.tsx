import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getTargetRutas } from "@/actions/target-rutas"
import { getProfile } from "@/lib/session"
import { TargetRutasClient } from "./target-rutas-client"

export default async function TargetRutasPage() {
  const [res, profile] = await Promise.all([getTargetRutas(), getProfile()])

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      {"error" in res ? (
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Target por ruta</h1>
          <p className="mt-2 text-red-500">{res.error}</p>
        </div>
      ) : (
        <TargetRutasClient
          data={res.data}
          puedeEditar={profile?.role === "admin" || profile?.role === "supervisor"}
        />
      )}
    </div>
  )
}
