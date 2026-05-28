"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Check,
  HelpCircle,
  Fish,
  RefreshCw,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  HerramientaGestionTipo,
  HerramientaGestionContenido,
  HerramientaGestionConContexto,
} from "@/types/database"
import {
  HERRAMIENTA_GESTION_TIPOS,
  HERRAMIENTA_GESTION_LABELS,
  HERRAMIENTA_GESTION_DESCRIPCIONES,
} from "@/lib/herramientas-gestion"
import {
  crearHerramientaGestion,
  actualizarHerramientaGestion,
  crearHerramientaActividad,
  crearHerramientaReporte,
} from "@/actions/herramientas-gestion"
import { CincoPorquesForm, cincoPorquesVacio } from "./cinco-porques-form"
import { CausaEfectoForm, causaEfectoVacio } from "./causa-efecto-form"
import { PdcaForm, pdcaVacio } from "./pdca-form"

const TIPO_ICON: Record<HerramientaGestionTipo, LucideIcon> = {
  cinco_porques: HelpCircle,
  causa_efecto: Fish,
  pdca: RefreshCw,
}

// Acento de color por herramienta (ícono + hover de la tarjeta)
const TIPO_STYLE: Record<
  HerramientaGestionTipo,
  { icon: string; ring: string }
> = {
  cinco_porques: {
    icon: "text-blue-600 bg-blue-50",
    ring: "hover:border-blue-400 hover:bg-blue-50/50",
  },
  causa_efecto: {
    icon: "text-violet-600 bg-violet-50",
    ring: "hover:border-violet-400 hover:bg-violet-50/50",
  },
  pdca: {
    icon: "text-emerald-600 bg-emerald-50",
    ring: "hover:border-emerald-400 hover:bg-emerald-50/50",
  },
}

function contenidoVacioPorTipo(t: HerramientaGestionTipo): HerramientaGestionContenido {
  if (t === "cinco_porques") return cincoPorquesVacio()
  if (t === "causa_efecto") return causaEfectoVacio()
  return pdcaVacio()
}

export interface HerramientaGestionDialogProps {
  /** Target = plan. Pasar exactamente uno de planId / reunionActividadId / reporteId. */
  planId?: string
  /** Target = actividad de reunión. */
  reunionActividadId?: string
  /** Target = reporte de seguridad. */
  reporteId?: string
  /** Título prellenado al crear (nombre del plan / actividad / descripción del reporte). */
  tituloSugerido?: string
  open: boolean
  onOpenChange: (o: boolean) => void
  herramienta?: HerramientaGestionConContexto | null
  onSaved?: () => void
}

