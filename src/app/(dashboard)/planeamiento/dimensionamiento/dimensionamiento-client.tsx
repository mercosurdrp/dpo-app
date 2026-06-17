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
  type DimData, type FlotaUnidad, type DimConfig, type DimPlan, type RolFte, type RolReparto, type AlmacenData,
  guardarCapacidadFlota, guardarConfigDim, guardarObjetivoKpi,
  crearPlanDim, actualizarEstadoPlanDim, eliminarPlanDim, recalcularFactorCeq,
  recalcularProductividadAlmacen,
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
        <h1 className="text-xl font-semibold text-slate-900">Dimensionamiento de Dotación (DPO 3.1)</h1>
        <p className="text-sm text-muted-foreground">
          Recursos necesarios vs disponibles — <b>flota/entrega</b> (camiones + FTE de reparto) y <b>almacén</b> (FTE), KPIs de distribución y planes — pilar Planeamiento.
          {m ? ` · Mes ${m.mes} · ${m.diasCerrados} días de ruteo cerrados` : ""}
        </p>
      </div>

      <Tabs defaultValue="flotaentrega">
        <TabsList>
          <TabsTrigger value="flotaentrega">Flota / Entrega</TabsTrigger>
          <TabsTrigger value="almacen">Almacén (FTE)</TabsTrigger>
          <TabsTrigger value="proyeccion">Proyección</TabsTrigger>
          <TabsTrigger value="kpis">KPIs de distribución</TabsTrigger>
          <TabsTrigger value="planes">Planes & Reunión</TabsTrigger>
        </TabsList>

        {/* ─── Flota / Entrega: camiones + FTE de reparto ─── */}
        <TabsContent value="flotaentrega" className="space-y-4">
        <Tabs defaultValue="camiones">
          <TabsList>
            <TabsTrigger value="camiones">Camiones</TabsTrigger>
            <TabsTrigger value="reparto">FTE de reparto</TabsTrigger>
          </TabsList>

          {/* ── Camiones: demanda vs capacidad + flota ── */}
          <TabsContent value="camiones" className="space-y-4">
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

          {/* ── FTE de reparto: choferes + ayudantes ── */}
          <TabsContent value="reparto" className="space-y-4">
            <RepartoTab data={data} canEdit={canEdit} run={run} isPending={isPending} />
          </TabsContent>
        </Tabs>
        </TabsContent>

        {/* ─── Almacén (FTE) ─── */}
        <TabsContent value="almacen" className="space-y-4">
          <AlmacenTab data={data} canEdit={canEdit} run={run} isPending={isPending} />
        </TabsContent>

        {/* ─── Proyección de dotación vs volumen ─── */}
        <TabsContent value="proyeccion" className="space-y-4">
          <ProyeccionTab data={data} />
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

