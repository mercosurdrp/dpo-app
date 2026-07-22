"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  type DimData, type FlotaUnidad, type DimConfig, type DimPlan, type RolFte, type RolReparto, type MetricasDistribucion, type ProyeccionAlmacenRol, type ProyeccionMes, type ProyeccionFlotaRol, type ProyeccionData, type ZonaReparto,
  guardarCapacidadFlota, guardarConfigDim, guardarObjetivoKpi, guardarZonasReparto, guardarAjustesVolumen,
  crearPlanDim, actualizarEstadoPlanDim, eliminarPlanDim, recalcularFactorCeq,
  recalcularProductividadAlmacen, guardarCostoHh,
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

// ─── Recalculo en vivo del escenario ─────────────────────────────────────────

// weekday JS de cada día del mes "aaaa-mm" (0=dom..6=sáb); domingo no opera.
function weekdaysDelMes(mesStr: string): number[] {
  const [a, m] = mesStr.split("-").map(Number)
  const out: number[] = []
  const last = new Date(a, m, 0).getDate()
  for (let d = 1; d <= last; d++) out.push(new Date(a, m - 1, d).getDay())
  return out
}

// Recalcula la proyección EN EL CLIENTE con los % de escenario tipeados (sin guardar),
// replicando el modelo del server (getDatosDimensionamiento): índices, horas extra por
// día de semana (almacén) y días de refuerzo / 2ª vuelta (flota). Así el simulador
// responde al instante; «Guardar escenario» solo persiste para otros usuarios.
function recalcularProyeccion(proy: ProyeccionData, zonas: ZonaReparto[], pct: Record<string, string>): ProyeccionData {
  const pctDe = (mes: string, saved: number) => (pct[mes] !== undefined ? Number(pct[mes]) || 0 : saved)
  const hlBase = proy.hlBasePresupuesto * (1 + pctDe(proy.mesBase, proy.ajusteBasePct) / 100)
  if (hlBase <= 0) return proy
  const meses = proy.meses.map((m) => {
    const pc = pctDe(m.mes, m.ajustePct)
    const hl = m.hlPresupuesto * (1 + pc / 100)
    return { ...m, hl, ajustePct: pc, indice: hl / hlBase }
  })
  const pesos = proy.pesos
  const maxPeso = Math.max(...pesos)
  const pesoDe = (wd: number) => (wd === 0 ? 0 : pesos[wd - 1] ?? 0)

  const almacen = proy.almacen.map((r) => {
    // capPersona viene del server (capDiaria ya descuenta ausentismo, no sirve para derivarla)
    const capPersona = r.capPersona ?? (r.dotacion > 0 ? r.capDiaria / r.dotacion : 0)
    const horasExtra: number[] = [], faltanPico: number[] = [], volPicoDia: number[] = []
    for (const mm of meses) {
      const volMes = r.volPromBase * mm.indice
      let hh = 0
      for (const wd of weekdaysDelMes(mm.mes)) {
        const w = pesoDe(wd)
        if (w <= 0) continue
        const volDia = volMes * 6 * w
        if (volDia > r.capDiaria && r.prodH > 0) hh += (volDia - r.capDiaria) / r.prodH
      }
      const pico = volMes * 6 * maxPeso
      horasExtra.push(Math.round(hh * 10) / 10)
      volPicoDia.push(Math.round(pico))
      faltanPico.push(capPersona > 0 ? Math.max(0, Math.round((pico - r.capDiaria) / capPersona)) : 0)
    }
    return { ...r, horasExtra, faltanPico, volPicoDia }
  })

  const camionesDe = (ceqDia: number) => zonas.length > 0 && proy.capCamionViaje > 0
    ? zonas.reduce((s, z) => s + Math.max(z.camiones_minimos, Math.ceil((ceqDia * z.peso) / proy.capCamionViaje)), 0)
    : (proy.capCamionViaje > 0 ? Math.ceil(ceqDia / proy.capCamionViaje) : 0)
  const flota = proy.flota.map((rf) => {
    const diasRefuerzo: number[] = [], picoNecesario: number[] = [], segundaVueltaMeses: boolean[] = [], personaDias: number[] = []
    for (const mm of meses) {
      const ceqMes = proy.flotaCeqPromBase * mm.indice
      let dias = 0, pico = 0, sv = false, pdias = 0
      for (const wd of weekdaysDelMes(mm.mes)) {
        const w = pesoDe(wd)
        if (w <= 0) continue
        const ceqDia = ceqMes * 6 * w
        const camionesDia = camionesDe(ceqDia)
        const necesarios = camionesDia * rf.tripulacion
        if (necesarios > rf.dotacion) { dias++; pdias += necesarios - rf.dotacion }
        if (camionesDia > proy.camionesDisp) sv = true
        pico = Math.max(pico, necesarios)
      }
      diasRefuerzo.push(dias); picoNecesario.push(pico); segundaVueltaMeses.push(sv)
      personaDias.push(Math.round(pdias * 10) / 10)
    }
    return { ...rf, diasRefuerzo, picoNecesario, segundaVueltaMeses, personaDias }
  })

  return { ...proy, hlBase, ajusteBasePct: pctDe(proy.mesBase, proy.ajusteBasePct), meses, almacen, flota }
}

type PctEscenario = { pct: Record<string, string>; setPct: React.Dispatch<React.SetStateAction<Record<string, string>>> }

// ─── Solapa Costo — cuánto cuesta hoy el HL y cuánto suma hacer horas extra ──

