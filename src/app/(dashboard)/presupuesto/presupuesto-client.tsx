"use client"

import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import {
  Wallet,
  FileText,
  Upload,
  Plus,
  Pencil,
  Trash2,
  FileDown,
  CheckCircle2,
  Send,
  Eye,
  Info,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { IniciativasAhorroSection } from "@/components/presupuesto/iniciativas-ahorro-section"
import { PlanesAccionSection } from "@/components/presupuesto/planes-accion-section"
import { InversionesSection } from "@/components/presupuesto/inversiones-section"
import {
  eliminarEerrAnual,
  eliminarTarea,
  getSignedUrl,
} from "@/actions/presupuesto"
import { SubirPresupuestoAnualDialog } from "@/components/presupuesto/subir-presupuesto-anual-dialog"
import { SubirEerrAnualDialog } from "@/components/presupuesto/subir-eerr-anual-dialog"
import { TareaFormDialog } from "@/components/presupuesto/tarea-form-dialog"
import { GenerarTareasDialog } from "@/components/presupuesto/generar-tareas-dialog"
import { ResponderTareaDialog } from "@/components/presupuesto/responder-tarea-dialog"
import { VerTareaDialog } from "@/components/presupuesto/ver-tarea-dialog"
import type {
  EstadoPresupuestoTarea,
  IniciativaAhorroConDetalle,
  InversionConDetalle,
  PlanAccionPresupuestoConDetalle,
  PresupuestoAnual,
  PresupuestoEerrAnual,
  PresupuestoTareaConResponsable,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  aniosDisponibles: number[]
  anioActivo: number
  anual: PresupuestoAnual | null
  eerr: PresupuestoEerrAnual | null
  tareas: PresupuestoTareaConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  currentProfileId: string | null
  mostrarIniciativas: boolean
  iniciativas: IniciativaAhorroConDetalle[]
  mostrarPlanesAccion: boolean
  planesAccion: PlanAccionPresupuestoConDetalle[]
  mostrarInversiones: boolean
  inversiones: InversionConDetalle[]
}

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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function DesvioBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    return <span className="text-muted-foreground">—</span>
  }
  const abs = Math.abs(pct)
  const sign = pct > 0 ? "+" : ""
  if (abs < 5) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        {sign}
        {pct.toFixed(1)}%
      </Badge>
    )
  }
  if (abs < 15) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        {sign}
        {pct.toFixed(1)}%
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      {sign}
      {pct.toFixed(1)}%
    </Badge>
  )
}

function EstadoBadge({ estado }: { estado: EstadoPresupuestoTarea }) {
  if (estado === "completada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Completada
      </Badge>
    )
  }
  if (estado === "en_progreso") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En progreso
      </Badge>
    )
  }
  return (
    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
      Pendiente
    </Badge>
  )
}

