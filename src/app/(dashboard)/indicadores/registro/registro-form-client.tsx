"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { createRegistroVehiculo } from "@/actions/registros-vehiculos"
import type { CatalogoChofer, CatalogoVehiculo } from "@/types/database"
import {
  ArrowLeft,
  Truck,
  LogIn,
  LogOut,
  Loader2,
  Clock,
  Check,
} from "lucide-react"
import Link from "next/link"

interface Props {
  choferes: CatalogoChofer[]
  vehiculos: CatalogoVehiculo[]
}

export function RegistroFormClient({ choferes, vehiculos }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const [tipo, setTipo] = useState<"egreso">("egreso")
  const [horaEntrada, setHoraEntrada] = useState<6 | 7>(7)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [dominio, setDominio] = useState("")
  const [chofer, setChofer] = useState("")
  const [ayudante1, setAyudante1] = useState("")
  const [ayudante2, setAyudante2] = useState("")
  const [odometro, setOdometro] = useState("")
  const [hora, setHora] = useState("")
  const [observaciones, setObservaciones] = useState("")

  // All people (choferes) for ayudante selects
  const personasOptions = choferes.map((c) => c.nombre)

  // Calculate TML preview
  const tmlPreview = (() => {
    if (tipo !== "egreso" || !hora) return null
    const [h, m] = hora.split(":").map(Number)
    const tml = h * 60 + m - horaEntrada * 60
    return tml
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dominio) { toast.error("Seleccioná un dominio"); return }
    if (!chofer) { toast.error("Seleccioná un chofer"); return }
    if (!hora) { toast.error("Ingresá la hora"); return }

    setLoading(true)
    const result = await createRegistroVehiculo({
      tipo,
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
    toast.success(
      tipo === "egreso"
        ? `Egreso registrado — TML: ${tmlPreview} min`
        : "Ingreso registrado"
    )

    // Reset for next entry
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/indicadores">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Indicadores
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Registro de Vehículos
          </h1>
          <p className="text-sm text-muted-foreground">
            Registrá el egreso de cada camión para calcular el TML
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-5 w-5" />
                Datos del Registro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tipo selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipo("egreso")}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-semibold transition-all ${
                    tipo === "egreso"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-slate-200 text-slate-500 hover:border-amber-300"
                  }`}
                >
                  <LogOut className="h-4 w-4" />
                  Egreso
                </button>
                <button
                  type="button"
                  onClick={() => setTipo("egreso")}
                  disabled
                  className="flex items-center justify-center gap-2 rounded-lg border-2 border-slate-200 p-3 text-sm font-semibold text-slate-300 cursor-not-allowed"
                >
                  <LogIn className="h-4 w-4" />
                  Ingreso (pronto)
                </button>
              </div>

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
              <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="grid gap-4 sm:grid-cols-2">
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

              <Button type="submit" className="w-full" disabled={loading || saved}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                ) : saved ? (
                  <><Check className="mr-2 h-4 w-4" /> Registrado</>
                ) : (
                  "Registrar Egreso"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Right: TML Preview */}
          <div className="space-y-4">
            <Card className={
              tmlPreview !== null
                ? tmlPreview <= 30
                  ? "border-green-300 bg-green-50/50"
                  : tmlPreview <= 45
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-red-300 bg-red-50/50"
                : ""
            }>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-5 w-5" />
                  TML (Tiempo Medio de Liberación)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tmlPreview !== null ? (
                  <div className="text-center space-y-2">
                    <div className={`text-5xl font-bold ${
                      tmlPreview <= 30
                        ? "text-green-600"
                        : tmlPreview <= 45
                          ? "text-amber-600"
                          : "text-red-600"
                    }`}>
                      {tmlPreview} min
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Hora salida: {hora} — Hora entrada: {horaEntrada === 6 ? "06:00" : "07:00"}
                    </p>
                    <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                      tmlPreview <= 30
                        ? "bg-green-100 text-green-700"
                        : tmlPreview <= 45
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}>
                      {tmlPreview <= 30 ? "Dentro de meta (≤30 min)" : tmlPreview <= 45 ? "Fuera de meta" : "Muy fuera de meta"}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Ingresá la hora de salida para ver el TML
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 text-sm">
                  <h3 className="font-semibold text-slate-900">Meta DPO 2.0</h3>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TML objetivo</span>
                    <span className="font-medium">≤ 30 minutos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">% dentro de meta</span>
                    <span className="font-medium">≥ 65%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hora de entrada</span>
                    <span className="font-medium">06:00 / 07:00 hs</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
