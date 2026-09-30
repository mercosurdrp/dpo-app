"use client"

import { useState, useTransition } from "react"
import { setAvanceTarea } from "@/actions/mudanza"

const PASOS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

interface Props {
  tareaId: string
  avance: number
  disabled?: boolean
  onSaved: () => void
  className?: string
}

/** Desplegable de avance de 10 en 10, guarda al cambiar. */
export function AvanceSelect({ tareaId, avance, disabled, onSaved, className }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [valor, setValor] = useState(avance)

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nuevo = Number(e.target.value)
    setValor(nuevo)
    setError(null)
    startTransition(async () => {
      const r = await setAvanceTarea(tareaId, nuevo)
      if ("error" in r) {
        setError(r.error)
        setValor(avance)
        return
      }
      onSaved()
    })
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <select
        value={valor}
        onChange={onChange}
        disabled={disabled || pending}
        title={error ?? "Avance"}
        aria-label="Avance"
        className={`h-7 rounded border bg-white px-1 text-xs tabular-nums ${
          error ? "border-red-400" : "border-slate-200"
        } ${pending ? "opacity-60" : ""}`}
      >
        {PASOS.map((p) => (
          <option key={p} value={p}>
            {p} %
          </option>
        ))}
      </select>
    </span>
  )
}
