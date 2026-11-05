"use client"
import { parseEnteroEsAR, parseNumeroEsAR } from "@/lib/numeros"

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
import { AlertTriangle, Fuel, Loader2, Gauge, Receipt } from "lucide-react"
import {
  createRegistroCombustible,
  type AvisoCargaFaltante,
  type PrecioLitroReciente,
} from "@/actions/combustible"

interface Props {
  vehiculos: CatalogoVehiculo[]
  choferes: CatalogoChofer[]
  /** Última lectura conocida por dominio, para validar el odómetro al tipearlo. */
  ultimasLecturas: Record<string, LecturaPrevia>
  /** Admin/supervisor: puede escribir un chofer que no está en la lista. */
  puedeTextoLibre: boolean
  /** Último precio por litro pagado, para sugerir el costo del ticket. */
  precios: { porDominio: Record<string, PrecioLitroReciente>; flota: PrecioLitroReciente | null }
  /** A dónde vuelve después de registrar. */
  volverA: string
}

/** Dónde se carga el gasoil (SOP de Combustible): estación con cuenta corriente. */
const LUGAR_AXION = "Axion (cuenta corriente)"
const LUGAR_OTRO = "__otro__"
/** Hasta cuántos días atrás se puede fechar una carga que faltó registrar. */
const DIAS_ATRAS_MAX = 60

/**
 * El nombre escrito a mano se guarda en el mismo formato que el catálogo
 * (MAYÚSCULAS, un espacio entre palabras). Si coincide con alguien que ya está
 * cargado, se usa el nombre del catálogo tal cual: los reportes por chofer
 * cruzan `registro_combustible.chofer` con `catalogo_choferes.nombre` por TEXTO,
 * y dos grafías del mismo nombre aparecerían como dos personas distintas.
 * También reconoce el nombre dado vuelta («EZEQUIEL TEVES» → «TEVES JORGE EZEQUIEL»
 * no, pero «EZEQUIEL RIVERO» → «RIVERO EZEQUIEL» sí: mismas palabras).
 */
function normalizarChofer(valor: string, catalogo: CatalogoChofer[]): string {
  const limpio = valor.trim().replace(/[.\s]+/g, " ").toUpperCase()
  const norm = (s: string) => s.trim().replace(/[.\s]+/g, " ").toUpperCase()
  const exacto = catalogo.find((c) => norm(c.nombre) === limpio)
  if (exacto) return exacto.nombre
  const palabras = limpio.split(" ").sort().join(" ")
  const mismasPalabras = catalogo.find(
    (c) => norm(c.nombre).split(" ").sort().join(" ") === palabras,
  )
  return mismasPalabras ? mismasPalabras.nombre : limpio
}

function hoyArgentinaISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
}

function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

