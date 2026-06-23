"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CalendarDays, Gauge } from "lucide-react"
import type { MantenimientoRealizado, VehiculoTipo } from "@/types/database"

// Objetivo de disponibilidad de flota (de la planilla histórica: 98%).
const TARGET_DISP = 98

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const fmtMesLargo = (ym: string) => {
  const [y, m] = ym.split("-")
  return `${MESES[Number(m) - 1] ?? m} ${y}`
}
const pad = (n: number) => String(n).padStart(2, "0")
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
}

interface Props {
  mantenimientos: MantenimientoRealizado[]
  unidades: UnidadFlota[]
}

type Causa = "PMC" | "PMP" | null

interface FilaDisp {
  dominio: string
  diasPeriodo: number
  pmc: number
  pmp: number
  parado: number
  disponibles: number
  pct: number | null
  // día (1..N) -> causa de parada, o undefined si disponible
  porDia: Map<number, Exclude<Causa, null>>
}

export function SeguimientoFlota({ mantenimientos, unidades }: Props) {
  const [vista, setVista] = useState<"mes" | "dia">("mes")

  // Unidades de ruta (excluyo autoelevadores, que se miden distinto).
  const flota = useMemo(
    () => unidades.filter((u) => u.tipo !== "autoelevador"),
    [unidades]
  )

  // Meses con datos (por fecha de OT o por período fuera de servicio) + mes actual.
  const meses = useMemo(() => {
    const set = new Set<string>()
    set.add(hoyISO().slice(0, 7))
    for (const m of mantenimientos) {
      if (m.fecha) set.add(m.fecha.slice(0, 7))
      if (m.fuera_servicio_desde) set.add(m.fuera_servicio_desde.slice(0, 7))
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [mantenimientos])

  const [mesSel, setMesSel] = useState<string>(meses[0] ?? hoyISO().slice(0, 7))

  const calc = useMemo(() => {
    const [y, mm] = mesSel.split("-").map(Number)
    const diasDelMes = new Date(y, mm, 0).getDate()
    const hoy = hoyISO()
    const esMesActual = mesSel === hoy.slice(0, 7)
    const esFuturo = mesSel > hoy.slice(0, 7)
    // Para el mes en curso contamos los días transcurridos; meses pasados, completo.
    const diasPeriodo = esFuturo ? 0 : esMesActual ? Number(hoy.slice(8, 10)) : diasDelMes

    // Paradas con período, por dominio.
    const paradasPorDom = new Map<
      string,
      { desde: string; hasta: string; causa: Exclude<Causa, null> }[]
    >()
    for (const m of mantenimientos) {
      if (!m.fuera_servicio_desde) continue
      const desde = m.fuera_servicio_desde
      const hasta = m.fuera_servicio_hasta || hoy // sin "hasta" => sigue parado hasta hoy
      const causa: Exclude<Causa, null> = m.tipo === "correctivo" ? "PMC" : "PMP"
      const arr = paradasPorDom.get(m.dominio) ?? []
      arr.push({ desde, hasta, causa })
      paradasPorDom.set(m.dominio, arr)
    }

    const filas: FilaDisp[] = flota.map((u) => {
      const porDia = new Map<number, Exclude<Causa, null>>()
      const paradas = paradasPorDom.get(u.dominio) ?? []
      for (let d = 1; d <= diasPeriodo; d++) {
        const fecha = `${mesSel}-${pad(d)}`
        for (const p of paradas) {
          if (fecha >= p.desde && fecha <= p.hasta) {
            // correctivo tiene prioridad de color sobre preventivo
            const prev = porDia.get(d)
            if (prev !== "PMC") porDia.set(d, p.causa === "PMC" ? "PMC" : prev ?? "PMP")
            if (p.causa === "PMC") porDia.set(d, "PMC")
            break
          }
        }
      }
      let pmc = 0
      let pmp = 0
      for (const c of porDia.values()) c === "PMC" ? pmc++ : pmp++
      const parado = porDia.size
      const disponibles = Math.max(0, diasPeriodo - parado)
      const pct = diasPeriodo > 0 ? (disponibles / diasPeriodo) * 100 : null
      return { dominio: u.dominio, diasPeriodo, pmc, pmp, parado, disponibles, pct, porDia }
    })

    const conPct = filas.filter((f) => f.pct != null)
    const flotaPct =
      conPct.length > 0
        ? conPct.reduce((a, f) => a + (f.pct ?? 0), 0) / conPct.length
        : null
    const camionesConParada = filas.filter((f) => f.parado > 0).length
    const diasCamionParados = filas.reduce((a, f) => a + f.parado, 0)

    return { diasDelMes, diasPeriodo, filas, flotaPct, camionesConParada, diasCamionParados }
  }, [mesSel, mantenimientos, flota])

  const colorPct = (pct: number | null) =>
    pct == null
      ? "text-slate-400"
      : pct >= TARGET_DISP
        ? "text-emerald-600"
        : pct >= 90
          ? "text-amber-600"
          : "text-red-600"

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Mes</p>
          <Select value={mesSel} onValueChange={(v) => v && setMesSel(v)}>
            <SelectTrigger className="w-48 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map((ym) => (
                <SelectItem key={ym} value={ym} className="capitalize">
                  {fmtMesLargo(ym)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          <Button
            size="sm"
            variant={vista === "mes" ? "default" : "ghost"}
            onClick={() => setVista("mes")}
          >
            <Gauge className="mr-1 size-4" /> Por mes
          </Button>
          <Button
            size="sm"
            variant={vista === "dia" ? "default" : "ghost"}
            onClick={() => setVista("dia")}
          >
            <CalendarDays className="mr-1 size-4" /> Por día
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Disponibilidad de flota
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", colorPct(calc.flotaPct))}>
              {calc.flotaPct == null ? "—" : `${calc.flotaPct.toFixed(1)}%`}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">Objetivo {TARGET_DISP}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Camiones con paradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{calc.camionesConParada}</p>
            <p className="mt-0.5 text-xs text-slate-400">de {calc.filas.length} unidades</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Días-camión parados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{calc.diasCamionParados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Días del período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{calc.diasPeriodo}</p>
            <p className="mt-0.5 text-xs text-slate-400">de {calc.diasDelMes} del mes</p>
          </CardContent>
        </Card>
      </div>

      {vista === "mes" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Disponibilidad por unidad</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2">Unidad</th>
                  <th className="text-right">Días período</th>
                  <th className="text-right">Parado correctivo</th>
                  <th className="text-right">Parado preventivo</th>
                  <th className="text-right">Disponibles</th>
                  <th className="text-right">% Disponibilidad</th>
                </tr>
              </thead>
              <tbody>
                {calc.filas.map((f) => (
                  <tr key={f.dominio} className="border-b last:border-0">
                    <td className="py-2 font-medium">{f.dominio}</td>
                    <td className="text-right tabular-nums text-slate-600">{f.diasPeriodo}</td>
                    <td className="text-right tabular-nums text-red-600">{f.pmc || "—"}</td>
                    <td className="text-right tabular-nums text-amber-600">{f.pmp || "—"}</td>
                    <td className="text-right tabular-nums text-slate-600">{f.disponibles}</td>
                    <td className={cn("text-right font-semibold tabular-nums", colorPct(f.pct))}>
                      {f.pct == null ? "—" : `${f.pct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <Leyenda clase="bg-red-500" txt="Parado por correctivo (PMC)" />
              <Leyenda clase="bg-amber-400" txt="Parado por preventivo (PMP)" />
              <Leyenda clase="bg-emerald-500" txt="Disponible" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calendario de disponibilidad</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="sticky left-0 bg-white px-2 py-1 text-left">Unidad</th>
                  {Array.from({ length: calc.diasDelMes }, (_, i) => i + 1).map((d) => (
                    <th key={d} className="w-6 px-0 text-center font-normal">
                      {d}
                    </th>
                  ))}
                  <th className="px-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {calc.filas.map((f) => (
                  <tr key={f.dominio}>
                    <td className="sticky left-0 bg-white px-2 py-0.5 font-medium whitespace-nowrap">
                      {f.dominio}
                    </td>
                    {Array.from({ length: calc.diasDelMes }, (_, i) => i + 1).map((d) => {
                      const causa = f.porDia.get(d)
                      const fueraPeriodo = d > calc.diasPeriodo
                      const clase = fueraPeriodo
                        ? "bg-slate-100"
                        : causa === "PMC"
                          ? "bg-red-500"
                          : causa === "PMP"
                            ? "bg-amber-400"
                            : "bg-emerald-500"
                      return (
                        <td key={d} className="p-px">
                          <div
                            className={cn("h-5 w-6 rounded-sm", clase)}
                            title={`${f.dominio} · día ${d}: ${
                              fueraPeriodo
                                ? "—"
                                : causa === "PMC"
                                  ? "parado (correctivo)"
                                  : causa === "PMP"
                                    ? "parado (preventivo)"
                                    : "disponible"
                            }`}
                          />
                        </td>
                      )
                    })}
                    <td className={cn("px-2 text-right font-semibold tabular-nums", colorPct(f.pct))}>
                      {f.pct == null ? "—" : `${Math.round(f.pct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <Leyenda clase="bg-emerald-500" txt="Disponible" />
              <Leyenda clase="bg-red-500" txt="Parado correctivo" />
              <Leyenda clase="bg-amber-400" txt="Parado preventivo" />
              <Leyenda clase="bg-slate-100" txt="Fuera del período" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Leyenda({ clase, txt }: { clase: string; txt: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", clase)} />
      <span>{txt}</span>
    </span>
  )
}
