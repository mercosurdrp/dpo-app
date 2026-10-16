"use client"

import { useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, Loader2, Minus, Store, TrendingDown } from "lucide-react"
import { getSciData, type SciData } from "@/actions/sci"
import {
  armarCurvaMes, DIAS_SEMANA_CORTO, MESES_CORTO, MESES_LARGO, UMBRAL_DIA_SIN_REPARTO_HL,
  type SciMes,
} from "@/lib/sci"

// Mismos colores que el resto de Indicadores.
const BLUE = "#3B82F6"     // año / mes en foco
const GREY = "#94A3B8"     // año anterior / referencia
const AMBER = "#F59E0B"    // día por encima de promedio + 1 desvío
const GREEN = "#10B981"
const RED = "#EF4444"

function fmtN(n: number | null | undefined, dec = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y.slice(2)}`
}
function labelMes(m: SciMes): string {
  return `${MESES_CORTO[m.mes - 1]} ${String(m.anio).slice(2)}`
}

interface Props {
  inicial: SciData
}

export function SciClient({ inicial }: Props) {
  const [data, setData] = useState<SciData>(inicial)
  const [pending, startTransition] = useTransition()

  // Mes en foco: el último mes cerrado con dato del año elegido; si no hay, el último con dato.
  const mesesAnio = useMemo(() => data.meses.filter((m) => m.anio === data.anio), [data])
  const mesesAA = useMemo(() => data.meses.filter((m) => m.anio === data.anio - 1), [data])
  const defaultMes = useMemo(() => {
    const cerrados = mesesAnio.filter((m) => !m.parcial && m.sci !== null)
    if (cerrados.length) return cerrados[cerrados.length - 1].mes
    const conDato = mesesAnio.filter((m) => m.dias > 0)
    return conDato.length ? conDato[conDato.length - 1].mes : 1
  }, [mesesAnio])
  const [mesSel, setMesSel] = useState<number>(defaultMes)

  function cambiarAnio(v: string) {
    const anio = Number(v)
    startTransition(async () => {
      const res = await getSciData({ anio })
      if ("data" in res) {
        setData(res.data)
        const cerr = res.data.meses.filter((m) => m.anio === anio && !m.parcial && m.sci !== null)
        setMesSel(cerr.length ? cerr[cerr.length - 1].mes : 1)
      }
    })
  }

  const mes = mesesAnio.find((m) => m.mes === mesSel) ?? mesesAnio[0]
  const mesAA = mesesAA.find((m) => m.mes === mesSel)
  const curva = useMemo(() => armarCurvaMes(data.dias, data.anio, mesSel), [data, mesSel])
  const umbralPico = mes ? mes.promedio + mes.desvio : 0

  // Serie mensual: dos años en el mismo eje.
  const serieMensual = MESES_CORTO.map((lbl, i) => ({
    mes: lbl,
    actual: mesesAnio[i]?.sci ?? null,
    anterior: mesesAA[i]?.sci ?? null,
    parcial: mesesAnio[i]?.parcial ?? false,
  }))

  // Reparto del volumen por semana del mes y por día de semana, mes en foco vs promedio del año anterior.
  const promAA = (idx: (m: SciMes) => number[], n: number) => {
    const validos = mesesAA.filter((m) => m.sci !== null)
    return Array.from({ length: n }, (_, i) =>
      validos.length ? Math.round((validos.reduce((a, m) => a + idx(m)[i], 0) / validos.length) * 10) / 10 : 0,
    )
  }
  const semAA = promAA((m) => m.pctSemana, 5)
  const dsAA = promAA((m) => m.pctDiaSemana, 6)
  const serieSemana = [1, 2, 3, 4, 5].map((s, i) => ({ semana: `Sem ${s}`, mes: mes?.pctSemana[i] ?? 0, anterior: semAA[i] }))
  const serieDiaSemana = DIAS_SEMANA_CORTO.map((d, i) => ({ dia: d, mes: mes?.pctDiaSemana[i] ?? 0, anterior: dsAA[i] }))

  const ev = data.evaluacion
  const aniosOpc = Array.from({ length: data.hoy.anio - 2025 + 1 }, (_, i) => 2025 + i)
  const deltaAA = mes?.sci !== null && mes?.sci !== undefined && mesAA?.sci !== null && mesAA?.sci !== undefined
    ? mes.sci - mesAA.sci
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SCI — Índice de Curva de Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Planeamiento 4.3 (R4.3.3) · Entrega 3.1 · Reunión Ventas-Logística · Desvío estándar ÷ promedio del HL
            diario distribuido · Menor es mejor
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Año</Label>
            <Select value={String(data.anio)} onValueChange={(v) => v && cambiarAnio(v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {aniosOpc.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mes en foco</Label>
            <Select value={String(mesSel)} onValueChange={(v) => v && setMesSel(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mesesAnio.map((m) => (
                  <SelectItem key={m.mes} value={String(m.mes)} disabled={m.dias === 0}>
                    {MESES_LARGO[m.mes - 1]}{m.parcial ? " (en curso)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pending && <Loader2 className="size-5 animate-spin text-muted-foreground mb-2" />}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" /> SCI {mes ? MESES_LARGO[mes.mes - 1] : ""} {data.anio}
              {mes?.parcial && <Badge variant="outline" className="ml-1 text-[10px]">en curso</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{fmtN(mes?.sci, 1)}<span className="text-base font-normal text-muted-foreground"> %</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              {mes ? `${fmtN(mes.promedio)} HL/día ± ${fmtN(mes.desvio)} · ${mes.dias} días` : "sin datos"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Mismo mes {data.anio - 1}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{fmtN(mesAA?.sci, 1)}<span className="text-base font-normal text-muted-foreground"> %</span></p>
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: deltaAA === null ? undefined : deltaAA < 0 ? GREEN : deltaAA > 0 ? RED : undefined }}>
              {deltaAA === null ? <span className="text-muted-foreground">sin comparación</span> : (
                <>
                  {deltaAA < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : deltaAA > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  {deltaAA < 0 ? "mejora" : deltaAA > 0 ? "empeora" : "igual"} {fmtN(Math.abs(deltaAA), 1)} pp vs. año anterior
                </>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Store className="h-3.5 w-3.5" /> Curva de PDVs (paradas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{fmtN(mes?.sciPdv, 1)}<span className="text-base font-normal text-muted-foreground"> %</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              {mes ? `${fmtN(mes.clientesProm)} clientes/día ± ${fmtN(mes.clientesDesvio)}` : "sin datos"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5" /> Día pico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{fmtN(mes?.picoHl)}<span className="text-base font-normal text-muted-foreground"> HL</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              {mes?.picoFecha ? `${fmtFecha(mes.picoFecha)} · ${fmtN(mes.picoRatio, 2)}× el promedio · mínimo ${fmtN(mes.minHl)} HL` : "sin datos"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Criterios DPO */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">SCI promedio {data.anio} (meses cerrados):</span>
            <span className="font-semibold">{fmtN(ev.ytd, 1)} %</span>
            <span className="text-muted-foreground">vs. {data.anio - 1}:</span>
            <span className="font-semibold">{fmtN(ev.ytdAA, 1)} %</span>
            {ev.mejoraVsAA !== null && (
              <Badge className={ev.mejoraVsAA ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                {ev.mejoraVsAA ? "Mejor que el año anterior" : "Peor que el año anterior"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tendencia 3 meses:</span>
            {ev.tendencia3 === null ? (
              <Badge variant="outline">faltan meses cerrados</Badge>
            ) : (
              <Badge className={ev.tendencia3 ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
                {ev.tendencia3 ? "Positiva (3 meses bajando)" : "Sin tendencia positiva"}
              </Badge>
            )}
            {ev.ultimos3.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {ev.ultimos3.map((m) => `${MESES_CORTO[m.mes - 1]} ${fmtN(m.sci, 1)} %`).join(" → ")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SCI mensual: dos años */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SCI mes a mes · {data.anio} vs. {data.anio - 1}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieMensual} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit=" %" width={52} />
                <Tooltip
                  formatter={(v, name) => [`${fmtN(Number(v), 1)} %`, name === "actual" ? `${data.anio}` : `${data.anio - 1}`]}
                  labelFormatter={(l) => `${l}`}
                />
                <Legend formatter={(v) => (v === "actual" ? `${data.anio}` : `${data.anio - 1}`)} />
                {ev.ytdAA !== null && (
                  <ReferenceLine y={ev.ytdAA} stroke={GREY} strokeDasharray="4 4" label={{ value: `prom ${data.anio - 1}`, fontSize: 11, fill: "#64748B", position: "insideTopRight" }} />
                )}
                <Line type="monotone" dataKey="anterior" stroke={GREY} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="actual" stroke={BLUE} strokeWidth={2} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Cada punto es el SCI del mes: desvío estándar de los HL diarios ÷ promedio diario. El mes en curso se recalcula cada día.
          </p>
        </CardContent>
      </Card>

      {/* Curva diaria del mes en foco */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Curva del mes · {mes ? MESES_LARGO[mes.mes - 1] : ""} {data.anio}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={curva} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} barCategoryGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} unit=" HL" width={64} />
                <Tooltip
                  cursor={{ fill: "#F1F5F9" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as (typeof curva)[number]
                    return (
                      <div className="rounded-md border bg-white px-3 py-2 text-xs shadow">
                        <p className="font-semibold">{fmtFecha(d.fecha)} · {DIAS_SEMANA_CORTO[d.diaSemana - 1] ?? "Dom"}</p>
                        <p>{fmtN(d.hl)} HL · {fmtN(d.clientes)} clientes</p>
                        {d.motivo ? <p className="text-muted-foreground">No cuenta: {d.motivo}</p>
                          : d.hl > umbralPico ? <p style={{ color: AMBER }}>Por encima de promedio + 1 desvío</p> : null}
                      </div>
                    )
                  }}
                />
                {mes && mes.promedio > 0 && (
                  <>
                    <ReferenceLine y={mes.promedio} stroke="#0F172A" strokeDasharray="4 4" label={{ value: "promedio", fontSize: 11, fill: "#0F172A", position: "insideTopLeft" }} />
                    <ReferenceLine y={umbralPico} stroke={AMBER} strokeDasharray="2 4" label={{ value: "+1 desvío", fontSize: 11, fill: AMBER, position: "insideTopLeft" }} />
                    {mes.promedio - mes.desvio > 0 && (
                      <ReferenceLine y={mes.promedio - mes.desvio} stroke={AMBER} strokeDasharray="2 4" label={{ value: "−1 desvío", fontSize: 11, fill: AMBER, position: "insideBottomLeft" }} />
                    )}
                  </>
                )}
                <Bar dataKey="hl" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {curva.map((d) => (
                    <Cell key={d.fecha} fill={!d.valido ? "#CBD5E1" : d.hl > umbralPico ? AMBER : BLUE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Azul: días que entran en el cálculo · Ámbar: por encima de promedio + 1 desvío · Gris: feriados, domingos o días sin reparto
            (≤ {UMBRAL_DIA_SIN_REPARTO_HL} HL), no cuentan.
          </p>
        </CardContent>
      </Card>

      {/* Reparto por semana y por día de semana */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">% del volumen por semana del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieSemana} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit=" %" width={48} />
                  <Tooltip formatter={(v, name) => [`${fmtN(Number(v), 1)} %`, name === "mes" ? `${mes ? MESES_CORTO[mes.mes - 1] : ""} ${data.anio}` : `prom. ${data.anio - 1}`]} />
                  <Legend formatter={(v) => (v === "mes" ? `${mes ? MESES_CORTO[mes.mes - 1] : ""} ${data.anio}` : `promedio ${data.anio - 1}`)} />
                  <Bar dataKey="anterior" fill={GREY} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="mes" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Una curva plana reparte parecido entre semanas. Si la última semana se lleva mucho más, la venta se concentra a fin de mes.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">% del volumen por día de la semana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieDiaSemana} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit=" %" width={48} />
                  <Tooltip formatter={(v, name) => [`${fmtN(Number(v), 1)} %`, name === "mes" ? `${mes ? MESES_CORTO[mes.mes - 1] : ""} ${data.anio}` : `prom. ${data.anio - 1}`]} />
                  <Legend formatter={(v) => (v === "mes" ? `${mes ? MESES_CORTO[mes.mes - 1] : ""} ${data.anio}` : `promedio ${data.anio - 1}`)} />
                  <Bar dataKey="anterior" fill={GREY} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="mes" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Qué días de la semana cargan más la flota. Es la palanca del plan territorial (días de visita y entrega por zona).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla mensual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle mensual · {data.anio}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="text-right">HL</TableHead>
                <TableHead className="text-right">HL/día</TableHead>
                <TableHead className="text-right">Desvío</TableHead>
                <TableHead className="text-right">SCI</TableHead>
                <TableHead className="text-right">SCI {data.anio - 1}</TableHead>
                <TableHead className="text-right">SCI PDV</TableHead>
                <TableHead className="text-right">Pico</TableHead>
                <TableHead className="text-right">Pico/prom</TableHead>
                <TableHead className="text-right">Sem 4+5</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mesesAnio.map((m) => {
                const aa = mesesAA.find((x) => x.mes === m.mes)
                const mejor = m.sci !== null && aa?.sci !== null && aa?.sci !== undefined ? m.sci < aa.sci : null
                return (
                  <TableRow
                    key={m.key}
                    className={m.mes === mesSel ? "bg-blue-50/60 cursor-pointer" : "cursor-pointer"}
                    onClick={() => m.dias > 0 && setMesSel(m.mes)}
                  >
                    <TableCell className="font-medium">
                      {labelMes(m)}{m.parcial && <Badge variant="outline" className="ml-2 text-[10px]">en curso</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{m.dias || "—"}</TableCell>
                    <TableCell className="text-right">{m.dias ? fmtN(m.hlTotal) : "—"}</TableCell>
                    <TableCell className="text-right">{m.dias ? fmtN(m.promedio) : "—"}</TableCell>
                    <TableCell className="text-right">{m.dias ? fmtN(m.desvio) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold" style={{ color: mejor === null ? undefined : mejor ? GREEN : RED }}>
                      {m.sci !== null ? `${fmtN(m.sci, 1)} %` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{aa?.sci !== null && aa?.sci !== undefined ? `${fmtN(aa.sci, 1)} %` : "—"}</TableCell>
                    <TableCell className="text-right">{m.sciPdv !== null ? `${fmtN(m.sciPdv, 1)} %` : "—"}</TableCell>
                    <TableCell className="text-right">{m.dias ? `${fmtN(m.picoHl)} (${fmtFecha(m.picoFecha)})` : "—"}</TableCell>
                    <TableCell className="text-right">{m.picoRatio !== null ? `${fmtN(m.picoRatio, 2)}×` : "—"}</TableCell>
                    <TableCell className="text-right">{m.dias ? `${fmtN(m.pctSemana[3] + m.pctSemana[4], 1)} %` : "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">
            SCI en verde: mejor que el mismo mes del año anterior; en rojo: peor. Clic en una fila para ver su curva.
            Último día cargado: {fmtFecha(data.ultimaFecha)}.
          </p>
        </CardContent>
      </Card>

      {/* Metodología */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo se calcula y qué pide DPO</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 space-y-2">
          <p>
            <span className="font-semibold">Definición (Glosario DPO):</span> SCI, Sales Curve Index — «Curva de ventas.
            Indicador que refleja el desvío estándar del volumen de ventas». Acá se expresa como coeficiente de variación
            (desvío estándar poblacional de los HL diarios ÷ promedio diario × 100) para comparar meses de distinto nivel.
            Un SCI de 0 % sería vender exactamente lo mismo todos los días.
          </p>
          <p>
            <span className="font-semibold">Fuente:</span> HL distribuidos con flota propia por día (Chess + GESCOM sin las
            cuentas de patentes), la misma base de Períodos Críticos y del Dimensionamiento. Se excluyen domingos, feriados y
            días sin reparto. La Curva de PDVs aplica la misma cuenta a los clientes entregados por día.
          </p>
          <p>
            <span className="font-semibold">Qué pide DPO:</span> Planeamiento 4.3 R4.3.3 (revisar el índice de la curva de ventas /
            paradas todos los meses y que las tendencias alimenten el plan territorial), Entrega 3.1 (KPI 7 del monitoreo de
            dimensionamiento: tendencia positiva en los últimos 3 meses o mejor que el año anterior) y el TOR de la Reunión
            Ventas-Logística (KPI 2). Quilmes no fija un objetivo numérico: la referencia es el propio año anterior.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
