import { CalendarClock, CircleDashed, FileClock, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type {
  EstadoEventoGestionRequisito,
  EstadoGestionRequisito,
  RequisitoLegalGestion,
} from "@/types/database"

export const ESTADO_GESTION_LABEL: Record<EstadoEventoGestionRequisito, string> =
  {
    solicitado: "Solicitado",
    turno_asignado: "Turno asignado",
    en_tramite: "En trámite",
    renovado: "Renovado",
    cancelada: "Cancelada",
  }

export const ESTADOS_GESTION_OPCIONES: {
  value: EstadoGestionRequisito
  label: string
  ayuda: string
}[] = [
  {
    value: "solicitado",
    label: "Solicitado / iniciado",
    ayuda: "Se pidió el documento o se inició el trámite ante el organismo",
  },
  {
    value: "turno_asignado",
    label: "Turno asignado",
    ayuda: "Ya hay turno con fecha",
  },
  {
    value: "en_tramite",
    label: "En trámite / presentado",
    ayuda: "Documentación presentada, esperando la emisión",
  },
]

export function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function formatFechaDiaMes(iso: string | null): string {
  if (!iso) return "—"
  const [, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}

/**
 * Badge del estado del trámite. `gestion` en null = nadie declaró gestión
 * todavía; solo se muestra "Sin gestión" cuando el requisito está en zona de
 * alerta, para no ensuciar la matriz con items vigentes que no hay que tocar.
 */
export function GestionBadge({
  gestion,
  mostrarSinGestion = true,
}: {
  gestion: RequisitoLegalGestion | null
  mostrarSinGestion?: boolean
}) {
  if (!gestion) {
    if (!mostrarSinGestion) return null
    return (
      <Badge className="gap-1 border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">
        <CircleDashed className="size-3" />
        Sin gestión
      </Badge>
    )
  }

  if (gestion.estado === "turno_asignado") {
    return (
      <Badge className="gap-1 border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-100">
        <CalendarClock className="size-3" />
        Turno {formatFechaDiaMes(gestion.fecha_turno)}
      </Badge>
    )
  }

  if (gestion.estado === "en_tramite") {
    return (
      <Badge className="gap-1 border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
        <FileClock className="size-3" />
        En trámite
      </Badge>
    )
  }

  return (
    <Badge className="gap-1 border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-100">
      <Send className="size-3" />
      Solicitado
    </Badge>
  )
}
