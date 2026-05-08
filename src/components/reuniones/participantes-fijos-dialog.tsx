"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Loader2, UserPlus, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  agregarParticipanteFijo,
  listParticipantesFijos,
  quitarParticipanteFijo,
} from "@/actions/reuniones"
import type {
  ReunionParticipanteFijoConProfile,
  TipoReunion,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipo: TipoReunion
  tipoLabel: string
  responsables: ResponsableOpt[]
  onSaved: () => void
}

export function ParticipantesFijosDialog({
  open,
  onOpenChange,
  tipo,
  tipoLabel,
  responsables,
  onSaved,
}: Props) {
  const [participantes, setParticipantes] = useState<
    ReunionParticipanteFijoConProfile[]
  >([])
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<string>("")

  async function reload() {
    setLoading(true)
    const result = await listParticipantesFijos(tipo)
    if ("data" in result) {
      setParticipantes(result.data)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (open) {
      setError(null)
      setSeleccionado("")
      reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo])

  const yaAgregados = useMemo(
    () => new Set(participantes.map((p) => p.profile_id)),
    [participantes],
  )

  const disponibles = useMemo(
    () => responsables.filter((r) => !yaAgregados.has(r.id)),
    [responsables, yaAgregados],
  )

  function handleAgregar() {
    if (!seleccionado) return
    setError(null)
    startTransition(async () => {
      const result = await agregarParticipanteFijo(tipo, seleccionado)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setSeleccionado("")
      await reload()
      onSaved()
    })
  }

  function handleQuitar(id: string, nombre: string) {
    if (!confirm(`¿Quitar a ${nombre} de la lista de participantes fijos?`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await quitarParticipanteFijo(id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      await reload()
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar participantes — {tipoLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lista actual */}
          <div className="space-y-2">
            <Label>Participantes fijos ({participantes.length})</Label>
            <div className="rounded-md border bg-white">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Cargando…
                </div>
              ) : participantes.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Sin participantes fijos. Agregá usuarios abajo.
                </div>
              ) : (
                <ul className="divide-y">
                  {participantes.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {p.profile_nombre}
                        </p>
                        {p.profile_email && (
                          <p className="truncate text-xs text-muted-foreground">
                            {p.profile_email}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleQuitar(p.id, p.profile_nombre)}
                        disabled={pending}
                        title="Quitar"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Agregar */}
          <div className="space-y-2">
            <Label>Agregar participante</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={seleccionado}
                  onValueChange={(v: string | null) =>
                    setSeleccionado(v ?? "")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar usuario…" />
                  </SelectTrigger>
                  <SelectContent>
                    {disponibles.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        Todos los usuarios ya están agregados.
                      </div>
                    ) : (
                      disponibles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nombre}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={handleAgregar}
                disabled={pending || !seleccionado}
              >
                {pending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 size-4" />
                )}
                Agregar
              </Button>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
