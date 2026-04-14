"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type {
  OwdItem,
  OwdResultado,
  CatalogoChofer,
  CatalogoVehiculo,
} from "@/types/database"
import { Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { createObservacion } from "@/actions/owd-pre-ruta"

interface Props {
  items: OwdItem[]
  choferes: CatalogoChofer[]
  vehiculos: CatalogoVehiculo[]
}

type Respuestas = Record<string, { resultado: OwdResultado; comentario: string }>

export function NuevaOwdClient({ items, choferes, vehiculos }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(today)
  const [supervisor, setSupervisor] = useState("")
  const [empleado, setEmpleado] = useState("")
  const [rol, setRol] = useState<string>("Chofer")
  const [dominio, setDominio] = useState<string>("")
  const [accionCorrectiva, setAccionCorrectiva] = useState("")
  const [obsGeneral, setObsGeneral] = useState("")

  const [respuestas, setRespuestas] = useState<Respuestas>(() =>
    Object.fromEntries(items.map((i) => [i.id, { resultado: "ok" as OwdResultado, comentario: "" }])),
  )

  const itemsPorEtapa = useMemo(() => {
    const map = new Map<string, OwdItem[]>()
    for (const i of items) {
      if (!map.has(i.etapa)) map.set(i.etapa, [])
      map.get(i.etapa)!.push(i)
    }
    return Array.from(map.entries())
  }, [items])

  const totalOk = Object.values(respuestas).filter((r) => r.resultado === "ok").length
  const totalNook = Object.values(respuestas).filter((r) => r.resultado === "nook").length
  const totalNa = Object.values(respuestas).filter((r) => r.resultado === "na").length
  const evaluables = totalOk + totalNook
  const pct = evaluables === 0 ? 0 : Math.round((totalOk / evaluables) * 1000) / 10

  function setResultado(itemId: string, resultado: OwdResultado) {
    setRespuestas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], resultado } }))
  }
  function setComentario(itemId: string, comentario: string) {
    setRespuestas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], comentario } }))
  }

  async function handleSubmit() {
    if (!supervisor.trim()) {
      toast.error("Ingresá el nombre del supervisor")
      return
    }
    if (!empleado.trim()) {
      toast.error("Seleccioná el empleado observado")
      return
    }
    setSaving(true)
    const result = await createObservacion({
      fecha,
      supervisor,
      empleadoObservado: empleado,
      rolEmpleado: rol,
      dominio: dominio || undefined,
      respuestas: items.map((i) => ({
        item_id: i.id,
        resultado: respuestas[i.id].resultado,
        comentario: respuestas[i.id].comentario || undefined,
      })),
      accionCorrectiva: accionCorrectiva || undefined,
      observaciones: obsGeneral || undefined,
    })
    setSaving(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("OWD guardada")
    router.push(`/indicadores/owd-pre-ruta/${result.data.id}`)
  }

  const personasOptions = choferes.map((c) => c.nombre)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nueva OWD Pre-Ruta</h1>
        <p className="text-sm text-muted-foreground">
          Observación en el puesto de trabajo — SOP 1.1
        </p>
      </div>

      {/* Cabecera */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la observación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Supervisor</Label>
              <Input
                placeholder="Nombre del SDR"
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Empleado observado</Label>
              <Select value={empleado} onValueChange={(v: string | null) => setEmpleado(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {personasOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={rol} onValueChange={(v: string | null) => setRol(v ?? "Chofer")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chofer">Chofer</SelectItem>
                  <SelectItem value="Ayudante">Ayudante</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Dominio (opcional)</Label>
            <Select value={dominio} onValueChange={(v: string | null) => setDominio(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Sin seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {vehiculos.map((v) => (
                  <SelectItem key={v.id} value={v.dominio}>
                    {v.dominio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Resumen en vivo */}
      <Card className="sticky top-2 z-10 border-slate-200 bg-white/95 backdrop-blur">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" /> {totalOk}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-4 w-4" /> {totalNook}
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <MinusCircle className="h-4 w-4" /> {totalNa}
            </span>
          </div>
          <div
            className={`text-lg font-bold ${
              pct >= 90 ? "text-green-600" : pct >= 75 ? "text-amber-600" : "text-red-600"
            }`}
          >
            {pct.toFixed(1)}%
          </div>
        </CardContent>
      </Card>

      {/* Ítems agrupados por etapa */}
      {itemsPorEtapa.map(([etapa, grupo]) => (
        <Card key={etapa}>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500">
              {etapa}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grupo.map((item) => {
              const r = respuestas[item.id]
              return (
                <div
                  key={item.id}
                  className="space-y-2 rounded-md border bg-slate-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {item.texto}
                        {item.critico && (
                          <span className="ml-1 text-xs font-bold text-red-600">*</span>
                        )}
                      </p>
                      {item.descripcion && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={r.resultado === "ok" ? "default" : "outline"}
                      className={
                        r.resultado === "ok" ? "bg-green-600 hover:bg-green-700" : ""
                      }
                      onClick={() => setResultado(item.id, "ok")}
                    >
                      OK
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={r.resultado === "nook" ? "default" : "outline"}
                      className={
                        r.resultado === "nook" ? "bg-red-600 hover:bg-red-700" : ""
                      }
                      onClick={() => setResultado(item.id, "nook")}
                    >
                      NO OK
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={r.resultado === "na" ? "default" : "outline"}
                      className={r.resultado === "na" ? "bg-slate-600 hover:bg-slate-700" : ""}
                      onClick={() => setResultado(item.id, "na")}
                    >
                      N/A
                    </Button>
                  </div>
                  {r.resultado === "nook" && (
                    <Textarea
                      placeholder="Comentario obligatorio para NO OK"
                      rows={2}
                      value={r.comentario}
                      onChange={(e) => setComentario(item.id, e.target.value)}
                    />
                  )}
                  {r.resultado !== "nook" && r.comentario && (
                    <Textarea
                      placeholder="Comentario"
                      rows={2}
                      value={r.comentario}
                      onChange={(e) => setComentario(item.id, e.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Cierre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cierre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Acción correctiva (si hubo NO OK)</Label>
            <Textarea
              rows={3}
              placeholder="Qué se hizo o se va a hacer para corregir los desvíos"
              value={accionCorrectiva}
              onChange={(e) => setAccionCorrectiva(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones generales</Label>
            <Textarea
              rows={3}
              value={obsGeneral}
              onChange={(e) => setObsGeneral(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push("/indicadores/owd-pre-ruta")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar OWD
        </Button>
      </div>
    </div>
  )
}