export function PresupuestoClient({
  aniosDisponibles,
  anioActivo,
  anual,
  eerr,
  tareas,
  responsables,
  puedeEditar,
  currentProfileId,
  mostrarIniciativas,
  iniciativas,
  mostrarPlanesAccion,
  planesAccion,
  mostrarInversiones,
  inversiones,
}: Props) {
  const router = useRouter()
  const refrescarConScroll = useRefrescarConScroll()
  const [, startTransition] = useTransition()

  // Lista de años a mostrar en el selector: los que existen en BD + el actual
  // y siguiente, sin duplicados, ordenados desc.
  const aniosSelector = useMemo(() => {
    const y = new Date().getFullYear()
    const set = new Set<number>([...aniosDisponibles, y, y + 1, anioActivo])
    return Array.from(set).sort((a, b) => b - a)
  }, [aniosDisponibles, anioActivo])

  // Diálogos: anual
  const [openAnual, setOpenAnual] = useState(false)
  // Diálogos: EERR anual
  const [openEerr, setOpenEerr] = useState(false)
  // Diálogos: tarea
  const [openTarea, setOpenTarea] = useState(false)
  // Diálogos: generar tareas desde EERR
  const [openGenerar, setOpenGenerar] = useState(false)
  const [tareaEditando, setTareaEditando] =
    useState<PresupuestoTareaConResponsable | null>(null)
  // Diálogos: responder tarea
  const [tareaRespondiendo, setTareaRespondiendo] =
    useState<PresupuestoTareaConResponsable | null>(null)
  // Diálogos: ver detalle de tarea (solo lectura)
  const [tareaViendo, setTareaViendo] =
    useState<PresupuestoTareaConResponsable | null>(null)

  // Mes activo (el de la vista). Default = mes actual.
  const [mesActivo, setMesActivo] = useState<number>(
    new Date().getMonth() + 1,
  )

  // Filtros adicionales en tabla tareas (mes ya está fijado por mesActivo)
  const [filtroResp, setFiltroResp] = useState<string>("todos")
  const [filtroEstado, setFiltroEstado] = useState<string>("todos")

  function refrescar() {
    refrescarConScroll()
  }

  function cambiarAnio(nuevo: string | null) {
    if (!nuevo) return
    router.push(`/presupuesto?anio=${nuevo}`)
  }

  async function abrirArchivo(url: string | null) {
    if (!url) return
    const result = await getSignedUrl(url)
    if ("error" in result) {
      alert(`Error abriendo archivo: ${result.error}`)
      return
    }
    abrirArchivoEnVisor(result.data.url)
  }

  function handleEliminarEerr() {
    if (
      !confirm(
        `¿Eliminar el Estado de Resultado de ${anioActivo}? Se borra el archivo y se podrá subir uno nuevo.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarEerrAnual(anioActivo)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function handleEliminarTarea(t: PresupuestoTareaConResponsable) {
    if (
      !confirm(
        `¿Eliminar la tarea "${t.rubro}" de ${MESES[t.mes - 1]}? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarTarea(t.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  // Filtrado de tareas — siempre por el mes activo
  const tareasFiltradas = useMemo(() => {
    return tareas.filter((t) => {
      if (t.mes !== mesActivo) return false
      if (filtroResp !== "todos") {
        if (filtroResp === "sin" && t.responsable_id) return false
        if (filtroResp !== "sin" && t.responsable_id !== filtroResp)
          return false
      }
      if (filtroEstado !== "todos" && t.estado !== filtroEstado) return false
      return true
    })
  }, [tareas, mesActivo, filtroResp, filtroEstado])

  const tareasDelMes = useMemo(
    () => tareas.filter((t) => t.mes === mesActivo),
    [tareas, mesActivo],
  )

  function puedeResponder(t: PresupuestoTareaConResponsable): boolean {
    // Los editores (admin/supervisor) pueden reabrir/modificar incluso una
    // tarea ya completada; el responsable no puede tocarla una vez cerrada.
    if (puedeEditar) return true
    if (t.estado === "completada") return false
    if (currentProfileId && t.responsable_id === currentProfileId) return true
    return false
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Wallet className="size-6 text-slate-700" />
            Presupuesto
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Carga del presupuesto anual, Estado de Resultado del año y tareas
            mensuales de análisis de desvíos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-36">
            <Select value={String(anioActivo)} onValueChange={cambiarAnio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aniosSelector.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    Año {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs defaultValue="presupuesto" className="w-full">
        <TabsList variant="line">
          <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
          {mostrarIniciativas && (
            <TabsTrigger value="iniciativas">Iniciativas de Ahorro</TabsTrigger>
          )}
          {mostrarPlanesAccion && (
            <TabsTrigger value="planes-accion">Plan de Acción</TabsTrigger>
          )}
          {mostrarInversiones && (
            <TabsTrigger value="inversiones">Inversiones</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="presupuesto" className="mt-4 space-y-6">
      {/* Sección 1 — Presupuesto anual */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Presupuesto anual {anioActivo}
        </h2>
        <Card>
          <CardContent className="pt-2">
            {anual && anual.archivo_url ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {anual.archivo_nombre ?? "Presupuesto"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Subido el {formatDateTime(anual.created_at)}
                      {anual.updated_at &&
                        anual.updated_at !== anual.created_at &&
                        ` · Actualizado el ${formatDateTime(anual.updated_at)}`}
                    </p>
                    {anual.observaciones && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {anual.observaciones}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirArchivo(anual.archivo_url)}
                  >
                    <FileDown className="mr-2 size-4" />
                    Ver
                  </Button>
                  {puedeEditar && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setOpenAnual(true)}
                    >
                      <Upload className="mr-2 size-4" />
                      Reemplazar
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                    <FileText className="size-5" />
                  </div>
                  <span>Sin presupuesto cargado para {anioActivo}</span>
                </div>
                {puedeEditar && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOpenAnual(true)}
                  >
                    <Upload className="mr-2 size-4" />
                    Subir presupuesto
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Sección 2 — Estado de Resultado anual (un archivo, se va pisando) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Estado de Resultado {anioActivo}
        </h2>
        <Card>
          <CardContent className="pt-2">
            {eerr && eerr.archivo_url ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {eerr.archivo_nombre ?? "Estado de Resultado"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Subido el {formatDateTime(eerr.created_at)}
                      {eerr.updated_at &&
                        eerr.updated_at !== eerr.created_at &&
                        ` · Actualizado el ${formatDateTime(eerr.updated_at)}`}
                    </p>
                    {eerr.observaciones && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {eerr.observaciones}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirArchivo(eerr.archivo_url)}
                  >
                    <FileDown className="mr-2 size-4" />
                    Ver
                  </Button>
                  {puedeEditar && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setOpenEerr(true)}
                      >
                        <Upload className="mr-2 size-4" />
                        Reemplazar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={handleEliminarEerr}
                        title="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                    <FileText className="size-5" />
                  </div>
                  <span>
                    Sin Estado de Resultado cargado para {anioActivo}
                  </span>
                </div>
                {puedeEditar && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOpenEerr(true)}
                  >
                    <Upload className="mr-2 size-4" />
                    Subir Estado de Resultado
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          Se sube un único archivo por año que se va pisando mes a mes (contiene
          todos los meses adentro).
        </p>
      </section>

      {/* Criterio de análisis de desvíos */}
      <section>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <Info className="size-5 shrink-0 text-blue-600" />
            <div className="space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                Criterio de análisis de desvíos
              </p>
              <div>
                <p className="font-medium text-slate-800">Costos fijos</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>
                    Desvío mayor a <strong>±15%</strong> → se analiza{" "}
                    <strong>mensualmente</strong>.
                  </li>
                  <li>
                    Desvío dentro de <strong>±15%</strong> → se analiza{" "}
                    <strong>trimestralmente</strong> (Q1, Q2, Q3, Q4).
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-slate-800">Costos variables</p>
                <p className="ml-4">
                  Se analiza cuando el desvío supera <strong>±15%</strong>{" "}
                  <em>o</em> <strong>±$250.000</strong>.
                </p>
              </div>
              <p className="text-slate-600">
                Además, todo desvío en rubros <strong>no presupuestados</strong>{" "}
                debe analizarse.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección 3 — Tareas de análisis */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Tareas de análisis — {MESES[mesActivo - 1]} {anioActivo}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {tareasDelMes.length}
            </span>
          </h2>
          {puedeEditar && (
            <div className="flex gap-2">
              {eerr && eerr.archivo_url && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenGenerar(true)}
                >
                  <Sparkles className="mr-2 size-4" />
                  Generar tareas sugeridas
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setTareaEditando(null)
                  setOpenTarea(true)
                }}
              >
                <Plus className="mr-2 size-4" />
                Nueva tarea
              </Button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="mb-3 flex flex-wrap gap-2">
          <Select
            value={String(mesActivo)}
            onValueChange={(v: string | null) =>
              setMesActivo(Number(v) || mesActivo)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((nom, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtroResp}
            onValueChange={(v: string | null) => setFiltroResp(v ?? "todos")}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los responsables</SelectItem>
              <SelectItem value="sin">Sin asignar</SelectItem>
              {responsables.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtroEstado}
            onValueChange={(v: string | null) => setFiltroEstado(v ?? "todos")}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="en_progreso">En progreso</SelectItem>
              <SelectItem value="completada">Completada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabla */}
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rubro</TableHead>
                <TableHead className="text-right">Presupuestado</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead>Desvío</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tareasFiltradas.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {tareasDelMes.length === 0
                      ? `Sin tareas para ${MESES[mesActivo - 1]} ${anioActivo}.`
                      : "Sin tareas que coincidan con los filtros."}
                    {puedeEditar && tareasDelMes.length === 0 && (
                      <>
                        {" "}
                        <button
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() => {
                            setTareaEditando(null)
                            setOpenTarea(true)
                          }}
                        >
                          Agregar la primera
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {tareasFiltradas.map((t) => {
                const mostrarResponder = puedeResponder(t)
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.rubro}
                      {t.descripcion && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {t.descripcion}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatMoney(t.monto_presupuestado)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatMoney(t.monto_real)}
                    </TableCell>
                    <TableCell>
                      <DesvioBadge pct={t.desvio_pct} />
                    </TableCell>
                    <TableCell>
                      {t.responsable_nombre ?? (
                        <span className="italic text-muted-foreground">
                          Sin asignar
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={t.estado} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(t.fecha_limite)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTareaViendo(t)}
                          title="Ver detalle"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {t.evidencia_url && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => abrirArchivo(t.evidencia_url)}
                            title={`Ver evidencia${t.evidencia_nombre ? `: ${t.evidencia_nombre}` : ""}`}
                          >
                            <FileDown className="size-3.5" />
                          </Button>
                        )}
                        {mostrarResponder && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTareaRespondiendo(t)}
                            title="Responder"
                          >
                            <Send className="size-3.5" />
                          </Button>
                        )}
                        {puedeEditar && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTareaEditando(t)
                                setOpenTarea(true)
                              }}
                              title="Editar"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleEliminarTarea(t)}
                              title="Eliminar"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>
        </TabsContent>

        {mostrarIniciativas && (
          <TabsContent value="iniciativas" className="mt-4">
            <IniciativasAhorroSection
              anio={anioActivo}
              iniciativas={iniciativas}
              responsables={responsables}
              puedeEditar={puedeEditar}
            />
          </TabsContent>
        )}

        {mostrarPlanesAccion && (
          <TabsContent value="planes-accion" className="mt-4">
            <PlanesAccionSection
              anio={anioActivo}
              planes={planesAccion}
              responsables={responsables}
              tareas={tareas}
              puedeEditar={puedeEditar}
            />
          </TabsContent>
        )}

        {mostrarInversiones && (
          <TabsContent value="inversiones" className="mt-4">
            <InversionesSection
              anio={anioActivo}
              inversiones={inversiones}
              responsables={responsables}
              puedeEditar={puedeEditar}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Diálogos */}
      {puedeEditar && (
        <>
          <SubirPresupuestoAnualDialog
            open={openAnual}
            onOpenChange={setOpenAnual}
            anio={anioActivo}
            tieneArchivo={!!(anual && anual.archivo_url)}
            onSaved={refrescar}
          />
          <SubirEerrAnualDialog
            open={openEerr}
            onOpenChange={setOpenEerr}
            anio={anioActivo}
            tieneArchivo={!!(eerr && eerr.archivo_url)}
            defaultObservaciones={eerr?.observaciones ?? ""}
            onSaved={refrescar}
          />
          <TareaFormDialog
            open={openTarea}
            onOpenChange={setOpenTarea}
            anio={anioActivo}
            defaultMes={mesActivo}
            tarea={tareaEditando}
            responsables={responsables}
            onSaved={refrescar}
          />
          <GenerarTareasDialog
            open={openGenerar}
            onOpenChange={setOpenGenerar}
            anio={anioActivo}
            defaultMes={mesActivo}
            responsables={responsables}
            onSaved={refrescar}
          />
        </>
      )}

      {/* Responder tarea (puede abrirlo el responsable aunque no sea editor) */}
      {tareaRespondiendo && (
        <ResponderTareaDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setTareaRespondiendo(null)
          }}
          tarea={tareaRespondiendo}
          onSaved={refrescar}
        />
      )}

      {/* Ver detalle de tarea (solo lectura, disponible para cualquiera) */}
      {tareaViendo && (
        <VerTareaDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setTareaViendo(null)
          }}
          tarea={tareaViendo}
          onAbrirArchivo={abrirArchivo}
        />
      )}

    </div>
  )
}
