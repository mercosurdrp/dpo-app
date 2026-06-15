"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Shield, ClipboardList, Loader2, ShieldCheck, AlertTriangle } from "lucide-react"
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
import {
  getReportes,
  getSeguridadConfigArea,
  setSeguridadMetaDias,
} from "@/actions/reportes-seguridad"
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
  REPORTE_SEGURIDAD_AREA_LABELS,
  type ReporteSeguridadConAutor,
  type ReporteSeguridadTipoAccidente,
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

// Semáforo dibujado como el del Excel de seguridad: farol oscuro con 3 luces,
// viseras laterales y poste. La luz del estado activo se enciende; las demás
// quedan apagadas (gris). Clickeable cuando es editable.
const SEM_DARK = "#3f3f46"
const SEMAFORO_LUCES: {
  estado: SemaforoEstado
  label: string
  color: string
  cy: number
}[] = [
  { estado: "rojo", label: "Rojo", color: "#ef4444", cy: 44 },
  { estado: "amarillo", label: "Amarillo", color: "#f59e0b", cy: 92 },
  { estado: "verde", label: "Verde", color: "#22c55e", cy: 140 },
]

// Viseras laterales: triángulo rectángulo a cada lado de una luz centrada en
// cy. Base vertical sobre la carcasa + arista superior horizontal (90° con la
// base); la hipotenusa baja hacia afuera.
function visoraIzq(cy: number): string {
  return `M 40 ${cy - 18} L 8 ${cy - 18} L 40 ${cy + 18} Z`
}
function visoraDer(cy: number): string {
  return `M 100 ${cy - 18} L 132 ${cy - 18} L 100 ${cy + 18} Z`
}

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
    <div className="flex shrink-0 flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">Estado del día</p>
      <svg viewBox="0 0 140 290" className="w-[88px]" aria-label="Semáforo del día">
        <defs>
          <filter id="semGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Poste */}
        <rect x="63" y="180" width="14" height="106" rx="3" fill={SEM_DARK} />
        {/* Viseras (detrás de la carcasa) */}
        {SEMAFORO_LUCES.map((l) => (
          <g key={`v-${l.estado}`} fill={SEM_DARK}>
            <path d={visoraIzq(l.cy)} />
            <path d={visoraDer(l.cy)} />
          </g>
        ))}
        {/* Carcasa */}
        <rect x="38" y="6" width="64" height="178" rx="20" fill={SEM_DARK} />
        {/* Luces */}
        {SEMAFORO_LUCES.map((l) => {
          const activo = estadoVisible === l.estado
          return (
            <circle
              key={l.estado}
              cx="70"
              cy={l.cy}
              r="23"
              fill={l.color}
              fillOpacity={activo ? 1 : 0.12}
              stroke={activo ? "#ffffff" : "rgba(255,255,255,0.18)"}
              strokeWidth={activo ? 2 : 1}
              style={activo ? { filter: "url(#semGlow)" } : undefined}
              onClick={editable ? () => onElegir(l.estado) : undefined}
              className={editable ? "cursor-pointer" : "cursor-default"}
            >
              <title>
                {activo ? `${l.label} (click para apagar)` : l.label}
              </title>
            </circle>
          )
        })}
      </svg>
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

// Niveles que cuentan como "accidente" para la ventanita (literal FAI → LTI:
// lesión leve, moderada, grave y muy grave). Excluye muerte (FAT) y sin lesión.
const ULTIMO_ACCIDENTE_NIVELES: ReporteSeguridadTipoAccidente[] = [
  "fai",
  "mti",
  "mdi",
  "lti",
]

const NIVEL_ACCIDENTE_LABELS: Partial<
  Record<ReporteSeguridadTipoAccidente, string>
> = {
  fai: "Lesión Leve",
  mti: "Lesión Moderada",
  mdi: "Lesión Grave",
  lti: "Lesión Muy Grave",
}

