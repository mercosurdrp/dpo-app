"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  FileDown,
  Hand,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserPlus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  actualizarActividad,
  agregarAsistente,
  eliminarActividad,
  eliminarReunion,
  getIndicadoresMes,
  getSignedUrl,
  marcarMiAsistencia,
  quitarAsistente,
  setIndicadorValor,
  setIndicadorOverrideDiario,
  setIndicadorTarget,
} from "@/actions/reuniones"
import { IS_MISIONES } from "@/lib/empresa"
import { ActividadFormDialog } from "@/components/reuniones/actividad-form-dialog"
import { ConfigurarIndicadoresDialog } from "@/components/reuniones/configurar-indicadores-dialog"
import { EditarReunionDialog } from "@/components/reuniones/editar-reunion-dialog"
import { DetalleActividadDialog } from "@/components/reuniones/detalle-actividad-dialog"
import { EtapaSeguridad } from "@/components/reuniones/etapa-seguridad"
import { TorCountdown } from "@/components/reuniones/tor-countdown"
import { RechazosDetalleDiaDialog } from "@/components/reuniones/rechazos-detalle-dia-dialog"
import { VentasDetalleDiaDialog } from "@/components/reuniones/ventas-detalle-dia-dialog"
import { TmlDetalleDiaDialog } from "@/components/reuniones/tml-detalle-dia-dialog"
import { OcupacionBodegaDetalleDiaDialog } from "@/components/reuniones/ocupacion-bodega-detalle-dia-dialog"
import { AperturaPickingDetalleDiaDialog } from "@/components/reuniones/apertura-picking-detalle-dia-dialog"
import { AusentismoDetalleDiaDialog } from "@/components/reuniones/ausentismo-detalle-dia-dialog"
import { ChecklistDetalleDiaDialog } from "@/components/reuniones/checklist-detalle-dia-dialog"
import { ChecksDetalleDiaDialog } from "@/components/reuniones/checks-detalle-dia-dialog"
import { KmRecorridosDetalleDiaDialog } from "@/components/reuniones/km-recorridos-detalle-dia-dialog"
import { HorasCalleDetalleDiaDialog } from "@/components/reuniones/horas-calle-detalle-dia-dialog"
import type {
  EstadoReunionActividad,
  Reunion,
  ReunionActividad,
  ReunionActividadConResponsable,
  ReunionAsistenteConProfile,
  ReunionDetalle,
  TipoReunion,
  UserRole,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

type AgregacionIndicador = "suma" | "promedio"

interface IndicadorMesCellData {
  reunion_id: string
  valor: number | null
  observacion: string | null
  texto?: string | null
  es_override?: boolean
  auto_valor?: number | null
}

interface IndicadorMesItem {
  id: string
  nombre: string
  unidad: string | null
  meta: number | null
  orden: number
  agregacion: AgregacionIndicador
  valores: Record<string, IndicadorMesCellData | null>
  mtd: number | null
  mtd_texto?: string | null
  auto?: boolean
  mostrar_cero?: boolean
  mejor_si?: "menor" | "mayor"
  editable_historico?: boolean
}

interface IndicadoresMesData {
  anio: number
  mes: number
  fechas: string[]
  reuniones_por_fecha: Record<string, string | null>
  indicadores: IndicadorMesItem[]
}

interface SectorOpt {
  numero: number
  nombre: string
  updated_at: string
  updated_by: string | null
}

interface VehiculoOpt {
  id: string
  dominio: string
}

interface RubroOpt {
  id: string
  nombre: string
}

interface Props {
  detalle: ReunionDetalle & { actividades?: ReunionActividadConResponsable[] }
  indicadoresMes: IndicadoresMesData | null
  responsables: ResponsableOpt[]
  sectoresAlmacen: SectorOpt[]
  vehiculos: VehiculoOpt[]
  rubrosMantenimiento: RubroOpt[]
  puedeEditar: boolean
  currentProfileId: string | null
  currentRole: UserRole
}

const TIPO_LABELS: Record<TipoReunion, string> = {
  logistica: "Logística",
  "logistica-ventas": "Logística + Ventas",
  "matinal-distribucion": "Matinal Distribución",
  warehouse: "Warehouse",
}

function formatFechaLarga(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatFechaHoraCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })
}

const NOMBRE_MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]
const DIAS_SEM_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

function nombreMes(m: number): string {
  return NOMBRE_MESES[m - 1] ?? ""
}

function diaDelMes(iso: string): string {
  return iso.slice(8, 10)
}

function diaSem(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return DIAS_SEM_LABEL[d.getDay()] ?? ""
}

function esFinDeSemana(iso: string): boolean {
  const d = new Date(iso + "T12:00:00")
  const g = d.getDay()
  return g === 0 || g === 6
}

function formatearValor(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)
}

// Color condicional de una celda del tablero según el objetivo (meta) y la
// polaridad (mejor_si). Verde si cumple, rojo si no. Devuelve null (neutro)
// cuando el indicador no tiene objetivo cargado. Misma lógica que las filas
// automáticas, para que TODAS las celdas (auto o manuales) se vean igual.
function colorPorObjetivo(
  valor: number | null | undefined,
  meta: number | null | undefined,
  mejorSi: "menor" | "mayor" | undefined,
): string | null {
  if (valor == null || !Number.isFinite(valor) || meta == null || !mejorSi) {
    return null
  }
  const cumple = mejorSi === "menor" ? valor <= meta : valor >= meta
  return cumple
    ? "bg-emerald-50 font-semibold text-emerald-700"
    : "bg-red-50 font-semibold text-red-700"
}

function EstadoActividadBadge({
  estado,
}: {
  estado: EstadoReunionActividad
}) {
  if (estado === "cerrada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Cerrada
      </Badge>
    )
  }
  if (estado === "en_curso") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En curso
      </Badge>
    )
  }
  return (
    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
      No comenzada
    </Badge>
  )
}

// =============================================
// Asistente row (fila de la planilla de asistencia)
// =============================================
function AsistenteRow({
  asistente,
  puedeEditar,
  onQuitar,
}: {
  asistente: ReunionAsistenteConProfile
  puedeEditar: boolean
  onQuitar: (a: ReunionAsistenteConProfile) => void
}) {
  return (
    <tr
      className={
        asistente.presente
          ? "bg-emerald-100/70 transition-colors"
          : "bg-slate-100 transition-colors"
      }
    >
      <td className="px-3 py-1.5">
        <p
          className={`truncate text-sm ${
            asistente.presente
              ? "font-medium text-slate-900"
              : "text-slate-600"
          }`}
        >
          {asistente.profile_nombre}
        </p>
        {!asistente.presente && asistente.justificacion && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={asistente.justificacion}
          >
            {asistente.justificacion}
          </p>
        )}
      </td>
      <td className="px-3 py-1.5 text-center">
        <span
          className={`inline-block size-4 rounded-full ${
            asistente.presente ? "bg-emerald-500" : "bg-slate-500"
          }`}
          title={asistente.presente ? "Presente" : "Sin marcar"}
          aria-label={asistente.presente ? "Presente" : "Sin marcar"}
        />
      </td>
      {puedeEditar && (
        <td className="px-2 py-1.5 text-right">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-red-600 hover:text-red-700"
            onClick={() => onQuitar(asistente)}
            title="Quitar"
          >
            <X className="size-3.5" />
          </Button>
        </td>
      )}
    </tr>
  )
}

