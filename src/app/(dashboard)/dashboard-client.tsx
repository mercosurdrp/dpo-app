"use client"

import Link from "next/link"
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ShieldCheck,
  Users,
  Target,
  Truck,
  Wrench,
  Warehouse,
  CalendarClock,
  Settings,
  Award,
  Leaf,
  HardHat,
  ClipboardList,
  AlertTriangle,
  CheckCircle,
  PlusCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import type { Auditoria } from "@/types/database"
import { ESTADO_AUDITORIA_LABELS } from "@/lib/constants"

// ---------- Types ----------

interface PillarScoreResult {
  pilarId: string
  pilarNombre: string
  color: string
  icono: string
  score: number
  answered: number
  total: number
  mandatoryScore: number
}

interface AuditoriaHistoryItem {
  id: string
  nombre: string
  fecha: string
  overallScore: number
}

interface DashboardData {
  auditoria: Auditoria | null
  pillarScores: PillarScoreResult[]
  overallScore: number
  pendingActions: number
  totalPreguntas: number
  totalRespondidas: number
  auditoriasHistory: AuditoriaHistoryItem[]
}

// ---------- Icon mapping ----------

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "shield-check": ShieldCheck,
  users: Users,
  target: Target,
  truck: Truck,
  wrench: Wrench,
  warehouse: Warehouse,
  "calendar-clock": CalendarClock,
  settings: Settings,
  award: Award,
  leaf: Leaf,
  "hard-hat": HardHat,
  // Fallback aliases
  ShieldAlert: ShieldCheck,
  ShieldCheck,
  Users,
  Target,
  Truck,
  Wrench,
  Warehouse,
  CalendarClock,
  Settings,
  Award,
  Leaf,
  HardHat,
}

// ---------- Helpers ----------

function getTrafficLight(score: number): "green" | "yellow" | "red" {
  if (score >= 60) return "green"
  if (score >= 40) return "yellow"
  return "red"
}

function getScoreColor(score: number): string {
  const light = getTrafficLight(score)
  switch (light) {
    case "green":
      return "#10B981"
    case "yellow":
      return "#F59E0B"
    case "red":
      return "#EF4444"
  }
}

function trafficBadgeVariant(
  score: number
): "default" | "secondary" | "destructive" {
  const light = getTrafficLight(score)
  if (light === "green") return "default"
  if (light === "yellow") return "secondary"
  return "destructive"
}

function trafficLabel(score: number): string {
  const light = getTrafficLight(score)
  if (light === "green") return "Bueno"
  if (light === "yellow") return "Regular"
  return "Bajo"
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// ---------- Sub-components ----------

function OverallScoreRing({
  score,
  label,
}: {
  score: number
  label: string
}) {
  const color = getScoreColor(score)
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-40 w-40">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {Math.round(score)}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function PillarCard({ pillar }: { pillar: PillarScoreResult }) {
  const IconComp = iconMap[pillar.icono] ?? ClipboardList
  const pct = pillar.total > 0 ? (pillar.answered / pillar.total) * 100 : 0

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${pillar.color}20`, color: pillar.color }}
        >
          <IconComp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{pillar.pilarNombre}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span
            className="text-2xl font-bold"
            style={{ color: getScoreColor(pillar.score) }}
          >
            {Math.round(pillar.score)}%
          </span>
          <Badge variant={trafficBadgeVariant(pillar.score)}>
            {trafficLabel(pillar.score)}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {pillar.answered}/{pillar.total} respondidas
            </span>
            <span>{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Main ----------

export function DashboardClient({ data }: { data: DashboardData }) {
  const {
    auditoria,
    pillarScores,
    overallScore,
    pendingActions,
    totalPreguntas,
    totalRespondidas,
    auditoriasHistory,
  } = data

  // Empty state
  if (!auditoria) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ClipboardList className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-slate-700">
          No hay auditorias
        </h2>
        <p className="text-sm text-muted-foreground">
          Crea tu primera auditoria para ver el dashboard DPO.
        </p>
        <Button render={<Link href="/auditorias/nueva" />}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Auditoria
        </Button>
      </div>
    )
  }

  // Radar data
  const radarData = pillarScores.map((p) => ({
    pilar: p.pilarNombre.length > 14
      ? p.pilarNombre.slice(0, 12) + "..."
      : p.pilarNombre,
    score: Math.round(p.score),
    fullMark: 100,
  }))

  // Mandatory count
  const mandatoryCumplidas = pillarScores.filter(
    (p) => p.mandatoryScore >= 60
  ).length

  // Trend data
  const trendData = auditoriasHistory.map((a) => ({
    nombre: a.nombre.length > 20 ? a.nombre.slice(0, 18) + "..." : a.nombre,
    fecha: formatDate(a.fecha),
    score: a.overallScore,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard DPO</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen general de la auditoria
        </p>
      </div>

      {/* Overall Score + Radar */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Overall Score Card */}
        <Card>
          <CardHeader>
            <CardTitle>Score DPO General</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <OverallScoreRing score={overallScore} label="Score DPO General" />
            <Badge variant="outline">
              {auditoria.nombre} &mdash; {formatDate(auditoria.fecha_inicio)}
            </Badge>
            <Badge variant="secondary">
              {ESTADO_AUDITORIA_LABELS[auditoria.estado] ?? auditoria.estado}
            </Badge>
          </CardContent>
        </Card>

        {/* Radar Chart Card */}
        <Card>
          <CardHeader>
            <CardTitle>Score por Pilar</CardTitle>
          </CardHeader>
          <CardContent>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid />
                  <PolarAngleAxis
                    dataKey="pilar"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Score"]}
                  />
                  <Radar
                    name="Actual"
                    dataKey="score"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sin datos de pilares
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <ClipboardList className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Preguntas respondidas
              </p>
              <p className="text-xl font-bold">
                {totalRespondidas}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {totalPreguntas}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Acciones pendientes
              </p>
              <p className="text-xl font-bold">{pendingActions}</p>
            </div>
            <Link
              href="/acciones"
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              Ver
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Pilares mandatorios cumplidos
              </p>
              <p className="text-xl font-bold">
                {mandatoryCumplidas}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {pillarScores.length}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pillar Score Cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Pilares
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pillarScores.map((p) => (
            <PillarCard key={p.pilarId} pillar={p} />
          ))}
        </div>
      </div>

      {/* Trend Chart */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Evolucion del Score</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Score"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