function RolFteBlock({ titulo, rol, unidadVol, unidadProd, detalle }: {
  titulo: string; rol: RolFte; unidadVol: string; unidadProd: string; detalle?: string
}) {
  const dot = rol.dotacion
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Volumen promedio / día" value={`${fmt(rol.volumenProm)} ${unidadVol}`}
            hint={`pico ${fmt(rol.volumenPico)} · ${rol.diasConDatos} días`} />
          <KpiCard title="Productividad" value={`${fmt(rol.productividad)} ${unidadProd}`}
            hint={`cap. efectiva ${fmt(rol.capDiariaFte)} ${unidadVol}/día·pers (util. ${Math.round(rol.utilizacion * 100)}%)`} />
          <KpiCard title="FTE necesarios" value={`${rol.fteNecesariosProm} (pico ${rol.fteNecesariosPico})`}
            hint={`vs ${fmt(dot)} dotación`} accent />
          <KpiCard title="Dotación actual" value={fmt(dot)} accent />
        </div>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
        <div className="text-sm">
          {dot <= 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">Cargá la dotación para compararla contra los FTE necesarios.</p>
          ) : rol.fteNecesariosPico > dot ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">En el pico se necesitan <b>{rol.fteNecesariosPico}</b> y hay <b>{dot}</b> → faltan <b>{rol.fteNecesariosPico - dot}</b> (refuerzo u horas extra).</p>
          ) : rol.fteNecesariosProm < dot ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">En promedio se necesitan <b>{rol.fteNecesariosProm}</b> y hay <b>{dot}</b>: dotación holgada en días normales.</p>
          ) : (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">La dotación cubre la demanda (necesarios {rol.fteNecesariosProm}, dotación {dot}).</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── FTE de reparto (flota/entrega) ─────────────────────────────────────────

const REPARTO_FIELDS = [
  ["choferes_por_camion", "Choferes por camión", "0.1"],
  ["ayudantes_por_camion", "Ayudantes por camión", "0.1"],
] as const

function RepartoRolBlock({ titulo, rol, camionesProm, camionesPico }: {
  titulo: string; rol: RolReparto; camionesProm: number; camionesPico: number
}) {
  const dotProm = rol.dotacionProm
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Camiones necesarios" value={`${fmt(camionesProm)} (pico ${fmt(camionesPico)})`} />
          <KpiCard title="Tripulación / camión" value={fmt(rol.porCamion)} />
          <KpiCard title="FTE necesarios" value={`${rol.fteNecesariosProm} (pico ${rol.fteNecesariosPico})`}
            hint={`camiones × ${fmt(rol.porCamion)}/camión`} accent />
          <KpiCard title="Dotación actual (prom)" value={fmt(dotProm)} hint={`pico ${fmt(rol.dotacionPico)} · real dpo-app`} accent />
        </div>
        <div className="text-sm">
          {dotProm <= 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">Sin egresos de vehículos registrados este mes para estimar la dotación real.</p>
          ) : rol.fteNecesariosPico > rol.dotacionPico ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">En el pico se necesitan <b>{rol.fteNecesariosPico}</b> y salieron <b>{fmt(rol.dotacionPico)}</b> → faltan <b>{rol.fteNecesariosPico - rol.dotacionPico}</b>.</p>
          ) : rol.fteNecesariosProm < dotProm ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">La dotación real ({fmt(dotProm)} prom/día) cubre los <b>{rol.fteNecesariosProm}</b> necesarios.</p>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">Necesarios <b>{rol.fteNecesariosProm}</b> vs dotación real <b>{fmt(dotProm)}</b> prom/día: ajustado.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RepartoTab({ data, canEdit, run, isPending }: { data: DimData; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const r = data.reparto
  const [c, setC] = useState({
    choferes_por_camion: String(data.config.choferes_por_camion),
    ayudantes_por_camion: String(data.config.ayudantes_por_camion),
  })
  return (
    <div className="space-y-4">
      {data.repartoError && <p className="text-sm text-red-600">Error: {data.repartoError}</p>}
      {!r && !data.repartoError && <p className="text-sm text-muted-foreground">Sin datos de reparto este mes (faltan camiones necesarios o egresos de vehículos registrados).</p>}
      {r && <RepartoRolBlock titulo="Choferes" rol={r.choferes} camionesProm={r.camionesNecesariosProm} camionesPico={r.camionesNecesariosPico} />}
      {r && <RepartoRolBlock titulo="Ayudantes" rol={r.ayudantes} camionesProm={r.camionesNecesariosProm} camionesPico={r.camionesNecesariosPico} />}
      {canEdit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Parámetros de reparto</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            {REPARTO_FIELDS.map(([k, label, step]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input type="number" step={step} className="h-8 w-36" value={c[k]} onChange={(e) => setC((s) => ({ ...s, [k]: e.target.value }))} />
              </div>
            ))}
            <Button size="sm" disabled={isPending}
              onClick={() => run(() => guardarConfigDim({
                ...data.config,
                choferes_por_camion: Number(c.choferes_por_camion),
                ayudantes_por_camion: Number(c.ayudantes_por_camion),
              }), "Parámetros de reparto guardados")}>
              Guardar
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              FTE necesarios = camiones necesarios (pestaña Camiones) × tripulación por camión. Los camiones necesarios ya consideran los viajes/día, por eso no se vuelve a multiplicar. Dotación actual = promedio diario real de choferes/ayudantes que registraron egreso de vehículo en dpo-app este mes (pico = día de mayor salida).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const ALM_FIELDS = [
  ["prod_bul_hh", "Pickeros: prod (bul/HH)", "1"],
  ["util_pickeros", "Pickeros: util. turno (0–1)", "0.05"],
  ["dotacion_almacen", "Pickeros: dotación", "1"],
  ["prod_clasif_pal_h", "Clasif.: prod (pal/HH)", "0.1"],
  ["util_clasif", "Clasif.: util. turno (0–1)", "0.05"],
  ["dotacion_clasif", "Clasif.: dotación", "1"],
  ["prod_reempaque_bul_hh", "Reempaque: prod (bul/HH)", "1"],
  ["util_reempaque", "Reempaque: util. turno (0–1)", "0.05"],
  ["dotacion_reempaque", "Reempaque: dotación", "1"],
  ["prod_pal_h", "Maquinistas: prod (pal/HH)", "0.1"],
  ["util_maquinistas", "Maquinistas: util. turno (0–1)", "0.05"],
  ["dotacion_maquinistas", "Maquinistas: dotación", "1"],
  ["horas_turno", "Horas / turno", "0.1"],
  ["factor_retorno_distrib", "Retorno distrib. (0–1)", "0.05"],
] as const

function ResumenAlmacen({ a }: { a: AlmacenData }) {
  const roles: Array<{ n: string; r: RolFte; u: string }> = [
    { n: "Pickeros", r: a.pickeros, u: "bultos" },
    { n: "Clasificadores", r: a.clasificadores, u: "paletas (pico)" },
    { n: "Tareas generales (reempaque)", r: a.reempaque, u: "bultos" },
    { n: "Maquinistas", r: a.maquinistas, u: "pallets" },
  ]
  const totNec = roles.reduce((s, x) => s + x.r.fteNecesariosProm, 0)
  const totDot = roles.reduce((s, x) => s + x.r.dotacion, 0)
  const brechaCls = (b: number) => (b < 0 ? "text-red-600" : b > 0 ? "text-amber-600" : "text-emerald-600")
  const brechaTxt = (b: number) => (b === 0 ? "OK" : b > 0 ? `+${b}` : String(b))
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Dotación necesaria del almacén</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rol</TableHead>
              <TableHead className="text-right">Volumen/día</TableHead>
              <TableHead className="text-right">FTE necesarios</TableHead>
              <TableHead className="text-right">Dotación actual</TableHead>
              <TableHead className="text-right">Brecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((x) => {
              const b = x.r.dotacion - x.r.fteNecesariosProm
              return (
                <TableRow key={x.n}>
                  <TableCell className="font-medium">{x.n}</TableCell>
                  <TableCell className="text-right">{fmt(x.r.volumenProm)} {x.u}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {x.r.fteNecesariosProm}{x.r.fteNecesariosPico > x.r.fteNecesariosProm ? ` (pico ${x.r.fteNecesariosPico})` : ""}
                  </TableCell>
                  <TableCell className="text-right">{fmt(x.r.dotacion)}</TableCell>
                  <TableCell className={`text-right font-semibold ${brechaCls(b)}`}>{brechaTxt(b)}</TableCell>
                </TableRow>
              )
            })}
            <TableRow className="border-t-2">
              <TableCell className="font-bold">Total almacén</TableCell>
              <TableCell />
              <TableCell className="text-right font-bold">{totNec}</TableCell>
              <TableCell className="text-right font-bold">{totDot}</TableCell>
              <TableCell className={`text-right font-bold ${brechaCls(totDot - totNec)}`}>{brechaTxt(totDot - totNec)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">
          FTE necesarios = volumen/día ÷ (prod × horas × utilización). Clasificadores se dimensiona sobre el día PICO de paletas. Brecha = dotación − necesarios (− faltan, + holgura).
        </p>
      </CardContent>
    </Card>
  )
}

function AlmacenTab({ data, canEdit, run, isPending }: { data: DimData; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const a = data.almacen
  const [c, setC] = useState({
    prod_bul_hh: String(data.config.prod_bul_hh),
    util_pickeros: String(data.config.util_pickeros),
    dotacion_almacen: String(data.config.dotacion_almacen),
    prod_clasif_pal_h: String(data.config.prod_clasif_pal_h),
    util_clasif: String(data.config.util_clasif),
    dotacion_clasif: String(data.config.dotacion_clasif),
    prod_reempaque_bul_hh: String(data.config.prod_reempaque_bul_hh),
    util_reempaque: String(data.config.util_reempaque),
    dotacion_reempaque: String(data.config.dotacion_reempaque),
    prod_pal_h: String(data.config.prod_pal_h),
    util_maquinistas: String(data.config.util_maquinistas),
    dotacion_maquinistas: String(data.config.dotacion_maquinistas),
    horas_turno: String(data.config.horas_turno),
    factor_retorno_distrib: String(data.config.factor_retorno_distrib),
  })
  const [recalc, startRecalc] = useTransition()
  const onRecalcProd = () =>
    startRecalc(async () => {
      const res = await recalcularProductividadAlmacen()
      if ("error" in res) { toast.error(res.error); return }
      const p = res.data
      setC((s) => ({
        ...s,
        prod_bul_hh: p.picking ? String(p.picking.prod) : s.prod_bul_hh,
        prod_pal_h: p.maquinistas ? String(p.maquinistas.prod) : s.prod_pal_h,
        prod_clasif_pal_h: p.clasif ? String(p.clasif.prod) : s.prod_clasif_pal_h,
        prod_reempaque_bul_hh: p.reempaque ? String(p.reempaque.prod) : s.prod_reempaque_bul_hh,
      }))
      toast.success(`Picking ${p.picking?.prod ?? "s/d"} bul/HH · Maquinistas ${p.maquinistas?.prod ?? "s/d"} pal/HH · Clasif. ${p.clasif?.prod ?? "s/d"} pal/HH · Reempaque ${p.reempaque?.prod ?? "s/d"} bul/HH (mes)`)
    })

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={recalc} onClick={onRecalcProd}>
            {recalc ? "Calculando…" : "↻ Recalcular productividad (deposito-esteban)"}
          </Button>
        </div>
      )}
      {data.almacenError && <p className="text-sm text-red-600">Error: {data.almacenError}</p>}
      {!a && !data.almacenError && <p className="text-sm text-muted-foreground">Sin datos de volumen procesado este mes.</p>}

      {a && <ResumenAlmacen a={a} />}
      {a && <RolFteBlock titulo="Pickeros (picking)" rol={a.pickeros} unidadVol="bultos" unidadProd="bul/HH" />}
      {a && <RolFteBlock titulo="Clasificadores (envases)" rol={a.clasificadores} unidadVol="paletas" unidadProd="pal/HH"
        detalle="Se dimensiona sobre el día PICO de paletas clasificadas (tabla clasificacion_envases)." />}
      {a && <RolFteBlock titulo="Tareas generales (reempaque)" rol={a.reempaque} unidadVol="bultos" unidadProd="bul/HH"
        detalle="Bultos reempacados/día y productividad desde deposito-esteban (sidebar Reempaque)." />}
      {a && <RolFteBlock titulo="Maquinistas (autoelevadores)" rol={a.maquinistas} unidadVol="pallets" unidadProd="pal/HH"
        detalle={`Pallets/día: acarreo ${fmt(a.maquinistas.palAcarreoProm)} + carga distribución ${fmt(a.maquinistas.palCargaProm)}${a.maquinistas.factorRetorno > 0 ? ` (+${Math.round(a.maquinistas.factorRetorno * 100)}% retorno)` : ""}`} />}

      {canEdit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Parámetros de almacén</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            {ALM_FIELDS.map(([k, label, step]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input type="number" step={step} className="h-8 w-36" value={c[k]} onChange={(e) => setC((s) => ({ ...s, [k]: e.target.value }))} />
              </div>
            ))}
            <Button size="sm" disabled={isPending}
              onClick={() => run(() => guardarConfigDim({
                ...data.config,
                prod_bul_hh: Number(c.prod_bul_hh),
                util_pickeros: Number(c.util_pickeros),
                dotacion_almacen: Number(c.dotacion_almacen),
                prod_clasif_pal_h: Number(c.prod_clasif_pal_h),
                util_clasif: Number(c.util_clasif),
                dotacion_clasif: Number(c.dotacion_clasif),
                prod_reempaque_bul_hh: Number(c.prod_reempaque_bul_hh),
                util_reempaque: Number(c.util_reempaque),
                dotacion_reempaque: Number(c.dotacion_reempaque),
                prod_pal_h: Number(c.prod_pal_h),
                util_maquinistas: Number(c.util_maquinistas),
                dotacion_maquinistas: Number(c.dotacion_maquinistas),
                horas_turno: Number(c.horas_turno),
                factor_retorno_distrib: Number(c.factor_retorno_distrib),
              }), "Parámetros de almacén guardados")}>
              Guardar
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              FTE = volumen/día ÷ (productividad × horas/turno × utilización). La utilización es la fracción del turno que la persona dedica realmente a la tarea (el resto: reposición, traslados, despacho, esperas); el bul/HH y pal/HH del WMS son de horas de actividad pura, no sostenibles todo el turno. Pickeros: bultos (ocupación de bodega) ÷ bul/HH. Clasificadores: paletas de envases (clasificacion_envases), sobre el pico. Reempaque: bultos reempacados (deposito-esteban) ÷ bul/HH. Maquinistas: pallets (acarreo descargado + carga de distribución) ÷ pal/HH. La prod de clasificación y reempaque ya es real por hora trabajada → utilización por defecto 1. «↻ Recalcular productividad» trae el promedio real del mes de deposito-esteban (picking/maquinistas/reempaque) y de la tabla de clasificación. Retorno distrib. = fracción de los pallets cargados que se descargan al volver (0 = no contar).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Proyección de dotación vs volumen futuro ───────────────────────────────

const MES_ABBR = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const mesLabel = (s: string) => MES_ABBR[Number(s.split("-")[1])] ?? s

function ProyeccionTab({ data }: { data: DimData }) {
  const p = data.proyeccion
  if (data.proyeccionError) return <p className="text-sm text-red-600">Error: {data.proyeccionError}</p>
  if (!p) return <p className="text-sm text-muted-foreground">Sin volumen proyectado para el año en curso (tabla dim_volumen_proyectado) o sin métricas de distribución.</p>

  const alertas: string[] = []
  p.meses.forEach((mm, i) => {
    const faltan = p.recursos.filter((r) => r.necesarios[i] > r.dotacion)
    if (faltan.length) alertas.push(`${mesLabel(mm.mes)}: ${faltan.map((r) => `${r.rol} (necesita ${r.necesarios[i]} vs ${r.dotacion})`).join(" · ")}`)
  })
  const cellCls = (nec: number, dot: number) =>
    nec > dot ? "bg-red-50 text-red-700 font-semibold" : nec === dot ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Dotación necesaria proyectada — {mesLabel(p.mesBase)} a Dic (volumen del presupuesto)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                <TableHead className="text-right">Dotación actual</TableHead>
                {p.meses.map((mm) => (
                  <TableHead key={mm.mes} className="text-right">
                    {mesLabel(mm.mes)}
                    <span className="block text-[10px] font-normal text-muted-foreground">×{mm.indice.toFixed(2).replace(".", ",")}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.recursos.map((r) => (
                <TableRow key={r.rol}>
                  <TableCell className="font-medium">{r.rol}</TableCell>
                  <TableCell className="text-right">{fmt(r.dotacion)}</TableCell>
                  {r.necesarios.map((nec, i) => (
                    <TableCell key={i} className={`text-right ${cellCls(nec, r.dotacion)}`}>{nec}</TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-bold">Volumen (HL)</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">base {fmt(Math.round(p.hlBase))}</TableCell>
                {p.meses.map((mm) => (
                  <TableCell key={mm.mes} className="text-right text-xs text-muted-foreground">{fmt(Math.round(mm.hl))}</TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Necesarios = el recurso del mes actual escalado por el índice de volumen (HL del presupuesto ÷ HL del mes base). Dotación fija (la actual). <span className="font-medium text-red-700">Rojo</span> = falta gente ese mes (horas extra / refuerzo), <span className="font-medium text-amber-700">ámbar</span> = al límite, <span className="font-medium text-emerald-700">verde</span> = cubre.
          </p>
        </CardContent>
      </Card>
      {alertas.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Meses con déficit de dotación (refuerzo u horas extra)</CardTitle></CardHeader>
          <CardContent>
            <ul className="ml-4 list-disc space-y-1 text-sm text-red-700">
              {alertas.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
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
