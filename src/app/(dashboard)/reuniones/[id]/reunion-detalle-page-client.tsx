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
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Eye,
  FileDown,
  Gauge,
  Hand,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Star,
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
  refreshIndicadoresLogistica,
  setIndicadorValor,
} from "@/actions/reuniones"
import { IS_MISIONES } from "@/lib/empresa"
import { ActividadFormDialog } from "@/components/reuniones/actividad-form-dialog"
import { ConfigurarIndicadoresDialog } from "@/components/reuniones/configurar-indicadores-dialog"
import { DetalleActividadDialog } from "@/components/reuniones/detalle-actividad-dialog"
import { EtapaSeguridad } from "@/components/reuniones/etapa-seguridad"
import { ContadorReunion } from "@/components/reuniones/contador-reunion"
import { SeccionRoturasCalle } from "@/components/reuniones/seccion-roturas-calle"
import { SeccionRechazos } from "@/components/reuniones/seccion-rechazos"
import { TareasOperariosBloque } from "@/components/reuniones/tareas-operarios-bloque"
import { SeccionAvanceVenta } from "@/components/reuniones/seccion-avance-venta"
import { SeccionFrescura } from "@/components/reuniones/seccion-frescura"
import { SeccionSobrestock } from "@/components/reuniones/seccion-sobrestock"
import {
  SeccionSla,
  SLA_CODIGOS_REUNION_OPERATIVA,
} from "@/components/reuniones/seccion-sla"
import { TlpDetalleDiaDialog } from "@/components/reuniones/tlp-detalle-dia-dialog"
import { WnpDetalleDiaDialog } from "@/components/reuniones/wnp-detalle-dia-dialog"
import { SeccionAccionesComerciales } from "@/components/reuniones/seccion-acciones-comerciales"
import {
  SeccionFlotaRuteo,
  SECCION_FLOTA_RUTEO,
} from "@/components/reuniones/seccion-flota-ruteo"
import {
  SeccionPedidosProblemas,
  SECCION_PEDIDOS_PROBLEMAS,
} from "@/components/reuniones/seccion-pedidos-problemas"
import { SeccionDesviosPresupuesto } from "@/components/reuniones/seccion-desvios-presupuesto"
import { SeccionGaleriaFotos } from "@/components/reuniones/seccion-galeria-fotos"
import {
  SeccionPeriodosCriticos,
  SECCION_PERIODOS_CRITICOS,
} from "@/components/reuniones/seccion-periodos-criticos"
import { RechazosDetalleDiaDialog } from "@/components/reuniones/rechazos-detalle-dia-dialog"
import { VentasDetalleDiaDialog } from "@/components/reuniones/ventas-detalle-dia-dialog"
import { TmlDetalleDiaDialog } from "@/components/reuniones/tml-detalle-dia-dialog"
import { OcupacionBodegaDetalleDiaDialog } from "@/components/reuniones/ocupacion-bodega-detalle-dia-dialog"
import { AperturaPickingDetalleDiaDialog } from "@/components/reuniones/apertura-picking-detalle-dia-dialog"
import { AperturaMaquinistasDetalleDiaDialog } from "@/components/reuniones/apertura-maquinistas-detalle-dia-dialog"
import { AusentismoDetalleDiaDialog } from "@/components/reuniones/ausentismo-detalle-dia-dialog"
import { ChecklistDetalleDiaDialog } from "@/components/reuniones/checklist-detalle-dia-dialog"
import { KmRecorridosDetalleDiaDialog } from "@/components/reuniones/km-recorridos-detalle-dia-dialog"
import { DqiPatentesDialog } from "@/components/reuniones/dqi-patentes-dialog"
import { FoxtrotKpiDetalleDiaDialog } from "@/components/reuniones/foxtrot-kpi-detalle-dia-dialog"
import type { FoxtrotKpiId } from "@/lib/foxtrot/matinal-kpi-types"
import { HorasCalleDetalleDiaDialog } from "@/components/reuniones/horas-calle-detalle-dia-dialog"
import { WarehousePerdidasDetalleDiaDialog } from "@/components/reuniones/warehouse-perdidas-detalle-dia-dialog"
import type {
  EstadoReunionActividad,
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
}

interface IndicadorMesItem {
  id: string
  nombre: string
  unidad: string | null
  meta: number | null
  gatillo?: number | null
  orden: number
  agregacion: AgregacionIndicador
  valores: Record<string, IndicadorMesCellData | null>
  mtd: number | null
  mtd_texto?: string | null
  auto?: boolean
  mostrar_cero?: boolean
  mejor_si?: "menor" | "mayor"
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
  presupuesto: "Presupuesto",
  mantenimiento: "Mantenimiento",
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

function esLunes(iso: string): boolean {
  return new Date(iso + "T12:00:00").getDay() === 1
}

/**
 * Último martes del mes: la reunión Ventas-Logística es semanal (todos los
 * martes), y la del último martes es además la revisión MENSUAL de períodos
 * críticos que pide el manual DPO (R3.4.2). No es una reunión aparte: es la
 * misma, con un bloque más.
 *
 * Se resuelve por fecha y no por configuración porque el tipo de reunión ya se
 * crea todos los martes; lo único que cambia es qué se muestra ese día.
 */
function esUltimoMartesDelMes(iso: string): boolean {
  const d = new Date(iso + "T12:00:00")
  if (d.getDay() !== 2) return false
  // Si sumarle una semana cae en otro mes, es el último martes.
  const masUnaSemana = new Date(d)
  masUnaSemana.setDate(d.getDate() + 7)
  return masUnaSemana.getMonth() !== d.getMonth()
}

function formatearValor(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)
}

