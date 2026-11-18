"use client"

import { useState, useMemo, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Plus,
  Search,
  Calendar,
  Clock,
  MapPin,
  User,
  GraduationCap,
  Trash2,
  Eye,
  EyeOff,
  ClipboardCheck,
  FileDown,
  CheckCircle2,
  ChevronDown,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ESTADO_CAPACITACION_COLORS,
  ESTADO_CAPACITACION_LABELS,
} from "@/lib/constants"
import { createCapacitacion, deleteCapacitacion, toggleCapacitacionVisible } from "@/actions/capacitaciones"
import type { CapacitacionConResumen, EstadoCapacitacion } from "@/types/database"
import { esEstadoManual, estadoDerivado, formatDuracion } from "@/lib/capacitacion-estado"
import { CapacitacionesCalendario } from "./capacitaciones-calendario"
import { CapacitacionesAdherencia } from "./capacitaciones-adherencia"
import { CapacitacionesAsistencia } from "./capacitaciones-asistencia"
import { CapacitacionesCosto } from "./capacitaciones-costo"
import { Cuadro } from "./tablero-cuadro"
import { calcularAdherencia } from "@/lib/capacitacion-adherencia"
import { calcularAsistencia } from "@/lib/capacitacion-asistencia"
import { calcularCosto } from "@/lib/capacitacion-costo"
import {
  CalendarDays,
  Gauge as GaugeIcon,
  LayoutGrid,
  Layers,
  ListChecks as ListIcon,
  Wallet as WalletIcon,
} from "lucide-react"
import type { CostoConfig } from "@/lib/capacitacion-costo"
import {
  META_ASISTENCIA_PCT,
  pctAsistencia,
  type EmpleadoRef,
  type FilaAsistenciaEmpleado,
} from "@/lib/capacitacion-asistencia"

/** Sin fecha cargada la tarjeta mostraba "Invalid Date". */
function fmtFecha(fecha: string | null | undefined): string {
  if (!fecha) return "Sin fecha"
  const d = new Date(fecha + "T12:00:00")
  return isNaN(d.getTime()) ? "Sin fecha" : d.toLocaleDateString("es-AR")
}

interface Props {
  capacitaciones: CapacitacionConResumen[]
  canEdit: boolean
  /** Asistencia individual. Null para quien no puede verla (no es admin/auditor). */
  asistenciaPorEmpleado: { filas: FilaAsistenciaEmpleado[]; empleados: EmpleadoRef[] } | null
  /** Ids de capacitaciones a las que el usuario logueado está convocado y todavía no rindió. */
  misPendientes: string[]
  /** Parámetros del presupuesto de costo. Null para quien no lo ve (no es admin/auditor). */
  costoConfig: CostoConfig | null
  puedeEditarCosto: boolean
}

