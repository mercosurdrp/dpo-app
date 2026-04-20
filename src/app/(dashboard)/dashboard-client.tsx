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
  ArrowRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import type { Auditoria, Pilar } from "@/types/database"
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

function OverallScoreBadge({ score }: { score: number }) {
  const color = getScoreColor(score)
  const circumference = 2 * Math.PI * 20
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#E5E7EB" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>
            {Math.round(score)}
          </span>
        </div>
      </div>
    </div>
  )
}

function PillarCard({
  pilar,
  scoreData,
}: {
  pilar: Pilar
  scoreData?: PillarScoreResult
}) {
  const IconComp = iconMap[pilar.icono] ?? ClipboardList
  const hasScore = !!scoreData && scoreData.total > 0
  const pct = hasScore ? (scoreData.answered / scoreData.total) * 100 : 0

  return (
    <Card className="group/pillar relative overflow-hidden transition-shadow hover:shadow-lg">
      {/* Color accent top bar */}
      <div className="h-1" style={{ backgroundColor: pilar.color }} />

      <CardContent className="flex flex-col gap-4 pt-4 pb-2">
        {/* Icon + Name */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${pilar.color}15`, color: pilar.color }}
          >
            <IconComp className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              {pilar.nombre}
            </h3>
            {hasScore && (
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="text-2xl font-bold"
                  style={{ color: getScoreColor(scoreData.score) }}
                >
                  {Math.round(scoreData.score)}%
                </span>
                <Badge variant={trafficBadgeVariant(scoreData.score)} className="text-[10px]">
                  {trafficLabel(scoreData.score)}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar (if audit data exists) */}
        {hasScore && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {scoreData.answered}/{scoreData.total} respondidas
              </span>
              <span>{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} />
          </div>
        )}

        {!hasScore && (
          <p className="text-xs text-muted-foreground">
            Sin datos de auditoria
          </p>
        )}

        {/* Action button */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            render={<Link href={`/pilares/${pilar.id}`} />}
          >
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            Ver Pilar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Main ----------

export function DashboardClient({
  data,
  pilares,
}: {
  data: DashboardData
  pilares: Pilar[]
}) {
  const {
    auditoria,
    pillarScores,
    overallScore,
    pendingActions,
    totalPreguntas,
    totalRespondidas,
  } = data

  // Map scores by pilar ID for quick lookup
  const scoreMap = new Map(pillarScores.map((s) => [s.pilarId, s]))

  // Mandatory count
  const mandatoryCumplidas = pillarScores.filter(
    (p) => p.mandatoryScore >= 60
  ).length

  // Radar data
  const radarData = pillarScores.map((p) => ({
    pilar:
      p.pilarNombre.length > 14
        ? p.pilarNombre.slice(0, 12) + "..."
        : p.pilarNombre,
    score: Math.round(p.score),
    fullMark: 100,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            DPO {process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Region Pampeana"}
          </h1>
          {auditoria && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {auditoria.nombre}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {ESTADO_AUDITORIA_LABELS[auditoria.estado] ?? auditoria.estado}
              </Badge>
            </div>
          )}
          {!auditoria && (
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primera auditoria para comenzar
            </p>
          )}
        </div>

        {auditoria && <OverallScoreBadge score={overallScore} />}

        {!auditoria && (
          <Button render={<Link href="/auditorias/nueva" />}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Crear Auditoria
          </Button>
        )}
      </div>

      {/* Quick stats row (only if audit exists) */}
      {auditoria && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card size="sm">
            <CardContent className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
                <ClipboardList className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Respondidas</p>
                <p className="text-lg font-bold">
                  {totalRespondidas}
                  <span className="text-xs font-normal text-muted-foreground">
                    /{totalPreguntas}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Acciones pendientes</p>
                <p className="text-lg font-bold">{pendingActions}</p>
              </div>
              <Link
                href="/acciones"
                className="ml-auto text-xs text-blue-600 hover:underline"
              >
                Ver
              </Link>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mandatorios OK</p>
                <p className="text-lg font-bold">
                  {mandatoryCumplidas}
                  <span className="text-xs font-normal text-muted-foreground">
                    /{pillarScores.length}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 7 Pillar Cards - THE MAIN FEATURE */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Pilares DPO
        </h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pilares.map((pilar) => (
            <PillarCard
              key={pilar.id}
              pilar={pilar}
              scoreData={scoreMap.get(pilar.id)}
            />
          ))}
        </div>
      </div>

      {/* Radar chart (only if audit data exists) */}
      {auditoria && radarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Score por Pilar</CardTitle>
          </CardHeader>
          <CardContent>
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
                <Tooltip formatter={(value) => [`${value}%`, "Score"]} />
                <Radar
                  name="Actual"
                  dataKey="score"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Link to auditorias */}
      {auditoria && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            render={<Link href="/auditorias" />}
          >
            Ver todas las auditorias
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
