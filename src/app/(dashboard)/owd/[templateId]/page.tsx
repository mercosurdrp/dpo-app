import type { ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import {
  getOwdTemplateById,
  getOwdKpis,
  getObservaciones,
  getOwdTendenciaOperarios,
  getOwdPlanes,
  getEmpleadosActivos,
} from "@/actions/owd"
import { listResponsablesPosibles } from "@/actions/presupuesto"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { OwdTemplateClient } from "./owd-template-client"
import { OwdAnalisisClient } from "./owd-analisis-client"

const ROLES_GESTION = ["admin", "supervisor", "admin_rrhh"]

export default async function OwdTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const profile = await requireAuth()

  const [tplRes, kpisRes, obsRes] = await Promise.all([
    getOwdTemplateById(templateId),
    getOwdKpis(templateId),
    getObservaciones(templateId, { limit: 50 }),
  ])

  if ("error" in tplRes) {
    if (tplRes.error.includes("No rows")) notFound()
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">OWD</h1>
        <p className="mt-2 text-red-500">Error: {tplRes.error}</p>
      </div>
    )
  }
  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{tplRes.data.template.nombre}</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const observaciones = "data" in obsRes ? obsRes.data : []

  // Análisis (tendencia por operario + planes de acción): solo Pampeana.
  let analisis: ReactNode = null
  if (!IS_MISIONES) {
    const [tendRes, planesRes, empRes, respRes] = await Promise.all([
      getOwdTendenciaOperarios(templateId),
      getOwdPlanes(templateId),
      getEmpleadosActivos(),
      listResponsablesPosibles(),
    ])
    analisis = (
      <OwdAnalisisClient
        templateId={templateId}
        meta={Number(tplRes.data.template.meta_cumplimiento_pct)}
        tendencias={"data" in tendRes ? tendRes.data : []}
        planes={"data" in planesRes ? planesRes.data : []}
        observaciones={observaciones.map((o) => ({
          id: o.id,
          fecha: o.fecha,
          empleado_observado: o.empleado_observado,
          pct_cumplimiento: Number(o.pct_cumplimiento),
        }))}
        empleados={"data" in empRes ? empRes.data.map((e) => e.nombre) : []}
        responsables={
          "data" in respRes ? respRes.data.map((r) => ({ id: r.id, nombre: r.nombre })) : []
        }
        canManage={ROLES_GESTION.includes(profile.role)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/owd"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a OWD
      </Link>
      <OwdTemplateClient
        templateId={templateId}
        contexto={tplRes.data}
        kpis={kpisRes.data}
        observaciones={observaciones}
        isAdmin={profile.role === "admin"}
      />
      {analisis}
    </div>
  )
}
