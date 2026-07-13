"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Plus,
  TrendingUp,
  Award,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  crearIdea,
  revisarIdea,
  reconocerEnMatinal,
  registrarImpacto,
  actualizarReplicacion,
  agregarAvance,
  eliminarAvance,
  eliminarIdea,
  getBpArchivoUrl,
  getIdeaDetalle,
  sincronizarEvidencia44,
  agregarAccion,
  actualizarAccion,
  eliminarAccion,
} from "@/actions/buenas-practicas"
import { AdjuntosInput } from "@/components/adjuntos-input"
import { abrirArchivo } from "@/lib/abrir-archivo"
import type {
  BpDashboard,
  BpIdea,
  BpAvance,
  BpAccion,
  BpAccionEstado,
  BpEstado,
  BpArea,
  BpCategoria,
} from "@/types/buenas-practicas"
import {
  BP_AREA_LABEL,
  BP_CATEGORIA_LABEL,
  BP_ESTADO_LABEL,
  BP_AVANCE_TIPO_LABEL,
  BP_ACCION_ESTADO_LABEL,
} from "@/types/buenas-practicas"

const AREAS: BpArea[] = ["almacen", "entrega", "flota", "gestion", "seguridad", "otro"]
const CATEGORIAS: BpCategoria[] = [
  "seguridad",
  "calidad",
  "productividad",
  "capacidad",
  "otro",
]
const ESTADOS: BpEstado[] = [
  "nueva",
  "en_revision",
  "aprobada",
  "rechazada",
  "implementada",
  "replicada",
]

function estadoBadge(estado: BpEstado) {
  const map: Record<BpEstado, "default" | "secondary" | "destructive" | "outline"> = {
    nueva: "secondary",
    en_revision: "outline",
    aprobada: "default",
    rechazada: "destructive",
    implementada: "default",
    replicada: "default",
  }
  return (
    <Badge variant={map[estado]}>{BP_ESTADO_LABEL[estado]}</Badge>
  )
}

function fecha(iso: string | null): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: es })
  } catch {
    return iso
  }
}

function fechaDia(d: string | null): string {
  if (!d) return ""
  try {
    return format(new Date(`${d}T00:00:00`), "dd/MM/yyyy", { locale: es })
  } catch {
    return d
  }
}

// Timestamp → solo fecha (sin hora).
function soloFecha(iso: string | null): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso), "dd/MM/yyyy", { locale: es })
  } catch {
    return iso
  }
}

const ACCION_ESTADOS: BpAccionEstado[] = ["pendiente", "en_curso", "hecho"]

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic"]
function esImagen(mime: string | null, nombre: string | null): boolean {
  if (mime?.startsWith("image/")) return true
  const ext = nombre?.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXTS.includes(ext)
}

