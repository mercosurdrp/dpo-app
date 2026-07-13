"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type {
  CatalogoChofer,
  CatalogoVehiculo,
  VehiculoSector,
} from "@/types/database"
import { VEHICULO_SECTOR_LABELS } from "@/types/database"
import { LITROS_MAX, validarLitros } from "@/lib/vehiculos/combustible-limites"
import { Fuel, Loader2, Gauge } from "lucide-react"
import { createRegistroCombustible } from "@/actions/combustible"

interface Props {
  vehiculos: CatalogoVehiculo[]
  choferes: CatalogoChofer[]
}

export function CombustibleFormClient({ vehiculos, choferes }: Props) {
  const router = useRouter()
  const [sectorFiltro, setSectorFiltro] = useState<VehiculoSector | "todos">(
    "todos"
  )
  const [dominio, setDominio] = useState("")

  const vehiculosFiltrados = vehiculos.filter((v) =>
    sectorFiltro === "todos" ? true : v.sector === sectorFiltro
  )
  const [chofer, setChofer] = useState("")
  const [odometro, setOdometro] = useState("")
  const [litros, setLitros] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!dominio || !chofer) {
      toast.error("Seleccioná vehículo y chofer")
      return
    }
    if (!odometro || !litros) {
      toast.error("Completá odómetro y litros")
      return
    }
    const errorLitros = validarLitros(parseFloat(litros))
    if (errorLitros) {
      toast.error(errorLitros)
      return
    }

    setSaving(true)
    const hoy = new Date().toISOString().slice(0, 10)

    const result = await createRegistroCombustible({
      fecha: hoy,
      dominio,
      chofer,
      odometro: parseInt(odometro),
      litros: parseFloat(litros),
    })

    if ("error" in result) {
      toast.error(result.error)
      setSaving(false)
      return
    }

    toast.success("Carga de combustible registrada")
    if (result.data.rendimiento != null) {
      toast.info(`Rendimiento: ${result.data.rendimiento} km/l (${result.data.km_recorridos} km recorridos)`)
    } else {
      toast.info("Primera carga para este vehículo — el rendimiento se calculará en la próxima")
    }
    // Redirige al home del empleado. NO re-habilitamos el botón (no llamamos a
    // setSaving(false)): el form se desmonta al navegar, así el chofer no puede
    // reenviar mientras /mis-capacitaciones carga. Era la causa de las cargas
    // duplicadas. replace en vez de push: con "atrás" no vuelve al form enviado.
    router.replace("/mis-capacitaciones")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Registro de Combustible
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Registrá la carga para calcular el rendimiento del vehículo
        </p>
      </div>

      <Card className="border-blue-100">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Fuel className="h-6 w-6 text-blue-600" />
            Datos de la Carga
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
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

            <div className="space-y-2 sm:col-span-2">
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

            <div className="space-y-2 sm:col-span-2">
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

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-base font-semibold text-slate-800">Litros cargados</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max={LITROS_MAX}
                placeholder="Ej: 120.5"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                className="h-14 text-lg font-semibold tracking-wide text-slate-900 focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-200"
              />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
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
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button
          onClick={handleSubmit}
          disabled={saving || !dominio || !chofer || !odometro || !litros}
          className="h-14 w-full bg-blue-600 text-base font-semibold text-white shadow-md transition-colors hover:bg-blue-700 sm:w-auto sm:min-w-[260px] sm:text-lg sm:ml-auto sm:flex disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Gauge className="mr-2 h-5 w-5" />
          )}
          {saving ? "Registrando..." : "Registrar Carga"}
        </Button>
      </div>
    </div>
  )
}
