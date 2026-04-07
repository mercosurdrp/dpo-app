"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  Truck,
  Warehouse,
  CarFront,
  Users,
  CalendarClock,
  Zap,
  Save,
  Loader2,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { getDpoKpis, saveDpoKpisManual, getDpoKpiDrilldown } from "@/actions/dpo-kpis"
import type { DpoKpisData, DpoKpiValue, DrilldownData } from "@/actions/dpo-kpis"

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

// Auto-calculated KPI numbers
const AUTO_KPIS = new Set([9, 16, 17, 18, 21, 22, 23, 24, 25, 26, 35, 36])

// All 56 KPIs definition
const KPI_DEFINITIONS: { pilar: string; numero: number; nombre: string; um: string }[] = [
  { pilar: "Seguridad", numero: 1, nombre: "Accidentes con Fatalidad Propia o de terceros", um: "#" },
  { pilar: "Seguridad", numero: 2, nombre: "Accidentes con Lesion muy Grave (LTI)", um: "#" },
  { pilar: "Seguridad", numero: 3, nombre: "Accidentes con Lesion Grave (MDI)", um: "#" },
  { pilar: "Seguridad", numero: 4, nombre: "Accidentes con Lesion Moderada (MTI)", um: "#" },
  { pilar: "Seguridad", numero: 5, nombre: "Accidentes con Lesion Leve (FAI)", um: "#" },
  { pilar: "Almacen", numero: 6, nombre: "HL Perdidos derivado de las diferencias de inventario", um: "hl" },
  { pilar: "Almacen", numero: 7, nombre: "Numero de Horas Trabajadas de Autoelevador", um: "h" },
  { pilar: "Almacen", numero: 8, nombre: "HL Rotura Total del Almacen", um: "hl" },
  { pilar: "Entrega", numero: 9, nombre: "HL Rotura Total de la Entrega", um: "hl" },
  { pilar: "Gente", numero: 10, nombre: "Numero de salidas involuntarias en el anio", um: "#" },
  { pilar: "Gente", numero: 11, nombre: "Numero de salidas voluntarias en el anio", um: "#" },
  { pilar: "Gente", numero: 12, nombre: "Promedio Acumulado del anio Headcount", um: "#" },
  { pilar: "Gente", numero: 13, nombre: "Numero de dias de empleados con ausentismo en el mes", um: "#" },
  { pilar: "Gente", numero: 14, nombre: "Numero total de empleados operativos", um: "#" },
  { pilar: "Gente", numero: 15, nombre: "Dias trabajados en el mes", um: "d" },
  { pilar: "Entrega", numero: 16, nombre: "Cantidad de Viajes en el mes", um: "#" },
  { pilar: "Flota", numero: 17, nombre: "Cantidad de Camiones Totales de Distribucion (T2) en Flota", um: "#" },
  { pilar: "Entrega", numero: 18, nombre: "Numero de cajas equivalentes entregados en el mes", um: "pck" },
  { pilar: "Entrega", numero: 19, nombre: "Tiempo en Ruta por FTE", um: "h" },
  { pilar: "Almacen", numero: 20, nombre: "Horas totales de trabajo y soporte en Almacen", um: "#" },
  { pilar: "Entrega", numero: 21, nombre: "Volumen Ordenado por el PDV", um: "hl" },
  { pilar: "Entrega", numero: 22, nombre: "Volumen de Fuera de Stock Real", um: "hl" },
  { pilar: "Entrega", numero: 23, nombre: "Volumen Cancelado y/o Reprogramado (Comercial/Financiero)", um: "hl" },
  { pilar: "Entrega", numero: 24, nombre: "Volumen Cancelado y/o Reprogramado (logistico)", um: "hl" },
  { pilar: "Entrega", numero: 25, nombre: "Volumen Rechazado", um: "hl" },
  { pilar: "Entrega", numero: 26, nombre: "Volumen total entregado (al PDV)", um: "hl" },
  { pilar: "Almacen", numero: 27, nombre: "Volumen Total Cargado en los Camiones", um: "hl" },
  { pilar: "Almacen", numero: 28, nombre: "Volumen Total Despachado por almacen en concepto de venta", um: "hl" },
  { pilar: "Entrega", numero: 29, nombre: "BEES RMD", um: "#" },
  { pilar: "Gente", numero: 30, nombre: "Cantidad Operarios en Almacen", um: "#" },
  { pilar: "Gente", numero: 31, nombre: "Cantidad Operarios Distribucion (choferes + ayudantes)", um: "#" },
  { pilar: "Gente", numero: 32, nombre: "Cantidad Administrativos Logistica", um: "#" },
  { pilar: "Planificacion", numero: 33, nombre: "Costo Mensual de Sector Distribucion", um: "$" },
  { pilar: "Planificacion", numero: 34, nombre: "Costo Mensual de Sector Almacen", um: "$" },
  { pilar: "Entrega", numero: 35, nombre: "FTE de Entrega Promedio del Mes", um: "#" },
  { pilar: "Entrega", numero: 36, nombre: "Cantidad de Segundas vueltas realizadas en el mes", um: "#" },
  { pilar: "Almacen", numero: 37, nombre: "Volumen de Venta Mostrador", um: "hl" },
  { pilar: "Almacen", numero: 38, nombre: "Cant. Horas de Jornada Pagas para Almacen", um: "#" },
  { pilar: "Almacen", numero: 39, nombre: "Sumatoria Total de Horas Extras en Almacen", um: "#" },
  { pilar: "Almacen", numero: 40, nombre: "Cantidad de Supervisores de Almacen", um: "#" },
  { pilar: "Almacen", numero: 41, nombre: "Sumatoria de Horas de Temporales en Almacen", um: "#" },
  { pilar: "Almacen", numero: 42, nombre: "Sumatoria de Horas de Temporales en Distribucion", um: "#" },
  { pilar: "Almacen", numero: 43, nombre: "Bultos pickeados", um: "bultos" },
  { pilar: "Almacen", numero: 44, nombre: "Horas de Picking Totales", um: "h" },
  { pilar: "Almacen", numero: 45, nombre: "HL Perdidos debido a obsolescencia", um: "hl" },
  { pilar: "Almacen", numero: 46, nombre: "Metros totales de Almacen (mt2)", um: "mt2" },
  { pilar: "Almacen", numero: 47, nombre: "Metros aptos para almacenar (mt2)", um: "mt2" },
  { pilar: "Almacen", numero: 48, nombre: "Cantidad de posiciones pisos (PP)", um: "PP" },
  { pilar: "Almacen", numero: 49, nombre: "Metros totales del predio (mt2)", um: "mt2" },
  { pilar: "Almacen", numero: 50, nombre: "Apilabilidad promedio en pallets", um: "pallet" },
  { pilar: "Almacen", numero: 51, nombre: "Capacidad de almacenamiento en pallet", um: "pallet" },
  { pilar: "Almacen", numero: 52, nombre: "Capacidad en racks en pallet", um: "pallet" },
  { pilar: "Almacen", numero: 53, nombre: "HL Perdidos/derramados por Rotura (Almacen + Entrega)", um: "hl" },
  { pilar: "Flota", numero: 54, nombre: "Cantidad Total de Autoelevadores", um: "#" },
  { pilar: "Flota", numero: 55, nombre: "Cantidad de camiones Acarreo/Abastecimiento (T1)", um: "#" },
  { pilar: "Gente", numero: 56, nombre: "Cantidad Operarios Acarreo/Abastecimiento (T1)", um: "#" },
]

