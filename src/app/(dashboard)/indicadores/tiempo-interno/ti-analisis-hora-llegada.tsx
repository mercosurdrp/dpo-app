"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { Clock4, Users } from "lucide-react"
import type { TiRegistro } from "@/types/database"
import {
  TI_META,
  TI_VENTANA_COLA_MIN,
  efectoCola,
  normChofer,
  porFranjaLlegada,
  registrosValidos,
} from "@/lib/tiempo-interno-analisis"

const TODOS = "__todos__"
const LABEL_COLA = ["Nadie antes", "1 chofer antes", "2 o más antes"] as const

function colorTi(ti: number) {
  return ti <= 30 ? "text-green-700" : ti <= 45 ? "text-amber-700" : "text-red-700"
}

export function TiAnalisisHoraLlegada({ registros }: { registros: TiRegistro[] }) {
  const [chofer, setChofer] = useState<string>(TODOS)
  const validos = useMemo(() => registrosValidos(registros), [registros])
  const choferes = useMemo(
    () => [...new Set(validos.map((r) => normChofer(r.chofer)))].sort(),
    [validos],
  )

  const { franjas, cola } = useMemo(() => {
    if (chofer === TODOS) {
      return { franjas: porFranjaLlegada(validos, 30), cola: efectoCola(validos) }
    }
    const sel = validos.filter((r) => normChofer(r.chofer) === chofer)
    // La cola se cuenta siempre con TODOS los retornos del día (los demás
    // choferes son los que la forman); el filtro sólo elige a quién promediar.
    return { franjas: porFranjaLlegada(sel, 30), cola: efectoCola(validos, new Set(sel)) }
  }, [validos, chofer])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock4 className="h-4 w-4 text-slate-500" />
              Hora de llegada al CD vs. TI
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Barras: cuántos retornos llegan en cada media hora. Línea: el TI promedio de esos retornos.
            </p>
          </div>
          <select
            value={chofer}
            onChange={(e) => setChofer(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          >
            <option value={TODOS}>Todos los choferes</option>
            {choferes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {franjas.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sin retornos con TI.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={franjas}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="franja" fontSize={11} />
                <YAxis yAxisId="n" fontSize={11} allowDecimals={false} />
                <YAxis yAxisId="ti" orientation="right" fontSize={11} unit=" min" />
                <Tooltip
                  formatter={(value, name) =>
                    name === "promedio" ? [`${value} min`, "TI promedio"] : [value, "Retornos"]
                  }
                  labelFormatter={(l) => `Llegada ${l}`}
                />
                <Bar yAxisId="n" dataKey="n" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                <Line yAxisId="ti" dataKey="promedio" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                <ReferenceLine
                  yAxisId="ti"
                  y={TI_META}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: `Meta ${TI_META}`, fontSize: 10, fill: "#ef4444", position: "insideTopRight" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Users className="h-4 w-4 text-slate-500" />
            ¿Se hace cola para rendir?
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            TI según cuántos choferes llegaron al CD en los {TI_VENTANA_COLA_MIN} minutos previos.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([0, 1, 2] as const).map((k) => {
              const g = cola.find((x) => x.antes === k)
              return (
                <div key={k} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-muted-foreground">{LABEL_COLA[k]}</p>
                  {g ? (
                    <>
                      <p className={`text-2xl font-bold ${colorTi(g.promedio)}`}>{g.promedio} min</p>
                      <p className="text-xs text-muted-foreground">
                        {g.n} retornos · {g.pctMeta}% en meta
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos</p>
                  )}
                </div>
              )
            })}
          </div>
          <ConclusionCola cola={cola} />
        </div>
      </CardContent>
    </Card>
  )
}

// Lectura en una línea: ¿llegar detrás de otros alarga el TI?
function ConclusionCola({ cola }: { cola: { antes: 0 | 1 | 2; n: number; promedio: number }[] }) {
  const solo = cola.find((g) => g.antes === 0)
  const conCola = cola.filter((g) => g.antes > 0)
  if (!solo || conCola.length === 0 || solo.n < 10) return null
  const nCola = conCola.reduce((a, g) => a + g.n, 0)
  if (nCola < 10) return null
  const promCola = Math.round(conCola.reduce((a, g) => a + g.promedio * g.n, 0) / nCola)
  const diff = promCola - solo.promedio
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {diff >= 3 ? (
        <>
          <span className="font-medium text-red-700">Hay efecto cola:</span> el que llega detrás de otros tarda{" "}
          {diff} min más ({promCola} contra {solo.promedio}). Conviene escalonar las llegadas o sumar gente en la caja.
        </>
      ) : diff <= -3 ? (
        <>
          <span className="font-medium text-slate-700">No hay efecto cola:</span> el que llega detrás de otros tarda{" "}
          {-diff} min menos ({promCola} contra {solo.promedio}). La demora no viene de esperar la caja; hay que
          mirar cómo llega cada chofer (caja, devoluciones, documentación).
        </>
      ) : (
        <>
          <span className="font-medium text-slate-700">Sin diferencia clara:</span> llegar solo o detrás de otros da
          casi el mismo TI ({solo.promedio} contra {promCola} min).
        </>
      )}
    </p>
  )
}
