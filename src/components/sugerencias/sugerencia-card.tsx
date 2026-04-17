"use client"

import { Badge } from "@/components/ui/badge"
import { User, Clock } from "lucide-react"
import {
  SUGERENCIA_TIPO_LABELS,
  SUGERENCIA_TIPO_COLORS,
  SUGERENCIA_PRIORIDAD_LABELS,
  SUGERENCIA_PRIORIDAD_COLORS,
  type SugerenciaConAutor,
} from "@/types/database"

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  })
}

export function SugerenciaCard({
  sugerencia,
  onClick,
}: {
  sugerencia: SugerenciaConAutor
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-900">
          {sugerencia.titulo}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          style={{
            backgroundColor: SUGERENCIA_TIPO_COLORS[sugerencia.tipo] + "20",
            color: SUGERENCIA_TIPO_COLORS[sugerencia.tipo],
          }}
        >
          {SUGERENCIA_TIPO_LABELS[sugerencia.tipo]}
        </Badge>
        <Badge
          variant="secondary"
          style={{
            backgroundColor: SUGERENCIA_PRIORIDAD_COLORS[sugerencia.prioridad] + "20",
            color: SUGERENCIA_PRIORIDAD_COLORS[sugerencia.prioridad],
          }}
        >
          {SUGERENCIA_PRIORIDAD_LABELS[sugerencia.prioridad]}
        </Badge>
      </div>

      {sugerencia.modulo && (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {sugerencia.modulo}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 truncate">
          <User className="size-3 shrink-0" />
          <span className="truncate">{sugerencia.autor_nombre}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <Clock className="size-3" />
          {formatDate(sugerencia.created_at)}
        </span>
      </div>
    </button>
  )
}