// Pilares order and styling
const PILARES_CONFIG: {
  nombre: string
  color: string
  bgLight: string
  bgHeader: string
  textColor: string
  borderColor: string
  icon: React.ReactNode
}[] = [
  {
    nombre: "Seguridad",
    color: "#EF4444",
    bgLight: "bg-red-50",
    bgHeader: "bg-red-600",
    textColor: "text-red-700",
    borderColor: "border-red-200",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    nombre: "Entrega",
    color: "#3B82F6",
    bgLight: "bg-blue-50",
    bgHeader: "bg-blue-600",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    icon: <Truck className="h-5 w-5" />,
  },
  {
    nombre: "Almacen",
    color: "#F59E0B",
    bgLight: "bg-amber-50",
    bgHeader: "bg-amber-600",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    icon: <Warehouse className="h-5 w-5" />,
  },
  {
    nombre: "Flota",
    color: "#8B5CF6",
    bgLight: "bg-purple-50",
    bgHeader: "bg-purple-600",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    icon: <CarFront className="h-5 w-5" />,
  },
  {
    nombre: "Gente",
    color: "#22C55E",
    bgLight: "bg-green-50",
    bgHeader: "bg-green-600",
    textColor: "text-green-700",
    borderColor: "border-green-200",
    icon: <Users className="h-5 w-5" />,
  },
  {
    nombre: "Planificacion",
    color: "#64748B",
    bgLight: "bg-slate-50",
    bgHeader: "bg-slate-600",
    textColor: "text-slate-700",
    borderColor: "border-slate-200",
    icon: <CalendarClock className="h-5 w-5" />,
  },
]

