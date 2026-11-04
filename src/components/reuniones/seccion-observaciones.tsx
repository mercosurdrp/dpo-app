"use client"

import { useState, useTransition } from "react"
import { ListTodo, Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  actualizarObservacionIndicador,
  crearObservacionIndicador,
  eliminarObservacionIndicador,
} from "@/actions/reuniones-indicadores-observaciones"
import { seccionIndicadorId } from "@/lib/reuniones-seccion-observaciones"
import { ActividadFormDialog } from "./actividad-form-dialog"
import { formatFechaHora } from "./tablero-observaciones"
import type { ReunionIndicadorObservacionConAutor, TipoReunion } from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/**
 * Observaciones de una sección de la reunión (Dimensionamiento, etc.): texto
 * libre que queda registrado sin necesidad de abrir una acción. Mismo esquema
 * que las observaciones del Tablero y de los SLA (tabla
 * reuniones_indicadores_observaciones, clave `seccion_<slug>`). Al lado va el
 * botón para crear una acción del Action Log de la misma sección, así se
 * elige cualquiera de las dos: observación o acción.
 */
export function SeccionObservaciones({
  reunionId,
  reunionTipo,
  seccion,
  nombre,
  observaciones,
  responsables,
  puedeEditar,
  onChanged,
  hint,
}: {
  reunionId: string
  reunionTipo: TipoReunion
  /** Slug de la sección (el mismo de `reuniones_actividades.seccion`). */
  seccion: string
  /** Nombre legible de la sección, queda como foto en la observación. */
  nombre: string
  observaciones: ReunionIndicadorObservacionConAutor[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onChanged: () => void
  hint?: string
}) {
  const [texto, setTexto] = useState("")
  const [pending, startTransition] = useTransition()
  const [openAccion, setOpenAccion] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState("")
  const [borrandoId, setBorrandoId] = useState<string | null>(null)

  function handleGuardar() {
    if (!texto.trim()) {
      toast.error("Escribí la observación.")
      return
    }
    startTransition(async () => {
      const res = await crearObservacionIndicador({
        reunionId,
        indicadorId: seccionIndicadorId(seccion),
        indicadorNombre: nombre,
        texto,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setTexto("")
      toast.success("Observación registrada.")
      onChanged()
    })
  }

  function handleGuardarEdicion(id: string) {
    if (!editTexto.trim()) {
      toast.error("Escribí la observación.")
      return
    }
    startTransition(async () => {
      const res = await actualizarObservacionIndicador(id, editTexto)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setEditandoId(null)
      onChanged()
    })
  }

  function handleBorrar(obs: ReunionIndicadorObservacionConAutor) {
    if (!confirm(`¿Eliminar la observación?\n\n"${obs.texto.slice(0, 80)}${obs.texto.length > 80 ? "…" : ""}"`)) return
    setBorrandoId(obs.id)
    startTransition(async () => {
      const res = await eliminarObservacionIndicador(obs.id)
      setBorrandoId(null)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      onChanged()
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <MessageSquareText className="size-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-violet-900">Observaciones</h3>
        <span className="text-xs text-muted-foreground">({observaciones.length})</span>
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}

      {puedeEditar && (
        <div className="mt-3 rounded-md border border-violet-200 bg-white p-3">
          <Textarea
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Qué se comentó, qué se decidió, qué queda para mirar el mes que viene…"
            disabled={pending}
          />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setOpenAccion(true)}
              title="Crear una actividad del Action Log de esta sección"
            >
              <ListTodo className="mr-2 size-4" />
              Crear acción
            </Button>
            <Button type="button" size="sm" onClick={handleGuardar} disabled={pending || !texto.trim()}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Registrar observación
            </Button>
          </div>
        </div>
      )}

      {observaciones.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Sin observaciones en esta reunión.</p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border bg-white">
          {observaciones.map((obs) => (
            <li key={obs.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                {editandoId === obs.id ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={2}
                      value={editTexto}
                      onChange={(e) => setEditTexto(e.target.value)}
                      disabled={pending}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditandoId(null)}
                        disabled={pending}
                      >
                        <X className="mr-1 size-3.5" />
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleGuardarEdicion(obs.id)}
                        disabled={pending || !editTexto.trim()}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{obs.texto}</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {obs.autor_nombre ?? "—"} · {formatFechaHora(obs.created_at)}
                </p>
              </div>
              {puedeEditar && editandoId !== obs.id && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      setEditandoId(obs.id)
                      setEditTexto(obs.texto)
                    }}
                    title="Editar"
                    disabled={pending}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-red-600 hover:text-red-700"
                    onClick={() => handleBorrar(obs)}
                    title="Eliminar"
                    disabled={pending || borrandoId === obs.id}
                  >
                    {borrandoId === obs.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ActividadFormDialog
        open={openAccion}
        onOpenChange={setOpenAccion}
        reunionId={reunionId}
        reunionTipo={reunionTipo}
        responsables={responsables}
        seccion={seccion}
        onSaved={onChanged}
      />
    </div>
  )
}