const NIVEL_COLOR: Record<number, string> = {
  0: "bg-red-100 text-red-700 border-red-200",
  1: "bg-amber-100 text-amber-700 border-amber-200",
  3: "bg-sky-100 text-sky-700 border-sky-200",
  5: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

interface Props {
  dashboard: BpDashboard
  esEditor: boolean
}

export function BuenasPracticasClient({ dashboard, esEditor }: Props) {
  const router = useRouter()
  const { ideas, stats, cumplimiento } = dashboard

  const [filtroEstado, setFiltroEstado] = useState<BpEstado | "all">("all")
  const [filtroArea, setFiltroArea] = useState<BpArea | "all">("all")
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtradas = ideas.filter(
    (i) =>
      (filtroEstado === "all" || i.estado === filtroEstado) &&
      (filtroArea === "all" || i.area === filtroArea),
  )

  function refrescar() {
    startTransition(() => router.refresh())
  }

  function handleSincronizar() {
    startTransition(async () => {
      const r = await sincronizarEvidencia44()
      if ("error" in r) toast.error(r.error)
      else toast.success("Evidencia del punto 4.4 actualizada en auditoría")
    })
  }

  function borrarIdea(idea: BpIdea) {
    if (
      !confirm(
        `¿Eliminar "${idea.titulo}"? Se borran también sus avances, archivos y pasos del plan.`,
      )
    )
      return
    startTransition(async () => {
      const r = await eliminarIdea(idea.id)
      if ("error" in r) toast.error(r.error)
      else {
        toast.success("Buena práctica eliminada")
        refrescar()
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Sparkles className="size-6 text-amber-500" />
            Buenas Prácticas
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Programa local para incentivar, revisar, implementar y comunicar ideas de
            mejora de los empleados (Manual DPO · Gestión 4.4). Captura ideas de almacén,
            entrega y flota orientadas a seguridad, calidad, productividad y capacidad.
          </p>
        </div>
        {esEditor && (
          <Button onClick={() => setNuevaOpen(true)}>
            <Plus className="size-4" /> Registrar idea
          </Button>
        )}
      </div>

      {/* Panel de cumplimiento del punto 4.4 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Cumplimiento del punto 4.4</CardTitle>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${NIVEL_COLOR[cumplimiento.nivelEstimado]}`}
              >
                Nivel estimado {cumplimiento.nivelEstimado}/5
              </span>
              {esEditor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSincronizar}
                  disabled={pending}
                >
                  <RefreshCw className="size-3.5" /> Actualizar evidencia 4.4
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{cumplimiento.nivelTexto}</p>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {cumplimiento.requisitos.map((r) => (
              <li
                key={r.codigo}
                className="flex items-start gap-2 rounded-md border bg-slate-50 p-2.5"
              >
                {r.cumple ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                )}
                <div className="text-xs">
                  <p className="font-semibold text-slate-800">{r.codigo}</p>
                  <p className="text-slate-600">{r.texto}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{r.detalle}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Ideas totales" value={stats.total} icon={<Sparkles className="size-4" />} />
        <StatCard label="De empleados" value={stats.desdePortal} icon={<Users className="size-4" />} />
        <StatCard label="Implementadas" value={stats.implementadas} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Con impacto KPI" value={stats.conImpacto} icon={<TrendingUp className="size-4" />} />
        <StatCard label="Replicables" value={stats.replicables} icon={<Copy className="size-4" />} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as BpEstado | "all")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {BP_ESTADO_LABEL[e]}
            </option>
          ))}
        </select>
        <select
          value={filtroArea}
          onChange={(e) => setFiltroArea(e.target.value as BpArea | "all")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">Todas las áreas</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {BP_AREA_LABEL[a]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtradas.length} de {ideas.length}
        </span>
      </div>

      {/* Lista de ideas */}
      {filtradas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay ideas que coincidan con el filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map((idea) => (
            <div
              key={idea.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetalleId(idea.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setDetalleId(idea.id)
              }}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-left transition-colors hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-900">{idea.titulo}</span>
                  {estadoBadge(idea.estado)}
                  {idea.origen === "portal" && (
                    <Badge variant="outline" className="gap-1">
                      <Users className="size-3" /> Empleado
                    </Badge>
                  )}
                  {idea.reconocido && (
                    <Badge variant="outline" className="gap-1 text-amber-700">
                      <Award className="size-3" /> Reconocida
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {BP_AREA_LABEL[idea.area]} · {BP_CATEGORIA_LABEL[idea.categoria]} ·{" "}
                  {idea.autor_nombre} · {soloFecha(idea.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {idea.kpi_nombre && idea.kpi_logrado != null && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <TrendingUp className="size-3.5" /> {idea.kpi_nombre}
                  </span>
                )}
                {esEditor && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation()
                      borrarIdea(idea)
                    }}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Eliminar ${idea.titulo}`}
                    title="Eliminar buena práctica"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {nuevaOpen && (
        <NuevaIdeaDialog
          onClose={() => setNuevaOpen(false)}
          onSaved={() => {
            setNuevaOpen(false)
            refrescar()
          }}
        />
      )}

      {detalleId && (
        <DetalleDialog
          ideaId={detalleId}
          esEditor={esEditor}
          onClose={() => setDetalleId(null)}
          onChanged={refrescar}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
        <span className="text-slate-400">{icon}</span>
      </CardContent>
    </Card>
  )
}

function NuevaIdeaDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [area, setArea] = useState<BpArea>("almacen")
  const [categoria, setCategoria] = useState<BpCategoria>("productividad")
  const [autor, setAutor] = useState("")
  const [autorArea, setAutorArea] = useState("")
  const [saving, startSaving] = useTransition()

  function guardar() {
    if (!titulo.trim()) {
      toast.error("El título es obligatorio")
      return
    }
    startSaving(async () => {
      const r = await crearIdea({
        titulo,
        descripcion,
        area,
        categoria,
        autor_nombre: autor,
        autor_area: autorArea,
      })
      if ("error" in r) toast.error(r.error)
      else {
        toast.success("Idea registrada")
        onSaved()
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar buena práctica / idea</DialogTitle>
          <DialogDescription>
            Cargá una idea de mejora propuesta por un empleado o por el equipo de gestión.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="bp-titulo">Título *</Label>
            <Input
              id="bp-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Idea en una frase"
            />
          </div>
          <div>
            <Label htmlFor="bp-desc">Descripción</Label>
            <Textarea
              id="bp-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="¿Qué propone? ¿Qué problema resuelve?"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Área que mejora</Label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as BpArea)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {BP_AREA_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Dimensión</Label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as BpCategoria)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {BP_CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bp-autor">Proponente</Label>
              <Input
                id="bp-autor"
                value={autor}
                onChange={(e) => setAutor(e.target.value)}
                placeholder="Nombre (si lo cargás vos)"
              />
            </div>
            <div>
              <Label htmlFor="bp-autor-area">Sector del proponente</Label>
              <Input
                id="bp-autor-area"
                value={autorArea}
                onChange={(e) => setAutorArea(e.target.value)}
                placeholder="Ej: Depósito"
              />
            </div>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetalleDialog({
  ideaId,
  esEditor,
  onClose,
  onChanged,
}: {
  ideaId: string
  esEditor: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [idea, setIdea] = useState<BpIdea | null>(null)
  const [avances, setAvances] = useState<BpAvance[]>([])
  const [acciones, setAcciones] = useState<BpAccion[]>([])
  const [loading, startLoad] = useTransition()
  const [acting, startAct] = useTransition()

  // Nueva acción del plan de implementación
  const [accQue, setAccQue] = useState("")
  const [accResp, setAccResp] = useState("")
  const [accFecha, setAccFecha] = useState("")

  // Formularios de acción
  const [revEstado, setRevEstado] = useState<BpEstado>("aprobada")
  const [revComentario, setRevComentario] = useState("")
  const [recoFecha, setRecoFecha] = useState("")
  const [comentario, setComentario] = useState("")
  // Evidencia de la implementación: fotos/archivos del avance
  const [adjuntos, setAdjuntos] = useState<File[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{ url: string; titulo: string } | null>(null)
  // KPI (valor de ahora vs. logrado)
  const [kpiNombre, setKpiNombre] = useState("")
  const [kpiUnidad, setKpiUnidad] = useState("")
  const [kpiBase, setKpiBase] = useState("")
  const [kpiLogr, setKpiLogr] = useState("")
  // Replicación
  const [repAreas, setRepAreas] = useState("")

  function cargar() {
    startLoad(async () => {
      const r = await getIdeaDetalle(ideaId)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setIdea(r.data.idea)
      setAvances(r.data.avances)
      setAcciones(r.data.acciones)
      setKpiNombre(r.data.idea.kpi_nombre ?? "")
      setKpiUnidad(r.data.idea.kpi_unidad ?? "")
      setKpiBase(r.data.idea.kpi_linea_base?.toString() ?? "")
      setKpiLogr(r.data.idea.kpi_logrado?.toString() ?? "")
      setRepAreas(r.data.idea.replica_areas ?? "")
    })
  }

  // Cargar al montar / cambiar de idea
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId])

  // Las miniaturas se firman por path: un avance puede traer varias imágenes.
  useEffect(() => {
    const pendientes = avances
      .flatMap((a) => a.archivos)
      .filter((arch) => esImagen(arch.mime, arch.nombre) && !imageUrls[arch.path])
    if (pendientes.length === 0) return
    let cancelado = false
    ;(async () => {
      const nuevas: Record<string, string> = {}
      for (const arch of pendientes) {
        const r = await getBpArchivoUrl(arch.path)
        if ("data" in r) nuevas[arch.path] = r.data.url
      }
      if (!cancelado && Object.keys(nuevas).length > 0) {
        setImageUrls((prev) => ({ ...prev, ...nuevas }))
      }
    })()
    return () => {
      cancelado = true
    }
  }, [avances, imageUrls])

  async function handleAbrirArchivo(path: string) {
    const r = await getBpArchivoUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    abrirArchivo(r.data.url)
  }

  function guardarAvance() {
    if (!comentario.trim() && adjuntos.length === 0) {
      toast.error("Escribí un comentario o adjuntá una foto/archivo")
      return
    }
    startAct(async () => {
      const fd = new FormData()
      fd.append("comentario", comentario.trim())
      fd.append("tipo", adjuntos.length > 0 ? "implementacion" : "comentario")
      for (const f of adjuntos) fd.append("archivo", f)
      if (tras(await agregarAvance(idea!.id, fd))) {
        setComentario("")
        setAdjuntos([])
      }
    })
  }

  function tras<T>(r: { data: T } | { error: string } | { success: true }) {
    if ("error" in r) {
      toast.error(r.error)
      return false
    }
    toast.success("Listo")
    cargar()
    onChanged()
    return true
  }

  function num(s: string): number | null {
    const n = parseFloat(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  if (loading && !idea) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargando…</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  if (!idea) return null

  return (
    <>
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {idea.titulo} {estadoBadge(idea.estado)}
          </DialogTitle>
          <DialogDescription>
            {BP_AREA_LABEL[idea.area]} · {BP_CATEGORIA_LABEL[idea.categoria]} · Propone:{" "}
            {idea.autor_nombre}
            {idea.autor_area ? ` (${idea.autor_area})` : ""} · {soloFecha(idea.created_at)}
            {idea.origen === "portal" ? " · enviada desde el Portal" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {idea.descripcion && (
            <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-slate-700">
              {idea.descripcion}
            </p>
          )}

          {/* Feedback / reconocimiento visibles */}
          {idea.comentario_revision && (
            <p className="text-xs">
              <span className="font-semibold">Feedback de revisión:</span>{" "}
              {idea.comentario_revision}
            </p>
          )}
          {idea.reconocido && idea.reconocimiento && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <Award className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Reconocimiento:</span>{" "}
                {idea.reconocimiento}
              </span>
            </p>
          )}
          {idea.kpi_nombre && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              <span className="font-semibold">KPI · {idea.kpi_nombre}:</span>{" "}
              actual {idea.kpi_linea_base ?? "—"} → logrado {idea.kpi_logrado ?? "—"}{" "}
              {idea.kpi_unidad ?? ""}
            </div>
          )}
          {idea.replicable && (
            <p className="text-xs">
              <span className="font-semibold">Replicable</span>
              {idea.replica_areas ? ` en: ${idea.replica_areas}` : ""}
            </p>
          )}

          {/* Acciones de gestión (solo editores) */}
          {esEditor && (
            <div className="space-y-4 rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Gestión de la idea
              </p>

              {/* Revisión */}
              <div className="space-y-2">
                <Label className="text-xs">Revisar / aprobar (se trata en la matinal)</Label>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={revEstado}
                    onChange={(e) => setRevEstado(e.target.value as BpEstado)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {ESTADOS.map((e) => (
                      <option key={e} value={e}>
                        {BP_ESTADO_LABEL[e]}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={revComentario}
                    onChange={(e) => setRevComentario(e.target.value)}
                    placeholder="Feedback al proponente"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={acting}
                    onClick={() =>
                      startAct(async () => {
                        tras(await revisarIdea(idea.id, revEstado, revComentario))
                        setRevComentario("")
                      })
                    }
                  >
                    Aplicar
                  </Button>
                </div>
              </div>

              {/* Reconocimiento en la reunión matinal */}
              <div className="space-y-2">
                <Label className="text-xs">Reconocer en la reunión matinal (R4.4.3)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={recoFecha}
                    onChange={(e) => setRecoFecha(e.target.value)}
                    className="w-40"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={acting}
                    onClick={() =>
                      startAct(async () => {
                        if (tras(await reconocerEnMatinal(idea.id, recoFecha)))
                          setRecoFecha("")
                      })
                    }
                  >
                    <Award className="size-3.5" /> Reconocer en matinal
                  </Button>
                  {idea.reconocida_matinal_fecha && (
                    <span className="text-xs text-amber-700">
                      Reconocida en matinal del {fechaDia(idea.reconocida_matinal_fecha)}
                    </span>
                  )}
                </div>
              </div>

              {/* KPI: valor de ahora y, al tiempo, el impacto */}
              <div className="space-y-2">
                <Label className="text-xs">
                  KPI — valor de ahora y, al tiempo, el impacto logrado (R4.4.5)
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input
                    value={kpiNombre}
                    onChange={(e) => setKpiNombre(e.target.value)}
                    placeholder="KPI"
                  />
                  <Input
                    value={kpiUnidad}
                    onChange={(e) => setKpiUnidad(e.target.value)}
                    placeholder="Unidad"
                  />
                  <Input
                    value={kpiBase}
                    onChange={(e) => setKpiBase(e.target.value)}
                    placeholder="Valor actual (ahora)"
                    inputMode="decimal"
                  />
                  <Input
                    value={kpiLogr}
                    onChange={(e) => setKpiLogr(e.target.value)}
                    placeholder="Valor logrado (impacto)"
                    inputMode="decimal"
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={acting}
                  onClick={() =>
                    startAct(async () => {
                      tras(
                        await registrarImpacto(idea.id, {
                          kpi_nombre: kpiNombre,
                          kpi_unidad: kpiUnidad,
                          kpi_linea_base: num(kpiBase),
                          kpi_logrado: num(kpiLogr),
                          marcarImplementada: num(kpiLogr) != null,
                        }),
                      )
                    })
                  }
                >
                  <TrendingUp className="size-3.5" /> Guardar KPI / impacto
                </Button>
              </div>

              {/* Replicación */}
              <div className="space-y-2">
                <Label className="text-xs">Replicar en otras áreas (R4.4.4)</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={repAreas}
                    onChange={(e) => setRepAreas(e.target.value)}
                    placeholder="¿Dónde más se puede aplicar?"
                    className="min-w-[160px] flex-1"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={acting}
                    onClick={() =>
                      startAct(async () => {
                        tras(
                          await actualizarReplicacion(idea.id, {
                            replicable: true,
                            replica_areas: repAreas,
                          }),
                        )
                      })
                    }
                  >
                    <Copy className="size-3.5" /> Marcar replicable
                  </Button>
                </div>
              </div>

              <Button
                size="sm"
                variant="destructive"
                disabled={acting}
                onClick={() =>
                  startAct(async () => {
                    if (!confirm("¿Eliminar esta idea?")) return
                    const r = await eliminarIdea(idea.id)
                    if ("error" in r) toast.error(r.error)
                    else {
                      toast.success("Eliminada")
                      onChanged()
                      onClose()
                    }
                  })
                }
              >
                <Trash2 className="size-3.5" /> Eliminar
              </Button>
            </div>
          )}

          {/* Plan de implementación: qué hacer + llevarlo a cabo */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Plan de implementación — ¿qué hacer?
            </Label>
            {acciones.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin pasos definidos todavía.
              </p>
            ) : (
              <ul className="space-y-1">
                {acciones.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-md border bg-slate-50 p-2 text-xs"
                  >
                    <select
                      value={a.estado}
                      disabled={!esEditor || acting}
                      onChange={(e) =>
                        startAct(async () => {
                          tras(
                            await actualizarAccion(a.id, {
                              estado: e.target.value as BpAccionEstado,
                            }),
                          )
                        })
                      }
                      className="h-6 rounded border border-input bg-background px-1 text-[11px]"
                    >
                      {ACCION_ESTADOS.map((s) => (
                        <option key={s} value={s}>
                          {BP_ACCION_ESTADO_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <div className="flex-1">
                      <p
                        className={
                          a.estado === "hecho"
                            ? "text-muted-foreground line-through"
                            : "text-slate-700"
                        }
                      >
                        {a.que_hacer}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.responsable || "sin responsable"}
                        {a.fecha_limite ? ` · vence ${fechaDia(a.fecha_limite)}` : ""}
                      </p>
                    </div>
                    {esEditor && (
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() =>
                          startAct(async () => {
                            const r = await eliminarAccion(a.id)
                            if ("error" in r) toast.error(r.error)
                            else {
                              cargar()
                              onChanged()
                            }
                          })
                        }
                        className="text-muted-foreground hover:text-red-600"
                        aria-label="Eliminar paso"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {esEditor && (
              <div className="flex flex-wrap gap-2">
                <Input
                  value={accQue}
                  onChange={(e) => setAccQue(e.target.value)}
                  placeholder="Qué hacer (paso de implementación)"
                  className="min-w-[160px] flex-1"
                />
                <Input
                  value={accResp}
                  onChange={(e) => setAccResp(e.target.value)}
                  placeholder="Responsable"
                  className="w-32"
                />
                <Input
                  type="date"
                  value={accFecha}
                  onChange={(e) => setAccFecha(e.target.value)}
                  className="w-36"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={acting}
                  onClick={() =>
                    startAct(async () => {
                      if (
                        tras(
                          await agregarAccion(idea.id, {
                            que_hacer: accQue,
                            responsable: accResp,
                            fecha_limite: accFecha || null,
                          }),
                        )
                      ) {
                        setAccQue("")
                        setAccResp("")
                        setAccFecha("")
                      }
                    })
                  }
                >
                  <Plus className="size-3.5" /> Agregar paso
                </Button>
              </div>
            )}
          </div>

          {/* Seguimiento + evidencia de la implementación (fotos/archivos) */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Seguimiento y evidencia
            </Label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="¿Qué se implementó? ¿Cómo quedó?"
              rows={2}
            />
            <AdjuntosInput
              archivos={adjuntos}
              onChange={setAdjuntos}
              activo
              disabled={acting}
            />
            <div className="flex justify-end">
              <Button size="sm" disabled={acting} onClick={guardarAvance}>
                <Paperclip className="size-3.5" /> Guardar avance
              </Button>
            </div>

            {avances.length > 0 && (
              <ul className="space-y-2 border-l-2 border-slate-200 pl-3">
                {avances.map((a) => (
                  <li key={a.id} className="text-xs">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-700">
                          {BP_AVANCE_TIPO_LABEL[a.tipo]}
                        </span>
                        {a.estado_resultante ? (
                          <span className="ml-1">
                            → {BP_ESTADO_LABEL[a.estado_resultante]}
                          </span>
                        ) : null}
                        {a.descripcion ? (
                          <span className="text-slate-600">: {a.descripcion}</span>
                        ) : null}
                        <span className="ml-1 text-muted-foreground">
                          · {a.autor_nombre ?? "—"} · {fecha(a.created_at)}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() =>
                          startAct(async () => {
                            if (!confirm("¿Eliminar este avance y sus archivos?")) return
                            const r = await eliminarAvance(a.id)
                            if ("error" in r) toast.error(r.error)
                            else {
                              cargar()
                              onChanged()
                            }
                          })
                        }
                        className="shrink-0 text-muted-foreground hover:text-red-600"
                        aria-label="Eliminar avance"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {a.archivos.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {a.archivos.map((arch) => {
                          const isImg = esImagen(arch.mime, arch.nombre)
                          const thumb = imageUrls[arch.path]
                          return isImg && thumb ? (
                            <button
                              key={arch.path}
                              type="button"
                              onClick={() =>
                                setLightbox({ url: thumb, titulo: arch.nombre })
                              }
                              className="overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                              title={arch.nombre}
                            >
                              <img
                                src={thumb}
                                alt={arch.nombre}
                                className="size-16 object-cover"
                              />
                            </button>
                          ) : (
                            <Button
                              key={arch.path}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => handleAbrirArchivo(arch.path)}
                            >
                              {isImg ? (
                                <ImageIcon className="size-3.5" />
                              ) : (
                                <FileText className="size-3.5" />
                              )}
                              {arch.nombre}
                              <Download className="size-3" />
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{lightbox?.titulo ?? "Vista previa"}</DialogTitle>
        </DialogHeader>
        {lightbox && (
          <img
            src={lightbox.url}
            alt={lightbox.titulo}
            className="h-auto max-h-[75vh] w-full rounded object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
