"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
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
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  MessageSquare,
  BookOpen,
  FileText,
  ListChecks,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { saveRespuesta } from "@/actions/respuestas"
import {
  SCORE_LEVELS,
  DIMENSION_AUDITORIA_LABELS,
  type DimensionAuditoria,
} from "@/lib/constants"
import type { Pilar, Pregunta } from "@/types/database"

// ---------- Types ----------

type RespuestaCelda = {
  puntaje: number | null
  noAplica: boolean
  comentario: string | null
}

interface PreguntaConRespuestas extends Pregunta {
  respuestas: Partial<Record<DimensionAuditoria, RespuestaCelda>>
}

interface BloqueConPreguntas {
  id: string
  nombre: string
  orden: number
  preguntas: PreguntaConRespuestas[]
}

// ---------- Icon map ----------

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

// ---------- Score colors ----------

const SCORE_COLORS: Record<number, string> = {
  0: "#EF4444",
  1: "#F97316",
  3: "#EAB308",
  5: "#22C55E",
}

const DIMENSION_DOT: Record<DimensionAuditoria, string> = {
  WH: "#6366F1",
  DEL: "#0EA5E9",
}

// ---------- Score selector (one per dimension) ----------

type ScoreValue = number | "NA" | null

function ScoreSelector({
  dimension,
  showLabel,
  initialScore,
  initialNoAplica,
  initialComment,
  onSave,
  onScored,
}: {
  dimension: DimensionAuditoria
  showLabel: boolean
  initialScore: number | null
  initialNoAplica: boolean
  initialComment: string
  onSave: (
    dimension: DimensionAuditoria,
    puntaje: number | null,
    noAplica: boolean,
    comentario: string
  ) => Promise<void>
  onScored: (dimension: DimensionAuditoria) => void
}) {
  const [selected, setSelected] = useState<ScoreValue>(
    initialNoAplica ? "NA" : initialScore
  )
  const [comment, setComment] = useState(initialComment)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showComment, setShowComment] = useState(!!initialComment)

  async function persist(value: ScoreValue, comentario: string) {
    if (value === null) return
    setSaving(true)
    setSaved(false)
    if (value === "NA") {
      await onSave(dimension, null, true, comentario)
    } else {
      await onSave(dimension, value, false, comentario)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleScoreClick(value: ScoreValue) {
    setSelected(value)
    onScored(dimension)
    void persist(value, comment)
  }

  function handleCommentBlur() {
    if (selected !== null) void persist(selected, comment)
  }

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        {showLabel && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: DIMENSION_DOT[dimension] }}
          >
            {DIMENSION_AUDITORIA_LABELS[dimension]}
          </span>
        )}
        {saving && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Guardando...
          </span>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" />
            Guardado
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {SCORE_LEVELS.map((level) => {
          const isSelected = selected === level.value
          return (
            <button
              key={level.value}
              type="button"
              onClick={() => handleScoreClick(level.value)}
              className="flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-w-[120px]"
              style={{
                borderColor: isSelected ? SCORE_COLORS[level.value] : "#E5E7EB",
                backgroundColor: isSelected ? SCORE_COLORS[level.value] : "transparent",
                color: isSelected ? "white" : "#374151",
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  backgroundColor: isSelected
                    ? "rgba(255,255,255,0.3)"
                    : `${SCORE_COLORS[level.value]}20`,
                  color: isSelected ? "white" : SCORE_COLORS[level.value],
                }}
              >
                {level.value}
              </span>
              <span className="hidden sm:inline">{level.description}</span>
            </button>
          )
        })}
        {/* N/A — No aplica: se excluye del score del pilar */}
        <button
          type="button"
          onClick={() => handleScoreClick("NA")}
          className="flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          style={{
            borderColor: selected === "NA" ? "#64748B" : "#E5E7EB",
            backgroundColor: selected === "NA" ? "#64748B" : "transparent",
            color: selected === "NA" ? "white" : "#374151",
          }}
        >
          <span
            className="flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
            style={{
              backgroundColor:
                selected === "NA" ? "rgba(255,255,255,0.3)" : "#64748B20",
              color: selected === "NA" ? "white" : "#64748B",
            }}
          >
            N/A
          </span>
          <span className="hidden sm:inline">No aplica</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComment((v) => !v)}
          className="inline-flex items-center gap-1 self-center rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
        >
          <MessageSquare className="h-3 w-3" />
          Comentario
        </button>
      </div>

      {showComment && (
        <Textarea
          placeholder="Agregar comentario (opcional)..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={handleCommentBlur}
          className="mt-2 min-h-12"
        />
      )}
    </div>
  )
}

