import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getOpls } from "@/actions/flota-opl"
import { getProfile } from "@/lib/session"
import { OplClient } from "./opl-client"

export default async function OplPage() {
  const [res, profile] = await Promise.all([getOpls(), getProfile()])
  const opls = "data" in res ? res.data : []
  const puedeEditar = profile?.role === "admin" || profile?.role === "supervisor"

  return (
    <div className="space-y-4">
      <Link
        href="/vehiculos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Vehículos
      </Link>
      {"error" in res && <p className="text-sm text-red-500">Error: {res.error}</p>}
      <OplClient opls={opls} puedeEditar={puedeEditar} puedeBorrar={profile?.role === "admin"} />
    </div>
  )
}
