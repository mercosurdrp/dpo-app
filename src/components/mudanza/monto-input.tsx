"use client"

import { useState, useTransition } from "react"
import { setPresupuestoTarea } from "@/actions/mudanza"
import { formatMoney } from "./formato"

interface Props {
  tareaId: string
  monto: number | null
  disabled?: boolean
  onSaved: () => void
}

function parse(s: string): number | null {
  const raw = s.replace(/[$\s]/g, "").trim()
  if (!raw) return null
  const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\./g, "")
  const n = Number(norm)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Monto editable en la fila: se guarda al salir del campo o con Enter. */
export function MontoInput({ tareaId, monto, disabled, onSaved }: Props) {
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState("")
  const [error, setError] = useState<string | null>(null)

  function empezar() {
    if (disabled) return
    setTexto(monto != null ? String(monto) : "")
    setEditando(true)
  }
  function guardar() {
    setEditando(false)
    const nuevo = parse(texto)
    if (nuevo === monto || (nuevo === null && monto === null)) return
    setError(null)
    startTransition(async () => {
      const r = await setPresupuestoTarea(tareaId, nuevo)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
    })
  }

  if (editando) {
    return (
      <input
        autoFocus
        inputMode="numeric"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") setEditando(false)
        }}
        className="h-7 w-28 rounded border border-slate-300 px-1 text-right text-xs tabular-nums"
        placeholder="0"
        aria-label="Presupuesto"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={empezar}
      disabled={disabled}
      title={error ?? (disabled ? "Presupuesto" : "Clic para editar")}
      className={`h-7 min-w-[7rem] rounded border border-transparent px-1 text-right text-xs tabular-nums ${
        disabled ? "" : "hover:border-slate-300 hover:bg-slate-50"
      } ${error ? "text-red-600" : monto == null ? "text-slate-400" : ""} ${pending ? "opacity-60" : ""}`}
    >
      {monto == null ? "sin ppto" : formatMoney(monto)}
    </button>
  )
}