export function CombustibleFormClient({
  vehiculos,
  choferes,
  ultimasLecturas,
  puedeTextoLibre,
  precios,
  volverA,
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
  // reemplaza por un día no está ahí. El nombre a mano queda para las
  // camionetas y para gestión; el chofer de camión elige de la lista (DPO 3.3:
  // el km/l por chofer cruza por texto).
  const [choferManual, setChoferManual] = useState(false)
  const [odometro, setOdometro] = useState("")
  const [litros, setLitros] = useState("")
  // Fecha de hoy fijada al montar (no se recalcula en cada render). Se puede
  // retroceder para registrar una carga que faltó.
  const [hoyISO] = useState(() => hoyArgentinaISO())
  const [fecha, setFecha] = useState(hoyISO)
  const [lugar, setLugar] = useState<string>(LUGAR_AXION)
  const [lugarOtro, setLugarOtro] = useState("")
  const [costo, setCosto] = useState("")
  const [ticket, setTicket] = useState("")
  const [saving, setSaving] = useState(false)
  // Después de guardar una carga con tramo sospechoso: la tarjeta que ofrece
  // registrar la carga que faltó.
  const [aviso, setAviso] = useState<AvisoCargaFaltante | null>(null)
  const [avisoDominio, setAvisoDominio] = useState("")

  const esCargaAtrasada = fecha !== "" && fecha < hoyISO

  // Mismo control que en el checklist: un odómetro con un dígito de más queda
  // pegado como km actual de la unidad y descoloca rendimiento, plan y cubiertas.
  // En una carga atrasada el odómetro es MENOR que la última lectura, así que
  // acá no se compara: la valida el servidor contra las lecturas de ese día.
  const vehiculoSel = vehiculos.find((v) => v.dominio === dominio)
  const esCamioneta = vehiculoSel?.tipo === "camioneta"
  const lecturaPrevia = dominio ? (ultimasLecturas[dominio] ?? null) : null
  const errorOdometro =
    odometro && !esCargaAtrasada
      ? validarLectura({
          valor: parseEnteroEsAR(odometro) ?? NaN,
          previa: lecturaPrevia,
          fecha: hoyISO,
          esHorometro: vehiculoSel?.tipo === "autoelevador",
        })
      : null

  const choferFinal = choferManual ? normalizarChofer(chofer, choferes) : chofer
  const puedeEscribirChofer = puedeTextoLibre || esCamioneta

  const precioRef = (dominio && precios.porDominio[dominio]) || precios.flota
  const litrosNum = parseNumeroEsAR(litros)
  const costoSugerido =
    precioRef && litrosNum && litrosNum > 0 ? Math.round(precioRef.precioLitro * litrosNum) : null
  const costoNum = parseNumeroEsAR(costo)
  const precioLitroCargado =
    costoNum && litrosNum && litrosNum > 0 ? costoNum / litrosNum : null

  function limpiarParaCargaFaltante(dom: string) {
    setDominio(dom)
    setOdometro("")
    setLitros("")
    setCosto("")
    setTicket("")
    setFecha("")
    setAviso(null)
  }

  async function handleSubmit() {
    if (!dominio || !choferFinal) {
      toast.error("Seleccioná vehículo y chofer")
      return
    }
    if (choferManual && choferFinal.length < 5) {
      toast.error("Escribí el apellido y el nombre del chofer")
      return
    }
    if (!fecha) {
      toast.error("Elegí la fecha de la carga")
      return
    }
    if (fecha > hoyISO) {
      toast.error("La fecha no puede ser futura")
      return
    }
    if (fecha < restarDias(hoyISO, DIAS_ATRAS_MAX)) {
      toast.error(`Una carga atrasada se puede registrar hasta ${DIAS_ATRAS_MAX} días para atrás`)
      return
    }
    if (!odometro || !litros) {
      toast.error("Completá odómetro y litros")
      return
    }
    const errorLitros = validarLitros(parseNumeroEsAR(litros) ?? NaN)
    if (errorLitros) {
      toast.error(errorLitros)
      return
    }
    if (errorOdometro) {
      toast.error(errorOdometro)
      return
    }
    if (costo && (costoNum == null || costoNum <= 0)) {
      toast.error("El costo del ticket tiene que ser un número mayor a 0")
      return
    }
    if (lugar === LUGAR_OTRO && lugarOtro.trim().length < 3) {
      toast.error("Escribí dónde cargaste")
      return
    }

    setSaving(true)

    const result = await createRegistroCombustible({
      fecha,
      dominio,
      chofer: choferFinal,
      odometro: parseEnteroEsAR(odometro) ?? 0,
      litros: parseNumeroEsAR(litros) ?? 0,
      proveedor: lugar === LUGAR_OTRO ? lugarOtro.trim() : lugar,
      numero_remito: ticket.trim() || undefined,
      costo_total: costoNum && costoNum > 0 ? costoNum : undefined,
    })

    if ("error" in result) {
      toast.error(result.error)
      setSaving(false)
      return
    }

    toast.success(
      esCargaAtrasada
        ? `Carga del ${fecha.split("-").reverse().join("/")} registrada`
        : "Carga de combustible registrada",
    )
    if (result.recalculoSiguiente) {
      toast.info("Se recalculó el rendimiento de la carga siguiente con este tramo")
    } else if (result.data.rendimiento != null) {
      toast.info(`Rendimiento: ${result.data.rendimiento} km/l (${result.data.km_recorridos} km recorridos)`)
    } else {
      toast.info("Primera carga para este vehículo — el rendimiento se calculará en la próxima")
    }

    // Tramo imposible: casi siempre faltó anotar una carga anterior. Se queda
    // en la pantalla para que el chofer la registre ahora, que se acuerda.
    if (result.cargaFaltante) {
      setAviso(result.cargaFaltante)
      setAvisoDominio(dominio)
      setSaving(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Redirige al home del empleado. NO re-habilitamos el botón (no llamamos a
    // setSaving(false)): el form se desmonta al navegar, así el chofer no puede
    // reenviar mientras la otra pantalla carga. Era la causa de las cargas
    // duplicadas. replace en vez de push: con "atrás" no vuelve al form enviado.
    router.replace(volverA)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Registro de Combustible
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Registrá la carga en el momento, con el odómetro del tablero y el ticket: así
          se calcula el rendimiento del camión y el tuyo.
        </p>
      </div>

      {aviso && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm text-amber-900">
              <p className="font-semibold">
                La carga se guardó, pero el tramo da {aviso.rendimiento} km/l
                {aviso.mediana > 0 && <> y lo habitual del {avisoDominio} es {aviso.mediana}</>}.
              </p>
              <p>
                Casi seguro quedó una carga anterior sin registrar. Si te acordás de esa carga,
                registrala ahora con su fecha, su odómetro y sus litros: el rendimiento se recalcula
                solo.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => limpiarParaCargaFaltante(avisoDominio)}
                >
                  Registrar la carga que faltó
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => router.replace(volverA)}
                >
                  No me acuerdo, volver
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  if (!esCamionetaNueva && choferManual && !puedeTextoLibre) {
                    setChoferManual(false)
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
                {puedeEscribirChofer && (
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
                )}
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
              ) : esCargaAtrasada ? (
                <p className="text-xs text-amber-700">
                  Carga de otro día: poné el odómetro que tenía el camión ese día (va a ser menor
                  que el actual).
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

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-base font-semibold text-slate-800">Fecha de la carga</Label>
              <Input
                type="date"
                value={fecha}
                max={hoyISO}
                min={restarDias(hoyISO, DIAS_ATRAS_MAX)}
                onChange={(e) => setFecha(e.target.value)}
                className={`h-14 text-lg font-semibold text-slate-900 focus-visible:ring-2 ${
                  esCargaAtrasada
                    ? "border-amber-400 focus-visible:border-amber-500 focus-visible:ring-amber-200"
                    : "focus-visible:border-blue-400 focus-visible:ring-blue-200"
                }`}
              />
              <p className="text-xs text-slate-500">
                {esCargaAtrasada
                  ? "Estás registrando una carga atrasada. La regla es cargar en el momento."
                  : "Hoy. Cambiala sólo si estás registrando una carga que faltó."}
              </p>
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

      {/* Datos del ticket (SOP de Combustible: cada carga con lugar y costo).
          Van aparte y más chicos: lo que calcula el rendimiento está arriba. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-800">
            <Receipt className="h-5 w-5 text-slate-500" />
            Datos del ticket
            <span className="text-xs font-normal text-muted-foreground">
              para el costo por km y el cruce con la factura
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Dónde cargaste</Label>
            <Select value={lugar} onValueChange={(v: string | null) => setLugar(v ?? LUGAR_AXION)}>
              <SelectTrigger className="h-11 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LUGAR_AXION}>{LUGAR_AXION}</SelectItem>
                <SelectItem value={LUGAR_OTRO}>Otra estación (en ruta)</SelectItem>
              </SelectContent>
            </Select>
            {lugar === LUGAR_OTRO && (
              <Input
                placeholder="Estación y localidad"
                value={lugarOtro}
                onChange={(e) => setLugarOtro(e.target.value)}
                className="h-11 text-sm"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Costo total del ticket ($)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder={costoSugerido ? `≈ ${costoSugerido}` : "Opcional"}
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              className="h-11 text-sm"
            />
            <p className="text-xs text-slate-500">
              {precioLitroCargado
                ? `${money(precioLitroCargado)} por litro`
                : precioRef
                  ? `Último precio: ${money(precioRef.precioLitro)}/l (${precioRef.fecha.split("-").reverse().join("/")})`
                  : "Todavía no hay cargas con costo"}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">N.º de ticket</Label>
            <Input
              placeholder="Opcional"
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              autoComplete="off"
              className="h-11 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button
          onClick={handleSubmit}
          disabled={saving || !dominio || !choferFinal || !odometro || !litros || !fecha || !!errorOdometro}
          className="h-14 w-full bg-blue-600 text-base font-semibold text-white shadow-md transition-colors hover:bg-blue-700 sm:w-auto sm:min-w-[260px] sm:text-lg sm:ml-auto sm:flex disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Gauge className="mr-2 h-5 w-5" />
          )}
          {saving ? "Registrando..." : esCargaAtrasada ? "Registrar carga atrasada" : "Registrar Carga"}
        </Button>
      </div>
    </div>
  )
}
