"use client"

import { useMemo } from "react"
import { ClipboardList, Plus, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RmdPlan } from "@/actions/rmd-planes"
import type {
  RmdCoberturaData,
  RmdCoberturaMes,
} from "@/actions/rmd-cobertura"
import {
  RMD_TASA_OBJETIVO,
  brechaTasa,
  calificacionesFaltantes,
} from "@/lib/rmd-tasa"
import { PlanCard, hoyISO } from "./planes-accion-bloque"

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
]

const fmt = (n: number, dec = 0) =>
  n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })

interface Props {
  /** Planes con foco en la tasa de respuesta (ya filtrados). */
  planes: RmdPlan[]
  /** Totales de meses cerrados: contra esto se mide el objetivo. */
  resumen: RmdCoberturaData["resumen"]
  /** Meses del año, para ver cómo viene la tasa desde que existe el plan. */
  meses: RmdCoberturaMes[]
  onNuevo: () => void
  onVer: (plan: RmdPlan) => void
}

/**
 * Tarjeta de la solapa Cobertura con los planes que atacan la tasa de
 * respuesta (por ejemplo, la entrega de folletos con QR en los PDV) y el
 * objetivo que persiguen: llegar al 50 % de entregas calificadas. Los
 * planes se abren acá mismo, sin saltar a la solapa del panel.
 */
export function PlanesTasaCard({
  planes,
  resumen,
  meses,
  onNuevo,
  onVer,
}: Props) {
  const hoy = useMemo(() => hoyISO(), [])
  const abiertos = planes.filter((p) => p.estado !== "completado")
  const cerrados = planes.filter((p) => p.estado === "completado")

  const tasa = resumen.tasa_respuesta
  const brecha = brechaTasa(tasa)
  const logrado = brecha != null && brecha === 0
  const faltantes = calificacionesFaltantes(resumen.enviadas, resumen.puntuadas)
  const mesesCerrados = meses.filter((m) => !m.parcial && m.enviadas > 0)
  // Cuánto representa la brecha en un mes típico: calificaciones que tendrían
  // que sumarse por mes para que el año cierre en el objetivo.
  const faltantesPorMes =
    mesesCerrados.length > 0
      ? Math.ceil(faltantes / mesesCerrados.length)
      : null

  // Meses desde que existe el primer plan sobre la tasa (incluye el mes en
  // curso, marcado como parcial): es lo que el plan puede haber movido.
  const desdePlan = useMemo(() => {
    if (planes.length === 0) return null
    const primera = planes.map((p) => p.created_at).sort()[0]
    const d = new Date(primera)
    const mesPlan = d.getMonth() + 1
    if (d.getFullYear() !== new Date().getFullYear()) return null
    const post = meses.filter((m) => m.mes >= mesPlan && m.enviadas > 0)
    if (post.length === 0) return { mesPlan, tasa: null, parcial: true }
    const enviadas = post.reduce((s, m) => s + m.enviadas, 0)
    const puntuadas = post.reduce((s, m) => s + m.puntuadas, 0)
    return {
      mesPlan,
      tasa: enviadas > 0 ? (puntuadas / enviadas) * 100 : null,
      parcial: post.some((m) => m.parcial),
    }
  }, [planes, meses])

  // Barra 0 → objetivo: cuánto del camino está recorrido.
  const avance =
    tasa == null ? 0 : Math.min(100, (tasa / RMD_TASA_OBJETIVO) * 100)
  const colorBarra = logrado
    ? "bg-emerald-500"
    : tasa != null && tasa >= 35
      ? "bg-amber-500"
      : "bg-red-500"

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-amber-600" />
            Plan de acción para subir la tasa de respuesta
            {planes.length > 0 && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800"
              >
                {abiertos.length} abierto{abiertos.length === 1 ? "" : "s"}
                {cerrados.length > 0 &&
                  ` · ${cerrados.length} cerrado${cerrados.length === 1 ? "" : "s"}`}
              </Badge>
            )}
          </span>
          <Button size="sm" onClick={onNuevo}>
            <Plus className="mr-1 h-4 w-4" />
            Nuevo plan
          </Button>
        </CardTitle>
        <p className="text-xs text-slate-500">
          Acciones generales sobre toda la base para que más clientes califiquen
          la entrega. Clic en un plan para ver el detalle, cargar avances o
          cambiarle el estado.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-4">
        {/* ---------- Objetivo ---------- */}
        <div
          className={`rounded-md border p-3 ${
            logrado
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50/60"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Target className="h-4 w-4 text-amber-600" />
              Objetivo: llegar al {RMD_TASA_OBJETIVO} % de tasa de respuesta
            </span>
            <span className="text-sm text-slate-700">
              Hoy{" "}
              <strong className="text-base">
                {tasa == null ? "—" : `${fmt(tasa, 1)} %`}
              </strong>
              {brecha != null && !logrado && (
                <>
                  {" "}
                  · faltan <strong>{fmt(brecha, 1)} pp</strong>
                </>
              )}
              {logrado && (
                <>
                  {" "}
                  ·{" "}
                  <strong className="text-emerald-700">
                    objetivo cumplido
                  </strong>
                </>
              )}
            </span>
          </div>

          <div
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-slate-200"
            title={`${tasa == null ? "—" : `${fmt(tasa, 1)} %`} de ${RMD_TASA_OBJETIVO} %`}
          >
            <div
              className={`h-full rounded-full transition-all ${colorBarra}`}
              style={{ width: `${avance}%` }}
            />
          </div>

          <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            <p>
              Meses cerrados del año: {fmt(resumen.puntuadas)} calificadas de{" "}
              {fmt(resumen.enviadas)} encuestadas.
              {!logrado && faltantes > 0 && (
                <>
                  {" "}
                  Para el {RMD_TASA_OBJETIVO} % hacían falta{" "}
                  <strong>{fmt(faltantes)}</strong> más
                  {faltantesPorMes != null && (
                    <> (≈ {fmt(faltantesPorMes)} por mes)</>
                  )}
                  .
                </>
              )}
            </p>
            <p>
              {desdePlan == null ? (
                <>Cuando haya un plan, acá se ve la tasa desde que empezó.</>
              ) : desdePlan.tasa == null ? (
                <>
                  Desde el plan ({MESES[desdePlan.mesPlan - 1]}): todavía sin
                  entregas encuestadas.
                </>
              ) : (
                <>
                  Desde el plan ({MESES[desdePlan.mesPlan - 1]} en adelante):{" "}
                  <strong
                    className={
                      desdePlan.tasa >= RMD_TASA_OBJETIVO
                        ? "text-emerald-700"
                        : "text-slate-800"
                    }
                  >
                    {fmt(desdePlan.tasa, 1)} %
                  </strong>
                  {desdePlan.parcial && (
                    <>
                      {" "}
                      · parcial, las entregas recientes todavía pueden recibir
                      nota
                    </>
                  )}
                  .
                </>
              )}
            </p>
          </div>
        </div>

        {/* ---------- Planes ---------- */}
        {planes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todavía no hay un plan para llegar al {RMD_TASA_OBJETIVO} %. Crealo
            desde «Nuevo plan».
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...abiertos, ...cerrados].map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                hoy={hoy}
                compacta
                onClick={() => onVer(p)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
