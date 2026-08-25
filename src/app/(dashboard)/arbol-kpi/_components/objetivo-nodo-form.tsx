"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Pencil, Target, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { guardarNodoConfig } from "@/actions/arbol-kpi-config"
import { listResponsablesPosibles } from "@/actions/reuniones"
import type { NodoResuelto } from "@/lib/arbol-kpi/rechazo"

interface Props {
  nodo: NodoResuelto
  anio: number
  puedeEditar: boolean
  unidadFmt: (v: number) => string
}

// Valor centinela: un <SelectItem value=""> rompe el Select en producción.
const SIN_RESPONSABLE = "none"

/**
 * Objetivo y dueño del nodo.
 *
 * El auditor pregunta dos cosas frente a cualquier PI: cuál es el objetivo y
 * quién responde por él. Antes vivían en el código y cambiar una meta exigía un
 * deploy; ahora se editan acá y quedan guardados por año.
 */
export function ObjetivoNodoForm({ nodo, anio, puedeEditar, unidadFmt }: Props) {
  const [editando, setEditando] = useState(false)
  const [guardando, startGuardar] = useTransition()
  const [responsables, setResponsables] = useState<
    { id: string; nombre: string }[]
  >([])

  const [meta, setMeta] = useState(nodo.meta == null ? "" : String(nodo.meta))
  const [gatillo, setGatillo] = useState(
    nodo.gatillo == null ? "" : String(nodo.gatillo),
  )
  const [responsable, setResponsable] = useState(
    nodo.responsableId ?? SIN_RESPONSABLE,
  )
  const [nota, setNota] = useState(nodo.notaMeta ?? "")

  useEffect(() => {
    if (!editando || responsables.length > 0) return
    void listResponsablesPosibles().then((res) => {
      if ("data" in res) setResponsables(res.data)
    })
  }, [editando, responsables.length])

  function guardar() {
    startGuardar(async () => {
      const fd = new FormData()
      fd.set("anio", String(anio))
      fd.set("meta", meta)
      fd.set("gatillo", gatillo)
      fd.set("responsable_id", responsable === SIN_RESPONSABLE ? "" : responsable)
      fd.set("nota", nota)
      const res = await guardarNodoConfig(nodo.key, fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Objetivo guardado")
      setEditando(false)
    })
  }

  if (!editando) {
    return (
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 text-sm">
            <p className="flex items-center gap-1.5 text-slate-700">
              <Target className="size-4 shrink-0 text-slate-400" />
              {nodo.meta == null ? (
                <span className="text-slate-500">Sin objetivo definido</span>
              ) : (
                <span>
                  Objetivo{" "}
                  <strong className="tabular-nums">
                    {nodo.mejorSi === "mayor" ? "≥" : "≤"} {unidadFmt(nodo.meta)}{" "}
                    {nodo.unidad}
                  </strong>
                  {nodo.gatillo != null && (
                    <span className="text-slate-500">
                      {" "}· gatillo {unidadFmt(nodo.gatillo)} {nodo.unidad}
                    </span>
                  )}
                </span>
              )}
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <User className="size-4 shrink-0 text-slate-400" />
              {nodo.responsableNombre ? (
                <span>
                  Responsable <strong>{nodo.responsableNombre}</strong>
                </span>
              ) : (
                <span className="text-slate-500">Sin responsable asignado</span>
              )}
            </p>
            {nodo.notaMeta && (
              <p className="text-xs leading-relaxed text-slate-500">{nodo.notaMeta}</p>
            )}
          </div>
          {puedeEditar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditando(true)}
              className="shrink-0"
            >
              <Pencil className="mr-1.5 size-3.5" />
              Editar
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`meta-${nodo.key}`} className="text-xs">
            Meta ({nodo.unidad})
          </Label>
          <Input
            id={`meta-${nodo.key}`}
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            inputMode="decimal"
            placeholder="sin meta"
            className="bg-white"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`gatillo-${nodo.key}`} className="text-xs">
            Gatillo ({nodo.unidad})
          </Label>
          <Input
            id={`gatillo-${nodo.key}`}
            value={gatillo}
            onChange={(e) => setGatillo(e.target.value)}
            inputMode="decimal"
            placeholder="sin gatillo"
            className="bg-white"
          />
        </div>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Cruzar el gatillo pinta el nodo en rojo y exige analizarlo. Con{" "}
        {nodo.mejorSi === "mayor" ? "«más alto es mejor»" : "«más bajo es mejor»"}, el
        gatillo va {nodo.mejorSi === "mayor" ? "por debajo" : "por encima"} de la meta.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Responsable del indicador</Label>
        <Select
          value={responsable}
          onValueChange={(v: string | null) => setResponsable(v ?? SIN_RESPONSABLE)}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Sin asignar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_RESPONSABLE}>Sin asignar</SelectItem>
            {responsables.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`nota-${nodo.key}`} className="text-xs">
          Por qué ese objetivo
        </Label>
        <Input
          id={`nota-${nodo.key}`}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="p. ej. p80 de los últimos 6 meses"
          className="bg-white"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditando(false)}
          disabled={guardando}
        >
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  )
}
