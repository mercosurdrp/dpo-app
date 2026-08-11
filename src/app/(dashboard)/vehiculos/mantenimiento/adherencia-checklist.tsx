"use client"

import { useCallback, useEffect, useState } from "react"
import { CircleAlert, Loader2, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DpoPuntoBadge } from "./_components/dpo-badge"
import {
  getAdherenciaChecklist,
  type AdherenciaChecklist,
} from "@/actions/checklist-adherencia"

/**
 * Adherencia al checklist (DPO 1.3 — R1.3.1a).
 *
 * 🚨 El semáforo se pone verde SÓLO en 100 %: el requisito exige exactamente
 * eso. Un tablero propio que pinta de verde el 96 % es, frente al auditor, una
 * declaración escrita de que se acepta menos del 100 %.
 */

function fmtDia(f: string): string {
  return f.slice(0, 10).split("-").reverse().slice(0, 2).join("/")
}

function hoyArg(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

const RANGOS = [
  { id: "30", label: "Últimos 30 días", dias: 30 },
  { id: "60", label: "Últimos 60 días", dias: 60 },
  { id: "90", label: "Últimos 90 días", dias: 90 },
]

const FALTA_LABEL: Record<string, string> = {
  ambos: "Sin ningún checklist",
  retorno: "Falta el retorno",
  liberacion: "Falta la salida",
}

export function AdherenciaChecklistCard() {
  const [rango, setRango] = useState("30")
  const [data, setData] = useState<AdherenciaChecklist | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [verTodos, setVerTodos] = useState(false)

  const cargar = useCallback(async (id: string) => {
    setCargando(true)
    setError(null)
    const dias = RANGOS.find((r) => r.id === id)?.dias ?? 30
    const hasta = hoyArg()
    const res = await getAdherenciaChecklist(restarDias(hasta, dias), hasta)
    if ("error" in res) setError(res.error)
    else setData(res.data)
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar(rango)
  }, [rango, cargar])

  const cumple = data?.pct === 100

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-muted-foreground" /> Adherencia al checklist
          <DpoPuntoBadge numero="1.3" />
        </CardTitle>
        <Select value={rango} onValueChange={(v) => v && setRango(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGOS.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Por cada día que un camión <strong>efectivamente repartió</strong>, si hizo el
          checklist de salida <strong>y</strong> el de retorno. El denominador sale de las
          entregas reales, no de los checklists cargados: así el camión que salió sin
          cargar nada no desaparece de la cuenta. Quedan afuera el{" "}
          <strong>día en curso</strong> —el retorno todavía no pudo hacerse— y los días de{" "}
          <strong>sólo venta de gestión</strong>, donde la patente no se observa: se deduce
          del chofer y termina cayendo en su unidad anterior.
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando…
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : !data ? null : (
          <>
            <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-muted/40 p-4">
              <div>
                <p className="text-xs text-muted-foreground">Adherencia</p>
                <p
                  className={`text-3xl font-bold ${
                    cumple
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {data.pct != null ? `${data.pct}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.completos} de {data.ruteados} camión-día
                </p>
                <p className="text-xs text-muted-foreground/80">
                  hasta el {fmtDia(data.hasta)}
                  {data.diaEnCursoExcluido ? " (sin el día de hoy)" : ""}
                  {data.soloGestionExcluidos > 0
                    ? ` · ${data.soloGestionExcluidos} día(s) de sólo gestión afuera`
                    : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sin ningún checklist</p>
                <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                  {data.sinNinguno}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sin cerrar el retorno</p>
                <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                  {data.soloLiberacion}
                </p>
              </div>
              <p className="max-w-sm text-xs text-muted-foreground">
                El requisito R1.3.1a exige <strong>100 %</strong>: se activa porque el
                checklist no impide usar la unidad. El 1.3 es mandatorio.
              </p>
            </div>

            {!cumple && (
              <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Por debajo del 100 %: cada día en rojo necesita una acción registrada.
                  Mostrar el número sin la acción no alcanza para el requisito.
                </span>
              </p>
            )}

            {/* Por unidad: dónde está el problema */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Unidad</th>
                    <th className="py-2 pr-3 font-medium">Días que repartió</th>
                    <th className="py-2 pr-3 font-medium">Con los dos checklists</th>
                    <th className="py-2 font-medium">Adherencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porUnidad.map((u) => (
                    <tr key={u.dominio} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{u.dominio}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{u.ruteados}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{u.completos}</td>
                      <td className="py-2">
                        <Badge
                          variant="outline"
                          className={
                            u.pct === 100
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                          }
                        >
                          {u.pct}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* El detalle, que es lo que hay que ir a reclamar */}
            {data.faltantes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Días a reclamar ({data.faltantes.length})
                </p>
                <ul className="space-y-1">
                  {(verTodos ? data.faltantes : data.faltantes.slice(0, 12)).map((f) => (
                    <li
                      key={`${f.fecha}|${f.dominio}`}
                      className="flex items-center justify-between border-b pb-1 text-sm last:border-0"
                    >
                      <span>
                        <span className="font-medium">{f.dominio}</span>
                        <span className="text-muted-foreground"> · {fmtDia(f.fecha)}</span>
                      </span>
                      <span
                        className={
                          f.falta === "ambos"
                            ? "text-xs text-red-600 dark:text-red-400"
                            : "text-xs text-amber-600 dark:text-amber-400"
                        }
                      >
                        {FALTA_LABEL[f.falta]}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.faltantes.length > 12 && (
                  <button
                    type="button"
                    onClick={() => setVerTodos((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    {verTodos
                      ? "Ver menos"
                      : `Ver los ${data.faltantes.length - 12} restantes`}
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Sólo camiones: los autoelevadores no reparten y el acoplado no se conduce.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
