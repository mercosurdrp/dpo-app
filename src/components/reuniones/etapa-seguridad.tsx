"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Shield, ClipboardList, Loader2, ShieldCheck } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getReportes } from "@/actions/reportes-seguridad"
import {
  getSeguridadSemaforo,
  setSeguridadSemaforo,
  type SemaforoEstado,
} from "@/actions/reuniones"
import { IS_MISIONES } from "@/lib/empresa"
import { cn } from "@/lib/utils"
import {
  PiramideSeguridad,
  type PiramideConteos,
} from "@/components/reportes-seguridad/piramide-seguridad"
import { ReporteDetalleDialog } from "@/components/reportes-seguridad/reporte-detalle-dialog"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_TIPO_COLORS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  type ReporteSeguridadConAutor,
  type UserRole,
} from "@/types/database"

const MESES = [
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

function ultimoDiaHabilAnterior(fechaReunionIso: string): string {
  const [y, m, d] = fechaReunionIso.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() - 1)
  }
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, "0")
  const dd = String(dt.getDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function fechaArDeTimestamp(timestamptz: string): string {
  const ar = new Date(timestamptz).toLocaleString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
  return ar.slice(0, 10)
}

function formatFechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}

function hoyArgentina(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

const SEMAFORO_LUCES: {
  estado: SemaforoEstado
  label: string
  on: string
}[] = [
  { estado: "rojo", label: "Rojo", on: "bg-red-500" },
  { estado: "amarillo", label: "Amarillo", on: "bg-amber-400" },
  { estado: "verde", label: "Verde", on: "bg-emerald-500" },
]

function SemaforoDelDia({
  estado,
  fecha,
  esHoy,
  puedeEditar,
  guardando,
  onElegir,
}: {
  estado: SemaforoEstado | null
  fecha: string
  /** El semáforo se reinicia a las 00:00: días pasados se ven apagados. */
  esHoy: boolean
  puedeEditar: boolean
  guardando: boolean
  onElegir: (estado: SemaforoEstado) => void
}) {
  const editable = puedeEditar && esHoy && !guardando
  const estadoVisible = esHoy ? estado : null
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 self-center rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-700">Estado del día</p>
      <div className="flex flex-col items-center gap-2.5 rounded-md bg-slate-800 px-2.5 py-3">
        {SEMAFORO_LUCES.map((luz) => {
          const activo = estadoVisible === luz.estado
          return (
            <button
              key={luz.estado}
              type="button"
              disabled={!editable}
              onClick={() => onElegir(luz.estado)}
              title={activo ? `${luz.label} (click para apagar)` : luz.label}
              aria-label={luz.label}
              aria-pressed={activo}
              className={cn(
                "size-7 rounded-full transition",
                activo
                  ? `${luz.on} shadow ring-2 ring-white`
                  : "bg-slate-600/50",
                editable ? "cursor-pointer hover:opacity-90" : "cursor-default",
              )}
            />
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatFechaCorta(fecha)}
      </p>
      {!esHoy ? (
        <p className="max-w-[110px] text-center text-[10px] text-muted-foreground">
          Se reinicia cada día a las 00:00
        </p>
      ) : !puedeEditar ? (
        <p className="text-[10px] text-muted-foreground">Solo lectura</p>
      ) : null}
    </div>
  )
}

export function EtapaSeguridad({
  fechaReunion,
  reunionId,
  puedeEditar = false,
  currentProfileId,
  currentRole,
}: {
  fechaReunion: string
  /** Si se pasa, muestra el semáforo del día junto a la pirámide (solo Misiones). */
  reunionId?: string
  puedeEditar?: boolean
  /** Profile actual; si se pasa junto con `currentRole`, las cards abren el detalle del reporte. */
  currentProfileId?: string | null
  currentRole?: UserRole
}) {
  const [reportes, setReportes] = useState<ReporteSeguridadConAutor[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [cargando, setCargando] = useState(true)
  const [reporteAbiertoId, setReporteAbiertoId] = useState<string | null>(null)

  const cardsClickables = !!currentProfileId && !!currentRole

  const anioReunion = Number(fechaReunion.slice(0, 4)) || new Date().getFullYear()
  const [piramideAnio, setPiramideAnio] = useState<number>(anioReunion)
  const [piramideMes, setPiramideMes] = useState<number | "all">("all")

  // Semáforo de seguridad del día (solo Misiones). Se reinicia a las 00:00:
  // solo la reunión de HOY muestra/edita color; días pasados se ven apagados.
  const muestraSemaforo = IS_MISIONES && !!reunionId
  const esHoy = fechaReunion === hoyArgentina()
  const [semaforo, setSemaforo] = useState<SemaforoEstado | null>(null)
  const [guardandoSemaforo, setGuardandoSemaforo] = useState(false)

  useEffect(() => {
    if (!muestraSemaforo || !reunionId) return
    getSeguridadSemaforo(reunionId).then((r) => {
      if ("data" in r) setSemaforo(r.data.estado)
    })
  }, [muestraSemaforo, reunionId])

  function elegirSemaforo(estado: SemaforoEstado) {
    if (!reunionId || !puedeEditar || guardandoSemaforo) return
    const previo = semaforo
    const nuevo = previo === estado ? null : estado // re-click apaga
    setSemaforo(nuevo) // optimista
    setGuardandoSemaforo(true)
    setSeguridadSemaforo(reunionId, nuevo).then((r) => {
      setGuardandoSemaforo(false)
      if ("error" in r) {
        setSemaforo(previo) // revertir
        setErrorMsg(r.error)
      }
    })
  }

  useEffect(() => {
    setCargando(true)
    startTransition(async () => {
      const result = await getReportes()
      if ("error" in result) {
        setErrorMsg(result.error)
      } else {
        setReportes(result.data)
      }
      setCargando(false)
    })
  }, [])

  const aniosDisponibles = useMemo(() => {
    const set = new Set<number>([anioReunion])
    for (const r of reportes) {
      const y = Number(r.fecha.slice(0, 4))
      if (Number.isFinite(y)) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [reportes, anioReunion])

  const piramideConteos = useMemo<PiramideConteos>(() => {
    const base: PiramideConteos = {
      fat: 0,
      lti: 0,
      mdi: 0,
      mti: 0,
      fai: 0,
      sio: 0,
      sho: 0,
    }
    for (const r of reportes) {
      if (!r.tipo_accidente) continue
      const y = Number(r.fecha.slice(0, 4))
      const m = Number(r.fecha.slice(5, 7))
      if (y !== piramideAnio) continue
      if (piramideMes !== "all" && m !== piramideMes) continue
      base[r.tipo_accidente] += 1
    }
    return base
  }, [reportes, piramideAnio, piramideMes])

  const periodoLabel =
    piramideMes === "all"
      ? `año ${piramideAnio}`
      : `${MESES[piramideMes - 1]} ${piramideAnio}`

  // Días sin accidente: último reporte tipo=accidente (global) → hoy, en UTC.
  const { diasSinAccidente, ultimoAccidente } = useMemo(() => {
    let max: string | null = null
    for (const r of reportes) {
      if (r.tipo !== "accidente") continue
      if (max === null || r.fecha > max) max = r.fecha
    }
    if (!max) return { diasSinAccidente: null as number | null, ultimoAccidente: null as string | null }
    const [y, m, d] = max.split("-").map(Number)
    if (!y || !m || !d) return { diasSinAccidente: null, ultimoAccidente: null }
    const lastUTC = Date.UTC(y, m - 1, d)
    const now = new Date()
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const dias = Math.max(0, Math.floor((todayUTC - lastUTC) / 86_400_000))
    return { diasSinAccidente: dias, ultimoAccidente: max }
  }, [reportes])

  const fechaUltimoHabil = useMemo(
    () => ultimoDiaHabilAnterior(fechaReunion),
    [fechaReunion],
  )

  const reportesUltimoHabil = useMemo(() => {
    return reportes
      .filter((r) => fechaArDeTimestamp(r.created_at) === fechaUltimoHabil)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [reportes, fechaUltimoHabil])

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-red-900">
            <Shield className="size-5 text-red-600" />
            Etapa 1 — Seguridad
          </CardTitle>
          {!cargando && (
            <div
              className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2 shadow-sm"
              style={{ borderLeft: "4px solid #16a34a" }}
            >
              <ShieldCheck className="size-7 text-green-600" />
              <div className="leading-tight">
                {diasSinAccidente === null ? (
                  <>
                    <p className="text-lg font-bold text-slate-900">Sin accidentes</p>
                    <p className="text-[11px] text-muted-foreground">registrados</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-slate-900">
                      {diasSinAccidente}{" "}
                      <span className="text-sm font-medium text-muted-foreground">
                        {diasSinAccidente === 1 ? "día" : "días"}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      sin accidentes · último {formatFechaCorta(ultimoAccidente!)}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {errorMsg && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Error cargando reportes: {errorMsg}
          </p>
        )}

        {/* Pirámide acumulada */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Pirámide de seguridad
              </h3>
              <p className="text-xs text-muted-foreground">
                Acumulado {periodoLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs">Año</Label>
                <Select
                  value={String(piramideAnio)}
                  onValueChange={(v) => setPiramideAnio(Number(v))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {aniosDisponibles.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Mes</Label>
                <Select
                  value={piramideMes === "all" ? "all" : String(piramideMes)}
                  onValueChange={(v) =>
                    setPiramideMes(v === "all" ? "all" : Number(v))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo el año</SelectItem>
                    {MESES.map((nombre, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {cargando ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Cargando datos…
            </div>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <PiramideSeguridad conteos={piramideConteos} />
              </div>
              {muestraSemaforo && (
                <SemaforoDelDia
                  estado={semaforo}
                  fecha={fechaReunion}
                  esHoy={esHoy}
                  puedeEditar={puedeEditar}
                  guardando={guardandoSemaforo}
                  onElegir={elegirSemaforo}
                />
              )}
            </div>
          )}
        </section>

        {/* Reportes cargados el último día hábil */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ClipboardList className="size-4 text-slate-600" />
              Reportes cargados el {formatFechaCorta(fechaUltimoHabil)}
            </h3>
            {!cargando && (
              <span className="text-xs text-muted-foreground">
                {reportesUltimoHabil.length}{" "}
                {reportesUltimoHabil.length === 1 ? "reporte" : "reportes"}
              </span>
            )}
          </div>
          {cargando ? null : reportesUltimoHabil.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-muted-foreground">
              Sin reportes nuevos el último día hábil.
            </p>
          ) : (
            <ul className="space-y-2">
              {reportesUltimoHabil.map((r) => (
                <li
                  key={r.id}
                  className={
                    "rounded-md border border-slate-200 bg-white p-3 transition-colors" +
                    (cardsClickables
                      ? " cursor-pointer hover:border-red-300 hover:bg-red-50/40"
                      : "")
                  }
                  onClick={
                    cardsClickables
                      ? () => setReporteAbiertoId(r.id)
                      : undefined
                  }
                  onKeyDown={
                    cardsClickables
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setReporteAbiertoId(r.id)
                          }
                        }
                      : undefined
                  }
                  role={cardsClickables ? "button" : undefined}
                  tabIndex={cardsClickables ? 0 : undefined}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="border-0"
                      style={{
                        backgroundColor:
                          REPORTE_SEGURIDAD_TIPO_COLORS[r.tipo] + "20",
                        color: REPORTE_SEGURIDAD_TIPO_COLORS[r.tipo],
                      }}
                    >
                      {REPORTE_SEGURIDAD_TIPO_LABELS[r.tipo]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Evento: {formatFechaCorta(r.fecha)}
                      {r.hora ? ` · ${r.hora.slice(0, 5)}` : ""}
                    </span>
                    {r.localidad && (
                      <span className="text-xs text-muted-foreground">
                        ·{" "}
                        {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[r.localidad] ??
                          r.localidad}
                      </span>
                    )}
                    {r.autor_nombre && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        por {r.autor_nombre}
                      </span>
                    )}
                  </div>
                  {r.descripcion && (
                    <p className="mt-1.5 text-sm text-slate-700">
                      {r.descripcion}
                    </p>
                  )}
                  {r.accion_tomada && (
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Acción:</span>{" "}
                      {r.accion_tomada}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>

      {/* Detalle del reporte (cards clickables) */}
      {cardsClickables && reporteAbiertoId && (
        <ReporteDetalleDialog
          key={reporteAbiertoId}
          reporteId={reporteAbiertoId}
          open={true}
          onOpenChange={(v) => {
            if (!v) setReporteAbiertoId(null)
          }}
          currentProfileId={currentProfileId!}
          currentRole={currentRole!}
        />
      )}
    </Card>
  )
}
