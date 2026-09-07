"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteCampusCapacitacion, moverCampusCapacitacion } from "@/actions/campus"
import type { CampusPilar } from "@/lib/campus"
import type { CampusCapacitacion, CampusCapacitacionConTotal } from "@/types/database"
import { CapacitacionDialog } from "../_components/capacitacion-dialog"

interface Props {
  pilar: CampusPilar
  capacitaciones: CampusCapacitacionConTotal[]
  canEdit: boolean
}

export function PilarClient({ pilar, capacitaciones, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editando, setEditando] = useState<CampusCapacitacion | null>(null)
  const [aBorrar, setABorrar] = useState<CampusCapacitacionConTotal | null>(null)
  const [error, setError] = useState<string | null>(null)

  function abrirNueva() {
    setEditando(null)
    setDialogOpen(true)
  }

  function abrirEdicion(cap: CampusCapacitacion) {
    setEditando(cap)
    setDialogOpen(true)
  }

  function mover(id: string, direccion: "arriba" | "abajo") {
    setError(null)
    startTransition(async () => {
      const res = await moverCampusCapacitacion(id, direccion)
      if ("error" in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function confirmarBorrado() {
    if (!aBorrar) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCampusCapacitacion(aBorrar.id)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setABorrar(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/campus"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          Campus de Capacitaciones
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              {pilar.emoji}
            </span>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
              <span className={`size-2.5 rounded-full ${pilar.dot}`} aria-hidden />
              {pilar.nombre}
            </h1>
          </div>

          {canEdit && (
            <Button onClick={abrirNueva} className="min-h-10">
              <Plus className="mr-2 size-4" />
              Nueva capacitación
            </Button>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {capacitaciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl" aria-hidden>
            📚
          </p>
          <p className="mt-3 text-[15px] text-slate-600">
            Todavía no hay capacitaciones en {pilar.nombre}.
          </p>
          {canEdit ? (
            <Button onClick={abrirNueva} className="mt-4 min-h-10">
              <Plus className="mr-2 size-4" />
              Nueva capacitación
            </Button>
          ) : (
            <p className="mt-1 text-sm text-slate-400">
              RRHH va a ir cargando el material acá.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {capacitaciones.map((cap, i) => (
            <li key={cap.id} className="group relative">
              <Link
                href={`/campus/${pilar.codigo}/${cap.id}`}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-semibold text-slate-900">
                    {cap.titulo}
                  </h2>
                  {cap.descripcion && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                      {cap.descripcion}
                    </p>
                  )}
                  <p
                    className={`mt-1 text-xs tabular-nums ${cap.total_materiales === 0 ? "text-slate-400" : "text-slate-500"}`}
                  >
                    {cap.total_materiales === 0
                      ? "Sin materiales todavía"
                      : cap.total_materiales === 1
                        ? "1 material"
                        : `${cap.total_materiales} materiales`}
                  </p>
                </div>

                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label="Subir"
                      disabled={i === 0 || pending}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        mover(cap.id, "arriba")
                      }}
                      className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Bajar"
                      disabled={i === capacitaciones.length - 1 || pending}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        mover(cap.id, "abajo")
                      }}
                      className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Editar"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        abrirEdicion(cap)
                      }}
                      className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Borrar"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setABorrar(cap)
                      }}
                      className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}

                <ChevronRight className="size-5 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CapacitacionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pilarCodigo={pilar.codigo}
        pilarNombre={pilar.nombre}
        capacitacion={editando}
        onSaved={() => router.refresh()}
      />

      <Dialog open={aBorrar !== null} onOpenChange={(o) => !o && setABorrar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Borrar capacitación</DialogTitle>
          </DialogHeader>
          <p className="text-[15px] text-slate-700">
            Se va a borrar <span className="font-semibold">{aBorrar?.titulo}</span> y todo su
            material, incluidos los archivos subidos. No se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setABorrar(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarBorrado} disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
