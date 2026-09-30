import Link from "next/link"
import { notFound } from "next/navigation"
import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getComoVenimos } from "@/actions/como-venimos"
import { getVisibilidadEmpleado, getVisibilidadEquipo } from "@/actions/visibilidad-resultados"
import { getMisHabilidades } from "@/actions/skap-empleado"
import { getMisRechazos } from "@/actions/mis-rechazos"
import { getRechazosRankingEmpleado } from "@/actions/rechazos-empleado"
import type { PeriodoKey } from "@/actions/rechazos-empleado-tipos"
import { ComoVenimosClient } from "./como-venimos-client"
import { VisibilidadEmpleadoClient } from "../visibilidad-resultados/visibilidad-empleado-client"
import { VisibilidadEquipoClient } from "../visibilidad-resultados/visibilidad-equipo-client"
import { MisRechazosClient } from "../mis-rechazos/mis-rechazos-client"
import { RechazosEmpleadoClient } from "../rechazos/_components/rechazos-empleado-client"

// «Cómo venimos» (DPO Entrega 2.1): una sola pantalla con todo lo que el
// empleado de entrega necesita saber de sus resultados. Junta el tablero del
// equipo (réplica de Distribuciones) con lo que en Pampeana estaba repartido
// en «Mis Resultados», «Mis Rechazos» y «Rechazos». Cada solapa carga sólo lo
// suyo: el server renderiza la solapa pedida y nada más.

export const dynamic = "force-dynamic"

const ROLES_SUPERVISION = ["admin", "supervisor", "admin_rrhh", "auditor"]
const PERIODOS_VALIDOS: PeriodoKey[] = ["mes", "mes_pasado", "semana"]

type Solapa = "resumen" | "horas" | "rechazos" | "ranking"

export default async function ComoVenimosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; periodo?: string }>
}) {
  await requireModuloPortal("como-venimos")
  const profile = await requireAuth()
  const esEmpleado = profile.role === "empleado"
  if (!esEmpleado && !ROLES_SUPERVISION.includes(profile.role)) notFound()

  const sp = await searchParams
  const solapas: { id: Solapa; label: string }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "horas", label: esEmpleado ? "Horas y bultos" : "Horas y bultos del equipo" },
    ...(esEmpleado ? [{ id: "rechazos" as const, label: "Mis rechazos" }] : []),
    { id: "ranking", label: "Ranking de rechazos" },
  ]
  const tab: Solapa = solapas.some((s) => s.id === sp.tab) ? (sp.tab as Solapa) : "resumen"

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <TrendingUp className="size-6 text-blue-600" /> Cómo venimos
        </h1>
        <p className="text-sm text-muted-foreground">
          {esEmpleado
            ? "Tus números del mes y los del equipo, día por día."
            : "Los indicadores del equipo de entrega, día por día y persona por persona."}
        </p>
      </div>

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b px-1" aria-label="Solapas">
        {solapas.map((s) => (
          <Link
            key={s.id}
            href={s.id === "resumen" ? "/como-venimos" : `/como-venimos?tab=${s.id}`}
            prefetch={false}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === s.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-muted-foreground hover:text-slate-900",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <Contenido tab={tab} esEmpleado={esEmpleado} mes={sp.mes} periodo={sp.periodo} />
    </div>
  )
}

async function Contenido({
  tab,
  esEmpleado,
  mes,
  periodo,
}: {
  tab: Solapa
  esEmpleado: boolean
  mes?: string
  periodo?: string
}) {
  if (tab === "horas") {
    if (esEmpleado) {
      const [res, skap] = await Promise.all([getVisibilidadEmpleado(mes), getMisHabilidades()])
      if ("error" in res) return <Aviso mensaje={res.error} />
      return <VisibilidadEmpleadoClient data={res.data} skap={skap} basePath="/como-venimos?tab=horas" />
    }
    const res = await getVisibilidadEquipo(mes)
    if ("error" in res) return <Aviso mensaje={res.error} />
    return <VisibilidadEquipoClient data={res.data} basePath="/como-venimos?tab=horas" />
  }

  if (tab === "rechazos") {
    const res = await getMisRechazos()
    if ("error" in res) return <Aviso mensaje={res.error} />
    return <MisRechazosClient data={res.data} />
  }

  if (tab === "ranking") {
    const p: PeriodoKey = PERIODOS_VALIDOS.includes(periodo as PeriodoKey) ? (periodo as PeriodoKey) : "mes"
    const res = await getRechazosRankingEmpleado(p)
    if ("error" in res) return <Aviso mensaje={res.error} />
    return <RechazosEmpleadoClient data={res.data} basePath="/como-venimos?tab=ranking" />
  }

  const res = await getComoVenimos()
  if ("error" in res) return <Aviso mensaje={res.error} />
  return <ComoVenimosClient data={res.data} />
}

function Aviso({ mensaje }: { mensaje: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{mensaje}</div>
}
