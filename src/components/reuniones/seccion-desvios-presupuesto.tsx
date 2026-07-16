"use client"

import { useEffect, useState } from "react"
import { Loader2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DesvioBadge } from "@/components/presupuesto/desvio-badge"
import { listTareasCargadasEnMes } from "@/actions/presupuesto"
import type { PresupuestoTareaConResponsable } from "@/types/database"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function nombreMes(mes: string): string {
  const m = parseInt(mes.slice(5, 7), 10)
  return `${MESES[m - 1]} ${mes.slice(0, 4)}`
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Período que analiza el desvío (≠ el mes en que se cargó). */
function periodo(t: PresupuestoTareaConResponsable): string {
  return `${MESES[t.mes - 1]?.slice(0, 3) ?? "?"} ${t.anio}`
}

function pesos(v: number | null): string {
  if (v == null) return "—"
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  en_progreso: "bg-sky-100 text-sky-700",
  completada: "bg-emerald-100 text-emerald-700",
}

/**
 * Desvíos cargados en el mes de la reunión de presupuesto.
 *
 * 🚨 "Cargados en el mes" va por `created_at`, NO por el campo `mes` de la
 * tarea, que es el período analizado: el cierre de un mes se carga al mes
 * siguiente. En julio 2026 los 8 desvíos cargados analizaban mayo y junio, así
 * que filtrar por `mes` habría mostrado la reunión vacía. Por eso cada fila
 * muestra las dos fechas: qué período analiza y cuándo se cargó.
 */
export function SeccionDesviosPresupuesto({
  fechaReunion,
}: {
  fechaReunion: string
}) {
  const mes = fechaReunion.slice(0, 7)
  const [tareas, setTareas] = useState<PresupuestoTareaConResponsable[] | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    void listTareasCargadasEnMes(mes).then((r) => {
      if (cancel) return
      if ("error" in r) {
        setError(r.error)
        setTareas(null)
      } else {
        setTareas(r.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [mes])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-5 text-slate-500" />
          Desvíos cargados en {nombreMes(mes)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando desvíos…
          </p>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {tareas && !loading && (
          <>
            <p className="text-xs text-slate-500">
              Los que se cargaron este mes, sin importar qué período analizan (el
              cierre de un mes se carga al mes siguiente). Desvío ={" "}
              (real − presupuestado) / presupuestado.
            </p>

            {tareas.length === 0 ? (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No se cargó ningún desvío en {nombreMes(mes)}.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-1.5 text-left font-medium">Rubro</th>
                      <th className="py-1.5 text-left font-medium">Analiza</th>
                      <th className="py-1.5 text-right font-medium">Presupuestado</th>
                      <th className="py-1.5 text-right font-medium">Real</th>
                      <th className="py-1.5 text-center font-medium">Desvío</th>
                      <th className="py-1.5 text-left font-medium">Responsable</th>
                      <th className="py-1.5 text-center font-medium">Estado</th>
                      <th className="py-1.5 text-right font-medium">Cargado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tareas.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-slate-800">
                          {t.rubro}
                        </td>
                        <td className="py-2 text-slate-500">{periodo(t)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {pesos(t.monto_presupuestado)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {pesos(t.monto_real)}
                        </td>
                        <td className="py-2 text-center">
                          <DesvioBadge pct={t.desvio_pct} />
                        </td>
                        <td className="py-2 text-slate-600">
                          {t.responsable_nombre ?? "—"}
                        </td>
                        <td className="py-2 text-center">
                          <Badge
                            variant="secondary"
                            className={ESTADO_BADGE[t.estado] ?? ""}
                          >
                            {t.estado.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="py-2 text-right tabular-nums text-slate-500">
                          {formatFechaCorta(t.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
