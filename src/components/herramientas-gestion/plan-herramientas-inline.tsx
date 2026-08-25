"use client"

import { useEffect, useState } from "react"
import { Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { IS_MISIONES } from "@/lib/empresa"
import {
  listarHerramientasPlan,
  listarHerramientasActividad,
  listarHerramientasOt,
  listarHerramientasPlanFlota,
} from "@/actions/herramientas-gestion"
import { HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"
import { HerramientaGestionDialog } from "./herramienta-gestion-dialog"
import { HerramientaGestionView } from "./herramienta-gestion-view"
import type { HerramientaGestionConContexto } from "@/types/database"

/**
 * Tira compacta para ver/aplicar herramientas de gestión sobre un plan, una
 * actividad de reunión, una OT de flota o el plan de acción de un KPI de flota.
 * Pasar exactamente UNO de los cuatro ids. Solo Pampeana.
 */
export function PlanHerramientasInline({
  planId,
  reunionActividadId,
  mantenimientoId,
  flotaPlanId,
  tituloSugerido,
  puedeAplicar = true,
}: {
  planId?: string
  reunionActividadId?: string
  /** OT de flota: acá se busca la causa raíz del correctivo que se repite. */
  mantenimientoId?: string
  /** Plan de acción de un KPI de flota en rojo. */
  flotaPlanId?: string
  tituloSugerido?: string
  puedeAplicar?: boolean
}) {
  const [items, setItems] = useState<HerramientaGestionConContexto[]>([])
  const [aplicar, setAplicar] = useState(false)
  const [ver, setVer] = useState<HerramientaGestionConContexto | null>(null)

  function recargar() {
    const p = planId
      ? listarHerramientasPlan(planId)
      : reunionActividadId
        ? listarHerramientasActividad(reunionActividadId)
        : mantenimientoId
          ? listarHerramientasOt(mantenimientoId)
          : flotaPlanId
            ? listarHerramientasPlanFlota(flotaPlanId)
            : null
    p?.then((r) => {
      if ("data" in r) setItems(r.data)
    })
  }

  useEffect(() => {
    if (!IS_MISIONES && (planId || reunionActividadId || mantenimientoId || flotaPlanId)) {
      recargar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, reunionActividadId, mantenimientoId, flotaPlanId])

  if (IS_MISIONES) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 pt-2 text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Wrench className="h-3 w-3" />
        Gestión:
      </span>

      {items.length === 0 ? (
        <span className="text-slate-400">sin análisis</span>
      ) : (
        items.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setVer(h)}
            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 transition-colors hover:bg-slate-100"
            title={h.titulo || HERRAMIENTA_GESTION_LABELS[h.tipo]}
          >
            {HERRAMIENTA_GESTION_LABELS[h.tipo]}
          </button>
        ))
      )}

      {puedeAplicar && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-blue-600 hover:text-blue-700"
          onClick={() => setAplicar(true)}
        >
          + Aplicar
        </Button>
      )}

      <HerramientaGestionDialog
        planId={planId}
        reunionActividadId={reunionActividadId}
        mantenimientoId={mantenimientoId}
        flotaPlanId={flotaPlanId}
        tituloSugerido={tituloSugerido}
        open={aplicar}
        onOpenChange={setAplicar}
        onSaved={recargar}
      />

      <Dialog open={ver !== null} onOpenChange={(o) => !o && setVer(null)}>
        <DialogContent
          className={`max-h-[85vh] overflow-y-auto ${
            ver?.tipo === "pdca" ? "max-w-5xl" : "max-w-2xl"
          }`}
        >
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
