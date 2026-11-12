"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays } from "lucide-react"
import type { TiRegistro } from "@/types/database"
import {
  DIAS_SEMANA,
  TI_META,
  TI_REINCIDENCIA_MINUTOS,
  matrizDiaSemana,
  registrosValidos,
  type Celda,
} from "@/lib/tiempo-interno-analisis"

const PERIODOS = [
  { valor: "30", label: "Últimos 30 días", dias: 30 },
  { valor: "90", label: "Últimos 3 meses", dias: 90 },
  { valor: "todo", label: "Todo", dias: null },
] as const
type Periodo = (typeof PERIODOS)[number]["valor"]

function claseCelda(c: Celda | null): string {
  if (!c) return "bg-slate-50 text-slate-300"
  if (c.promedio <= TI_META) return "bg-green-100 text-green-800"
  if (c.promedio <= TI_REINCIDENCIA_MINUTOS) return "bg-amber-100 text-amber-800"
  return "bg-red-100 text-red-800"
}

function CeldaTi({ c, negrita }: { c: Celda | null; negrita?: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 text-center tabular-nums ${claseCelda(c)} ${negrita ? "font-semibold" : ""}`}
      title={c ? `${c.promedio} min promedio · ${c.n} retornos · ${c.pctMeta}% dentro de meta` : "Sin retornos"}
    >
      {c ? (
        <div className="leading-tight">
          <div className="text-sm">{c.promedio}</div>
          <div className="text-[10px] opacity-70">n={c.n}</div>
        </div>
      ) : (
        "—"
      )}
    </td>
  )
}

export function TiAnalisisDiaSemana({ registros }: { registros: TiRegistro[] }) {
  const [periodo, setPeriodo] = useState<Periodo>("90")

  const matriz = useMemo(() => {
    const validos = registrosValidos(registros)
    const p = PERIODOS.find((x) => x.valor === periodo)!
    if (p.dias == null || validos.length === 0) return matrizDiaSemana(validos)
    const ultima = validos.reduce((m, r) => (r.fecha > m ? r.fecha : m), validos[0].fecha)
    const desde = new Date(new Date(ultima + "T12:00:00Z").getTime() - p.dias * 86400000)
      .toISOString()
      .slice(0, 10)
    return matrizDiaSemana(validos.filter((r) => r.fecha > desde))
  }, [registros, periodo])

  // El peor día de la semana (promedio general), para resaltarlo en el texto.
  const peorDia = useMemo(() => {
    let best: { dia: number; c: Celda } | null = null
    matriz.dias.forEach((d, i) => {
      const c = matriz.totalPorDia[i]
      if (c && c.n >= 5 && (!best || c.promedio > best.c.promedio)) best = { dia: d, c }
    })
    return best as { dia: number; c: Celda } | null
  }, [matriz])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              TI por día de la semana y chofer
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Promedio de minutos entre la llegada y el fichaje de salida. Verde ≤ {TI_META} · ámbar ≤{" "}
              {TI_REINCIDENCIA_MINUTOS} · rojo &gt; {TI_REINCIDENCIA_MINUTOS}. Pasá el mouse para ver el % dentro de meta.
            </p>
          </div>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          >
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {matriz.filas.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sin retornos con TI en el período.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-2 py-1 text-left font-medium">Chofer</th>
                    {matriz.dias.map((d) => (
                      <th key={d} className="px-2 py-1 font-medium">
                        {DIAS_SEMANA[d]}
                      </th>
                    ))}
                    <th className="px-2 py-1 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matriz.filas.map((f) => (
                    <tr key={f.chofer}>
                      <td className="whitespace-nowrap px-2 py-1.5 text-slate-800">{f.chofer}</td>
                      {f.celdas.map((c, i) => (
                        <CeldaTi key={i} c={c} />
                      ))}
                      <CeldaTi c={f.total} negrita />
                    </tr>
                  ))}
                  <tr>
                    <td className="px-2 py-1.5 font-semibold text-slate-800">Todos</td>
                    {matriz.totalPorDia.map((c, i) => (
                      <CeldaTi key={i} c={c} negrita />
                    ))}
                    <CeldaTi c={matriz.total} negrita />
                  </tr>
                </tbody>
              </table>
            </div>
            {peorDia && (
              <p className="mt-3 text-xs text-muted-foreground">
                El día que más se tarda es el <span className="font-medium text-slate-700">{DIAS_SEMANA[peorDia.dia]}</span>{" "}
                ({peorDia.c.promedio} min promedio, {peorDia.c.pctMeta}% dentro de meta).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
