"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  type DimData, type FlotaUnidad, type DimConfig, type DimPlan,
  guardarCapacidadFlota, guardarConfigDim, guardarObjetivoKpi,
  crearPlanDim, actualizarEstadoPlanDim, eliminarPlanDim, recalcularFactorCeq,
} from "@/actions/dimensionamiento"

function fmt(v: number) {
  return v.toLocaleString("es-AR")
}

// ─── TOR (reuniones_tor tipo=dimensionamiento) ───────────────────────────────

interface TorData {
  tor: { objetivos: string; dueno: string; ubicacion: string; dia_horario: string; frecuencia: string } | null
  items: Array<{ seccion: string; orden: number; texto: string; responsable: string | null }>
}
const SECCION_LABEL: Record<string, string> = {
  participante: "Participantes", regla: "Reglas", entrada: "Entradas",
  salida: "Salidas", kpi: "KPIs", temario: "Temario",
}

function TorCard() {
  const [tor, setTor] = useState<TorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/planeamiento/periodos-criticos/tor?tipo=dimensionamiento")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setTor)
      .catch((e) => setError(e.message))
  }, [])
  if (error) return <p className="text-sm text-muted-foreground">No se pudo cargar el TOR ({error}).</p>
  if (!tor) return <p className="text-sm text-muted-foreground">Cargando TOR…</p>
  const secciones = ["participante", "regla", "entrada", "salida", "kpi", "temario"]
  return (
    <div className="space-y-4">
      {tor.tor && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><b>Objetivo:</b> {tor.tor.objetivos}</div>
          <div><b>Dueño:</b> {tor.tor.dueno}</div>
          <div><b>Frecuencia:</b> {tor.tor.frecuencia}</div>
          <div><b>Día/horario:</b> {tor.tor.dia_horario}</div>
        </div>
      )}
      {secciones.map((s) => {
        const items = tor.items.filter((i) => i.seccion === s)
        if (!items.length) return null
        return (
          <div key={s}>
            <p className="font-medium text-slate-900">{SECCION_LABEL[s] ?? s}</p>
            <ul className="ml-4 list-disc text-sm text-muted-foreground">
              {items.map((i, idx) => (
                <li key={idx}>{i.texto}{i.responsable ? ` — ${i.responsable}` : ""}</li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export function DimensionamientoClient({ data, canEdit }: { data: DimData; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition()
  const m = data.metricas

  const run = (fn: () => Promise<{ error?: string } | unknown>, ok: string) =>
    startTransition(async () => {
      const res = (await fn()) as { error?: string }
      if (res?.error) toast.error(res.error)
      else toast.success(ok)
    })

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dimensionamiento de Distribución/Flota (DPO 3.1)</h1>
        <p className="text-sm text-muted-foreground">
          Demanda de volumen vs capacidad instalada de la flota, en <b>cajas equivalentes (CEq)</b>, KPIs de distribución y planes — pilar Planeamiento.
          {m ? ` · Mes ${m.mes} · ${m.diasCerrados} días de ruteo cerrados` : ""}
        </p>
      </div>

      <Tabs defaultValue="demanda">
        <TabsList>
          <TabsTrigger value="demanda">Demanda vs Capacidad</TabsTrigger>
          <TabsTrigger value="flota">Flota & Capacidad</TabsTrigger>
          <TabsTrigger value="almacen">Almacén (FTE)</TabsTrigger>
          <TabsTrigger value="kpis">KPIs de distribución</TabsTrigger>
          <TabsTrigger value="planes">Planes & Reunión</TabsTrigger>
        </TabsList>

        {/* ─── Demanda vs Capacidad ─── */}
        <TabsContent value="demanda" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Capacidad instalada / día" value={`${fmt(Math.round(data.capacidadInstaladaDiaria))} CEq`}
              hint={`${data.unidadesDisponibles} unidades disponibles × ${data.config.viajes_por_dia} viaje(s)`} />
            <KpiCard title="Volumen promedio / día" value={m ? `${fmt(m.volumenCeqPromedio)} CEq` : "—"}
              hint={m ? `pico ${fmt(m.volumenCeqPico)} CEq` : "sin ruteos cerrados"} />
            <KpiCard title="Ocupación de flota" value={m ? `${m.ocupacionPromedio.toString().replace(".", ",")}%` : "—"}
              hint="volumen ÷ capacidad instalada" accent />
            <KpiCard title="Camiones necesarios" value={m ? `${m.camionesNecesariosPromedio} (pico ${m.camionesNecesariosPico})` : "—"}
              hint={`vs ${data.unidadesDisponibles} disponibles`} accent />
          </div>

          {m && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Lectura del dimensionamiento</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data.capacidadInstaladaDiaria <= 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    Cargá la capacidad (CEq) de las unidades en la pestaña <b>Flota & Capacidad</b> para calcular ocupación y camiones necesarios.
                  </p>
                ) : m.camionesNecesariosPico > data.unidadesDisponibles ? (
                  <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                    En el pico se necesitan <b>{m.camionesNecesariosPico}</b> camiones y hay <b>{data.unidadesDisponibles}</b> disponibles
                    → faltan <b>{m.camionesNecesariosPico - data.unidadesDisponibles}</b> (evaluar refuerzo o segunda vuelta).
                  </p>
                ) : m.ocupacionPromedio < 70 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    Ocupación promedio <b>{m.ocupacionPromedio.toString().replace(".", ",")}%</b>: hay capacidad ociosa, evaluar reasignación de flota.
                  </p>
                ) : (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                    La flota disponible cubre la demanda (ocupación {m.ocupacionPromedio.toString().replace(".", ",")}%).
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {data.metricasError && (
            <p className="text-sm text-red-600">Error leyendo ruteo: {data.metricasError}</p>
          )}

          {canEdit && <ConfigCard config={data.config} run={run} isPending={isPending} />}
        </TabsContent>

        {/* ─── Flota & Capacidad ─── */}
        <TabsContent value="flota" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Unidades de distribución ({data.flota.length})</CardTitle></CardHeader>
            <CardContent>
              {data.flota.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay unidades con sector «distribución» en el maestro de flota.</p>
              ) : (
                <FlotaTable flota={data.flota} canEdit={canEdit} run={run} isPending={isPending} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Almacén (FTE) ─── */}
        <TabsContent value="almacen" className="space-y-4">
          <AlmacenTab data={data} canEdit={canEdit} run={run} isPending={isPending} />
        </TabsContent>

        {/* ─── KPIs ─── */}
        <TabsContent value="kpis" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">KPIs de distribución (mes en curso)</CardTitle></CardHeader>
            <CardContent>
              <KpiObjetivosTable data={data} canEdit={canEdit} run={run} isPending={isPending} />
              <p className="mt-3 text-xs text-muted-foreground">
                Real calculado sobre los ruteos cerrados del mes, convertidos a CEq con el factor de Parámetros. «Entregas por viaje» se incorpora en una etapa próxima (requiere registrar viajes por unidad).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Planes & Reunión ─── */}
        <TabsContent value="planes" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Planes de acción (5W2H)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canEdit && <NuevoPlanForm run={run} isPending={isPending} />}
              <PlanesTable planes={data.planes} canEdit={canEdit} run={run} isPending={isPending} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">TOR — Reunión mensual de dimensionamiento</CardTitle></CardHeader>
            <CardContent><TorCard /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

type RunFn = (fn: () => Promise<{ error?: string } | unknown>, ok: string) => void

function AlmacenTab({ data, canEdit, run, isPending }: { data: DimData; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const a = data.almacen
  const [c, setC] = useState({
    prod_bul_hh: String(data.config.prod_bul_hh),
    horas_turno: String(data.config.horas_turno),
    dotacion_almacen: String(data.config.dotacion_almacen),
  })
  const dot = data.config.dotacion_almacen
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Volumen promedio / día" value={a ? `${fmt(a.bultosPromedio)} bultos` : "—"}
          hint={a ? `pico ${fmt(a.bultosPico)} · ${a.diasConDatos} días` : "sin datos de bodega"} />
        <KpiCard title="Productividad" value={`${fmt(data.config.prod_bul_hh)} bul/HH`} hint={`× ${data.config.horas_turno} h/turno`} />
        <KpiCard title="FTE necesarios" value={a ? `${a.fteNecesariosPromedio} (pico ${a.fteNecesariosPico})` : "—"}
          hint={`vs ${fmt(dot)} dotación`} accent />
        <KpiCard title="Dotación actual" value={fmt(dot)} hint="operarios de depósito" accent />
      </div>

      {a && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Lectura del dimensionamiento de almacén</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {dot <= 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                Cargá la <b>dotación actual</b> de operarios para compararla contra los FTE necesarios.
              </p>
            ) : a.fteNecesariosPico > dot ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                En el pico se necesitan <b>{a.fteNecesariosPico}</b> operarios y hay <b>{dot}</b> → faltan <b>{a.fteNecesariosPico - dot}</b> (evaluar refuerzo u horas extra).
              </p>
            ) : a.fteNecesariosPromedio < dot ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                En promedio se necesitan <b>{a.fteNecesariosPromedio}</b> y hay <b>{dot}</b>: dotación holgada en días normales.
              </p>
            ) : (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                La dotación cubre la demanda (necesarios {a.fteNecesariosPromedio}, dotación {dot}).
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {data.almacenError && <p className="text-sm text-red-600">Error leyendo ocupación de bodega: {data.almacenError}</p>}
      {!a && !data.almacenError && <p className="text-sm text-muted-foreground">Sin datos de volumen procesado (ocupación de bodega) este mes.</p>}

      {canEdit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Parámetros de almacén</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">Productividad (bul/HH)</Label>
              <Input type="number" className="h-8 w-28" value={c.prod_bul_hh} onChange={(e) => setC((s) => ({ ...s, prod_bul_hh: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Horas / turno</Label>
              <Input type="number" step="0.1" className="h-8 w-24" value={c.horas_turno} onChange={(e) => setC((s) => ({ ...s, horas_turno: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Dotación actual (operarios)</Label>
              <Input type="number" className="h-8 w-28" value={c.dotacion_almacen} onChange={(e) => setC((s) => ({ ...s, dotacion_almacen: e.target.value }))} />
            </div>
            <Button size="sm" disabled={isPending}
              onClick={() => run(() => guardarConfigDim({
                ...data.config,
                prod_bul_hh: Number(c.prod_bul_hh),
                horas_turno: Number(c.horas_turno),
                dotacion_almacen: Number(c.dotacion_almacen),
              }), "Parámetros de almacén guardados")}>
              Guardar
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              FTE necesarios = bultos procesados/día ÷ (productividad × horas/turno). El volumen sale de la ocupación de bodega (sync Chess). Productividad default 300 bul/HH (target del ranking de depósito).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiCard({ title, value, hint, accent }: { title: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${accent ? "text-sky-600" : "text-slate-900"}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function ConfigCard({ config, run, isPending }: { config: DimConfig; run: RunFn; isPending: boolean }) {
  const [c, setC] = useState<DimConfig>(config)
  const [recalc, startRecalc] = useTransition()
  const onRecalcular = () =>
    startRecalc(async () => {
      const res = await recalcularFactorCeq()
      if ("error" in res) { toast.error(res.error); return }
      setC((s) => ({ ...s, factor_ceq_bulto: res.data.factor }))
      toast.success(`Factor ${res.data.factor} · ${res.data.periodo.desde}→${res.data.periodo.hasta} · ${res.data.skusConPallet} SKUs (sin envases)`)
    })
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Parámetros de cálculo</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs">Factor CEq por bulto</Label>
          <div className="flex items-center gap-1">
            <Input type="number" step="0.001" className="h-8 w-28" value={c.factor_ceq_bulto}
              onChange={(e) => setC((s) => ({ ...s, factor_ceq_bulto: Number(e.target.value) }))} />
            <Button size="sm" variant="outline" disabled={recalc} onClick={onRecalcular} title="Recalcular desde Chess (mes anterior, sin envases)">
              {recalc ? "Calculando…" : "↻ Recalcular"}
            </Button>
          </div>
        </div>
        <div>
          <Label className="text-xs">Viajes por día (por unidad)</Label>
          <Input type="number" step="0.1" className="h-8 w-28" value={c.viajes_por_dia}
            onChange={(e) => setC((s) => ({ ...s, viajes_por_dia: Number(e.target.value) }))} />
        </div>
        <div>
          <Label className="text-xs">Días operativos / mes</Label>
          <Input type="number" className="h-8 w-28" value={c.dias_operativos_mes}
            onChange={(e) => setC((s) => ({ ...s, dias_operativos_mes: Number(e.target.value) }))} />
        </div>
        <Button size="sm" disabled={isPending} onClick={() => run(() => guardarConfigDim(c), "Parámetros guardados")}>
          Guardar
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          El factor convierte los bultos ruteados a cajas equivalentes (CEq = bultos × factor). «↻ Recalcular» lo recomputa con el mix del mes anterior cerrado en Chess, excluyendo envases (CEq = 120 × bultos / bultosPallet).
        </p>
      </CardContent>
    </Card>
  )
}

function FlotaTable({ flota, canEdit, run, isPending }: { flota: FlotaUnidad[]; canEdit: boolean; run: RunFn; isPending: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dominio</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Capacidad (CEq)</TableHead>
          <TableHead className="text-right">Capacidad (kg)</TableHead>
          <TableHead>Estado</TableHead>
          {canEdit && <TableHead></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {flota.map((u) => <FlotaRow key={u.dominio} u={u} canEdit={canEdit} run={run} isPending={isPending} />)}
      </TableBody>
    </Table>
  )
}

function FlotaRow({ u, canEdit, run, isPending }: { u: FlotaUnidad; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const [ceq, setCeq] = useState(String(u.capacidad_ceq))
  const [kg, setKg] = useState(u.capacidad_kg != null ? String(u.capacidad_kg) : "")
  const [activo, setActivo] = useState(u.activo)
  return (
    <TableRow>
      <TableCell className="font-medium">{u.dominio}{u.descripcion ? <span className="ml-1 text-xs text-muted-foreground">{u.descripcion}</span> : null}</TableCell>
      <TableCell className="text-sm capitalize">{u.tipo ?? "—"}</TableCell>
      <TableCell className="text-right">
        {canEdit ? <Input type="number" className="h-8 w-24 text-right" value={ceq} onChange={(e) => setCeq(e.target.value)} /> : fmt(u.capacidad_ceq)}
      </TableCell>
      <TableCell className="text-right">
        {canEdit ? <Input type="number" className="h-8 w-24 text-right" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="—" /> : (u.capacidad_kg ?? "—")}
      </TableCell>
      <TableCell>
        {u.enTaller ? <Badge variant="destructive">En taller</Badge> : activo ? <Badge className="bg-emerald-500 hover:bg-emerald-500">Disponible</Badge> : <Badge variant="secondary">Inactiva</Badge>}
      </TableCell>
      {canEdit && (
        <TableCell className="space-x-2 whitespace-nowrap text-right">
          <Button size="sm" variant="ghost" onClick={() => setActivo((v) => !v)}>{activo ? "Desactivar" : "Activar"}</Button>
          <Button size="sm" disabled={isPending}
            onClick={() => run(() => guardarCapacidadFlota(u.dominio, Number(ceq), kg.trim() === "" ? null : Number(kg), activo), "Capacidad guardada")}>
            Guardar
          </Button>
        </TableCell>
      )}
    </TableRow>
  )
}

function KpiObjetivosTable({ data, canEdit, run, isPending }: { data: DimData; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const m = data.metricas
  const real: Record<string, number | null> = {
    dropsize: m?.dropsizeCeqPromedio ?? null,
    pct_no_ruteado: m?.pctNoRuteadoPromedio ?? null,
    ocupacion_pct: m?.ocupacionPromedio ?? null,
    entregas_por_viaje: null,
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>KPI</TableHead>
          <TableHead className="text-right">Real (mes)</TableHead>
          <TableHead className="text-right">Objetivo</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.objetivos.map((o) => {
          const r = real[o.kpi]
          const cumple = r == null ? null : o.mejor_si === "mayor" ? r >= o.objetivo : r <= o.objetivo
          return <KpiObjRow key={o.kpi} o={o} real={r} cumple={cumple} canEdit={canEdit} run={run} isPending={isPending} />
        })}
      </TableBody>
    </Table>
  )
}

function KpiObjRow({ o, real, cumple, canEdit, run, isPending }: {
  o: DimData["objetivos"][number]; real: number | null; cumple: boolean | null
  canEdit: boolean; run: RunFn; isPending: boolean
}) {
  const [obj, setObj] = useState(String(o.objetivo))
  const fmtVal = (v: number) => `${v.toString().replace(".", ",")} ${o.unidad}`.trim()
  return (
    <TableRow>
      <TableCell className="font-medium">{o.nombre}</TableCell>
      <TableCell className="text-right">{real == null ? "s/d" : fmtVal(real)}</TableCell>
      <TableCell className="text-right">
        {canEdit ? (
          <span className="inline-flex items-center gap-1">
            <Input type="number" className="h-8 w-20 text-right" value={obj} onChange={(e) => setObj(e.target.value)} />
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => guardarObjetivoKpi(o.kpi, Number(obj)), "Objetivo guardado")}>✓</Button>
          </span>
        ) : fmtVal(o.objetivo)}
      </TableCell>
      <TableCell>
        {cumple == null ? <span className="text-muted-foreground">—</span>
          : cumple ? <Badge className="bg-emerald-500 hover:bg-emerald-500">OK</Badge>
          : <Badge variant="destructive">Fuera</Badge>}
      </TableCell>
    </TableRow>
  )
}

const ESTADO_LABEL: Record<DimPlan["estado"], string> = {
  pendiente: "Pendiente", en_curso: "En curso", completado: "Completado",
}

function NuevoPlanForm({ run, isPending }: { run: RunFn; isPending: boolean }) {
  const [f, setF] = useState({ que: "", por_que: "", quien: "", donde: "", cuando: "", como: "", cuanto: "" })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label className="text-xs">Qué *</Label><Textarea className="min-h-16" value={f.que} onChange={set("que")} /></div>
      <div><Label className="text-xs">Por qué</Label><Input value={f.por_que} onChange={set("por_que")} /></div>
      <div><Label className="text-xs">Quién</Label><Input value={f.quien} onChange={set("quien")} /></div>
      <div><Label className="text-xs">Dónde</Label><Input value={f.donde} onChange={set("donde")} /></div>
      <div><Label className="text-xs">Cuándo</Label><Input type="date" value={f.cuando} onChange={set("cuando")} /></div>
      <div><Label className="text-xs">Cómo</Label><Input value={f.como} onChange={set("como")} /></div>
      <div><Label className="text-xs">Cuánto</Label><Input value={f.cuanto} onChange={set("cuanto")} /></div>
      <div className="sm:col-span-2">
        <Button size="sm" disabled={isPending || !f.que.trim()}
          onClick={() => run(async () => {
            const res = await crearPlanDim({ ...f, cuando: f.cuando || null })
            if (!("error" in res)) setF({ que: "", por_que: "", quien: "", donde: "", cuando: "", como: "", cuanto: "" })
            return res
          }, "Plan creado")}>
          Agregar plan
        </Button>
      </div>
    </div>
  )
}

function PlanesTable({ planes, canEdit, run, isPending }: { planes: DimPlan[]; canEdit: boolean; run: RunFn; isPending: boolean }) {
  if (!planes.length) return <p className="text-sm text-muted-foreground">Sin planes cargados.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Qué</TableHead>
          <TableHead>Quién</TableHead>
          <TableHead>Cuándo</TableHead>
          <TableHead>Estado</TableHead>
          {canEdit && <TableHead></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {planes.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="max-w-[320px] text-sm">{p.que}</TableCell>
            <TableCell className="text-sm">{p.quien ?? "—"}</TableCell>
            <TableCell className="text-sm">{p.cuando ?? "—"}</TableCell>
            <TableCell>
              {canEdit ? (
                <Select value={p.estado} onValueChange={(v) => run(() => actualizarEstadoPlanDim(p.id, v as DimPlan["estado"]), "Estado actualizado")}>
                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["pendiente", "en_curso", "completado"] as const).map((e) => (
                      <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : <Badge variant="secondary">{ESTADO_LABEL[p.estado]}</Badge>}
            </TableCell>
            {canEdit && (
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => eliminarPlanDim(p.id), "Plan eliminado")}>Eliminar</Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
