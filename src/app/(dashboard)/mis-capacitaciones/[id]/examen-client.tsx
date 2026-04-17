"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Send,
  Trophy,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { submitExamen } from "@/actions/capacitaciones"
import type {
  CapacitacionFull,
  CapacitacionPregunta,
  CapacitacionRespuesta,
  AsistenciaConEmpleado,
} from "@/types/database"

interface IntentoHistorial {
  intento_n: number
  nota: number
  correctas: number | null
  total: number | null
  created_at: string
}

interface Props {
  capacitacion: CapacitacionFull
  preguntas: CapacitacionPregunta[]
  misRespuestas: CapacitacionRespuesta[]
  asistencia: AsistenciaConEmpleado | null
  intentos: IntentoHistorial[]
}

export function ExamenClient({
  capacitacion,
  preguntas,
  misRespuestas,
  asistencia,
  intentos,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [resultado, setResultado] = useState<{
    nota: number
    correctas: number
    total: number
    intento_n: number
  } | null>(null)
  const [retrying, setRetrying] = useState(false)

  const yaCompletado = misRespuestas.length > 0 && !retrying
  const nota = asistencia?.nota
  const ultimoIntentoN = resultado?.intento_n ?? intentos[intentos.length - 1]?.intento_n ?? 1

  function handleRetry() {
    setAnswers({})
    setResultado(null)
    setRetrying(true)
  }

  // Parse opciones (might be string or array)
  function parseOpciones(opciones: string[] | string): string[] {
    if (Array.isArray(opciones)) return opciones
    try {
      return JSON.parse(opciones)
    } catch {
      return []
    }
  }

  function handleSelect(preguntaId: string, index: number) {
    if ((yaCompletado || resultado) && !retrying) return
    setAnswers((prev) => ({ ...prev, [preguntaId]: index }))
  }

  async function handleSubmit() {
    if (preguntas.length === 0) return

    const unanswered = preguntas.filter((p) => answers[p.id] === undefined)
    if (unanswered.length > 0) {
      toast.error(`Faltan ${unanswered.length} preguntas por responder`)
      return
    }

    startTransition(async () => {
      const respuestas = preguntas.map((p) => ({
        pregunta_id: p.id,
        respuesta_elegida: answers[p.id],
      }))

      const result = await submitExamen(capacitacion.id, respuestas)

      if ("error" in result) {
        toast.error(result.error)
      } else {
        setResultado(result.data)
        if (result.data.nota >= 80) {
          toast.success(`Aprobaste con ${result.data.nota}%`)
        } else {
          toast.error(`No aprobaste: ${result.data.nota}%`)
        }
      }
    })
  }

  // Show result screen
  if (yaCompletado || resultado) {
    const finalNota = resultado?.nota ?? nota ?? 0
    const isAprobado = finalNota >= 80

    // Build a map of previous answers
    const prevAnswers = new Map(
      misRespuestas.map((r) => [r.pregunta_id, r])
    )

    return (
      <div className="space-y-6">
        <Link
          href="/mis-capacitaciones"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-3.5" />
          Volver
        </Link>

        <div className="text-center">
          <div
            className={`mx-auto mb-4 flex size-20 items-center justify-center rounded-full ${
              isAprobado ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {isAprobado ? (
              <Trophy className="size-10 text-green-600" />
            ) : (
              <AlertTriangle className="size-10 text-red-600" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {capacitacion.titulo}
          </h1>
          <p
            className="mt-2 text-4xl font-bold"
            style={{ color: isAprobado ? "#10B981" : "#EF4444" }}
          >
            {finalNota}%
          </p>
          <p className="text-sm text-slate-500">
            {isAprobado ? "Aprobado" : "Desaprobado"} - Intento #{ultimoIntentoN}
            {resultado && ` - ${resultado.correctas}/${resultado.total} correctas`}
          </p>

          {!isAprobado && (
            <div className="mt-6">
              <Button
                onClick={handleRetry}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RotateCcw className="mr-2 size-4" />
                Rendir nuevamente
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                Necesitás 80% o más para aprobar
              </p>
            </div>
          )}
        </div>

        {intentos.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Historial de intentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {intentos.map((it) => (
                  <div
                    key={it.intento_n}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">Intento #{it.intento_n}</span>
                    <span className="text-slate-500">
                      {new Date(it.created_at).toLocaleDateString("es-AR")}
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: it.nota >= 80 ? "#10B981" : "#EF4444" }}
                    >
                      {it.nota}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show answers review */}
        <div className="space-y-4">
          {preguntas.map((pregunta, idx) => {
            const opciones = parseOpciones(pregunta.opciones)
            const myAnswer =
              resultado && answers[pregunta.id] !== undefined
                ? answers[pregunta.id]
                : prevAnswers.get(pregunta.id)?.respuesta_elegida
            const wasCorrect =
              resultado
                ? answers[pregunta.id] === pregunta.respuesta_correcta
                : prevAnswers.get(pregunta.id)?.es_correcta ?? false

            return (
              <Card key={pregunta.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start gap-3 text-base">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold">
                      {idx + 1}
                    </span>
                    <span>{pregunta.texto}</span>
                    {wasCorrect ? (
                      <CheckCircle className="size-5 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="size-5 shrink-0 text-red-500" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {opciones.map((opcion, opIdx) => {
                    const isCorrect = opIdx === pregunta.respuesta_correcta
                    const isMyAnswer = opIdx === myAnswer
                    let bg = "bg-white border-slate-200"
                    if (isCorrect) bg = "bg-green-50 border-green-300"
                    else if (isMyAnswer && !isCorrect)
                      bg = "bg-red-50 border-red-300"

                    return (
                      <div
                        key={opIdx}
                        className={`rounded-lg border p-3 text-sm ${bg}`}
                      >
                        <span className="font-medium">
                          {String.fromCharCode(65 + opIdx)}.
                        </span>{" "}
                        {opcion}
                        {isCorrect && (
                          <CheckCircle className="ml-2 inline size-4 text-green-500" />
                        )}
                        {isMyAnswer && !isCorrect && (
                          <XCircle className="ml-2 inline size-4 text-red-500" />
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // Exam form
  return (
    <div className="space-y-6">
      <Link
        href="/mis-capacitaciones"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-3.5" />
        Volver
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {capacitacion.titulo}
        </h1>
        {capacitacion.descripcion && (
          <p className="mt-1 text-sm text-slate-500">
            {capacitacion.descripcion}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-400">
          {preguntas.length} preguntas - Responde todas para enviar
        </p>
      </div>

      {preguntas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <AlertTriangle className="mx-auto mb-3 size-10" />
            <p>Este examen todavia no tiene preguntas cargadas.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {preguntas.map((pregunta, idx) => {
              const opciones = parseOpciones(pregunta.opciones)
              return (
                <Card key={pregunta.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-start gap-3 text-base">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                        {idx + 1}
                      </span>
                      <span>{pregunta.texto}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {opciones.map((opcion, opIdx) => {
                      const selected = answers[pregunta.id] === opIdx
                      return (
                        <button
                          key={opIdx}
                          onClick={() => handleSelect(pregunta.id, opIdx)}
                          className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                            selected
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-medium">
                            {String.fromCharCode(65 + opIdx)}.
                          </span>{" "}
                          {opcion}
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Progress + submit */}
          <div className="sticky bottom-4 rounded-xl border bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {Object.keys(answers).length} de {preguntas.length} respondidas
              </p>
              <Button
                onClick={handleSubmit}
                disabled={
                  isPending ||
                  Object.keys(answers).length !== preguntas.length
                }
              >
                {isPending ? (
                  "Enviando..."
                ) : (
                  <>
                    <Send className="mr-2 size-4" />
                    Enviar examen
                  </>
                )}
              </Button>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${(Object.keys(answers).length / preguntas.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
