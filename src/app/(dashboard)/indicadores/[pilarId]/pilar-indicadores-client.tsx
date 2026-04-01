"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ChevronRight,
} from "lucide-react"
import type { Pilar, Indicador } from "@/types/database"
import type { BloqueIndicadores } from "@/actions/indicadores"
import { TENDENCIA_LABELS } from "@/lib/constants"

interface Props {
  pilar: Pilar
  bloques: BloqueIndicadores[]
}

function TendenciaIcon({ tendencia }: { tendencia: string }) {
  switch (tendencia) {
    case "mejora":
      return <TrendingUp className="h-4 w-4 text-green-600" />
    case "deterioro":
      return <TrendingDown className="h-4 w-4 text-red-600" />
    default:
      return <Minus className="h-4 w-4 text-slate-400" />
  }
}

function IndicadorCard({ indicador }: { indicador: Indicador }) {
  const progress = indicador.meta > 0
    ? Math.min(100, Math.round((indicador.actual / indicador.meta) * 100))
    : 0

  const isOnTrack = indicador.actual >= indicador.meta

  return (
    <Card className="border-l-4" style={{ borderLeftColor: isOnTrack ? "#10B981" : "#F59E0B" }}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-slate-900 truncate">
              {indicador.nombre}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl font-bold" style={{ color: isOnTrack ? "#10B981" : "#F59E0B" }}>
                {indicador.actual}{indicador.unidad}
              </span>
              <span className="text-sm text-muted-foreground">
                / {indicador.meta}{indicador.unidad}
              </span>
            </div>
            <Progress value={progress} className="mt-2 h-2" />
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <TendenciaIcon tendencia={indicador.tendencia} />
              <span className="text-xs text-muted-foreground">
                {TENDENCIA_LABELS[indicador.tendencia] ?? indicador.tendencia}
              </span>
            </div>
          </div>
        </div>
        {indicador.notas && (
          <p className="mt-2 text-xs text-muted-foreground">{indicador.notas}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function PilarIndicadoresClient({ pilar, bloques }: Props) {
  const totalIndicadores = bloques.reduce(
    (sum, b) => sum + b.preguntas.reduce((s, p) => s + p.indicadores.length, 0),
    0
  )

  // Filter to only bloques that have at least one pregunta with indicadores, or all if none have
  const bloquesConIndicadores = bloques.filter((b) =>
    b.preguntas.some((p) => p.indicadores.length > 0)
  )
  const bloquesToShow = bloquesConIndicadores.length > 0 ? bloquesConIndicadores : bloques

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: `${pilar.color}18`, color: pilar.color }}
        >
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {pilar.nombre}
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalIndicadores} indicador{totalIndicadores !== 1 ? "es" : ""} en {bloques.length} bloque{bloques.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total KPIs</p>
                <p className="text-3xl font-bold text-slate-900">{totalIndicadores}</p>
              </div>
              <div className="rounded-full p-3 bg-slate-100">
                <BarChart3 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En Meta</p>
                <p className="text-3xl font-bold text-green-600">
                  {bloques.reduce(
                    (sum, b) =>
                      sum +
                      b.preguntas.reduce(
                        (s, p) =>
                          s + p.indicadores.filter((i) => i.actual >= i.meta).length,
                        0
                      ),
                    0
                  )}
                </p>
              </div>
              <div className="rounded-full p-3 bg-green-100">
                <Target className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bajo Meta</p>
                <p className="text-3xl font-bold text-amber-600">
                  {bloques.reduce(
                    (sum, b) =>
                      sum +
                      b.preguntas.reduce(
                        (s, p) =>
                          s + p.indicadores.filter((i) => i.actual < i.meta).length,
                        0
                      ),
                    0
                  )}
                </p>
              </div>
              <div className="rounded-full p-3 bg-amber-100">
                <Target className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bloques accordion */}
      {totalIndicadores === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">
              No hay indicadores cargados
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Los indicadores se crean desde la vista de gestión de cada pregunta en{" "}
              <Link href={`/pilares/${pilar.id}`} className="text-blue-600 hover:underline">
                Pilar {pilar.nombre}
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <Accordion multiple defaultValue={bloquesToShow.map((b) => b.bloque_id)}>
          {bloquesToShow.map((bloque) => {
            const bloqueIndicadores = bloque.preguntas.reduce(
              (s, p) => s + p.indicadores.length,
              0
            )
            const preguntasConInd = bloque.preguntas.filter(
              (p) => p.indicadores.length > 0
            )

            if (preguntasConInd.length === 0) return null

            return (
              <AccordionItem key={bloque.bloque_id} value={bloque.bloque_id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="font-semibold text-slate-900">
                      {bloque.bloque_nombre}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {bloqueIndicadores} KPI{bloqueIndicadores !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6 pt-2">
                    {preguntasConInd.map((pregunta) => (
                      <div key={pregunta.pregunta_id}>
                        <div className="mb-3 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0"
                            style={{ borderColor: pilar.color, color: pilar.color }}
                          >
                            {pregunta.pregunta_numero}
                          </Badge>
                          <p className="text-sm text-slate-700 line-clamp-2">
                            {pregunta.pregunta_texto}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 pl-2">
                          {pregunta.indicadores.map((ind) => (
                            <IndicadorCard key={ind.id} indicador={ind} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