// Group KPIs by pilar in defined order
function getKpisByPilar() {
  const grouped: Record<string, typeof KPI_DEFINITIONS> = {}
  for (const pilar of PILARES_CONFIG) {
    grouped[pilar.nombre] = KPI_DEFINITIONS.filter((k) => k.pilar === pilar.nombre)
  }
  return grouped
}

interface Props {
  initialData: DpoKpisData
  mesActual: number
  anioActual: number
}

export function TableroDpoClient({ initialData, mesActual, anioActual }: Props) {
  const [mes, setMes] = useState(initialData.mes)
  const [anio, setAnio] = useState(initialData.anio)
  const [valores, setValores] = useState<DpoKpiValue[]>(initialData.valores)
  const [manualEdits, setManualEdits] = useState<Record<number, string>>({})
  const [isPending, startTransition] = useTransition()
  const [isSaving, setIsSaving] = useState(false)
  const [drilldown, setDrilldown] = useState<DrilldownData | null>(null)
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const kpisByPilar = getKpisByPilar()

  // Build a map of numero -> value from server data
  const valoresMap = new Map<number, DpoKpiValue>()
  for (const v of valores) {
    valoresMap.set(v.numero, v)
  }

  function cambiarMes(delta: number) {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes < 1) {
      nuevoMes = 12
      nuevoAnio--
    } else if (nuevoMes > 12) {
      nuevoMes = 1
      nuevoAnio++
    }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
    setManualEdits({})
    startTransition(async () => {
      const res = await getDpoKpis(nuevoMes, nuevoAnio)
      if ("data" in res) {
        setValores(res.data.valores)
      }
    })
  }

  function handleManualChange(numero: number, value: string) {
    setManualEdits((prev) => ({ ...prev, [numero]: value }))
  }

  function getDisplayValue(numero: number): number | null {
    // Check manual edits first
    if (numero in manualEdits) {
      const parsed = parseFloat(manualEdits[numero])
      return isNaN(parsed) ? null : parsed
    }
    // Then server data
    const sv = valoresMap.get(numero)
    return sv?.valor ?? null
  }

  function getInputValue(numero: number): string {
    if (numero in manualEdits) {
      return manualEdits[numero]
    }
    const sv = valoresMap.get(numero)
    if (sv?.valor != null) return String(sv.valor)
    return ""
  }

  async function handleGuardar() {
    setIsSaving(true)
    try {
      // Collect all manual KPI values (non-auto)
      const manualValues: { numero: number; valor: number }[] = []

      for (const kpi of KPI_DEFINITIONS) {
        if (AUTO_KPIS.has(kpi.numero)) continue

        // Check edited value first, then existing server value
        if (kpi.numero in manualEdits) {
          const parsed = parseFloat(manualEdits[kpi.numero])
          if (!isNaN(parsed)) {
            manualValues.push({ numero: kpi.numero, valor: parsed })
          }
        } else {
          const sv = valoresMap.get(kpi.numero)
          if (sv?.valor != null) {
            manualValues.push({ numero: kpi.numero, valor: sv.valor })
          }
        }
      }

      if (manualValues.length === 0) {
        toast.info("No hay valores manuales para guardar.")
        setIsSaving(false)
        return
      }

      const result = await saveDpoKpisManual(mes, anio, manualValues)

      if ("error" in result) {
        toast.error(`Error al guardar: ${result.error}`)
      } else {
        toast.success(`${manualValues.length} KPIs guardados correctamente.`)
        setManualEdits({})
        // Refresh data
        const res = await getDpoKpis(mes, anio)
        if ("data" in res) {
          setValores(res.data.valores)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDrilldown(numero: number) {
    if (!AUTO_KPIS.has(numero)) return
    const val = getDisplayValue(numero)
    if (val == null) return
    setDrilldownLoading(true)
    setDrilldownOpen(true)
    setDrilldown(null)
    try {
      const res = await getDpoKpiDrilldown(mes, anio, numero)
      if ("data" in res) {
        setDrilldown(res.data)
      } else {
        toast.error(res.error)
        setDrilldownOpen(false)
      }
    } catch {
      toast.error("Error cargando detalle")
      setDrilldownOpen(false)
    } finally {
      setDrilldownLoading(false)
    }
  }

  // Compute completion per pilar
  function getPilarCompletion(pilarNombre: string) {
    const kpis = kpisByPilar[pilarNombre] ?? []
    const total = kpis.length
    let filled = 0
    for (const kpi of kpis) {
      const val = getDisplayValue(kpi.numero)
      if (val != null) filled++
    }
    return { filled, total, pct: total > 0 ? Math.round((filled / total) * 100) : 0 }
  }

  function formatValue(val: number | null, um: string): string {
    if (val == null) return "--"
    if (um === "$") return `$${val.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    if (um === "hl" || um === "h" || um === "mt2" || um === "pallet" || um === "pck" || um === "bultos") {
      return val.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    }
    return String(val)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">TABLERO DPO</h1>
          <p className="text-sm text-muted-foreground">
            56 KPIs organizados por pilar — Carga manual + automatica desde Chess
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => cambiarMes(-1)} disabled={isPending}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {isPending ? "Cargando..." : `${MESES[mes]} ${anio}`}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => cambiarMes(1)}
            disabled={isPending || (mes === mesActual && anio === anioActual)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards per pilar */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {PILARES_CONFIG.map((pilar) => {
          const { filled, total, pct } = getPilarCompletion(pilar.nombre)
          return (
            <Card key={pilar.nombre} className={`${pilar.borderColor} border`}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="rounded-lg p-1.5"
                    style={{ backgroundColor: `${pilar.color}18`, color: pilar.color }}
                  >
                    {pilar.icon}
                  </div>
                  <span className="text-xs font-semibold text-slate-700 truncate">
                    {pilar.nombre}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold" style={{ color: pilar.color }}>
                    {pct}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {filled}/{total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: pilar.color }}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* KPI Tables grouped by pilar */}
      <div className="space-y-4">
        {PILARES_CONFIG.map((pilar) => {
          const kpis = kpisByPilar[pilar.nombre]
          if (!kpis || kpis.length === 0) return null

          return (
            <Card key={pilar.nombre} className={`${pilar.borderColor} border overflow-hidden`}>
              <div className={`${pilar.bgHeader} px-4 py-2.5 flex items-center gap-2`}>
                <span className="text-white">{pilar.icon}</span>
                <span className="text-sm font-semibold text-white">
                  {pilar.nombre}
                </span>
                <Badge className="ml-auto bg-white/20 text-white hover:bg-white/30 text-xs">
                  {kpis.length} KPIs
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className={pilar.bgLight}>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-16 text-center">UM</TableHead>
                      <TableHead className="w-40">Valor</TableHead>
                      <TableHead className="w-20 text-center">Fuente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis.map((kpi) => {
                      const isAuto = AUTO_KPIS.has(kpi.numero)
                      const displayVal = getDisplayValue(kpi.numero)
                      const hasValue = displayVal != null

                      return (
                        <TableRow
                          key={kpi.numero}
                          className={isAuto ? pilar.bgLight : undefined}
                        >
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {kpi.numero}
                          </TableCell>
                          <TableCell className="text-sm">{kpi.nombre}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs text-muted-foreground font-mono">
                              {kpi.um}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isAuto ? (
                              <button
                                type="button"
                                onClick={() => handleDrilldown(kpi.numero)}
                                disabled={!hasValue}
                                className={`text-sm font-mono font-medium inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                                  hasValue
                                    ? "text-blue-700 hover:bg-blue-50 hover:underline cursor-pointer"
                                    : "text-muted-foreground cursor-default"
                                }`}
                              >
                                {formatValue(displayVal, kpi.um)}
                                {hasValue && <Search className="h-3 w-3 opacity-40" />}
                              </button>
                            ) : (
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="--"
                                value={getInputValue(kpi.numero)}
                                onChange={(e) =>
                                  handleManualChange(kpi.numero, e.target.value)
                                }
                                className="h-7 w-32 text-sm font-mono"
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isAuto ? (
                              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs gap-1">
                                <Zap className="h-3 w-3" />
                                Auto
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs text-muted-foreground"
                              >
                                Manual
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Save button */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          onClick={handleGuardar}
          disabled={isSaving || isPending}
          size="lg"
          className="shadow-lg gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Guardar
            </>
          )}
        </Button>
      </div>

      {/* Drilldown Modal */}
      <Dialog open={drilldownOpen} onOpenChange={setDrilldownOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{drilldown?.titulo ?? "Cargando..."}</DialogTitle>
            <DialogDescription>
              {drilldown ? `${drilldown.rows.length} registros — Total: ${drilldown.total}` : ""}
            </DialogDescription>
          </DialogHeader>
          {drilldownLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : drilldown ? (
            <div className="overflow-auto flex-1 -mx-4 px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{drilldown.columnas.label}</TableHead>
                    {drilldown.columnas.detalle && (
                      <TableHead>{drilldown.columnas.detalle}</TableHead>
                    )}
                    {drilldown.columnas.valor && (
                      <TableHead className="text-right">{drilldown.columnas.valor}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drilldown.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-mono">{row.label}</TableCell>
                      {drilldown.columnas.detalle && (
                        <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                          {row.detalle}
                        </TableCell>
                      )}
                      {drilldown.columnas.valor && (
                        <TableCell className="text-right text-sm font-mono">
                          {row.valor}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
