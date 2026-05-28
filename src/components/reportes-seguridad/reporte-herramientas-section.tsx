"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Wrench, Pencil, Trash2, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  listarHerramientasReporte,
  eliminarHerramientaGestion,
} from "@/actions/herramientas-gestion"
import { HerramientaGestionDialog } from "@/components/herramientas-gestion/herramienta-gestion-dialog"
import { HerramientaGestionView } from "@/components/herramientas-gestion/herramienta-gestion-view"
import {
  HERRAMIENTA_GESTION_LABELS,
} from "@/lib/herramientas-gestion"
import type {
  HerramientaGestionConContexto,
  UserRole,
} from "@/types/database"

interface Props {
  reporteId: string
  reporteDescripcion?: string | null
  reporteCreadoPor: string
  currentProfileId: string
  currentRole: UserRole
}

function puedeGestionar(role: UserRole, profileId: string, creadoPor: string): boolean {
  if (["admin", "supervisor", "admin_rrhh"].includes(role)) return true
  return profileId === creadoPor
}

export function ReporteHerramientasSection({
  reporteId,
  reporteDescripcion,
  reporteCreadoPor,
  currentProfileId,
  currentRole,
}: Props) {
  const [items, setItems] = useState<HerramientaGestionConContexto[]>([])
  const [cargando, setCargando] = useState(true)
  const [aplicarOpen, setAplicarOpen] = useState(false)
  const [editar, setEditar] = useState<HerramientaGestionConContexto | null>(null)
  const [ver, setVer] = useState<HerramientaGestionConContexto | null>(null)
  const [eliminando, startEliminar] = useTransition()

  const puede = puedeGestionar(currentRole, currentProfileId, reporteCreadoPor)

  function recargar() {
    setCargando(true)
    listarHerramientasReporte(reporteId).then((r) => {
      if ("data" in r) {
        setItems(r.data)
      } else {
        toast.error(r.error)
      }
      setCargando(false)
    })
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reporteId])

  function handleEliminar(h: HerramientaGestionConContexto) {
    if (
      !confirm(
        `¿Eliminar el análisis "${h.titulo || HERRAMIENTA_GESTION_LABELS[h.tipo]}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    startEliminar(async () => {
      const res = await eliminarHerramientaGestion(h.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Análisis eliminado")
      recargar()
    })
  }

  // Título sugerido para el diálogo: usar la descripción del reporte (acotada).
  const tituloSugerido = reporteDescripcion
    ? reporteDescripcion.length > 80
      ? reporteDescripcion.slice(0, 80) + "…"
      : reporteDescripcion
    : undefined

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Wrench className="size-4 text-slate-500" />
          Herramientas de gestión aplicadas
        </Label>
        {puede && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAplicarOpen(true)}
            className="h-8 gap-1.5"
          >
            <Plus className="size-3.5" />
            Aplicar herramienta de gestión
          </Button>
        )}
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Cargando análisis…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-muted-foreground">
          Sin análisis aplicados a este reporte.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-2"
            >
              <button
                type="button"
                onClick={() => setVer(h)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="truncate text-sm font-medium text-slate-800">
                  {h.titulo || HERRAMIENTA_GESTION_LABELS[h.tipo]}
                </p>
                <p className="text-[11px] text-slate-500">
                  {HERRAMIENTA_GESTION_LABELS[h.tipo]}
                  {h.autor_nombre ? ` · por ${h.autor_nombre}` : ""}
                </p>
              </button>
              {puede && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setEditar(h)}
                    disabled={eliminando}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-red-600 hover:text-red-700"
                    onClick={() => handleEliminar(h)}
                    disabled={eliminando}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Diálogo crear */}
      <HerramientaGestionDialog
        reporteId={reporteId}
        tituloSugerido={tituloSugerido}
        open={aplicarOpen}
        onOpenChange={setAplicarOpen}
        onSaved={recargar}
      />

      {/* Diálogo editar */}
      <HerramientaGestionDialog
        reporteId={reporteId}
        tituloSugerido={tituloSugerido}
        open={editar !== null}
        onOpenChange={(o) => {
          if (!o) setEditar(null)
        }}
        herramienta={editar}
        onSaved={recargar}
      />

      {/* Diálogo ver */}
      <Dialog open={ver !== null} onOpenChange={(o) => !o && setVer(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {ver
                ? HERRAMIENTA_GESTION_LABELS[ver.tipo]
                : "Herramienta de gestión"}
            </DialogTitle>
          </DialogHeader>
          {ver && <HerramientaGestionView herramienta={ver} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
