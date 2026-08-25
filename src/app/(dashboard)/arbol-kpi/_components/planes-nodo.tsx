"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, ClipboardList, Loader2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  actualizarPlanArbolKpi,
  crearPlanArbolKpi,
  listarPlanesArbolKpi,
  type ArbolKpiPlan,
} from "@/actions/arbol-kpi-planes"
import { listResponsablesPosibles } from "@/actions/reuniones"
import type { NodoResuelto } from "@/lib/arbol-kpi/rechazo"

interface Props {
  nodo: NodoResuelto
  /** Valor del mes al abrir: queda como baseline del plan. */
  valorActual: number | null
  puedeEditar: boolean
  /** Si el nodo cruzó el gatillo, el bloque lo dice y empuja a abrir el plan. */
  exigePlan: boolean
}

const SIN_RESPONSABLE = "none"

const COLOR_ESTADO: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-emerald-100 text-emerald-700",
}

const LABEL_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En curso",
  completado: "Cerrado",
}

/**
 * Planes de acción del nodo.
 *
 * Es lo que cierra el círculo del árbol: ver que un driver está mal no sirve si
 * no se puede actuar ahí mismo. El plan nace con el nodo, el valor de arranque y
 * la meta ya cargados, así queda contra qué medir el cierre (PDCA).
 */
