"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Info, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  actualizarFilaRaci,
  actualizarRolRaci,
  crearFilaRaci,
  crearRolRaci,
  eliminarFilaRaci,
  eliminarRolRaci,
  setCeldaRaci,
} from "@/actions/requisitos-legales"
import type {
  RaciLetra,
  RequisitoLegalRaci,
  RequisitoLegalRaciFila,
} from "@/types/database"

interface Props {
  raci: RequisitoLegalRaci
  puedeEditar: boolean
}

const CICLO: (RaciLetra | null)[] = [null, "R", "A", "C", "I"]

const LETRA_STYLE: Record<RaciLetra, string> = {
  R: "border-blue-200 bg-blue-100 text-blue-700",
  A: "border-violet-200 bg-violet-100 text-violet-700",
  C: "border-amber-200 bg-amber-100 text-amber-800",
  I: "border-slate-200 bg-slate-100 text-slate-600",
}

const LEYENDA: { letra: RaciLetra; label: string; detalle: string }[] = [
  { letra: "R", label: "Responsable", detalle: "tramita y renueva" },
  { letra: "A", label: "Aprobador", detalle: "responsable final (uno por fila)" },
  { letra: "C", label: "Consultado", detalle: "aporta antes de decidir" },
  { letra: "I", label: "Informado", detalle: "se le comunica" },
]

function LetraBadge({ letra }: { letra: RaciLetra }) {
  return (
    <span
      className={`inline-flex size-6 items-center justify-center rounded-md border text-xs font-bold ${LETRA_STYLE[letra]}`}
    >
      {letra}
    </span>
  )
}

function advertenciasFila(fila: RequisitoLegalRaciFila): string[] {
  const letras = Object.values(fila.asignaciones)
  const avisos: string[] = []
  const cantA = letras.filter((l) => l === "A").length
  if (cantA === 0) avisos.push("Sin A (aprobador) asignado")
  if (cantA > 1) avisos.push("Más de un A — debería haber uno solo por fila")
  if (!letras.includes("R")) avisos.push("Sin R (responsable) asignado")
  return avisos
}

