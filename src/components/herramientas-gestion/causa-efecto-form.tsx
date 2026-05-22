"use client"

import { Plus, X } from "lucide-react"
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
      causas: [""], // cada M arranca con un campo de causa listo para completar
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
  function updateCategoriaCausa(catIdx: number, causaIdx: number, text: string) {
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

  // Tarjeta de una M (espina del diagrama)
  function renderCategoria(catIdx: number) {
    const cat = value.categorias[catIdx]
    if (!cat) return null
    const colorBorder =
      CATEGORIA_COLORS[cat.nombre] ?? "border-slate-200 bg-slate-50"
    const colorHeader = CATEGORIA_HEADER_COLORS[cat.nombre] ?? "text-slate-700"
    return (
      <div
        key={cat.nombre}
        className={`space-y-1.5 rounded-md border p-2.5 ${colorBorder}`}
      >
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide ${colorHeader}`}
        >
          {cat.nombre}
        </p>

        {cat.causas.map((causa, causaIdx) => (
          <div key={causaIdx} className="flex items-center gap-1">
            <Input
              value={causa}
              onChange={(e) =>
                updateCategoriaCausa(catIdx, causaIdx, e.target.value)
              }
              placeholder={`Causa ${causaIdx + 1}…`}
              className="h-8 bg-white text-sm"
            />
            {cat.causas.length > 1 && (
              <button
                type="button"
                onClick={() => quitarCausa(catIdx, causaIdx)}
                className="shrink-0 text-slate-400 transition-colors hover:text-red-500"
                title="Quitar causa"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => agregarCausa(catIdx)}
          className="flex items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-slate-800"
        >
          <Plus className="h-3 w-3" />
          Agregar causa
        </button>
      </div>
    )
  }

  const efectoCorto = value.efecto.trim()
    ? value.efecto.trim().slice(0, 36) +
      (value.efecto.trim().length > 36 ? "…" : "")
    : "PROBLEMA"

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

      {/* Contexto adicional (opcional) */}
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

      {/* Diagrama de causas (6M) — disposición de espina de pescado */}
      <div>
        <Label className="text-sm font-medium text-slate-700">
          Diagrama de causas (6M)
        </Label>
        <p className="mt-0.5 text-xs text-slate-500">
          Completá las causas de cada categoría, ordenadas como en la espina de
          pescado: 3 arriba y 3 abajo de la espina, que apunta al problema.
        </p>

        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
          {/* Fila superior: Mano de obra · Método · Máquina */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[0, 1, 2].map(renderCategoria)}
          </div>

          {/* Espina central + cabeza (problema) */}
          <div className="my-3 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-300" />
            <span
              className="shrink-0 rounded-md bg-slate-800 px-3 py-1 text-xs font-semibold text-white"
              title={value.efecto || "Problema"}
            >
              {efectoCorto} ▸
            </span>
          </div>

          {/* Fila inferior: Material · Medición · Medio ambiente */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[3, 4, 5].map(renderCategoria)}
          </div>
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