const estadoOptions: { value: string; label: string }[] = [
  { value: "all", label: "Todos los estados" },
  { value: "programada", label: "Programada" },
  { value: "en_curso", label: "En Curso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
]

const PILAR_OPTIONS = [
  { value: "all", label: "Todos los pilares" },
  { value: "Seguridad", label: "Seguridad" },
  { value: "Gente", label: "Gente" },
  { value: "Gestion", label: "Gestion" },
  { value: "Entrega", label: "Entrega" },
  { value: "Flota", label: "Flota" },
  { value: "Almacen", label: "Almacen" },
  { value: "Planeamiento", label: "Planeamiento" },
]

const PILAR_COLORS: Record<string, string> = {
  Seguridad: "#EF4444",
  Gente: "#3B82F6",
  Gestion: "#8B5CF6",
  Entrega: "#F59E0B",
  Flota: "#10B981",
  Almacen: "#6366F1",
  Planeamiento: "#EC4899",
}

const SIN_PILAR = "Sin pilar"

const SECCIONES_TABLERO = ["listado", "adherencia", "asistencia", "costo", "pilares", "calendario"] as const
type SeccionTablero = (typeof SECCIONES_TABLERO)[number]
/** Qué cuadros dejó tildados cada usuario (preferencia de este navegador). */
const CLAVE_TABLERO = "capacitaciones:tablero"

// "Almacén" y "Almacen" conviven en la DB; se agrupan sin tildes
function normalizePilar(pilar: string | null): string {
  return pilar
    ? pilar.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : SIN_PILAR
}

export function CapacitacionesClient({
  capacitaciones: initial,
  canEdit,
  asistenciaPorEmpleado,
  misPendientes,
  costoConfig,
  puedeEditarCosto,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [capacitaciones, setCapacitaciones] = useState(initial)
  const [search, setSearch] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const [filterPilar, setFilterPilar] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // New form state
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    instructor: "",
    fecha: "",
    duracion_horas: "0.5",
    lugar: "",
    material_url: "",
    pilar: "",
  })

  // Fecha local (no UTC): a la noche argentina toISOString() ya devuelve el día siguiente
  const hoy = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])

  const withDerived = useMemo(
    () =>
      capacitaciones.map((c) => ({
        ...c,
        estadoReal: estadoDerivado(c),
        estadoManual: esEstadoManual(c),
      })),
    [capacitaciones]
  )

  // Mismo insumo que el panel de asistencia: convocados = asistentes cargados.
  const itemsAsistencia = useMemo(
    () =>
      withDerived.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        fecha: c.fecha,
        pilar: c.pilar,
        estadoReal: c.estadoReal,
        convocados: c.total_asistentes,
        presentes: c.presentes,
      })),
    [withDerived]
  )

  const filtered = useMemo(() => {
    let list = withDerived
    if (filterEstado !== "all") {
      list = list.filter((c) => c.estadoReal === filterEstado)
    }
    if (filterPilar !== "all") {
      list = list.filter((c) => normalizePilar(c.pilar) === filterPilar)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          (c.titulo ?? "").toLowerCase().includes(q) ||
          (c.instructor ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [withDerived, search, filterEstado, filterPilar])

  // Stats (basado en estado derivado real)
  const stats = useMemo(() => {
    const programadas = withDerived.filter((c) => c.estadoReal === "programada").length
    const enCurso = withDerived.filter((c) => c.estadoReal === "en_curso").length
    const completadas = withDerived.filter((c) => c.estadoReal === "completada").length
    // Calendarizado = todo lo planificado sin cancelar (mismo denominador que la adherencia)
    const total = withDerived.filter((c) => c.estadoReal !== "cancelada").length
    const pctRealizadas = total > 0 ? Math.round((completadas / total) * 100) : 0
    return { total, programadas, enCurso, completadas, pctRealizadas }
  }, [withDerived])

  const realizadasList = useMemo(
    () =>
      withDerived
        .filter((c) => c.estadoReal === "completada")
        .sort((a, b) => (b.fecha > a.fecha ? 1 : -1)),
    [withDerived]
  )

  // Avance de completadas por pilar (excluye canceladas del total)
  const avancePorPilar = useMemo(() => {
    const grupos = new Map<string, (typeof withDerived)[number][]>()
    for (const c of withDerived) {
      if (c.estadoReal === "cancelada") continue
      const key = normalizePilar(c.pilar)
      grupos.set(key, [...(grupos.get(key) ?? []), c])
    }
    const orden = [
      ...PILAR_OPTIONS.filter((o) => o.value !== "all").map((o) => o.value),
      SIN_PILAR,
    ]
    return orden
      .filter((p) => grupos.has(p))
      .map((p) => {
        const items = grupos.get(p)!.sort((a, b) => (a.fecha > b.fecha ? 1 : -1))
        const completadas = items.filter((c) => c.estadoReal === "completada").length
        return {
          pilar: p,
          items,
          total: items.length,
          completadas,
          pct: Math.round((completadas / items.length) * 100),
        }
      })
  }, [withDerived])

  const [expandedPilar, setExpandedPilar] = useState<string | null>(null)
  const [avanceOpen, setAvanceOpen] = useState(true)

  const [realizadasOpen, setRealizadasOpen] = useState(false)

  async function handleCreate() {
    if (!form.titulo.trim() || !form.instructor.trim() || !form.fecha) {
      toast.error("Completa los campos obligatorios")
      return
    }

    startTransition(async () => {
      const result = await createCapacitacion({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        instructor: form.instructor.trim(),
        fecha: form.fecha,
        duracion_horas: parseFloat(form.duracion_horas) || 0.5,
        lugar: form.lugar.trim() || undefined,
        material_url: form.material_url.trim() || undefined,
        pilar: form.pilar || undefined,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Capacitacion creada")
        const nueva: CapacitacionConResumen = {
          ...result.data,
          total_asistentes: 0,
          presentes: 0,
          rendidos: 0,
          pendientes: 0,
          aprobados: 0,
        }
        setCapacitaciones((prev) => [nueva, ...prev])
        setForm({
          titulo: "",
          descripcion: "",
          instructor: "",
          fecha: "",
          duracion_horas: "0.5",
          lugar: "",
          material_url: "",
          pilar: "",
        })
        setDialogOpen(false)
      }
    })
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar esta capacitacion?")) return
    setDeleting(id)
    const result = await deleteCapacitacion(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Capacitacion eliminada")
      setCapacitaciones((prev) => prev.filter((c) => c.id !== id))
    }
    setDeleting(null)
  }

  // ── Tablero: un cuadro por sección; se tildan las que se quieren ver ──
  const [tablero, setTablero] = useState<Set<SeccionTablero>>(() => new Set<SeccionTablero>(["listado"]))
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLAVE_TABLERO)
      if (raw) {
        const arr = (JSON.parse(raw) as string[]).filter((x): x is SeccionTablero =>
          (SECCIONES_TABLERO as readonly string[]).includes(x)
        )
        // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada del navegador
        setTablero(new Set(arr))
      }
    } catch {
      /* sin storage: queda el default */
    }
  }, [])
  function toggleTablero(k: SeccionTablero) {
    setTablero((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      try {
        localStorage.setItem(CLAVE_TABLERO, JSON.stringify([...n]))
      } catch {
        /* sin storage */
      }
      return n
    })
  }
  const ver = (k: SeccionTablero) => tablero.has(k)

  const resAdh = useMemo(() => calcularAdherencia(withDerived, hoy), [withDerived, hoy])
  const resAsis = useMemo(() => calcularAsistencia(itemsAsistencia, hoy), [itemsAsistencia, hoy])
  const resCosto = useMemo(
    () => (costoConfig ? calcularCosto(withDerived, costoConfig, Number(hoy.slice(0, 4)), hoy).pac.total : null),
    [withDerived, costoConfig, hoy]
  )
  const delMes = useMemo(() => {
    const mes = hoy.slice(0, 7)
    const lista = withDerived.filter((c) => c.estadoReal !== "cancelada" && c.fecha?.startsWith(mes))
    const proxima = withDerived
      .filter((c) => c.estadoReal !== "cancelada" && c.fecha && c.fecha >= hoy && c.estadoReal !== "completada")
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
    return { cant: lista.length, proxima }
  }, [withDerived, hoy])
  const semaforo = (v: number | null, meta = 90) =>
    v === null ? "#94A3B8" : v >= meta ? "#10B981" : v >= meta - 20 ? "#F59E0B" : "#EF4444"
  const seccionesVisibles = SECCIONES_TABLERO.filter((k) => k !== "costo" || costoConfig)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Capacitaciones</h1>
          <p className="text-sm text-slate-500">
            Gestiona las capacitaciones del personal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/capacitaciones/matriz-skap">
            <Button variant="outline">
              <ClipboardCheck className="mr-2 size-4" />
              Matriz SKAP SOP 1.1
            </Button>
          </Link>
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/api/capacitaciones/export"
              }}
            >
              <FileDown className="mr-2 size-4" />
              Descargar Excel
            </Button>
          )}
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="mr-2 size-4" />
                  Nueva Capacitacion
                </Button>
              }
            />
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva Capacitacion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Titulo *</Label>
                  <Input
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Seguridad e Higiene"
                  />
                </div>
                <div>
                  <Label>Pilar</Label>
                  <Select
                    value={form.pilar || "none"}
                    onValueChange={(v) => setForm({ ...form, pilar: v === "none" ? "" : (v ?? "") })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar pilar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin pilar</SelectItem>
                      {PILAR_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descripcion</Label>
                  <Textarea
                    value={form.descripcion}
                    onChange={(e) =>
                      setForm({ ...form, descripcion: e.target.value })
                    }
                    placeholder="Descripcion de la capacitacion..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Instructor *</Label>
                    <Input
                      value={form.instructor}
                      onChange={(e) =>
                        setForm({ ...form, instructor: e.target.value })
                      }
                      placeholder="Nombre del instructor"
                    />
                  </div>
                  <div>
                    <Label>Fecha *</Label>
                    <Input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Duracion (horas)</Label>
                    <Input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={form.duracion_horas}
                      onChange={(e) =>
                        setForm({ ...form, duracion_horas: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Lugar</Label>
                    <Input
                      value={form.lugar}
                      onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                      placeholder="Ej: Sala de reuniones"
                    />
                  </div>
                </div>
                <div>
                  <Label>Link material</Label>
                  <Input
                    value={form.material_url}
                    onChange={(e) =>
                      setForm({ ...form, material_url: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={isPending}
                >
                  {isPending ? "Creando..." : "Crear Capacitacion"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Tablero */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <LayoutGrid className="size-3.5" />
            Tocá un cuadro para ver su información. Podés tildar varios.
          </p>
          <button
            type="button"
            onClick={() => {
              const todos = tablero.size >= seccionesVisibles.length
              const n = new Set<SeccionTablero>(todos ? [] : seccionesVisibles)
              setTablero(n)
              try {
                localStorage.setItem(CLAVE_TABLERO, JSON.stringify([...n]))
              } catch {
                /* sin storage */
              }
            }}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            {tablero.size >= seccionesVisibles.length ? "Cerrar todo" : "Ver todo"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Cuadro
            activo={ver("listado")}
            onClick={() => toggleTablero("listado")}
            icono={<ListIcon className="size-4" />}
            titulo="Capacitaciones"
            valor={`${stats.total}`}
            detalle={`${stats.completadas} completadas · ${stats.enCurso} en curso · ${stats.programadas} pendientes`}
            pie={`Cumplimiento anual ${stats.pctRealizadas} %`}
            pieColor={semaforo(stats.pctRealizadas)}
            barra={stats.pctRealizadas}
            color="#0F172A"
          />
          <Cuadro
            activo={ver("adherencia")}
            onClick={() => toggleTablero("adherencia")}
            icono={<GaugeIcon className="size-4" />}
            titulo="Adherencia"
            valor={resAdh.adherenciaYtd === null ? "—" : `${resAdh.adherenciaYtd} %`}
            color={semaforo(resAdh.adherenciaYtd)}
            detalle={`Al cronograma YTD · ${resAdh.atrasadas.length} atrasadas`}
            pie={`Anual ${resAdh.cumplimientoAnual} % · meta 90 %`}
            barra={resAdh.adherenciaYtd}
          />
          <Cuadro
            activo={ver("asistencia")}
            onClick={() => toggleTablero("asistencia")}
            icono={<UserCheck className="size-4" />}
            titulo="Asistencia"
            valor={resAsis.pctYtd === null ? "—" : `${resAsis.pctYtd} %`}
            color={semaforo(resAsis.pctYtd)}
            detalle={`${resAsis.presentes} presentes de ${resAsis.convocados} · ${resAsis.dictadas} dictadas`}
            pie={`${resAsis.ausentes} ausencias · meta 90 %`}
            barra={resAsis.pctYtd}
          />
          {costoConfig && resCosto && (
            <Cuadro
              activo={ver("costo")}
              onClick={() => toggleTablero("costo")}
              icono={<WalletIcon className="size-4" />}
              titulo="Costo vs PAC"
              valor={"$ " + Math.round(resCosto.real).toLocaleString("es-AR")}
              color={resCosto.pac - resCosto.real >= 0 ? "#10B981" : "#EF4444"}
              detalle={`Real dictado · ${resCosto.pac > 0 ? Math.round((resCosto.real / resCosto.pac) * 100) : "—"} % del PAC`}
              pie={`Desvío $ ${Math.round(resCosto.pac - resCosto.real).toLocaleString("es-AR")}`}
              pieColor={resCosto.pac - resCosto.real >= 0 ? "#10B981" : "#EF4444"}
              barra={resCosto.pac > 0 ? (resCosto.real / resCosto.pac) * 100 : null}
            />
          )}
          <Cuadro
            activo={ver("pilares")}
            onClick={() => toggleTablero("pilares")}
            icono={<Layers className="size-4" />}
            titulo="Avance por pilar"
            valor={`${avancePorPilar.length} pilares`}
            detalle={
              avancePorPilar.length
                ? `Mejor: ${[...avancePorPilar].sort((a, b) => b.pct - a.pct)[0].pilar} · Peor: ${[...avancePorPilar].sort((a, b) => a.pct - b.pct)[0].pilar}`
                : "Sin capacitaciones"
            }
            pie="Completadas sobre calendarizadas"
            color="#0F172A"
          />
          <Cuadro
            activo={ver("calendario")}
            onClick={() => toggleTablero("calendario")}
            icono={<CalendarDays className="size-4" />}
            titulo="Calendario"
            valor={`${delMes.cant} este mes`}
            detalle={
              delMes.proxima
                ? `Próxima: ${new Date(delMes.proxima.fecha + "T12:00:00").toLocaleDateString("es-AR")}`
                : "Sin próximas programadas"
            }
            pie={delMes.proxima ? delMes.proxima.titulo : "Ver el mes en el calendario"}
            color="#0F172A"
          />
        </div>
      </div>

      {/* Adherencia al cronograma (Gantt) — meta 90 % a fin de año */}
      {ver("adherencia") && <CapacitacionesAdherencia capacitaciones={withDerived} hoy={hoy} inicialAbierto />}

      {/* Asistencia por capacitación — meta 90 % de presentismo */}
      {ver("asistencia") && (
        <CapacitacionesAsistencia
          capacitaciones={itemsAsistencia}
          hoy={hoy}
          porEmpleado={asistenciaPorEmpleado}
          inicialAbierto
        />
      )}

      {/* Presupuesto de costo — sólo admin/auditor (tiene sueldos) */}
      {costoConfig && ver("costo") && (
        <CapacitacionesCosto
          inicialAbierto
          capacitaciones={withDerived}
          config={costoConfig}
          puedeEditar={puedeEditarCosto}
          hoy={hoy}
        />
      )}

      {/* Avance de completadas por pilar */}
      {ver("pilares") && avancePorPilar.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={() => setAvanceOpen((v) => !v)}
              className="flex w-full items-center gap-2 text-left outline-none"
              title={avanceOpen ? "Ocultar avance por pilar" : "Ver avance por pilar"}
            >
              <ChevronDown
                className={`size-4 text-slate-400 transition-transform ${avanceOpen ? "" : "-rotate-90"}`}
              />
              <CardTitle className="text-base">Avance por Pilar</CardTitle>
            </button>
          </CardHeader>
          {avanceOpen && (
          <CardContent className="space-y-3">
            {avancePorPilar.map((p) => {
              const color = PILAR_COLORS[p.pilar] ?? "#94A3B8"
              const expandido = expandedPilar === p.pilar
              return (
                <div key={p.pilar}>
                  <button
                    type="button"
                    onClick={() => setExpandedPilar(expandido ? null : p.pilar)}
                    className={`block w-full rounded-md p-1 text-left outline-none transition-colors hover:bg-slate-50 ${expandido ? "bg-slate-50" : ""}`}
                    title={expandido ? "Ocultar capacitaciones" : "Ver capacitaciones del pilar"}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-medium" style={{ color }}>
                        <ChevronDown
                          className={`size-4 text-slate-400 transition-transform ${expandido ? "" : "-rotate-90"}`}
                        />
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                        {p.pilar}
                      </span>
                      <span className="text-slate-500">
                        <span className="font-semibold text-slate-900">{p.pct}%</span>{" "}
                        · {p.completadas}/{p.total} completadas
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${p.pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </button>
                  {expandido && (
                    <div
                      className="ml-2 mt-2 space-y-0.5 border-l-2 pl-3"
                      style={{ borderColor: color }}
                    >
                      {p.items.map((c) => (
                        <Link
                          key={c.id}
                          href={`/capacitaciones/${c.id}`}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          <span className="truncate font-medium text-slate-700">
                            {c.titulo}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-slate-400">
                              {fmtFecha(c.fecha)}
                            </span>
                            <Badge
                              variant="secondary"
                              style={{
                                backgroundColor: ESTADO_CAPACITACION_COLORS[c.estadoReal] + "20",
                                color: ESTADO_CAPACITACION_COLORS[c.estadoReal],
                              }}
                            >
                              {ESTADO_CAPACITACION_LABELS[c.estadoReal]}
                            </Badge>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
          )}
        </Card>
      )}

      {/* Calendario de programación (respeta los filtros activos) */}
      {ver("calendario") && <CapacitacionesCalendario capacitaciones={filtered} inicialAbierto />}

      {/* Dialog: lista de capacitaciones realizadas */}
      <Dialog open={realizadasOpen} onOpenChange={setRealizadasOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Capacitaciones realizadas ({realizadasList.length} de {stats.total} · {stats.pctRealizadas}%)
            </DialogTitle>
          </DialogHeader>
          {realizadasList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Todavía no hay capacitaciones realizadas.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Capacitación</th>
                    <th className="py-2 pr-2">Fecha</th>
                    <th className="py-2 pr-2">Instructor</th>
                    <th className="py-2">Pilar</th>
                  </tr>
                </thead>
                <tbody>
                  {realizadasList.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium text-slate-900">
                        <Link
                          href={`/capacitaciones/${c.id}`}
                          className="hover:text-blue-600"
                          onClick={() => setRealizadasOpen(false)}
                        >
                          {c.titulo}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-slate-600">
                        {fmtFecha(c.fecha)}
                      </td>
                      <td className="py-2 pr-2 text-slate-600">{c.instructor}</td>
                      <td className="py-2">
                        {c.pilar ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium"
                            style={{ color: PILAR_COLORS[c.pilar] ?? "#64748B" }}
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: PILAR_COLORS[c.pilar] ?? "#94A3B8" }}
                            />
                            {c.pilar}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ver("listado") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-800">Capacitaciones</h2>
            <button
              type="button"
              onClick={() => setRealizadasOpen(true)}
              className="text-xs font-medium text-sky-600 hover:underline"
            >
              Ver realizadas ({stats.completadas} · {stats.pctRealizadas} %)
            </button>
          </div>
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="Buscar por titulo o instructor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterPilar} onValueChange={(v) => setFilterPilar(v ?? "all")}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PILAR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.value !== "all" && (
                      <span
                        className="mr-2 inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: PILAR_COLORS[o.value] }}
                      />
                    )}
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? "all")}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {estadoOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-slate-400">
              <GraduationCap className="mb-3 size-10" />
              <p className="font-medium">No hay capacitaciones</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((cap) => (
                <Link key={cap.id} href={`/capacitaciones/${cap.id}`}>
                  <Card className="group cursor-pointer transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base leading-tight group-hover:text-blue-600">
                          {cap.titulo}
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: ESTADO_CAPACITACION_COLORS[cap.estadoReal] + "20",
                            color: ESTADO_CAPACITACION_COLORS[cap.estadoReal],
                          }}
                          title={
                            cap.estadoManual ? "Estado cargado a mano" : undefined
                          }
                        >
                          {ESTADO_CAPACITACION_LABELS[cap.estadoReal]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-500">
                      {cap.pilar && (
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: PILAR_COLORS[cap.pilar] ?? "#94A3B8" }}
                          />
                          <span className="font-medium" style={{ color: PILAR_COLORS[cap.pilar] ?? "#94A3B8" }}>
                            {cap.pilar}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="size-3.5" />
                        <span>{fmtFecha(cap.fecha)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="size-3.5" />
                        <span>{cap.instructor}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="size-3.5" />
                        <span>{formatDuracion(cap.duracion_horas)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5" />
                        {cap.total_asistentes > 0 ? (
                          <span>
                            <span className="font-semibold text-slate-700">
                              {Math.round((cap.aprobados / cap.total_asistentes) * 100)}%
                            </span>{" "}
                            aprobados ({cap.aprobados}/{cap.total_asistentes})
                          </span>
                        ) : (
                          <span className="text-slate-400">Sin inscriptos</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="size-3.5" />
                        {(() => {
                          const pct = pctAsistencia({
                            convocados: cap.total_asistentes,
                            presentes: cap.presentes,
                          })
                          if (pct === null) {
                            return <span className="text-slate-400">Sin convocados</span>
                          }
                          const color =
                            pct >= META_ASISTENCIA_PCT
                              ? "#10B981"
                              : pct >= META_ASISTENCIA_PCT - 20
                                ? "#F59E0B"
                                : "#EF4444"
                          return (
                            <span title={`Meta de asistencia: ${META_ASISTENCIA_PCT} %`}>
                              <span className="font-semibold" style={{ color }}>
                                {pct}%
                              </span>{" "}
                              asistencia ({cap.presentes}/{cap.total_asistentes})
                            </span>
                          )
                        })()}
                      </div>
                      {cap.lugar && (
                        <div className="flex items-center gap-2">
                          <MapPin className="size-3.5" />
                          <span>{cap.lugar}</span>
                        </div>
                      )}
                      {misPendientes.includes(cap.id) && (
                        // La tarjeta entera ya es un Link: un <a> adentro de otro no es
                        // HTML válido, así que se navega a mano.
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            router.push(`/mis-capacitaciones/${cap.id}`)
                          }}
                          className="flex w-full items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-left text-amber-700 hover:bg-amber-100"
                        >
                          <ClipboardCheck className="size-3.5" />
                          <span className="font-medium">Te falta rendir este examen</span>
                        </button>
                      )}
                      {canEdit && (
                        <div className="flex justify-end gap-1 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`size-7 p-0 ${cap.visible ? "text-green-500 hover:text-green-700" : "text-slate-300 hover:text-slate-500"}`}
                            title={cap.visible ? "Visible para empleados — click para ocultar" : "Oculta — click para hacer visible"}
                            onClick={async (e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const result = await toggleCapacitacionVisible(cap.id, !cap.visible)
                              if ("error" in result) {
                                toast.error(result.error)
                              } else {
                                setCapacitaciones((prev) =>
                                  prev.map((c) =>
                                    c.id === cap.id ? { ...c, visible: !c.visible } : c
                                  )
                                )
                                toast.success(cap.visible ? "Oculta para empleados" : "Visible para empleados")
                              }
                            }}
                          >
                            {cap.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-slate-400 hover:text-red-500"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleDelete(cap.id)
                            }}
                            disabled={deleting === cap.id}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