const money = (v: number) => `$${Math.round(v).toLocaleString("es-AR")}`
const money2 = (v: number) => `$${v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

// Horas extra del mes por sector: almacén = suma de los 4 roles; distribución = las
// personas que faltan cada día de refuerzo × horas de la vuelta extra (los camiones
// no son hora-hombre, por eso quedan afuera).
function hhDelMes(proy: ProyeccionData, i: number) {
  const almacen = proy.almacen.reduce((s, r) => s + (r.horasExtra[i] ?? 0), 0)
  const distrib = proy.flota
    .filter((r) => r.rol !== "Camiones")
    .reduce((s, r) => s + (r.personaDias?.[i] ?? 0), 0) * proy.horasVueltaExtra
  return { almacen: Math.round(almacen * 10) / 10, distrib: Math.round(distrib * 10) / 10 }
}

function CostoTab({ data, proyLive, canEdit, run, isPending }: {
  data: DimData; proyLive: ProyeccionData | null; canEdit: boolean; run: RunFn; isPending: boolean
}) {
  const proy = proyLive
  const [tar, setTar] = useState<Record<number, { a: string; e: string }>>(() =>
    Object.fromEntries((proy?.costoHh ?? []).map((c) => [c.mes, { a: String(c.almacen), e: String(c.entrega) }])))
  const [hve, setHve] = useState(String(data.config.horas_vuelta_extra))

  if (!proy) return <p className="text-sm text-muted-foreground">Sin proyección de volumen: cargá el presupuesto anual para ver el costo.</p>

  const tarifaDe = (mesN: number, campo: "a" | "e") => {
    const t = tar[mesN]
    if (t && t[campo] !== "") return Number(t[campo]) || 0
    const c = proy.costoHh.find((x) => x.mes === mesN)
    return campo === "a" ? (c?.almacen ?? 0) : (c?.entrega ?? 0)
  }
  const horasVuelta = Number(hve) > 0 ? Number(hve) : proy.horasVueltaExtra

  const filas = proy.meses.map((mm, i) => {
    const mesN = Number(mm.mes.split("-")[1])
    const hh = hhDelMes({ ...proy, horasVueltaExtra: horasVuelta }, i)
    const $alm = hh.almacen * tarifaDe(mesN, "a")
    const $dis = hh.distrib * tarifaDe(mesN, "e")
    const total = $alm + $dis
    return { mm, mesN, hh, $alm, $dis, total, hl: mm.hl, porHl: mm.hl > 0 ? total / mm.hl : 0 }
  })
  const tot = filas.reduce((s, f) => ({
    hhA: s.hhA + f.hh.almacen, hhD: s.hhD + f.hh.distrib,
    $a: s.$a + f.$alm, $d: s.$d + f.$dis, total: s.total + f.total, hl: s.hl + f.hl,
  }), { hhA: 0, hhD: 0, $a: 0, $d: 0, total: 0, hl: 0 })
  const vlc = proy.vlc
  const sinTarifas = proy.costoHh.every((c) => c.almacen === 0 && c.entrega === 0)

  return (
    <div className="space-y-6">
      {/* ════ Costo/HL de HOY ════ */}
      <Card className="border-slate-300">
        <CardHeader className="pb-2"><CardTitle className="text-base">Costo logístico por HL — hoy</CardTitle></CardHeader>
        <CardContent>
          {vlc.valorMes == null ? (
            <p className="text-sm text-muted-foreground">Todavía no hay costo logístico cargado este año (tabla de costo mensual del Árbol del Sueño).</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-8">
                <div>
                  <p className="text-xs text-muted-foreground">Último mes con dato ({mesLabel(vlc.mesBase ?? "")})</p>
                  <p className="text-2xl font-bold text-slate-900">{money(vlc.valorMes)}<span className="text-sm font-normal text-muted-foreground"> /HL</span></p>
                  {vlc.hlMes ? <p className="text-xs text-muted-foreground">sobre {fmt(vlc.hlMes)} HL vendidos</p> : null}
                </div>
                {vlc.ytd != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Acumulado del año</p>
                    <p className="text-2xl font-bold text-slate-900">{money(vlc.ytd)}<span className="text-sm font-normal text-muted-foreground"> /HL</span></p>
                  </div>
                )}
                {vlc.meta != null && vlc.meta > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Meta (VLC/HL)</p>
                    <p className={`text-2xl font-bold ${(vlc.ytd ?? 0) <= vlc.meta ? "text-emerald-700" : "text-red-700"}`}>{money(vlc.meta)}<span className="text-sm font-normal text-muted-foreground"> /HL</span></p>
                    <p className="text-xs text-muted-foreground">{(vlc.ytd ?? 0) <= vlc.meta ? `margen ${money(vlc.meta - (vlc.ytd ?? 0))}` : `excedido en ${money((vlc.ytd ?? 0) - vlc.meta)}`}</p>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Es el <b>VLC/HL</b> del Árbol del Sueño: (costo de distribución + costo de almacén) ÷ HL vendidos del mes. Incluye toda la estructura, no solo la mano de obra.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ════ Datos de entrada — valor de la hora extra ════ */}
      {canEdit && (
        <Card className="border-sky-200">
          <CardHeader className="pb-2"><CardTitle className="text-base">1 · Valor de la hora extra ($/hora)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sector</TableHead>
                {proy.meses.map((mm) => <TableHead key={mm.mes} className="text-right">{mesLabel(mm.mes)}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {([["a", "Almacén"], ["e", "Distribución"]] as const).map(([campo, label]) => (
                  <TableRow key={campo}>
                    <TableCell className="font-medium">{label}</TableCell>
                    {proy.meses.map((mm) => {
                      const mesN = Number(mm.mes.split("-")[1])
                      return (
                        <TableCell key={mm.mes} className="text-right">
                          <Input type="number" step="1" className="h-8 w-24 text-right"
                            value={tar[mesN]?.[campo] ?? String(campo === "a" ? tarifaDe(mesN, "a") : tarifaDe(mesN, "e"))}
                            onChange={(e) => setTar((s) => ({
                              ...s,
                              [mesN]: { a: s[mesN]?.a ?? String(tarifaDe(mesN, "a")), e: s[mesN]?.e ?? String(tarifaDe(mesN, "e")), [campo]: e.target.value },
                            }))} />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Horas extra por persona en un día de refuerzo</Label>
                <Input type="number" step="0.5" className="h-8 w-24" value={hve} onChange={(e) => setHve(e.target.value)} />
              </div>
              <Button size="sm" disabled={isPending} onClick={() => run(async () => {
                const r1 = await guardarCostoHh(Number(proy.mesBase.split("-")[0]), proy.meses.map((mm) => {
                  const mesN = Number(mm.mes.split("-")[1])
                  return { mes: mesN, almacen: tarifaDe(mesN, "a"), entrega: tarifaDe(mesN, "e") }
                }))
                if ((r1 as { error?: string })?.error) return r1
                return guardarConfigDim({ ...data.config, horas_vuelta_extra: Number(hve) || 4 })
              }, "Costos guardados")}>Guardar</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Valores del <b>presupuesto PxQ 2026</b> (hojas ALMACEN y ENTREGA del EERR), con el recargo 50%/100% ya incluido e inflación del 2% mensual. Editalos si el valor real de liquidación difiere.
              Las horas extra de <b>distribución</b> salen de los días de refuerzo: cada persona que falta ese día hace {fmt(horasVuelta)} h extra.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ════ Resultado — cuánto cuesta hacer las extras ════ */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">2 · Si hacés las horas extra, cuánto cuesta</CardTitle></CardHeader>
        <CardContent>
          {sinTarifas && <p className="mb-2 text-sm text-amber-700">Cargá el valor de la hora extra arriba para ver los importes.</p>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">HH extra almacén</TableHead>
                <TableHead className="text-right">$ almacén</TableHead>
                <TableHead className="text-right">HH extra distrib.</TableHead>
                <TableHead className="text-right">$ distribución</TableHead>
                <TableHead className="text-right">$ total</TableHead>
                <TableHead className="text-right">HL del mes</TableHead>
                <TableHead className="text-right">$/HL extra</TableHead>
                {vlc.valorMes != null && <TableHead className="text-right">Costo/HL proyectado</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {filas.map((f) => {
                  const proyectado = (vlc.valorMes ?? 0) + f.porHl
                  const excede = vlc.meta != null && vlc.meta > 0 && proyectado > vlc.meta
                  return (
                    <TableRow key={f.mm.mes} className={f.total > 0 ? "" : "text-muted-foreground"}>
                      <TableCell className="font-medium">
                        {mesLabel(f.mm.mes)}
                        {f.mm.ajustePct !== 0 ? <span className="ml-1 text-[10px] text-sky-700">{f.mm.ajustePct > 0 ? "+" : ""}{f.mm.ajustePct}%</span> : null}
                      </TableCell>
                      <TableCell className="text-right">{f.hh.almacen > 0 ? `${fmt(f.hh.almacen)} h` : "—"}</TableCell>
                      <TableCell className="text-right">{f.$alm > 0 ? money(f.$alm) : "—"}</TableCell>
                      <TableCell className="text-right">{f.hh.distrib > 0 ? `${fmt(f.hh.distrib)} h` : "—"}</TableCell>
                      <TableCell className="text-right">{f.$dis > 0 ? money(f.$dis) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{f.total > 0 ? money(f.total) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(Math.round(f.hl))}</TableCell>
                      <TableCell className={`text-right font-semibold ${f.porHl > 0 ? "text-amber-700" : ""}`}>{f.porHl > 0 ? money2(f.porHl) : "—"}</TableCell>
                      {vlc.valorMes != null && (
                        <TableCell className={`text-right ${excede ? "text-red-700 font-semibold" : ""}`}>{money(proyectado)}</TableCell>
                      )}
                    </TableRow>
                  )
                })}
                <TableRow className="border-t-2">
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">{fmt(Math.round(tot.hhA))} h</TableCell>
                  <TableCell className="text-right font-bold">{money(tot.$a)}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(Math.round(tot.hhD))} h</TableCell>
                  <TableCell className="text-right font-bold">{money(tot.$d)}</TableCell>
                  <TableCell className="text-right font-bold">{money(tot.total)}</TableCell>
                  <TableCell className="text-right font-bold text-muted-foreground">{fmt(Math.round(tot.hl))}</TableCell>
                  <TableCell className="text-right font-bold">{tot.hl > 0 ? money2(tot.total / tot.hl) : "—"}</TableCell>
                  {vlc.valorMes != null && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <b>HH extra almacén</b> = horas-hombre que la dotación fija no llega a cubrir (pickeros + clasificadores + tareas generales + maquinistas).
            <b> HH extra distribución</b> = personas que faltan en cada día de refuerzo × {fmt(horasVuelta)} h.
            <b> $/HL extra</b> = lo que suma la reestructuración al costo por HL de ese mes; el <b>costo/HL proyectado</b> lo suma al {money(vlc.valorMes ?? 0)}/HL de hoy.
            Los HL siguen el escenario cargado en Flota o Almacén: si cambiás un %, esta tabla se actualiza sola.
          </p>
        </CardContent>
      </Card>
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

  // Escenario de volumen compartido entre Flota y Almacén: los % tipeados recalculan
  // la proyección al instante (proyLive), sin esperar al Guardar.
  const proySaved = data.proyeccion
  const [pctEsc, setPctEsc] = useState<Record<string, string>>(() => proySaved
    ? Object.fromEntries([[proySaved.mesBase, String(proySaved.ajusteBasePct)], ...proySaved.meses.map((mm) => [mm.mes, String(mm.ajustePct)])])
    : {})
  const proyLive = useMemo(
    () => (proySaved ? recalcularProyeccion(proySaved, data.zonas, pctEsc) : null),
    [proySaved, data.zonas, pctEsc],
  )
  const escenario: PctEscenario = { pct: pctEsc, setPct: setPctEsc }

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
          <TabsTrigger value="almacen">Almacén</TabsTrigger>
          <TabsTrigger value="costo">Costo / HL</TabsTrigger>
          <TabsTrigger value="kpis">KPIs de distribución</TabsTrigger>
          <TabsTrigger value="planes">Planes & Reunión</TabsTrigger>
        </TabsList>

        {/* ─── Flota / Entrega ─── */}
        <TabsContent value="flotaentrega" className="space-y-4">
          <FlotaTab data={data} proyLive={proyLive} escenario={escenario} canEdit={canEdit} run={run} isPending={isPending} />
        </TabsContent>

        {/* ─── Almacén ─── */}
        <TabsContent value="almacen" className="space-y-4">
          <AlmacenTab data={data} proyLive={proyLive} escenario={escenario} canEdit={canEdit} run={run} isPending={isPending} />
        </TabsContent>

        {/* ─── Costo / HL ─── */}
        <TabsContent value="costo" className="space-y-4">
          <CostoTab data={data} proyLive={proyLive} canEdit={canEdit} run={run} isPending={isPending} />
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

// ─── Solapa Flota / Entrega — única (datos de entrada + resultados) ──────────

// Modal por celda (recurso de flota + mes): desglose por día de semana del volumen CEq vs capacidad.
function DetalleFlotaModal({ rol, mes, pesos, ceqPromBase, capCamionViaje, camionesDisp, zonas }: {
  rol: ProyeccionFlotaRol; mes: ProyeccionMes; pesos: number[]; ceqPromBase: number; capCamionViaje: number; camionesDisp: number; zonas: ZonaReparto[]
}) {
  const ceqProm = ceqPromBase * mes.indice
  // camiones por cobertura de zonas (mismo criterio que el cálculo del backend)
  const camionesDeVol = (ceqDia: number) => zonas.length > 0 && capCamionViaje > 0
    ? zonas.reduce((s, z) => s + Math.max(z.camiones_minimos, Math.ceil((ceqDia * z.peso) / capCamionViaje)), 0)
    : (capCamionViaje > 0 ? Math.ceil(ceqDia / capCamionViaje) : 0)
  const filas = DIAS_SEM.map((d, i) => {
    const ceqDia = Math.round(ceqProm * 6 * (pesos[i] ?? 0))
    const camionesDia = camionesDeVol(ceqDia)
    const necesarios = camionesDia * rol.tripulacion
    return { d, i, ceqDia, camionesDia, necesarios, over: necesarios > rol.dotacion, sv: camionesDia > camionesDisp }
  })
  const pico = Math.max(...filas.map((f) => f.necesarios))
  const algunaSV = filas.some((f) => f.sv)
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{rol.rol} — {mesLabel(mes.mes)}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">
        Dotación: <b>{fmt(rol.dotacion)}</b>{rol.tripulacion !== 1 ? ` · ${fmt(rol.tripulacion)} por camión` : ""}. Capacidad de un camión: <b>{fmt(capCamionViaje)} CEq/día</b>. Volumen CEq prom del mes: <b>{fmt(Math.round(ceqProm))}/día</b> · índice ×{mes.indice.toFixed(2).replace(".", ",")}{mes.ajustePct !== 0 ? <> · <b className="text-sky-700">escenario {mes.ajustePct > 0 ? "+" : ""}{mes.ajustePct}%</b></> : null}.
      </p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Día</TableHead><TableHead className="text-right">Volumen CEq</TableHead><TableHead className="text-right">Camiones</TableHead><TableHead className="text-right">Necesarios</TableHead><TableHead className="text-right">Dotación</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.d} className={f.over ? "bg-red-50" : ""}>
              <TableCell className="font-medium">{f.d}{(f.i === 3 || f.i === 4) ? " · pico" : ""}</TableCell>
              <TableCell className="text-right">{fmt(f.ceqDia)}</TableCell>
              <TableCell className="text-right">{fmt(f.camionesDia)}{f.sv ? " ⚠" : ""}</TableCell>
              <TableCell className={`text-right ${f.over ? "text-red-700 font-semibold" : ""}`}>{fmt(f.necesarios)}</TableCell>
              <TableCell className="text-right text-muted-foreground">{fmt(rol.dotacion)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm">
        {pico > rol.dotacion
          ? <>El pico (Jue/Vie) necesita <b className="text-red-700">{fmt(pico)}</b> y hay <b>{fmt(rol.dotacion)}</b> → refuerzo (contratar o 2ª vuelta).{algunaSV ? <b className="text-red-700"> ⚠ Algún día supera los {camionesDisp} camiones → 2ª vuelta obligada.</b> : null}</>
          : <>Incluso el día pico ({fmt(pico)}) se cubre con la dotación de <b>{fmt(rol.dotacion)}</b> → <b className="text-emerald-700">sin refuerzo</b>.</>}
      </p>
    </DialogContent>
  )
}

// Modal del MES EN CURSO para camiones: cómo se llega a los camiones necesarios
// (piso por cobertura de zonas, no solo volumen ÷ capacidad).
function DetalleHoyCamionesModal({ m, zonas, capCamVj, dispo, totalFlota, viajes }: {
  m: MetricasDistribucion; zonas: ZonaReparto[]; capCamVj: number; dispo: number; totalFlota: number; viajes: number
}) {
  const camZona = (peso: number, min: number, vol: number) => Math.max(min, capCamVj > 0 ? Math.ceil((vol * peso) / capCamVj) : 0)
  const filas = zonas.map((z) => ({
    zona: z.zona, peso: z.peso, min: z.camiones_minimos,
    porVol: capCamVj > 0 ? Math.ceil((m.volumenCeqPromedio * z.peso) / capCamVj) : 0,
    usa: camZona(z.peso, z.camiones_minimos, m.volumenCeqPromedio),
  }))
  const totalZonas = filas.reduce((s, f) => s + f.usa, 0)
  const porVolPuro = capCamVj > 0 ? Math.ceil(m.volumenCeqPromedio / capCamVj) : 0
  const estadoTxt = m.camionesNecesariosPico <= dispo ? "Cubre" : m.camionesNecesariosPromedio <= dispo ? "Refuerzo en pico" : `Faltan ${m.camionesNecesariosPromedio - dispo}`
  return (
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>Camiones — {m.mes} · {estadoTxt}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">
        Demanda: volumen ruteado del mes (ruteo_cierres, {fmt(m.diasCerrados)} días cerrados) convertido a cajas equivalentes.
        Flota: {fmt(totalFlota)} unidades de distribución, <b>{fmt(dispo)} operativas</b> (el dimensionamiento las toma todas operativas; no descuenta las que estén en taller).
        Capacidad de un camión: <b>{fmt(Math.round(capCamVj))} CEq/día</b> ({fmt(viajes)} viaje{viajes === 1 ? "" : "s"}/día).
      </p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Zona</TableHead><TableHead className="text-right">Peso</TableHead><TableHead className="text-right">Por volumen</TableHead>
          <TableHead className="text-right">Mínimo</TableHead><TableHead className="text-right">Usa</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.zona}>
              <TableCell className="font-medium">{f.zona}</TableCell>
              <TableCell className="text-right">{Math.round(f.peso * 100)}%</TableCell>
              <TableCell className="text-right text-muted-foreground">{f.porVol}</TableCell>
              <TableCell className="text-right text-muted-foreground">{f.min}</TableCell>
              <TableCell className={`text-right font-semibold ${f.usa > f.porVol ? "text-amber-700" : ""}`}>{f.usa}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2">
            <TableCell className="font-bold">Total necesarios (promedio)</TableCell>
            <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">contra {fmt(dispo)} operativas</TableCell>
            <TableCell className="text-right font-bold">{totalZonas}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="rounded-md border-l-4 border-sky-400 bg-sky-50 p-3 text-sm">
        <p className="mb-1 font-semibold">Qué significa</p>
        <p>
          Por volumen puro alcanzarían <b>{porVolPuro}</b> camiones ({fmt(m.volumenCeqPromedio)} CEq ÷ {fmt(Math.round(capCamVj))}),
          pero cada zona necesita un mínimo de unidades para llegar aunque no vayan llenas → el piso real es <b>{totalZonas}</b>.
          {m.camionesNecesariosPico > m.camionesNecesariosPromedio
            ? <> En el día pico ({fmt(m.volumenCeqPico)} CEq) suben a <b>{m.camionesNecesariosPico}</b>.</>
            : null}
          {" "}
          {m.camionesNecesariosPico <= dispo
            ? <><b className="text-emerald-700">La flota operativa cubre incluso el pico.</b></>
            : m.camionesNecesariosPromedio <= dispo
              ? <><b className="text-amber-700">En el pico faltan {m.camionesNecesariosPico - dispo}</b> → 2ª vuelta o refuerzo esos días.</>
              : <><b className="text-red-700">Faltan {m.camionesNecesariosPromedio - dispo} en un día promedio</b> → 2ª vuelta obligada o sumar unidades.</>}
        </p>
      </div>
    </DialogContent>
  )
}

// Modal del MES EN CURSO para choferes / ayudantes.
function DetalleHoyRepartoModal({ nombre, r, mes, camionesProm, camionesPico, usaObservada, ausentismo }: {
  nombre: string; r: RolReparto; mes: string; camionesProm: number; camionesPico: number; usaObservada: boolean; ausentismo: number
}) {
  const dot = Math.round(r.dotacionProm)
  const brecha = r.fteNecesariosProm - dot
  const brechaPico = r.fteNecesariosPico - dot
  const estadoTxt = r.fteNecesariosPico <= dot ? "Cubre" : r.fteNecesariosProm <= dot ? "Refuerzo en pico" : `Faltan ${brecha}`
  const pasos: Array<[string, string, string]> = [
    ["Camiones necesarios (promedio)", `${camionesProm}`, "del cálculo por zonas de reparto"],
    ["Camiones necesarios (pico)", `${camionesPico}`, "día de mayor volumen"],
    ["Tripulación por camión", `${fmt(r.porCamion)}`, "editable en Datos de entrada"],
    ["Necesarios (promedio)", `${r.fteNecesariosProm}`, `${camionesProm} camiones × ${fmt(r.porCamion)}`],
    ["Necesarios (pico)", `${r.fteNecesariosPico}`, `${camionesPico} camiones × ${fmt(r.porCamion)}`],
    ["Dotación considerada", `${fmt(dot)}`, usaObservada
      ? "promedio real de personas distintas por día (registros_vehiculos, egresos) — ya trae el ausentismo implícito"
      : `plantel cargado a mano${ausentismo > 0 ? `, menos ${Math.round(ausentismo * 100)}% de ausentismo` : ""}`],
    ["Dotación observada", `${fmt(Math.round(r.dotacionObservada))}`, "promedio real diario del mes, siempre como referencia"],
  ]
  return (
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle className="capitalize">{nombre} — {mes} · {estadoTxt}</DialogTitle></DialogHeader>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Paso</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>De dónde sale</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {pasos.map(([k, v, d]) => (
            <TableRow key={k}>
              <TableCell className="font-medium">{k}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold">{v}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{d}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2">
            <TableCell className="font-bold">Brecha (promedio)</TableCell>
            <TableCell className={`text-right font-bold ${brecha > 0 ? "text-red-700" : "text-emerald-700"}`}>{brecha > 0 ? `faltan ${brecha}` : `sobran ${Math.abs(brecha)}`}</TableCell>
            <TableCell className="text-xs text-muted-foreground">necesarios − dotación</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-bold">Brecha (pico)</TableCell>
            <TableCell className={`text-right font-bold ${brechaPico > 0 ? "text-red-700" : "text-emerald-700"}`}>{brechaPico > 0 ? `faltan ${brechaPico}` : `sobran ${Math.abs(brechaPico)}`}</TableCell>
            <TableCell className="text-xs text-muted-foreground">necesarios en el pico − dotación</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="rounded-md border-l-4 border-sky-400 bg-sky-50 p-3 text-sm">
        <p className="mb-1 font-semibold">Qué significa</p>
        <p>
          {brecha > 0
            ? <>Faltan <b className="text-red-700">{brecha}</b> ya en un día promedio: cada camión que sale necesita {fmt(r.porCamion)} y hoy salen {fmt(dot)} personas por día. Sin refuerzo, algún camión no sale o va incompleto.</>
            : brechaPico > 0
              ? <>Alcanza en el día promedio, pero el pico pide <b>{r.fteNecesariosPico}</b> y hay <b>{fmt(dot)}</b> → <b className="text-amber-700">faltan {brechaPico} los días fuertes</b> (contratar, horas extra o 2ª vuelta).</>
              : <>La dotación de <b>{fmt(dot)}</b> cubre incluso el pico ({r.fteNecesariosPico}). Holgura: <b className="text-emerald-700">{dot - r.fteNecesariosPico}</b> en el día más cargado.</>}
          {usaObservada ? <> Ojo: la dotación es el <b>promedio real observado</b>, así que ya incluye las ausencias del mes.</> : null}
        </p>
      </div>
    </DialogContent>
  )
}

function FlotaTab({ data, proyLive, escenario, canEdit, run, isPending }: { data: DimData; proyLive: ProyeccionData | null; escenario: PctEscenario; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const m = data.metricas
  const rep = data.reparto
  const proy = proyLive
  const dispo = data.unidadesDisponibles
  const [c, setC] = useState({
    choferes_por_camion: String(data.config.choferes_por_camion),
    ayudantes_por_camion: String(data.config.ayudantes_por_camion),
    dotacion_choferes: String(data.config.dotacion_choferes),
    dotacion_ayudantes: String(data.config.dotacion_ayudantes),
    ausentismo_reparto: String(data.config.ausentismo_reparto),
  })
  const [zonas, setZonas] = useState(data.zonas.map((z) => ({ zona: z.zona, peso: String(z.peso), camiones_minimos: String(z.camiones_minimos) })))
  const estado = (nec: number, dot: number, pico: number) =>
    pico <= dot ? { t: "Cubre", c: "text-emerald-700" } : nec <= dot ? { t: "Refuerzo en pico", c: "text-amber-700" } : { t: `Faltan ${nec - dot}`, c: "text-red-700 font-semibold" }
  // capacidad de un camión por día (CEq) para el desglose por zona
  const capCamVj = dispo > 0 ? data.capacidadInstaladaDiaria / dispo : 0
  const volProm = m?.volumenCeqPromedio ?? 0
  const sumaPesos = zonas.reduce((s, z) => s + (Number(z.peso) || 0), 0)
  const camZona = (peso: number, min: number) => Math.max(min, capCamVj > 0 ? Math.ceil((volProm * peso) / capCamVj) : 0)

  return (
    <div className="space-y-6">
      {/* ════ SECCIÓN 1 — DATOS DE ENTRADA ════ */}
      {canEdit && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">1 · Datos de entrada</h3>
          <ConfigCard config={data.config} run={run} isPending={isPending} />
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Capacidad de la flota — CEq por unidad ({data.flota.length})</CardTitle></CardHeader>
            <CardContent>
              {data.flota.length === 0 ? <p className="text-sm text-muted-foreground">No hay unidades con sector «distribución».</p>
                : <FlotaTable flota={data.flota} canEdit={canEdit} run={run} isPending={isPending} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Tripulación y dotación de reparto</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
              <div><Label className="text-xs">Dotación choferes</Label><Input type="number" step="1" className="h-8 w-24" value={c.dotacion_choferes} onChange={(e) => setC((s) => ({ ...s, dotacion_choferes: e.target.value }))} /></div>
              <div><Label className="text-xs">Dotación ayudantes</Label><Input type="number" step="1" className="h-8 w-24" value={c.dotacion_ayudantes} onChange={(e) => setC((s) => ({ ...s, dotacion_ayudantes: e.target.value }))} /></div>
              <div><Label className="text-xs">Choferes por camión</Label><Input type="number" step="0.1" className="h-8 w-24" value={c.choferes_por_camion} onChange={(e) => setC((s) => ({ ...s, choferes_por_camion: e.target.value }))} /></div>
              <div><Label className="text-xs">Ayudantes por camión</Label><Input type="number" step="0.1" className="h-8 w-24" value={c.ayudantes_por_camion} onChange={(e) => setC((s) => ({ ...s, ayudantes_por_camion: e.target.value }))} /></div>
              <div><Label className="text-xs">Ausentismo (0–1)</Label><Input type="number" step="0.01" className="h-8 w-24" value={c.ausentismo_reparto} onChange={(e) => setC((s) => ({ ...s, ausentismo_reparto: e.target.value }))} /></div>
              <Button size="sm" disabled={isPending} onClick={() => run(() => guardarConfigDim({ ...data.config, choferes_por_camion: Number(c.choferes_por_camion), ayudantes_por_camion: Number(c.ayudantes_por_camion), dotacion_choferes: Number(c.dotacion_choferes), dotacion_ayudantes: Number(c.dotacion_ayudantes), ausentismo_reparto: Number(c.ausentismo_reparto) }), "Tripulación y dotación guardadas")}>Guardar</Button>
              {rep && <p className="w-full text-xs text-muted-foreground">Dotación de choferes/ayudantes: poné tu plantel real; si lo dejás en <b>0</b> se usa el promedio real de <b>registros_vehiculos</b> (egresos dpo-app): <b>{fmt(Math.round(rep.choferes.dotacionObservada))} choferes</b> y <b>{fmt(Math.round(rep.ayudantes.dotacionObservada))} ayudantes</b> por día. <b>Ausentismo</b>: dejalo en 0 si usás el promedio real (ya trae las ausencias implícitas); cargalo (ej. 0,08) solo si ponés el plantel nominal. Tripulación = personas por camión. Viajes/día y capacidad CEq se configuran arriba.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Zonas de reparto (cobertura geográfica)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Zona</TableHead><TableHead className="text-right">Peso (%)</TableHead><TableHead className="text-right">Camiones mín.</TableHead><TableHead className="text-right">Camiones hoy</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {zonas.map((z, i) => (
                    <TableRow key={i}>
                      <TableCell><Input className="h-8 w-44" value={z.zona} onChange={(e) => setZonas((s) => s.map((x, j) => j === i ? { ...x, zona: e.target.value } : x))} /></TableCell>
                      <TableCell className="text-right"><Input type="number" step="0.01" className="h-8 w-20" value={z.peso} onChange={(e) => setZonas((s) => s.map((x, j) => j === i ? { ...x, peso: e.target.value } : x))} /></TableCell>
                      <TableCell className="text-right"><Input type="number" step="1" className="h-8 w-20" value={z.camiones_minimos} onChange={(e) => setZonas((s) => s.map((x, j) => j === i ? { ...x, camiones_minimos: e.target.value } : x))} /></TableCell>
                      <TableCell className="text-right font-semibold">{camZona(Number(z.peso) || 0, Number(z.camiones_minimos) || 0)}</TableCell>
                      <TableCell className="text-right"><button className="text-xs text-red-600 hover:underline" onClick={() => setZonas((s) => s.filter((_, j) => j !== i))}>quitar</button></TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className={`text-right font-bold ${Math.abs(sumaPesos - 1) > 0.001 ? "text-amber-600" : ""}`}>{Math.round(sumaPesos * 100)}%</TableCell>
                    <TableCell className="text-right font-bold">{zonas.reduce((s, z) => s + (Number(z.camiones_minimos) || 0), 0)}</TableCell>
                    <TableCell className="text-right font-bold">{zonas.reduce((s, z) => s + camZona(Number(z.peso) || 0, Number(z.camiones_minimos) || 0), 0)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => setZonas((s) => [...s, { zona: "", peso: "0", camiones_minimos: "1" }])}>+ Zona</Button>
                <Button size="sm" disabled={isPending} onClick={() => run(() => guardarZonasReparto(zonas.map((z) => ({ zona: z.zona, peso: Number(z.peso), camiones_minimos: Number(z.camiones_minimos) }))), "Zonas guardadas")}>Guardar zonas</Button>
                {Math.abs(sumaPesos - 1) > 0.001 && <span className="text-xs text-amber-600">Los pesos suman {Math.round(sumaPesos * 100)}% (idealmente 100%).</span>}
              </div>
              <p className="text-xs text-muted-foreground">Cada zona toma su parte del volumen (peso) y necesita un mínimo de camiones por distancia. «Camiones hoy» = máx(mínimo, volumen×peso ÷ capacidad) con el volumen promedio del mes ({fmt(volProm)} CEq). El total es la flota que se necesita por cobertura, aunque por capacidad pura entrarían menos.</p>
            </CardContent>
          </Card>
          {proy && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Volumen proyectado (HL/mes) — del presupuesto + escenario</CardTitle></CardHeader>
              <CardContent>
                <VolumenProyectadoTable proy={proy} saved={data.proyeccion} escenario={escenario} canEdit={canEdit} run={run} isPending={isPending} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════ SECCIÓN 2 — RESULTADOS ════ */}
      {data.metricasError && <p className="text-sm text-red-600">Error leyendo ruteo: {data.metricasError}</p>}
      {!m && !data.metricasError && <p className="text-sm text-muted-foreground">Sin ruteos cerrados este mes para calcular la demanda.</p>}
      {m && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">2 · Resultado — flota vs demanda ({m.mes})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Recurso</TableHead><TableHead className="text-right">Demanda/día</TableHead><TableHead className="text-right">Capacidad / Dotación</TableHead><TableHead className="text-right">Necesarios</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Camiones</TableCell>
                  <TableCell className="text-right">{fmt(m.volumenCeqPromedio)} CEq <span className="text-xs text-muted-foreground">(pico {fmt(m.volumenCeqPico)})</span></TableCell>
                  <TableCell className="text-right">{fmt(dispo)} unid · {fmt(Math.round(data.capacidadInstaladaDiaria))} CEq</TableCell>
                  <TableCell className="text-right font-semibold">{m.camionesNecesariosPromedio} (pico {m.camionesNecesariosPico})</TableCell>
                  <TableCell className="p-0">
                    <Dialog>
                      <DialogTrigger className={`block w-full cursor-pointer px-3 py-2 text-left underline decoration-dotted underline-offset-4 hover:brightness-95 ${estado(m.camionesNecesariosPromedio, dispo, m.camionesNecesariosPico).c}`}>
                        {estado(m.camionesNecesariosPromedio, dispo, m.camionesNecesariosPico).t} <span className="text-[10px] font-normal text-muted-foreground">¿por qué?</span>
                      </DialogTrigger>
                      <DetalleHoyCamionesModal m={m} zonas={data.zonas} capCamVj={capCamVj} dispo={dispo} totalFlota={data.flota.length} viajes={data.config.viajes_por_dia} />
                    </Dialog>
                  </TableCell>
                </TableRow>
                {rep && (["choferes", "ayudantes"] as const).map((k) => {
                  const r = rep[k]; const dot = Math.round(r.dotacionProm); const e = estado(r.fteNecesariosProm, dot, r.fteNecesariosPico)
                  const cargadoAMano = k === "choferes" ? data.config.dotacion_choferes > 0 : data.config.dotacion_ayudantes > 0
                  return (
                    <TableRow key={k}>
                      <TableCell className="font-medium capitalize">{k}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{m.camionesNecesariosPromedio} camiones × {fmt(r.porCamion)}</TableCell>
                      <TableCell className="text-right">{fmt(dot)} <span className="text-xs text-muted-foreground">(real)</span></TableCell>
                      <TableCell className="text-right font-semibold">{r.fteNecesariosProm} (pico {r.fteNecesariosPico})</TableCell>
                      <TableCell className="p-0">
                        <Dialog>
                          <DialogTrigger className={`block w-full cursor-pointer px-3 py-2 text-left underline decoration-dotted underline-offset-4 hover:brightness-95 ${e.c}`}>
                            {e.t} <span className="text-[10px] font-normal text-muted-foreground">¿por qué?</span>
                          </DialogTrigger>
                          <DetalleHoyRepartoModal nombre={k} r={r} mes={m.mes} camionesProm={m.camionesNecesariosPromedio} camionesPico={m.camionesNecesariosPico} usaObservada={!cargadoAMano} ausentismo={data.config.ausentismo_reparto} />
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Camiones necesarios = volumen CEq ÷ (capacidad por camión × viajes/día). Choferes/ayudantes = camiones × tripulación. Dotación de reparto = promedio real diario (registros_vehiculos). «Cubre» = alcanza incluso en el pico. <b>Tocá el estado</b> para ver el desglose por zona y el cálculo paso a paso.</p>
          </CardContent>
        </Card>
      )}

      {proy && proy.flota.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Proyección a diciembre — días con refuerzo por mes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Recurso</TableHead>{proy.meses.map((mm) => (<TableHead key={mm.mes} className="text-right">{mesLabel(mm.mes)}</TableHead>))}</TableRow></TableHeader>
              <TableBody>
                {proy.flota.map((r) => (
                  <TableRow key={r.rol}>
                    <TableCell className="font-medium">{r.rol} <span className="text-xs text-muted-foreground">({fmt(r.dotacion)})</span></TableCell>
                    {r.diasRefuerzo.map((d, i) => {
                      const sv = r.segundaVueltaMeses[i]
                      const cls = d > 0 ? (sv ? "bg-red-100 text-red-700 font-semibold" : "bg-amber-50 text-amber-700") : "text-emerald-700"
                      return (
                        <TableCell key={i} className="p-0">
                          <Dialog>
                            <DialogTrigger className={`block w-full cursor-pointer px-3 py-2 text-right hover:brightness-95 ${cls}`}>{d > 0 ? `${d} días` : "✓"}</DialogTrigger>
                            <DetalleFlotaModal rol={r} mes={proy.meses[i]} pesos={proy.pesos} ceqPromBase={proy.flotaCeqPromBase} capCamionViaje={proy.capCamionViaje} camionesDisp={proy.camionesDisp} zonas={data.zonas} />
                          </Dialog>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">«N días» = días del mes donde el volumen supera lo que la dotación cubre en los viajes actuales → contratar o 2ª vuelta. Fondo <span className="font-medium text-red-700">rojo fuerte</span> = algún día supera los {proy.camionesDisp} camiones (2ª vuelta obligada). Tocá una celda para ver el desglose por día.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Solapa Almacén (dotación) — única, autocontenida ────────────────────────

const PARAM_ROLES = [
  { n: "Pickeros", dot: "dotacion_almacen", prod: "prod_bul_hh", util: "util_pickeros", u: "bul/HH", stepProd: "1" },
  { n: "Clasificadores", dot: "dotacion_clasif", prod: "prod_clasif_pal_h", util: "util_clasif", u: "pal/HH", stepProd: "0.1" },
  { n: "Tareas generales", dot: "dotacion_reempaque", prod: "prod_reempaque_bul_hh", util: "util_reempaque", u: "bul/HH", stepProd: "1" },
  { n: "Maquinistas", dot: "dotacion_maquinistas", prod: "prod_pal_h", util: "util_maquinistas", u: "pal/HH", stepProd: "0.1" },
] as const

const DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

// Modal por celda (rol + mes): explica el "por qué" de ESE mes — volumen por día de semana vs capacidad.
function DetalleCeldaModal({ rol, mes, pesos, horasExtraMes, volDiaMes }: { rol: ProyeccionAlmacenRol; mes: ProyeccionMes; pesos: number[]; horasExtraMes: number; volDiaMes: number }) {
  const cap = rol.capDiaria
  // Clasificadores: demanda uniforme en HL (presupuesto retornable ÷ días hábiles), sin pico por día de semana.
  if (rol.unidadVol === "HL") {
    const supera = volDiaMes > cap
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{rol.rol} — {mesLabel(mes.mes)}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Capacidad: <b>{fmt(cap)} HL/día</b> ({fmt(Math.round(cap / 6))} pal · dotación efectiva {rol.dotacionEfectiva} × {fmt(rol.prodH)} HL/HH). Demanda uniforme del mes (presupuesto retornable ÷ días hábiles): <b>{fmt(volDiaMes)} HL/día</b> ({fmt(Math.round(volDiaMes / 6))} pal/día).
        </p>
        <p className="text-sm">
          {supera
            ? <>La demanda diaria (<b>{fmt(volDiaMes)}</b>) supera la capacidad de <b>{fmt(cap)}</b> → <b className="text-red-700">{fmt(horasExtraMes)} h extra</b> en el mes (todos los días hábiles).</>
            : <>La demanda diaria (<b>{fmt(volDiaMes)}</b>) queda por debajo de la capacidad (<b>{fmt(cap)}</b>) → <b className="text-emerald-700">cubre sin horas extra</b>.</>}
        </p>
      </DialogContent>
    )
  }
  const volProm = rol.volPromBase * mes.indice
  const vals = DIAS_SEM.map((_, d) => Math.round(volProm * 6 * (pesos[d] ?? 0)))
  const pico = Math.max(...vals), bajo = Math.min(...vals)
  const supera = pico > cap
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{rol.rol} — {mesLabel(mes.mes)}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">
        Capacidad: <b>{fmt(cap)} {rol.unidadVol}/día</b> (dotación {rol.dotacionEfectiva != null && rol.dotacionEfectiva < rol.dotacion ? <>efectiva {fmt(rol.dotacionEfectiva)} de {rol.dotacion}</> : rol.dotacion} × {fmt(rol.prodH)} {rol.unidadVol}/HH). Volumen prom del mes (presupuesto): <b>{fmt(Math.round(volProm))} {rol.unidadVol}/día</b> · índice ×{mes.indice.toFixed(2).replace(".", ",")}{mes.ajustePct !== 0 ? <> · <b className="text-sky-700">escenario {mes.ajustePct > 0 ? "+" : ""}{mes.ajustePct}%</b></> : null}.
      </p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Día</TableHead><TableHead className="text-right">Volumen</TableHead><TableHead className="text-right">Capacidad</TableHead><TableHead className="text-right">Diferencia</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {DIAS_SEM.map((d, i) => {
            const v = vals[i], over = v > cap
            return (
              <TableRow key={d} className={over ? "bg-red-50" : ""}>
                <TableCell className="font-medium">{d}{(i === 3 || i === 4) ? " · pico" : ""}</TableCell>
                <TableCell className={`text-right ${over ? "text-red-700 font-semibold" : ""}`}>{fmt(v)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt(cap)}</TableCell>
                <TableCell className={`text-right ${over ? "text-red-700" : "text-emerald-700"}`}>{over ? `+${fmt(v - cap)}` : fmt(v - cap)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <p className="text-sm">
        {supera
          ? <>El pico (Jue/Vie = <b>{fmt(pico)}</b>) supera la capacidad de <b>{fmt(cap)}</b> → <b className="text-red-700">{fmt(horasExtraMes)} h extra</b> en el mes. El día más flojo es <b>{fmt(bajo)}</b>.</>
          : <>Incluso el día pico (<b>{fmt(pico)}</b>) queda por debajo de la capacidad (<b>{fmt(cap)}</b>) → <b className="text-emerald-700">cubre sin horas extra</b>. Día más flojo {fmt(bajo)}.</>}
      </p>
    </DialogContent>
  )
}

// Modal del MES EN CURSO: abre desde la columna Estado y explica paso a paso de dónde
// sale el «Cubre» / «Extras en pico» / «Faltan N», con la fuente de cada dato. El caso
// típico es «Faltan 0,2»: no falta gente, es el colchón de ausentismo contra un
// necesario que se redondea a personas enteras — por eso además va el chequeo por volumen.
function DetalleHoyAlmacenModal({ nombre, r, mes, unidad, esHL, horasTurno, ausentismo, fuente }: {
  nombre: string; r: RolFte; mes: string; unidad: string; esHL: boolean; horasTurno: number; ausentismo: number; fuente: string
}) {
  const paletas = (v: number) => `${fmt(Math.round(v / 6))} pal`
  const uv = (v: number) => `${fmt(v)} ${unidad}${esHL ? ` (${paletas(v)})` : ""}`
  const capTotal = Math.round(r.capDiariaFte * r.dotacionEfectiva)
  const brechaProm = Math.round((r.fteNecesariosProm - r.dotacionEfectiva) * 10) / 10
  const brechaPico = Math.round((r.fteNecesariosPico - r.dotacionEfectiva) * 10) / 10
  const deficitProm = Math.max(0, r.volumenProm - capTotal)
  const deficitPico = Math.max(0, r.volumenPico - capTotal)
  // productividad efectiva por hora-hombre (ya descontada la utilización del turno)
  const prodEfHora = r.productividad * r.utilizacion
  const hhExtra = (falt: number) => (prodEfHora > 0 ? Math.round((falt / prodEfHora) * 10) / 10 : 0)
  const cubrePorVolumen = deficitProm === 0
  const alcanzaNominal = r.fteNecesariosProm <= r.dotacion
  const estadoTxt = r.fteNecesariosPico <= r.dotacionEfectiva ? "Cubre"
    : r.fteNecesariosProm <= r.dotacionEfectiva ? "Extras en pico" : `Faltan ${fmt(brechaProm)}`
  const pasos: Array<[string, string, string]> = [
    ["Demanda promedio / día", uv(r.volumenProm), `promedio de ${fmt(r.diasConDatos)} días con dato`],
    ["Demanda del día pico", uv(r.volumenPico), "día de mayor volumen del mes"],
    ["Productividad", `${fmt(r.productividad)} ${esHL ? "HL" : unidad}/HH`, esHL ? "estándar en pal/HH × 6 HL/paleta" : "por hora-hombre trabajada"],
    ["Horas de turno × utilización", `${fmt(horasTurno)} h × ${Math.round(r.utilizacion * 100)}% = ${fmt(Math.round(horasTurno * r.utilizacion * 10) / 10)} h`, "horas efectivas sobre la tarea"],
    ["Capacidad por persona / día", uv(r.capDiariaFte), "productividad × horas × utilización"],
    ["Necesarios (promedio)", `${r.fteNecesariosProm}`, `${fmt(r.volumenProm)} ÷ ${fmt(r.capDiariaFte)}, redondeado hacia arriba`],
    ["Necesarios (pico)", `${r.fteNecesariosPico}`, `${fmt(r.volumenPico)} ÷ ${fmt(r.capDiariaFte)}, redondeado hacia arriba`],
    ["Dotación nominal", `${fmt(r.dotacion)}`, "personas cargadas en Datos de entrada"],
    ["Ausentismo", `${Math.round(ausentismo * 100)}%`, "vacaciones, licencias y faltas"],
    ["Dotación efectiva", `${fmt(r.dotacionEfectiva)}`, `${fmt(r.dotacion)} × (1 − ${Math.round(ausentismo * 100)}%) — contra esto se compara`],
    ["Capacidad del equipo / día", uv(capTotal), `${fmt(r.capDiariaFte)} × ${fmt(r.dotacionEfectiva)}`],
  ]
  return (
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{nombre} — {mes} · {estadoTxt}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{fuente}</p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Paso</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>De dónde sale</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {pasos.map(([k, v, d]) => (
            <TableRow key={k}>
              <TableCell className="font-medium">{k}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold">{v}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{d}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2">
            <TableCell className="font-bold">Brecha (promedio)</TableCell>
            <TableCell className={`text-right font-bold ${brechaProm > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {brechaProm > 0 ? `faltan ${fmt(brechaProm)}` : `sobran ${fmt(Math.abs(brechaProm))}`}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">necesarios − dotación efectiva</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-bold">Brecha (pico)</TableCell>
            <TableCell className={`text-right font-bold ${brechaPico > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {brechaPico > 0 ? `faltan ${fmt(brechaPico)}` : `sobran ${fmt(Math.abs(brechaPico))}`}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">necesarios en el pico − dotación efectiva</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <div className="rounded-md border bg-slate-50 p-3 text-sm">
        <p className="mb-1 font-semibold">Chequeo por volumen (sin redondear a personas)</p>
        <p className="text-muted-foreground">
          El equipo mueve <b>{uv(capTotal)}</b> por día. La demanda promedio es <b>{uv(r.volumenProm)}</b> y la del pico <b>{uv(r.volumenPico)}</b>.
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>Día promedio: {deficitProm > 0
            ? <>quedan <b className="text-red-700">{uv(deficitProm)}</b> sin cubrir ≈ <b>{fmt(hhExtra(deficitProm))} hora-hombre extra</b>.</>
            : <><b className="text-emerald-700">cubre</b>, con {uv(capTotal - r.volumenProm)} de holgura.</>}
          </li>
          <li>Día pico: {deficitPico > 0
            ? <>quedan <b className="text-red-700">{uv(deficitPico)}</b> sin cubrir ≈ <b>{fmt(hhExtra(deficitPico))} hora-hombre extra</b>.</>
            : <><b className="text-emerald-700">cubre</b>, con {uv(capTotal - r.volumenPico)} de holgura.</>}
          </li>
        </ul>
      </div>

      <div className="rounded-md border-l-4 border-sky-400 bg-sky-50 p-3 text-sm">
        <p className="mb-1 font-semibold">Qué significa</p>
        {brechaProm > 0 && brechaProm < 1 && alcanzaNominal ? (
          <p>
            <b>No falta gente en el plantel.</b> Con la dotación nominal de <b>{fmt(r.dotacion)}</b> alcanza
            (necesarios {r.fteNecesariosProm}), pero al descontar el ausentismo del {Math.round(ausentismo * 100)}% la
            dotación efectiva baja a <b>{fmt(r.dotacionEfectiva)}</b> y aparece la brecha de <b>{fmt(brechaProm)}</b>.
            {cubrePorVolumen
              ? <> Además, por volumen el equipo cubre la demanda promedio, así que el faltante viene del redondeo a personas enteras.</>
              : <> Traducido: los días en que falta alguien hay que cubrir ~{uv(deficitProm)} con horas extra o reasignando.</>}
            {" "}Es el colchón de ausentismo, no un déficit estructural.
          </p>
        ) : brechaProm > 0 ? (
          <p>
            Faltan <b className="text-red-700">{fmt(brechaProm)}</b> personas incluso en un día promedio: la demanda de{" "}
            <b>{uv(r.volumenProm)}</b> supera lo que mueven {fmt(r.dotacionEfectiva)} personas ({uv(capTotal)}).
            Se cubre con <b>{fmt(hhExtra(deficitProm))} hora-hombre extra por día</b>, con refuerzo, o subiendo la productividad.
          </p>
        ) : brechaPico > 0 ? (
          <p>
            La dotación alcanza en un día promedio pero no en el pico: ahí hacen falta <b>{r.fteNecesariosPico}</b> y hay{" "}
            <b>{fmt(r.dotacionEfectiva)}</b> → <b className="text-amber-700">{fmt(hhExtra(deficitPico))} hora-hombre extra</b> los días fuertes.
          </p>
        ) : (
          <p>
            La dotación efectiva de <b>{fmt(r.dotacionEfectiva)}</b> cubre incluso el día pico (necesarios {r.fteNecesariosPico}).
            Holgura en el pico: <b className="text-emerald-700">{uv(Math.max(0, capTotal - r.volumenPico))}</b>.
          </p>
        )}
      </div>
    </DialogContent>
  )
}

function AlmacenTab({ data, proyLive, escenario, canEdit, run, isPending }: { data: DimData; proyLive: ProyeccionData | null; escenario: PctEscenario; canEdit: boolean; run: RunFn; isPending: boolean }) {
  const a = data.almacen
  const proy = proyLive
  const [c, setC] = useState({
    prod_bul_hh: String(data.config.prod_bul_hh), util_pickeros: String(data.config.util_pickeros), dotacion_almacen: String(data.config.dotacion_almacen),
    prod_clasif_pal_h: String(data.config.prod_clasif_pal_h), util_clasif: String(data.config.util_clasif), dotacion_clasif: String(data.config.dotacion_clasif),
    prod_reempaque_bul_hh: String(data.config.prod_reempaque_bul_hh), util_reempaque: String(data.config.util_reempaque), dotacion_reempaque: String(data.config.dotacion_reempaque),
    prod_pal_h: String(data.config.prod_pal_h), util_maquinistas: String(data.config.util_maquinistas), dotacion_maquinistas: String(data.config.dotacion_maquinistas),
    horas_turno: String(data.config.horas_turno), ausentismo_almacen: String(data.config.ausentismo_almacen),
    peso_lun: String(data.config.peso_lun), peso_mar: String(data.config.peso_mar), peso_mie: String(data.config.peso_mie),
    peso_jue: String(data.config.peso_jue), peso_vie: String(data.config.peso_vie), peso_sab: String(data.config.peso_sab),
  })
  const [recalc, startRecalc] = useTransition()
  const onRecalcProd = () =>
    startRecalc(async () => {
      const res = await recalcularProductividadAlmacen()
      if ("error" in res) { toast.error(res.error); return }
      const p = res.data
      setC((s) => ({ ...s,
        prod_bul_hh: p.picking ? String(p.picking.prod) : s.prod_bul_hh,
        prod_pal_h: p.maquinistas ? String(p.maquinistas.prod) : s.prod_pal_h,
        prod_clasif_pal_h: p.clasif ? String(p.clasif.prod) : s.prod_clasif_pal_h,
        prod_reempaque_bul_hh: p.reempaque ? String(p.reempaque.prod) : s.prod_reempaque_bul_hh,
      }))
      toast.success(`Real del mes — Picking ${p.picking?.prod ?? "s/d"} · Maquinistas ${p.maquinistas?.prod ?? "s/d"} · Clasif ${p.clasif?.prod ?? "s/d"} · Reempaque ${p.reempaque?.prod ?? "s/d"}. Revisá y Guardá.`)
    })
  const guardar = () => run(() => guardarConfigDim({
    ...data.config,
    prod_bul_hh: Number(c.prod_bul_hh), util_pickeros: Number(c.util_pickeros), dotacion_almacen: Number(c.dotacion_almacen),
    prod_clasif_pal_h: Number(c.prod_clasif_pal_h), util_clasif: Number(c.util_clasif), dotacion_clasif: Number(c.dotacion_clasif),
    prod_reempaque_bul_hh: Number(c.prod_reempaque_bul_hh), util_reempaque: Number(c.util_reempaque), dotacion_reempaque: Number(c.dotacion_reempaque),
    prod_pal_h: Number(c.prod_pal_h), util_maquinistas: Number(c.util_maquinistas), dotacion_maquinistas: Number(c.dotacion_maquinistas),
    horas_turno: Number(c.horas_turno), ausentismo_almacen: Number(c.ausentismo_almacen),
    peso_lun: Number(c.peso_lun), peso_mar: Number(c.peso_mar), peso_mie: Number(c.peso_mie),
    peso_jue: Number(c.peso_jue), peso_vie: Number(c.peso_vie), peso_sab: Number(c.peso_sab),
  }), "Datos de almacén guardados")

  const rolesHoy = a ? [
    { n: "Pickeros", r: a.pickeros, u: "bultos", pico: false, hl: false, real: null as number | null,
      fuente: "Demanda: bultos despachados por día (ocupacion_bodega_diaria, líneas de venta de Chess). Productividad: promedio YTD del Árbol del Sueño (deposito-esteban), con override editable." },
    { n: "Clasificadores", r: a.clasificadores, u: "HL", pico: false, hl: true, real: a.clasificadores.prodRealPalHH,
      fuente: "Demanda: HL de cerveza retornable presupuestados para retirar de Quilmes (acarreo-rdf), repartidos uniforme entre los días hábiles del mes — por eso promedio y pico son iguales. Conversión: 6 HL por paleta." },
    { n: "Tareas generales", r: a.reempaque, u: "bultos", pico: false, hl: false, real: null as number | null,
      fuente: "Demanda y productividad: reempaque de deposito-esteban (bultos por día y bultos ÷ horas trabajadas del mes)." },
    { n: "Maquinistas", r: a.maquinistas, u: "pallets", pico: false, hl: false, real: null as number | null,
      fuente: `Demanda: pallets de acarreo descargado (recepcion_acarreos) + carga a distribución (deposito-esteban) × (1 + factor de retorno ${fmt(a.maquinistas.factorRetorno)}). Promedios del mes: ${fmt(a.maquinistas.palAcarreoProm)} pal de acarreo y ${fmt(a.maquinistas.palCargaProm)} pal de carga por día.` },
  ] : []
  // Compara contra la dotación EFECTIVA (descontado el ausentismo).
  const estadoHoy = (r: RolFte) =>
    r.fteNecesariosPico <= r.dotacionEfectiva ? { txt: "Cubre", cls: "text-emerald-700" }
      : r.fteNecesariosProm <= r.dotacionEfectiva ? { txt: "Extras en pico", cls: "text-amber-700" }
        : { txt: `Faltan ${fmt(Math.round((r.fteNecesariosProm - r.dotacionEfectiva) * 10) / 10)}`, cls: "text-red-700 font-semibold" }

  return (
    <div className="space-y-6">
      {/* ════ SECCIÓN 1 — DATOS DE ENTRADA ════ */}
      {canEdit && (
        <Card className="border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">1 · Datos de entrada</CardTitle>
            <Button size="sm" variant="outline" disabled={recalc} onClick={onRecalcProd}>
              {recalc ? "Calculando…" : "↻ Traer productividad real (deposito-esteban)"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Rol</TableHead><TableHead>Dotación</TableHead><TableHead>Productividad</TableHead><TableHead>Utilización (0–1)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {PARAM_ROLES.map((pr) => (
                  <TableRow key={pr.n}>
                    <TableCell className="font-medium">{pr.n}</TableCell>
                    <TableCell><Input type="number" step="1" className="h-8 w-20" value={c[pr.dot]} onChange={(e) => setC((s) => ({ ...s, [pr.dot]: e.target.value }))} /></TableCell>
                    <TableCell className="flex items-center gap-1"><Input type="number" step={pr.stepProd} className="h-8 w-24" value={c[pr.prod]} onChange={(e) => setC((s) => ({ ...s, [pr.prod]: e.target.value }))} /><span className="text-xs text-muted-foreground">{pr.u}</span></TableCell>
                    <TableCell><Input type="number" step="0.025" className="h-8 w-20" value={c[pr.util]} onChange={(e) => setC((s) => ({ ...s, [pr.util]: e.target.value }))} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-end gap-3">
              <div><Label className="text-xs">Horas / turno</Label><Input type="number" step="0.1" className="h-8 w-20" value={c.horas_turno} onChange={(e) => setC((s) => ({ ...s, horas_turno: e.target.value }))} /></div>
              <div><Label className="text-xs">Ausentismo (0–1)</Label><Input type="number" step="0.01" className="h-8 w-20" value={c.ausentismo_almacen} onChange={(e) => setC((s) => ({ ...s, ausentismo_almacen: e.target.value }))} /></div>
              <span className="self-center text-xs font-medium text-muted-foreground">Peso de volumen por día:</span>
              {([["peso_lun", "Lun"], ["peso_mar", "Mar"], ["peso_mie", "Mié"], ["peso_jue", "Jue"], ["peso_vie", "Vie"], ["peso_sab", "Sáb"]] as const).map(([k, l]) => (
                <div key={k}><Label className="text-xs">{l}</Label><Input type="number" step="0.05" className="h-8 w-16" value={c[k]} onChange={(e) => setC((s) => ({ ...s, [k]: e.target.value }))} /></div>
              ))}
              <Button size="sm" disabled={isPending} onClick={guardar}>Guardar</Button>
            </div>
            {proy && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Volumen proyectado (HL/mes) — del presupuesto anual + escenario</p>
                <VolumenProyectadoTable proy={proy} saved={data.proyeccion} escenario={escenario} canEdit={canEdit} run={run} isPending={isPending} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Productividad y volumen vienen vinculados: «↻ Traer productividad real» toma el promedio del mes de <b>deposito-esteban</b> (picking/maquinistas/reempaque) y de la tabla de clasificación de <b>dpo-app</b>; el volumen sale del <b>presupuesto anual</b>. Todo es editable como override. Utilización por defecto 0,875 (7 h efectivas sobre 8). <b>Ausentismo</b> = fracción de la dotación que en promedio no está (vacaciones, licencias, faltas); la dotación efectiva = dotación × (1 − ausentismo) es la que se compara contra la demanda. Tras recalcular, revisá y tocá <b>Guardar</b>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ════ SECCIÓN 2 — RESULTADOS ════ */}
      {data.almacenError && <p className="text-sm text-red-600">Error: {data.almacenError}</p>}
      {!a && !data.almacenError && <p className="text-sm text-muted-foreground">Sin datos de volumen este mes.</p>}

      {a && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">2 · Resultado — dotación vs demanda ({a.mes})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Rol</TableHead><TableHead className="text-right">Dotación</TableHead><TableHead className="text-right">Prod.</TableHead>
                <TableHead className="text-right">Util.</TableHead><TableHead className="text-right">Cap/día</TableHead>
                <TableHead className="text-right">Vol/día</TableHead><TableHead className="text-right">Necesarios</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rolesHoy.map(({ n, r, u, pico, hl, real, fuente }) => {
                  const e = estadoHoy(r)
                  const unidadProd = hl ? "HL/HH" : (u === "paletas" || u === "pallets") ? "pal/HH" : "bul/HH"
                  const paletas = (v: number) => fmt(Math.round(v / 6)) // 6 HL/paleta retornable
                  const capTotal = Math.round(r.capDiariaFte * r.dotacionEfectiva)
                  const vol = pico ? r.volumenPico : r.volumenProm
                  return (
                    <TableRow key={n}>
                      <TableCell className="font-medium">{n}</TableCell>
                      <TableCell className="text-right">{fmt(r.dotacion)}{r.dotacionEfectiva < r.dotacion ? <span className="block text-[10px] text-muted-foreground">ef. {fmt(r.dotacionEfectiva)}</span> : null}</TableCell>
                      <TableCell className="text-right">
                        {fmt(r.productividad)} {unidadProd}
                        {hl && real != null && (
                          <span className="block text-xs text-muted-foreground">real {a!.mes.slice(5)}: {fmt(real)} pal/HH</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{Math.round(r.utilizacion * 100)}%</TableCell>
                      <TableCell className="text-right">
                        {fmt(capTotal)} {u}
                        {hl && <span className="text-xs text-muted-foreground"> ({paletas(capTotal)} pal)</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(vol)} {hl ? "HL" : ""}
                        {hl
                          ? <span className="text-xs text-muted-foreground"> ({paletas(vol)} pal/día)</span>
                          : <span className="text-xs text-muted-foreground"> (pico {fmt(r.volumenPico)})</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{r.fteNecesariosProm}{r.fteNecesariosPico > r.fteNecesariosProm ? ` (pico ${r.fteNecesariosPico})` : ""}</TableCell>
                      <TableCell className="p-0">
                        <Dialog>
                          <DialogTrigger className={`block w-full cursor-pointer px-3 py-2 text-left underline decoration-dotted underline-offset-4 hover:brightness-95 ${e.cls}`}>
                            {e.txt} <span className="text-[10px] font-normal text-muted-foreground">¿por qué?</span>
                          </DialogTrigger>
                          <DetalleHoyAlmacenModal nombre={n} r={r} mes={a!.mes} unidad={u} esHL={hl} horasTurno={data.config.horas_turno} ausentismo={data.config.ausentismo_almacen} fuente={fuente} />
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Cap/día = dotación <b>efectiva</b> (descontado el ausentismo) × productividad × horas/turno × utilización. Clasificadores: la demanda son los HL de cerveza retornable presupuestados para retirar de Quilmes (acarreo-rdf) repartidos entre los días hábiles del mes; se convierten a paletas con 6 HL/paleta. Productividad = estándar de junio (4,35 pal/HH ≈ 26 HL/HH). «Cubre» = alcanza incluso en el pico · «Extras en pico» = alcanza en promedio, el pico requiere horas extra · «Faltan N» = no alcanza ni en promedio. <b>Tocá el estado</b> para ver el cálculo paso a paso, la fuente de cada dato y qué significa la brecha.</p>
          </CardContent>
        </Card>
      )}

      {proy && proy.almacen.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Proyección a diciembre — horas extra por mes (dotación fija)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Rol</TableHead>{proy.meses.map((m) => (<TableHead key={m.mes} className="text-right">{mesLabel(m.mes)}</TableHead>))}</TableRow></TableHeader>
              <TableBody>
                {proy.almacen.map((r) => (
                  <TableRow key={r.rol}>
                    <TableCell className="font-medium">{r.rol}</TableCell>
                    {r.horasExtra.map((hh, i) => {
                      const falta = r.faltanPico[i]
                      const cls = hh > 0 ? (falta > 0 ? "bg-red-50 text-red-700 font-semibold" : "bg-amber-50 text-amber-700") : "text-emerald-700"
                      return (
                        <TableCell key={i} className="p-0">
                          <Dialog>
                            <DialogTrigger className={`block w-full cursor-pointer px-3 py-2 text-right hover:brightness-95 ${cls}`}>
                              {hh > 0 ? `${fmt(hh)} h` : "✓"}
                              {falta > 0 ? <span className="block text-[10px] font-normal">falta {falta}</span> : null}
                            </DialogTrigger>
                            <DetalleCeldaModal rol={r} mes={proy.meses[i]} pesos={proy.pesos} horasExtraMes={hh} volDiaMes={r.volPicoDia[i]} />
                          </Dialog>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Hora-hombre extra estimadas cuando el volumen del día (volumen del presupuesto repartido por el peso del día de semana) supera la capacidad de la dotación fija. «falta N» = personas que faltarían en el día pico para no hacer horas extra. <span className="text-emerald-700">✓</span> = cubre sin extras. <b>Tocá cualquier celda</b> para ver el desglose por día de ese mes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const MES_ABBR = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const mesLabel = (s: string) => MES_ABBR[Number(s.split("-")[1])] ?? s

// Volumen proyectado (HL/mes) del presupuesto + % de ajuste de escenario editable por mes.
// Los % viven en el estado compartido (escenario) → la proyección de flota/almacén de la
// página se recalcula EN VIVO mientras se tipea; «Guardar escenario» solo lo persiste.
function VolumenProyectadoTable({ proy, saved, escenario, canEdit, run, isPending }: {
  proy: ProyeccionData; saved: ProyeccionData | null; escenario: PctEscenario; canEdit: boolean; run: RunFn; isPending: boolean
}) {
  // El mes base también es ajustable: su escenario recalibra el índice de TODOS los meses.
  const { pct, setPct } = escenario
  const pctDe = (mes: string) => Number(pct[mes]) || 0
  const todos = [{ mes: proy.mesBase, hlPresupuesto: proy.hlBasePresupuesto }, ...proy.meses]
  const savedPct = new Map<string, number>(saved ? [[saved.mesBase, saved.ajusteBasePct], ...saved.meses.map((m): [string, number] => [m.mes, m.ajustePct])] : [])
  const hayAjuste = todos.some((m) => pctDe(m.mes) !== 0)
  const sinGuardar = todos.some((m) => pctDe(m.mes) !== (savedPct.get(m.mes) ?? 0))
  const guardar = () => run(() => guardarAjustesVolumen(todos.map((m) => ({
    anio: Number(m.mes.split("-")[0]), mes: Number(m.mes.split("-")[1]), ajustePct: pctDe(m.mes),
  }))), "Escenario de volumen guardado")
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Mes</TableHead><TableHead className="text-right">{mesLabel(proy.mesBase)} (base)</TableHead>
          {proy.meses.map((m) => (<TableHead key={m.mes} className="text-right">{mesLabel(m.mes)}</TableHead>))}
        </TableRow></TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">HL presupuesto</TableCell>
            {todos.map((m) => (<TableCell key={m.mes} className="text-right">{fmt(Math.round(m.hlPresupuesto))}</TableCell>))}
          </TableRow>
          {canEdit && (
            <TableRow>
              <TableCell className="font-medium">Ajuste escenario (%)</TableCell>
              {todos.map((m) => (
                <TableCell key={m.mes} className="text-right">
                  <Input type="number" step="1" className="h-8 w-16 text-right" value={pct[m.mes] ?? "0"}
                    onChange={(e) => setPct((s) => ({ ...s, [m.mes]: e.target.value }))} />
                </TableCell>
              ))}
            </TableRow>
          )}
          {hayAjuste && (
            <TableRow>
              <TableCell className="font-medium">HL escenario</TableCell>
              {todos.map((m) => (
                <TableCell key={m.mes} className={`text-right ${pctDe(m.mes) !== 0 ? "font-semibold text-sky-700" : ""}`}>
                  {fmt(Math.round(m.hlPresupuesto * (1 + pctDe(m.mes) / 100)))}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={isPending} onClick={guardar}>Guardar escenario</Button>
          {sinGuardar && <span className="text-xs text-amber-600">La proyección ya refleja estos % — guardá para fijarlos (si recargás sin guardar, vuelve a lo guardado).</span>}
          <p className="w-full text-xs text-muted-foreground">
            Escenario de volumen: cargá un % de aumento (o de baja, con signo −) sobre el HL del presupuesto en cualquier mes, incluido el base. <b>La proyección de flota y almacén se recalcula al instante mientras tipeás</b> (también en la otra solapa); «Guardar escenario» lo persiste para todos. Ojo: ajustar el <b>mes base</b> recalibra el índice de todos los meses (sube el base → bajan los índices futuros, y viceversa).
          </p>
        </div>
      )}
    </div>
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
        {activo ? <Badge className="bg-emerald-500 hover:bg-emerald-500">Operativa</Badge> : <Badge variant="secondary">Inactiva</Badge>}
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
