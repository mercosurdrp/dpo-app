"use client"

/**
 * Cuadro anual del dimensionamiento — una sola tabla con los 12 meses del año:
 *   · meses CERRADOS con datos reales (histórico: cierres de ruteo, ocupación de
 *     bodega, carga, acarreo, fichadas), calculados con la estructura de hoy;
 *   · el mes EN CURSO (lo que muestra cada solapa);
 *   · los meses que VIENEN con la proyección (presupuesto × escenario).
 * Misma lectura que la planilla de Casa Central (Resumen): volumen por escenario,
 * necesarios vs dotación → sobran / temporales, y horas extra reales vs
 * dimensionadas vs presupuestadas por sector. Es la evidencia de R2.3.1 (volumen
 * real vs presupuesto), R2.3.2 (alerta por falta y por exceso) y R2.3.5.
 */

import { Fragment } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { DimData, ProyeccionData, HistoricoRol } from "@/actions/dimensionamiento"
import { diasHabilesDelMes } from "@/lib/dimensionamiento/retornable"
const money = (v: number) => `$${Math.round(v).toLocaleString("es-AR")}`

const MES_ABBR = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const fmt = (v: number) => v.toLocaleString("es-AR")
const fmt1 = (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 1 })
const pct = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? (a - b) / b : null)
const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)} %`)

type Tipo = "cerrado" | "actual" | "futuro" | "sin_dato"

interface Col {
  m: number
  key: string
  tipo: Tipo
  pi: number // índice en proy.meses (0 = mes en curso), −1 si no está
}

const ROLES = [
  { k: "pickeros", n: "Pickeros", proy: "Pickeros" },
  { k: "clasificadores", n: "Clasificadores", proy: "Clasificadores" },
  { k: "reempaque", n: "Tareas generales (puesto fijo)", proy: "Tareas grales (reempaque)" },
  { k: "maquinistas", n: "Maquinistas", proy: "Maquinistas" },
] as const

export function CuadroAnualCard({ data, proy }: { data: DimData; proy: ProyeccionData | null }) {
  const anio = Number((proy?.mesBase ?? data.metricas?.mes ?? new Date().toISOString().slice(0, 7)).slice(0, 4))
  const cols: Col[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const key = `${anio}-${String(m).padStart(2, "0")}`
    const pi = proy ? proy.meses.findIndex((x) => x.mes === key) : -1
    const hist = data.historico.find((h) => h.mes === key)
    const tipo: Tipo = hist ? "cerrado" : pi === 0 ? "actual" : pi > 0 ? "futuro" : "sin_dato"
    return { m, key, tipo, pi }
  })
  const histDe = (c: Col) => data.historico.find((h) => h.mes === c.key)
  const esc = (m: number) => data.escenarios.find((e) => e.mes === m)
  const hx = (m: number) => data.horasExtra.find((h) => h.mes === m)
  const flotaRol = (rol: string) => proy?.flota.find((r) => r.rol === rol)
  const almRol = (rol: string) => proy?.almacen.find((r) => r.rol === rol)
  const umbral = data.config.umbral_ocupacion_ociosa
  const pctDist = proy?.pctDistribuido ?? data.config.pct_distribuido

  const colCls = (c: Col) => (c.tipo === "actual" ? "bg-sky-50" : c.tipo === "futuro" ? "text-slate-500" : "")
  const dash = <span className="text-muted-foreground">—</span>
  // meses cerrados sin cierres de ruteo (antes del 23/05/2026): flota estimada desde HL distribuidos
  const flotaEstimada = (c: Col) => c.tipo === "cerrado" && Boolean(histDe(c)?.flota?.estimado)
  const est = (c: Col, v: React.ReactNode) => (flotaEstimada(c) ? <span title="Estimado desde HL distribuidos (sin cierres de ruteo)">≈{v}</span> : v)

  // ── celdas ──
  const ocupacion = (c: Col): number | null => {
    if (c.tipo === "cerrado") return histDe(c)?.flota?.ocupacionPromedio ?? null
    if (c.tipo === "actual") return data.metricas?.ocupacionPromedio ?? null
    if (c.tipo === "futuro" && proy) return Math.round((proy.ocupacionMes[c.pi] ?? 0) * 1000) / 10
    return null
  }
  const camiones = (c: Col): { prom: number; pico: number } | null => {
    if (c.tipo === "cerrado") { const f = histDe(c)?.flota; return f ? { prom: f.camionesNecesariosPromedio, pico: f.camionesNecesariosPico } : null }
    if (c.tipo === "actual" && data.metricas) return { prom: data.metricas.camionesNecesariosPromedio, pico: data.metricas.camionesNecesariosPico }
    const r = flotaRol("Camiones")
    if (c.pi >= 0 && r) return { prom: r.necesariosPromDia?.[c.pi] ?? r.necesariosProm?.[c.pi] ?? 0, pico: r.picoNecesario[c.pi] ?? 0 }
    return null
  }
  const diasRefuerzo = (c: Col): number | null => {
    if (c.tipo === "cerrado") return histDe(c)?.flota ? histDe(c)!.diasRefuerzoFlota : null
    const r = flotaRol("Camiones")
    return c.pi >= 0 && r ? r.diasRefuerzo[c.pi] ?? 0 : null
  }
  const diasFlotaCompleta = (c: Col): number => { const r = flotaRol("Camiones"); return c.pi >= 0 && r ? r.diasFlotaCompleta?.[c.pi] ?? 0 : 0 }
  const tripulacion = (c: Col, rol: "Choferes" | "Ayudantes"): { nec: number; dot: number } | null => {
    const porCamion = rol === "Choferes" ? data.config.choferes_por_camion : data.config.ayudantes_por_camion
    const plantel = rol === "Choferes" ? data.config.dotacion_choferes : data.config.dotacion_ayudantes
    if (c.tipo === "cerrado") {
      const h = histDe(c)
      if (!h?.flota) return null
      const obs = rol === "Choferes" ? h.repartoObs?.choferes : h.repartoObs?.ayudantes
      return { nec: Math.ceil(h.flota.camionesNecesariosPico * porCamion), dot: plantel > 0 ? plantel : Math.round(obs ?? 0) }
    }
    if (c.tipo === "actual" && data.reparto) {
      const r = rol === "Choferes" ? data.reparto.choferes : data.reparto.ayudantes
      return { nec: r.fteNecesariosPico, dot: Math.round(r.dotacionProm) }
    }
    const r = flotaRol(rol)
    if (c.pi >= 0 && r) return { nec: r.necesariosProm?.[c.pi] ?? 0, dot: r.dotacion }
    return null
  }
  const almacen = (c: Col, rol: (typeof ROLES)[number]): { nec: number; dot: number; sobran: number; temporales: number } | null => {
    if (c.tipo === "cerrado") {
      const h: HistoricoRol | null | undefined = histDe(c)?.almacen[rol.k]
      const r = almRol(rol.proy)
      return h ? { nec: h.necesariosProm, dot: r?.dotacion ?? 0, sobran: h.sobran, temporales: h.temporales } : null
    }
    const r = almRol(rol.proy)
    if (c.pi >= 0 && r) return { nec: r.necesariosProm?.[c.pi] ?? 0, dot: r.dotacion, sobran: r.sobran?.[c.pi] ?? 0, temporales: r.temporales?.[c.pi] ?? 0 }
    return null
  }
  // Detalle de un rol de almacén en un mes: qué representan en horas-hombre los que faltan (o sobran).
  const detalleAlmacen = (c: Col, rol: (typeof ROLES)[number]) => {
    const v = almacen(c, rol)
    if (!v) return null
    const r = almRol(rol.proy)
    const h: HistoricoRol | null | undefined = c.tipo === "cerrado" ? histDe(c)?.almacen[rol.k] : undefined
    const hhExtra = h ? h.horasExtra : c.pi >= 0 && r ? r.horasExtra[c.pi] ?? 0 : 0
    const dias = diasHabilesDelMes(anio, c.m)
    const horasTurno = data.config.horas_turno
    // brecha en horas-hombre del mes: personas que faltan (o sobran) × horas de turno × días hábiles
    const brechaHh = Math.round((v.nec - v.dot) * horasTurno * dias * 10) / 10
    const tarifa = proy?.costoHh.find((x) => x.mes === c.m)?.almacen ?? 0
    const volProm = h ? h.volumenProm : c.pi >= 0 && r ? Math.round(r.volPromBase * (proy?.meses[c.pi]?.indice ?? 1) * 10) / 10 + (r.volFijo ?? 0) : null
    const unidad = r?.unidadVol ?? ""
    const capPersona = r?.capPersona ?? 0
    return { v, hhExtra, dias, horasTurno, brechaHh, tarifa, volProm, unidad, capPersona }
  }
  const DetalleAlmacenModal = ({ c, rol }: { c: Col; rol: (typeof ROLES)[number] }) => {
    const d = detalleAlmacen(c, rol)
    if (!d) return null
    const faltan = d.v.temporales > 0
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{rol.n} — {MES_ABBR[c.m]} {anio}{c.tipo === "cerrado" ? " (real)" : c.tipo === "actual" ? " (en curso)" : " (proyección)"}</DialogTitle></DialogHeader>
        <Table>
          <TableBody>
            <TableRow><TableCell className="font-medium">Demanda promedio por día</TableCell><TableCell className="text-right">{d.volProm == null ? "—" : `${fmt1(d.volProm)} ${d.unidad}`}</TableCell></TableRow>
            <TableRow><TableCell className="font-medium">Capacidad por persona y día</TableCell><TableCell className="text-right">{d.capPersona > 0 ? `${fmt1(d.capPersona)} ${d.unidad}` : "—"}</TableCell></TableRow>
            <TableRow><TableCell className="font-medium">Necesarios (con ausentismo)</TableCell><TableCell className="text-right font-semibold">{fmt1(d.v.nec)}</TableCell></TableRow>
            <TableRow><TableCell className="font-medium">Dotación</TableCell><TableCell className="text-right">{fmt1(d.v.dot)}</TableCell></TableRow>
            <TableRow className="border-t-2">
              <TableCell className="font-bold">{faltan ? "Faltan" : "Sobran"}</TableCell>
              <TableCell className={`text-right font-bold ${faltan ? "text-red-700" : ""}`}>{fmt1(faltan ? d.v.temporales : d.v.sobran)} personas</TableCell>
            </TableRow>
            {faltan && (
              <>
                <TableRow>
                  <TableCell className="font-bold">En horas-hombre del mes</TableCell>
                  <TableCell className="text-right font-bold text-red-700">{fmt1(Math.abs(d.brechaHh))} h</TableCell>
                </TableRow>
                <TableRow className="text-xs text-muted-foreground"><TableCell colSpan={2}>{fmt1(d.v.temporales)} personas × {fmt1(d.horasTurno)} h de turno × {d.dias} días hábiles</TableCell></TableRow>
              </>
            )}
            {rol.k !== "reempaque" && <TableRow className="border-t-2"><TableCell className="font-medium">Horas extra que pide el modelo</TableCell><TableCell className="text-right font-semibold">{fmt1(d.hhExtra)} h</TableCell></TableRow>}
            {rol.k !== "reempaque" && d.tarifa > 0 && (
              <TableRow><TableCell className="font-medium">Costo de esas horas extra</TableCell><TableCell className="text-right font-semibold">{money(d.hhExtra * d.tarifa)}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          {rol.k === "reempaque" ? <>Puesto fijo: 1 persona con tareas que no dependen del volumen; lo que no hace un día lo hace al otro, así que no genera horas extra (ni por volumen ni los sábados) ni cuenta como sobrante. Los «necesarios» son sólo la parte del día que ocupa el reempaque. </> : null}
          {faltan
            ? <>Faltan {fmt1(d.v.temporales)} personas en el día promedio: cubrirlo con la dotación actual son <b>{fmt1(Math.abs(d.brechaHh))} horas-hombre</b> en el mes (o un temporal). Las «horas extra que pide el modelo» son las que salen día por día cuando la demanda supera la capacidad; pueden ser menos que la brecha mensual porque los días flojos compensan.</>
            : <>La dotación cubre el día promedio{d.v.sobran > 0 ? <> con {fmt1(d.v.sobran)} personas de sobra</> : null}: no hace falta cubrir nada con horas. Las horas extra que quedan, si las hay, son las del pico de algunos días y las de los sábados.</>}
        </p>
      </DialogContent>
    )
  }
  // horas extra dimensionadas: histórico (server) para cerrados; proyección EN VIVO para el resto
  const dimHh = (c: Col): { alm: number } | null => {
    if (c.tipo === "cerrado") { const h = hx(c.m); return h && h.dimAlmacen != null ? { alm: h.dimAlmacen } : null }
    if (c.pi >= 0 && proy) return { alm: Math.round(proy.almacen.reduce((s, r) => s + (r.horasExtra[c.pi] ?? 0), 0) * 10) / 10 }
    return null
  }

  const th = (c: Col) => (
    <TableHead key={c.key} className={`min-w-[72px] text-right ${c.tipo === "actual" ? "bg-sky-50" : ""}`}>
      {MES_ABBR[c.m]}
      <span className="block text-[10px] font-normal text-muted-foreground">{c.tipo === "cerrado" ? "real" : c.tipo === "actual" ? "en curso" : c.tipo === "futuro" ? "proy." : ""}</span>
    </TableHead>
  )
  const grupo = (titulo: string) => (
    <TableRow className="bg-slate-100">
      <TableCell colSpan={13} className="py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">{titulo}</TableCell>
    </TableRow>
  )
  const fila = (label: React.ReactNode, cell: (c: Col) => React.ReactNode, sub = false) => (
    <TableRow>
      <TableCell className={`whitespace-nowrap ${sub ? "pl-6 text-xs text-muted-foreground" : "text-sm font-medium"}`}>{label}</TableCell>
      {cols.map((c) => (<TableCell key={c.key} className={`text-right text-xs ${colCls(c)}`}>{cell(c)}</TableCell>))}
    </TableRow>
  )
  const camDisp = proy?.camionesDisp ?? data.unidadesDisponibles

  // sobran / temporales con color: sobran en azul (ocioso) cuando nec/dot < umbral
  const necDot = (v: { nec: number; dot: number; sobran?: number; temporales?: number } | null, entero = false) => {
    if (!v) return dash
    const f = entero ? fmt : fmt1
    const sobran = v.sobran ?? Math.max(0, v.dot - v.nec)
    const temporales = v.temporales ?? Math.max(0, v.nec - v.dot)
    const ocioso = v.dot > 0 && v.nec > 0 && v.nec / v.dot < umbral
    return (
      <>
        <span className={temporales > 0 ? "font-semibold text-red-700" : ""}>{f(v.nec)}</span> / {f(v.dot)}
        {temporales > 0
          ? <span className="block text-[10px] font-semibold text-red-700">faltan {f(temporales)}</span>
          : sobran > 0
            ? <span className={`block text-[10px] ${ocioso ? "font-semibold text-sky-700" : "text-muted-foreground"}`}>sobran {f(sobran)}</span>
            : null}
      </>
    )
  }
  const hhCell = (real: number | null | undefined, dim: number | null | undefined, ppto: number | null | undefined, k: "real" | "dim" | "ppto") => {
    const v = k === "real" ? real : k === "dim" ? dim : ppto
    if (v == null) return dash
    const ref = ppto ?? null
    const excede = ref != null && ref > 0 && k !== "ppto" && v > ref
    return <span className={excede ? "font-semibold text-red-700" : ""}>{fmt1(v)} h</span>
  }

  const cerrados = cols.filter((c) => c.tipo === "cerrado" && esc(c.m)?.real != null && esc(c.m)?.aDistribuir != null)
  const ytdReal = cerrados.reduce((s, c) => s + (esc(c.m)?.real ?? 0), 0)
  const ytdPpto = cerrados.reduce((s, c) => s + (esc(c.m)?.forecastDistribuir ?? esc(c.m)?.aDistribuir ?? 0), 0)
  const desvio = pct(ytdReal, ytdPpto)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cuadro anual {anio} — volumen, dotación y horas extra por mes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="min-w-[190px]"></TableHead>{cols.map(th)}</TableRow></TableHeader>
            <TableBody>
              {grupo("Volumen (HL / mes)")}
              {fila("Presupuesto (venta facturada)", (c) => { const v = esc(c.m)?.presupuesto; return v == null ? dash : fmt(v) })}
              {fila(<>Presupuesto a distribuir <span className="text-xs font-normal text-muted-foreground">(× {Math.round(pctDist * 100)} %)</span></>, (c) => { const e = esc(c.m); const hl = c.pi >= 0 && proy ? proy.meses[c.pi].hl : e?.forecast ?? e?.presupuesto; return hl == null ? dash : <span className={e?.presupuesto != null && Math.round(hl) !== e.presupuesto ? "font-semibold text-sky-700" : "font-semibold"}>{fmt(Math.round(hl * pctDist))}</span> })}
              {fila("Forecast (escenario)", (c) => { const e = esc(c.m); const v = c.pi >= 0 && proy ? Math.round(proy.meses[c.pi].hl) : e?.forecast; return v == null ? dash : <span className={e?.presupuesto != null && v !== e.presupuesto ? "font-semibold text-sky-700" : ""}>{fmt(v)}</span> }, true)}
              {fila(<b>Vendido real (facturado neto)</b>, (c) => { const e = esc(c.m); return e?.vendido == null ? dash : <b>{fmt(e.vendido)}{e.parcial ? "*" : ""}</b> })}
              {fila("Vendido vs presupuesto", (c) => { const e = esc(c.m); if (!e || e.parcial) return dash; const v = pct(e.vendido, e.presupuesto); return <span className={v != null && v < -0.1 ? "text-red-700" : v != null && v > 0.1 ? "text-sky-700" : ""}>{fmtPct(v)}</span> }, true)}
              {fila(<b>Distribuido con flota propia</b>, (c) => { const e = esc(c.m); return e?.real == null ? dash : <b>{fmt(e.real)}{e.parcial ? "*" : ""}</b> })}
              {fila("Distribuido vs presupuesto a distribuir", (c) => { const e = esc(c.m); if (!e || e.parcial) return dash; const v = pct(e.real, e.forecastDistribuir ?? e.aDistribuir); return <span className={v != null && v < -0.1 ? "text-red-700" : v != null && v > 0.1 ? "text-sky-700" : ""}>{fmtPct(v)}</span> }, true)}
              {fila("% distribuido real (÷ vendido)", (c) => { const e = esc(c.m); if (!e || e.parcial || e.pctReal == null) return dash; return <span className={Math.abs(e.pctReal - pctDist) > 0.05 ? "font-semibold text-amber-700" : ""}>{Math.round(e.pctReal * 100)} %</span> }, true)}
              {fila("Distribuido vs año anterior", (c) => { const e = esc(c.m); if (!e || e.parcial) return dash; return fmtPct(pct(e.real, e.aa)) }, true)}

              {grupo(`Flota / entrega (${camDisp} camiones · capacidad ${fmt(proy?.capacidadInstalada ?? Math.round(data.capacidadInstaladaDiaria))} CEq/día)`)}
              {fila("Ocupación de flota", (c) => { const v = ocupacion(c); return v == null ? dash : est(c, <span className={v < umbral * 100 ? "font-semibold text-sky-700" : ""}>{Math.round(v)} %</span>) })}
              {fila("Camiones necesarios (día pico)", (c) => { const v = camiones(c); return v ? est(c, <><span className={v.pico > camDisp ? "font-semibold text-red-700" : v.pico === camDisp ? "font-semibold text-amber-700" : "font-semibold"}>{v.pico}</span>{v.pico > camDisp ? <span className="block text-[10px] font-semibold text-red-700">faltan {v.pico - camDisp}</span> : v.pico === camDisp ? <span className="block text-[10px] font-semibold text-amber-700">toda la flota</span> : null}<span className="block text-[10px] font-normal text-muted-foreground">prom. {v.prom}</span></>) : dash })}
              {fila("Días con refuerzo o 2ª vuelta", (c) => { const v = diasRefuerzo(c); if (v == null) return dash; const fc = diasFlotaCompleta(c); return est(c, v > 0 ? <span className="font-semibold text-amber-700">{v}</span> : fc > 0 ? <span className="font-semibold text-amber-700" title="Días en que se necesita toda la flota">{fc} con los {camDisp}</span> : "✓") })}
              {fila("Choferes (nec. / dotación)", (c) => est(c, necDot(tripulacion(c, "Choferes"), true)))}
              {fila("Ayudantes (nec. / dotación)", (c) => est(c, necDot(tripulacion(c, "Ayudantes"), true)))}

              {grupo("Almacén (necesarios con ausentismo / dotación)")}
              {ROLES.map((rol) => (
                <Fragment key={rol.k}>{fila(rol.n, (c) => {
                  const v = almacen(c, rol)
                  if (!v) return dash
                  // clic → pop-up con lo que representan en horas-hombre los que faltan (o sobran)
                  return (
                    <Dialog>
                      <DialogTrigger className={`w-full cursor-pointer text-right underline decoration-dotted underline-offset-4 hover:brightness-95 ${v.temporales > 0 ? "rounded bg-red-50 px-1" : ""}`} title="Ver en horas-hombre">
                        {necDot(v)}
                      </DialogTrigger>
                      <DetalleAlmacenModal c={c} rol={rol} />
                    </Dialog>
                  )
                })}</Fragment>
              ))}

              {grupo("Horas extra — almacén")}
              {fila("Reales", (c) => hhCell(hx(c.m)?.realAlmacen, dimHh(c)?.alm, hx(c.m)?.pptoAlmacen, "real"))}
              {fila("Dimensionadas (modelo)", (c) => hhCell(hx(c.m)?.realAlmacen, dimHh(c)?.alm, hx(c.m)?.pptoAlmacen, "dim"))}
              {fila("Presupuestadas", (c) => hhCell(hx(c.m)?.realAlmacen, dimHh(c)?.alm, hx(c.m)?.pptoAlmacen, "ppto"))}

            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Columnas <b>real</b> = meses cerrados calculados con los datos del mes (cierres de ruteo, bultos despachados del depósito, carga y acarreo, fichadas) y la estructura de hoy; en flota, los meses anteriores a los cierres de ruteo (desde el 23/05/2026) van con <b>≈</b>: CEq estimados desde los HL distribuidos por día × la relación CEq/HL medida en los días que tienen ambas fuentes, con la dotación de reparto observada en los registros de vehículos; <b>en curso</b> = lo que muestran las solapas; <b>proy.</b> = presupuesto × escenario sobre el volumen real actual. * = mes incompleto.
          <b>Presupuesto a distribuir</b> = presupuesto (o forecast) × {Math.round(pctDist * 100)} %: el presupuesto es venta facturada y el depósito y la flota mueven esa fracción; sobre ese volumen se dimensiona la proyección. <b>Vendido real</b> = HL facturados netos (Chess + mostrador − notas de crédito), la misma cuenta que el VLC/HL del Sueño y que el Presupuesto. <b>Distribuido con flota propia</b> = HL que salieron a reparto con nuestros camiones (Chess + GESCOM sin patentes, la base de Períodos Críticos): se compara con el presupuesto a distribuir y con el año anterior; «% distribuido real» = distribuido ÷ vendido, en ámbar cuando se aleja más de 5 puntos del {Math.round(pctDist * 100)} % (para recalibrar el parámetro). «nec. / dotación» = en flota, necesarios del <b>día pico</b> (la flota no se promedia: el día pico tiene que salir igual); en almacén, necesarios del día promedio ÷ (1 − ausentismo); ambos contra la dotación nominal; <span className="text-red-700">faltan</span> = temporales requeridos, <span className="text-sky-700">sobran</span> en azul = ocupación por debajo del {Math.round(umbral * 100)} % (capacidad ociosa).
          Horas extra: reales de almacén = deposito-esteban (indicador DPO #39); dimensionadas de almacén = excedente por volumen de lunes a viernes más la regla de sábado (todos entran a las 7, el turno normal termina a las {data.config.sabado_fin_normal} h y la operación cierra a las {data.config.sabado_fin_alta} h en temporada alta y {data.config.sabado_fin_baja} h en baja); dimensionadas = lo que pide el modelo; presupuestadas = «Q Horas Extras» del EERR cargado en Costo/HL. En rojo cuando superan el presupuesto. Flota / Entrega se dimensiona sólo en camiones y personas: sus horas extra no entran en el modelo.
          {desvio != null && Math.abs(desvio) >= 0.1 ? <> <b className={desvio < 0 ? "text-red-700" : "text-sky-700"}>Lo distribuido en los meses cerrados va {fmtPct(desvio)} contra el presupuesto a distribuir</b>: si el desvío se mantiene, cargalo como escenario en los meses que faltan o revisá el % que se distribuye.</> : null}
        </p>
      </CardContent>
    </Card>
  )
}
