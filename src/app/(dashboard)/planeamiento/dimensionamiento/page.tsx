import Link from "next/link"
import { connection } from "next/server"
import { getDatosDimensionamiento } from "@/actions/dimensionamiento"
import { IS_MISIONES } from "@/lib/empresa"
import { requireAuth } from "@/lib/session"
import { DimensionamientoClient } from "./dimensionamiento-client"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const ROLES_EDICION = ["admin", "admin_rrhh", "supervisor"]

export default async function DimensionamientoPage() {
  await connection()
  const profile = await requireAuth()

  if (IS_MISIONES) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          ← Volver a Indicadores
        </Link>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          El Dimensionamiento de Distribución/Flota (DPO 3.1) por ahora está disponible solo en Región Pampeana.
        </p>
      </div>
    )
  }

  const datos = await getDatosDimensionamiento()

  if ("error" in datos) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Dimensionamiento de Distribución/Flota (DPO 3.1)</h1>
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el módulo: {datos.error}
        </p>
      </div>
    )
  }

  return (
    <DimensionamientoClient
      data={datos.data}
      canEdit={ROLES_EDICION.includes(profile.role)}
    />
  )
}
