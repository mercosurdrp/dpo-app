"use client"

import { useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { RoturaSkuOption } from "@/types/roturas"

/**
 * Combobox liviano para elegir un SKU del catálogo (chess_articulos).
 * Filtra client-side por código o descripción y muestra hasta 30 resultados.
 * No depende de @/components/ui/command (no existe en este proyecto).
 */
export function SkuCombobox({
  options,
  value,
  onSelect,
  placeholder = "Buscar SKU por código o nombre…",
}: {
  options: RoturaSkuOption[]
  value: RoturaSkuOption | null
  onSelect: (opt: RoturaSkuOption | null) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 30)
    return options
      .filter(
        (o) =>
          String(o.id_articulo).includes(q) ||
          o.des_articulo.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [options, query])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="truncate">
          <span className="font-mono text-xs text-muted-foreground">{value.id_articulo}</span>{" "}
          · {value.des_articulo}
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null)
            setQuery("")
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Cambiar SKU"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>
      {open && resultados.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {resultados.map((o) => (
            <li key={o.id_articulo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(o)
                  setQuery("")
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                )}
              >
                <span className="font-mono text-xs text-muted-foreground">{o.id_articulo}</span>
                <span className="truncate">{o.des_articulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && resultados.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-md">
          Sin resultados
        </div>
      )}
    </div>
  )
}
