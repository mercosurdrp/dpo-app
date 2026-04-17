"use client"

import { useMemo, useState } from "react"
import { Plus, Lightbulb, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SugerenciaCard } from "@/components/sugerencias/sugerencia-card"
import { NuevaSugerenciaDialog } from "@/components/sugerencias/nueva-sugerencia-dialog"
import { SugerenciaDetalleDialog } from "@/components/sugerencias/sugerencia-detalle-dialog"
import {
  SUGERENCIA_ESTADO_LABELS,
  SUGERENCIA_ESTADO_COLORS,
  type SugerenciaConAutor,
  type SugerenciaEstado,
  type UserRole,
} from "@/types/database"

const COLUMNAS_VISIBLES: SugerenciaEstado[] = [
  "nuevo",
  "en_analisis",
  "en_desarrollo",
  "en_testeo",
  "ok",
]

export function SugerenciasClient({
  sugerencias,
  currentProfileId,
  currentRole,
}: {
  sugerencias: SugerenciaConAutor[]
  currentProfileId: string
  currentRole: UserRole
}) {
  const [openNueva, setOpenNueva] = useState(false)
  const [detalle, setDetalle] = useState<SugerenciaConAutor | null>(null)
  const [mostrarRechazadas, setMostrarRechazadas] = useState(false)

  const porEstado = useMemo(() => {
    const base: Record<SugerenciaEstado, SugerenciaConAutor[]> = {
      nuevo: [],
      en_analisis: [],
      en_desarrollo: [],
      en_testeo: [],
      ok: [],
      rechazado: [],
    }
    for (const s of sugerencias) {
      base[s.estado].push(s)
    }
    return base
  }, [sugerencias])

  const totalRechazadas = porEstado.rechazado.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Lightbulb className="size-6 text-amber-500" />
            Sugerencias y Mejoras
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reportá bugs, datos incorrectos o ideas para mejorar la app.
          </p>
        </div>
        <Button onClick={() => setOpenNueva(true)}>
          <Plus className="mr-2 size-4" />
          Nueva sugerencia
        </Button>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNAS_VISIBLES.map((estado) => {
          const items = porEstado[estado]
          return (
            <div
              key={estado}
              className="flex flex-col rounded-lg border bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: SUGERENCIA_ESTADO_COLORS[estado] }}
                  />
                  <h2 className="text-sm font-semibold text-slate-800">
                    {SUGERENCIA_ESTADO_LABELS[estado]}
                  </h2>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 min-h-[60px]">
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-white/60 p-3 text-center text-xs text-muted-foreground">
                    Sin tickets
                  </p>
                ) : (
                  items.map((s) => (
                    <SugerenciaCard
                      key={s.id}
                      sugerencia={s}
                      onClick={() => setDetalle(s)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Rechazadas (colapsable) */}
      {totalRechazadas > 0 && (
        <div className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setMostrarRechazadas((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              {mostrarRechazadas ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              Rechazadas
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{
                  backgroundColor: SUGERENCIA_ESTADO_COLORS.rechazado,
                }}
              >
                {totalRechazadas}
              </span>
            </span>
          </button>
          {mostrarRechazadas && (
            <div className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
              {porEstado.rechazado.map((s) => (
                <SugerenciaCard
                  key={s.id}
                  sugerencia={s}
                  onClick={() => setDetalle(s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <NuevaSugerenciaDialog open={openNueva} onOpenChange={setOpenNueva} />
      {detalle && (
        <SugerenciaDetalleDialog
          key={detalle.id}
          sugerencia={detalle}
          open={true}
          onOpenChange={(v) => {
            if (!v) setDetalle(null)
          }}
          currentProfileId={currentProfileId}
          currentRole={currentRole}
        />
      )}
    </div>
  )
}
