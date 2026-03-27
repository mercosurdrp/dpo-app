"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  ShieldCheck,
  Users,
  Wrench,
  Settings,
  Award,
  Leaf,
  HardHat,
  ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateAuditoriaEstado } from "@/actions/auditorias"
import {
  ESTADO_AUDITORIA_LABELS,
  ESTADO_AUDITORIA_COLORS,
} from "@/lib/constants"
import { getScoreColor, calcOverallScore } from "@/lib/scoring"
import type { Auditoria, EstadoAuditoria } from "@/types/database"

interface PilarProgressItem {
  pilarId: string
  pilarNombre: string
  color: string
  icono: string
  total: number
  answered: number
  score: number
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "shield-check": ShieldCheck,
  users: Users,
  wrench: Wrench,
  settings: Settings,
  award: Award,
  leaf: Leaf,
  "hard-hat": HardHat,
  ShieldCheck,
  Users,
  Wrench,
  Settings,
  Award,
  Leaf,
  HardHat,
}

const ESTADOS: EstadoAuditoria[] = [
  "borrador",
  "en_progreso",
  "completada",
  "archivada",
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function AuditDetailClient({
  auditoria,
  pilarProgress,
}: {
  auditoria: Auditoria & {
    pilarProgress: Array<{
      pilarId: string
      pilarNombre: string
      total: number
      answered: number
    }>
  }
  pilarProgress: PilarProgressItem[]
}) {
  const router = useRouter()
  const [estado, setEstado] = useState<EstadoAuditoria>(auditoria.estado)
  const [updatingEstado, setUpdatingEstado] = useState(false)

  const totalQuestions = pilarProgress.reduce((s, p) => s + p.total, 0)
  const totalAnswered = pilarProgress.reduce((s, p) => s + p.answered, 0)
  const overallPct = totalQuestions > 0 ? (totalAnswered / totalQuestions) * 100 : 0
  const overallScore = calcOverallScore(
    pilarProgress.filter((p) => p.answered > 0).map((p) => p.score)
  )

  async function handleEstadoChange(newEstado: EstadoAuditoria) {
    setUpdatingEstado(true)
    setEstado(newEstado)
    const result = await updateAuditoriaEstado(auditoria.id, newEstado)
    if ("error" in result) {
      toast.error(result.error)
      setEstado(auditoria.estado)
    } else {
      toast.success("Estado actualizado")
    }
    setUpdatingEstado(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/auditorias" />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {auditoria.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(auditoria.fecha_inicio)}
              {auditoria.fecha_fin && ` - ${formatDate(auditoria.fecha_fin)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
            style={{
              backgroundColor:
                ESTADO_AUDITORIA_COLORS[estado] ?? "#94A3B8",
            }}
          >
            {ESTADO_AUDITORIA_LABELS[estado] ?? estado}
          </span>
          <Select
            value={estado}
            onValueChange={(val) =>
              handleEstadoChange(val as EstadoAuditoria)
            }
            disabled={updatingEstado}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Cambiar estado" />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_AUDITORIA_LABELS[e] ?? e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Progreso general</p>
              <p className="text-lg font-bold">
                {totalAnswered}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {totalQuestions} respondidas
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Score general</p>
              <p
                className="text-2xl font-bold"
                style={{ color: getScoreColor(overallScore) }}
              >
                {Math.round(overallScore)}%
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Progress value={overallPct} />
          </div>
        </CardContent>
      </Card>

      {/* Pilar cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Pilares</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pilarProgress.map((pilar) => {
            const IconComp = iconMap[pilar.icono] ?? ClipboardList
            const pct =
              pilar.total > 0
                ? (pilar.answered / pilar.total) * 100
                : 0

            return (
              <Link
                key={pilar.pilarId}
                href={`/auditorias/${auditoria.id}/pilar/${pilar.pilarId}`}
                className="block transition-transform hover:scale-[1.02]"
              >
                <Card className="h-full">
                  <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: `${pilar.color}20`,
                        color: pilar.color,
                      }}
                    >
                      <IconComp className="h-5 w-5" />
                    </div>
                    <CardTitle className="truncate text-sm">
                      {pilar.pilarNombre}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-2xl font-bold"
                        style={{ color: getScoreColor(pilar.score) }}
                      >
                        {Math.round(pilar.score)}%
                      </span>
                      <Badge variant="outline">
                        {pilar.answered}/{pilar.total}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progreso</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
