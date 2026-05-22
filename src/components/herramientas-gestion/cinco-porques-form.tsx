"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CincoPorquesContenido } from "@/types/database"

const CANT = 5

export function cincoPorquesVacio(): CincoPorquesContenido {
  return {
    problema: "",
    porques: Array.from({ length: CANT }, () => ({ pregunta: "", respuesta: "" })),
    causa_raiz: "",
    contramedida: "",
  }
}

// La pregunta del Por qué N se deriva del paso anterior (problema o respuesta N-1).
function preguntaDe(fuente: string): string {
  const f = (fuente ?? "").trim()
  return f ? `¿Por qué ${f}?` : ""
}

interface Props {
  value: CincoPorquesContenido
  onChange: (v: CincoPorquesContenido) => void
}

/**
 * 5 Porqués encadenado: el usuario escribe el problema y las respuestas; cada
 * pregunta se arma sola desde la respuesta anterior, y la causa raíz es la
 * última respuesta cargada (ambas de solo lectura).
 */
export function CincoPorquesForm({ value, onChange }: Props) {
  const respuestas = Array.from(
    { length: CANT },
    (_, i) => value.porques?.[i]?.respuesta ?? "",
  )

  function emit(problema: string, resp: string[], contramedida: string) {
    const porques = resp.map((respuesta, i) => ({
      pregunta: preguntaDe(i === 0 ? problema : resp[i - 1]),
      respuesta,
    }))
    let causa_raiz = ""
    for (let i = resp.length - 1; i >= 0; i--) {
      if (resp[i].trim()) {
        causa_raiz = resp[i].trim()
        break
      }
    }
    onChange({ problema, porques, causa_raiz, contramedida })
  }

  return (
    <div className="space-y-4">
      {/* Problema (a completar) */}
      <div>
        <Label htmlFor="cp-problema">Problema</Label>
        <Textarea
          id="cp-problema"
          value={value.problema}
          onChange={(e) => emit(e.target.value, respuestas, value.contramedida)}
          placeholder="Describí el problema concreto que se va a analizar…"
          rows={2}
          className="mt-1"
        />
      </div>

      {/* Cadena de porqués: pregunta automática + respuesta a completar */}
      <div className="space-y-2.5">
        {respuestas.map((resp, i) => {
          const fuente = i === 0 ? value.problema : respuestas[i - 1]
          const pregunta = preguntaDe(fuente)
          const habilitado = (fuente ?? "").trim().length > 0
          return (
            <div
              key={i}
              className={`rounded-md border p-3 ${
                habilitado
                  ? "border-slate-200 bg-slate-50"
                  : "border-dashed border-slate-200 opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                <p className="text-sm font-medium text-slate-700">
                  {pregunta || "Completá el paso anterior"}
                </p>
              </div>
              <Textarea
                value={resp}
                disabled={!habilitado}
                onChange={(e) => {
                  const next = [...respuestas]
                  next[i] = e.target.value
                  emit(value.problema, next, value.contramedida)
                }}
                placeholder={
                  habilitado
                    ? "Tu respuesta…"
                    : "Respondé el «por qué» anterior primero"
                }
                rows={2}
                className="mt-2 text-sm"
              />
            </div>
          )
        })}
      </div>

      {/* Causa raíz automática (= última respuesta) */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Causa raíz (última respuesta)
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
          {value.causa_raiz || (
            <span className="italic text-amber-700/60">
              Se completa sola con la última respuesta que cargues.
            </span>
          )}
        </p>
      </div>

      {/* Contramedida (a completar) */}
      <div>
        <Label htmlFor="cp-contramedida">Contramedida propuesta</Label>
        <Textarea
          id="cp-contramedida"
          value={value.contramedida}
          onChange={(e) => emit(value.problema, respuestas, e.target.value)}
          placeholder="¿Qué acción se tomará para eliminar la causa raíz?"
          rows={2}
          className="mt-1 border-emerald-200 bg-emerald-50 placeholder:text-emerald-400 focus-visible:ring-emerald-300"
        />
      </div>
    </div>
  )
}
