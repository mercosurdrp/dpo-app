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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Checklist de Vehículo
        </h1>
        <p className="text-sm text-muted-foreground">
          Inspección de seguridad — {tipo === "liberacion" ? "Liberación (salida)" : "Retorno (vuelta)"}
        </p>
      </div>

      {/* Config */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label>Tipo de Checklist</Label>
              <Select value={tipo} onValueChange={(v: string | null) => setTipo((v ?? "liberacion") as TipoChecklist)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="liberacion">Liberación (Salida)</SelectItem>
                  <SelectItem value="retorno">Retorno (Vuelta)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Select
                value={sectorFiltro}
                onValueChange={(v: string | null) => {
                  const next = (v ?? "todos") as VehiculoSector | "todos"
                  setSectorFiltro(next)
                  setDominio("")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="distribucion">
                    {VEHICULO_SECTOR_LABELS.distribucion}
                  </SelectItem>
                  <SelectItem value="deposito">
                    {VEHICULO_SECTOR_LABELS.deposito}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vehículo</Label>
              <Select value={dominio} onValueChange={(v: string | null) => setDominio(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {vehiculosFiltrados.map((v) => (
                    <SelectItem key={v.id} value={v.dominio}>
                      {v.dominio} {v.descripcion ? `— ${v.descripcion}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Chofer</Label>
              <Select value={chofer} onValueChange={(v: string | null) => setChofer(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {choferes.map((c) => (
                    <SelectItem key={c.id} value={c.nombre}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Odómetro (km)</Label>
              <Input
                type="number"
                placeholder="Ej: 125430"
                value={odometro}
                onChange={(e) => setOdometro(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Progreso</Label>
              <div className="flex items-center gap-2 pt-1">
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      todosCompletados
                        ? hayRechazo
                          ? "bg-red-500"
                          : "bg-green-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${totalItems > 0 ? (completados / totalItems) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  {completados}/{totalItems}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert if rechazado */}
      {hayRechazo && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">
                Checklist será RECHAZADO
              </p>
              <p className="mt-1 text-sm text-red-700">
                {criticosRechazados.length} ítem(s) crítico(s) no aprobado(s):{" "}
                {criticosRechazados.map((i) => i.nombre).join(", ")}
              </p>
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
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {todosCompletados ? (
            hayRechazo ? (
              <span className="text-red-600 font-medium">
                Checklist será registrado como RECHAZADO
              </span>
            ) : (
              <span className="text-green-600 font-medium">
                Todos los ítems completados
              </span>
            )
          ) : (
            <span>Faltan {totalItems - completados} ítems</span>
          )}
        </div>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={saving || !todosCompletados || !dominio || !chofer}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ClipboardCheck className="mr-2 h-4 w-4" />
          )}
          Registrar Checklist de {tipo === "liberacion" ? "Liberación" : "Retorno"}
        </Button>
      </div>
    </div>
  )
}