export function PlanesNodo({ nodo, valorActual, puedeEditar, exigePlan }: Props) {
  const [planes, setPlanes] = useState<ArbolKpiPlan[] | null>(null)
  const [creando, setCreando] = useState(false)
  const [guardando, startGuardar] = useTransition()
  const [responsables, setResponsables] = useState<{ id: string; nombre: string }[]>([])

  const [titulo, setTitulo] = useState("")
  const [causaRaiz, setCausaRaiz] = useState("")
  const [responsable, setResponsable] = useState(SIN_RESPONSABLE)
  const [fecha, setFecha] = useState("")
  const [prioridad, setPrioridad] = useState(exigePlan ? "alta" : "media")

  useEffect(() => {
    let cancelado = false
    void listarPlanesArbolKpi({ nodo_key: nodo.key }).then((res) => {
      if (cancelado) return
      setPlanes("data" in res ? res.data : [])
    })
    return () => {
      cancelado = true
    }
  }, [nodo.key])

  useEffect(() => {
    if (!creando || responsables.length > 0) return
    void listResponsablesPosibles().then((res) => {
      if ("data" in res) setResponsables(res.data)
    })
  }, [creando, responsables.length])

  function crear() {
    if (!titulo.trim()) {
      toast.error("Ponele un título a la acción")
      return
    }
    startGuardar(async () => {
      const fd = new FormData()
      fd.set("titulo", titulo)
      fd.set("causa_raiz", causaRaiz)
      fd.set("prioridad", prioridad)
      fd.set("arbol", "rechazo")
      fd.set("nodo_key", nodo.key)
      fd.set("nodo_label", nodo.label)
      fd.set("nodo_nivel", nodo.nivel)
      if (valorActual != null) fd.set("baseline_valor", String(valorActual))
      if (nodo.meta != null) fd.set("meta_valor", String(nodo.meta))
      if (responsable !== SIN_RESPONSABLE) fd.set("responsable_id", responsable)
      if (fecha) fd.set("fecha_objetivo", fecha)

      const res = await crearPlanArbolKpi(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan de acción creado")
      setCreando(false)
      setTitulo("")
      setCausaRaiz("")
      setFecha("")
      const lista = await listarPlanesArbolKpi({ nodo_key: nodo.key })
      setPlanes("data" in lista ? lista.data : [])
    })
  }

  function cambiarEstado(plan: ArbolKpiPlan, estado: string) {
    startGuardar(async () => {
      const fd = new FormData()
      fd.set("estado", estado)
      const res = await actualizarPlanArbolKpi(plan.id, fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const lista = await listarPlanesArbolKpi({ nodo_key: nodo.key })
      setPlanes("data" in lista ? lista.data : [])
    })
  }

  const abiertos = (planes ?? []).filter((p) => p.estado !== "completado")

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <ClipboardList className="size-4 text-slate-400" />
          Planes de acción
          {abiertos.length > 0 && (
            <span className="text-xs font-normal text-slate-500">
              · {abiertos.length} abierto{abiertos.length === 1 ? "" : "s"}
            </span>
          )}
        </p>
        {puedeEditar && !creando && (
          <Button size="sm" variant={exigePlan ? "default" : "outline"} onClick={() => setCreando(true)}>
            <Plus className="mr-1 size-3.5" />
            Nuevo
          </Button>
        )}
      </div>

      {exigePlan && abiertos.length === 0 && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          Este indicador cruzó el gatillo y no tiene ningún plan abierto.
        </p>
      )}

      {planes == null && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      )}

      {planes != null && planes.length === 0 && !creando && (
        <p className="mt-2 text-xs text-slate-500">
          Todavía no hay acciones sobre este indicador.
        </p>
      )}

      {planes != null && planes.length > 0 && (
        <ul className="mt-2 space-y-2">
          {planes.map((p) => (
            <li key={p.id} className="rounded-md border border-slate-200 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-slate-800">
                    {p.titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.responsable_nombre ?? "sin responsable"}
                    {p.fecha_objetivo ? ` · vence ${p.fecha_objetivo}` : ""}
                    {p.baseline_valor != null
                      ? ` · arrancó en ${p.baseline_valor.toLocaleString("es-AR")} ${nodo.unidad}`
                      : ""}
                  </p>
                  {p.causa_raiz && (
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Causa raíz:</span> {p.causa_raiz}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 border-0 ${COLOR_ESTADO[p.estado] ?? ""}`}
                >
                  {LABEL_ESTADO[p.estado] ?? p.estado}
                </Badge>
              </div>
              {puedeEditar && p.estado !== "completado" && (
                <div className="mt-2 flex gap-2">
                  {p.estado === "pendiente" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={guardando}
                      onClick={() => cambiarEstado(p, "en_progreso")}
                    >
                      Empezar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={guardando}
                    onClick={() => cambiarEstado(p, "completado")}
                  >
                    <CheckCircle2 className="mr-1 size-3.5" />
                    Cerrar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creando && (
        <div className="mt-3 space-y-3 rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <div className="space-y-1">
            <Label htmlFor="plan-titulo" className="text-xs">
              Qué se va a hacer
            </Label>
            <Input
              id="plan-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={`Acción sobre ${nodo.label}`}
              className="bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-causa" className="text-xs">
              Causa raíz
            </Label>
            <Textarea
              id="plan-causa"
              value={causaRaiz}
              onChange={(e) => setCausaRaiz(e.target.value)}
              placeholder="Por qué el indicador está donde está"
              rows={2}
              className="bg-white"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Responsable</Label>
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
              <Label htmlFor="plan-fecha" className="text-xs">
                Fecha objetivo
              </Label>
              <Input
                id="plan-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prioridad</Label>
              <Select
                value={prioridad}
                onValueChange={(v: string | null) => setPrioridad(v ?? "media")}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {valorActual != null && (
            <p className="text-[11px] text-slate-500">
              Queda registrado que arrancó en{" "}
              <strong className="tabular-nums">
                {valorActual.toLocaleString("es-AR")} {nodo.unidad}
              </strong>
              {nodo.meta != null && (
                <>
                  {" "}
                  contra una meta de{" "}
                  <strong className="tabular-nums">
                    {nodo.meta.toLocaleString("es-AR")} {nodo.unidad}
                  </strong>
                </>
              )}
              .
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreando(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={crear} disabled={guardando}>
              {guardando ? "Creando…" : "Crear plan"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
