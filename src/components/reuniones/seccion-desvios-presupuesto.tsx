"use client"

import { useEffect, useState } from "react"
import { Loader2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DesvioBadge } from "@/components/presupuesto/desvio-badge"
import { listTareasDelPeriodo } from "@/actions/presupuesto"
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

/** Mes anterior al de la reunión: el cierre que se revisa. "YYYY-MM". */
function mesAnterior(fechaISO: string): string {
  const anio = Number(fechaISO.slice(0, 4))
  const mes = Number(fechaISO.slice(5, 7))
  return mes === 1
    ? `${anio - 1}-12`
    : `${anio}-${String(mes - 1).padStart(2, "0")}`
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
 * Desvíos del mes ANTERIOR al de la reunión de presupuesto: el cierre que se
 * viene a revisar (la reunión de julio mira junio).
 *
 * 🚨 El filtro va por el PERÍODO que analiza el desvío (`anio`/`mes`), NO por
 * `created_at`: el cierre de un mes se carga al siguiente. Los desvíos de junio
 * 2026 se cargaron el 16/07 y en junio no se cargó ninguno, así que filtrar por
 * fecha de carga dejaría la reunión vacía. La columna "Cargado" queda a la vista
 * para que se note cuándo entró cada uno.
 */
export function SeccionDesviosPresupuesto({
  fechaReunion,
}: {
  fechaReunion: string
}) {
  const mes = mesAnterior(fechaReunion)
  const [tareas, setTareas] = useState<PresupuestoTareaConResponsable[] | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    void listTareasDelPeriodo(mes).then((r) => {
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
          Desvíos de {nombreMes(mes)}
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
              El cierre del mes anterior a esta reunión, sin importar cuándo se
              cargó cada uno. Desvío = (real − presupuestado) / presupuestado.
            </p>

            {tareas.length === 0 ? (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No hay desvíos cargados para {nombreMes(mes)}.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-1.5 text-left font-medium">Rubro</th>
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
