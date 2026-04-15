"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Upload,
  History,
  Pencil,
  Trash2,
  Target,
  CheckCircle2,
  Edit,
  ClipboardCheck,
  Award,
  FileText,
  Radio,
  Clock,
  Circle,
  Download,
  Search,
  Activity,
} from "lucide-react"
import { getDownloadUrl } from "@/actions/dpo-evidencia"
import type { DpoActividad, DpoActividadTipo } from "@/types/database"

interface Props {
  actividad: DpoActividad[]
}

const TIPO_META: Record<
  DpoActividadTipo,
  { icon: typeof Upload; label: string; bg: string; fg: string }
> = {
  archivo_subido: { icon: Upload, label: "Archivo subido", bg: "bg-blue-100", fg: "text-blue-600" },
  archivo_version_nueva: {
    icon: History,
    label: "Nueva versión",
    bg: "bg-indigo-100",
    fg: "text-indigo-600",
  },
  archivo_editado: { icon: Pencil, label: "Archivo editado", bg: "bg-amber-100", fg: "text-amber-600" },
  archivo_eliminado: { icon: Trash2, label: "Archivo eliminado", bg: "bg-red-100", fg: "text-red-600" },
  plan_creado: { icon: Target, label: "Plan creado", bg: "bg-purple-100", fg: "text-purple-600" },
  plan_cerrado: {
    icon: CheckCircle2,
    label: "Plan cerrado",
    bg: "bg-green-100",
    fg: "text-green-600",
  },
  plan_actualizado: {
    icon: Edit,
    label: "Plan actualizado",
    bg: "bg-amber-100",
    fg: "text-amber-600",
  },
  owd_creada: { icon: ClipboardCheck, label: "OWD creada", bg: "bg-teal-100", fg: "text-teal-600" },
  cert_subida: { icon: Award, label: "Certificación", bg: "bg-yellow-100", fg: "text-yellow-600" },
  sop_actualizado: { icon: FileText, label: "SOP actualizado", bg: "bg-slate-100", fg: "text-slate-600" },
  sync_foxtrot: { icon: Radio, label: "Sync Foxtrot", bg: "bg-pink-100", fg: "text-pink-600" },
  registro_tml: { icon: Clock, label: "Registro TML", bg: "bg-amber-100", fg: "text-amber-600" },
  otro: { icon: Circle, label: "Otro", bg: "bg-slate-100", fg: "text-slate-500" },
}

const PILARES = [
  { value: "all", label: "Todos los pilares" },
  { value: "entrega", label: "Entrega" },
  { value: "seguridad", label: "Seguridad" },
  { value: "gente", label: "Gente" },
  { value: "gestion", label: "Gestión" },
  { value: "flota", label: "Flota" },
  { value: "almacen", label: "Almacén" },
  { value: "planeamiento", label: "Planeamiento" },
]

const RANGOS = [
  { value: "all", label: "Todo" },
  { value: "hoy", label: "Hoy" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
]

const HORA_FMT = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

const FECHA_LARGA_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

function dayKey(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d)
}

function dayLabel(iso: string): string {
  const todayKey = dayKey(new Date().toISOString())
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yKey = dayKey(yesterday.toISOString())
  const k = dayKey(iso)
  if (k === todayKey) return "Hoy"
  if (k === yKey) return "Ayer"
  return FECHA_LARGA_FMT.format(new Date(iso))
}

function groupByDay(items: DpoActividad[]): Array<{ key: string; label: string; items: DpoActividad[] }> {
  const map = new Map<string, DpoActividad[]>()
  for (const it of items) {
    const k = dayKey(it.created_at)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(it)
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({ key, label: dayLabel(items[0].created_at), items }))
}

export function TimelineClient({ actividad }: Props) {
  const [pilar, setPilar] = useState("all")
  const [tipo, setTipo] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [rango, setRango] = useState("all")

  const filtered = useMemo(() => {
    const now = Date.now()
    const ms = (d: number) => d * 24 * 60 * 60 * 1000
    return actividad.filter((a) => {
      if (pilar !== "all" && a.pilar_codigo !== pilar) return false
      if (tipo !== "all" && a.tipo !== tipo) return false
      if (search) {
        const s = search.toLowerCase()
        const t = (a.titulo ?? "").toLowerCase()
        const d = (a.descripcion ?? "").toLowerCase()
        if (!t.includes(s) && !d.includes(s)) return false
      }
      if (rango !== "all") {
        const created = new Date(a.created_at).getTime()
        if (rango === "hoy") {
          if (dayKey(a.created_at) !== dayKey(new Date().toISOString())) return false
        } else if (rango === "7") {
          if (now - created > ms(7)) return false
        } else if (rango === "30") {
          if (now - created > ms(30)) return false
        }
      }
      return true
    })
  }, [actividad, pilar, tipo, search, rango])

  const groups = useMemo(() => groupByDay(filtered), [filtered])

  const handleDownload = async (archivoId: string) => {
    const res = await getDownloadUrl({ archivo_id: archivoId })
    if ("error" in res) return
    window.open(res.data.url, "_blank")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Timeline de actividad DPO</h1>
        <p className="text-sm text-muted-foreground">Historial completo de evidencia y acciones</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={pilar} onValueChange={(v) => setPilar(v ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Pilar" />
              </SelectTrigger>
              <SelectContent>
                {PILARES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tipo} onValueChange={(v) => setTipo(v ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {(Object.keys(TIPO_META) as DpoActividadTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={rango} onValueChange={(v) => setRango(v ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Rango" />
              </SelectTrigger>
              <SelectContent>
                {RANGOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título o descripción"
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Activity className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Sin actividad para mostrar</p>
            <p className="text-xs text-muted-foreground">
              Probá ajustar los filtros o esperá a que se registren acciones
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <div className="sticky top-0 z-10 -mx-1 bg-slate-50/95 px-1 py-1 backdrop-blur">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {g.label}
                </h3>
              </div>
              <div className="space-y-2">
                {g.items.map((a) => {
                  const meta = TIPO_META[a.tipo] ?? TIPO_META.otro
                  const Icon = meta.icon
                  const hora = HORA_FMT.format(new Date(a.created_at))
                  const isArchivo = a.tipo.startsWith("archivo_") && !!a.archivo_id
                  return (
                    <Card key={a.id}>
                      <CardContent className="flex items-start gap-3 py-3">
                        <div className={`rounded-lg p-2 ${meta.bg} ${meta.fg} flex-shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{a.titulo}</p>
                            <span className="text-[11px] text-muted-foreground">{hora}</span>
                            {a.pilar_codigo && (
                              <Badge variant="outline" className="text-[10px]">
                                {a.pilar_codigo}
                                {a.punto_codigo ? ` · ${a.punto_codigo}` : ""}
                              </Badge>
                            )}
                          </div>
                          {a.descripcion && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{a.descripcion}</p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-400">{a.user_nombre ?? "—"}</p>
                        </div>
                        {isArchivo && a.archivo_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(a.archivo_id!)}
                          >
                            <Download className="mr-1 h-4 w-4" /> Descargar
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
