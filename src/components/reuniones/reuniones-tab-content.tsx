"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Calendar,
  Loader2,
  Plus,
  Settings,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getResumenSemanal,
  getTipoConfig,
  listReunionesByTipo,
  listResponsablesPosibles,
  puedeEditarReuniones,
} from "@/actions/reuniones"
import { NuevaReunionDialog } from "./nueva-reunion-dialog"
import { ParticipantesFijosDialog } from "./participantes-fijos-dialog"
import type {
  ReunionConResumen,
  ReunionTipoConfig,
  TipoReunion,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  tipo: TipoReunion
  tipoLabel: string
}

type FiltroModo = "hoy" | "semana_actual" | "semana_iso" | "mes" | "rango"

interface ResumenSemanal {
  fechas: string[]
  indicadores: {
    id: string
    nombre: string
    unidad: string | null
    meta: number | null
    valores: Record<string, number | null>
  }[]
}

const DIA_NOMBRES = [
  "domingo", // 0
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo", // 7 (también domingo en algunas convenciones ISO)
]

function diaSemanaNombre(n: number): string {
  if (n === 7) return "domingo"
  return DIA_NOMBRES[n] ?? String(n)
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatFechaCorta(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
}

function formatHoyLargo(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

// ISO week (lunes = inicio). Devuelve { year, week } correspondientes al año
// ISO (puede no coincidir con el calendario en bordes de fin de año).
function isoSemana(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return { year: date.getUTCFullYear(), week: weekNo }
}

// Convierte (year, week ISO) en { desde, hasta } como ISO date YYYY-MM-DD
// (lunes a domingo de esa semana ISO).
function rangoSemanaIso(year: number, week: number): {
  desde: string
  hasta: string
} {
  // El 4 de enero siempre está en la semana 1 ISO.
  const simple = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = simple.getUTCDay() || 7
  // Lunes de la semana 1
  const isoWeek1Monday = new Date(simple)
  isoWeek1Monday.setUTCDate(simple.getUTCDate() - (dayOfWeek - 1))
  const monday = new Date(isoWeek1Monday)
  monday.setUTCDate(isoWeek1Monday.getUTCDate() + (week - 1) * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return {
    desde: monday.toISOString().slice(0, 10),
    hasta: sunday.toISOString().slice(0, 10),
  }
}

function todayIso(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
}

const MES_NOMBRES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

// Convierte (year, month 1-indexado) en { desde, hasta } como ISO date
// YYYY-MM-DD: primer y último día calendario de ese mes.
function rangoMes(year: number, month: number): {
  desde: string
  hasta: string
} {
  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  // Día 0 del mes siguiente = último día del mes pedido (month es 1-indexado).
  const ultimo = new Date(Date.UTC(year, month, 0))
  return { desde, hasta: ultimo.toISOString().slice(0, 10) }
}

export function ReunionesTabContent({ tipo, tipoLabel }: Props) {
  const router = useRouter()
  const [config, setConfig] = useState<ReunionTipoConfig | null>(null)
  const [reuniones, setReuniones] = useState<ReunionConResumen[]>([])
  const [responsables, setResponsables] = useState<ResponsableOpt[]>([])
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [openNueva, setOpenNueva] = useState(false)
  const [openParticipantes, setOpenParticipantes] = useState(false)

  // Filtros
  const hoyDate = useMemo(() => new Date(), [refreshKey])
  const isoHoy = useMemo(() => isoSemana(hoyDate), [hoyDate])
  const [modo, setModo] = useState<FiltroModo>("hoy")
  const [semanaIsoYear, setSemanaIsoYear] = useState<number>(isoHoy.year)
  const [semanaIsoWeek, setSemanaIsoWeek] = useState<number>(isoHoy.week)
  const [rangoDesde, setRangoDesde] = useState<string>(todayIso())
  const [rangoHasta, setRangoHasta] = useState<string>(todayIso())
  const [mesSelYear, setMesSelYear] = useState<number>(() =>
    new Date().getFullYear(),
  )
  const [mesSelMonth, setMesSelMonth] = useState<number>(() =>
    new Date().getMonth() + 1,
  )

  // Resumen semanal
  const [showResumen, setShowResumen] = useState(false)
  const [resumen, setResumen] = useState<ResumenSemanal | null>(null)
  const [resumenLoading, setResumenLoading] = useState(false)
  const [resumenError, setResumenError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      getTipoConfig(tipo),
      listReunionesByTipo(tipo),
      listResponsablesPosibles(),
      puedeEditarReuniones(),
    ])
      .then(([cRes, rRes, pRes, pe]) => {
        if (cancelled) return
        if ("data" in cRes) setConfig(cRes.data)
        else setLoadError(cRes.error)

        if ("data" in rRes) setReuniones(rRes.data)
        else setLoadError((prev) => prev ?? rRes.error)

        if ("data" in pRes) setResponsables(pRes.data)

        setPuedeEditar(pe)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tipo, refreshKey])

  function refrescar() {
    setRefreshKey((k) => k + 1)
  }

  const diasTexto = useMemo(() => {
    if (!config || !config.dias_semana || config.dias_semana.length === 0) {
      return "—"
    }
    return config.dias_semana
      .slice()
      .sort((a, b) => a - b)
      .map(diaSemanaNombre)
      .join(", ")
  }, [config])

  // Rango efectivo según el modo activo (en YYYY-MM-DD)
  const rangoEfectivo = useMemo<{
    desde: string
    hasta: string
  } | null>(() => {
    if (modo === "hoy") {
      const t = todayIso()
      return { desde: t, hasta: t }
    }
    if (modo === "semana_actual") {
      return rangoSemanaIso(isoHoy.year, isoHoy.week)
    }
    if (modo === "semana_iso") {
      if (
        !Number.isFinite(semanaIsoYear) ||
        !Number.isFinite(semanaIsoWeek) ||
        semanaIsoWeek < 1 ||
        semanaIsoWeek > 53
      ) {
        return null
      }
      return rangoSemanaIso(semanaIsoYear, semanaIsoWeek)
    }
    if (modo === "mes") {
      return rangoMes(mesSelYear, mesSelMonth)
    }
    if (modo === "rango") {
      if (!rangoDesde || !rangoHasta) return null
      if (rangoDesde > rangoHasta) return null
      return { desde: rangoDesde, hasta: rangoHasta }
    }
    return null
  }, [
    modo,
    isoHoy,
    semanaIsoYear,
    semanaIsoWeek,
    mesSelYear,
    mesSelMonth,
    rangoDesde,
    rangoHasta,
  ])

  // Reuniones filtradas localmente
  const reunionesFiltradas = useMemo(() => {
    if (!rangoEfectivo) return [] as ReunionConResumen[]
    const { desde, hasta } = rangoEfectivo
    return reuniones.filter((r) => {
      if (!r.fecha) return false
      return r.fecha >= desde && r.fecha <= hasta
    })
  }, [reuniones, rangoEfectivo])

  // Resumen semanal disponible solo para modos rango/semana
  const resumenDisponible =
    modo === "semana_actual" || modo === "semana_iso" || modo === "rango"

  // Reset del resumen cuando cambia rango o tipo
  useEffect(() => {
    setShowResumen(false)
    setResumen(null)
    setResumenError(null)
  }, [tipo, modo, semanaIsoYear, semanaIsoWeek, rangoDesde, rangoHasta])

  async function handleVerResumen() {
    if (!rangoEfectivo) {
      setResumenError("Rango de fechas inválido.")
      return
    }
    setShowResumen(true)
    setResumenLoading(true)
    setResumenError(null)
    try {
      const res = await getResumenSemanal(
        tipo,
        rangoEfectivo.desde,
        rangoEfectivo.hasta,
      )
      if ("data" in res) {
        setResumen(res.data)
      } else {
        setResumen(null)
        setResumenError(res.error)
      }
    } catch (e) {
      setResumen(null)
      setResumenError(
        e instanceof Error ? e.message : "Error al cargar el resumen.",
      )
    } finally {
      setResumenLoading(false)
    }
  }

  // Mensaje vacío específico para modo "hoy"
  const hoyEsDiaPermitido = useMemo(() => {
    if (!config || !config.dias_semana || config.dias_semana.length === 0) {
      return null
    }
    // getDay() devuelve 0..6 (domingo=0). Nuestra config usa 1..7 (lunes=1, domingo=7).
    const jsDay = hoyDate.getDay()
    const isoDow = jsDay === 0 ? 7 : jsDay
    return config.dias_semana.includes(isoDow)
  }, [config, hoyDate])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{tipoLabel}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Días habilitados: <span className="font-medium">{diasTexto}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            Hoy: {formatHoyLargo(hoyDate)}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenParticipantes(true)}
            >
              <Settings className="mr-2 size-4" />
              Configurar participantes
            </Button>
            <Button type="button" size="sm" onClick={() => setOpenNueva(true)}>
              <Plus className="mr-2 size-4" />
              Nueva reunión
            </Button>
          </div>
        )}
      </div>

      {/* Filtros */}
      {!loading && !loadError && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Período
            </span>
            <Select
              value={modo}
              onValueChange={(v) => setModo(v as FiltroModo)}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="semana_actual">Esta semana</SelectItem>
                <SelectItem value="mes">Mes</SelectItem>
                <SelectItem value="semana_iso">
                  Semana ISO específica
                </SelectItem>
                <SelectItem value="rango">Rango fecha</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {modo === "mes" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Mes
                </span>
                <Select
                  value={String(mesSelMonth)}
                  onValueChange={(v) => setMesSelMonth(Number(v))}
                >
                  <SelectTrigger className="h-9 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MES_NOMBRES.map((nombre, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Año
                </span>
                <Select
                  value={String(mesSelYear)}
                  onValueChange={(v) => setMesSelYear(Number(v))}
                >
                  <SelectTrigger className="h-9 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[isoHoy.year - 2, isoHoy.year - 1, isoHoy.year, isoHoy.year + 1].map(
                      (y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {modo === "semana_iso" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Semana
                </span>
                <Input
                  type="number"
                  min={1}
                  max={53}
                  className="h-9 w-[90px]"
                  value={semanaIsoWeek}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setSemanaIsoWeek(v)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Año
                </span>
                <Select
                  value={String(semanaIsoYear)}
                  onValueChange={(v) => setSemanaIsoYear(Number(v))}
                >
                  <SelectTrigger className="h-9 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[isoHoy.year - 2, isoHoy.year - 1, isoHoy.year, isoHoy.year + 1].map(
                      (y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {modo === "rango" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Desde
                </span>
                <Input
                  type="date"
                  className="h-9 w-[160px]"
                  value={rangoDesde}
                  onChange={(e) => setRangoDesde(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Hasta
                </span>
                <Input
                  type="date"
                  className="h-9 w-[160px]"
                  value={rangoHasta}
                  onChange={(e) => setRangoHasta(e.target.value)}
                />
              </div>
            </>
          )}

          {rangoEfectivo && modo !== "hoy" && (
            <p className="ml-auto text-xs text-muted-foreground">
              {formatFechaCorta(rangoEfectivo.desde)} →{" "}
              {formatFechaCorta(rangoEfectivo.hasta)}
            </p>
          )}
        </div>
      )}

      {/* Loader / Error */}
      {loading && (
        <div className="flex items-center justify-center rounded-lg border bg-white py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Cargando reuniones…
        </div>
      )}

      {loadError && !loading && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      {/* Tabla */}
      {!loading && !loadError && (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Semana</TableHead>
                <TableHead>Asistencia</TableHead>
                <TableHead>Compromisos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reunionesFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {modo === "hoy" ? (
                      <>
                        No hay reunión cargada para hoy.{" "}
                        {hoyEsDiaPermitido === true &&
                          "Debería crearse automáticamente a las 06:00."}
                        {hoyEsDiaPermitido === false &&
                          "Hoy no es día habilitado para esta reunión."}
                      </>
                    ) : (
                      <>Sin reuniones en el período seleccionado.</>
                    )}
                    {puedeEditar && (
                      <>
                        {" "}
                        <button
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() => setOpenNueva(true)}
                        >
                          Crear reunión
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                reunionesFiltradas.map((r) => {
                  const sem = r.fecha
                    ? isoSemana(new Date(r.fecha + "T00:00:00"))
                    : null
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => router.push(`/reuniones/${r.id}`)}
                    >
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5 text-muted-foreground" />
                          <span className="text-sm capitalize">
                            {formatFecha(r.fecha)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {sem ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 text-[11px] font-normal text-slate-600"
                          >
                            S{sem.week}/{String(sem.year).slice(-2)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {r.asistentes_presentes}/{r.total_asistentes}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.total_compromisos === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : r.compromisos_pendientes === 0 ? (
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            {r.total_compromisos} ok
                          </Badge>
                        ) : (
                          <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
                            {r.compromisos_pendientes} pend.
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Resumen semanal */}
      {!loading && !loadError && resumenDisponible && (
        <div className="space-y-3">
          {!showResumen && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleVerResumen}
                disabled={!rangoEfectivo}
              >
                <TrendingUp className="mr-2 size-4" />
                Ver resumen semanal
              </Button>
            </div>
          )}

          {showResumen && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">
                  Resumen del período
                  {rangoEfectivo && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatFechaCorta(rangoEfectivo.desde)} →{" "}
                      {formatFechaCorta(rangoEfectivo.hasta)}
                    </span>
                  )}
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResumen(false)}
                >
                  Cerrar
                </Button>
              </CardHeader>
              <CardContent>
                {resumenLoading && (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Cargando resumen…
                  </div>
                )}

                {!resumenLoading && resumenError && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {resumenError}
                  </p>
                )}

                {!resumenLoading &&
                  !resumenError &&
                  resumen &&
                  (resumen.indicadores.length === 0 ||
                  resumen.fechas.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Sin indicadores cargados en el período.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[180px]">
                              Indicador
                            </TableHead>
                            {resumen.fechas.map((f) => (
                              <TableHead
                                key={f}
                                className="whitespace-nowrap text-right capitalize"
                              >
                                {formatFechaCorta(f)}
                              </TableHead>
                            ))}
                            <TableHead className="text-right">
                              Promedio
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resumen.indicadores.map((ind) => {
                            const valoresNum = resumen.fechas
                              .map((f) => ind.valores[f])
                              .filter(
                                (v): v is number =>
                                  typeof v === "number" && Number.isFinite(v),
                              )
                            const promedio =
                              valoresNum.length === 0
                                ? null
                                : valoresNum.reduce((a, b) => a + b, 0) /
                                  valoresNum.length
                            return (
                              <TableRow key={ind.id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-slate-900">
                                      {ind.nombre}
                                    </span>
                                    {(ind.unidad || ind.meta != null) && (
                                      <span className="text-[11px] text-muted-foreground">
                                        {ind.unidad ?? ""}
                                        {ind.unidad && ind.meta != null
                                          ? " · "
                                          : ""}
                                        {ind.meta != null
                                          ? `meta ${ind.meta}`
                                          : ""}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                {resumen.fechas.map((f) => {
                                  const v = ind.valores[f]
                                  return (
                                    <TableCell
                                      key={f}
                                      className="whitespace-nowrap text-right text-sm tabular-nums"
                                    >
                                      {typeof v === "number" &&
                                      Number.isFinite(v) ? (
                                        v.toLocaleString("es-AR", {
                                          maximumFractionDigits: 2,
                                        })
                                      ) : (
                                        <span className="text-muted-foreground">
                                          —
                                        </span>
                                      )}
                                    </TableCell>
                                  )
                                })}
                                <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                                  {promedio == null ? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  ) : (
                                    promedio.toLocaleString("es-AR", {
                                      maximumFractionDigits: 2,
                                    })
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Diálogos */}
      {puedeEditar && (
        <>
          <NuevaReunionDialog
            open={openNueva}
            onOpenChange={setOpenNueva}
            tipo={tipo}
            tipoLabel={tipoLabel}
            onSaved={refrescar}
          />
          <ParticipantesFijosDialog
            open={openParticipantes}
            onOpenChange={setOpenParticipantes}
            tipo={tipo}
            tipoLabel={tipoLabel}
            responsables={responsables}
            onSaved={refrescar}
          />
        </>
      )}

    </div>
  )
}