// ---------- Question Card ----------

function QuestionCard({
  pregunta,
  auditoriaId,
  dimensiones,
  onCellChange,
}: {
  pregunta: PreguntaConRespuestas
  auditoriaId: string
  dimensiones: DimensionAuditoria[]
  onCellChange: (preguntaId: string, dimension: DimensionAuditoria) => void
}) {
  const [showGuia, setShowGuia] = useState(false)
  const [showReq, setShowReq] = useState(false)
  const [showCriterio, setShowCriterio] = useState(false)
  const [showVerificar, setShowVerificar] = useState(false)

  const doSave = useCallback(
    async (
      dimension: DimensionAuditoria,
      puntaje: number | null,
      noAplica: boolean,
      comentario: string
    ) => {
      const result = await saveRespuesta({
        auditoriaId,
        preguntaId: pregunta.id,
        dimension,
        puntaje,
        noAplica,
        comentario: comentario || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
      }
    },
    [auditoriaId, pregunta.id]
  )

  const criterio = pregunta.puntaje_criterio as Record<string, string> | null
  const someScore = dimensiones
    .map((d) => pregunta.respuestas[d]?.puntaje)
    .find((v) => v !== null && v !== undefined)

  return (
    <Card
      className="border-l-4"
      style={{
        borderLeftColor:
          someScore !== null && someScore !== undefined
            ? SCORE_COLORS[someScore]
            : "#E5E7EB",
      }}
    >
      <CardContent className="space-y-3 pt-4">
        {/* Question header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {pregunta.numero}
              </span>
              {pregunta.mandatorio && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  Obligatorio
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {pregunta.texto}
            </p>
          </div>
        </div>

        {/* Score selectors (one per dimension) */}
        <div className="space-y-2">
          {dimensiones.map((dim) => (
            <ScoreSelector
              key={dim}
              dimension={dim}
              showLabel={dimensiones.length > 1}
              initialScore={pregunta.respuestas[dim]?.puntaje ?? null}
              initialNoAplica={pregunta.respuestas[dim]?.noAplica ?? false}
              initialComment={pregunta.respuestas[dim]?.comentario ?? ""}
              onSave={doSave}
              onScored={(d) => onCellChange(pregunta.id, d)}
            />
          ))}
        </div>

        {/* Expandable info sections (shared by the question) */}
        <div className="flex flex-wrap gap-1.5">
          {pregunta.guia && (
            <button
              type="button"
              onClick={() => setShowGuia((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
            >
              <BookOpen className="h-3 w-3" />
              Guia
            </button>
          )}
          {pregunta.requerimiento && (
            <button
              type="button"
              onClick={() => setShowReq((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
            >
              <FileText className="h-3 w-3" />
              Requerimientos
            </button>
          )}
          {criterio && Object.keys(criterio).length > 0 && (
            <button
              type="button"
              onClick={() => setShowCriterio((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
            >
              <ListChecks className="h-3 w-3" />
              Criterio de Puntaje
            </button>
          )}
          {pregunta.como_verificar && (
            <button
              type="button"
              onClick={() => setShowVerificar((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
            >
              <Search className="h-3 w-3" />
              Como verificar
            </button>
          )}
        </div>

        {/* Expandable content */}
        {showGuia && pregunta.guia && (
          <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">
              Guia
            </p>
            <p className="whitespace-pre-wrap">{pregunta.guia}</p>
          </div>
        )}

        {showReq && pregunta.requerimiento && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
              Requerimientos
            </p>
            <p className="whitespace-pre-wrap">{pregunta.requerimiento}</p>
          </div>
        )}

        {showCriterio && criterio && Object.keys(criterio).length > 0 && (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Criterio de Puntaje
            </p>
            <div className="space-y-2">
              {Object.entries(criterio).map(([key, desc]) => {
                const numericKey = parseInt(key, 10)
                const color = SCORE_COLORS[numericKey] ?? "#6B7280"
                return (
                  <div key={key} className="flex gap-2">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {key}
                    </span>
                    <p className="text-slate-700">{desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {showVerificar && pregunta.como_verificar && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-600">
              Como verificar
            </p>
            <p className="whitespace-pre-wrap">{pregunta.como_verificar}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Main ----------

export function PilarScoringClient({
  auditoriaId,
  pilar,
  allPilares,
  dimensiones,
  bloques,
}: {
  auditoriaId: string
  pilar: Pilar
  allPilares: Pick<Pilar, "id" | "nombre" | "orden">[]
  dimensiones: DimensionAuditoria[]
  bloques: BloqueConPreguntas[]
}) {
  // celdas respondidas = `${preguntaId}::${dimension}`
  const [answeredCells, setAnsweredCells] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    for (const b of bloques) {
      for (const p of b.preguntas) {
        for (const dim of dimensiones) {
          const celda = p.respuestas[dim]
          if (celda && (celda.puntaje !== null || celda.noAplica))
            ids.add(`${p.id}::${dim}`)
        }
      }
    }
    return ids
  })

  const IconComp = iconMap[pilar.icono] ?? ClipboardList

  const totalPreguntas = bloques.reduce((s, b) => s + b.preguntas.length, 0)
  const totalCells = totalPreguntas * dimensiones.length
  const totalAnswered = answeredCells.size
  const pct = totalCells > 0 ? (totalAnswered / totalCells) * 100 : 0

  // Pilar navigation
  const currentIdx = allPilares.findIndex((p) => p.id === pilar.id)
  const prevPilar = currentIdx > 0 ? allPilares[currentIdx - 1] : null
  const nextPilar =
    currentIdx < allPilares.length - 1 ? allPilares[currentIdx + 1] : null

  function handleCellChange(preguntaId: string, dimension: DimensionAuditoria) {
    setAnsweredCells((prev) => {
      const next = new Set(prev)
      next.add(`${preguntaId}::${dimension}`)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href={`/auditorias/${auditoriaId}`} />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `${pilar.color}20`,
              color: pilar.color,
            }}
          >
            <IconComp className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {pilar.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalAnswered}/{totalCells} respondidas
              {totalAnswered > 0 && (
                <span> &middot; {Math.round(pct)}% completado</span>
              )}
            </p>
          </div>
        </div>

        {/* Doble nota: leyenda */}
        {dimensiones.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Se puntúa por:</span>
            {dimensiones.map((dim) => (
              <span
                key={dim}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold text-white"
                style={{ backgroundColor: DIMENSION_DOT[dim] }}
              >
                {DIMENSION_AUDITORIA_LABELS[dim]}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <Progress value={pct} />

        {/* Pilar navigation */}
        <div className="flex items-center justify-between">
          {prevPilar ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href={`/auditorias/${auditoriaId}/pilar/${prevPilar.id}`} />
              }
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">{prevPilar.nombre}</span>
              <span className="sm:hidden">Anterior</span>
            </Button>
          ) : (
            <div />
          )}
          {nextPilar ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href={`/auditorias/${auditoriaId}/pilar/${nextPilar.id}`} />
              }
            >
              <span className="hidden sm:inline">{nextPilar.nombre}</span>
              <span className="sm:hidden">Siguiente</span>
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Bloques accordion */}
      <Accordion defaultValue={bloques.length > 0 ? [bloques[0].id] : []}>
        {bloques.map((bloque) => {
          const bloqueCells = bloque.preguntas.length * dimensiones.length
          const bloqueAnswered = bloque.preguntas.reduce(
            (s, p) =>
              s +
              dimensiones.filter((dim) => answeredCells.has(`${p.id}::${dim}`))
                .length,
            0
          )

          return (
            <AccordionItem key={bloque.id} value={bloque.id}>
              <AccordionTrigger className="px-1">
                <div className="flex flex-1 items-center justify-between pr-2">
                  <span className="font-medium">{bloque.nombre}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {bloqueAnswered}/{bloqueCells}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pb-2">
                  {bloque.preguntas.map((pregunta) => (
                    <QuestionCard
                      key={pregunta.id}
                      pregunta={pregunta}
                      auditoriaId={auditoriaId}
                      dimensiones={dimensiones}
                      onCellChange={handleCellChange}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
