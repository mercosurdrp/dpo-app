"use client"

import { useEffect, useState } from "react"
import { ClipboardCheck, ExternalLink, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  obtenerEstadoInspeccion,
  periodoDeReunion,
  type EstadoInspeccion,
} from "@/actions/inspeccion-edilicia"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function nombreMes(periodo: string): string {
  const m = parseInt(periodo.slice(5, 7), 10)
  return `${MESES[m - 1]} ${periodo.slice(0, 4)}`
}

const ESTADO: Record<string, { label: string; clase: string }> = {
  no_generada: { label: "Sin generar", clase: "bg-slate-100 text-slate-700" },
  pendiente: { label: "Sin hacer", clase: "bg-red-100 text-red-800" },
  en_curso: { label: "En curso", clase: "bg-amber-100 text-amber-800" },
  cerrada: { label: "Hecha", clase: "bg-emerald-100 text-emerald-700" },
}

/**
 * Registro de la recorrida mensual del depósito.
 *
 * El dato vive en la app de mantenimiento edilicio, que es donde se completa;
 * acá sólo se muestra si se hizo y qué salió. Eso es lo que el punto 1.7 del
 * DPO pide de esta reunión: evidencia de que la rutina de recorridas existe y
 * se ejecuta, no un formulario más para llenar dos veces.
 */
export function SeccionInspeccionEdilicia({
  fechaReunion,
}: {
  fechaReunion: string
}) {
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoInspeccion | null>(null)
  const [periodo, setPeriodo] = useState("")

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const p = await periodoDeReunion(fechaReunion)
      const e = await obtenerEstadoInspeccion(p)
      if (!vivo) return
      setPeriodo(p)
      setEstado(e)
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [fechaReunion])

  const badge = ESTADO[estado?.estado ?? "no_generada"] ?? ESTADO.no_generada
  const url = estado?.url ?? "https://plan-mantenimiento-edilicio.vercel.app"

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Inspección edilicia del mes
          {periodo && (
            <span className="text-sm font-normal text-muted-foreground">
              · {nombreMes(periodo)}
            </span>
          )}
          {!cargando && (
            <Badge className={`${badge.clase} ml-auto`} variant="secondary">
              {badge.label}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {cargando ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando la app de mantenimiento…
          </div>
        ) : !estado ? (
          <p className="text-muted-foreground">
            No se pudo consultar la app de mantenimiento. Volvé a intentar o entrá
            directo a la recorrida.
          </p>
        ) : (
          <>
            {estado.estado === "cerrada" || estado.estado === "en_curso" ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  Relevado:{" "}
                  <strong>
                    {estado.items_respondidos}/{estado.items_total}
                  </strong>{" "}
                  ítems
                </span>
                <span>
                  Sin anomalías:{" "}
                  <strong>{(estado.adherencia_pct ?? 0).toFixed(0)}%</strong>
                </span>
                <span>
                  Anomalías:{" "}
                  <strong
                    className={estado.anomalias ? "text-red-700" : "text-emerald-700"}
                  >
                    {estado.anomalias}
                  </strong>
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">
                La recorrida de este mes todavía no se hizo. Son 27 puntos sobre los
                4 sectores del depósito y lleva unos quince minutos.
              </p>
            )}

            {estado.secciones && estado.secciones.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {estado.secciones.map((s) => (
                  <div key={s.seccion_num} className="rounded border px-2 py-1.5">
                    <div className="truncate text-xs text-muted-foreground">
                      {s.seccion_titulo}
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        s.adherencia_pct >= 100
                          ? "text-emerald-700"
                          : s.adherencia_pct >= 80
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {s.adherencia_pct.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            )}

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline"
            >
              {estado.estado === "cerrada" ? "Ver la recorrida" : "Completar la recorrida"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </CardContent>
    </Card>
  )
}
