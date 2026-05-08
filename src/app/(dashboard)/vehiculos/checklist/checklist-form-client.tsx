"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import type {
  ChecklistItem,
  CatalogoChofer,
  CatalogoVehiculo,
  TipoChecklist,
  VehiculoSector,
} from "@/types/database"
import { VEHICULO_SECTOR_LABELS } from "@/types/database"
import {
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  LogOut,
  LogIn,
} from "lucide-react"
import { createChecklist } from "@/actions/checklist-vehiculos"

interface Props {
  items: ChecklistItem[]
  vehiculos: CatalogoVehiculo[]
  choferes: CatalogoChofer[]
}

// Group items by category
function groupByCategoria(items: ChecklistItem[]) {
  const groups: { categoria: string; items: ChecklistItem[] }[] = []
  const map = new Map<string, ChecklistItem[]>()
  for (const item of items) {
    if (!map.has(item.categoria)) {
      map.set(item.categoria, [])
      groups.push({ categoria: item.categoria, items: map.get(item.categoria)! })
    }
    map.get(item.categoria)!.push(item)
  }
  return groups
}

const opcionesMap: Record<string, { value: string; label: string; color: string }[]> = {
  ok_nook: [
    { value: "ok", label: "OK", color: "bg-green-100 text-green-700 border-green-300" },
    { value: "nook", label: "NO OK", color: "bg-red-100 text-red-700 border-red-300" },
  ],
  bueno_regular_malo: [
    { value: "ok", label: "Bueno", color: "bg-green-100 text-green-700 border-green-300" },
    { value: "regular", label: "Regular", color: "bg-amber-100 text-amber-700 border-amber-300" },
    { value: "nook", label: "Malo", color: "bg-red-100 text-red-700 border-red-300" },
  ],
  ok_regular_nook: [
    { value: "ok", label: "OK", color: "bg-green-100 text-green-700 border-green-300" },
    { value: "regular", label: "Regular", color: "bg-amber-100 text-amber-700 border-amber-300" },
    { value: "nook", label: "NO OK", color: "bg-red-100 text-red-700 border-red-300" },
  ],
}

