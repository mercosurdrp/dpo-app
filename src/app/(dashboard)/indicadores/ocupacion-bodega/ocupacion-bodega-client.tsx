"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Loader2, Package, Target, TrendingUp, Truck } from "lucide-react"
import { getOBKpis, getOBViajes, getOBPorPatente, getOBPorDia, type ViajeOB, type PatenteSummary, type DiaSummary, type MesSummary, type OBKpis } from "@/actions/ocupacion-bodega"

const TARGET = 525
const GREEN = "#10B981"
const AMBER = "#F59E0B"
const RED = "#EF4444"
const BLUE = "#3B82F6"

function colorFor(ceq: number): string {
  if (ceq >= TARGET) return GREEN
  if (ceq >= TARGET * 0.7) return AMBER
  return RED
}

function fmtN(n: number, dec = 0): string {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

interface Props {
  kpis: OBKpis
  viajes: ViajeOB[]
  porPatente: PatenteSummary[]
  porDia: DiaSummary[]
  porMes: MesSummary[]
  patentes: string[]
}

export function OcupacionBodegaClient({ kpis: kpisInit, viajes: viajesInit, porPatente: porPatenteInit, porDia: porDiaInit, porMes, patentes }: Props) {
  const [kpis, setKpis] = useState(kpisInit)
  const [viajes, setViajes] = useState(viajesInit)
  const [porPatente, setPorPatente] = useState(porPatenteInit)
  const [porDia, setPorDia] = useState(porDiaInit)
  const [desde, setDesde] = useState(kpisInit.desde)
  const [hasta, setHasta] = useState(kpisInit.hasta)
  const [patenteFilter, setPatenteFilter] = useState<string>("__all__")
  const [pending, startTransition] = useTransition()

  async function reload(d: string, h: string, p: string) {
    const patente = p === "__all__" ? undefined : p
    const [k, v, pp, pd] = await Promise.all([
      getOBKpis({ desde: d, hasta: h, patente }),
      getOBViajes({ desde: d, hasta: h, patente, limit: 200 }),
      getOBPorPatente({ desde: d, hasta: h }),
      getOBPorDia({ desde: d, hasta: h, patente }),
    ])
    if ("data" in k) setKpis(k.data)
    if ("data" in v) setViajes(v.data)
    if ("data" in pp) setPorPatente(pp.data)
    if ("data" in pd) setPorDia(pd.data)
  }

  function aplicarFiltros() {
    startTransition(async () => { await reload(desde, hasta, patenteFilter) })
  }

  // Atajos de fecha
  function setRangePreset(preset: "hoy" | "semana" | "mtd" | "ytd") {
    const hoyD = new Date()
    const fHasta = hoyD.toISOString().slice(0, 10)
    let fDesde = fHasta
    if (preset === "semana") {
      const d = new Date(hoyD); d.setDate(hoyD.getDate() - 6); fDesde = d.toISOString().slice(0, 10)
    } else if (preset === "mtd") {
      fDesde = new Date(hoyD.getFullYear(), hoyD.getMonth(), 1).toISOString().slice(0, 10)
    } else if (preset === "ytd") {
      fDesde = new Date(hoyD.getFullYear(), 0, 1).toISOString().slice(0, 10)
    }
    setDesde(fDesde); setHasta(fHasta)
    startTransition(async () => { await reload(fDesde, fHasta, patenteFilter) })
  }

  const cumpleMeta = kpis.ceq_promedio >= TARGET
  const obPct = kpis.target > 0 ? (kpis.ceq_promedio / kpis.target) * 100 : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ocupación de Bodega (CEq)</h1>
          <p className="text-sm text-muted-foreground">
            Pilar Entrega 1.2 · Target {TARGET} CEq por viaje · Fórmula CEq = 120 / bultosPallet × cantidadesTotal
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="desde" className="text-xs">Desde</Label>
              <Input id="desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta" className="text-xs">Hasta</Label>
              <Input id="hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Patente</Label>
              <Select value={patenteFilter} onValueChange={(v) => setPatenteFilter(v ?? "__all__")}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {patentes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={aplicarFiltros} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
            </Button>
            <div className="flex gap-1 ml-auto">
              <Button size="sm" variant="outline" onClick={() => setRangePreset("hoy")}>Hoy</Button>
              <Button size="sm" variant="outline" onClick={() => setRangePreset("semana")}>7 días</Button>
              <Button size="sm" variant="outline" onClick={() => setRangePreset("mtd")}>MTD</Button>
              <Button size="sm" variant="outline" onClick={() => setRangePreset("ytd")}>YTD</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">CEq promedio por viaje</p>
                <p className="text-3xl font-bold" style={{ color: cumpleMeta ? GREEN : obPct >= 70 ? AMBER : RED }}>
                  {fmtN(kpis.ceq_promedio, 1)}
                </p>
                <p className="text-xs text-muted-foreground">de {TARGET} CEq · {fmtN(obPct, 1)}% del target</p>
              </div>
              <Target className="size-6 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Viajes</p>
                <p className="text-3xl font-bold">{fmtN(kpis.viajes)}</p>
                <p className="text-xs text-muted-foreground">{fmtN(kpis.pct_meta, 1)}% en meta ≥ {TARGET}</p>
              </div>
              <Truck className="size-6 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">CEq total cargado</p>
                <p className="text-3xl font-bold">{fmtN(kpis.ceq_total)}</p>
                <p className="text-xs text-muted-foreground">{fmtN(kpis.bultos_total)} bultos · {fmtN(kpis.hl_total, 1)} HL</p>
              </div>
              <Package className="size-6 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Mejor viaje</p>
                <p className="text-3xl font-bold" style={{ color: GREEN }}>{fmtN(kpis.ceq_max, 1)}</p>
                <p className="text-xs text-muted-foreground">{kpis.patente_top ?? "—"} (min {fmtN(kpis.ceq_min, 1)})</p>
              </div>
              <TrendingUp className="size-6 text-slate-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="diaria">
        <TabsList>
          <TabsTrigger value="diaria">Diaria</TabsTrigger>
          <TabsTrigger value="patentes">Por patente</TabsTrigger>
          <TabsTrigger value="mensual">Tendencia mensual</TabsTrigger>
          <TabsTrigger value="viajes">Todos los viajes</TabsTrigger>
        </TabsList>

        {/* DIARIA */}
        <TabsContent value="diaria" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">CEq promedio por día</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={porDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" fontSize={11} tickFormatter={f => f.slice(5)} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => fmtN(Number(v), 1)} />
                    <ReferenceLine y={TARGET} stroke={GREEN} strokeDasharray="5 5" label={{ value: `Meta ${TARGET}`, position: "right", fontSize: 10 }} />
                    <Bar dataKey="ceq_promedio" radius={[4, 4, 0, 0]}>
                      {porDia.map((d, i) => <Cell key={i} fill={colorFor(d.ceq_promedio)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Detalle por día</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Viajes</TableHead>
                      <TableHead className="text-right">CEq total</TableHead>
                      <TableHead className="text-right">CEq prom/viaje</TableHead>
                      <TableHead className="text-right">% del target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porDia.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin datos en el rango</TableCell></TableRow>
                    ) : porDia.slice().reverse().map(d => {
                      const pct = (d.ceq_promedio / TARGET) * 100
                      return (
                        <TableRow key={d.fecha}>
                          <TableCell className="font-mono text-sm">{d.fecha}</TableCell>
                          <TableCell className="text-right">{d.viajes}</TableCell>
                          <TableCell className="text-right">{fmtN(d.ceq_total, 1)}</TableCell>
                          <TableCell className="text-right font-semibold" style={{ color: colorFor(d.ceq_promedio) }}>
                            {fmtN(d.ceq_promedio, 1)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" style={{ color: colorFor(d.ceq_promedio), borderColor: colorFor(d.ceq_promedio) }}>
                              {fmtN(pct, 1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PATENTES */}
        <TabsContent value="patentes" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ranking de patentes (en el rango)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={porPatente.slice(0, 20)} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="patente" fontSize={11} width={90} />
                    <Tooltip formatter={(v) => [fmtN(Number(v), 1), "CEq promedio"]} />
                    <ReferenceLine x={TARGET} stroke={GREEN} strokeDasharray="5 5" />
                    <Bar dataKey="ceq_promedio">
                      {porPatente.slice(0, 20).map((p, i) => <Cell key={i} fill={colorFor(p.ceq_promedio)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Detalle por patente</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patente</TableHead>
                      <TableHead className="text-right">Viajes</TableHead>
                      <TableHead className="text-right">CEq prom</TableHead>
                      <TableHead className="text-right">CEq min</TableHead>
                      <TableHead className="text-right">CEq max</TableHead>
                      <TableHead className="text-right">CEq total</TableHead>
                      <TableHead className="text-right">% en meta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porPatente.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                    ) : porPatente.map(p => (
                      <TableRow key={p.patente}>
                        <TableCell className="font-mono font-medium">{p.patente}</TableCell>
                        <TableCell className="text-right">{p.viajes}</TableCell>
                        <TableCell className="text-right font-semibold" style={{ color: colorFor(p.ceq_promedio) }}>
                          {fmtN(p.ceq_promedio, 1)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtN(p.ceq_min, 1)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtN(p.ceq_max, 1)}</TableCell>
                        <TableCell className="text-right">{fmtN(p.ceq_total, 1)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{fmtN(p.pct_meta, 1)}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MENSUAL */}
        <TabsContent value="mensual" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Tendencia mensual (últimos 12 meses)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={porMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mes" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => [fmtN(Number(v), 1), "CEq prom"]} />
                    <Legend />
                    <ReferenceLine y={TARGET} stroke={GREEN} strokeDasharray="5 5" label={{ value: `Meta ${TARGET}`, position: "right", fontSize: 10 }} />
                    <Line type="monotone" dataKey="ceq_promedio" name="CEq prom/viaje" stroke={BLUE} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Detalle mensual</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Viajes</TableHead>
                    <TableHead className="text-right">Patentes</TableHead>
                    <TableHead className="text-right">CEq prom</TableHead>
                    <TableHead className="text-right">CEq total</TableHead>
                    <TableHead className="text-right">% en meta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porMes.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                  ) : porMes.map(m => (
                    <TableRow key={m.mes}>
                      <TableCell className="font-mono">{m.mes}</TableCell>
                      <TableCell className="text-right">{m.viajes}</TableCell>
                      <TableCell className="text-right">{m.patentes_distintas}</TableCell>
                      <TableCell className="text-right font-semibold" style={{ color: colorFor(m.ceq_promedio) }}>
                        {fmtN(m.ceq_promedio, 1)}
                      </TableCell>
                      <TableCell className="text-right">{fmtN(m.ceq_total, 1)}</TableCell>
                      <TableCell className="text-right">{fmtN(m.pct_meta, 1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TODOS LOS VIAJES */}
        <TabsContent value="viajes">
          <Card>
            <CardHeader><CardTitle className="text-base">Todos los viajes del rango ({viajes.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Patente</TableHead>
                      <TableHead className="text-right">CEq</TableHead>
                      <TableHead className="text-right">Bultos</TableHead>
                      <TableHead className="text-right">HL</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead className="text-right">% target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viajes.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin viajes</TableCell></TableRow>
                    ) : viajes.map(v => (
                      <TableRow key={`${v.fecha}-${v.patente}`}>
                        <TableCell className="font-mono text-sm">{v.fecha}</TableCell>
                        <TableCell className="font-mono font-medium">{v.patente}</TableCell>
                        <TableCell className="text-right font-semibold" style={{ color: colorFor(v.ceq_total) }}>
                          {fmtN(v.ceq_total, 1)}
                        </TableCell>
                        <TableCell className="text-right">{fmtN(v.bultos_total, 1)}</TableCell>
                        <TableCell className="text-right">{fmtN(v.hl_total, 1)}</TableCell>
                        <TableCell className="text-right">{v.lineas}</TableCell>
                        <TableCell className="text-right">{v.skus_distintos}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" style={{ color: colorFor(v.ceq_total), borderColor: colorFor(v.ceq_total) }}>
                            {fmtN(v.ob_pct_target, 1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
