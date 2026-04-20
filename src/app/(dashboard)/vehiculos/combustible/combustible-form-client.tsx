"use client"

import { useState } from "react"
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
  CatalogoChofer,
  CatalogoVehiculo,
  VehiculoSector,
} from "@/types/database"
import { VEHICULO_SECTOR_LABELS } from "@/types/database"
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
  const [proveedor, setProveedor] = useState("")
  const [numeroRemito, setNumeroRemito] = useState("")
  const [costoTotal, setCostoTotal] = useState("")
  const [observaciones, setObservaciones] = useState("")
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

    setSaving(true)
    const hoy = new Date().toISOString().slice(0, 10)

    const result = await createRegistroCombustible({
      fecha: hoy,
      dominio,
      chofer,
      odometro: parseInt(odometro),
      litros: parseFloat(litros),
      proveedor: proveedor || undefined,
      numero_remito: numeroRemito || undefined,
      costo_total: costoTotal ? parseFloat(costoTotal) : undefined,
      observaciones: observaciones || undefined,
    })

    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Carga de combustible registrada")
      if (result.data.rendimiento != null) {
        toast.info(`Rendimiento: ${result.data.rendimiento} km/l (${result.data.km_recorridos} km recorridos)`)
      } else {
        toast.info("Primera carga para este vehículo — el rendimiento se calculará en la próxima")
      }
      router.push("/vehiculos")
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Registro de Combustible
        </h1>
        <p className="text-sm text-muted-foreground">
          Registrá la carga de combustible para calcular el rendimiento del vehículo
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="h-5 w-5" />
            Datos de la Carga
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
              <Label>Litros cargados</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Ej: 120.5"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Costo total ($)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Opcional"
                value={costoTotal}
                onChange={(e) => setCostoTotal(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Proveedor / Estación</Label>
              <Input
                placeholder="Opcional"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>N° Remito</Label>
              <Input
                placeholder="Opcional"
                value={numeroRemito}
                onChange={(e) => setNumeroRemito(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              placeholder="Opcional"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={saving || !dominio || !chofer || !odometro || !litros}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Gauge className="mr-2 h-4 w-4" />
          )}
          Registrar Carga
        </Button>
      </div>
    </div>
  )
}