// Indicadores que usan semáforo de 3 zonas en las celdas diarias
// (verde mejor que target · amarillo entre target y gatillo · rojo peor que
// gatillo). El resto de indicadores conserva su coloreo histórico de 2 zonas.
const SEMAFORO_3_ZONAS = new Set([
  "auto_wqi",
  "auto_wnp",
  "auto_productividad_picking",
  "auto_errores_picking",
  "auto_ausentismo",
  // Tiempo en ruta (Matinal de Distribución): target y gatillo se cargan
  // desde el diálogo de configuración de indicadores.
  "auto_fx_tiempo_ruta",
  // TLP: target y gatillo salen del nodo del Árbol del Sueño.
  "auto_tlp",
])

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
// Asistente row
// =============================================
function AsistenteCard({
  asistente,
  puedeEditar,
  onChanged,
}: {
  asistente: ReunionAsistenteConProfile
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()

  function handleQuitar() {
    if (!confirm(`¿Quitar a ${asistente.profile_nombre} de la lista?`)) return
    startTransition(async () => {
      const result = await quitarAsistente(asistente.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      onChanged()
    })
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        asistente.presente
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {asistente.presente ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <span className="inline-block size-3.5 shrink-0 rounded-full border border-slate-300 bg-white" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={`truncate text-sm ${
                asistente.presente
                  ? "font-medium text-slate-900"
                  : "text-slate-600"
              }`}
            >
              {asistente.profile_nombre}
            </p>
            {asistente.origen === "preruta" && (
              <span
                className="shrink-0 rounded-sm bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-700"
                title="Registrado automáticamente desde el check-in de Reunión Pre-Ruta"
              >
                Pre-Ruta
              </span>
            )}
          </div>
          {!asistente.presente && asistente.justificacion && (
            <p
              className="truncate text-xs text-muted-foreground"
              title={asistente.justificacion}
            >
              {asistente.justificacion}
            </p>
          )}
        </div>
      </div>
      {puedeEditar && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-red-600 hover:text-red-700"
          onClick={handleQuitar}
          disabled={pending}
          title="Quitar"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
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
  onAdded: () => void
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
    startTransition(async () => {
      const result = await agregarAsistente(reunionId, seleccionado)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setSeleccionado("")
      onAdded()
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
          "h-8 w-20 text-center text-sm",
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
// Actividad row
// =============================================
function ActividadListItem({
  actividad,
  reunionId,
  puedeEditar,
  currentProfileId,
  onEdit,
  onAbrirDetalle,
  onChanged,
  onAbrirArchivo,
}: {
  actividad: ReunionActividadConResponsable
  reunionId: string
  puedeEditar: boolean
  currentProfileId: string | null
  onEdit: () => void
  onAbrirDetalle: (estadoInicial?: EstadoReunionActividad) => void
  onChanged: () => void
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
      onChanged()
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
      onChanged()
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
  const refrescarConScroll = useRefrescarConScroll()
  const [, startTransition] = useTransition()

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
      refrescarConScroll()
    } catch (e) {
      setSyncMsg(
        `Error: ${e instanceof Error ? e.message : "no se pudo sincronizar"}`,
      )
    } finally {
      setSincronizando(false)
    }
  }

  // Actualización manual de la serie diaria del depósito — solo Pampeana/
  // logística. Fuerza el recálculo en deposito-esteban (roturas, faltantes y
  // errores de picking cargados después de que el cache quedó armado).
  const muestraActualizarDatos = !IS_MISIONES && detalle.tipo === "logistica"
  const [actualizandoDatos, setActualizandoDatos] = useState(false)
  const [actualizarMsg, setActualizarMsg] = useState<string | null>(null)
  const actualizarDatosDeposito = async () => {
    if (actualizandoDatos) return
    setActualizandoDatos(true)
    setActualizarMsg(null)
    try {
      const res = await refreshIndicadoresLogistica(detalle.id)
      if ("data" in res) {
        setIndicadoresMes(res.data)
        refrescarConScroll()
      } else {
        setActualizarMsg(`Error: ${res.error}`)
      }
    } catch (e) {
      setActualizarMsg(
        `Error: ${e instanceof Error ? e.message : "no se pudo actualizar"}`,
      )
    } finally {
      setActualizandoDatos(false)
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
  // Detalle del día al hacer click en celda WQI / Roturas / Faltantes (warehouse):
  // popover con bultos vendidos + pérdidas del día (blob precocido warehouse-dia-detalle).
  const [wqiDetalleFecha, setWqiDetalleFecha] = useState<string | null>(null)
  // Detalle del día seleccionado al hacer click en celda TML
  const [tmlDetalleFecha, setTmlDetalleFecha] = useState<string | null>(null)
  const [obDetalleFecha, setObDetalleFecha] = useState<string | null>(null)
  const [tlpDetalleFecha, setTlpDetalleFecha] = useState<string | null>(null)
  const [wnpDetalleFecha, setWnpDetalleFecha] = useState<string | null>(null)
  // Detalle del día al hacer click en la celda Productividad de picking:
  // abre el sub-cuadro con los 3 operadores Troli/Galvez/Ovejero. La fila
  // Precisión de picking NO abre este detalle (es un valor global del día).
  const [aperturaPickingFecha, setAperturaPickingFecha] = useState<string | null>(
    null,
  )

  // Detalle del día al hacer click en la celda Productividad maquinistas
  // (solo warehouse): abre el sub-cuadro con el despacho por maquinista.
  const [aperturaMaquinistasFecha, setAperturaMaquinistasFecha] = useState<
    string | null
  >(null)

  // Detalle del día al hacer click en la celda Ausentismo: lista de personas
  // ausentes / con licencia médica de los sectores Depósito + Distribución.
  const [ausentismoFecha, setAusentismoFecha] = useState<string | null>(null)

  // Detalle del día al hacer click en la celda del indicador Checklist:
  // unidades liberadas con sus ítems en falla + las que salieron sin checklist.
  const [checklistDetalleFecha, setChecklistDetalleFecha] = useState<
    string | null
  >(null)
  // Qué grupo abrió el detalle: la grilla tiene una fila por tipo de unidad.
  const [checklistDetalleGrupo, setChecklistDetalleGrupo] = useState<
    "camiones" | "autoelevadores"
  >("camiones")

  // Detalle del día al hacer click en la celda del indicador Km recorridos:
  // km por camión (odómetro de retorno − odómetro de liberación).
  const [kmDetalleFecha, setKmDetalleFecha] = useState<string | null>(null)
  const [openDqiPatentes, setOpenDqiPatentes] = useState(false)

  // Detalle del día de un KPI de Foxtrot (matinal Pampeana): valor del día +
  // desglose por patente (cruce chofer↔egreso TML).
  const [fxKpiDetalle, setFxKpiDetalle] = useState<{
    fecha: string
    kpiId: FoxtrotKpiId
  } | null>(null)

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
    if (vistaTablero === "mes_completo") return indicadoresMes.fechas
    if (vistaTablero === "hasta_hoy") {
      return indicadoresMes.fechas.filter((f) => f <= detalle.fecha)
    }
    // semana_X
    const sem = semanasDelMes.find((s) => s.key === vistaTablero)
    return sem ? sem.fechas : indicadoresMes.fechas.filter((f) => f <= detalle.fecha)
  }, [indicadoresMes, vistaTablero, detalle.fecha, semanasDelMes])

  // Fuente de actividades (defensiva: actividades nuevo, compromisos legacy)
  const actividadesAll: ReunionActividadConResponsable[] = useMemo(() => {
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

  // Action Log general (Etapa 2) = actividades sin sección. Las de cada sección
  // (ej. Rechazos) se muestran dentro de su propia sección.
  const actividades = useMemo(
    () => actividadesAll.filter((a) => !a.seccion),
    [actividadesAll],
  )
  const actividadesAvanceVenta = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "avance_venta"),
    [actividadesAll],
  )
  const actividadesRechazos = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "rechazos"),
    [actividadesAll],
  )
  const actividadesFrescura = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "frescura"),
    [actividadesAll],
  )
  const actividadesSobrestock = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "sobrestock"),
    [actividadesAll],
  )
  const actividadesSla = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "sla"),
    [actividadesAll],
  )
  const actividadesAccCom = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "acciones_comerciales"),
    [actividadesAll],
  )
  const actividadesFlotaRuteo = useMemo(
    () => actividadesAll.filter((a) => a.seccion === SECCION_FLOTA_RUTEO),
    [actividadesAll],
  )
  const actividadesPedidosProblemas = useMemo(
    () => actividadesAll.filter((a) => a.seccion === SECCION_PEDIDOS_PROBLEMAS),
    [actividadesAll],
  )
  const actividadesRmd = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "rmd"),
    [actividadesAll],
  )
  const actividadesNps = useMemo(
    () => actividadesAll.filter((a) => a.seccion === "nps"),
    [actividadesAll],
  )
  const actividadesPeriodosCriticos = useMemo(
    () => actividadesAll.filter((a) => a.seccion === SECCION_PERIODOS_CRITICOS),
    [actividadesAll],
  )

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

  const yaAgregadosSet = useMemo(
    () => new Set(detalle.asistentes.map((a) => a.profile_id)),
    [detalle.asistentes],
  )

  const miAsistente = useMemo(() => {
    if (!currentProfileId) return null
    return (
      detalle.asistentes.find((a) => a.profile_id === currentProfileId) ?? null
    )
  }, [detalle.asistentes, currentProfileId])

  const yaMarque = miAsistente?.presente === true
  const esAsistenteActivo = miAsistente !== null && yaMarque
  const puedeEditarTablero = puedeEditar || esAsistenteActivo

  const totalPresentes = detalle.asistentes.filter((a) => a.presente).length
  const totalAsistentes = detalle.asistentes.length

  function refrescar() {
    // Re-fetch del server component (todo el árbol de la página)
    refrescarConScroll()
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
    const result = await marcarMiAsistencia(detalle.id)
    if ("error" in result) {
      alert(`Error: ${result.error}`)
      return
    }
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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-slate-50 p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            {tipoLabel}
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-bold capitalize text-slate-900">
            <Calendar className="size-6 text-slate-600" />
            {formatFechaLarga(detalle.fecha)}
          </h1>
        </div>
        {puedeEditar && (
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
        )}
      </div>

      {/* ASISTENCIA — sticky en pantallas grandes */}
      <Card className="lg:sticky lg:top-2 lg:z-10">
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

          {detalle.asistentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin asistentes registrados.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {detalle.asistentes.map((a) => (
                <AsistenteCard
                  key={a.id}
                  asistente={a}
                  puedeEditar={puedeEditar}
                  onChanged={refrescar}
                />
              ))}
            </div>
          )}

          {puedeEditar && (
            <AgregarAsistenteAdHoc
              reunionId={detalle.id}
              responsables={responsables}
              yaAgregados={yaAgregadosSet}
              onAdded={refrescar}
            />
          )}
        </CardContent>
      </Card>

      {/* Contador de 30 min para acotar la duración de la reunión de Logística
          (solo Pampeana). Estado COMPARTIDO en la DB: un editor inicia y luego
          finaliza la reunión; al finalizar queda cerrada con el tiempo final y
          nadie puede volver a iniciarlo. */}
      {!IS_MISIONES && detalle.tipo === "logistica" && (
        <ContadorReunion
          minutos={30}
          reunionId={detalle.id}
          puedeEditar={puedeEditar}
        />
      )}

      {/* ETAPA 1: SEGURIDAD — no aplica a Ventas-Logística (todo por secciones)
          ni a Presupuesto, que sólo revisa desvíos y compromisos. */}
      {detalle.tipo !== "logistica-ventas" && detalle.tipo !== "presupuesto" && (
        <EtapaSeguridad
          fechaReunion={detalle.fecha}
          currentProfileId={currentProfileId}
          currentRole={currentRole}
        />
      )}

      {/* Reunión de Presupuesto: los desvíos cargados en el mes. Va arriba del
          Action Log porque es el temario: se miran los desvíos y de ahí salen
          los compromisos. */}
      {detalle.tipo === "presupuesto" && (
        <SeccionDesviosPresupuesto fechaReunion={detalle.fecha} />
      )}

      {/* ROTURAS EN LA CALLE — reunión Matinal Distribución (Pampeana). Lista las
          roturas reportadas por choferes y permite desarrollar un plan de acción. */}
      {!IS_MISIONES && detalle.tipo === "matinal-distribucion" && (
        <SeccionRoturasCalle
          fechaReunion={detalle.fecha}
          currentRole={currentRole}
        />
      )}

      {/* Reunión Ventas-Logística: secciones de análisis por indicador.
          Plantilla inicial: Rechazos (datos reales del día, filtrable) + su
          propio Action Log acotado a la sección. */}
      {/* Sección Avance de Venta — acumulado empresa (HL) vs objetivo del mes,
          tendencia y % avance. Trae los datos del dashboard Mercosur y los congela. */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionAvanceVenta
          fechaReunion={detalle.fecha}
          reunionId={detalle.id}
          actividades={actividadesAvanceVenta}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {detalle.tipo === "logistica-ventas" && (
        <SeccionRechazos
          fechaReunion={detalle.fecha}
          reunionId={detalle.id}
          actividades={actividadesRechazos}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Sección Pedidos con problemas (VRL + VRC de la semana previa) */}
      {!IS_MISIONES && detalle.tipo === "logistica-ventas" && (
        <SeccionPedidosProblemas
          fechaReunion={detalle.fecha}
          reunionId={detalle.id}
          reunionTipo="logistica-ventas"
          actividades={actividadesPedidosProblemas}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Sección Frescura – Vencimiento (snapshot + comparación + action log) */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionFrescura
          fechaReunion={detalle.fecha}
          reunionId={detalle.id}
          actividades={actividadesFrescura}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Sección Sobrestock (snapshot + comparación + action log) */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionSobrestock
          reunionId={detalle.id}
          actividades={actividadesSobrestock}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Sección Cumplimiento de SLA (cumplimiento día a día por rango) */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionSla
          fechaReunion={detalle.fecha}
          reunionId={detalle.id}
          reunionTipo="logistica-ventas"
          actividades={actividadesSla}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Sección Acciones comerciales (slides que pasa Ventas) */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionAccionesComerciales
          reunionId={detalle.id}
          actividades={actividadesAccCom}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Sección RMD (Rate my Delivery) — subir fotos para analizar + action log */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionGaleriaFotos
          reunionId={detalle.id}
          seccion="rmd"
          titulo="RMD (Rate my Delivery)"
          icono={Star}
          tema="violet"
          emptyHint="Sin fotos cargadas. Subí las capturas de Rate my Delivery (RMD) para analizarlas acá."
          actividades={actividadesRmd}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
          verMasHref={IS_MISIONES ? undefined : "/rmd"}
          verMasLabel="Ver RMD completo"
          capturaDia={
            IS_MISIONES ? undefined : { seccion: "rmd", fecha: detalle.fecha }
          }
        />
      )}

      {/* Sección NPS — subir fotos para analizar + action log */}
      {detalle.tipo === "logistica-ventas" && (
        <SeccionGaleriaFotos
          reunionId={detalle.id}
          seccion="nps"
          titulo="NPS"
          icono={Gauge}
          tema="sky"
          emptyHint="Sin fotos cargadas. Subí las capturas de NPS para analizarlas acá."
          actividades={actividadesNps}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
          verMasHref={IS_MISIONES ? undefined : "/nps"}
          verMasLabel="Ver NPS completo"
          capturaDia={
            IS_MISIONES ? undefined : { seccion: "nps", fecha: detalle.fecha }
          }
        />
      )}

      {/* Períodos críticos — sólo en la reunión del ÚLTIMO MARTES del mes, que
          es la revisión mensual que pide el manual DPO (R3.4.2). */}
      {detalle.tipo === "logistica-ventas" &&
        esUltimoMartesDelMes(detalle.fecha) && (
          <SeccionPeriodosCriticos
            reunionId={detalle.id}
            actividades={actividadesPeriodosCriticos}
            responsables={responsables}
            puedeEditar={puedeEditar}
            onActividadesChanged={refrescar}
          />
        )}

      {/* ETAPA 2: ACTION LOG (en Ventas-Logística es el Action Log general) */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-emerald-900">
            <ListTodo className="size-5 text-emerald-600" />
            {detalle.tipo === "logistica-ventas"
              ? "Action Log general"
              : "Etapa 2 — Action Log"}{" "}
            ({actividades.length})
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
                      onChanged={refrescar}
                      onAbrirArchivo={abrirArchivo}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
          {/* Tareas asignadas a operarios (Registro de tareas / Mis tareas) — solo Warehouse */}
          {detalle.tipo === "warehouse" && <TareasOperariosBloque />}
        </CardContent>
      </Card>

      {/* ETAPA 3: TABLERO DE CONTROL — no aplica a Ventas-Logística (todo por
          secciones) ni a Presupuesto: no tiene indicadores configurados (mostraba
          un tablero vacío) y su temario son los desvíos. */}
      {detalle.tipo !== "logistica-ventas" && detalle.tipo !== "presupuesto" && (
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-blue-900">
            <BarChart3 className="size-5 text-blue-600" />
            Etapa 3 — Tablero de control
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
            {muestraActualizarDatos && puedeEditar && (
              <>
                {actualizarMsg && (
                  <span className="text-xs text-red-600">{actualizarMsg}</span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={actualizarDatosDeposito}
                  disabled={actualizandoDatos}
                  title="Recalcula roturas, faltantes y errores de picking desde el depósito (~1 min)"
                >
                  <RefreshCw
                    className={cn(
                      "mr-2 size-4",
                      actualizandoDatos && "animate-spin",
                    )}
                  />
                  {actualizandoDatos ? "Actualizando…" : "Actualizar datos"}
                </Button>
              </>
            )}
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
              {syncMsg && (
                <span
                  className={cn(
                    "ml-auto text-[11px]",
                    syncMsg.startsWith("Error")
                      ? "text-red-600"
                      : "text-emerald-600",
                  )}
                >
                  {syncMsg}
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
                    <th className="sticky left-[220px] z-10 w-[60px] min-w-[60px] max-w-[60px] bg-white px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Target
                    </th>
                    <th className="sticky left-[280px] z-10 w-[60px] min-w-[60px] max-w-[60px] bg-white px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-rose-600">
                      Gatillo
                    </th>
                    <th className="sticky left-[340px] z-10 w-[70px] min-w-[70px] max-w-[70px] border-r bg-white px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      MTD
                    </th>
                    {fechasFiltradas.map((f) => {
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
                      <td className="sticky left-[220px] w-[60px] min-w-[60px] max-w-[60px] bg-white px-2 py-2 text-right align-middle text-xs tabular-nums">
                        {ind.meta == null ? "—" : formatearValor(ind.meta)}
                      </td>
                      <td className="sticky left-[280px] w-[60px] min-w-[60px] max-w-[60px] bg-white px-2 py-2 text-right align-middle text-xs tabular-nums text-rose-600">
                        {ind.gatillo == null ? "—" : formatearValor(ind.gatillo)}
                      </td>
                      <td className="sticky left-[340px] w-[70px] min-w-[70px] max-w-[70px] border-r bg-white px-2 py-2 text-right align-middle text-sm font-bold tabular-nums text-blue-700">
                        {/* El DQI no tiene valor por día (su denominador es mensual):
                            el detalle por camión se abre desde el MTD. */}
                        {ind.id === "auto_dqi" && ind.mtd != null ? (
                          <button
                            type="button"
                            onClick={() => setOpenDqiPatentes(true)}
                            className="underline decoration-dotted underline-offset-2 hover:text-blue-900"
                            title="Ver detalle por camión"
                          >
                            {formatearValor(ind.mtd)}
                          </button>
                        ) : ind.mtd_texto != null ? (
                          ind.mtd_texto
                        ) : ind.mtd == null ? (
                          "—"
                        ) : (
                          formatearValor(ind.mtd)
                        )}
                      </td>
                      {fechasFiltradas.map((f) => {
                        const cell = ind.valores[f] ?? null
                        const esHoy = f === detalle.fecha
                        const dom = esFinDeSemana(f)
                        const reunionIdEnFecha =
                          indicadoresMes.reuniones_por_fecha[f] ?? null

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
                          // Errores de picking: un día con datos y 0 errores
                          // se muestra como 0 (no como "—"). El "—" queda
                          // reservado a los días sin datos (valor null).
                          const esErroresPicking =
                            ind.id === "auto_errores_picking"
                          // WQI / Roturas / Faltantes: un día operativo con 0
                          // (sin roturas/faltantes ese día) se muestra como 0 y es
                          // clickeable, no "—". Así el WQI=0 deja de ser un misterio.
                          const esWqiPerdidasCero =
                            ind.id === "auto_wqi" ||
                            ind.id === "auto_roturas" ||
                            ind.id === "auto_faltantes"
                          const valorValido =
                            valor != null && Number.isFinite(valor) && f <= detalle.fecha
                          // LTI/TRI muestran 0 (días sin accidente) como el resto
                          // de indicadores con `mostrar_cero`.
                          const muestra =
                            valorValido &&
                            (ind.mostrar_cero || esLtiTri || esErroresPicking || esWqiPerdidasCero
                              ? true
                              : valor! > 0)
                          const esPct = ind.unidad === "%"
                          // Color por polaridad de la meta (mejor_si). Sin meta o
                          // sin polaridad no hay contra qué comparar: el valor va
                          // NEUTRO, no rojo — pintarlo de rojo hacía que
                          // indicadores sin meta cargada (tiempo en ruta, tiempo
                          // por PDV, km, paradas no autorizadas, resecuenciado)
                          // se vieran siempre en rojo con cualquier valor.
                          // Excepción: LTI/TRI son indicadores de EVENTO, donde
                          // cualquier valor > 0 es malo de por sí y el rojo no
                          // depende de ninguna meta (el 0 se neutraliza abajo).
                          let colorClass = esLtiTri
                            ? "bg-red-50 font-semibold text-red-700"
                            : "font-medium text-slate-700"
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
                          // Errores de picking: ídem, un 0 (día sin errores)
                          // en gris neutro y no en rojo.
                          if ((esLtiTri || esErroresPicking) && valor === 0) {
                            colorClass = "text-slate-300"
                          }
                          // Indicadores de almacén (WQI, WNP, Productividad,
                          // Errores, Ausentismo): semáforo de 3 zonas. Verde si
                          // está mejor que el target, amarillo entre target y
                          // gatillo, rojo SOLO si está peor que el gatillo. Sin
                          // target/gatillo definidos queda neutro (el formato
                          // ya está armado para cuando se carguen los umbrales).
                          if (SEMAFORO_3_ZONAS.has(ind.id)) {
                            if (
                              ind.mejor_si &&
                              ind.meta != null &&
                              valor != null
                            ) {
                              const mejorQueTarget =
                                ind.mejor_si === "menor"
                                  ? valor <= ind.meta
                                  : valor >= ind.meta
                              if (mejorQueTarget) {
                                colorClass =
                                  "bg-emerald-50 font-semibold text-emerald-700"
                              } else if (ind.gatillo != null) {
                                const peorQueGatillo =
                                  ind.mejor_si === "menor"
                                    ? valor > ind.gatillo
                                    : valor < ind.gatillo
                                colorClass = peorQueGatillo
                                  ? "bg-red-50 font-semibold text-red-700"
                                  : "bg-amber-50 font-semibold text-amber-700"
                              } else {
                                // Sin gatillo no hay zona roja: no cumplir el
                                // target queda en amarillo.
                                colorClass =
                                  "bg-amber-50 font-semibold text-amber-700"
                              }
                            } else if (
                              !((esLtiTri || esErroresPicking) && valor === 0)
                            ) {
                              // Sin umbrales usables: neutro (no se pinta rojo
                              // sólo por tener valor). El 0 de errores conserva
                              // su gris muted ya resuelto arriba.
                              colorClass = "font-medium text-slate-700"
                            }
                          }
                          // Checklist "X/Y": verde si todas aprobadas, ámbar
                          // si hubo algún rechazo en las liberaciones del día.
                          // Un día sin checklists (texto null) queda neutro: no
                          // hubo rechazos, simplemente no hubo actividad.
                          if (
                            ind.id === "auto_checklist" ||
                            ind.id === "auto_checklist_ae"
                          ) {
                            const m = (cell?.texto ?? "").match(/^(\d+)\/(\d+)$/)
                            colorClass = !m
                              ? "font-medium text-slate-700"
                              : m[1] === m[2]
                                ? "bg-emerald-50 font-semibold text-emerald-700"
                                : "bg-amber-50 font-semibold text-amber-700"
                          }
                          const esRechazosPct = ind.id === "auto_rechazos_pct"
                          const esBultosVendidos = ind.id === "auto_bultos_vendidos"
                          const esHlVendidos = ind.id === "auto_hl_vendidos"
                          const esTml = ind.id === "auto_tml"
                          const esChecklist =
                            ind.id === "auto_checklist" ||
                            ind.id === "auto_checklist_ae"
                          const esKm = ind.id === "auto_km_recorridos"
                          const esHorasCalle = ind.id === "auto_horas_calle"
                          const esAperturaPicking =
                            ind.id === "auto_productividad_picking" ||
                            ind.id === "auto_errores_picking"
                          const esAperturaMaquinistas =
                            ind.id === "auto_productividad_maquinistas"
                          const esAusentismo = ind.id === "auto_ausentismo"
                          const esOB = ind.id === "auto_ocupacion_bodega"
                          const esTlp = ind.id === "auto_tlp"
                          // WQI / Roturas / Faltantes (warehouse): mismo popover de
                          // detalle del día (bultos vendidos + pérdidas). Explica el
                          // "WQI = 0" (día sin roturas o sin venta cargada todavía).
                          const esWqiPerdidas =
                            ind.id === "auto_wqi" ||
                            ind.id === "auto_roturas" ||
                            ind.id === "auto_faltantes"
                          // WNP: drill al detalle del día (HL vendidos, horas y
                          // de dónde salió cada hora). Avisa cuándo el día se
                          // apoyó en jornada teórica por falta de fichaje.
                          const esWnp = ind.id === "auto_wnp"
                          // KPIs de Foxtrot (matinal Pampeana): drill por día con
                          // detalle por patente. Todos los id arrancan con auto_fx_.
                          const esFoxtrotKpi = ind.id.startsWith("auto_fx_")
                          const clickable =
                            (esRechazosPct ||
                              esBultosVendidos ||
                              esHlVendidos ||
                              esTml ||
                              esChecklist ||
                              esKm ||
                              esHorasCalle ||
                              esAperturaPicking ||
                              esAperturaMaquinistas ||
                              esAusentismo ||
                              esOB ||
                              esTlp ||
                              esWqiPerdidas ||
                              esWnp ||
                              esFoxtrotKpi) &&
                            muestra
                          const onCellClick = () => {
                            if (esRechazosPct) setRechazosDetalleFecha(f)
                            else if (esBultosVendidos) setVentasBultosFecha(f)
                            else if (esHlVendidos) setVentasHlFecha(f)
                            else if (esTml) setTmlDetalleFecha(f)
                            else if (esChecklist) {
                              setChecklistDetalleGrupo(
                                ind.id === "auto_checklist_ae"
                                  ? "autoelevadores"
                                  : "camiones",
                              )
                              setChecklistDetalleFecha(f)
                            }
                            else if (esKm) setKmDetalleFecha(f)
                            else if (esHorasCalle) setHorasCalleFecha(f)
                            else if (esAperturaPicking) setAperturaPickingFecha(f)
                            else if (esAperturaMaquinistas)
                              setAperturaMaquinistasFecha(f)
                            else if (esAusentismo) setAusentismoFecha(f)
                            else if (esOB) setObDetalleFecha(f)
                            else if (esTlp) setTlpDetalleFecha(f)
                            else if (esWqiPerdidas) setWqiDetalleFecha(f)
                            else if (esWnp) setWnpDetalleFecha(f)
                            else if (esFoxtrotKpi)
                              setFxKpiDetalle({ fecha: f, kpiId: ind.id as FoxtrotKpiId })
                          }
                          const contenido = muestra
                            ? cell?.texto != null
                              ? cell.texto
                              : esPct
                                ? `${formatearValor(valor!)}%`
                                : formatearValor(valor!)
                            : "—"
                          // Asterisco discreto cuando el día trae una
                          // observación (ej. WNP apoyado en jornada teórica
                          // porque el reloj no registró a alguien). El texto
                          // completo sale al pasar el mouse y en el popover.
                          const obs = muestra ? (cell?.observacion ?? null) : null
                          const marcaObs = obs ? (
                            <span aria-hidden className="ml-0.5 align-super text-[0.7em] font-bold text-amber-500">
                              *
                            </span>
                          ) : null
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
                                  title={obs ?? "Ver detalle del día"}
                                >
                                  {contenido}
                                  {marcaObs}
                                </button>
                              ) : obs ? (
                                <span title={obs}>
                                  {contenido}
                                  {marcaObs}
                                </span>
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
                                esHoy ? "bg-blue-100" : "bg-blue-50",
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
                              "px-2 py-1 text-center align-middle text-sm tabular-nums text-slate-500",
                              esHoy && "bg-blue-50",
                              dom && "bg-slate-50",
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
      )}

      {/* ETAPA 4: CUMPLIMIENTO DE SLA — los 5 SLA operativos acordados.
          Solo en la reunión de Logística (Ventas-Logística ya tiene su propia
          sección de SLA sin filtrar; Warehouse y Matinal no la llevan). */}
      {detalle.tipo === "logistica" && (
        <SeccionSla
          fechaReunion={detalle.fecha}
          reunionId={detalle.id}
          reunionTipo={detalle.tipo}
          titulo="Etapa 4 — Cumplimiento de SLA"
          codigos={SLA_CODIGOS_REUNION_OPERATIVA}
          actividades={actividadesSla}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onActividadesChanged={refrescar}
        />
      )}

      {/* Los lunes la reunión de logística suma los temas de flota y ruteo.
          Sólo Pampeana: el VRL/VRC y el módulo de mantenimiento no existen en
          Misiones, donde la flota se gestiona en Cloudfleet. */}
      {!IS_MISIONES && detalle.tipo === "logistica" && esLunes(detalle.fecha) && (
        <>
          <SeccionFlotaRuteo
            fechaReunion={detalle.fecha}
            reunionId={detalle.id}
            reunionTipo={detalle.tipo}
            actividades={actividadesFlotaRuteo}
            responsables={responsables}
            puedeEditar={puedeEditar}
            onActividadesChanged={refrescar}
          />
          <SeccionPedidosProblemas
            fechaReunion={detalle.fecha}
            reunionId={detalle.id}
            reunionTipo={detalle.tipo}
            actividades={actividadesPedidosProblemas}
            responsables={responsables}
            puedeEditar={puedeEditar}
            onActividadesChanged={refrescar}
          />
        </>
      )}


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
        onSaved={refrescar}
      />
      <ConfigurarIndicadoresDialog
        open={openConfigInd}
        onOpenChange={setOpenConfigInd}
        tipo={detalle.tipo}
        tipoLabel={tipoLabel}
        onSaved={refrescar}
        reunionId={detalle.id}
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
          onSaved={refrescar}
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

      <TlpDetalleDiaDialog
        open={tlpDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setTlpDetalleFecha(null)
        }}
        fecha={tlpDetalleFecha}
      />

      <WnpDetalleDiaDialog
        open={wnpDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setWnpDetalleFecha(null)
        }}
        fecha={wnpDetalleFecha}
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

      <AperturaMaquinistasDetalleDiaDialog
        open={aperturaMaquinistasFecha !== null}
        onOpenChange={(o) => {
          if (!o) setAperturaMaquinistasFecha(null)
        }}
        reunionId={detalle.id}
        fecha={aperturaMaquinistasFecha}
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
        grupo={checklistDetalleGrupo}
      />

      <KmRecorridosDetalleDiaDialog
        open={kmDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setKmDetalleFecha(null)
        }}
        fecha={kmDetalleFecha}
      />

      {indicadoresMes && (
        <DqiPatentesDialog
          open={openDqiPatentes}
          onOpenChange={setOpenDqiPatentes}
          anio={indicadoresMes.anio}
          mes={indicadoresMes.mes}
        />
      )}

      <FoxtrotKpiDetalleDiaDialog
        open={fxKpiDetalle !== null}
        onOpenChange={(o) => {
          if (!o) setFxKpiDetalle(null)
        }}
        fecha={fxKpiDetalle?.fecha ?? null}
        kpiId={fxKpiDetalle?.kpiId ?? null}
      />

      <HorasCalleDetalleDiaDialog
        open={horasCalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setHorasCalleFecha(null)
        }}
        fecha={horasCalleFecha}
      />

      <WarehousePerdidasDetalleDiaDialog
        open={wqiDetalleFecha !== null}
        onOpenChange={(o) => {
          if (!o) setWqiDetalleFecha(null)
        }}
        fecha={wqiDetalleFecha}
      />

    </div>
  )
}
