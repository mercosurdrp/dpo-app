"use client"

import { useMemo, useState, useTransition } from "react"
import { CalendarClock, Check, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { marcarGastoPagado } from "@/actions/mudanza"
import { tipoPagoLabel, type MudanzaGasto, type MudanzaTarea } from "@/types/mudanza"
import { formatFecha, formatMoney, parseFecha } from "./formato"

interface Props {
  gastos: MudanzaGasto[]
  tareas: MudanzaTarea[]
  hoy: string
  puedeEditar: boolean
  onEditar: (g: MudanzaGasto) => void
  onSaved: () => void
}

const DAY = 86400000

function sumarDias(iso: string, n: number): string {
  const d = parseFecha(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function mesLabel(iso: string): string {
  const d = parseFecha(iso)
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

/**
 * Calendario de pagos del presupuesto: todo lo que está "a pagar" ordenado por la
 * fecha probable de pago, con cuánto hay que tener cada semana / mes y qué parte
 * es (adelanto, saldo o total). Lo que no tiene fecha se lista aparte para que
 * alguien la ponga. "Pagado" cierra el pago previsto con la fecha de hoy.
 */
export function PagosPrevistos({ gastos, tareas, hoy, puedeEditar, onEditar, onSaved }: Props) {
  const [pending, startTransition] = useTransition()
  const [marcando, setMarcando] = useState<string | null>(null)

  const nombreTarea = useMemo(() => {
    const m: Record<string, string> = {}
    for (const t of tareas) m[t.id] = t.nombre
    return m
  }, [tareas])

  const datos = useMemo(() => {
    const previstos = gastos
      .filter((g) => g.estado === "comprometido")
      .slice()
      .sort((a, b) => {
        if (a.fecha_pago && b.fecha_pago) return a.fecha_pago.localeCompare(b.fecha_pago)
        if (a.fecha_pago) return -1
        if (b.fecha_pago) return 1
        return a.fecha.localeCompare(b.fecha)
      })
    const en7 = sumarDias(hoy, 7)
    const en30 = sumarDias(hoy, 30)
    const suma = (l: MudanzaGasto[]) => l.reduce((a, g) => a + g.monto, 0)
    const vencidos = previstos.filter((g) => g.fecha_pago && g.fecha_pago < hoy)
    const semana = previstos.filter((g) => g.fecha_pago && g.fecha_pago >= hoy && g.fecha_pago <= en7)
    const mes = previstos.filter((g) => g.fecha_pago && g.fecha_pago >= hoy && g.fecha_pago <= en30)
    const sinFecha = previstos.filter((g) => !g.fecha_pago)

    const porMes: { mes: string; label: string; total: number; n: number }[] = []
    for (const g of previstos) {
      if (!g.fecha_pago) continue
      const k = g.fecha_pago.slice(0, 7)
      let fila = porMes.find((x) => x.mes === k)
      if (!fila) {
        fila = { mes: k, label: mesLabel(g.fecha_pago), total: 0, n: 0 }
        porMes.push(fila)
      }
      fila.total += g.monto
      fila.n += 1
    }

    // Presupuesto de tareas que todavía no está cubierto ni por pagos hechos ni
    // por pagos previstos: es plata que habrá que pagar y aún no tiene fecha.
    const usado: Record<string, number> = {}
    for (const g of gastos) if (g.tarea_id) usado[g.tarea_id] = (usado[g.tarea_id] ?? 0) + g.monto
    let sinProgramar = 0
    let tareasSinProgramar = 0
    for (const t of tareas) {
      if (t.hito || t.presupuesto == null) continue
      const resto = t.presupuesto - (usado[t.id] ?? 0)
      if (resto > 0) {
        sinProgramar += resto
        tareasSinProgramar += 1
      }
    }

    return {
      previstos,
      total: suma(previstos),
      vencidos: { n: vencidos.length, total: suma(vencidos) },
      semana: { n: semana.length, total: suma(semana) },
      mes: { n: mes.length, total: suma(mes) },
      sinFecha: { n: sinFecha.length, total: suma(sinFecha) },
      porMes,
      sinProgramar,
      tareasSinProgramar,
    }
  }, [gastos, tareas, hoy])

  function marcarPagado(g: MudanzaGasto) {
    setMarcando(g.id)
    startTransition(async () => {
      const r = await marcarGastoPagado(g.id, hoy)
      setMarcando(null)
      if (!("error" in r)) onSaved()
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <CalendarClock className="size-4 text-amber-600" /> Pagos previstos
        </h3>
        <p className="text-sm tabular-nums text-slate-600">
          A pagar en total <span className="font-semibold">{formatMoney(datos.total)}</span>
          {datos.sinProgramar > 0 && (
            <>
              {" · "}sin programar todavía{" "}
              <span className="font-semibold">{formatMoney(datos.sinProgramar)}</span> en{" "}
              {datos.tareasSinProgramar} tarea{datos.tareasSinProgramar === 1 ? "" : "s"}
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Vencidos sin pagar" n={datos.vencidos.n} total={datos.vencidos.total} tone={datos.vencidos.n ? "red" : undefined} />
        <Tile label="Próximos 7 días" n={datos.semana.n} total={datos.semana.total} tone={datos.semana.n ? "amber" : undefined} />
        <Tile label="Próximos 30 días" n={datos.mes.n} total={datos.mes.total} />
        <Tile label="A pagar sin fecha" n={datos.sinFecha.n} total={datos.sinFecha.total} tone={datos.sinFecha.n ? "slate" : undefined} />
      </div>

      {datos.porMes.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {datos.porMes.map((m) => (
            <span key={m.mes} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 tabular-nums text-slate-700">
              <span className="capitalize">{m.label}</span>: <span className="font-semibold">{formatMoney(m.total)}</span>{" "}
              <span className="text-slate-400">({m.n})</span>
            </span>
          ))}
        </div>
      )}

      {datos.previstos.length === 0 ? (
        <p className="text-sm text-slate-500">
          No hay pagos pendientes. Al cargar un gasto como «A pagar» podés ponerle la fecha probable de pago y si es un
          adelanto, el saldo o la totalidad; acá aparece el calendario.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Pagar el</th>
                <th className="px-3 py-2">Tarea / concepto</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Qué se paga</th>
                <th className="px-3 py-2 text-right">Monto</th>
                {puedeEditar && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {datos.previstos.map((g) => {
                const vencido = !!g.fecha_pago && g.fecha_pago < hoy
                const dias = g.fecha_pago
                  ? Math.round((parseFecha(g.fecha_pago).getTime() - parseFecha(hoy).getTime()) / DAY)
                  : null
                return (
                  <tr key={g.id} className={`border-t border-slate-100 ${vencido ? "bg-red-50/60" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                      {g.fecha_pago ? (
                        <>
                          <span className={vencido ? "font-semibold text-red-700" : ""}>{formatFecha(g.fecha_pago)}</span>
                          {dias != null && (
                            <span className={`ml-1 text-xs ${vencido ? "text-red-600" : "text-slate-400"}`}>
                              {dias === 0 ? "hoy" : dias < 0 ? `hace ${-dias} d` : `en ${dias} d`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">sin fecha</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {puedeEditar ? (
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => onEditar(g)}>
                          {g.concepto}
                        </button>
                      ) : (
                        <span className="font-medium">{g.concepto}</span>
                      )}
                      {g.tarea_id && nombreTarea[g.tarea_id] && nombreTarea[g.tarea_id] !== g.concepto && (
                        <div className="text-xs text-slate-500">{nombreTarea[g.tarea_id]}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{g.proveedor ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      {tipoPagoLabel(g.tipo_pago) ? (
                        <Badge
                          variant="outline"
                          className={
                            g.tipo_pago === "total"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : g.tipo_pago === "saldo"
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {tipoPagoLabel(g.tipo_pago)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{formatMoney(g.monto)}</td>
                    {puedeEditar && (
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          disabled={pending}
                          title="Se pagó hoy por este monto. Si se pagó otro día u otra cifra, editá el gasto."
                          onClick={() => marcarPagado(g)}
                        >
                          {pending && marcando === g.id ? (
                            <Loader2 className="mr-1 size-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 size-3.5" />
                          )}
                          Pagado
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Tile({
  label,
  n,
  total,
  tone,
}: {
  label: string
  n: number
  total: number
  tone?: "red" | "amber" | "slate"
}) {
  const color =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "slate" ? "text-slate-600" : "text-slate-900"
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${color}`}>{n ? formatMoney(total) : "—"}</p>
      <p className="text-xs text-slate-400">{n} pago{n === 1 ? "" : "s"}</p>
    </div>
  )
}
