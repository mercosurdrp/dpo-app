"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Brain,
  Trophy,
  Timer,
  CheckCircle2,
  XCircle,
  Zap,
  ArrowRight,
  BarChart3,
  AlertTriangle,
  PartyPopper,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { servirSiguiente, responder } from "@/actions/trivia"
import type {
  EstadoTrivia,
  PreguntaServida,
  RespuestaResultado,
  ResumenDia,
  RevisionItem,
} from "@/lib/types/trivia"

type Fase = "error" | "sin_preguntas" | "intro" | "pregunta" | "feedback" | "completado"

interface Completado {
  resumen: ResumenDia
  posicionMes: number | null
  revision: RevisionItem[]
}

const letra = (i: number) => String.fromCharCode(65 + i)

export function TriviaClient({ estadoInicial }: { estadoInicial: EstadoTrivia }) {
  // ---- Estado inicial derivado ----
  const initFase: Fase =
    estadoInicial.estado === "error"
      ? "error"
      : estadoInicial.estado === "sin_preguntas"
        ? "sin_preguntas"
        : estadoInicial.estado === "completado"
          ? "completado"
          : "intro"

  const [fase, setFase] = useState<Fase>(initFase)
  const [errorMsg] = useState(
    estadoInicial.estado === "error" ? estadoInicial.mensaje : ""
  )
  const [total, setTotal] = useState(
    estadoInicial.estado === "jugando" ? estadoInicial.total : estadoInicial.estado === "completado" ? estadoInicial.resumen.total : 0
  )
  const [respondidas, setRespondidas] = useState(
    estadoInicial.estado === "jugando" ? estadoInicial.respondidas : 0
  )
  const [puntosAcum, setPuntosAcum] = useState(
    estadoInicial.estado === "jugando" ? estadoInicial.puntosAcum : 0
  )
  const [completado, setCompletado] = useState<Completado | null>(
    estadoInicial.estado === "completado"
      ? {
          resumen: estadoInicial.resumen,
          posicionMes: estadoInicial.posicionMes,
          revision: estadoInicial.revision,
        }
      : null
  )

  const [pregunta, setPregunta] = useState<PreguntaServida | null>(null)
  const [feedback, setFeedback] = useState<RespuestaResultado | null>(null)
  const [pending, setPending] = useState(false)

  // ---- Cronómetro ----
  const [secsLeft, setSecsLeft] = useState(0)
  const deadlineRef = useRef<number>(0)
  const answeringRef = useRef(false)

  const totalPreguntas = total || pregunta?.total || 0

  const handleAnswer = useCallback(
    async (opcion: number | null) => {
      if (answeringRef.current || !pregunta) return
      answeringRef.current = true
      setPending(true)
      const res = await responder(pregunta.id, opcion)
      setPending(false)
      if ("error" in res) {
        toast.error(res.error)
        answeringRef.current = false
        return
      }
      setFeedback(res)
      setPuntosAcum((p) => p + res.puntos)
      setRespondidas((r) => r + 1)
      if (res.esUltima && res.resumen) {
        setCompletado({
          resumen: res.resumen,
          posicionMes: res.posicionMes ?? null,
          revision: res.revision ?? [],
        })
      }
      setFase("feedback")
    },
    [pregunta]
  )

  // Tick del cronómetro mientras hay una pregunta activa.
  useEffect(() => {
    if (fase !== "pregunta") return
    const tick = () => {
      const restante = Math.max(0, deadlineRef.current - Date.now())
      setSecsLeft(Math.ceil(restante / 1000))
      if (restante <= 0 && !answeringRef.current) {
        handleAnswer(null) // se venció el tiempo
      }
    }
    tick()
    const iv = setInterval(tick, 100)
    return () => clearInterval(iv)
  }, [fase, handleAnswer])

  async function pedirPregunta() {
    setPending(true)
    const res = await servirSiguiente()
    setPending(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    if ("fin" in res) {
      // No debería pasar (ya sabemos si es la última), pero por las dudas.
      window.location.reload()
      return
    }
    const p = res as PreguntaServida
    setPregunta(p)
    if (total === 0) setTotal(p.total)
    // Calcular el tiempo restante con el reloj del servidor.
    const serverNow = new Date(p.serverNowISO).getTime()
    const servedAt = new Date(p.servedAtISO).getTime()
    const yaTranscurrido = Math.max(0, serverNow - servedAt)
    const restanteMs = Math.max(0, p.tiempoLimiteSeg * 1000 - yaTranscurrido)
    deadlineRef.current = Date.now() + restanteMs
    answeringRef.current = false
    setFeedback(null)
    setFase("pregunta")
  }

  function siguiente() {
    if (feedback?.esUltima) {
      setFase("completado")
      return
    }
    pedirPregunta()
  }

  // ============================ Render ============================

  if (fase === "error") {
    return (
      <Wrapper>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="size-10 text-amber-500" />
            <p className="text-slate-700">{errorMsg}</p>
            <Link href="/trivia/ranking">
              <Button variant="outline">Ver ranking</Button>
            </Link>
          </CardContent>
        </Card>
      </Wrapper>
    )
  }

  if (fase === "sin_preguntas") {
    return (
      <Wrapper>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-slate-500">
            <Brain className="size-10 text-slate-300" />
            <p>El desafío de hoy todavía no está disponible.</p>
            <p className="text-sm text-slate-400">Volvé más tarde 😉</p>
          </CardContent>
        </Card>
      </Wrapper>
    )
  }

  if (fase === "intro") {
    const yaEmpezado = respondidas > 0
    return (
      <Wrapper>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-6 py-10 text-center text-white">
            <Brain className="mx-auto mb-3 size-14" />
            <h2 className="text-2xl font-bold">Desafío del día</h2>
            <p className="mt-1 text-blue-100">
              {totalPreguntas} preguntas sobre los procesos de la empresa
            </p>
          </div>
          <CardContent className="space-y-4 py-6">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat icon={<Brain className="size-5" />} label="Preguntas" value={`${totalPreguntas}`} />
              <Stat icon={<Timer className="size-5" />} label="Por pregunta" value={`${pregunta?.tiempoLimiteSeg ?? 20}s`} />
              <Stat icon={<Zap className="size-5" />} label="Bonus" value="velocidad" />
            </div>
            <p className="text-center text-sm text-slate-500">
              Respondé rápido y sin ayuda: cuanto antes aciertes, más puntos.
              {yaEmpezado && ` Ya llevás ${respondidas}/${totalPreguntas}.`}
            </p>
            <Button
              onClick={pedirPregunta}
              disabled={pending}
              size="lg"
              className="w-full bg-blue-600 text-base hover:bg-blue-700"
            >
              {pending ? "Cargando..." : yaEmpezado ? "Continuar" : "Empezar"}
              <ArrowRight className="ml-1 size-5" />
            </Button>
            <div className="text-center">
              <Link href="/trivia/ranking" className="text-sm text-slate-500 hover:text-slate-700">
                <BarChart3 className="mr-1 inline size-4" />
                Ver ranking
              </Link>
            </div>
          </CardContent>
        </Card>
      </Wrapper>
    )
  }

  if (fase === "pregunta" && pregunta) {
    const limite = pregunta.tiempoLimiteSeg
    const pct = Math.max(0, Math.min(100, (secsLeft / limite) * 100))
    const urgente = secsLeft <= 5
    return (
      <Wrapper>
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Pregunta {pregunta.orden + 1} de {pregunta.total}
          </span>
          <span className="font-semibold text-slate-700">{puntosAcum} pts</span>
        </div>

        {/* Cronómetro */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <Timer className={urgente ? "size-4 text-red-500" : "size-4 text-slate-400"} />
            <span className={`text-2xl font-bold tabular-nums ${urgente ? "text-red-500" : "text-slate-700"}`}>
              {secsLeft}s
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-100 ${urgente ? "bg-red-500" : "bg-blue-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg leading-snug">{pregunta.texto}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pregunta.opciones.map((op, i) => (
              <button
                key={i}
                disabled={pending}
                onClick={() => handleAnswer(i)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                  {letra(i)}
                </span>
                <span>{op}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </Wrapper>
    )
  }

  if (fase === "feedback" && feedback && pregunta) {
    const acerto = feedback.correcta
    const seVencio = feedback.tuOpcion === null
    return (
      <Wrapper>
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Pregunta {pregunta.orden + 1} de {pregunta.total}
          </span>
          <span className="font-semibold text-slate-700">{puntosAcum} pts</span>
        </div>

        <div
          className={`mb-4 flex items-center justify-between rounded-xl px-4 py-3 ${
            acerto ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          <span className="flex items-center gap-2 font-semibold">
            {acerto ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
            {acerto ? "¡Correcto!" : seVencio ? "Se acabó el tiempo" : "Incorrecto"}
          </span>
          <span className="flex items-center gap-1 font-bold">
            {feedback.puntos > 0 && <Zap className="size-4" />}+{feedback.puntos} pts
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg leading-snug">{pregunta.texto}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pregunta.opciones.map((op, i) => {
              const esCorrecta = i === feedback.respuestaCorrecta
              const esMia = i === feedback.tuOpcion
              let cls = "border-slate-200 bg-white"
              if (esCorrecta) cls = "border-green-300 bg-green-50"
              else if (esMia) cls = "border-red-300 bg-red-50"
              return (
                <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${cls}`}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-600">
                    {letra(i)}
                  </span>
                  <span className="flex-1">{op}</span>
                  {esCorrecta && <CheckCircle2 className="size-4 text-green-500" />}
                  {esMia && !esCorrecta && <XCircle className="size-4 text-red-500" />}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Button
          onClick={siguiente}
          disabled={pending}
          size="lg"
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700"
        >
          {pending
            ? "Cargando..."
            : feedback.esUltima
              ? "Ver resultado final"
              : "Siguiente pregunta"}
          <ArrowRight className="ml-1 size-5" />
        </Button>
      </Wrapper>
    )
  }

  if (fase === "completado" && completado) {
    const { resumen, posicionMes, revision } = completado
    return (
      <Wrapper>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-6 py-10 text-center text-white">
            <PartyPopper className="mx-auto mb-2 size-12" />
            <h2 className="text-2xl font-bold">¡Terminaste el desafío!</h2>
            <p className="mt-3 text-5xl font-black">{resumen.puntos}</p>
            <p className="text-blue-100">puntos hoy</p>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <span>
                ✅ {resumen.correctas}/{resumen.total} correctas
              </span>
              {posicionMes != null && (
                <span className="flex items-center gap-1">
                  <Trophy className="size-4" /> #{posicionMes} del mes
                </span>
              )}
            </div>
          </div>
          <CardContent className="py-5 text-center">
            <Link href="/trivia/ranking">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <BarChart3 className="mr-1 size-4" />
                Ver ranking completo
              </Button>
            </Link>
            <p className="mt-3 text-sm text-slate-400">Volvé mañana por 10 preguntas nuevas 🔁</p>
          </CardContent>
        </Card>

        {/* Revisión */}
        {revision.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold text-slate-700">Repaso de hoy</h3>
            {revision.map((r, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-start gap-3 text-base">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold">
                      {idx + 1}
                    </span>
                    <span>{r.texto}</span>
                    {r.esCorrecta ? (
                      <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="size-5 shrink-0 text-red-500" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {r.opciones.map((op, i) => {
                    const esCorrecta = i === r.respuestaCorrecta
                    const esMia = i === r.respuestaElegida
                    let cls = "border-slate-200 bg-white"
                    if (esCorrecta) cls = "border-green-300 bg-green-50"
                    else if (esMia) cls = "border-red-300 bg-red-50"
                    return (
                      <div key={i} className={`rounded-lg border p-2.5 text-sm ${cls}`}>
                        <span className="font-medium">{letra(i)}.</span> {op}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Wrapper>
    )
  }

  return <Wrapper>{null}</Wrapper>
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Brain className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Trivia MERCOSUR</h1>
          <p className="text-xs text-slate-500">Desafío de conocimiento diario</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-3">
      <div className="mx-auto mb-1 flex size-8 items-center justify-center rounded-full bg-white text-blue-600">
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
