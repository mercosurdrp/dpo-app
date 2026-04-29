"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getEmpleadosDisponibles,
  linkUserToEmpleado,
  unlinkUserFromEmpleado,
  getUserEmpleado,
  updateEmpleadoSector,
  EMPLEADO_SECTORES,
  type EmpleadoOption,
  type EmpleadoSector,
} from "@/actions/admin-empleado-link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Props = {
  userId: string
  /** Optional hint — we still hydrate from server to keep data fresh. */
  currentEmpleadoId?: string | null
  /** Called after a successful link/unlink. */
  onLinked?: () => void
}

export function EmpleadoPicker({ userId, currentEmpleadoId, onLinked }: Props) {
  const [open, setOpen] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [options, setOptions] = useState<EmpleadoOption[]>([])
  const [current, setCurrent] = useState<EmpleadoOption | null>(null)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const [savingSector, startSectorTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Hydrate current link.
  useEffect(() => {
    let cancelled = false
    setLoadingCurrent(true)
    getUserEmpleado(userId)
      .then((res) => {
        if (cancelled) return
        if ("error" in res) {
          toast.error(res.error)
          setCurrent(null)
        } else {
          setCurrent(res.data)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCurrent(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, currentEmpleadoId])

  // Load available empleados when dropdown opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingList(true)
    getEmpleadosDisponibles()
      .then((res) => {
        if (cancelled) return
        if ("error" in res) {
          toast.error(res.error)
          setOptions([])
        } else {
          setOptions(res.data)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Focus search when opening.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = [o.nombre, o.legajo ?? "", o.sector ?? ""]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  function handleSelect(option: EmpleadoOption) {
    startTransition(async () => {
      const res = await linkUserToEmpleado(userId, option.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Empleado vinculado: ${option.nombre}`)
      setCurrent(option)
      setQuery("")
      setOpen(false)
      onLinked?.()
    })
  }

  function handleSectorChange(next: EmpleadoSector) {
    if (!current) return
    const prev = current
    setCurrent({ ...current, sector: next })
    startSectorTransition(async () => {
      const res = await updateEmpleadoSector(current.id, next)
      if ("error" in res) {
        toast.error(res.error)
        setCurrent(prev)
        return
      }
      toast.success(`Sector actualizado: ${next}`)
      onLinked?.()
    })
  }

  function handleUnlink() {
    startTransition(async () => {
      const res = await unlinkUserFromEmpleado(userId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Vínculo removido")
      setCurrent(null)
      setOpen(false)
      onLinked?.()
    })
  }

  const disabled = isPending || loadingCurrent

  return (
    <div className="space-y-2" ref={rootRef}>
      <Label>Empleado asociado</Label>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-2">
            {loadingCurrent ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
            {current ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{current.nombre}</span>
                {current.legajo ? (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    #{current.legajo}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {loadingCurrent ? "Cargando…" : "Seleccionar empleado…"}
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open ? (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="flex items-center gap-2 border-b px-2 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, legajo o sector…"
                className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {loadingList ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando empleados…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {options.length === 0
                    ? "No hay empleados disponibles"
                    : "Sin resultados"}
                </div>
              ) : (
                <ul role="listbox" className="flex flex-col">
                  {filtered.map((opt) => {
                    const isCurrent = current?.id === opt.id
                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSelect(opt)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          role="option"
                          aria-selected={isCurrent}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">
                              {opt.nombre}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {opt.legajo ? `Legajo ${opt.legajo}` : "Sin legajo"}
                              {opt.sector ? ` · ${opt.sector}` : ""}
                            </span>
                          </span>
                          {isCurrent ? (
                            <Check className="h-4 w-4 shrink-0 text-primary" />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {current ? (
              <div className="flex items-center justify-between gap-2 border-t px-2 py-2">
                <span className="text-xs text-muted-foreground">
                  Vinculado a {current.nombre}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={handleUnlink}
                >
                  {isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="mr-1 h-3.5 w-3.5" />
                  )}
                  Quitar vínculo
                </Button>
              </div>
            ) : (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                Sin vincular
              </div>
            )}
          </div>
        ) : null}
      </div>

      {current ? (
        <div className="space-y-1.5">
          <Label>Sector</Label>
          <Select
            value={current.sector ?? "Sin asignar"}
            onValueChange={(v) => handleSectorChange(v as EmpleadoSector)}
            disabled={savingSector}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLEADO_SECTORES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {savingSector && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando…
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default EmpleadoPicker
