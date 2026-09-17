import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  diferencia,
  formatearDiferencia,
  formatearYtd,
  type MetricaYtd,
} from "@/lib/ytd"

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "long",
})

/**
 * Acumulado del año contra el mismo período del año anterior.
 *
 * La comparación es al MISMO DÍA (1/1 → hoy de cada año), no contra el año
 * anterior completo: si no, en septiembre se compara contra doce meses y
 * siempre parece que se viene cayendo.
 */
export function ComparativoYtd({
  titulo,
  metricas,
  anioActual,
  anioAnterior,
  hasta,
  sinDatos,
}: {
  titulo: string
  metricas: MetricaYtd[]
  anioActual: number
  anioAnterior: number
  hasta: string
  sinDatos: boolean
}) {
  const dia = FMT_DIA.format(new Date(`${hasta}T12:00:00`))

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        <p className="text-xs text-slate-500">
          1 de enero al {dia} de cada año · {anioActual} vs {anioAnterior}
        </p>
      </div>

      {sinDatos && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Todavía no está cargado el histórico {anioAnterior}: el sync con el Power BI
          baja solo el año en curso. Cuando se cargue, la comparación aparece sola.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metricas.map((m) => {
          const d = diferencia(m)
          const color =
            d.signo === "mejor"
              ? "text-emerald-600"
              : d.signo === "peor"
                ? "text-red-600"
                : "text-slate-400"
          // La flecha sigue al VALOR (subió / bajó) y el color al sentido: más
          // detractores es flecha para arriba y rojo al mismo tiempo.
          const Icono =
            d.absoluta == null || d.absoluta === 0
              ? ArrowRight
              : d.absoluta > 0
                ? ArrowUpRight
                : ArrowDownRight

          return (
            <Card key={m.etiqueta}>
              <CardContent className="pt-4">
                <p className="text-xs font-medium uppercase text-slate-500">
                  {m.etiqueta}
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {formatearYtd(m.actual, m.formato)}
                </p>

                <div className="mt-1.5 flex items-baseline gap-2 text-sm">
                  <span className="text-slate-500">
                    {anioAnterior}: {formatearYtd(m.anterior, m.formato)}
                  </span>
                  {d.signo !== "sin-dato" && (
                    <span className={`inline-flex items-center gap-0.5 font-medium ${color}`}>
                      <Icono className="h-3.5 w-3.5" aria-hidden />
                      {formatearDiferencia(d, m.formato)}
                      {d.relativa != null && Math.abs(d.relativa) >= 0.1 && (
                        <span className="text-xs font-normal">
                          ({d.relativa > 0 ? "+" : "−"}
                          {Math.abs(d.relativa).toFixed(1)} %)
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {m.nota && <p className="mt-1 text-xs text-slate-500">{m.nota}</p>}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
