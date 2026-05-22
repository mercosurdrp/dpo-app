"use client"

import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CausaEfectoContenido } from "@/types/database"
import { CAUSA_EFECTO_CATEGORIAS_6M } from "@/lib/herramientas-gestion"

export function causaEfectoVacio(): CausaEfectoContenido {
  return {
    problema: "",
    efecto: "",
    categorias: CAUSA_EFECTO_CATEGORIAS_6M.map((nombre) => ({
      nombre,
      causas: [],
    })),
    causa_raiz: "",
    contramedida: "",
  }
}

interface Props {
  value: CausaEfectoContenido
  onChange: (v: CausaEfectoContenido) => void
}

// Colores sutiles para las 6 categorías 6M
const CATEGORIA_COLORS: Record<string, string> = {
  "Mano de obra": "border-blue-200 bg-blue-50",
  "Método": "border-violet-200 bg-violet-50",
  "Máquina": "border-orange-200 bg-orange-50",
  "Material": "border-teal-200 bg-teal-50",
  "Medición": "border-rose-200 bg-rose-50",
  "Medio ambiente": "border-emerald-200 bg-emerald-50",
}

const CATEGORIA_HEADER_COLORS: Record<string, string> = {
  "Mano de obra": "text-blue-700",
  "Método": "text-violet-700",
  "Máquina": "text-orange-700",
  "Material": "text-teal-700",
  "Medición": "text-rose-700",
  "Medio ambiente": "text-emerald-700",
}

export function CausaEfectoForm({ value, onChange }: Props) {
  function updateCategoriaCausa(
    catIdx: number,
    causaIdx: number,
    text: string,
  ) {
    const categorias = value.categorias.map((cat, ci) => {
      if (ci !== catIdx) return cat
      return {
        ...cat,
        causas: cat.causas.map((c, pi) => (pi === causaIdx ? text : c)),
      }
    })
    onChange({ ...value, categorias })
  }

  function agregarCausa(catIdx: number) {
    const categorias = value.categorias.map((cat, ci) => {
      if (ci !== catIdx) return cat
      return { ...cat, causas: [...cat.causas, ""] }
    })
    onChange({ ...value, categorias })
  }

  function quitarCausa(catIdx: number, causaIdx: number) {
    const categorias = value.categorias.map((cat, ci) => {
      if (ci !== catIdx) return cat
      return { ...cat, causas: cat.causas.filter((_, pi) => pi !== causaIdx) }
    })
    onChange({ ...value, categorias })
  }

  return (
    <div className="space-y-4">
      {/* Efecto / problema observado */}
      <div>
        <Label htmlFor="ce-efecto">Efecto / problema observado</Label>
        <Textarea
          id="ce-efecto"
          value={value.efecto}
          onChange={(e) => onChange({ ...value, efecto: e.target.value })}
          placeholder="Describí el efecto indeseado que se está analizando…"
          rows={2}
          className="mt-1"
        />
      </div>

      {/* Descripción adicional del problema (opcional) */}
      <div>
        <Label htmlFor="ce-problema" className="text-slate-600">
          Contexto adicional{" "}
          <span className="font-normal text-slate-400">(opcional)</span>
        </Label>
        <Textarea
          id="ce-problema"
          value={value.problema}
          onChange={(e) => onChange({ ...value, problema: e.target.value })}
          placeholder="Contexto, cuándo ocurre, frecuencia…"
          rows={2}
          className="mt-1"
        />
      </div>

      {/* Categorías 6M */}
      <div>
        <Label className="text-sm font-medium text-slate-700">
          Causas por categoría (6M)
        </Label>
        <p className="mt-0.5 text-xs text-slate-500">
          Completá las causas detectadas en cada categoría del diagrama.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {value.categorias.map((cat, catIdx) => {
            const colorBorder =
              CATEGORIA_COLORS[cat.nombre] ?? "border-slate-200 bg-slate-50"
            const colorHeader =
              CATEGORIA_HEADER_COLORS[cat.nombre] ?? "text-slate-700"
            return (
              <div
                key={cat.nombre}
                className={`rounded-md border p-3 space-y-2 ${colorBorder}`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${colorHeader}`}
                >
                  {cat.nombre}
                </p>

                {cat.causas.length === 0 && (
                  <p className="text-xs text-slate-400 italic">
                    Sin causas registradas.
                  </p>
                )}

                {cat.causas.map((causa, causaIdx) => (
                  <div key={causaIdx} className="flex items-center gap-1.5">
                    <Input
                      value={causa}
                      onChange={(e) =>
                        updateCategoriaCausa(catIdx, causaIdx, e.target.value)
                      }
                      placeholder={`Causa ${causaIdx + 1}…`}
                      className="text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => quitarCausa(catIdx, causaIdx)}
                      className="shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                      title="Quitar causa"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => agregarCausa(catIdx)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Agregar causa
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Causa raíz priorizada */}
      <div>
        <Label htmlFor="ce-causa-raiz">Causa raíz priorizada</Label>
        <Textarea
          id="ce-causa-raiz"
          value={value.causa_raiz}
          onChange={(e) => onChange({ ...value, causa_raiz: e.target.value })}
          placeholder="De todas las causas, ¿cuál es la raíz más probable?"
          rows={2}
          className="mt-1 border-amber-200 bg-amber-50 placeholder:text-amber-400 focus-visible:ring-amber-300"
        />
      </div>

      {/* Contraacción */}
      <div>
        <Label htmlFor="ce-contramedida">Contraacción</Label>
        <Textarea
          id="ce-contramedida"
          value={value.contramedida}
          onChange={(e) => onChange({ ...value, contramedida: e.target.value })}
          placeholder="Acción para eliminar la causa raíz y evitar que se repita"
          rows={2}
          className="mt-1 border-emerald-200 bg-emerald-50 placeholder:text-emerald-400 focus-visible:ring-emerald-300"
        />
      </div>
    </div>
  )
}
