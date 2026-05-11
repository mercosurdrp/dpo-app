"use client"

import { ChevronDown, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface MultiSelectOption<TValue extends string | number> {
  value: TValue
  label: string
  sublabel?: string
}

/**
 * Multi-select genérico con DropdownMenu + checkboxes. Sin Combobox/cmdk
 * (no instalado en V1). Para listas largas haría falta search — por ahora
 * step 2 usa esto en listas de ≤16 items (motivos, fleteros, canales).
 */
export function FilterMultiSelect<TValue extends string | number>({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: {
  label: string
  placeholder?: string
  options: MultiSelectOption<TValue>[]
  selected: TValue[]
  onChange: (next: TValue[]) => void
}) {
  const selectedSet = new Set(selected)
  const toggle = (v: TValue) => {
    const next = selectedSet.has(v) ? selected.filter(x => x !== v) : [...selected, v]
    onChange(next)
  }
  const triggerLabel =
    selected.length === 0
      ? placeholder ?? "Todos"
      : selected.length === 1
        ? options.find(o => o.value === selected[0])?.label ?? String(selected[0])
        : `${selected.length} seleccionados`

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full justify-between gap-2 px-3 font-normal"
            />
          }
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                className="rounded p-0.5 hover:bg-slate-200"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange([]) }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange([]) } }}
                aria-label="Limpiar"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-72 w-72 overflow-y-auto p-1"
          align="start"
          sideOffset={4}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Sin opciones</div>
          )}
          {options.map(o => {
            const checked = selectedSet.has(o.value)
            return (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              >
                <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border border-slate-300">
                  {checked && <Check className="h-3 w-3 text-slate-900" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{o.label}</span>
                  {o.sublabel && <span className="truncate text-xs text-muted-foreground">{o.sublabel}</span>}
                </span>
              </button>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
