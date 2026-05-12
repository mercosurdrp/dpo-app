"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Crown,
  ExternalLink,
  FileCheck,
  Inbox,
  Truck,
  Users,
  Warehouse,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ResponderAccionDialog } from "../5s/acciones/_components/responder-accion-dialog"
import type {
  EstadoTareaUnificado,
  MisTareasItem,
  MisTareasItemPlan,
  MisTareasItemS5,
  UserRole,
} from "@/types/database"

type Filtro = "todas" | "no_comenzada" | "en_curso" | "cerrada" | "vencidas"

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "no_comenzada", label: "No comenzadas" },
  { value: "en_curso", label: "En curso" },
  { value: "cerrada", label: "Cerradas" },
  { value: "vencidas", label: "Vencidas" },
]

const ESTADO_LABELS: Record<EstadoTareaUnificado, string> = {
  no_comenzada: "No comenzada",
  en_curso: "En curso",
  cerrada: "Cerrada",
}

const ESTADO_COLORS: Record<EstadoTareaUnificado, string> = {
  no_comenzada: "#EF4444",
  en_curso: "#F59E0B",
  cerrada: "#10B981",
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ""
  return s.length > n ? s.slice(0, n) + "…" : s
}

function getFechaTone(t: MisTareasItem) {
  if (t.estado_unificado === "cerrada") return "text-slate-500"
  if (t.is_overdue) return "text-red-600 font-semibold"
  if (t.dias_para_vencer !== null && t.dias_para_vencer <= 7) {
    return "text-orange-600"
  }
  return "text-slate-700"
}

interface Props {
  tareas: MisTareasItem[]
  currentUserId: string
  currentRole: UserRole
}

