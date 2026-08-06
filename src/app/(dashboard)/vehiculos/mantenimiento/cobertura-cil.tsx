"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, Loader2, Truck } from "lucide-react"
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
import { getCoberturaCilMes, type CoberturaCilMes } from "@/actions/cil-cobertura"
import { CICLO_CIL_MENSUAL, labelTareaCil } from "@/lib/flota/cil-tareas"

/**
 * Cobertura del CIL del mes: qué unidad completó las tres letras y cuál falta.
 *
 * 🚨 Convive con el KPI de tareas (18/30) y dice otra cosa: el KPI cuenta tareas
 * sueltas, esto cuenta unidades completas. Ver `actions/cil-cobertura.ts`.
 *
 * Se reinicia solo el 1° de cada mes porque siempre se calcula sobre el mes
 * elegido; no hay nada programado que pueda fallar.
 */

function fmtMes(ym: string): string {
  const [a, m] = ym.split("-")
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ]
  return `${meses[Number(m) - 1]} ${a}`
}

function fmtDia(f: string): string {
  return f.slice(0, 10).split("-").reverse().slice(0, 2).join("/")
}

/** Los últimos 6 meses hasta el actual, para mirar hacia atrás sin recargar. */
function ultimosMeses(desde: string, cantidad = 6): string[] {
  const [a0, m0] = desde.split("-").map(Number)
  const out: string[] = []
  for (let i = 0; i < cantidad; i++) {
    const total = a0 * 12 + (m0 - 1) - i
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`)
  }
  return out
}

export function CoberturaCil({ mesActual }: { mesActual: string }) {
  const [ym, setYm] = useState(mesActual)
  const [data, setData] = useState<CoberturaCilMes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (mes: string) => {
    setCargando(true)
    setError(null)
    const res = await getCoberturaCilMes(mes)
    if ("error" in res) setError(res.error)
    else setData(res.data)
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar(ym)
  }, [ym, cargar])

  const ciclo = CICLO_CIL_MENSUAL as readonly string[]
  const obligatorias = data?.unidades.filter((u) => u.obligatoria) ?? []
  const optativas = data?.unidades.filter((u) => !u.obligatoria) ?? []
  const pct =
    data && data.totalObligatorias > 0
      ? Math.round((data.completasObligatorias / data.totalObligatorias) * 100)
      : null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Truck className="size-4 text-muted-foreground" /> Cobertura del CIL
          <DpoPuntoBadge numero="4.1" />
        </CardTitle>
        <Select value={ym} onValueChange={(v) => v && setYm(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ultimosMeses(mesActual).map((m) => (
              <SelectItem key={m} value={m}>
                {fmtMes(m)}
                {m === mesActual ? " (en curso)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Una unidad está al día cuando tiene las tres tareas del ciclo en el mes:{" "}
          {ciclo.map((t) => labelTareaCil(t)).join(", ")}. Arranca vacío el 1° de cada
          mes.
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando…
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : !data ? null : (
          <>
            {/* Resumen */}
            <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-muted/40 p-4">
              <div>
                <p className="text-xs text-muted-foreground">Unidades al día</p>
                <p
                  className={`text-3xl font-bold ${
                    pct === 100
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {data.completasObligatorias}
                  <span className="text-lg font-medium text-muted-foreground">
                    {" "}
                    de {data.totalObligatorias}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cobertura</p>
                <p className="text-2xl font-semibold">{pct != null ? `${pct}%` : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tareas del mes (KPI)</p>
                <p className="text-2xl font-semibold">
                  {data.tareasMes}
                  <span className="text-base font-medium text-muted-foreground">
                    {" "}
                    / {data.metaMes}
                  </span>
                </p>
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                Son dos lecturas distintas: el KPI cuenta tareas sueltas, la cobertura
                cuenta unidades con el ciclo completo.
              </p>
            </div>

            <TablaCobertura unidades={obligatorias} ciclo={ciclo} />

            {optativas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Camionetas — se muestran pero no cuentan para el porcentaje: la
                  inspección de fluidos y la lubricación se hacen acá, pero el lavado a
                  veces se hace en un lavadero externo y no deja registro propio.
                </p>
                <TablaCobertura unidades={optativas} ciclo={ciclo} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TablaCobertura({
  unidades,
  ciclo,
}: {
  unidades: CoberturaCilMes["unidades"]
  ciclo: readonly string[]
}) {
  if (unidades.length === 0) {
    return (
      <p className="py-3 text-center text-sm text-muted-foreground">Sin unidades.</p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Unidad</th>
            {ciclo.map((t) => (
              <th key={t} className="py-2 pr-3 font-medium">
                {labelTareaCil(t)}
              </th>
            ))}
            <th className="py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {unidades.map((u) => (
            <tr key={u.dominio} className="border-b last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap font-medium">
                {u.dominio}
                {u.numero && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (N° {u.numero})
                  </span>
                )}
              </td>
              {ciclo.map((t) => {
                const hecha = u.hechas[t]
                return (
                  <td key={t} className="py-2 pr-3">
                    {hecha ? (
                      <span className="inline-flex flex-col">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" /> {fmtDia(hecha.fecha)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {hecha.operario}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <CircleAlert className="size-3.5" /> Falta
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="py-2">
                {u.completa ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    Al día
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                  >
                    Falta {u.faltan.length}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
