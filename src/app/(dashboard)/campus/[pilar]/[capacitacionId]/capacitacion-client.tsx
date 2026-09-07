"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ExternalLink,
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
import { abrirArchivo } from "@/lib/abrir-archivo"
import { emojiTipo, formatBytes, labelTipo, type CampusPilar } from "@/lib/campus"
import { deleteCampusMaterial, moverCampusMaterial } from "@/actions/campus"
import type { CampusCapacitacion, CampusMaterial, CampusMaterialConUrl } from "@/types/database"
import { MaterialDialog } from "../../_components/material-dialog"
import { esEmbebible, MaterialVisor } from "../../_components/material-visor"

interface Props {
  pilar: CampusPilar
  capacitacion: CampusCapacitacion
  materiales: CampusMaterialConUrl[]
  errorMateriales: string | null
  canEdit: boolean
}

export function CapacitacionClient({
  pilar,
  capacitacion,
  materiales,
  errorMateriales,
  canEdit,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editando, setEditando] = useState<CampusMaterial | null>(null)
  const [aBorrar, setABorrar] = useState<CampusMaterialConUrl | null>(null)
  const [error, setError] = useState<string | null>(null)

  function abrirMaterial(m: CampusMaterialConUrl) {
    if (esEmbebible(m)) {
      setAbierto((prev) => (prev === m.id ? null : m.id))
      return
    }
    abrirArchivo(m.url, m.nombre_original ?? undefined)
  }

  function nuevoMaterial() {
    setEditando(null)
    setDialogOpen(true)
  }

  function editarMaterial(m: CampusMaterial) {
    setEditando(m)
    setDialogOpen(true)
  }

  function mover(id: string, direccion: "arriba" | "abajo") {
    setError(null)
    startTransition(async () => {
      const res = await moverCampusMaterial(id, direccion)
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
      const res = await deleteCampusMaterial(aBorrar.id)
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
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link href="/campus" className="transition-colors hover:text-slate-800">
            Campus
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={`/campus/${pilar.codigo}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-slate-800"
          >
            <span className={`size-2 rounded-full ${pilar.dot}`} aria-hidden />
            {pilar.nombre}
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {capacitacion.titulo}
            </h1>
            {capacitacion.descripcion && (
              <p className="mt-1 max-w-3xl text-[15px] text-slate-600">
                {capacitacion.descripcion}
              </p>
            )}
          </div>

          {canEdit && (
            <Button onClick={nuevoMaterial} className="min-h-10">
              <Plus className="mr-2 size-4" />
              Agregar material
            </Button>
          )}
        </div>
      </div>

      {(error || errorMateriales) && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? errorMateriales}
        </p>
      )}

      {materiales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl" aria-hidden>
            📎
          </p>
          <p className="mt-3 text-[15px] text-slate-600">
            Esta capacitación todavía no tiene materiales cargados.
          </p>
          {canEdit && (
            <Button onClick={nuevoMaterial} className="mt-4 min-h-10">
              <Plus className="mr-2 size-4" />
              Agregar material
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {materiales.map((m, i) => {
            const embebible = esEmbebible(m)
            const expandido = abierto === m.id

            return (
              <li
                key={m.id}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-center gap-3 p-4">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg"
                    aria-hidden
                  >
                    {emojiTipo(m.tipo)}
                  </span>

                  <button
                    type="button"
                    onClick={() => abrirMaterial(m)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[16px] font-semibold text-slate-900">
                      {m.titulo}
                    </p>
                    {m.descripcion && (
                      <p className="line-clamp-1 text-sm text-slate-600">{m.descripcion}</p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-slate-400 tabular-nums">
                      {labelTipo(m.tipo)}
                      {m.origen === "link" ? " · link externo" : ""}
                      {m.nombre_original ? ` · ${m.nombre_original}` : ""}
                      {m.bytes ? ` · ${formatBytes(m.bytes)}` : ""}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          aria-label="Subir"
                          disabled={i === 0 || pending}
                          onClick={() => mover(m.id, "arriba")}
                          className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Bajar"
                          disabled={i === materiales.length - 1 || pending}
                          onClick={() => mover(m.id, "abajo")}
                          className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Editar"
                          onClick={() => editarMaterial(m)}
                          className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Borrar"
                          onClick={() => setABorrar(m)}
                          className="flex size-10 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}

                    <Button
                      variant="outline"
                      className="min-h-10"
                      onClick={() => abrirMaterial(m)}
                    >
                      {embebible ? (
                        <>
                          <ChevronDown
                            className={`mr-2 size-4 transition-transform ${expandido ? "rotate-180" : ""}`}
                          />
                          {expandido ? "Cerrar" : "Ver"}
                        </>
                      ) : (
                        <>
                          <ExternalLink className="mr-2 size-4" />
                          Abrir
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {expandido && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <MaterialVisor material={m} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <MaterialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        capacitacionId={capacitacion.id}
        pilarCodigo={pilar.codigo}
        material={editando}
        onSaved={() => router.refresh()}
      />

      <Dialog open={aBorrar !== null} onOpenChange={(o) => !o && setABorrar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Borrar material</DialogTitle>
          </DialogHeader>
          <p className="text-[15px] text-slate-700">
            Se va a borrar <span className="font-semibold">{aBorrar?.titulo}</span>
            {aBorrar?.origen === "archivo" ? ", incluido el archivo subido" : ""}. No se puede
            deshacer.
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
