"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Check,
  Loader2,
  MessageSquare,
  BookOpen,
  FileText,
  ListChecks,
  Search,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { SCORE_LEVELS } from "@/lib/constants"
import type { Pilar, Pregunta } from "@/types/database"

// ---------- Types ----------

interface PreguntaConRespuesta extends Pregunta {
  respuesta: { puntaje: number | null; comentario: string | null } | null
}

interface BloqueConPreguntas {
  id: string
  nombre: string
  orden: number
  preguntas: PreguntaConRespuesta[]
}

// ---------- Score colors ----------

const SCORE_COLORS: Record<number, string> = {
  0: "#EF4444",
  1: "#F97316",
  3: "#EAB308",
  5: "#22C55E",
}

// ---------- Question Card ----------

function QuestionCard({
  pregunta,
  auditoriaId,
  onScoreChange,
}: {
  pregunta: PreguntaConRespuesta
  auditoriaId: string
  onScoreChange: (preguntaId: string, puntaje: number) => void
}) {
  const [selectedScore, setSelectedScore] = useState<number | null>(
    pregunta.respuesta?.puntaje ?? null
  )
  const [comment, setComment] = useState(
    pregunta.respuesta?.comentario ?? ""
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showComment, setShowComment] = useState(
    !!pregunta.respuesta?.comentario
  )
  const [showGuia, setShowGuia] = useState(false)
  const [showReq, setShowReq] = useState(false)
  const [showCriterio, setShowCriterio] = useState(false)
  const [showVerificar, setShowVerificar] = useState(false)

  const doSave = useCallback(
    async (puntaje: number, comentario: string) => {
      setSaving(true)
      setSaved(false)
      const result = await saveRespuesta({
        auditoriaId,
        preguntaId: pregunta.id,
        puntaje,
        comentario: comentario || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
      setSaving(false)
    },
    [auditoriaId, pregunta.id]
  )

  function handleScoreClick(value: number) {
    setSelectedScore(value)
    onScoreChange(pregunta.id, value)
    doSave(value, comment)
  }

  function handleCommentBlur() {
    if (selectedScore !== null) {
      doSave(selectedScore, comment)
    }
  }

  const criterio = pregunta.puntaje_criterio as Record<string, string> | null

  return (
    <Card
      className="border-l-4"
      style={{
        borderLeftColor:
          selectedScore !== null ? SCORE_COLORS[selectedScore] : "#E5E7EB",
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
            <p className="mt-1 text-sm font-medium text-slate-800">
              {pregunta.texto}
            </p>
          </div>
        </div>

        {/* Score selector */}
        <div className="flex flex-wrap gap-2">
          {SCORE_LEVELS.map((level) => {
            const isSelected = selectedScore === level.value
            return (
              <button
                key={level.value}
                type="button"
                onClick={() => handleScoreClick(level.value)}
                className="flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-w-[120px]"
                style={{
                  borderColor: isSelected
                    ? SCORE_COLORS[level.value]
                    : "#E5E7EB",
                  backgroundColor: isSelected
                    ? SCORE_COLORS[level.value]
                    : "transparent",
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
        </div>

        {/* Expandable sections */}
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
          <button
            type="button"
            onClick={() => setShowComment((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
          >
            <MessageSquare className="h-3 w-3" />
            Comentario
          </button>
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

        {showComment && (
          <Textarea
            placeholder="Agregar comentario (opcional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={handleCommentBlur}
            className="min-h-12"
          />
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Main ----------

export function PilarChecklistClient({
  auditoriaId,
  auditoriaNombre,
  pilar,
  allPilares,
  bloques,
}: {
  auditoriaId: string
  auditoriaNombre: string
  pilar: Pilar
  allPilares: Pick<Pilar, "id" | "nombre" | "orden">[]
  bloques: BloqueConPreguntas[]
}) {
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    for (const b of bloques) {
      for (const p of b.preguntas) {
        if (
          p.respuesta?.puntaje !== null &&
          p.respuesta?.puntaje !== undefined
        ) {
          ids.add(p.id)
        }
      }
    }
    return ids
  })

  const totalPreguntas = bloques.reduce((s, b) => s + b.preguntas.length, 0)
  const totalAnswered = answeredIds.size
  const pct = totalPreguntas > 0 ? (totalAnswered / totalPreguntas) * 100 : 0

  // Pilar navigation
  const currentIdx = allPilares.findIndex((p) => p.id === pilar.id)
  const prevPilar = currentIdx > 0 ? allPilares[currentIdx - 1] : null
  const nextPilar =
    currentIdx < allPilares.length - 1 ? allPilares[currentIdx + 1] : null

  function handleScoreChange(preguntaId: string, _puntaje: number) {
    setAnsweredIds((prev) => {
      const next = new Set(prev)
      next.add(preguntaId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Audit context + progress */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="text-xs">
            Auditoria: {auditoriaNombre}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {totalAnswered}/{totalPreguntas} respondidas
            {totalAnswered > 0 && (
              <span> &middot; {Math.round(pct)}% completado</span>
            )}
          </p>
        </div>
        <Progress value={pct} />
      </div>

      {/* Pilar navigation */}
      <div className="flex items-center justify-between">
        {prevPilar ? (
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={`/pilares/${prevPilar.id}/checklist`} />
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
              <Link href={`/pilares/${nextPilar.id}/checklist`} />
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

      {/* Bloques accordion */}
      <Accordion defaultValue={bloques.length > 0 ? [bloques[0].id] : []}>
        {bloques.map((bloque) => {
          const bloqueAnswered = bloque.preguntas.filter((p) =>
            answeredIds.has(p.id)
          ).length

          return (
            <AccordionItem key={bloque.id} value={bloque.id}>
              <AccordionTrigger className="px-1">
                <div className="flex flex-1 items-center justify-between pr-2">
                  <span className="font-medium">{bloque.nombre}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {bloqueAnswered}/{bloque.preguntas.length}
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
                      onScoreChange={handleScoreChange}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

      {/* Also link to the original auditorias page */}
      <div className="flex justify-center pt-2">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/auditorias/${auditoriaId}`} />}
        >
          <ClipboardList className="mr-1.5 h-4 w-4" />
          Ver detalle de auditoria
        </Button>
      </div>
    </div>
  )
}