function UltimoAccidenteVentana({
  reporte,
}: {
  reporte: ReporteSeguridadConAutor | null
}) {
  return (
    <div className="flex w-[190px] shrink-0 flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50/90 p-3 shadow-sm">
      <p className="flex items-center gap-1 text-xs font-semibold text-amber-900">
        <AlertTriangle className="size-3.5" />
        Último accidente
      </p>
      {reporte ? (
        <>
          <p className="text-sm font-bold leading-tight text-slate-900">
            {(reporte.tipo_accidente &&
              NIVEL_ACCIDENTE_LABELS[reporte.tipo_accidente]) ||
              reporte.tipo_accidente?.toUpperCase() ||
              "—"}
          </p>
          <dl className="space-y-1 text-[11px] leading-tight text-slate-700">
            <div>
              <dt className="font-medium text-slate-500">Quién</dt>
              <dd>{reporte.damnificado_nombre || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Dónde</dt>
              <dd>
                {reporte.lugar ||
                  (reporte.localidad
                    ? REPORTE_SEGURIDAD_LOCALIDAD_LABELS[reporte.localidad]
                    : "—")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Área</dt>
              <dd>
                {reporte.area
                  ? REPORTE_SEGURIDAD_AREA_LABELS[reporte.area]
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatFechaCorta(reporte.fecha)}
            {reporte.hora ? ` · ${reporte.hora.slice(0, 5)}` : ""}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin accidentes registrados.
        </p>
      )}
    </div>
  )
}

export function EtapaSeguridad({
  fechaReunion,
  reunionId,
  tipo,
  puedeEditar = false,
  currentProfileId,
  currentRole,
}: {
  fechaReunion: string
  /** Si se pasa, muestra el semáforo del día junto a la pirámide (solo Misiones). */
  reunionId?: string
  /** Tipo de reunión: define el área del contador (warehouse→depósito, resto→distribución). */
  tipo?: string
  puedeEditar?: boolean
  /** Profile actual; si se pasa junto con `currentRole`, las cards abren el detalle del reporte. */
  currentProfileId?: string | null
  currentRole?: UserRole
}) {
  // Área del contador de días sin accidente según el tipo de reunión.
  const areaSeguridad: "distribucion" | "deposito" =
    tipo === "warehouse" ? "deposito" : "distribucion"
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

  // Meta + fecha base del último accidente, POR ÁREA (persistido en app_config).
  const [metaDias, setMetaDias] = useState<number | null>(null)
  const [metaInput, setMetaInput] = useState<string>("")
  const [ultimoOverride, setUltimoOverride] = useState<string | null>(null)
  useEffect(() => {
    getSeguridadConfigArea(areaSeguridad).then((r) => {
      if ("data" in r) {
        setMetaDias(r.data.meta)
        setMetaInput(r.data.meta != null ? String(r.data.meta) : "")
        setUltimoOverride(r.data.ultimoOverride)
      }
    })
  }, [areaSeguridad])

  function guardarMeta(nuevo: string) {
    const trimmed = nuevo.trim()
    const n = trimmed === "" ? null : Number(trimmed)
    if (n !== null && (!Number.isFinite(n) || n < 0)) return
    setMetaDias(n) // optimista
    setSeguridadMetaDias(areaSeguridad, n).then((r) => {
      if ("error" in r) setErrorMsg(r.error)
    })
  }

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

  // Ventanita "Último accidente": el reporte más reciente (nivel FAI..LTI)
  // según el ÁREA de la reunión:
  //   - warehouse → solo depósito (si no hay, queda sin completar)
  //   - matinal   → solo distribución
  //   - logística / log-ventas → cualquiera (el último ocurrido)
  const areaVentanita: "deposito" | "distribucion" | null =
    tipo === "warehouse"
      ? "deposito"
      : tipo === "matinal-distribucion"
        ? "distribucion"
        : null
  const ultimoAccidentado = useMemo<ReporteSeguridadConAutor | null>(() => {
    const elegibles = reportes.filter(
      (r) =>
        r.tipo_accidente &&
        ULTIMO_ACCIDENTE_NIVELES.includes(r.tipo_accidente) &&
        (areaVentanita === null || r.area === areaVentanita),
    )
    if (elegibles.length === 0) return null
    elegibles.sort((a, b) => {
      const fa = `${a.fecha} ${a.hora ?? "00:00:00"}`
      const fb = `${b.fecha} ${b.hora ?? "00:00:00"}`
      if (fa !== fb) return fa < fb ? 1 : -1
      return a.created_at < b.created_at ? 1 : -1
    })
    return elegibles[0]
  }, [reportes, areaVentanita])

  const periodoLabel =
    piramideMes === "all"
      ? `año ${piramideAnio}`
      : `${MESES[piramideMes - 1]} ${piramideAnio}`

  // Días sin accidente del ÁREA de esta reunión (distribución o depósito):
  // el más reciente entre el último accidente real del área y la fecha base
  // configurada (override). De ahí a hoy, en UTC.
  const { diasSinAccidente } = useMemo(() => {
    let max: string | null =
      ultimoOverride && /^\d{4}-\d{2}-\d{2}$/.test(ultimoOverride)
        ? ultimoOverride
        : null
    for (const r of reportes) {
      if (r.tipo !== "accidente") continue
      if (r.area !== areaSeguridad) continue
      if (max === null || r.fecha > max) max = r.fecha
    }
    if (!max)
      return {
        diasSinAccidente: null as number | null,
        ultimoAccidente: null as string | null,
      }
    const [y, m, d] = max.split("-").map(Number)
    if (!y || !m || !d) return { diasSinAccidente: null, ultimoAccidente: null }
    const lastUTC = Date.UTC(y, m - 1, d)
    const now = new Date()
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const dias = Math.max(0, Math.floor((todayUTC - lastUTC) / 86_400_000))
    return { diasSinAccidente: dias, ultimoAccidente: max }
  }, [reportes, areaSeguridad, ultimoOverride])

  // Días que faltan para cumplir la meta = meta − días sin accidente.
  const diasRestantes =
    metaDias != null && diasSinAccidente != null
      ? Math.max(0, metaDias - diasSinAccidente)
      : null

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
      <CardHeader className="py-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-red-900">
            <Shield className="size-5 text-red-600" />
            Etapa 1 — Seguridad
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Año</Label>
              <Select
                value={String(piramideAnio)}
                onValueChange={(v) => setPiramideAnio(Number(v))}
              >
                <SelectTrigger className="h-7 w-24">
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
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Mes</Label>
              <Select
                value={piramideMes === "all" ? "all" : String(piramideMes)}
                onValueChange={(v) =>
                  setPiramideMes(v === "all" ? "all" : Number(v))
                }
              >
                <SelectTrigger className="h-7 w-36">
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
      </CardHeader>
      <CardContent className="space-y-6">
        {errorMsg && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Error cargando reportes: {errorMsg}
          </p>
        )}

        {/* Pirámide acumulada */}
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Pirámide de seguridad
            </h3>
            <p className="text-xs text-muted-foreground">
              Acumulado {periodoLabel}
            </p>
          </div>
          {cargando ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Cargando datos…
            </div>
          ) : (
            <div className="relative">
              <PiramideSeguridad conteos={piramideConteos} />
              {/* Ventanita "Último accidente" a la izquierda de la pirámide.
                  Alineada arriba (mismo top que el contador de la derecha). */}
              <div className="mt-3 flex justify-center xl:absolute xl:left-3 xl:top-6 xl:mt-0">
                <UltimoAccidenteVentana reporte={ultimoAccidentado} />
              </div>
              {/* Lado derecho: contador de días sin accidentes (grande, mismo
                  ancho y mismo top que la ventanita de la izquierda) y, debajo, el
                  semáforo del día (su ancho no necesita coincidir). */}
              <div className="mt-3 flex flex-col items-end gap-3 xl:absolute xl:right-3 xl:top-6 xl:mt-0">
                <div
                  className="flex items-stretch divide-x divide-slate-200 rounded-lg border bg-white shadow-sm"
                  style={{ borderLeft: "4px solid #16a34a" }}
                >
                  {/* Días sin accidente */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <ShieldCheck className="size-6 shrink-0 text-green-600" />
                    <div className="leading-tight">
                      {diasSinAccidente === null ? (
                        <>
                          <p className="text-sm font-bold text-slate-900">
                            Sin accidentes
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            registrados
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-bold leading-none text-slate-900">
                            {diasSinAccidente}{" "}
                            <span className="text-xs font-medium text-muted-foreground">
                              {diasSinAccidente === 1 ? "día" : "días"}
                            </span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            sin accidentes
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Meta a cumplir (editable) */}
                  <div className="flex flex-col items-center justify-center px-3 py-2">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">
                      Meta
                    </p>
                    {puedeEditar ? (
                      <input
                        type="number"
                        min={0}
                        value={metaInput}
                        onChange={(e) => setMetaInput(e.target.value)}
                        onBlur={() => guardarMeta(metaInput)}
                        placeholder="—"
                        title="Meta de días sin accidente (editable)"
                        className="w-20 rounded border border-slate-300 px-2 py-0.5 text-center text-lg font-bold leading-none text-slate-900"
                      />
                    ) : (
                      <p className="text-lg font-bold leading-none text-slate-900">
                        {metaDias ?? "—"}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      días
                    </p>
                  </div>
                  {/* Días restantes para la meta */}
                  <div className="flex flex-col items-center justify-center px-3 py-2">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">
                      Faltan
                    </p>
                    <p
                      className={cn(
                        "text-xl font-bold leading-none",
                        diasRestantes === 0
                          ? "text-emerald-600"
                          : "text-slate-900",
                      )}
                    >
                      {diasRestantes == null ? "—" : diasRestantes}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {diasRestantes === 0 ? "¡meta!" : "días"}
                    </p>
                  </div>
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
