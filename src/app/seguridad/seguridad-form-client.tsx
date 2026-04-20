"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { createRegistroPublic } from "@/actions/seguridad"
import type { CatalogoChofer, CatalogoVehiculo } from "@/types/database"
import { Truck, LogOut, Loader2, Check, Clock, ShieldCheck } from "lucide-react"

interface Props {
  choferes: CatalogoChofer[]
  vehiculos: CatalogoVehiculo[]
}

export function SeguridadFormClient({ choferes, vehiculos }: Props) {
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const [horaEntrada, setHoraEntrada] = useState<6 | 7>(7)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [dominio, setDominio] = useState("")
  const [chofer, setChofer] = useState("")
  const [ayudante1, setAyudante1] = useState("")
  const [ayudante2, setAyudante2] = useState("")
  const [odometro, setOdometro] = useState("")
  const [hora, setHora] = useState("")
  const [observaciones, setObservaciones] = useState("")

  const personasOptions = choferes.map((c) => c.nombre)

  // TML preview
  const tmlPreview = (() => {
    if (!hora) return null
    const [h, m] = hora.split(":").map(Number)
    return h * 60 + m - horaEntrada * 60
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dominio) { toast.error("Seleccioná un dominio"); return }
    if (!chofer) { toast.error("Seleccioná un chofer"); return }
    if (!hora) { toast.error("Ingresá la hora"); return }

    setLoading(true)
    const result = await createRegistroPublic({
      tipo: "egreso",
      fecha,
      dominio,
      chofer,
      ayudante1: ayudante1 && ayudante1 !== "SIN AYUDANTE" ? ayudante1 : undefined,
      ayudante2: ayudante2 && ayudante2 !== "SIN AYUDANTE" ? ayudante2 : undefined,
      odometro: odometro ? parseInt(odometro) : undefined,
      hora,
      horaEntrada,
      observaciones: observaciones || undefined,
    })
    setLoading(false)

    if ("error" in result) {
      toast.error(result.error)
      return
    }

    setSaved(true)
    toast.success(`Egreso registrado — TML: ${tmlPreview} min`)

    setTimeout(() => {
      setHoraEntrada(7)
      setDominio("")
      setChofer("")
      setAyudante1("")
      setAyudante2("")
      setOdometro("")
      setHora("")
      setObservaciones("")
      setSaved(false)
    }, 1500)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-2 text-slate-700">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="text-xl font-bold">Registro de Vehículos</h1>
        </div>
        <p className="text-sm text-muted-foreground">Seguridad — {process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Región Pampeana"}</p>
      </div>

      {/* TML Preview */}
      {tmlPreview !== null && (
        <Card className={
          tmlPreview <= 30
            ? "border-green-300 bg-green-50/50"
            : tmlPreview <= 45
              ? "border-amber-300 bg-amber-50/50"
              : "border-red-300 bg-red-50/50"
        }>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">TML</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-bold ${
                  tmlPreview <= 30
                    ? "text-green-600"
                    : tmlPreview <= 45
                      ? "text-amber-600"
                      : "text-red-600"
                }`}>
                  {tmlPreview} min
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  tmlPreview <= 30
                    ? "bg-green-100 text-green-700"
                    : tmlPreview <= 45
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}>
                  {tmlPreview <= 30 ? "OK" : tmlPreview <= 45 ? "Fuera" : "Crítico"}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Salida: {hora} — Entrada: {horaEntrada === 6 ? "06:00" : "07:00"}
            </p>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5" />
              <span>Egreso de Vehículo</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Horario de entrada */}
            <div className="space-y-2">
              <Label>Horario de entrada</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHoraEntrada(7)}
                  className={`rounded-lg border-2 p-2.5 text-sm font-semibold transition-all ${
                    horaEntrada === 7
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500 hover:border-blue-300"
                  }`}
                >
                  07:00 hs
                </button>
                <button
                  type="button"
                  onClick={() => setHoraEntrada(6)}
                  className={`rounded-lg border-2 p-2.5 text-sm font-semibold transition-all ${
                    horaEntrada === 6
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500 hover:border-blue-300"
                  }`}
                >
                  06:00 hs
                </button>
              </div>
            </div>

            {/* Fecha + Hora */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora de salida *</Label>
                <Input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                />
              </div>
            </div>

            {/* Dominio */}
            <div className="space-y-2">
              <Label>Dominio *</Label>
              <Select value={dominio} onValueChange={(v) => setDominio(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar patente..." />
                </SelectTrigger>
                <SelectContent>
                  {vehiculos.map((v) => (
                    <SelectItem key={v.id} value={v.dominio}>
                      {v.dominio}
                      {v.descripcion && ` — ${v.descripcion}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chofer */}
            <div className="space-y-2">
              <Label>Chofer *</Label>
              <Select value={chofer} onValueChange={(v) => setChofer(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar chofer..." />
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

            {/* Ayudantes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ayudante 1</Label>
                <Select value={ayudante1} onValueChange={(v) => setAyudante1(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin ayudante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIN AYUDANTE">Sin ayudante</SelectItem>
                    {personasOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ayudante 2</Label>
                <Select value={ayudante2} onValueChange={(v) => setAyudante2(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin ayudante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIN AYUDANTE">Sin ayudante</SelectItem>
                    {personasOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Odómetro */}
            <div className="space-y-2">
              <Label>Odómetro</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Km del vehículo"
                value={odometro}
                onChange={(e) => setOdometro(e.target.value)}
              />
            </div>

            {/* Observaciones */}
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                placeholder="Opcional..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
              />
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading || saved}>
              {loading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Guardando...</>
              ) : saved ? (
                <><Check className="mr-2 h-5 w-5" /> Registrado</>
              ) : (
                <><LogOut className="mr-2 h-5 w-5" /> Registrar Egreso</>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