function AgregarAsistenteAdHoc({
  reunionId,
  responsables,
  yaAgregados,
  onAdded,
}: {
  reunionId: string
  responsables: ResponsableOpt[]
  yaAgregados: Set<string>
  onAdded: (nuevo: ReunionAsistenteConProfile) => void
}) {
  const [seleccionado, setSeleccionado] = useState<string>("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const disponibles = useMemo(
    () => responsables.filter((r) => !yaAgregados.has(r.id)),
    [responsables, yaAgregados],
  )

  function handleAdd() {
    if (!seleccionado) return
    setError(null)
    const elegido = responsables.find((r) => r.id === seleccionado)
    startTransition(async () => {
      const result = await agregarAsistente(reunionId, seleccionado)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setSeleccionado("")
      onAdded({
        ...result.data,
        profile_nombre: elegido?.nombre ?? "—",
        profile_email: null,
      })
    })
  }

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-700">
          Agregar asistente:
        </span>
        <div className="min-w-[200px] flex-1">
          <Select
            value={seleccionado}
            onValueChange={(v: string | null) => setSeleccionado(v ?? "")}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Seleccionar usuario…" />
            </SelectTrigger>
            <SelectContent>
              {disponibles.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  Todos los usuarios ya son asistentes.
                </div>
              ) : (
                disponibles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={pending || !seleccionado}
        >
          <UserPlus className="mr-2 size-4" />
          Agregar
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

// =============================================
// ValorInput (input editable inline con auto-save debounced)
// =============================================
function ValorInput({
  indicadorId,
  initial,
  reunionId,
  puedeEditar,
  onChanged,
}: {
  indicadorId: string
  initial: number | null
  reunionId: string
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [val, setVal] = useState<string>(
    initial !== null && initial !== undefined ? String(initial) : "",
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedRef = useRef<string>(
    initial !== null && initial !== undefined ? String(initial) : "",
  )

  useEffect(() => {
    const next =
      initial !== null && initial !== undefined ? String(initial) : ""
    setVal(next)
    lastPersistedRef.current = next
  }, [initial])

  const persist = useCallback(
    (nuevo: string) => {
      if (nuevo === lastPersistedRef.current) return
      const trimmed = nuevo.trim()
      const numero = trimmed === "" ? null : Number(trimmed)
      if (numero !== null && Number.isNaN(numero)) {
        setError("Inválido")
        return
      }
      setError(null)
      setSaving(true)
      void setIndicadorValor(reunionId, indicadorId, numero, null).then(
        (res) => {
          setSaving(false)
          if ("error" in res) {
            setError(res.error)
            return
          }
          lastPersistedRef.current = nuevo
          onChanged()
        },
      )
    },
    [reunionId, indicadorId, onChanged],
  )

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setVal(next)
    if (!puedeEditar) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => persist(next), 600)
  }

  function handleBlur() {
    if (!puedeEditar) return
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    persist(val)
  }

  return (
    <div className="flex flex-col items-center">
      <Input
        type="number"
        step="any"
        value={val}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={!puedeEditar}
        className={cn(
          "h-8 w-20 bg-transparent text-center text-sm font-semibold",
          saving && "border-blue-300",
          error && "border-red-400",
        )}
        placeholder="—"
      />
      {error && (
        <span className="mt-0.5 text-[9px] text-red-600">{error}</span>
      )}
    </div>
  )
}

// =============================================
// Celda editable por OVERRIDE diario (Productividad/Errores/Pérdidas).
// Permite corregir el valor de cualquier día (incluido hacia atrás). Vacío
// = usa el valor automático (que se muestra como placeholder). Con valor =
// pisa el auto. Resaltada en ámbar cuando hay override cargado.
// =============================================
function OverrideValorInput({
  indicadorKey,
  fecha,
  reunionId,
  puedeEditar,
  valor,
  autoValor,
  esOverride,
  onChanged,
}: {
  indicadorKey: string
  fecha: string
  reunionId: string
  puedeEditar: boolean
  valor: number | null
  autoValor: number | null
  esOverride: boolean
  onChanged: () => void
}) {
  const inicial = esOverride && valor != null ? String(valor) : ""
  const [val, setVal] = useState<string>(inicial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastRef = useRef<string>(inicial)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const next = esOverride && valor != null ? String(valor) : ""
    setVal(next)
    lastRef.current = next
  }, [esOverride, valor])

  const persist = useCallback(
    (nuevo: string) => {
      if (nuevo === lastRef.current) return
      const trimmed = nuevo.trim()
      const numero = trimmed === "" ? null : Number(trimmed.replace(",", "."))
      if (numero !== null && !Number.isFinite(numero)) {
        setError("Inválido")
        return
      }
      setError(null)
      setSaving(true)
      void setIndicadorOverrideDiario(
        reunionId,
        indicadorKey,
        fecha,
        numero,
      ).then((res) => {
        setSaving(false)
        if ("error" in res) {
          setError(res.error)
          return
        }
        lastRef.current = nuevo
        onChanged()
      })
    },
    [reunionId, indicadorKey, fecha, onChanged],
  )

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setVal(next)
    if (!puedeEditar) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => persist(next), 600)
  }

  function handleBlur() {
    if (!puedeEditar) return
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    persist(val)
  }

  const placeholder =
    autoValor != null && Number.isFinite(autoValor)
      ? formatearValor(autoValor)
      : "—"

  return (
    <div className="flex flex-col items-center">
      <Input
        type="number"
        step="any"
        value={val}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={!puedeEditar}
        className={cn(
          "h-8 w-20 bg-transparent text-center text-sm font-semibold",
          saving && "border-blue-300",
          error && "border-red-400",
        )}
        placeholder={placeholder}
        title={
          esOverride
            ? `Valor corregido a mano (automático: ${placeholder})`
            : "Cargá un valor para corregir este día; vacío usa el automático"
        }
      />
      {error && (
        <span className="mt-0.5 text-[9px] text-red-600">{error}</span>
      )}
    </div>
  )
}

// =============================================
// TargetInput: objetivo editable inline (número + dirección ▲/▼).
// Actualiza la config del indicador (meta + mejor_si). Vacío = sin objetivo
// (la fila queda en tono azulado). ▲ = mejor cuando valor ≥ target; ▼ = mejor
// cuando valor ≤ target. Solo editable por editores.
// =============================================
function TargetInput({
  indicadorId,
  meta,
  mejorSi,
  puedeEditar,
  onChanged,
}: {
  indicadorId: string
  meta: number | null
  mejorSi: "menor" | "mayor" | undefined
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [val, setVal] = useState<string>(meta != null ? String(meta) : "")
  const [dir, setDir] = useState<"menor" | "mayor">(mejorSi ?? "mayor")
  const [saving, setSaving] = useState(false)
  const lastRef = useRef<string>(meta != null ? String(meta) : "")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const next = meta != null ? String(meta) : ""
    setVal(next)
    lastRef.current = next
    if (mejorSi) setDir(mejorSi)
  }, [meta, mejorSi])

  const persist = useCallback(
    (nuevoVal: string, nuevoDir: "menor" | "mayor") => {
      const trimmed = nuevoVal.trim()
      const numero = trimmed === "" ? null : Number(trimmed.replace(",", "."))
      if (numero !== null && !Number.isFinite(numero)) return
      setSaving(true)
      void setIndicadorTarget(
        indicadorId,
        numero,
        numero === null ? null : nuevoDir,
      ).then((res) => {
        setSaving(false)
        if (!("error" in res)) {
          lastRef.current = nuevoVal
          onChanged()
        }
      })
    },
    [indicadorId, onChanged],
  )

  if (!puedeEditar) {
    return (
      <div className="flex items-center justify-end gap-0.5 tabular-nums">
        <span>{meta == null ? "—" : formatearValor(meta)}</span>
        {meta != null &&
          mejorSi &&
          (mejorSi === "mayor" ? (
            <ArrowUp className="size-3 text-slate-400" />
          ) : (
            <ArrowDown className="size-3 text-slate-400" />
          ))}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Input
        type="number"
        step="any"
        value={val}
        onChange={(e) => {
          const next = e.target.value
          setVal(next)
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => persist(next, dir), 600)
        }}
        onBlur={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          if (val.trim() !== lastRef.current.trim()) persist(val, dir)
        }}
        className={cn(
          "h-6 w-12 bg-transparent px-1 text-right text-xs tabular-nums",
          saving && "border-blue-300",
        )}
        placeholder="—"
        title="Objetivo del indicador (vacío = sin objetivo)"
      />
      <button
        type="button"
        onClick={() => {
          const nd = dir === "mayor" ? "menor" : "mayor"
          setDir(nd)
          if (val.trim() !== "") persist(val, nd)
        }}
        className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        title={
          dir === "mayor"
            ? "Más es mejor (verde si valor ≥ target). Click para invertir."
            : "Menos es mejor (verde si valor ≤ target). Click para invertir."
        }
      >
        {dir === "mayor" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )}
      </button>
    </div>
  )
}

