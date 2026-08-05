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
import {
  validarLectura,
  type LecturaPrevia,
} from "@/lib/vehiculos/validar-lectura"
import { Fuel, Loader2, Gauge } from "lucide-react"
import { createRegistroCombustible } from "@/actions/combustible"

interface Props {
  vehiculos: CatalogoVehiculo[]
  choferes: CatalogoChofer[]
  /** Última lectura conocida por dominio, para validar el odómetro al tipearlo. */
  ultimasLecturas: Record<string, LecturaPrevia>
}

/**
 * El nombre escrito a mano se guarda en el mismo formato que el catálogo
 * (MAYÚSCULAS, un espacio entre palabras). Si coincide con alguien que ya está
 * cargado, se usa el nombre del catálogo tal cual: los reportes por chofer
 * cruzan `registro_combustible.chofer` con `catalogo_choferes.nombre` por TEXTO,
 * y dos grafías del mismo nombre aparecerían como dos personas distintas.
 */
function normalizarChofer(valor: string, catalogo: CatalogoChofer[]): string {
  const limpio = valor.trim().replace(/\s+/g, " ").toUpperCase()
  const enCatalogo = catalogo.find(
    (c) => c.nombre.trim().replace(/\s+/g, " ").toUpperCase() === limpio
  )
  return enCatalogo ? enCatalogo.nombre : limpio
}

export function CombustibleFormClient({
  vehiculos,
  choferes,
  ultimasLecturas,
}: Props) {
  const router = useRouter()
  const [sectorFiltro, setSectorFiltro] = useState<VehiculoSector | "todos">(
    "todos"
  )
  const [dominio, setDominio] = useState("")

  const vehiculosFiltrados = vehiculos.filter((v) =>
    sectorFiltro === "todos" ? true : v.sector === sectorFiltro
  )
  const [chofer, setChofer] = useState("")
  // El catálogo de choferes es el de reparto: quien maneja una camioneta o
  // reemplaza por un día no está ahí y antes no tenía cómo registrarse. Con esto
  // el nombre se puede escribir a mano, igual que el conductor en el checklist.
  const [choferManual, setChoferManual] = useState(false)
  const [odometro, setOdometro] = useState("")
  const [litros, setLitros] = useState("")
  const [saving, setSaving] = useState(false)
  // Fecha de hoy fijada al montar (no se recalcula en cada render).
  const [hoyISO] = useState(() => new Date().toISOString().slice(0, 10))
  // Mismo control que en el checklist: un odómetro con un dígito de más queda
  // pegado como km actual de la unidad y descoloca rendimiento, plan y cubiertas.
  const vehiculoSel = vehiculos.find((v) => v.dominio === dominio)
  const esCamioneta = vehiculoSel?.tipo === "camioneta"
  const lecturaPrevia = dominio ? (ultimasLecturas[dominio] ?? null) : null
  const errorOdometro = odometro
    ? validarLectura({
        valor: parseInt(odometro, 10),
        previa: lecturaPrevia,
        fecha: hoyISO,
        esHorometro: vehiculoSel?.tipo === "autoelevador",
      })
    : null

  const choferFinal = choferManual ? normalizarChofer(chofer, choferes) : chofer

  async function handleSubmit() {
    if (!dominio || !choferFinal) {
      toast.error("Seleccioná vehículo y chofer")
      return
    }
    if (choferManual && choferFinal.length < 5) {
      toast.error("Escribí el apellido y el nombre del chofer")
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
    if (errorOdometro) {
      toast.error(errorOdometro)
      return
    }

    setSaving(true)
    const hoy = new Date().toISOString().slice(0, 10)

    const result = await createRegistroCombustible({
      fecha: hoy,
      dominio,
      chofer: choferFinal,
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
              <Select
                value={dominio}
                onValueChange={(v: string | null) => {
                  const dom = v ?? ""
                  setDominio(dom)
                  // Las camionetas las puede manejar cualquiera y no están en el
                  // catálogo de reparto: arrancan con el nombre escrito a mano,
                  // igual que el conductor en el checklist de camioneta.
                  const esCamionetaNueva =
                    vehiculos.find((x) => x.dominio === dom)?.tipo === "camioneta"
                  if (esCamionetaNueva && !choferManual) {
                    setChoferManual(true)
                    setChofer("")
                  }
                }}
              >
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
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Label className="text-base font-semibold text-slate-800">
                  {esCamioneta ? "Conductor" : "Chofer"}
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    setChoferManual((m) => !m)
                    setChofer("")
                  }}
                  className="text-sm font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
                >
                  {choferManual ? "Elegir de la lista" : "No está en la lista"}
                </button>
              </div>
              {choferManual ? (
                <>
                  <Input
                    placeholder="Ej: PEREZ JUAN"
                    value={chofer}
                    onChange={(e) => setChofer(e.target.value)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="h-14 text-lg font-semibold text-slate-900 focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-200"
                  />
                  <p className="text-xs text-slate-500">
                    Escribí apellido y nombre completos. Se guarda en mayúsculas.
                  </p>
                </>
              ) : (
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
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-base font-semibold text-slate-800">Odómetro (km)</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ej: 125430"
                value={odometro}
                onChange={(e) => setOdometro(e.target.value)}
                className={`h-14 text-lg font-semibold tracking-wide text-slate-900 focus-visible:ring-2 ${
                  errorOdometro
                    ? "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-200"
                    : "focus-visible:border-blue-400 focus-visible:ring-blue-200"
                }`}
              />
              {errorOdometro ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {errorOdometro}
                </p>
              ) : lecturaPrevia ? (
                <p className="text-xs text-slate-500">
                  Última lectura: {new Intl.NumberFormat("es-AR").format(lecturaPrevia.odometro)} km (
                  {lecturaPrevia.fecha.slice(0, 10).split("-").reverse().join("/")})
                </p>
              ) : null}
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
          disabled={saving || !dominio || !choferFinal || !odometro || !litros || !!errorOdometro}
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
