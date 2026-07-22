"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, History, Paperclip } from "lucide-react"
import type {
  PlanAccionAvance,
  PlanAccionPaso,
} from "@/types/database"

interface Props {
  avances: PlanAccionAvance[]
  pasos: PlanAccionPaso[]
}

const TIPO_ESTILO: Record<string, { label: string; clase: string }> = {
  avance: { label: "Avance", clase: "bg-blue-500" },
  cierre: { label: "Cierre", clase: "bg-emerald-500" },
  reapertura: { label: "Reapertura", clase: "bg-amber-500" },
  backfill: { label: "Avance previo", clase: "bg-slate-400" },
}

/** Quita el prefijo timestamp que le pone el uploader al path. */
function nombreAdjunto(url: string): string {
  const base = decodeURIComponent(url.split("/").pop() ?? "adjunto")
  return base.replace(/^\d{10,}-/, "")
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SeguimientoTimeline({ avances, pasos }: Props) {
  const [abierto, setAbierto] = useState(false)

  if (avances.length === 0) return null

  const tituloPaso = new Map(pasos.map((p) => [p.id, p.que]))

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
      >
        {abierto ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <History className="size-3.5" />
        Seguimiento ({avances.length})
      </button>

      {abierto && (
        <ol className="space-y-3 border-t border-slate-200 px-3 py-3">
          {avances.map((a) => {
            const estilo = TIPO_ESTILO[a.tipo] ?? TIPO_ESTILO.avance
            const dePaso = a.paso_id ? tituloPaso.get(a.paso_id) : null
            return (
              <li key={a.id} className="flex gap-2.5">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${estilo.clase}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-slate-700">
                      {estilo.label}
                    </span>
                    <span>·</span>
                    <span>{formatFechaHora(a.created_at)}</span>
                    {a.autor_nombre && (
                      <>
                        <span>·</span>
                        <span>{a.autor_nombre}</span>
                      </>
                    )}
                  </div>
                  {dePaso && (
                    <p className="truncate text-xs text-slate-500">
                      En: {dePaso}
                    </p>
                  )}
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
                    {a.comentario}
                  </p>
                  {a.adjunto_urls.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {a.adjunto_urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-48 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 hover:underline"
                        >
                          <Paperclip className="size-3 shrink-0" />
                          <span className="truncate">{nombreAdjunto(url)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
