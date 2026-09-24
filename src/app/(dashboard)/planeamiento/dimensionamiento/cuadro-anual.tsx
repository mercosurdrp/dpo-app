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
import type { DimData, ProyeccionData, HistoricoRol } from "@/actions/dimensionamiento"

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
  { k: "reempaque", n: "Tareas generales", proy: "Tareas grales (reempaque)" },
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
    if (c.pi >= 0 && r) return { prom: r.necesariosProm?.[c.pi] ?? 0, pico: r.picoNecesario[c.pi] ?? 0 }
    return null
  }
  const diasRefuerzo = (c: Col): number | null => {
    if (c.tipo === "cerrado") return histDe(c)?.flota ? histDe(c)!.diasRefuerzoFlota : null
    const r = flotaRol("Camiones")
    return c.pi >= 0 && r ? r.diasRefuerzo[c.pi] ?? 0 : null
  }
  const tripulacion = (c: Col, rol: "Choferes" | "Ayudantes"): { nec: number; dot: number } | null => {
    const porCamion = rol === "Choferes" ? data.config.choferes_por_camion : data.config.ayudantes_por_camion
    const plantel = rol === "Choferes" ? data.config.dotacion_choferes : data.config.dotacion_ayudantes
    if (c.tipo === "cerrado") {
      const h = histDe(c)
      if (!h?.flota) return null
      const obs = rol === "Choferes" ? h.repartoObs?.choferes : h.repartoObs?.ayudantes
      return { nec: Math.ceil(h.flota.camionesNecesariosPromedio * porCamion), dot: plantel > 0 ? plantel : Math.round(obs ?? 0) }
    }
    if (c.tipo === "actual" && data.reparto) {
      const r = rol === "Choferes" ? data.reparto.choferes : data.reparto.ayudantes
      return { nec: r.fteNecesariosProm, dot: Math.round(r.dotacionProm) }
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
  // horas extra dimensionadas: histórico (server) para cerrados; proyección EN VIVO para el resto
  const dimHh = (c: Col): { alm: number; dis: number } | null => {
    if (c.tipo === "cerrado") { const h = hx(c.m); return h && h.dimAlmacen != null ? { alm: h.dimAlmacen, dis: h.dimDistribucion ?? 0 } : null }
    if (c.pi >= 0 && proy) {
      const alm = proy.almacen.reduce((s, r) => s + (r.horasExtra[c.pi] ?? 0), 0)
      const dis = proy.flota.filter((r) => r.rol !== "Camiones").reduce((s, r) => s + (r.personaDias?.[c.pi] ?? 0), 0) * proy.horasVueltaExtra
      return { alm: Math.round(alm * 10) / 10, dis: Math.round(dis * 10) / 10 }
    }
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
              {fila("Distribuido año anterior", (c) => { const v = esc(c.m)?.aa; return v == null ? dash : fmt(v) })}
              {fila("Distribuido vs año anterior", (c) => { const e = esc(c.m); if (!e || e.parcial) return dash; return fmtPct(pct(e.real, e.aa)) }, true)}

              {grupo(`Flota / entrega (${camDisp} camiones · capacidad ${fmt(proy?.capacidadInstalada ?? Math.round(data.capacidadInstaladaDiaria))} CEq/día)`)}
              {fila("Ocupación de flota", (c) => { const v = ocupacion(c); return v == null ? dash : <span className={v < umbral * 100 ? "font-semibold text-sky-700" : ""}>{Math.round(v)} %</span> })}
              {fila("Camiones necesarios (prom / pico)", (c) => { const v = camiones(c); return v ? <><span>{v.prom}</span> / <span className={v.pico > camDisp ? "font-semibold text-red-700" : ""}>{v.pico}</span></> : dash })}
              {fila("Días con refuerzo o 2ª vuelta", (c) => { const v = diasRefuerzo(c); return v == null ? dash : v > 0 ? <span className="font-semibold text-amber-700">{v}</span> : "✓" })}
              {fila("Choferes (nec. / dotación)", (c) => necDot(tripulacion(c, "Choferes"), true))}
              {fila("Ayudantes (nec. / dotación)", (c) => necDot(tripulacion(c, "Ayudantes"), true))}

              {grupo("Almacén (necesarios con ausentismo / dotación)")}
              {ROLES.map((rol) => (
                <Fragment key={rol.k}>{fila(rol.n, (c) => necDot(almacen(c, rol)))}</Fragment>
              ))}

              {grupo("Horas extra — almacén")}
              {fila("Reales", (c) => hhCell(hx(c.m)?.realAlmacen, dimHh(c)?.alm, hx(c.m)?.pptoAlmacen, "real"))}
              {fila("Dimensionadas (modelo)", (c) => hhCell(hx(c.m)?.realAlmacen, dimHh(c)?.alm, hx(c.m)?.pptoAlmacen, "dim"))}
              {fila("de las cuales sábados (regla)", (c) => { const v = c.tipo === "cerrado" ? hx(c.m)?.dimSabadoAlmacen : c.pi >= 0 && proy ? proy.almacen.reduce((s, r) => s + (r.horasSabado?.[c.pi] ?? 0), 0) : null; return v == null ? dash : `${fmt1(v)} h` }, true)}
              {fila("Presupuestadas", (c) => hhCell(hx(c.m)?.realAlmacen, dimHh(c)?.alm, hx(c.m)?.pptoAlmacen, "ppto"))}

              {grupo("Horas extra — distribución")}
              {fila("Reales (fichadas)", (c) => hhCell(hx(c.m)?.realDistribucion, dimHh(c)?.dis, hx(c.m)?.pptoDistribucion, "real"))}
              {fila("Dimensionadas (modelo)", (c) => hhCell(hx(c.m)?.realDistribucion, dimHh(c)?.dis, hx(c.m)?.pptoDistribucion, "dim"))}
              {fila("Presupuestadas", (c) => hhCell(hx(c.m)?.realDistribucion, dimHh(c)?.dis, hx(c.m)?.pptoDistribucion, "ppto"))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Columnas <b>real</b> = meses cerrados calculados con los datos del mes (cierres de ruteo, bultos despachados del depósito, carga y acarreo, fichadas) y la estructura de hoy; <b>en curso</b> = lo que muestran las solapas; <b>proy.</b> = presupuesto × escenario sobre el volumen real actual. * = mes incompleto.
          <b>Presupuesto a distribuir</b> = presupuesto (o forecast) × {Math.round(pctDist * 100)} %: el presupuesto es venta facturada y el depósito y la flota mueven esa fracción; sobre ese volumen se dimensiona la proyección. <b>Vendido real</b> = HL facturados netos (Chess + mostrador − notas de crédito), la misma cuenta que el VLC/HL del Sueño y que el Presupuesto. <b>Distribuido con flota propia</b> = HL que salieron a reparto con nuestros camiones (Chess + GESCOM sin patentes, la base de Períodos Críticos): se compara con el presupuesto a distribuir y con el año anterior; «% distribuido real» = distribuido ÷ vendido, en ámbar cuando se aleja más de 5 puntos del {Math.round(pctDist * 100)} % (para recalibrar el parámetro). «nec. / dotación» = necesarios en el día promedio (almacén: ÷ (1 − ausentismo)) contra la dotación nominal; <span className="text-red-700">faltan</span> = temporales requeridos, <span className="text-sky-700">sobran</span> en azul = ocupación por debajo del {Math.round(umbral * 100)} % (capacidad ociosa).
          Horas extra: reales de almacén = deposito-esteban (indicador DPO #39); dimensionadas de almacén = excedente por volumen de lunes a viernes más la regla de sábado (todos entran a las 7, el turno normal termina a las {data.config.sabado_fin_normal} h y la operación cierra a las {data.config.sabado_fin_alta} h en temporada alta y {data.config.sabado_fin_baja} h en baja); reales de distribución = fichadas del sector con la regla de pago (50 % lun-vie, 100 % sáb); dimensionadas = lo que pide el modelo; presupuestadas = «Q Horas Extras» del EERR cargado en Costo/HL. En rojo cuando superan el presupuesto.
          {desvio != null && Math.abs(desvio) >= 0.1 ? <> <b className={desvio < 0 ? "text-red-700" : "text-sky-700"}>Lo distribuido en los meses cerrados va {fmtPct(desvio)} contra el presupuesto a distribuir</b>: si el desvío se mantiene, cargalo como escenario en los meses que faltan o revisá el % que se distribuye.</> : null}
        </p>
      </CardContent>
    </Card>
  )
}
