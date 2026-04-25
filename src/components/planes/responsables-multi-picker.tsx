"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Crown, Loader2, Plus, Search, Star, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addResponsable,
  removeResponsable,
  setResponsablePrincipal,
  searchProfilesParaResponsable,
} from "@/actions/planes"
import type {
  PlanResponsableConProfile,
  UserRole,
} from "@/types/database"

type SearchResult = {
  id: string
  nombre: string
  email: string
  role: UserRole
}

interface Props {
  planId: string
  responsables: PlanResponsableConProfile[]
  canEdit: boolean
  onChange?: () => void
}

export function ResponsablesMultiPicker({
  planId,
  responsables,
  canEdit,
  onChange,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Debounce search
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const handle = setTimeout(async () => {
      if (cancelled) return
      setSearching(true)
      const res = await searchProfilesParaResponsable(query.trim())
      if (cancelled) return
      setResults(Array.isArray(res) ? res : [])
      setSearching(false)
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, open])

  // Focus search when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const alreadyAddedIds = useMemo(
    () => new Set(responsables.map((r) => r.profile_id)),
    [responsables]
  )

  const filteredResults = useMemo(
    () => results.filter((r) => !alreadyAddedIds.has(r.id)),
    [results, alreadyAddedIds]
  )

  function handleAdd(profileId: string) {
    setBusyId(profileId)
    startTransition(async () => {
      const res = await addResponsable(planId, profileId, "coresponsable")
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Responsable agregado")
      setQuery("")
      setOpen(false)
      onChange?.()
      router.refresh()
    })
  }

  function handleRemove(profileId: string, nombre: string) {
    if (!confirm(`¿Quitar a ${nombre} como responsable?`)) return
    setBusyId(profileId)
    startTransition(async () => {
      const res = await removeResponsable(planId, profileId)
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Responsable removido")
      onChange?.()
      router.refresh()
    })
  }

  function handlePromote(profileId: string, nombre: string) {
    setBusyId(profileId)
    startTransition(async () => {
      const res = await setResponsablePrincipal(planId, profileId)
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${nombre} ahora es el responsable principal`)
      onChange?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3" ref={rootRef}>
      {/* Chips list */}
      {responsables.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sin responsables asignados
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {responsables.map((r) => {
            const isPrincipal = r.rol === "responsable_principal"
            const isBusy = busyId === r.profile_id
            return (
              <div
                key={r.id}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  isPrincipal
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                {isPrincipal ? (
                  <Crown className="h-3 w-3 shrink-0 text-amber-600" />
                ) : null}
                <span className="font-medium text-slate-800">
                  {r.profile_nombre}
                </span>
                {isPrincipal && (
                  <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                    Principal
                  </span>
                )}
                {canEdit && !isPrincipal && (
                  <button
                    type="button"
                    onClick={() => handlePromote(r.profile_id, r.profile_nombre)}
                    disabled={isBusy || pending}
                    title="Hacer principal"
                    className="rounded-full p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Star className="h-3 w-3" />
                    )}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(r.profile_id, r.profile_nombre)}
                    disabled={isBusy || pending}
                    title="Quitar"
                    className="rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add button + popover */}
      {canEdit && (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            disabled={pending}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Agregar responsable
          </Button>

          {open && (
            <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-md border bg-popover text-popover-foreground shadow-md">
              <div className="flex items-center gap-2 border-b px-2 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o email…"
                  className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {searching ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando…
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    {query.trim()
                      ? "Sin resultados"
                      : "Escribí para buscar usuarios"}
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {filteredResults.map((opt) => {
                      const isBusy = busyId === opt.id
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleAdd(opt.id)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                          >
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">
                                {opt.nombre}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {opt.email}
                                {opt.role ? ` · ${opt.role}` : ""}
                              </span>
                            </span>
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            ) : (
                              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ResponsablesMultiPicker
