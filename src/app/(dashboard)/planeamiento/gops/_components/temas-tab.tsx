"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronRight, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getGopTemaDetalle,
  type DestinoDecision,
  type GopPreguntaDetalle,
  type GopTemaResumen,
} from "@/actions/gops"
import type { GopPlan } from "@/actions/gops-planes"
import { DecidirDialog, type PuntoADecidir } from "./decidir-dialog"
import { BARRA_TONO, COLOR_TONO, DESTINO_LABEL, pct, tonoPuntaje } from "./formato"

interface Props {
  resumen: GopTemaResumen[]
  periodo: { anio: number; mes: number }
  planes: GopPlan[]
  responsables: Array<{ id: string; nombre: string }>
  canEdit: boolean
}

export function TemasTab({ resumen, periodo, planes, responsables, canEdit }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Record<string, GopPreguntaDetalle[]>>({})
  const [cargando, startTransition] = useTransition()
  const [punto, setPunto] = useState<PuntoADecidir | null>(null)
  const [destinoInicial, setDestinoInicial] = useState<DestinoDecision>("plan")

  function alternar(temaId: string) {
    if (abierto === temaId) {
      setAbierto(null)
      return
    }
    setAbierto(temaId)
    if (detalle[temaId]) return
    startTransition(async () => {
      const filas = await getGopTemaDetalle(temaId, periodo.anio, periodo.mes)
      setDetalle((prev) => ({ ...prev, [temaId]: filas }))
    })
  }

  return (
    <div className="space-y-2">
      {resumen.map((t) => {
        const tono = tonoPuntaje(t.puntaje, t.target)
        const delta =
          t.puntaje !== null && t.puntaje_previo !== null ? t.puntaje - t.puntaje_previo : null
        const estaAbierto = abierto === t.id

        return (
          <Card key={t.id}>
            <CardContent className="py-4">
              <button
                onClick={() => alternar(t.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                {estaAbierto ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{t.nombre}</span>
                    <Badge variant="secondary" className="text-xs">
                      {t.tipo}
                    </Badge>
                    {t.area && (
                      <span className="text-xs text-muted-foreground">{t.area}</span>
                    )}
                    {t.frecuencia === "bimestral" && (
                      <span className="text-xs text-muted-foreground">· bimestral</span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="relative h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${BARRA_TONO[tono]}`}
                        style={{ width: `${Math.min(100, (t.puntaje ?? 0) * 100)}%` }}
                      />
                      {/* Marca del target, para leer la brecha sin hacer la cuenta. */}
                      <div
                        className="absolute top-0 h-full w-0.5 bg-slate-900/50"
                        style={{ left: `${t.target * 100}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${COLOR_TONO[tono]}`}>
                      {pct(t.puntaje)}
                    </span>
                    {delta !== null && Math.abs(delta) > 0.0001 && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
                          delta > 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {delta > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {delta > 0 ? "+" : ""}
                        {pct(delta)}
                      </span>
                    )}
                    {delta !== null && Math.abs(delta) <= 0.0001 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
                        <Minus className="h-3 w-3" /> igual
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden shrink-0 text-right text-xs sm:block">
                  <p className="tabular-nums text-slate-700">
                    {t.si} Si · {t.no} No{t.na > 0 && ` · ${t.na} N/A`}
                  </p>
                  {t.no_para_target > 0 ? (
                    <p className="text-muted-foreground">
                      faltan {t.no_para_target} para el target
                    </p>
                  ) : (
                    <p className="font-medium text-emerald-600">en target</p>
                  )}
                  {t.sin_decidir > 0 && (
                    <p className="font-semibold text-red-600">{t.sin_decidir} sin decidir</p>
                  )}
                </div>
              </button>

              {estaAbierto && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  {!detalle[t.id] && cargando ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando preguntas…
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {(detalle[t.id] ?? []).map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-col gap-2 rounded-lg border border-slate-100 p-2 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <ValorPill valor={p.valor} />
                              <div className="min-w-0">
                                {p.seccion && (
                                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    {p.seccion}
                                  </p>
                                )}
                                <p className="text-sm text-slate-900">{p.texto}</p>
                                {p.comentario && (
                                  <p className="text-xs text-muted-foreground">{p.comentario}</p>
                                )}
                                {p.decision && (
                                  <p className="mt-1 text-xs">
                                    <span className="font-medium text-slate-700">
                                      {DESTINO_LABEL[p.decision.destino]}
                                    </span>
                                    {p.decision.plan_titulo && ` · ${p.decision.plan_titulo}`}
                                    {p.decision.motivo && ` · ${p.decision.motivo}`}
                                    {p.decision.fecha_revision && (
                                      <span
                                        className={
                                          p.decision.vencida
                                            ? "font-semibold text-amber-700"
                                            : "text-muted-foreground"
                                        }
                                      >
                                        {" "}
                                        · revisar {p.decision.fecha_revision}
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {canEdit && p.valor === "no" && (
                            <button
                              onClick={() => {
                                setDestinoInicial(p.decision?.destino ?? "plan")
                                setPunto({
                                  preguntaId: p.id,
                                  temaId: t.id,
                                  temaNombre: t.nombre,
                                  texto: p.texto,
                                  mesesEnNo: p.meses_en_no,
                                })
                              }}
                              className="h-8 shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {p.decision ? "Cambiar decisión" : "Decidir"}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <DecidirDialog
        punto={punto}
        onOpenChange={(open) => !open && setPunto(null)}
        planes={planes}
        responsables={responsables}
        destinoInicial={destinoInicial}
      />
    </div>
  )
}

function ValorPill({ valor }: { valor: string | null }) {
  const estilo =
    valor === "si"
      ? "bg-emerald-100 text-emerald-700"
      : valor === "no"
        ? "bg-red-100 text-red-700"
        : valor === "na"
          ? "bg-slate-100 text-slate-500"
          : "bg-slate-50 text-slate-400"
  const label = valor === "si" ? "Si" : valor === "no" ? "No" : valor === "na" ? "N/A" : "—"
  return (
    <span
      className={`mt-0.5 inline-flex h-6 w-10 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${estilo}`}
    >
      {label}
    </span>
  )
}
