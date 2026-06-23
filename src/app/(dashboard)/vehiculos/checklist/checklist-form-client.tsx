"use client"

import { useEffect, useState } from "react"
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

const CHOFERES_HABILITADOS_CHECKLIST = [
  "RIVERO FEDERICO",
  "SANDOVAL ANTONIO",
  "RIVERO EZEQUIEL",
  "CERBIN ADRIAN EUCEBIO",
  "FRIAS ANGEL",
  "ESCOBAR ROBERTO",
  "SEQUEIRA HUMBERTO",
  "ACOSTA JOEL",
  "RIVERO LAUREANO",
  "CORDONE LUIS",
]

function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

const CHOFERES_HABILITADOS_PALABRAS = CHOFERES_HABILITADOS_CHECKLIST.map((n) =>
  normalizarNombre(n).split(" ").filter(Boolean)
)

function choferEstaHabilitado(nombreDB: string): boolean {
  const palabrasDB = new Set(normalizarNombre(nombreDB).split(" ").filter(Boolean))
  return CHOFERES_HABILITADOS_PALABRAS.some((palabras) =>
    palabras.every((p) => palabrasDB.has(p))
  )
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

// Hora de corte (local) que define el tipo: antes de las 09:00 es salida
// (liberación), 09:00 o después es entrada (retorno). Debe coincidir con
// HORA_CORTE_LIBERACION del servidor (que es quien decide en firme).
const HORA_CORTE_LIBERACION = 9

export function ChecklistFormClient({ items, vehiculos, choferes }: Props) {
  const router = useRouter()
  // El chofer ya no elige el tipo: se deriva de la hora actual. Mantenemos un
  // reloj en vivo para que el cartel se actualice si cruza las 09:00 con el
  // form abierto. El servidor recalcula el tipo en firme al registrar.
  const [ahora, setAhora] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const tipo: TipoChecklist =
    ahora.getHours() < HORA_CORTE_LIBERACION ? "liberacion" : "retorno"
  const [sectorFiltro, setSectorFiltro] = useState<VehiculoSector | "todos">(
    "todos"
  )
  const [dominio, setDominio] = useState("")

  const vehiculosFiltrados = vehiculos.filter((v) =>
    sectorFiltro === "todos" ? true : v.sector === sectorFiltro
  )

  // Vehículo elegido y si es autoelevador. Cambia el set de preguntas y el flujo:
  // los autoelevadores tienen su propio checklist (tipo_vehiculo = "autoelevador")
  // y se chequean una sola vez al inicio de la jornada (sin salida/entrada por hora).
  const vehiculoSel = vehiculos.find((v) => v.dominio === dominio)
  const esAutoelevador = vehiculoSel?.tipo === "autoelevador"

  // Ítems que aplican al vehículo elegido: los del autoelevador, o los generales
  // (camiones) cuando tipo_vehiculo es NULL.
  const itemsAplicables = items.filter((i) =>
    esAutoelevador ? i.tipo_vehiculo === "autoelevador" : i.tipo_vehiculo == null
  )

  // Para mostrar/colorear el botón: el autoelevador siempre es "liberación".
  const tipoVisual: TipoChecklist = esAutoelevador ? "liberacion" : tipo

  // Los choferes habilitados son los de reparto; para autoelevador el operario
  // (maquinista) puede no estar en esa lista, así que se ofrecen todos.
  const choferesHabilitados = choferes.filter((c) => choferEstaHabilitado(c.nombre))
  const choferesParaMostrar = esAutoelevador ? choferes : choferesHabilitados
  const [chofer, setChofer] = useState("")
  const [odometro, setOdometro] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [comentarios, setComentarios] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Marca de inicio del llenado (cuando el chofer abre el form). Se usa para
  // medir cuánto tarda en completar el checklist. Mismo reloj que el envío, así
  // la duración no depende de la diferencia con el reloj del servidor.
  const [inicioMs] = useState(() => Date.now())

  const groups = groupByCategoria(itemsAplicables)

  function setRespuesta(itemId: string, valor: string) {
    setRespuestas((prev) => ({ ...prev, [itemId]: valor }))
  }

  function setComentario(itemId: string, texto: string) {
    setComentarios((prev) => ({ ...prev, [itemId]: texto }))
  }

  // Check if any critical item is nook/malo
  const criticosRechazados = itemsAplicables.filter(
    (i) => i.critico && (respuestas[i.id] === "nook" || respuestas[i.id] === "malo")
  )
  const hayRechazo = criticosRechazados.length > 0

  // Check completeness — solo cuentan los ítems que aplican al vehículo elegido
  const totalItems = itemsAplicables.length
  const completados = itemsAplicables.filter((i) => respuestas[i.id]).length
  const todosCompletados = totalItems > 0 && completados === totalItems

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
      fecha: hoy,
      dominio,
      chofer,
      odometro: odometro ? parseInt(odometro) : undefined,
      observaciones: observaciones || undefined,
      iniciadoEn: new Date(inicioMs).toISOString(),
      duracionSegundos: Math.max(0, Math.round((Date.now() - inicioMs) / 1000)),
      respuestas: itemsAplicables.map((item) => ({
        item_id: item.id,
        valor: respuestas[item.id],
        comentario: comentarios[item.id] || undefined,
      })),
    })

    if ("error" in result) {
      toast.error(result.error)
      setSaving(false)
      return
    }

    // El tipo lo decide el servidor según la hora; el toast refleja lo guardado.
    const label =
      result.data.tipo === "liberacion" ? "salida del depósito" : "entrada al depósito"
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
    // Redirige al home del empleado. NO re-habilitamos el botón (no llamamos a
    // setSaving(false)): el form se desmonta al navegar, así el chofer no puede
    // reenviar mientras /mis-capacitaciones carga. Era la causa de los checklists
    // duplicados. replace en vez de push: con "atrás" no vuelve al form enviado.
    router.replace("/mis-capacitaciones")
  }

  return (
    <div className="space-y-6">
      {/* Hero: title + tipo automático según la hora */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Checklist de Vehículo
          </h1>
          <p className="text-sm text-muted-foreground">
            {esAutoelevador
              ? "Autoelevador — control de inicio de jornada"
              : "El tipo se define solo según la hora"}
          </p>
        </div>

        {esAutoelevador ? (
          <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-600 p-5 text-white shadow-sm sm:gap-5 sm:p-6">
            <ClipboardCheck className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                INICIO DE JORNADA
              </div>
              <div className="mt-1 text-xs text-emerald-100 sm:text-sm">
                El autoelevador se controla una vez al comenzar el día (sin checklist de retorno).
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`flex items-center gap-4 rounded-2xl border p-5 shadow-sm sm:gap-5 sm:p-6 ${
              tipo === "liberacion"
                ? "border-blue-200 bg-blue-600 text-white"
                : "border-orange-200 bg-orange-500 text-white"
            }`}
          >
            {tipo === "liberacion" ? (
              <LogOut className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" aria-hidden="true" />
            ) : (
              <LogIn className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                {tipo === "liberacion" ? "SALIDA DEL DEPÓSITO" : "ENTRADA AL DEPÓSITO"}
              </div>
              <div
                className={`mt-1 text-xs sm:text-sm ${
                  tipo === "liberacion" ? "text-blue-100" : "text-orange-100"
                }`}
              >
                Son las{" "}
                {ahora.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" — "}
                {tipo === "liberacion"
                  ? "antes de las 09:00 se registra como salida."
                  : "desde las 09:00 se registra como entrada."}
              </div>
            </div>
          </div>
        )}
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
                  {choferesParaMostrar.map((c) => (
                    <SelectItem key={c.id} value={c.nombre} className="text-base py-2.5">
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label className="text-base font-semibold text-slate-800">
                {esAutoelevador ? "Horómetro (horas)" : "Odómetro (km)"}
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={esAutoelevador ? "Ej: 1240" : "Ej: 125430"}
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
                : esAutoelevador
                ? "bg-emerald-600 hover:bg-emerald-700"
                : tipoVisual === "liberacion"
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
              ? `Registrar Rechazo de ${
                  esAutoelevador ? "Checklist" : tipoVisual === "liberacion" ? "Salida" : "Entrada"
                }`
              : `Registrar ${
                  esAutoelevador ? "Checklist" : tipoVisual === "liberacion" ? "Salida" : "Entrada"
                }`}
          </Button>
        </div>
      </div>
    </div>
  )
}
