"use client"

import Link from "next/link"
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
  BarChart3,
  ListTodo,
  FileCheck,
  Star,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { CATEGORIA_CONFIG, SCORE_LEVELS } from "@/lib/constants"
import type { Pilar } from "@/types/database"
import type { CategoriaGroup, PreguntaConCounts, BloqueConPreguntasGestion } from "@/actions/gestion"

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

const SCORE_COLORS: Record<number, string> = {
  0: "#EF4444",
  1: "#F97316",
  3: "#EAB308",
  5: "#22C55E",
}

function ScoreBadge({ puntaje }: { puntaje: number | null }) {
  if (puntaje === null || puntaje === undefined) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
        Sin puntuar
      </span>
    )
  }
  const color = SCORE_COLORS[puntaje] ?? "#6B7280"
  const level = SCORE_LEVELS.find((l) => l.value === puntaje)
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {puntaje} - {level?.description ?? ""}
    </span>
  )
}

function QuestionCard({
  pregunta,
  pilarId,
}: {
  pregunta: PreguntaConCounts
  pilarId: string
}) {
  const reqText = pregunta.requerimiento
    ? pregunta.requerimiento.split("\n")[0].slice(0, 100)
    : null

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                {pregunta.numero}
              </span>
              {pregunta.mandatorio && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  <Star className="mr-0.5 h-2.5 w-2.5" />
                  Obligatorio
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-800 leading-snug">
              {pregunta.texto}
            </p>
          </div>
          <ScoreBadge puntaje={pregunta.puntaje_actual} />
        </div>

        {/* Requirement preview */}
        {reqText && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {reqText}{reqText.length >= 100 ? "..." : ""}
          </p>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            <BarChart3 className="h-3 w-3" />
            {pregunta.indicadores_count} indicadores
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            <ListTodo className="h-3 w-3" />
            {pregunta.planes_count} acciones
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <FileCheck className="h-3 w-3" />
            {pregunta.evidencias_count} evidencias
          </span>
        </div>

        {/* Action */}
        <div className="flex justify-end pt-1">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/pilares/${pilarId}/pregunta/${pregunta.id}`} />}
          >
            Gestionar
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function BloqueSection({
  bloque,
  pilarId,
}: {
  bloque: BloqueConPreguntasGestion
  pilarId: string
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-1">
        {bloque.nombre}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {bloque.preguntas.map((pregunta) => (
          <QuestionCard
            key={pregunta.id}
            pregunta={pregunta}
            pilarId={pilarId}
          />
        ))}
      </div>
    </div>
  )
}

function CategoriaContent({
  group,
  pilarId,
}: {
  group: CategoriaGroup
  pilarId: string
}) {
  if (group.bloques.length === 0 || group.bloques.every((b) => b.preguntas.length === 0)) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Sin preguntas en esta seccion
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-4">
      {group.bloques
        .filter((b) => b.preguntas.length > 0)
        .map((bloque) => (
          <BloqueSection key={bloque.id} bloque={bloque} pilarId={pilarId} />
        ))}
    </div>
  )
}

export function PilarClient({
  pilar,
  categorias,
}: {
  pilar: Pilar
  categorias: CategoriaGroup[]
}) {
  const IconComp = iconMap[pilar.icono] ?? ClipboardList

  // Calculate total questions and scored
  const allPreguntas = categorias.flatMap((c) =>
    c.bloques.flatMap((b) => b.preguntas)
  )
  const scored = allPreguntas.filter((p) => p.puntaje_actual !== null)
  const totalScore =
    scored.length > 0
      ? Math.round(
          (scored.reduce((s, p) => s + (p.puntaje_actual ?? 0), 0) /
            (scored.length * 5)) *
            100
        )
      : null

  const catMap = new Map(categorias.map((c) => [c.categoria, c]))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${pilar.color}15`,
            color: pilar.color,
          }}
        >
          <IconComp className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="text-xl font-bold sm:text-2xl"
            style={{ color: pilar.color }}
          >
            {pilar.nombre}
          </h1>
          <p className="text-xs text-muted-foreground">
            {allPreguntas.length} preguntas &middot; {scored.length} puntuadas
          </p>
        </div>
        {totalScore !== null && (
          <Badge
            variant="outline"
            className="text-sm font-bold"
            style={{
              borderColor: pilar.color,
              color: pilar.color,
            }}
          >
            {totalScore}%
          </Badge>
        )}
      </div>

      {/* 3 Category Tabs */}
      <Tabs defaultValue="fundamentales">
        <TabsList variant="line" className="w-full overflow-x-auto">
          {(["fundamentales", "mantener", "mejorar"] as const).map((cat) => {
            const config = CATEGORIA_CONFIG[cat]
            const group = catMap.get(cat)
            const count = group
              ? group.bloques.reduce((s, b) => s + b.preguntas.length, 0)
              : 0
            return (
              <TabsTrigger key={cat} value={cat}>
                <span
                  className="mr-1 h-2 w-2 rounded-full inline-block"
                  style={{ backgroundColor: config.color }}
                />
                <span className="hidden sm:inline">{config.label}</span>
                <span className="sm:hidden">
                  {cat === "fundamentales"
                    ? "Fund."
                    : cat === "mantener"
                    ? "Mantener"
                    : "Mejorar"}
                </span>
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({count})
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {(["fundamentales", "mantener", "mejorar"] as const).map((cat) => {
          const group = catMap.get(cat) ?? {
            categoria: cat,
            bloques: [],
          }
          return (
            <TabsContent key={cat} value={cat}>
              <CategoriaContent group={group} pilarId={pilar.id} />
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