export function ChecklistFormClient({ items, vehiculos, choferes }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoChecklist>("liberacion")
  const [sectorFiltro, setSectorFiltro] = useState<VehiculoSector | "todos">(
    "todos"
  )
  const [dominio, setDominio] = useState("")

  const vehiculosFiltrados = vehiculos.filter((v) =>
    sectorFiltro === "todos" ? true : v.sector === sectorFiltro
  )
  const [chofer, setChofer] = useState("")
  const [odometro, setOdometro] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [comentarios, setComentarios] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const groups = groupByCategoria(items)

  function setRespuesta(itemId: string, valor: string) {
    setRespuestas((prev) => ({ ...prev, [itemId]: valor }))
  }

  function setComentario(itemId: string, texto: string) {
    setComentarios((prev) => ({ ...prev, [itemId]: texto }))
  }

  // Check if any critical item is nook/malo
  const criticosRechazados = items.filter(
    (i) => i.critico && (respuestas[i.id] === "nook" || respuestas[i.id] === "malo")
  )
  const hayRechazo = criticosRechazados.length > 0

  // Check completeness
  const totalItems = items.length
  const completados = Object.keys(respuestas).length
  const todosCompletados = completados === totalItems

  async function handleSubmit() {
    if (!dominio || !chofer) {
      toast.error("Seleccioná vehículo y chofer")
      return
    }
    if (!todosCompletados) {
      toast.error(`Faltan ${totalItems - completados} ítems por completar`)
      return
    }

    setSaving(true)
    const hoy = new Date().toISOString().slice(0, 10)

    const result = await createChecklist({
      tipo,
      fecha: hoy,
      dominio,
      chofer,
      odometro: odometro ? parseInt(odometro) : undefined,
      observaciones: observaciones || undefined,
      respuestas: items.map((item) => ({
        item_id: item.id,
        valor: respuestas[item.id],
        comentario: comentarios[item.id] || undefined,
      })),
    })

    if ("error" in result) {
      toast.error(result.error)
    } else {
      const label = tipo === "liberacion" ? "liberación" : "retorno"
      if (result.data.resultado === "rechazado") {
        toast.error(`Checklist de ${label} RECHAZADO — ítems críticos no aprobados`)
      } else {
        toast.success(`Checklist de ${label} registrado correctamente`)
      }
      if (result.data.tiempo_ruta_minutos != null) {
        const hh = Math.floor(result.data.tiempo_ruta_minutos / 60)
        const mm = result.data.tiempo_ruta_minutos % 60
        toast.info(`Tiempo en ruta: ${hh}h ${mm.toString().padStart(2, "0")}m`)
      }
      router.push("/vehiculos")
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Hero: title + tipo selector */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Checklist de Vehículo
          </h1>
          <p className="text-sm text-muted-foreground">
            Elegí el tipo de inspección
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Tipo de checklist"
          className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm"
        >
          <button
            type="button"
            role="radio"
            aria-checked={tipo === "liberacion"}
            onClick={() => setTipo("liberacion")}
            className={`group flex items-center gap-3 rounded-xl px-4 py-6 text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 sm:gap-4 sm:px-6 ${
              tipo === "liberacion"
                ? "bg-blue-600 text-white shadow-lg ring-2 ring-blue-700"
                : "bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <LogOut
              className={`h-8 w-8 shrink-0 sm:h-10 sm:w-10 ${
                tipo === "liberacion" ? "text-white" : "text-blue-600"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight tracking-tight sm:text-3xl">
                LIBERACIÓN
              </div>
              <div
                className={`text-xs sm:text-sm ${
                  tipo === "liberacion" ? "text-blue-100" : "text-slate-500"
                }`}
              >
                Salida del depósito
              </div>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={tipo === "retorno"}
            onClick={() => setTipo("retorno")}
            className={`group flex items-center gap-3 rounded-xl px-4 py-6 text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 sm:gap-4 sm:px-6 ${
              tipo === "retorno"
                ? "bg-orange-500 text-white shadow-lg ring-2 ring-orange-600"
                : "bg-white text-slate-600 hover:bg-orange-50 hover:text-orange-700"
            }`}
          >
            <LogIn
              className={`h-8 w-8 shrink-0 sm:h-10 sm:w-10 ${
                tipo === "retorno" ? "text-white" : "text-orange-500"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight tracking-tight sm:text-3xl">
                RETORNO
              </div>
              <div
                className={`text-xs sm:text-sm ${
                  tipo === "retorno" ? "text-orange-100" : "text-slate-500"
                }`}
              >
                Vuelta del recorrido
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Config */}
      <Card className="border-blue-100">
        <CardContent className="pt-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2 sm:col-span-1 lg:col-span-2">
              <Label className="text-base font-semibold text-slate-800">Vehículo</Label>
              <Select value={dominio} onValueChange={(v: string | null) => setDominio(v ?? "")}>
                <SelectTrigger className="h-14 text-lg font-semibold text-slate-900 data-[state=open]:border-blue-400 data-[state=open]:ring-2 data-[state=open]:ring-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200">
                  <SelectValue placeholder="Seleccionar vehículo..." />
                </SelectTrigger>
                <SelectContent>
                  {vehiculosFiltrados.map((v) => (
                    <SelectItem key={v.id} value={v.dominio} className="text-base py-2.5">
                      <span className="font-semibold">{v.dominio}</span>
                      {v.descripcion ? <span className="text-muted-foreground"> — {v.descripcion}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-1 lg:col-span-2">
              <Label className="text-base font-semibold text-slate-800">Chofer</Label>
              <Select value={chofer} onValueChange={(v: string | null) => setChofer(v ?? "")}>
                <SelectTrigger className="h-14 text-lg font-semibold text-slate-900 data-[state=open]:border-blue-400 data-[state=open]:ring-2 data-[state=open]:ring-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200">
                  <SelectValue placeholder="Seleccionar chofer..." />
                </SelectTrigger>
                <SelectContent>
                  {choferes.map((c) => (
                    <SelectItem key={c.id} value={c.nombre} className="text-base py-2.5">
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label className="text-base font-semibold text-slate-800">Odómetro (km)</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ej: 125430"
                value={odometro}
                onChange={(e) => setOdometro(e.target.value)}
                className="h-14 text-lg font-semibold tracking-wide text-slate-900 focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-200"
              />
            </div>

            <div className="space-y-2 sm:col-span-1 lg:col-span-2">
              <Label className="text-sm font-medium text-slate-600">Sector (filtro)</Label>
              <Select
                value={sectorFiltro}
                onValueChange={(v: string | null) => {
                  const next = (v ?? "todos") as VehiculoSector | "todos"
                  setSectorFiltro(next)
                  setDominio("")
                }}
              >
                <SelectTrigger className="h-11 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="distribucion">{VEHICULO_SECTOR_LABELS.distribucion}</SelectItem>
                  <SelectItem value="deposito">{VEHICULO_SECTOR_LABELS.deposito}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-600">Progreso del checklist</Label>
                <span
                  className={`text-base font-bold tabular-nums ${
                    todosCompletados
                      ? hayRechazo
                        ? "text-red-600"
                        : "text-green-600"
                      : "text-blue-600"
                  }`}
                >
                  {completados}/{totalItems}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    todosCompletados
                      ? hayRechazo
                        ? "bg-red-500"
                        : "bg-green-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${totalItems > 0 ? (completados / totalItems) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert if rechazado */}
      {hayRechazo && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-400 bg-red-50 p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <ShieldAlert className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold uppercase tracking-wide text-red-700 sm:text-xl">
                Checklist Rechazado
              </p>
              <p className="mt-1 text-sm text-red-700">
                {criticosRechazados.length} ítem
                {criticosRechazados.length === 1 ? "" : "s"} crítico
                {criticosRechazados.length === 1 ? "" : "s"} no aprobado
                {criticosRechazados.length === 1 ? "" : "s"}. Al registrar quedará marcado como RECHAZADO.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {criticosRechazados.map((i) => (
                  <span
                    key={i.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-800"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {i.nombre}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checklist items by category */}
      {groups.map((group) => (
        <Card key={group.categoria}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {group.categoria}
              <Badge variant="outline" className="font-normal">
                {group.items.length} ítems
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.items.map((item) => {
              const opciones = opcionesMap[item.tipo_respuesta] || opcionesMap.ok_nook
              const valor = respuestas[item.id]
              const esNook = valor === "nook" || valor === "malo"
              const esRechazoCritico = item.critico && esNook

              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    esRechazoCritico
                      ? "border-red-300 bg-red-50"
                      : valor === "ok" || valor === "bueno"
                      ? "border-green-200 bg-green-50/50"
                      : valor === "regular"
                      ? "border-amber-200 bg-amber-50/50"
                      : esNook
                      ? "border-red-200 bg-red-50/50"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {item.nombre}
                        </p>
                        {item.critico && (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px] px-1.5">
                            <AlertTriangle className="mr-0.5 h-3 w-3" />
                            CRÍTICO
                          </Badge>
                        )}
                        {valor && (
                          esNook ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : valor === "regular" ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )
                        )}
                      </div>
                      {item.descripcion && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.descripcion}
                        </p>
                      )}
                    </div>

                    {/* Response buttons */}
                    <div className="flex gap-2 shrink-0">
                      {opciones.map((op) => (
                        <button
                          key={op.value}
                          type="button"
                          onClick={() => setRespuesta(item.id, op.value)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                            valor === op.value
                              ? `${op.color} ring-2 ring-offset-1 ${
                                  op.value === "ok" || op.value === "bueno"
                                    ? "ring-green-400"
                                    : op.value === "regular"
                                    ? "ring-amber-400"
                                    : "ring-red-400"
                                }`
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment field for nook/regular items */}
                  {(esNook || valor === "regular") && (
                    <div className="mt-3">
                      <Textarea
                        placeholder="Comentario sobre la novedad..."
                        value={comentarios[item.id] || ""}
                        onChange={(e) => setComentario(item.id, e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Observaciones generales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observaciones Generales</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Observaciones adicionales..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-base font-medium sm:text-lg">
            {todosCompletados ? (
              hayRechazo ? (
                <span className="flex items-center gap-2 text-red-700">
                  <ShieldAlert className="h-5 w-5" />
                  Se registrará como RECHAZADO
                </span>
              ) : (
                <span className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Listo para registrar
                </span>
              )
            ) : (
              <span className="flex items-center gap-2 text-slate-600">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Faltan {totalItems - completados} ítem
                {totalItems - completados === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={saving || !todosCompletados || !dominio || !chofer}
            className={`h-14 w-full text-base font-semibold text-white shadow-md transition-colors sm:w-auto sm:min-w-[260px] sm:text-lg ${
              hayRechazo && todosCompletados
                ? "bg-red-600 hover:bg-red-700"
                : tipo === "liberacion"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-orange-500 hover:bg-orange-600"
            } disabled:opacity-60`}
          >
            {saving ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : hayRechazo ? (
              <ShieldAlert className="mr-2 h-5 w-5" />
            ) : (
              <ClipboardCheck className="mr-2 h-5 w-5" />
            )}
            {saving
              ? "Registrando..."
              : hayRechazo
              ? `Registrar Rechazo de ${tipo === "liberacion" ? "Liberación" : "Retorno"}`
              : `Registrar ${tipo === "liberacion" ? "Liberación" : "Retorno"}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