// =============================================
// Actividad row
// =============================================
function ActividadListItem({
  actividad,
  reunionId,
  puedeEditar,
  currentProfileId,
  onEdit,
  onAbrirDetalle,
  onActualizada,
  onEliminada,
  onAbrirArchivo,
}: {
  actividad: ReunionActividadConResponsable
  reunionId: string
  puedeEditar: boolean
  currentProfileId: string | null
  onEdit: () => void
  onAbrirDetalle: (estadoInicial?: EstadoReunionActividad) => void
  onActualizada: (act: ReunionActividad) => void
  onEliminada: (id: string) => void
  onAbrirArchivo: (url: string | null) => void
}) {
  const [pending, startTransition] = useTransition()

  const arrastrada = actividad.reunion_origen_id !== reunionId
  const cerradaArrastrada = arrastrada && actividad.estado === "cerrada"

  function handleEliminar() {
    if (
      !confirm(
        `¿Eliminar la actividad "${actividad.descripcion.slice(0, 60)}${
          actividad.descripcion.length > 60 ? "…" : ""
        }"?`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarActividad(actividad.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      onEliminada(actividad.id)
    })
  }

  function handleEstadoChange(nuevo: EstadoReunionActividad) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("descripcion", actividad.descripcion)
      formData.set("motivo", actividad.motivo ?? "")
      if (actividad.responsable_id) {
        formData.set("responsable_id", actividad.responsable_id)
      }
      if (actividad.fecha_compromiso) {
        formData.set("fecha_compromiso", actividad.fecha_compromiso)
      }
      formData.set("observaciones", actividad.observaciones ?? "")
      formData.set("estado", nuevo)
      const result = await actualizarActividad(actividad.id, formData)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      onActualizada(result.data)
    })
  }

  const puedeResponder =
    actividad.estado !== "cerrada" &&
    (puedeEditar ||
      (currentProfileId !== null &&
        actividad.responsable_id === currentProfileId))

  return (
    <li className="border-b px-4 py-3 last:border-0">
      {arrastrada && (
        <p className="mb-1 text-xs text-muted-foreground">
          Arrastrada de {formatFechaCorta(actividad.reunion_origen_fecha)}
          {cerradaArrastrada && actividad.completado_at && (
            <span className="ml-2 text-emerald-700">
              · Cerrada el {formatFechaHoraCorta(actividad.completado_at)}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onAbrirDetalle()}
            title="Ver detalle y avances"
            className={`text-left text-sm font-medium hover:underline ${
              actividad.estado === "cerrada"
                ? "text-slate-500 line-through"
                : "text-slate-900"
            }`}
          >
            {actividad.descripcion}
          </button>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {actividad.responsable_nombre ? (
              <span>Resp: {actividad.responsable_nombre}</span>
            ) : (
              <span className="italic">Sin responsable</span>
            )}
            {actividad.fecha_compromiso && (
              <span>
                Vence: {formatFechaCorta(actividad.fecha_compromiso)}
              </span>
            )}
            {actividad.motivo && <span>Motivo: {actividad.motivo}</span>}
          </div>
          {actividad.observaciones && (
            <p className="mt-1 text-xs text-slate-600">
              {actividad.observaciones}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <EstadoActividadBadge estado={actividad.estado} />
          <div className="flex flex-wrap justify-end gap-1">
            {actividad.evidencia_url && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => onAbrirArchivo(actividad.evidencia_url)}
                title={`Ver evidencia${
                  actividad.evidencia_nombre
                    ? `: ${actividad.evidencia_nombre}`
                    : ""
                }`}
              >
                <FileDown className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onAbrirDetalle()}
              title="Ver detalle y avances"
              disabled={pending}
            >
              <Eye className="size-3.5" />
              {puedeResponder ? "Ver / responder" : "Ver"}
            </Button>
            {puedeEditar && (
              <>
                <Select
                  value={actividad.estado}
                  onValueChange={(v: string | null) => {
                    if (!v) return
                    if (
                      v !== "no_comenzada" &&
                      v !== "en_curso" &&
                      v !== "cerrada"
                    )
                      return
                    // Cerrar exige comentario: se hace desde el popup.
                    if (v === "cerrada") {
                      onAbrirDetalle("cerrada")
                      return
                    }
                    handleEstadoChange(v as EstadoReunionActividad)
                  }}
                >
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_comenzada">No comenzada</SelectItem>
                    <SelectItem value="en_curso">En curso</SelectItem>
                    <SelectItem value="cerrada">Cerrada</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={onEdit}
                  title="Editar"
                  disabled={pending}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-red-600 hover:text-red-700"
                  onClick={handleEliminar}
                  title="Eliminar"
                  disabled={pending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// =============================================
// Main page client
// =============================================
export function ReunionDetallePageClient({
  detalle,
  indicadoresMes: indicadoresMesInicial,
  responsables,
  sectoresAlmacen,
  vehiculos,
  rubrosMantenimiento,
  puedeEditar,
  currentProfileId,
  currentRole,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editarOpen, setEditarOpen] = useState(false)

  // Indicadores como state — se refetchan al cambiar el filtro de sucursal
  // (sólo aplica en reuniones de logística en Misiones).
  const [indicadoresMes, setIndicadoresMes] = useState<IndicadoresMesData | null>(
    indicadoresMesInicial,
  )
  const muestraToggleSucursal = IS_MISIONES && detalle.tipo === "logistica"
  const [sucursalSel, setSucursalSel] = useState<
    "todo" | "eldorado" | "iguazu"
  >("todo")
  const [cargandoIndicadores, startCargaIndicadores] = useTransition()

  const cambiarSucursal = (s: "todo" | "eldorado" | "iguazu") => {
    if (s === sucursalSel) return
    setSucursalSel(s)
    startCargaIndicadores(async () => {
      const res = await getIndicadoresMes(detalle.id, { sucursal: s })
      if ("data" in res) setIndicadoresMes(res.data)
    })
  }

  // Sincronización manual de Foxtrot (últimos 4 días) — solo Misiones/logística.
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const sincronizarReciente = async () => {
    if (sincronizando) return
    setSincronizando(true)
    setSyncMsg(null)
    try {
      const res = await fetch("/api/foxtrot/sync-manual?dias=4", {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        setSyncMsg(`Error: ${json.error ?? res.statusText}`)
        return
      }
      setSyncMsg(
        `Sincronizados ${json.dias} días · ${json.rutas} rutas` +
          (json.errores ? ` · ${json.errores} errores` : ""),
      )
      // Refrescar el tablero con la sucursal actual.
      const ind = await getIndicadoresMes(detalle.id, { sucursal: sucursalSel })
      if ("data" in ind) setIndicadoresMes(ind.data)
      router.refresh()
    } catch (e) {
      setSyncMsg(
        `Error: ${e instanceof Error ? e.message : "no se pudo sincronizar"}`,
      )
    } finally {
      setSincronizando(false)
    }
  }

  // Sincronización manual de Cloudfleet (checklists de liberación/retorno/AE).
  // Resincroniza TODO el mes del tablero y refresca los indicadores. Solo
  // Misiones/logística. Independiente del sync de Foxtrot.
  const [sincronizandoChecks, setSincronizandoChecks] = useState(false)
  const [syncChecksMsg, setSyncChecksMsg] = useState<string | null>(null)
  const sincronizarChecks = async () => {
    if (sincronizandoChecks) return
    setSincronizandoChecks(true)
    setSyncChecksMsg(null)
    try {
      const fechas = indicadoresMes?.fechas ?? []
      const qs =
        fechas.length > 0
          ? `?desde=${fechas[0]}&hasta=${fechas[fechas.length - 1]}`
          : ""
      const res = await fetch(`/api/cloudfleet/sync-manual${qs}`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        setSyncChecksMsg(`Error: ${json.error ?? res.statusText}`)
        return
      }
      setSyncChecksMsg(`Checks sincronizados · ${json.total ?? 0} registros`)
      // Refrescar el tablero con la sucursal actual.
      const ind = await getIndicadoresMes(detalle.id, { sucursal: sucursalSel })
      if ("data" in ind) setIndicadoresMes(ind.data)
      router.refresh()
    } catch (e) {
      setSyncChecksMsg(
        `Error: ${e instanceof Error ? e.message : "no se pudo sincronizar"}`,
      )
    } finally {
      setSincronizandoChecks(false)
    }
  }

  const [openConfigInd, setOpenConfigInd] = useState(false)
  const [openActForm, setOpenActForm] = useState(false)
  const [actividadEditando, setActividadEditando] =
    useState<ReunionActividadConResponsable | null>(null)
  // Actividad abierta en el popup de detalle. estadoInicial preselecciona el
  // estado del formulario (ej. al elegir "Cerrada" en el Select de la fila).
  const [actividadDetalle, setActividadDetalle] = useState<{
    actividad: ReunionActividadConResponsable
    estadoInicial?: EstadoReunionActividad
  } | null>(null)

  // Vista del tablero: "hasta_hoy" | "semana_<N>" | "mes_completo"
  const [vistaTablero, setVistaTablero] = useState<string>("hasta_hoy")

  // Detalle del día seleccionado al hacer click en celda Rechazos %
  const [rechazosDetalleFecha, setRechazosDetalleFecha] = useState<string | null>(
    null,
  )
  // Detalle del día seleccionado al hacer click en celda Bultos vendidos
  const [ventasBultosFecha, setVentasBultosFecha] = useState<string | null>(
    null,
  )
  // Detalle del día seleccionado al hacer click en celda HL vendidos
  const [ventasHlFecha, setVentasHlFecha] = useState<string | null>(null)
  // Detalle del día seleccionado al hacer click en celda TML
  const [tmlDetalleFecha, setTmlDetalleFecha] = useState<string | null>(null)
  const [obDetalleFecha, setObDetalleFecha] = useState<string | null>(null)
  // Detalle del día al hacer click en la celda Productividad de picking:
  // abre el sub-cuadro con los 3 operadores Troli/Galvez/Ovejero. La fila
  // Precisión de picking NO abre este detalle (es un valor global del día).
  const [aperturaPickingFecha, setAperturaPickingFecha] = useState<string | null>(
    null,
  )

  // Detalle del día al hacer click en la celda Ausentismo: lista de personas
  // ausentes / con licencia médica de los sectores Depósito + Distribución.
  const [ausentismoFecha, setAusentismoFecha] = useState<string | null>(null)

  // Detalle del día al hacer click en la celda del indicador Checklist:
  // unidades liberadas con sus ítems en falla + las que salieron sin checklist.
  const [checklistDetalleFecha, setChecklistDetalleFecha] = useState<
    string | null
  >(null)

  // Detalle del día al hacer click en una celda de los indicadores de checks de
  // Cloudfleet (Checks Aprobados/Rechazados o Adherencia): estado de liberación
  // + retorno por camión, marcando quién quedó incompleto.
  const [checksDetalleFecha, setChecksDetalleFecha] = useState<string | null>(
    null,
  )

  // Detalle del día al hacer click en la celda del indicador Km recorridos:
  // km por camión (odómetro de retorno − odómetro de liberación).
  const [kmDetalleFecha, setKmDetalleFecha] = useState<string | null>(null)

  // Detalle del día al hacer click en la celda del indicador Horas en la
  // calle: horas por camión (hora de retorno − hora de liberación).
  const [horasCalleFecha, setHorasCalleFecha] = useState<string | null>(null)

  // Filtro Action Log por estado
  const [filtroEstado, setFiltroEstado] = useState<
    "todas" | "no_comenzada" | "en_curso" | "cerrada"
  >("todas")

  const tipoLabel = TIPO_LABELS[detalle.tipo] ?? detalle.tipo

  // Calcular semanas ISO ya iniciadas dentro del mes (solo las que tienen al
  // menos un día <= fecha de la reunión actual)
  const semanasDelMes = useMemo(() => {
    if (!indicadoresMes) return [] as Array<{ key: string; label: string; fechas: string[] }>
    const fechaReunion = detalle.fecha
    const map = new Map<string, string[]>()
    for (const f of indicadoresMes.fechas) {
      if (f > fechaReunion) continue // solo semanas iniciadas
      const d = new Date(f + "T12:00:00")
      // Lunes de esa semana ISO
      const dow = d.getDay() || 7 // 1..7
      const lunes = new Date(d)
      lunes.setDate(d.getDate() - (dow - 1))
      const lunesIso = [
        lunes.getFullYear(),
        String(lunes.getMonth() + 1).padStart(2, "0"),
        String(lunes.getDate()).padStart(2, "0"),
      ].join("-")
      const arr = map.get(lunesIso) ?? []
      arr.push(f)
      map.set(lunesIso, arr)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([lunesIso, fechas], idx) => {
        const ini = fechas[0]
        const fin = fechas[fechas.length - 1]
        const labelRange =
          ini === fin ? diaDelMes(ini) : `${diaDelMes(ini)}–${diaDelMes(fin)}`
        return {
          key: `semana_${idx + 1}`,
          label: `Sem ${idx + 1} (${labelRange})`,
          fechas,
          lunesIso,
        }
      })
  }, [indicadoresMes, detalle.fecha])

  const fechasFiltradas = useMemo(() => {
    if (!indicadoresMes) return [] as string[]
    // Logística-Ventas: el backend ya manda las últimas semanas completas; se
    // muestran todas (no se recorta a "hasta hoy"), así cada semana queda entera.
    if (IS_MISIONES && detalle.tipo === "logistica-ventas")
      return indicadoresMes.fechas
    if (vistaTablero === "mes_completo") return indicadoresMes.fechas
    if (vistaTablero === "hasta_hoy") {
      return indicadoresMes.fechas.filter((f) => f <= detalle.fecha)
    }
    // semana_X
    const sem = semanasDelMes.find((s) => s.key === vistaTablero)
    return sem ? sem.fechas : indicadoresMes.fechas.filter((f) => f <= detalle.fecha)
  }, [indicadoresMes, vistaTablero, detalle.fecha, semanasDelMes])

  // ── Logística-Ventas: columnas agrupadas por semana con "Total semanal" ──────
  // El tablero diario sigue igual, pero las fechas se agrupan por semana ISO y
  // tras cada semana se intercala una columna "Total semanal" (con ▼). Por
  // defecto las semanas están COLAPSADAS (solo se ven los totales); al desplegar
  // una, aparecen sus días. Solo aplica a logística-ventas; el resto de tipos
  // mantiene una columna por día.
  const esLogVentas = IS_MISIONES && detalle.tipo === "logistica-ventas"
  const [semanasExpandidas, setSemanasExpandidas] = useState<Set<string>>(
    new Set(),
  )
  const toggleSemana = (key: string) =>
    setSemanasExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  type ColTablero =
    | { kind: "dia"; f: string }
    | {
        kind: "total"
        semana: { key: string; label: string; fechas: string[] }
      }
  const columnasTablero = useMemo<ColTablero[]>(() => {
    // Orden invertido: el último día a revisar queda a la IZQUIERDA y el
    // primero a la derecha (copia para no mutar fechasFiltradas).
    if (!esLogVentas)
      return [...fechasFiltradas].reverse().map((f) => ({ kind: "dia", f }))
    const map = new Map<string, string[]>()
    for (const f of fechasFiltradas) {
      const d = new Date(f + "T12:00:00")
      const dow = d.getDay() || 7
      const lunes = new Date(d)
      lunes.setDate(d.getDate() - (dow - 1))
      const lunesIso = [
        lunes.getFullYear(),
        String(lunes.getMonth() + 1).padStart(2, "0"),
        String(lunes.getDate()).padStart(2, "0"),
      ].join("-")
      const arr = map.get(lunesIso) ?? []
      arr.push(f)
      map.set(lunesIso, arr)
    }
    const semanas = Array.from(map.entries()).sort(([a], [b]) =>
      a < b ? -1 : 1,
    )
    const cols: ColTablero[] = []
    semanas.forEach(([lunesIso, fechas], idx) => {
      const key = `sem_${lunesIso}`
      if (semanasExpandidas.has(key)) {
        for (const f of fechas) cols.push({ kind: "dia", f })
      }
      cols.push({
        kind: "total",
        semana: { key, label: `Sem ${idx + 1}`, fechas },
      })
    })
    return cols
  }, [esLogVentas, fechasFiltradas, semanasExpandidas])

  // Agregado semanal de un indicador según su agregación (suma/promedio).
  const totalSemanal = (
    ind: IndicadorMesItem,
    fechas: string[],
  ): number | null => {
    // Rechazo: ponderado por bultos = Σ(bultos×%) / Σ(bultos), que equivale a
    // rechazados ÷ entregas totales de la semana (no un promedio simple).
    const esRechazo =
      ind.id === "auto_rechazo" ||
      ind.nombre.trim().toLowerCase() === "rechazo"
    if (esRechazo && indicadoresMes) {
      const bultosInd = indicadoresMes.indicadores.find(
        (i) => i.id === "auto_bultos_totales",
      )
      if (bultosInd) {
        let num = 0
        let den = 0
        for (const f of fechas) {
          const pct = ind.valores[f]?.valor
          const bul = bultosInd.valores[f]?.valor
          if (
            pct != null &&
            Number.isFinite(pct) &&
            bul != null &&
            Number.isFinite(bul) &&
            bul > 0
          ) {
            num += (pct / 100) * bul
            den += bul
          }
        }
        return den > 0 ? (num / den) * 100 : null
      }
    }
    const nums: number[] = []
    for (const f of fechas) {
      const v = ind.valores[f]?.valor
      if (v != null && Number.isFinite(v)) nums.push(v)
    }
    if (nums.length === 0) return null
    const suma = nums.reduce((a, b) => a + b, 0)
    return ind.agregacion === "promedio" ? suma / nums.length : suma
  }

  // Fuente de actividades (defensiva: actividades nuevo, compromisos legacy)
  const actividadesFuente: ReunionActividadConResponsable[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = detalle as any
    if (Array.isArray(d.actividades)) return d.actividades
    if (Array.isArray(d.compromisos)) {
      return (d.compromisos as Array<Record<string, unknown>>).map((c) => {
        const estadoLegacy = (c.estado as string) ?? "pendiente"
        const estadoNuevo: EstadoReunionActividad =
          estadoLegacy === "completado"
            ? "cerrada"
            : estadoLegacy === "en_progreso"
              ? "en_curso"
              : "no_comenzada"
        return {
          ...(c as object),
          motivo: (c.motivo as string) ?? null,
          estado: estadoNuevo,
          reunion_origen_id: (c.reunion_origen_id as string) ?? detalle.id,
          reunion_origen_fecha:
            (c.reunion_origen_fecha as string) ?? detalle.fecha,
        } as ReunionActividadConResponsable
      })
    }
    return []
  }, [detalle])

  // Copia local del Action Log para reflejar altas/cambios/bajas AL INSTANTE
  // (mismo patrón que asistentes: el refresh completo del server tarda ~8s).
  const [actividades, setActividades] = useState(actividadesFuente)
  useEffect(() => {
    setActividades(actividadesFuente)
  }, [actividadesFuente])

  function aplicarActividadLocal(act: ReunionActividad) {
    const previa = actividades.find((a) => a.id === act.id)
    const merged: ReunionActividadConResponsable = {
      ...(previa ?? {
        reunion_origen_id: detalle.id,
        reunion_origen_fecha: detalle.fecha,
      }),
      ...act,
      responsable_nombre: act.responsable_id
        ? (responsables.find((r) => r.id === act.responsable_id)?.nombre ??
          null)
        : null,
    } as ReunionActividadConResponsable
    setActividades((prev) =>
      previa ? prev.map((a) => (a.id === act.id ? merged : a)) : [...prev, merged],
    )
    // Si el popup de detalle está abierto sobre esta actividad, sincronizarlo.
    setActividadDetalle((prev) =>
      prev && prev.actividad.id === act.id
        ? { ...prev, actividad: merged }
        : prev,
    )
    refrescar()
  }

  function eliminarActividadLocal(id: string) {
    setActividades((prev) => prev.filter((a) => a.id !== id))
    refrescar()
  }

  const conteosActividades = useMemo(() => {
    const c = { no_comenzada: 0, en_curso: 0, cerrada: 0 }
    for (const a of actividades) {
      if (a.estado === "no_comenzada") c.no_comenzada++
      else if (a.estado === "en_curso") c.en_curso++
      else if (a.estado === "cerrada") c.cerrada++
    }
    return c
  }, [actividades])

  const actividadesFiltradas = useMemo(() => {
    if (filtroEstado === "todas") return actividades
    return actividades.filter((a) => a.estado === filtroEstado)
  }, [actividades, filtroEstado])

  // Copia local de asistentes para reflejar cambios AL INSTANTE (optimista):
  // el router.refresh() re-corre toda la página en el server (indicadores en
  // vivo ~8s), así que sin esto cada alta/baja/marca parece "no hacer nada".
  const [asistentes, setAsistentes] = useState(detalle.asistentes)
  useEffect(() => {
    setAsistentes(detalle.asistentes)
  }, [detalle.asistentes])

  const yaAgregadosSet = useMemo(
    () => new Set(asistentes.map((a) => a.profile_id)),
    [asistentes],
  )

  const miAsistente = useMemo(() => {
    if (!currentProfileId) return null
    return asistentes.find((a) => a.profile_id === currentProfileId) ?? null
  }, [asistentes, currentProfileId])

  const yaMarque = miAsistente?.presente === true
  const esAsistenteActivo = miAsistente !== null && yaMarque
  const puedeEditarTablero = puedeEditar || esAsistenteActivo

  const totalPresentes = asistentes.filter((a) => a.presente).length
  const totalAsistentes = asistentes.length

  function refrescar() {
    // Re-fetch del server component (todo el árbol de la página)
    router.refresh()
  }

  async function abrirArchivo(url: string | null) {
    if (!url) return
    const result = await getSignedUrl(url)
    if ("error" in result) {
      alert(`Error abriendo archivo: ${result.error}`)
      return
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer")
  }

  function handleEliminarReunion() {
    if (
      !confirm(
        `¿Eliminar la reunión del ${formatFechaCorta(
          detalle.fecha,
        )}? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarReunion(detalle.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      router.push("/reuniones")
    })
  }

  async function handleMarcarMiAsistencia() {
    const previos = asistentes
    setAsistentes((prev) =>
      prev.map((a) =>
        a.profile_id === currentProfileId ? { ...a, presente: true } : a,
      ),
    )
    const result = await marcarMiAsistencia(detalle.id)
    if ("error" in result) {
      setAsistentes(previos)
      alert(`Error: ${result.error}`)
      return
    }
    refrescar()
  }

  async function handleQuitarAsistente(a: ReunionAsistenteConProfile) {
    if (!confirm(`¿Quitar a ${a.profile_nombre} de la lista?`)) return
    const previos = asistentes
    setAsistentes((prev) => prev.filter((x) => x.id !== a.id))
    const result = await quitarAsistente(a.id)
    if ("error" in result) {
      setAsistentes(previos)
      alert(`Error: ${result.error}`)
      return
    }
    refrescar()
  }

  function handleAsistenteAgregado(nuevo: ReunionAsistenteConProfile) {
    setAsistentes((prev) => [...prev, nuevo])
    refrescar()
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/reuniones"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Volver a Reuniones · {tipoLabel}
        </Link>
      </div>

      {/* Header — fijo al scrollear, con el contador TOR al medio */}
      <div className="sticky top-14 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 p-4 shadow-sm md:top-0">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            {tipoLabel}
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-bold capitalize text-slate-900">
            <Calendar className="size-6 text-slate-600" />
            {formatFechaLarga(detalle.fecha)}
          </h1>
        </div>
        <TorCountdown reunionId={detalle.id} />
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditarOpen(true)}
              title="Cambiar la fecha de esta reunión (ej. si el día cae feriado)"
            >
              <Calendar className="mr-2 size-4" />
              Reprogramar fecha
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={handleEliminarReunion}
            >
              <Trash2 className="mr-2 size-4" />
              Eliminar reunión
            </Button>
          </div>
        )}
      </div>
      {puedeEditar && (
        <EditarReunionDialog
          open={editarOpen}
          onOpenChange={setEditarOpen}
          reunion={detalle as unknown as Reunion}
          onSaved={() => router.refresh()}
        />
      )}

      {/* ASISTENCIA */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Asistencia
            <Badge className="border-slate-200 bg-slate-100 text-base font-semibold text-slate-800 hover:bg-slate-100">
              {totalPresentes} / {totalAsistentes} presentes
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {miAsistente && yaMarque && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-800">
                Marcaste asistencia
              </p>
            </div>
          )}
          {miAsistente && !yaMarque && (
            <Button
              type="button"
              size="lg"
              onClick={handleMarcarMiAsistencia}
              className="w-full bg-emerald-600 text-base hover:bg-emerald-700"
            >
              <Hand className="mr-2 size-5" />
              Marcar mi asistencia
            </Button>
          )}

          {asistentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin asistentes registrados.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-200/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-1.5">Integrantes</th>
                    <th className="w-28 px-3 py-1.5 text-center">Asistencia</th>
                    {puedeEditar && <th className="w-14 px-2 py-1.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {asistentes.map((a) => (
                    <AsistenteRow
                      key={a.id}
                      asistente={a}
                      puedeEditar={puedeEditar}
                      onQuitar={handleQuitarAsistente}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {puedeEditar && (
            <AgregarAsistenteAdHoc
              reunionId={detalle.id}
              responsables={responsables}
              yaAgregados={yaAgregadosSet}
              onAdded={handleAsistenteAgregado}
            />
          )}
        </CardContent>
      </Card>

      {/* ETAPA 1: SEGURIDAD */}
      <EtapaSeguridad
        fechaReunion={detalle.fecha}
        reunionId={detalle.id}
        puedeEditar={puedeEditar}
        currentProfileId={currentProfileId}
        currentRole={currentRole}
      />

      {/* ETAPA 2: TABLERO DE CONTROL */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-blue-900">
            <BarChart3 className="size-5 text-blue-600" />
            Etapa 2 — Tablero de control
            {indicadoresMes && (
              <span className="text-sm font-normal capitalize text-muted-foreground">
                · {nombreMes(indicadoresMes.mes)} {indicadoresMes.anio}
              </span>
            )}
            {cargandoIndicadores && (
              <span className="text-xs font-normal text-muted-foreground">
                actualizando…
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {muestraToggleSucursal && puedeEditar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={sincronizarReciente}
                disabled={sincronizando}
                title="Descarga de Foxtrot los últimos 4 días"
              >
                <RefreshCw
                  className={cn("mr-2 size-4", sincronizando && "animate-spin")}
                />
                {sincronizando ? "Sincronizando…" : "Sincronizar (4 días)"}
              </Button>
            )}
            {muestraToggleSucursal && puedeEditar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={sincronizarChecks}
                disabled={sincronizandoChecks}
                title="Resincroniza los checklists de Cloudfleet de todo el mes"
              >
                <RefreshCw
                  className={cn(
                    "mr-2 size-4",
                    sincronizandoChecks && "animate-spin",
                  )}
                />
                {sincronizandoChecks ? "Sincronizando…" : "Sincronizar checks"}
              </Button>
            )}
            {puedeEditar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpenConfigInd(true)}
              >
                <Settings className="mr-2 size-4" />
                Configurar indicadores
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {muestraToggleSucursal && (
            <div className="flex flex-wrap items-center gap-1.5 border-b px-4 pb-3 text-xs">
              <span className="mr-1 font-medium text-slate-600">Sucursal:</span>
              {(
                [
                  { key: "todo", label: "Todas" },
                  { key: "eldorado", label: "Eldorado" },
                  { key: "iguazu", label: "Iguazú" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => cambiarSucursal(opt.key)}
                  disabled={cargandoIndicadores}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition disabled:opacity-50",
                    sucursalSel === opt.key
                      ? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {opt.label}
                </button>
              ))}
              {sucursalSel !== "todo" && (
                <span className="ml-2 text-[10px] italic text-slate-500">
                  Ausentismo se muestra siempre total
                </span>
              )}
              {(syncMsg || syncChecksMsg) && (
                <span className="ml-auto flex flex-col items-end gap-0.5 text-[11px]">
                  {syncMsg && (
                    <span
                      className={cn(
                        syncMsg.startsWith("Error")
                          ? "text-red-600"
                          : "text-emerald-600",
                      )}
                    >
                      {syncMsg}
                    </span>
                  )}
                  {syncChecksMsg && (
                    <span
                      className={cn(
                        syncChecksMsg.startsWith("Error")
                          ? "text-red-600"
                          : "text-emerald-600",
                      )}
                    >
                      {syncChecksMsg}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          {indicadoresMes && indicadoresMes.indicadores.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b px-4 pb-3 text-xs">
              <span className="mr-1 font-medium text-slate-600">Vista:</span>
              <button
                type="button"
                onClick={() => setVistaTablero("hasta_hoy")}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition",
                  vistaTablero === "hasta_hoy"
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                Hasta hoy
              </button>
              {semanasDelMes.length > 1 &&
                semanasDelMes.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setVistaTablero(s.key)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition",
                      vistaTablero === s.key
                        ? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setVistaTablero("mes_completo")}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition",
                  vistaTablero === "mes_completo"
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                Mes completo
              </button>
            </div>
          )}
          {!indicadoresMes ||
          indicadoresMes.indicadores.length === 0 ||
          indicadoresMes.fechas.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Sin indicadores configurados.
              {puedeEditar && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-medium text-blue-600 hover:underline"
                    onClick={() => setOpenConfigInd(true)}
                  >
                    Configurar el primero
                  </button>
                </>
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white">
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 w-[160px] min-w-[160px] max-w-[160px] bg-white px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Indicador
                    </th>
                    <th className="sticky left-[160px] z-10 w-[60px] min-w-[60px] max-w-[60px] bg-white px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Unidad
                    </th>
                    <th className="sticky left-[220px] z-10 w-[84px] min-w-[84px] max-w-[84px] bg-white px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Target
                    </th>
                    <th className="sticky left-[304px] z-10 w-[70px] min-w-[70px] max-w-[70px] border-r bg-white px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      MTD
                    </th>
                    {columnasTablero.map((col) => {
                      if (col.kind === "total") {
                        const abierta = semanasExpandidas.has(col.semana.key)
                        return (
                          <th
                            key={`th-total-${col.semana.key}`}
                            className="border-x border-violet-200 bg-violet-50 px-2 py-1 text-center text-xs font-semibold text-violet-900"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSemana(col.semana.key)}
                              className="flex w-full items-center justify-center gap-1 rounded hover:bg-violet-100 focus:outline-none"
                              title={
                                abierta
                                  ? "Ocultar los días de la semana"
                                  : "Ver los días de la semana"
                              }
                            >
                              {abierta ? (
                                <ChevronLeft className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                              <span>{col.semana.label}</span>
                            </button>
                          </th>
                        )
                      }
                      const f = col.f
                      const esHoy = f === detalle.fecha
                      const dom = esFinDeSemana(f)
                      return (
                        <th
                          key={f}
                          className={cn(
                            "px-2 py-1 text-center text-xs font-medium",
                            esHoy && "bg-blue-100",
                            dom && "bg-slate-100 text-slate-400",
                          )}
                        >
                          <div className="font-semibold">{diaDelMes(f)}</div>
                          <div className="text-[9px] font-normal text-muted-foreground">
                            {diaSem(f)}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {indicadoresMes.indicadores.map((ind) => (
                    <tr key={ind.id} className="border-b last:border-0">
                      <td className="sticky left-0 w-[160px] min-w-[160px] max-w-[160px] truncate bg-white px-2 py-2 align-middle text-sm font-medium text-slate-900" title={ind.nombre}>
                        {ind.nombre}
                      </td>
                      <td className="sticky left-[160px] w-[60px] min-w-[60px] max-w-[60px] bg-white px-2 py-2 align-middle text-xs text-muted-foreground">
                        {ind.unidad ?? "—"}
                      </td>
                      <td className="sticky left-[220px] w-[84px] min-w-[84px] max-w-[84px] bg-white px-1 py-1 align-middle text-xs">
                        <TargetInput
                          indicadorId={ind.id}
                          meta={ind.meta}
                          mejorSi={ind.mejor_si}
                          puedeEditar={puedeEditar && !ind.auto}
                          onChanged={refrescar}
                        />
                      </td>
                      <td className="sticky left-[304px] w-[70px] min-w-[70px] max-w-[70px] border-r bg-white px-2 py-2 text-right align-middle text-sm font-bold tabular-nums text-blue-700">
                        {ind.mtd_texto != null
                          ? ind.mtd_texto
                          : ind.mtd == null
                            ? "—"
                            : formatearValor(ind.mtd)}
                      </td>
                      {columnasTablero.map((col) => {
                        if (col.kind === "total") {
                          const tot = totalSemanal(ind, col.semana.fechas)
                          const esPct = ind.unidad === "%"
                          return (
                            <td
                              key={`td-total-${col.semana.key}`}
                              className="border-x border-violet-200 bg-violet-50 px-2 py-1 text-center align-middle text-sm font-bold tabular-nums text-violet-900"
                            >
                              {tot == null
                                ? "—"
                                : esPct
                                  ? `${formatearValor(tot)}%`
                                  : formatearValor(tot)}
                            </td>
                          )
                        }
                        const f = col.f
                        const cell = ind.valores[f] ?? null
                        const esHoy = f === detalle.fecha
                        const dom = esFinDeSemana(f)
                        const reunionIdEnFecha =
                          indicadoresMes.reuniones_por_fecha[f] ?? null
                        // Sin objetivo (meta vacía) → toda la fila en tono
                        // azulado (no hay target). Con objetivo → color
                        // condicional por valor (igual que las automáticas).
                        const tone =
                          ind.meta == null
                            ? "bg-blue-50 text-blue-700"
                            : colorPorObjetivo(
                                cell?.valor,
                                ind.meta,
                                ind.mejor_si,
                              )

                        // Filas editables HACIA ATRÁS (Productividad/Errores/
                        // Pérdidas): cada día <= la fecha de la reunión es una
                        // celda editable por override (pisa el auto). El futuro
                        // se muestra como "—". Tiene prioridad sobre auto/manual.
                        if (ind.editable_historico) {
                          if (f > detalle.fecha) {
                            return (
                              <td
                                key={f}
                                className={cn(
                                  "px-2 py-1 text-center align-middle text-sm text-slate-300",
                                  esHoy && "bg-blue-50",
                                  dom && "bg-slate-50",
                                )}
                              >
                                —
                              </td>
                            )
                          }
                          return (
                            <td
                              key={f}
                              className={cn(
                                "px-1 py-1 align-middle",
                                tone,
                                !tone && esHoy && "bg-blue-50",
                                !tone && dom && "bg-slate-50",
                              )}
                            >
                              <OverrideValorInput
                                indicadorKey={ind.id}
                                fecha={f}
                                reunionId={detalle.id}
                                puedeEditar={puedeEditarTablero}
                                valor={cell?.valor ?? null}
                                autoValor={cell?.auto_valor ?? null}
                                esOverride={cell?.es_override ?? false}
                                onChanged={refrescar}
                              />
                            </td>
                          )
                        }

                        // Filas AUTO (LTI/TRI desde reportes_seguridad, Rechazos %
                        // desde rechazos+ventas_diarias): se muestran como read-only,
                        // independientemente de si hubo reunión. Sólo hasta `f <= fecha`
                        // (no anticipamos futuro).
                        // LTI/TRI ocultan 0 (días sin accidente). Rechazos % usa
                        // `mostrar_cero` para que los días con 0% también se vean.
                        if (ind.auto) {
                          const valor = cell?.valor ?? null
                          const esLtiTri =
                            ind.id === "auto_lti" || ind.id === "auto_tri"
                          const valorValido =
                            valor != null && Number.isFinite(valor) && f <= detalle.fecha
                          // LTI/TRI muestran 0 (días sin accidente) como el resto
                          // de indicadores con `mostrar_cero`.
                          const muestra =
                            valorValido &&
                            (ind.mostrar_cero || esLtiTri ? true : valor! > 0)
                          const esPct = ind.unidad === "%"
                          // Color por polaridad de la meta (mejor_si). Si no hay
                          // mejor_si ni meta (ej. LTI/TRI), se pinta en rojo cuando
                          // hay valor (mismo comportamiento histórico).
                          let colorClass = "bg-red-50 font-semibold text-red-700"
                          if (ind.mejor_si && ind.meta != null && valor != null) {
                            const cumple =
                              ind.mejor_si === "menor"
                                ? valor <= ind.meta
                                : valor >= ind.meta
                            colorClass = cumple
                              ? "bg-emerald-50 font-semibold text-emerald-700"
                              : "bg-red-50 font-semibold text-red-700"
                          }
                          // Camiones a la calle: es un conteo neutro, no un
                          // accidente — no se pinta de rojo.
                          if (
                            ind.id === "auto_camiones_calle" ||
                            ind.id === "auto_km_recorridos" ||
                            ind.id === "auto_horas_calle"
                          ) {
                            colorClass = "font-medium text-slate-700"
                          }
                          // LTI/TRI: un 0 (día sin accidente) en gris neutro,
                          // el rojo se reserva para los días con evento.
                          if (esLtiTri && valor === 0) {
                            colorClass = "text-slate-300"
                          }
                          // Checklist "X/Y": verde si todas aprobadas, ámbar
                          // si hubo algún rechazo en las liberaciones del día.
                          if (ind.id === "auto_checklist") {
                            const m = (cell?.texto ?? "").match(/^(\d+)\/(\d+)$/)
                            colorClass =
                              m && m[1] === m[2]
                                ? "bg-emerald-50 font-semibold text-emerald-700"
                                : "bg-amber-50 font-semibold text-amber-700"
                          }
                          const esRechazosPct = ind.id === "auto_rechazos_pct"
                          const esBultosVendidos = ind.id === "auto_bultos_vendidos"
                          const esHlVendidos = ind.id === "auto_hl_vendidos"
                          const esTml = ind.id === "auto_tml"
                          const esChecklist = ind.id === "auto_checklist"
                          const esChecks =
                            ind.id === "auto_checks_aprobados" ||
                            ind.id === "auto_checks_rechazados" ||
                            ind.id === "auto_adherencia_checks"
                          const esKm = ind.id === "auto_km_recorridos"
                          const esHorasCalle = ind.id === "auto_horas_calle"
                          const esAperturaPicking =
                            ind.id === "auto_productividad_picking" ||
                            ind.id === "auto_errores_picking"
                          const esAusentismo = ind.id === "auto_ausentismo"
                          const esOB = ind.id === "auto_ocupacion_bodega"
                          const clickable =
                            (esRechazosPct ||
                              esBultosVendidos ||
                              esHlVendidos ||
                              esTml ||
                              esChecklist ||
                              esChecks ||
                              esKm ||
                              esHorasCalle ||
                              esAperturaPicking ||
                              esAusentismo ||
                              esOB) &&
                            muestra
                          const onCellClick = () => {
                            if (esRechazosPct) setRechazosDetalleFecha(f)
                            else if (esBultosVendidos) setVentasBultosFecha(f)
                            else if (esHlVendidos) setVentasHlFecha(f)
                            else if (esTml) setTmlDetalleFecha(f)
                            else if (esChecklist) setChecklistDetalleFecha(f)
                            else if (esChecks) setChecksDetalleFecha(f)
                            else if (esKm) setKmDetalleFecha(f)
                            else if (esHorasCalle) setHorasCalleFecha(f)
                            else if (esAperturaPicking) setAperturaPickingFecha(f)
                            else if (esAusentismo) setAusentismoFecha(f)
                            else if (esOB) setObDetalleFecha(f)
                          }
                          const contenido = muestra
                            ? cell?.texto != null
                              ? cell.texto
                              : esPct
                                ? `${formatearValor(valor!)}%`
                                : formatearValor(valor!)
                            : "—"
                          return (
                            <td
                              key={f}
                              className={cn(
                                "px-2 py-1 text-center align-middle text-sm tabular-nums",
                                muestra ? colorClass : "text-slate-300",
                                esHoy && !muestra && "bg-blue-50",
                                dom && !muestra && "bg-slate-50",
                              )}
                            >
                              {clickable ? (
                                <button
                                  type="button"
                                  onClick={onCellClick}
                                  className="w-full cursor-pointer rounded px-1 py-0.5 underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  title="Ver detalle del día"
                                >
                                  {contenido}
                                </button>
                              ) : (
                                contenido
                              )}
                            </td>
                          )
                        }

                        // Día sin reunión (futuro o no permitido)
                        if (reunionIdEnFecha === null) {
                          return (
                            <td
                              key={f}
                              className={cn(
                                "px-2 py-1 text-center align-middle text-sm text-muted-foreground",
                                esHoy && "bg-blue-50",
                                dom && "bg-slate-50",
                              )}
                            >
                              —
                            </td>
                          )
                        }

                        // Es la reunión actual → editable inline
                        if (reunionIdEnFecha === detalle.id) {
                          return (
                            <td
                              key={f}
                              className={cn(
                                "px-1 py-1 align-middle",
                                tone ?? (esHoy ? "bg-blue-100" : "bg-blue-50"),
                              )}
                            >
                              <ValorInput
                                indicadorId={ind.id}
                                initial={cell?.valor ?? null}
                                reunionId={detalle.id}
                                puedeEditar={puedeEditarTablero}
                                onChanged={refrescar}
                              />
                            </td>
                          )
                        }

                        // Otra reunión → read-only
                        return (
                          <td
                            key={f}
                            className={cn(
                              "px-2 py-1 text-center align-middle text-sm tabular-nums",
                              tone ?? "text-slate-500",
                              !tone && esHoy && "bg-blue-50",
                              !tone && dom && "bg-slate-50",
                            )}
                            title={`Cargado en otra reunión (${formatFechaCorta(f)})`}
                          >
                            {cell?.valor == null
                              ? "—"
                              : formatearValor(cell.valor)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ETAPA 3: ACTION LOG */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-emerald-900">
            <ListTodo className="size-5 text-emerald-600" />
            Etapa 3 — Action Log ({actividades.length})
          </CardTitle>
          {puedeEditar && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setActividadEditando(null)
                setOpenActForm(true)
              }}
            >
              <Plus className="mr-2 size-4" />
              Nueva actividad
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {actividades.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Sin actividades registradas.
              </p>
              {puedeEditar && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setActividadEditando(null)
                    setOpenActForm(true)
                  }}
                >
                  <Plus className="mr-2 size-4" />
                  Crear primera
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b px-4 pb-3 text-xs">
                <span className="mr-1 font-medium text-slate-600">Estado:</span>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("todas")}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition",
                    filtroEstado === "todas"
                      ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  Todas ({actividades.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("no_comenzada")}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition",
                    filtroEstado === "no_comenzada"
                      ? "border-slate-500 bg-slate-100 font-semibold text-slate-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  No comenzadas ({conteosActividades.no_comenzada})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("en_curso")}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition",
                    filtroEstado === "en_curso"
                      ? "border-amber-500 bg-amber-50 font-semibold text-amber-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  En curso ({conteosActividades.en_curso})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("cerrada")}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition",
                    filtroEstado === "cerrada"
                      ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  Cerradas ({conteosActividades.cerrada})
                </button>
              </div>
              {actividadesFiltradas.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Ninguna actividad coincide con este filtro.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setFiltroEstado("todas")}
                  >
                    Ver todas
                  </Button>
                </div>
              ) : (
                <ul className="border-y bg-white">
                  {actividadesFiltradas.map((act) => (
                    <ActividadListItem
                      key={act.id}
                      actividad={act}
                      reunionId={detalle.id}
                      puedeEditar={puedeEditar}
                      currentProfileId={currentProfileId}
                      onEdit={() => {
                        setActividadEditando(act)
                        setOpenActForm(true)
                      }}
                      onAbrirDetalle={(estadoInicial) =>
                        setActividadDetalle({ actividad: act, estadoInicial })
                      }
                      onActualizada={aplicarActividadLocal}
                      onEliminada={eliminarActividadLocal}
                      onAbrirArchivo={abrirArchivo}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Subdialogs */}
      <ActividadFormDialog
        open={openActForm}
        onOpenChange={(o) => {
          setOpenActForm(o)
          if (!o) setActividadEditando(null)
        }}
        reunionId={detalle.id}
        reunionTipo={detalle.tipo}
        actividad={actividadEditando}
        responsables={responsables}
        sectoresAlmacen={sectoresAlmacen}
        vehiculos={vehiculos}
        rubrosMantenimiento={rubrosMantenimiento}
        onSaved={aplicarActividadLocal}
      />
      <ConfigurarIndicadoresDialog
        open={openConfigInd}
        onOpenChange={setOpenConfigInd}
        tipo={detalle.tipo}
        tipoLabel={tipoLabel}
        onSaved={refrescar}
      />

      {actividadDetalle && (
        <DetalleActividadDialog
          key={actividadDetalle.actividad.id}
          open={true}
          onOpenChange={(o) => {
            if (!o) setActividadDetalle(null)
          }}
          actividad={actividadDetalle.actividad}
          estadoInicial={actividadDetalle.estadoInicial}
          puedeResponder={
            actividadDetalle.actividad.estado !== "cerrada" &&
            (puedeEditar ||
              (currentProfileId !== null &&
                actividadDetalle.actividad.responsable_id ===
                  currentProfileId))
          }
          onSaved={aplicarActividadLocal}
        />
      )}

      <RechazosDetalleDiaDialog
        open={rechazosDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setRechazosDetalleFecha(null)
        }}
        fecha={rechazosDetalleFecha}
      />

      <VentasDetalleDiaDialog
        open={ventasBultosFecha !== null}
        onOpenChange={(o) => {
          if (!o) setVentasBultosFecha(null)
        }}
        fecha={ventasBultosFecha}
        metrica="bultos"
      />

      <VentasDetalleDiaDialog
        open={ventasHlFecha !== null}
        onOpenChange={(o) => {
          if (!o) setVentasHlFecha(null)
        }}
        fecha={ventasHlFecha}
        metrica="hl"
      />

      <TmlDetalleDiaDialog
        open={tmlDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setTmlDetalleFecha(null)
        }}
        fecha={tmlDetalleFecha}
      />

      <OcupacionBodegaDetalleDiaDialog
        open={obDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setObDetalleFecha(null)
        }}
        fecha={obDetalleFecha}
      />

      <AperturaPickingDetalleDiaDialog
        open={aperturaPickingFecha !== null}
        onOpenChange={(o) => {
          if (!o) setAperturaPickingFecha(null)
        }}
        reunionId={detalle.id}
        fecha={aperturaPickingFecha}
        puedeEditar={puedeEditarTablero}
        onChange={refrescar}
      />

      <AusentismoDetalleDiaDialog
        open={ausentismoFecha !== null}
        onOpenChange={(o) => {
          if (!o) setAusentismoFecha(null)
        }}
        fecha={ausentismoFecha}
      />

      <ChecklistDetalleDiaDialog
        open={checklistDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setChecklistDetalleFecha(null)
        }}
        fecha={checklistDetalleFecha}
      />

      <ChecksDetalleDiaDialog
        open={checksDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setChecksDetalleFecha(null)
        }}
        fecha={checksDetalleFecha}
        sucursal={sucursalSel}
      />

      <KmRecorridosDetalleDiaDialog
        open={kmDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setKmDetalleFecha(null)
        }}
        fecha={kmDetalleFecha}
      />

      <HorasCalleDetalleDiaDialog
        open={horasCalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setHorasCalleFecha(null)
        }}
        fecha={horasCalleFecha}
      />
    </div>
  )
}