export function HerramientaGestionDialog({
  planId,
  reunionActividadId,
  reporteId,
  tituloSugerido,
  open,
  onOpenChange,
  herramienta,
  onSaved,
}: HerramientaGestionDialogProps) {
  const modoEdicion = !!herramienta

  const [tipo, setTipo] = useState<HerramientaGestionTipo | null>(
    herramienta?.tipo ?? null,
  )
  const [titulo, setTitulo] = useState<string>(herramienta?.titulo ?? "")
  const [contenido, setContenido] = useState<HerramientaGestionContenido>(
    herramienta?.contenido ?? (null as unknown as HerramientaGestionContenido),
  )
  const [submitting, startSubmit] = useTransition()

  // Sincronizar estado cuando cambia la herramienta o se reabre
  useEffect(() => {
    if (open) {
      setTipo(herramienta?.tipo ?? null)
      setTitulo(herramienta?.titulo ?? tituloSugerido ?? "")
      setContenido(
        herramienta?.contenido ??
          (null as unknown as HerramientaGestionContenido),
      )
    }
  }, [open, herramienta, tituloSugerido])

  function handleElegirTipo(t: HerramientaGestionTipo) {
    setTipo(t)
    setContenido(contenidoVacioPorTipo(t))
  }

  function handleVolver() {
    setTipo(null)
    setContenido(null as unknown as HerramientaGestionContenido)
  }

  function handleClose(o: boolean) {
    if (!o) {
      setTipo(null)
      setTitulo("")
      setContenido(null as unknown as HerramientaGestionContenido)
    }
    onOpenChange(o)
  }

  function handleGuardar() {
    if (!tipo) return
    if (!titulo.trim()) {
      toast.error("El título es obligatorio")
      return
    }

    startSubmit(async () => {
      let res
      if (modoEdicion && herramienta) {
        res = await actualizarHerramientaGestion(
          herramienta.id,
          titulo.trim(),
          contenido,
        )
      } else if (reunionActividadId) {
        res = await crearHerramientaActividad(
          reunionActividadId,
          tipo,
          titulo.trim(),
          contenido,
        )
      } else if (reporteId) {
        res = await crearHerramientaReporte(
          reporteId,
          tipo,
          titulo.trim(),
          contenido,
        )
      } else if (planId) {
        res = await crearHerramientaGestion(planId, tipo, titulo.trim(), contenido)
      } else {
        toast.error("Falta el destino (plan, actividad o reporte)")
        return
      }

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success(
        modoEdicion
          ? "Herramienta actualizada correctamente"
          : "Herramienta de gestión creada correctamente",
      )
      onSaved?.()
      onOpenChange(false)
      setTipo(null)
      setTitulo("")
      setContenido(null as unknown as HerramientaGestionContenido)
    })
  }

  const Icono = tipo ? TIPO_ICON[tipo] : null
  const tituloDialog = modoEdicion
    ? `Editar — ${HERRAMIENTA_GESTION_LABELS[herramienta!.tipo]}`
    : tipo
      ? HERRAMIENTA_GESTION_LABELS[tipo]
      : "Aplicar herramienta de gestión"

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tipo && Icono && (
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${TIPO_STYLE[tipo].icon}`}
              >
                <Icono className="h-4 w-4" />
              </span>
            )}
            {tituloDialog}
          </DialogTitle>
          {!modoEdicion && (
            <p className="text-xs font-medium text-slate-400">
              {tipo
                ? "Paso 2 de 2 · Completá el análisis"
                : "Paso 1 de 2 · Elegí la herramienta"}
            </p>
          )}
        </DialogHeader>

        {/* ── PASO 1: elegir herramienta ──────────────────────────────────── */}
        {!tipo && !modoEdicion && (
          <div className="grid gap-3 py-2 sm:grid-cols-3">
            {HERRAMIENTA_GESTION_TIPOS.map((t) => {
              const I = TIPO_ICON[t]
              const s = TIPO_STYLE[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleElegirTipo(t)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-4 text-center transition-colors ${s.ring}`}
                >
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${s.icon}`}
                  >
                    <I className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {HERRAMIENTA_GESTION_LABELS[t]}
                  </span>
                  <span className="text-xs leading-snug text-slate-500">
                    {HERRAMIENTA_GESTION_DESCRIPCIONES[t]}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── PASO 2: formulario ──────────────────────────────────────────── */}
        {tipo && (
          <div className="space-y-4 py-2">
            {!modoEdicion && (
              <button
                type="button"
                onClick={handleVolver}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Cambiar herramienta
              </button>
            )}

            <div>
              <Label htmlFor="hg-titulo">
                Título
                <span className="ml-1 text-red-500">*</span>
              </Label>
              <Input
                id="hg-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Nombre corto del análisis"
                className="mt-1"
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-400">
                Lo prellenamos con el nombre de la tarea/actividad; podés ajustarlo.
              </p>
            </div>

            {tipo === "cinco_porques" && contenido && (
              <CincoPorquesForm
                value={contenido as ReturnType<typeof cincoPorquesVacio>}
                onChange={setContenido}
              />
            )}
            {tipo === "causa_efecto" && contenido && (
              <CausaEfectoForm
                value={contenido as ReturnType<typeof causaEfectoVacio>}
                onChange={setContenido}
              />
            )}
            {tipo === "pdca" && contenido && (
              <PdcaForm
                value={contenido as ReturnType<typeof pdcaVacio>}
                onChange={setContenido}
              />
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          {tipo && (
            <Button
              type="button"
              onClick={handleGuardar}
              disabled={submitting || !titulo.trim()}
            >
              {submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {modoEdicion ? "Actualizar" : "Guardar análisis"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
