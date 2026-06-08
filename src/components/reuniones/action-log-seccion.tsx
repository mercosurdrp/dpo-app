"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, Loader2, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ActividadFormDialog } from "./actividad-form-dialog"
import { DetalleActividadDialog } from "./detalle-actividad-dialog"
import { eliminarActividad } from "@/actions/reuniones"
import type {
  EstadoReunionActividad,
  ReunionActividadConResponsable,
  TipoReunion,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

function EstadoBadge({ estado }: { estado: EstadoReunionActividad }) {
  if (estado === "cerrada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Cerrada
      </Badge>
    )
  }
  if (estado === "en_curso") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En curso
      </Badge>
    )
  }
  return (
    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
      No comenzada
    </Badge>
  )
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Action Log embebido y acotado a una sección de la reunión. Reutiliza el
 * mismo formulario y diálogo de detalle del action log general, pero solo
 * lista/crea compromisos de la sección indicada (los nuevos quedan etiquetados
 * con `seccion`).
 */
export function ActionLogSeccion({
  reunionId,
  reunionTipo,
  seccion,
  titulo,
  actividades,
  responsables,
  puedeEditar,
  onChanged,
}: {
  reunionId: string
  reunionTipo: TipoReunion
  seccion: string
  titulo: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [openForm, setOpenForm] = useState(false)
  const [editando, setEditando] =
    useState<ReunionActividadConResponsable | null>(null)
  const [detalle, setDetalle] =
    useState<ReunionActividadConResponsable | null>(null)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)
  const [, startDelete] = useTransition()

  function handleBorrar(act: ReunionActividadConResponsable) {
    if (
      !confirm(
        `¿Eliminar el compromiso "${act.descripcion.slice(0, 60)}${
          act.descripcion.length > 60 ? "…" : ""
        }"?`,
      )
    )
      return
    setBorrandoId(act.id)
    startDelete(async () => {
      const res = await eliminarActividad(act.id)
      setBorrandoId(null)
      if (res && "error" in res) {
        alert(res.error)
        return
      }
      onChanged()
    })
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <ListTodo className="size-4 text-emerald-600" />
          Action Log — {titulo}
          <span className="font-normal text-muted-foreground">
            ({actividades.length})
          </span>
        </div>
        {puedeEditar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setEditando(null)
              setOpenForm(true)
            }}
          >
            <Plus className="mr-1 size-3.5" />
            Compromiso
          </Button>
        )}
      </div>

      {actividades.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          Sin compromisos en esta sección.
        </p>
      ) : (
        <ul className="divide-y">
          {actividades.map((act) => (
            <li
              key={act.id}
              className="flex items-start justify-between gap-3 px-3 py-2 hover:bg-slate-50"
            >
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => setDetalle(act)}
              >
                <p className="text-sm text-slate-800">{act.descripcion}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {act.responsable_nombre ?? "Sin responsable"} ·{" "}
                  {formatFecha(act.fecha_compromiso)}
                </p>
              </button>
              <div className="flex items-center gap-1.5">
                <EstadoBadge estado={act.estado} />
                {puedeEditar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                    onClick={() => handleBorrar(act)}
                    disabled={borrandoId === act.id}
                    title="Eliminar compromiso"
                  >
                    {borrandoId === act.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Crear / editar (etiqueta seccion al crear) */}
      <ActividadFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        reunionId={reunionId}
        reunionTipo={reunionTipo}
        actividad={editando}
        responsables={responsables}
        seccion={seccion}
        onSaved={() => {
          setOpenForm(false)
          setEditando(null)
          onChanged()
        }}
      />

      {/* Detalle / avances / cambio de estado */}
      {detalle && (
        <DetalleActividadDialog
          open={!!detalle}
          onOpenChange={(o) => !o && setDetalle(null)}
          actividad={detalle}
          puedeResponder={puedeEditar}
          onSaved={() => {
            setDetalle(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}
