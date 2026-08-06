import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { hoyAR } from "@/lib/herramientas-gestion"
import {
  getGopsPendientes,
  getGopsPeriodos,
  getGopsResumen,
  getUltimasImportaciones,
} from "@/actions/gops"
import { listarPlanesGops, listarResponsablesGops } from "@/actions/gops-planes"
import { GopsClient } from "./gops-client"

export const dynamic = "force-dynamic"

export default async function GopsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const profile = await requireAuth()
  const canEdit = ["admin", "supervisor", "admin_rrhh"].includes(profile.role)

  const periodos = await getGopsPeriodos()

  // El período que se muestra: el pedido por la URL, si no el último con carga, y si
  // todavía no se importó nada, el mes en curso (la pantalla arranca vacía invitando
  // a subir el Excel).
  const [anioHoy, mesHoy] = hoyAR().split("-").map(Number)
  const { periodo } = await searchParams
  const pedido = periodo?.match(/^(\d{4})-(\d{1,2})$/)
  const actual = pedido
    ? { anio: Number(pedido[1]), mes: Number(pedido[2]) }
    : (periodos[0] ?? { anio: anioHoy, mes: mesHoy })

  const [resumen, pendientes, planes, responsables, importaciones] = await Promise.all([
    getGopsResumen(actual.anio, actual.mes),
    getGopsPendientes(actual.anio, actual.mes),
    listarPlanesGops(),
    canEdit ? listarResponsablesGops() : Promise.resolve([]),
    getUltimasImportaciones(3),
  ])

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores/5eb1b041-6a1b-4c71-9067-0daf4f5e381a"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Planeamiento
      </Link>
      <GopsClient
        periodo={actual}
        periodos={periodos}
        resumen={resumen}
        pendientes={pendientes}
        planes={"data" in planes ? planes.data : []}
        responsables={responsables}
        importaciones={importaciones}
        canEdit={canEdit}
        mesEnCurso={{ anio: anioHoy, mes: mesHoy }}
      />
    </div>
  )
}