export function MisTareasClient({ tareas, currentUserId, currentRole }: Props) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>("todas")
  const [responderS5Id, setResponderS5Id] = useState<string | null>(null)

  const stats = useMemo(() => {
    const total = tareas.length
    const vencidas = tareas.filter(
      (t) => t.is_overdue && t.estado_unificado !== "cerrada"
    ).length
    const semana = tareas.filter(
      (t) =>
        t.estado_unificado !== "cerrada" &&
        t.dias_para_vencer !== null &&
        t.dias_para_vencer >= 0 &&
        t.dias_para_vencer <= 7
    ).length
    const mes = tareas.filter(
      (t) =>
        t.estado_unificado !== "cerrada" &&
        t.dias_para_vencer !== null &&
        t.dias_para_vencer >= 0 &&
        t.dias_para_vencer <= 30
    ).length
    return { total, vencidas, semana, mes }
  }, [tareas])

  const filtradas = useMemo(() => {
    let list = tareas
    if (filtro === "no_comenzada") {
      list = list.filter((t) => t.estado_unificado === "no_comenzada")
    } else if (filtro === "en_curso") {
      list = list.filter((t) => t.estado_unificado === "en_curso")
    } else if (filtro === "cerrada") {
      list = list.filter((t) => t.estado_unificado === "cerrada")
    } else if (filtro === "vencidas") {
      list = list.filter(
        (t) => t.is_overdue && t.estado_unificado !== "cerrada"
      )
    }
    return [...list].sort((a, b) => {
      const aDone = a.estado_unificado === "cerrada" ? 1 : 0
      const bDone = b.estado_unificado === "cerrada" ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      const aOver = a.is_overdue ? 0 : 1
      const bOver = b.is_overdue ? 0 : 1
      if (aOver !== bOver) return aOver - bOver
      const af = a.fecha_limite ? new Date(a.fecha_limite).getTime() : Infinity
      const bf = b.fecha_limite ? new Date(b.fecha_limite).getTime() : Infinity
      return af - bf
    })
  }, [tareas, filtro])

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-2">
          <ClipboardList className="size-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mis tareas</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total === 0
              ? "Sin tareas asignadas"
              : `${stats.total} ${stats.total === 1 ? "tarea asignada" : "tareas asignadas"}`}
            {stats.vencidas > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-red-600">
                  {stats.vencidas} vencida{stats.vencidas === 1 ? "" : "s"}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={<ClipboardList className="size-5 text-slate-500" />}
          tone="bg-slate-100"
        />
        <StatCard
          label="Vencidas"
          value={stats.vencidas}
          icon={<AlertCircle className="size-5 text-red-600" />}
          tone="bg-red-100"
        />
        <StatCard
          label="Esta semana"
          value={stats.semana}
          icon={<CalendarClock className="size-5 text-orange-600" />}
          tone="bg-orange-100"
        />
        <StatCard
          label="Este mes"
          value={stats.mes}
          icon={<Clock className="size-5 text-blue-600" />}
          tone="bg-blue-100"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const active = filtro === f.value
          return (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {filtradas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Inbox className="size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              {filtro === "todas"
                ? "No tenés tareas asignadas"
                : "Sin tareas en este filtro"}
            </p>
            <p className="text-xs text-muted-foreground">
              {filtro === "todas"
                ? "Cuando alguien te asigne una tarea, la vas a ver acá."
                : "Probá con otro filtro."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map((t) =>
            t.origen === "plan_accion" ? (
              <PlanTareaCard key={`plan-${t.id}`} tarea={t} />
            ) : (
              <S5TareaCard
                key={`s5-${t.id}`}
                tarea={t}
                onAbrir={() => setResponderS5Id(t.id)}
              />
            )
          )}
        </div>
      )}

      {responderS5Id && (
        <ResponderAccionDialog
          accionId={responderS5Id}
          open={!!responderS5Id}
          onOpenChange={(open) => {
            if (!open) setResponderS5Id(null)
          }}
          currentUserId={currentUserId}
          currentRole={currentRole}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className={`rounded-md p-2 ${tone}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function EstadoBadge({ estado }: { estado: EstadoTareaUnificado }) {
  const color = ESTADO_COLORS[estado]
  return (
    <Badge
      variant="secondary"
      className="shrink-0"
      style={{
        backgroundColor: color + "20",
        color,
      }}
    >
      {ESTADO_LABELS[estado]}
    </Badge>
  )
}

function FechaMeta({ tarea }: { tarea: MisTareasItem }) {
  const tone = getFechaTone(tarea)
  const cerrada = tarea.estado_unificado === "cerrada"
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <CalendarClock className="size-3.5" />
      {tarea.fecha_limite
        ? format(new Date(tarea.fecha_limite), "dd/MM/yyyy")
        : "Sin fecha límite"}
      {tarea.is_overdue && !cerrada && (
        <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">
          Vencida
        </span>
      )}
      {!tarea.is_overdue &&
        tarea.dias_para_vencer !== null &&
        tarea.dias_para_vencer >= 0 &&
        tarea.dias_para_vencer <= 7 &&
        !cerrada && (
          <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-700">
            {tarea.dias_para_vencer === 0
              ? "Hoy"
              : `${tarea.dias_para_vencer}d`}
          </span>
        )}
    </span>
  )
}

function PlanTareaCard({ tarea }: { tarea: MisTareasItemPlan }) {
  const isPrincipal = tarea.rol_usuario === "responsable_principal"
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-2 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-900">
              {tarea.tipo === "directa" && tarea.titulo
                ? truncate(tarea.titulo, 100)
                : truncate(tarea.descripcion, 100)}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {tarea.pregunta_id ? (
                <>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: tarea.pilar_color || "#64748B" }}
                  >
                    {tarea.pilar_nombre}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-muted-foreground">
                    {tarea.pregunta_numero}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="line-clamp-1 text-muted-foreground">
                    {truncate(tarea.pregunta_texto, 80)}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Tarea directa
                </span>
              )}
            </div>
          </div>

          <EstadoBadge estado={tarea.estado_unificado} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <FechaMeta tarea={tarea} />

            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {isPrincipal ? (
                <>
                  <Crown className="size-3.5 text-amber-600" />
                  <span className="font-medium text-amber-700">Principal</span>
                </>
              ) : (
                <>
                  <Users className="size-3.5" />
                  <span>Coresponsable</span>
                </>
              )}
            </span>

            {tarea.evidencias_count > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <FileCheck className="size-3.5" />
                {tarea.evidencias_count}{" "}
                {tarea.evidencias_count === 1 ? "evidencia" : "evidencias"}
              </span>
            )}

            {tarea.estado_unificado === "cerrada" && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Cerrada
              </span>
            )}
          </div>

          <Link href={`/planes/${tarea.id}`}>
            <Button size="sm" variant="outline">
              <ExternalLink className="mr-1.5 size-3.5" />
              Ver detalle
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function S5TareaCard({
  tarea,
  onAbrir,
}: {
  tarea: MisTareasItemS5
  onAbrir: () => void
}) {
  const ctx =
    tarea.s5_tipo === "flota"
      ? tarea.s5_vehiculo_dominio ?? "Sin vehículo"
      : tarea.s5_sector_nombre ?? (tarea.s5_sector_numero
        ? `Sector ${tarea.s5_sector_numero}`
        : "—")
  const Icon = tarea.s5_tipo === "flota" ? Truck : Warehouse
  const subjectLabel = tarea.s5_tipo === "flota" ? "Flota" : "Almacén"
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-2 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-900">
              {truncate(tarea.descripcion, 100)}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
                <Icon className="size-3" />
                5S {subjectLabel}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-muted-foreground">{ctx}</span>
            </div>
          </div>

          <EstadoBadge estado={tarea.estado_unificado} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <FechaMeta tarea={tarea} />

            {tarea.evidencias_count > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <FileCheck className="size-3.5" />
                {tarea.evidencias_count}{" "}
                {tarea.evidencias_count === 1 ? "evidencia" : "evidencias"}
              </span>
            )}

            {tarea.estado_unificado === "cerrada" && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Cerrada
              </span>
            )}
          </div>

          <Button size="sm" variant="outline" onClick={onAbrir}>
            <ExternalLink className="mr-1.5 size-3.5" />
            {tarea.estado_unificado === "cerrada" ? "Ver" : "Responder"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