export function RaciTab({ raci, puedeEditar }: Props) {
  const router = useRouter()
  const [filas, setFilas] = useState(raci.filas)
  const [guardando, setGuardando] = useState(false)

  const roles = raci.roles

  const avisosPorFila = useMemo(
    () => new Map(filas.map((f) => [f.id, advertenciasFila(f)])),
    [filas],
  )

  async function handleCelda(fila: RequisitoLegalRaciFila, rolId: string) {
    if (!puedeEditar || guardando) return
    const actual = fila.asignaciones[rolId] ?? null
    const siguiente = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length]

    const previas = filas
    setFilas((fs) =>
      fs.map((f) => {
        if (f.id !== fila.id) return f
        const asignaciones = { ...f.asignaciones }
        if (siguiente === null) delete asignaciones[rolId]
        else asignaciones[rolId] = siguiente
        return { ...f, asignaciones }
      }),
    )

    setGuardando(true)
    const result = await setCeldaRaci(fila.id, rolId, siguiente)
    setGuardando(false)
    if ("error" in result) {
      setFilas(previas)
      alert(`Error guardando: ${result.error}`)
    }
  }

  async function handleAgregarFila() {
    const nombre = prompt("Nombre de la fila (grupo de requisitos legales):")
    if (!nombre?.trim()) return
    const descripcion = prompt("Detalle (permisos/licencias que incluye):") ?? null
    const result = await crearFilaRaci(nombre, descripcion)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
    setFilas((fs) => [...fs, result.data])
    router.refresh()
  }

  async function handleEditarFila(fila: RequisitoLegalRaciFila) {
    const nombre = prompt("Nombre de la fila:", fila.nombre)
    if (!nombre?.trim()) return
    const descripcion = prompt("Detalle:", fila.descripcion ?? "") ?? null
    const result = await actualizarFilaRaci(fila.id, nombre, descripcion)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
    setFilas((fs) => fs.map((f) => (f.id === fila.id ? result.data : f)))
    router.refresh()
  }

  async function handleEliminarFila(fila: RequisitoLegalRaciFila) {
    if (!confirm(`¿Eliminar la fila "${fila.nombre}" de la RACI?`)) return
    const result = await eliminarFilaRaci(fila.id)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
    setFilas((fs) => fs.filter((f) => f.id !== fila.id))
    router.refresh()
  }

  async function handleAgregarRol() {
    const nombre = prompt("Nombre del rol (columna):")
    if (!nombre?.trim()) return
    const result = await crearRolRaci(nombre)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
    router.refresh()
  }

  async function handleEditarRol(rolId: string, actual: string) {
    const nombre = prompt("Nombre del rol:", actual)
    if (!nombre?.trim() || nombre.trim() === actual) return
    const result = await actualizarRolRaci(rolId, nombre)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
    router.refresh()
  }

  async function handleEliminarRol(rolId: string, nombre: string) {
    if (
      !confirm(
        `¿Eliminar el rol "${nombre}"? Se borran sus asignaciones en todas las filas.`,
      )
    )
      return
    const result = await eliminarRolRaci(rolId)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Contexto del manual */}
      <div className="flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
        <div>
          <p className="font-semibold">
            R2.1.1 — La RACI del distribuidor está en su lugar mostrando la
            responsabilidad de los requisitos legales.
          </p>
          <p className="mt-1 text-blue-800">
            Rutina: los vencimientos se revisan mensualmente en la reunión de
            gestión (las alertas automáticas de este módulo avisan a 30 días) y
            se escala al Aprobador si un permiso queda a menos de 30 días de
            vencer. Las responsabilidades son por <b>rol</b>, no por persona:
            ante una rotación, el rol hereda la responsabilidad.
          </p>
        </div>
      </div>

      {/* Leyenda + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {LEYENDA.map(({ letra, label, detalle }) => (
            <span key={letra} className="flex items-center gap-1.5">
              <LetraBadge letra={letra} />
              <span>
                <b>{label}</b> · {detalle}
              </span>
            </span>
          ))}
        </div>
        {puedeEditar && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAgregarRol}>
              <Plus className="mr-1.5 size-4" />
              Rol
            </Button>
            <Button size="sm" onClick={handleAgregarFila}>
              <Plus className="mr-1.5 size-4" />
              Fila
            </Button>
          </div>
        )}
      </div>

      {/* Matriz */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40 px-2 text-xs">
                Requisitos legales
              </TableHead>
              {roles.map((rol) => (
                <TableHead key={rol.id} className="px-1 py-1.5 text-center align-middle">
                  <div className="group/rol inline-flex items-center gap-0.5">
                    <span className="max-w-24 whitespace-normal break-words text-[11px] leading-tight">
                      {rol.nombre}
                    </span>
                    {puedeEditar && (
                      <span className="flex opacity-0 transition group-hover/rol:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleEditarRol(rol.id, rol.nombre)}
                          title="Renombrar rol"
                          className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminarRol(rol.id, rol.nombre)}
                          title="Eliminar rol"
                          className="rounded p-0.5 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
              {puedeEditar && <TableHead className="w-14 px-1 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={roles.length + (puedeEditar ? 2 : 1)}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Sin filas en la RACI.
                </TableCell>
              </TableRow>
            )}
            {filas.map((fila) => {
              const avisos = avisosPorFila.get(fila.id) ?? []
              return (
                <TableRow key={fila.id}>
                  <TableCell className="px-2 py-1.5">
                    <div className="flex items-start gap-1.5">
                      {avisos.length > 0 && (
                        <span title={avisos.join(" · ")} className="mt-0.5 shrink-0">
                          <AlertTriangle className="size-3.5 text-amber-500" />
                        </span>
                      )}
                      <div>
                        <p className="text-xs font-medium leading-tight">
                          {fila.nombre}
                        </p>
                        {fila.descripcion && (
                          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                            {fila.descripcion}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {roles.map((rol) => {
                    const letra = fila.asignaciones[rol.id] ?? null
                    return (
                      <TableCell key={rol.id} className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!puedeEditar}
                          onClick={() => handleCelda(fila, rol.id)}
                          title={
                            puedeEditar
                              ? "Click para cambiar (— → R → A → C → I)"
                              : undefined
                          }
                          className={`inline-flex items-center justify-center rounded-md ${
                            puedeEditar
                              ? "cursor-pointer hover:ring-2 hover:ring-slate-300"
                              : "cursor-default"
                          }`}
                        >
                          {letra ? (
                            <LetraBadge letra={letra} />
                          ) : (
                            <span className="inline-flex size-6 items-center justify-center rounded-md border border-dashed border-slate-200 text-xs text-slate-300">
                              —
                            </span>
                          )}
                        </button>
                      </TableCell>
                    )
                  })}
                  {puedeEditar && (
                    <TableCell className="px-1 py-1.5 text-right">
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleEditarFila(fila)}
                          title="Editar fila"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminarFila(fila)}
                          title="Eliminar fila"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
