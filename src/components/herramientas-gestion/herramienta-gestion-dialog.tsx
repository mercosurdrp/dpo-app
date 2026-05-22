"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"
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
} from "@/actions/herramientas-gestion"
import { CincoPorquesForm, cincoPorquesVacio } from "./cinco-porques-form"
import { CausaEfectoForm, causaEfectoVacio } from "./causa-efecto-form"
import { PdcaForm, pdcaVacio } from "./pdca-form"

// Íconos textuales por tipo
const TIPO_ICON: Record<HerramientaGestionTipo, string> = {
  cinco_porques: "5P",
  causa_efecto: "CE",
  pdca: "PDCA",
}

// Colores para el selector de burbujas
const TIPO_COLORS: Record<
  HerramientaGestionTipo,
  { active: string; inactive: string }
> = {
  cinco_porques: {
    active: "border-blue-500 bg-blue-50 text-blue-700",
    inactive: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  },
  causa_efecto: {
    active: "border-violet-500 bg-violet-50 text-violet-700",
    inactive: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  },
  pdca: {
    active: "border-emerald-500 bg-emerald-50 text-emerald-700",
    inactive: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  },
}

function contenidoVacioPorTipo(t: HerramientaGestionTipo): HerramientaGestionContenido {
  if (t === "cinco_porques") return cincoPorquesVacio()
  if (t === "causa_efecto") return causaEfectoVacio()
  return pdcaVacio()
}

export interface HerramientaGestionDialogProps {
  /** Target = plan. Pasar planId O reunionActividadId (no ambos). */
  planId?: string
  /** Target = actividad de reunión. */
  reunionActividadId?: string
  open: boolean
  onOpenChange: (o: boolean) => void
  herramienta?: HerramientaGestionConContexto | null
  onSaved?: () => void
}

export function HerramientaGestionDialog({
  planId,
  reunionActividadId,
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

  // Sincronizar estado cuando cambia la herramienta (por si se re-abre con otra)
  useEffect(() => {
    if (open) {
      setTipo(herramienta?.tipo ?? null)
      setTitulo(herramienta?.titulo ?? "")
      setContenido(
        herramienta?.contenido ??
          (null as unknown as HerramientaGestionContenido),
      )
    }
  }, [open, herramienta])

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
      // Reset solo al cerrar
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
      } else if (planId) {
        res = await crearHerramientaGestion(planId, tipo, titulo.trim(), contenido)
      } else {
        toast.error("Falta el destino (plan o actividad)")
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
      // Reset estado
      setTipo(null)
      setTitulo("")
      setContenido(null as unknown as HerramientaGestionContenido)
    })
  }

  const tituloDialog = modoEdicion
    ? `Editar — ${HERRAMIENTA_GESTION_LABELS[herramienta!.tipo]}`
    : tipo
      ? HERRAMIENTA_GESTION_LABELS[tipo]
      : "Nueva herramienta de gestión"

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tituloDialog}</DialogTitle>
        </DialogHeader>

        {/* ── PASO 1: selección de tipo (solo modo nuevo sin tipo elegido) ─── */}
        {!tipo && !modoEdicion && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-500">
              Elegí la herramienta de análisis que querés aplicar:
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {HERRAMIENTA_GESTION_TIPOS.map((t) => {
                const colors = TIPO_COLORS[t]
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleElegirTipo(t)}
                    className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors ${colors.inactive}`}
                  >
                    <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {TIPO_ICON[t]}
                    </span>
                    <span className="text-sm font-semibold">
                      {HERRAMIENTA_GESTION_LABELS[t]}
                    </span>
                    <span className="text-xs text-slate-500 leading-snug">
                      {HERRAMIENTA_GESTION_DESCRIPCIONES[t]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── PASO 2: formulario del tipo elegido ─────────────────────────── */}
        {tipo && (
          <div className="space-y-4 py-2">
            {/* Indicador de tipo + botón volver (solo modo nuevo) */}
            {!modoEdicion && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVolver}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Cambiar tipo
                </button>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {TIPO_ICON[tipo]}
                </span>
                <span className="text-xs text-slate-500">
                  {HERRAMIENTA_GESTION_LABELS[tipo]}
                </span>
              </div>
            )}

            {/* Título */}
            <div>
              <Label htmlFor="hg-titulo">
                Título / Problema a analizar
                <span className="ml-1 text-red-500">*</span>
              </Label>
              <Input
                id="hg-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Rechazos reiterados en zona norte…"
                className="mt-1"
                autoFocus
              />
            </div>

            {/* Form específico */}
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
              {submitting && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {modoEdicion ? "Actualizar" : "Guardar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
