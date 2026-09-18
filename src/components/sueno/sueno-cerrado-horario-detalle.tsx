"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  getCerradoHorarioDetalle,
  type CerradoHorarioDetalle,
} from "@/actions/cerrado-horarios"
import { RAMA_COLOR, type SuenoNodo } from "@/lib/sueno/arbol-config"
import { MES_LABEL_CORTO } from "@/lib/sueno/rechazo-tipos"

const nfAR = new Intl.NumberFormat("es-AR")
const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`

/**
 * Los baldes, en el orden en que se leen: primero de quién es la culpa, después
 * lo que no se pudo saber. El color separa responsabilidad, no gravedad.
 */
const BALDES = [
  {
    campo: "dentro",
    label: "Fuimos en su horario",
    ayuda: "El cliente no nos atendió en la ventana que declaró",
    color: "#DC2626",
    culpa: "cliente",
  },
  {
    campo: "siesta",
    label: "Siesta",
    ayuda: "Caímos entre los dos tramos de un horario cortado",
    color: "#F59E0B",
    culpa: "nuestro",
  },
  {
    campo: "temprano",
    label: "Llegamos temprano",
    ayuda: "Antes de que abriera",
    color: "#FB923C",
    culpa: "nuestro",
  },
  {
    campo: "tarde",
    label: "Llegamos tarde",
    ayuda: "Después de que cerrara",
    color: "#FB923C",
    culpa: "nuestro",
  },
  {
    campo: "noAbre",
    label: "Día que no abre",
    ayuda: "Fuimos un día que el cliente no abre nunca",
    color: "#EA580C",
    culpa: "nuestro",
  },
  {
    campo: "borde",
    label: "Al filo",
    ayuda: "A menos de 15 minutos del borde: no se le imputa a nadie",
    color: "#94A3B8",
    culpa: null,
  },
  {
    campo: "sinVh",
    label: "Sin horario relevado",
    ayuda: "Ese cliente todavía no tiene ventana relevada",
    color: "#CBD5E1",
    culpa: null,
  },
  {
    campo: "sinHora",
    label: "Sin hora de la visita",
    ayuda: "Foxtrot no registró a qué hora pasamos (la parada quedó sin cerrar)",
    color: "#CBD5E1",
    culpa: null,
  },
] as const

export function SuenoCerradoHorarioDetalle({ nodo }: { nodo: SuenoNodo }) {
  const [pending, startTransition] = useTransition()
  const [data, setData] = useState<CerradoHorarioDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startTransition(async () => {
      const res = await getCerradoHorarioDetalle(nodo.anio)
      if ("error" in res) setError(res.error)
      else setData(res.data)
    })
  }, [nodo.anio])

  const color = RAMA_COLOR[nodo.rama]
  const r = data?.resumen ?? null

  // Los totales del año por balde: se suman los meses para no pedir otra vez.
  const totales = (data?.meses ?? []).reduce<Record<string, number>>((acc, m) => {
    for (const b of BALDES) acc[b.campo] = (acc[b.campo] ?? 0) + m[b.campo]
    return acc
  }, {})
  const totalAnio = (data?.meses ?? []).reduce((a, m) => a + m.total, 0)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          Cerrado · cumplimiento de horario
        </DialogTitle>
        <DialogDescription>
          De todas las veces que fuimos y el cliente estaba cerrado, en cuántas
          habíamos ido dentro del horario que declaró en el relevamiento.
        </DialogDescription>
      </DialogHeader>

      {pending && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      )}

      {error && <p className="py-4 text-sm text-red-600">{error}</p>}

      {!pending && !error && !r && (
        <p className="py-4 text-sm text-slate-500">
          Todavía no hay nada clasificado para {nodo.anio}. El cruce lo calcula
          la sincronización diaria.
        </p>
      )}

      {!pending && r && (
        <div className="space-y-5">
          {/* El número, con su cobertura al lado: un porcentaje sin la base
              sobre la que se calculó es un número que miente. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Tasa de cumplimiento de horario
                </div>
                <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {pct(r.tasa)}
                </div>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <div>
                  <b className="tabular-nums">{nfAR.format(r.dentro)}</b> veces
                  fuimos en horario y estaba cerrado
                </div>
                <div>
                  <b className="tabular-nums">{nfAR.format(r.fuera)}</b> veces
                  fuimos fuera de su horario
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Sobre {nfAR.format(r.base)} de {nfAR.format(r.total)} veces de
              CERRADO ({pct(r.cobertura)} de cobertura). El resto no se pudo
              clasificar y queda fuera del cálculo, no repartido.
            </p>
          </div>

          {/* La apertura completa, incluidos los descartes. */}
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              En qué terminó cada vez
            </div>
            <ul className="space-y-1.5">
              {BALDES.map((b) => {
                const v = totales[b.campo] ?? 0
                const ancho = totalAnio > 0 ? (100 * v) / totalAnio : 0
                return (
                  <li key={b.campo} className="flex items-center gap-3 text-sm">
                    <span className="w-44 shrink-0 text-slate-700 dark:text-slate-200">
                      {b.label}
                      {b.culpa === "nuestro" && (
                        <span className="ml-1 text-xs text-amber-600">
                          nuestro
                        </span>
                      )}
                    </span>
                    <span className="h-4 min-w-1 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                      <span
                        className="block h-4 rounded"
                        style={{
                          width: `${Math.max(ancho, v > 0 ? 1.5 : 0)}%`,
                          backgroundColor: b.color,
                        }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {nfAR.format(v)}
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-xs text-slate-500">
                      {totalAnio > 0 ? `${ancho.toFixed(1)}%` : "—"}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              {BALDES.find((b) => b.campo === "siesta")?.ayuda}. Es el balde más
              grande de lo que depende de nosotros y se corrige resecuenciando la
              ruta, sin hablar con el cliente.
            </p>
          </div>

          {/* La comparativa mes a mes. */}
          {(data?.meses.length ?? 0) > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Mes a mes
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                      <th className="py-1.5 text-left font-medium">Mes</th>
                      <th className="py-1.5 text-right font-medium">En horario</th>
                      <th className="py-1.5 text-right font-medium">Fuera</th>
                      <th className="py-1.5 text-right font-medium">Tasa</th>
                      <th className="py-1.5 text-right font-medium">Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.meses.map((m) => {
                      const fuera = m.temprano + m.tarde + m.siesta + m.noAbre
                      return (
                        <tr
                          key={m.mes}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="py-1.5 text-slate-700 dark:text-slate-200">
                            {MES_LABEL_CORTO[m.mes - 1]}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {nfAR.format(m.dentro)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {nfAR.format(fuera)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-medium">
                            {pct(m.tasa)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-slate-500">
                            {pct(m.cobertura)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            La hora sale de Foxtrot (cuando el chofer cerró la parada) y la
            ventana, del relevamiento trimestral del promotor. La ventana horaria
            de Chess no se usa: son valores por defecto que no se respetan.
          </p>
        </div>
      )}
    </>
  )
}
