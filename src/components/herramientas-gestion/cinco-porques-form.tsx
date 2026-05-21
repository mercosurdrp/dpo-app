"use client"

import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CincoPorquesContenido } from "@/types/database"

export function cincoPorquesVacio(): CincoPorquesContenido {
  return {
    problema: "",
    porques: [{ pregunta: "¿Por qué ocurrió?", respuesta: "" }],
    causa_raiz: "",
    contramedida: "",
  }
}

interface Props {
  value: CincoPorquesContenido
  onChange: (v: CincoPorquesContenido) => void
}

export function CincoPorquesForm({ value, onChange }: Props) {
  function updatePorque(
    index: number,
    field: "pregunta" | "respuesta",
    text: string,
  ) {
    const updated = value.porques.map((p, i) =>
      i === index ? { ...p, [field]: text } : p,
    )
    onChange({ ...value, porques: updated })
  }

  function agregarPorque() {
    if (value.porques.length >= 5) return
    onChange({
      ...value,
      porques: [
        ...value.porques,
        { pregunta: "¿Por qué ocurrió?", respuesta: "" },
      ],
    })
  }

  function quitarPorque(index: number) {
    if (value.porques.length <= 1) return
    onChange({
      ...value,
      porques: value.porques.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="space-y-4">
      {/* Problema */}
      <div>
        <Label htmlFor="cp-problema">Problema inicial</Label>
        <Textarea
          id="cp-problema"
          value={value.problema}
          onChange={(e) => onChange({ ...value, problema: e.target.value })}
          placeholder="Describí el problema observado…"
          rows={2}
          className="mt-1"
        />
      </div>

      {/* Cadena de porqués */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-slate-700">
          Cadena de &quot;¿Por qué?&quot;
        </Label>
        {value.porques.map((p, i) => (
          <div
            key={i}
            className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Por qué {i + 1}
              </span>
              {value.porques.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarPorque(i)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="Quitar este porqué"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div>
              <Label htmlFor={`cp-pregunta-${i}`} className="text-xs text-slate-500">
                Pregunta
              </Label>
              <Input
                id={`cp-pregunta-${i}`}
                value={p.pregunta}
                onChange={(e) => updatePorque(i, "pregunta", e.target.value)}
                placeholder="¿Por qué ocurrió?"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor={`cp-respuesta-${i}`} className="text-xs text-slate-500">
                Respuesta
              </Label>
              <Textarea
                id={`cp-respuesta-${i}`}
                value={p.respuesta}
                onChange={(e) => updatePorque(i, "respuesta", e.target.value)}
                placeholder="Respuesta…"
                rows={2}
                className="mt-1 text-sm"
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={agregarPorque}
          disabled={value.porques.length >= 5}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar por qué
          {value.porques.length >= 5 && (
            <span className="text-xs text-slate-400">(máx. 5)</span>
          )}
        </Button>
      </div>

      {/* Causa raíz */}
      <div>
        <Label htmlFor="cp-causa-raiz">
          Causa raíz identificada
        </Label>
        <Textarea
          id="cp-causa-raiz"
          value={value.causa_raiz}
          onChange={(e) => onChange({ ...value, causa_raiz: e.target.value })}
          placeholder="¿Cuál es la causa raíz del problema?"
          rows={2}
          className="mt-1 border-amber-200 bg-amber-50 placeholder:text-amber-400 focus-visible:ring-amber-300"
        />
      </div>

      {/* Contramedida */}
      <div>
        <Label htmlFor="cp-contramedida">
          Contramedida propuesta
        </Label>
        <Textarea
          id="cp-contramedida"
          value={value.contramedida}
          onChange={(e) =>
            onChange({ ...value, contramedida: e.target.value })
          }
          placeholder="¿Qué acción se tomará para eliminar la causa raíz?"
          rows={2}
          className="mt-1 border-emerald-200 bg-emerald-50 placeholder:text-emerald-400 focus-visible:ring-emerald-300"
        />
      </div>
    </div>
  )
}
