"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Truck, CalendarDays, TableIcon, AlertTriangle, CalendarRange } from "lucide-react"

export type MesProyectado = { mes: number; hl: number }
export type DiaReal = { fecha: string; hl: number; clientes: number; rechazo: number; ausentismo: number }
export type Feriado = { fecha: string; nombre: string }

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
const MES_CORTO = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

// Bandas de criticidad sobre la capacidad diaria (criterio Jefatura de
// Logística): PICO arriba de 120%, MEDIA entre 100% y 120%, BAJA debajo.
type Nivel = "PICO" | "MEDIA" | "SERVICIO" | "BAJA"
function nivelDe(hl: number, cap: number): Nivel {
  if (cap <= 0) return "BAJA"
  if (hl > cap * 1.2) return "PICO"
  if (hl >= cap) return "MEDIA"
  return "BAJA"
}
const COLOR: Record<Nivel, string> = {
  PICO: "bg-red-600 text-white",
  MEDIA: "bg-amber-400 text-amber-950",
  // Día que no exigió a la flota pero falló el servicio. El manual pide
  // mirarlos: "revise los casos en que OTIF fue bajo".
  SERVICIO: "bg-violet-500 text-white",
  BAJA: "bg-emerald-500/80 text-white",
}

const n0 = (v: number) => Math.round(v).toLocaleString("es-AR")
const pct = (v: number) => (v * 100).toFixed(0) + "%"

/** Días hábiles del mes: sin domingos y sin feriados. */
function diasHabiles(anio: number, mes: number, feriados: Set<string>): string[] {
  const out: string[] = []
  const ultimo = new Date(anio, mes, 0).getDate()
  for (let d = 1; d <= ultimo; d++) {
    const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (new Date(anio, mes - 1, d).getDay() === 0) continue
    if (feriados.has(iso)) continue
    out.push(iso)
  }
  return out
}

export function DiasPicoClient({
  anio, anioBase, proyectado, real, base, feriados,
}: {
  anio: number
  anioBase: number
  proyectado: MesProyectado[]
  real: DiaReal[]
  base: DiaReal[]
  feriados: Feriado[]
}) {
  // Parámetros de capacidad. Viven acá y no en la base: esto es un banco de
  // pruebas, la idea es poder mover los números y ver qué pasa.
  const [camiones, setCamiones] = useState(10)
  const [hlCamion, setHlCamion] = useState(72)
  const [ocupacion, setOcupacion] = useState(100)
  // Target de rechazo, el mismo umbral que usa el módulo de Períodos Críticos.
  const [rechazoMax, setRechazoMax] = useState(3)
  // "flota"  = techo físico fijo, igual todo el año (camiones × HL × ocupación).
  // "mensual"= referencia relativa: el promedio diario del presupuesto de cada
  //            mes. No mide flota, mide concentración dentro del propio mes, y
  //            por eso cambia mes a mes siguiendo la estacionalidad.
  const [modo, setModo] = useState<"flota" | "mensual">("flota")
  // Cómo se reparte el presupuesto del mes entre sus días, siempre con datos
  // del año anterior:
  //   "anual"    → índice de día de semana de TODO el año base. Estable: cada
  //                día de semana tiene ~50 observaciones detrás.
  //   "dow"      → mismo día de semana pero calculado dentro de ese mes. Fiel
  //                al mes, pero con 4-5 observaciones por día es ruidoso.
  //   "posicion" → día hábil N del año base presta su peso al día hábil N.
  //                Copia la forma exacta del mes, incluidos los días raros.
  const [reparto, setReparto] = useState<"anual" | "dow" | "posicion">("anual")
  // Qué año se está mirando. El período crítico se DEFINE con el año base:
  // lo realmente facturado contra la capacidad. El año en curso es la
  // proyección, que sirve para planificar pero no para definir.
  const [vista, setVista] = useState<"base" | "actual">("base")

  const capFlota = camiones * hlCamion * (ocupacion / 100)
  const setFer = useMemo(() => new Set(feriados.map((f) => f.fecha)), [feriados])
  const pptoPorMes = useMemo(
    () => Object.fromEntries(proyectado.map((p) => [p.mes, p.hl])) as Record<number, number>,
    [proyectado],
  )
  const realPorFecha = useMemo(
    () => Object.fromEntries(real.map((d) => [d.fecha, d.hl])) as Record<string, number>,
    [real],
  )
  const cliPorFecha = useMemo(
    () => Object.fromEntries(real.map((d) => [d.fecha, d.clientes])) as Record<string, number>,
    [real],
  )
  // Clientes del año anterior por mes y posición ordinal: sirven de referencia
  // para los días que todavía no pasaron. No hay presupuesto de clientes, así
  // que no se escala — se muestra tal cual atendimos ese día el año pasado.
  const cliBase = useMemo(() => {
    const out: Record<number, number[]> = {}
    for (const d of base) {
      if (new Date(d.fecha + "T12:00:00").getDay() === 0) continue
      ;(out[Number(d.fecha.slice(5, 7))] ??= []).push(d.clientes)
    }
    return out
  }, [base])

  // Peso de cada día hábil dentro de su mes, tomado del año anterior. Se aplica
  // por posición ordinal: el día hábil N de diciembre 2025 le presta su peso al
  // día hábil N de diciembre 2026.
  const pesosBase = useMemo(() => {
    const porMes: Record<number, number[]> = {}
    for (const d of base) {
      if (new Date(d.fecha + "T12:00:00").getDay() === 0) continue
      const m = Number(d.fecha.slice(5, 7))
      ;(porMes[m] ??= []).push(d.hl)
    }
    const out: Record<number, number[]> = {}
    for (const [m, arr] of Object.entries(porMes)) {
      const total = arr.reduce((a, b) => a + b, 0)
      out[Number(m)] = total > 0 ? arr.map((v) => v / total) : arr.map(() => 1 / arr.length)
    }
    return out
  }, [base])

  // Peso promedio de cada día de semana dentro de cada mes del año base.
  const pesosDow = useMemo(() => {
    const acc: Record<number, Record<number, number[]>> = {}
    for (const d of base) {
      const dt = new Date(d.fecha + "T12:00:00")
      if (dt.getDay() === 0) continue
      const m = Number(d.fecha.slice(5, 7))
      ;((acc[m] ??= {})[dt.getDay()] ??= []).push(d.hl)
    }
    const out: Record<number, Record<number, number>> = {}
    for (const [m, porDow] of Object.entries(acc)) {
      out[Number(m)] = {}
      for (const [dow, arr] of Object.entries(porDow)) {
        out[Number(m)][Number(dow)] = arr.reduce((a, b) => a + b, 0) / arr.length
      }
    }
    return out
  }, [base])

  const basePorFecha = useMemo(
    () => Object.fromEntries(base.map((d) => [d.fecha, d])) as Record<string, DiaReal>,
    [base],
  )
  const realPorFechaFull = useMemo(
    () => Object.fromEntries(real.map((d) => [d.fecha, d])) as Record<string, DiaReal>,
    [real],
  )

  // Índice de día de semana sobre el año base completo. 1,00 = día promedio.
  const indiceAnual = useMemo(() => {
    const porDow: Record<number, number[]> = {}
    for (const d of base) {
      const dow = new Date(d.fecha + "T12:00:00").getDay()
      if (dow === 0) continue
      ;(porDow[dow] ??= []).push(d.hl)
    }
    const medias: Record<number, number> = {}
    for (const [dow, arr] of Object.entries(porDow)) {
      medias[Number(dow)] = arr.reduce((a, b) => a + b, 0) / arr.length
    }
    const vals = Object.values(medias)
    const gral = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1
    const out: Record<number, number> = {}
    for (const [dow, media] of Object.entries(medias)) out[Number(dow)] = media / (gral || 1)
    return out
  }, [base])

  // Capacidad de referencia de cada mes, según el modo elegido.
  const capPorMes = useMemo(() => {
    const out: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) {
      const habiles = diasHabiles(anio, m, setFer).length
      out[m] = modo === "flota"
        ? capFlota
        : habiles > 0 ? (pptoPorMes[m] ?? 0) / habiles : 0
    }
    return out
  }, [anio, setFer, modo, capFlota, pptoPorMes])

  // Detalle diario del año: proyección y real, cada uno con su nivel.
  const dias = useMemo(() => {
    const out: {
      fecha: string; mes: number; dow: number; cap: number
      hlProy: number; hlReal: number | null
      cliRef: number | null; cliReal: number | null
      rechazo: number | null; ausentismo: number | null
      nivelProy: Nivel; nivelReal: Nivel | null
    }[] = []
    for (let m = 1; m <= 12; m++) {
      const fechas = diasHabiles(anio, m, setFer)
      const w = pesosBase[m] ?? []
      const wd = pesosDow[m] ?? {}
      const pesos = fechas.map((f, i) => {
        if (reparto === "anual") {
          return indiceAnual[new Date(f + "T12:00:00").getDay()] ?? 1
        }
        if (reparto === "dow") {
          const dow = new Date(f + "T12:00:00").getDay()
          return wd[dow] ?? 1
        }
        return w.length ? w[Math.min(i, w.length - 1)] : 1 / fechas.length
      })
      const suma = pesos.reduce((a, b) => a + b, 0) || 1
      const ppto = pptoPorMes[m] ?? 0
      const capMes = capPorMes[m] ?? 0
      const cb = cliBase[m] ?? []
      fechas.forEach((f, i) => {
        const hlProy = (ppto * pesos[i]) / suma
        const hlReal = realPorFecha[f] ?? null
        const rr = realPorFechaFull[f]
        const cliReal = cliPorFecha[f] ?? null
        const cliRef = cb.length ? cb[Math.min(i, cb.length - 1)] : null
        out.push({
          fecha: f, mes: m, dow: new Date(f + "T12:00:00").getDay(), cap: capMes,
          hlProy, hlReal, cliRef, cliReal,
          rechazo: rr ? rr.rechazo : null, ausentismo: rr ? rr.ausentismo : null,
          nivelProy: nivelDe(hlProy, capMes),
          nivelReal: hlReal == null ? null : nivelDe(hlReal, capMes),
        })
      })
    }
    return out
  }, [anio, setFer, pesosBase, pesosDow, indiceAnual, reparto, pptoPorMes, realPorFecha, realPorFechaFull, cliPorFecha, cliBase, capPorMes])

  // Días del AÑO BASE: acá el nivel sale de lo realmente facturado contra la
  // capacidad. Es lo que define el período crítico (R3.4.1 pide el año anterior).
  const diasBase = useMemo(() => {
    const out: {
      fecha: string; mes: number; dow: number; cap: number
      hl: number; clientes: number; rechazo: number; ausentismo: number
      nivel: Nivel
    }[] = []
    for (let m = 1; m <= 12; m++) {
      const ultimo = new Date(anioBase, m, 0).getDate()
      const capMes = capPorMes[m] ?? 0
      for (let d = 1; d <= ultimo; d++) {
        const iso = `${anioBase}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
        const dt = new Date(anioBase, m - 1, d)
        if (dt.getDay() === 0) continue
        const r = basePorFecha[iso]
        if (!r) continue
        out.push({
          fecha: iso, mes: m, dow: dt.getDay(), cap: capMes,
          hl: r.hl, clientes: r.clientes, rechazo: r.rechazo, ausentismo: r.ausentismo,
          // Piso de volumen para el criterio de servicio: sin él, un día de
          // 6 HL con 2 clientes da 7% de rechazo y entraría como crítico.
          // El piso es el 50% de la capacidad, igual que `vol_medio`.
          nivel:
            nivelDe(r.hl, capMes) !== "BAJA"
              ? nivelDe(r.hl, capMes)
              : r.rechazo >= rechazoMax / 100 && r.hl >= capMes * 0.5
                ? "SERVICIO"
                : "BAJA",
        })
      }
    }
    return out
  }, [anioBase, basePorFecha, capPorMes, rechazoMax])

  // Resumen mes a mes: capacidad instalada contra presupuesto y contra real.
  const resumen = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const delMes = dias.filter((d) => d.mes === m)
      const conReal = delMes.filter((d) => d.hlReal != null)
      const capMes = (capPorMes[m] ?? 0) * delMes.length
      const ppto = pptoPorMes[m] ?? 0
      const realMes = conReal.reduce((a, b) => a + (b.hlReal ?? 0), 0)
      return {
        mes: m, habiles: delMes.length, capMes, ppto, realMes,
        tieneReal: conReal.length > 0,
        diasRealMedia: conReal.filter((d) => d.nivelReal === "MEDIA").length,
        diasRealPico: conReal.filter((d) => d.nivelReal === "PICO").length,
        diasProyMedia: delMes.filter((d) => d.nivelProy === "MEDIA").length,
        diasProyPico: delMes.filter((d) => d.nivelProy === "PICO").length,
      }
    })
  }, [dias, capPorMes, pptoPorMes])

  const totalCap = resumen.reduce((a, b) => a + b.capMes, 0)
  const totalPpto = resumen.reduce((a, b) => a + b.ppto, 0)
  const picosProy = dias.filter((d) => d.nivelProy !== "BAJA")
  const picosReal = dias.filter((d) => d.nivelReal && d.nivelReal !== "BAJA")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Días Pico por capacidad · {anio}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Banco de pruebas del enfoque <b>forward</b>: el presupuesto del mes se reparte por día
          con el peso de {anioBase} y se compara contra la capacidad de distribución. Está
          separado de <b>Períodos Críticos</b>, que es el módulo que se audita y usa detección
          retrospectiva por triggers.
        </p>
      </div>

      {/* Qué año se mira */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <button type="button" onClick={() => setVista("base")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${vista === "base" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {anioBase} facturado — define el período crítico
        </button>
        <button type="button" onClick={() => setVista("actual")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${vista === "actual" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {anio} programado — para planificar
        </button>
        <span className="text-xs text-slate-500">
          {vista === "base"
            ? `El día es crítico cuando lo facturado en ${anioBase} alcanzó la capacidad. Clientes, rechazo y ausentismo van al lado como contexto.`
            : `Presupuesto ${anio} repartido por día. Sirve para anticipar, no para definir el período crítico.`}
        </span>
      </div>

      {/* Parámetros de capacidad */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4 text-slate-500" /> Capacidad de distribución
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setModo("flota")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${modo === "flota" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              Capacidad de flota (techo fijo)
            </button>
            <button type="button" onClick={() => setModo("mensual")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${modo === "mensual" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              Promedio del mes (relativo)
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-600">Reparto del presupuesto:</span>
            <button type="button" onClick={() => setReparto("anual")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${reparto === "anual" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              Índice anual
            </button>
            <button type="button" onClick={() => setReparto("dow")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${reparto === "dow" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              Día de semana por mes
            </button>
            <button type="button" onClick={() => setReparto("posicion")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${reparto === "posicion" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              Por posición en el mes
            </button>
            <span className="text-xs text-slate-500">
              {reparto === "anual"
                ? `Índice de día de semana sobre todo ${anioBase}: ${[1, 2, 3, 4, 5, 6].map((d) => `${DOW[d]} ${(indiceAnual[d] ?? 1).toFixed(2)}`).join(" · ")}`
                : reparto === "dow"
                  ? `Mismo día de semana pero calculado dentro de cada mes de ${anioBase}. Más fiel al mes, más ruidoso: hay 4 o 5 observaciones por día.`
                  : `El día hábil N de ${anioBase} le presta su peso al día hábil N. Copia la forma exacta del mes, arrastrando también sus días atípicos.`}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {modo === "flota"
              ? "Techo físico igual todo el año: lo que la flota puede repartir en una vuelta."
              : "Referencia distinta cada mes: el promedio diario del presupuesto de ese mes. Mide concentración dentro del mes —qué días se salen de lo normal para ese mes— y no la flota, así que siempre encuentra días pico, incluso en los meses flojos."}
          </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className={`w-28 ${modo === "mensual" ? "opacity-40" : ""}`}>
            <Label className="text-xs text-slate-500">Camiones</Label>
            <Input type="number" min={1} value={camiones} className="h-8"
              onChange={(e) => setCamiones(Math.max(1, Number(e.target.value) || 0))} />
          </div>
          <div className={`w-28 ${modo === "mensual" ? "opacity-40" : ""}`}>
            <Label className="text-xs text-slate-500">HL por camión</Label>
            <Input type="number" min={1} value={hlCamion} className="h-8"
              onChange={(e) => setHlCamion(Math.max(1, Number(e.target.value) || 0))} />
          </div>
          <div className={`w-32 ${modo === "mensual" ? "opacity-40" : ""}`}>
            <Label className="text-xs text-slate-500">Ocupación de bodega %</Label>
            <Input type="number" min={1} max={100} value={ocupacion} className="h-8"
              onChange={(e) => setOcupacion(Math.min(100, Math.max(1, Number(e.target.value) || 0)))} />
          </div>
          <div className="w-28">
            <Label className="text-xs text-slate-500">Rechazo target %</Label>
            <Input type="number" min={0} step={0.5} value={rechazoMax} className="h-8"
              onChange={(e) => setRechazoMax(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
            <div className="text-xs text-slate-500">
              {modo === "flota" ? "Capacidad diaria" : "Referencia (varía por mes)"}
            </div>
            <div className="text-lg font-bold text-slate-900">
              {modo === "flota"
                ? `${n0(capFlota)} HL`
                : `${n0(Math.min(...Object.values(capPorMes)))} – ${n0(Math.max(...Object.values(capPorMes)))} HL`}
            </div>
          </div>
          <div className="text-xs text-slate-600">
            <div><b>PICO</b> &gt; 120% de la referencia</div>
            <div><b>MEDIA</b> 100–120%</div>
            <div><b>BAJA</b> &lt; 100%</div>
            <div className="mt-1 border-t border-slate-200 pt-1">
              <b>SERVICIO</b>: rechazo ≥ {rechazoMax}% con al menos 50% de capacidad
            </div>
          </div>
        </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="mes">
        <TabsList>
          <TabsTrigger value="mes" className="gap-1"><TableIcon className="size-4" />Mes a mes</TabsTrigger>
          <TabsTrigger value="dias" className="gap-1"><CalendarDays className="size-4" />Días pico</TabsTrigger>
          <TabsTrigger value="cal" className="gap-1"><CalendarRange className="size-4" />Calendario</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="mt-3">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Mes</th>
                    <th className="p-2 text-right">Días hábiles</th>
                    <th className="p-2 text-right">Capacidad mes</th>
                    <th className="p-2 text-right">Proyectado</th>
                    <th className="p-2 text-right">% cap.</th>
                    <th className="p-2 text-right">Real {anio}</th>
                    <th className="p-2 text-right">% cap.</th>
                    <th className="p-2 text-right">Real vs proy.</th>
                    <th className="p-2 text-center">Días ≥100% (real)</th>
                    <th className="p-2 text-center">Días &gt;120% (real)</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((r) => {
                    const usoProy = r.capMes > 0 ? r.ppto / r.capMes : 0
                    const usoReal = r.capMes > 0 ? r.realMes / r.capMes : 0
                    return (
                      <tr key={r.mes} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-800">{MESES[r.mes]}</td>
                        <td className="p-2 text-right tabular-nums">{r.habiles}</td>
                        <td className="p-2 text-right tabular-nums text-slate-500">{n0(r.capMes)}</td>
                        <td className="p-2 text-right tabular-nums">{n0(r.ppto)}</td>
                        <td className={`p-2 text-right tabular-nums font-semibold ${usoProy > 1 ? "text-red-700" : "text-slate-700"}`}>
                          {pct(usoProy)}
                        </td>
                        <td className="p-2 text-right tabular-nums">{r.tieneReal ? n0(r.realMes) : "—"}</td>
                        <td className={`p-2 text-right tabular-nums font-semibold ${usoReal > 1 ? "text-red-700" : "text-slate-700"}`}>
                          {r.tieneReal ? pct(usoReal) : "—"}
                        </td>
                        <td className={`p-2 text-right tabular-nums ${r.tieneReal && r.realMes > r.ppto ? "text-red-700 font-semibold" : "text-slate-500"}`}>
                          {r.tieneReal && r.ppto > 0 ? pct(r.realMes / r.ppto) : "—"}
                        </td>
                        <td className="p-2 text-center tabular-nums">{r.tieneReal ? r.diasRealMedia + r.diasRealPico : "—"}</td>
                        <td className="p-2 text-center tabular-nums font-semibold text-red-700">{r.tieneReal ? r.diasRealPico : "—"}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td className="p-2">Total</td>
                    <td className="p-2 text-right tabular-nums">{resumen.reduce((a, b) => a + b.habiles, 0)}</td>
                    <td className="p-2 text-right tabular-nums">{n0(totalCap)}</td>
                    <td className="p-2 text-right tabular-nums">{n0(totalPpto)}</td>
                    <td className="p-2 text-right tabular-nums">{pct(totalCap > 0 ? totalPpto / totalCap : 0)}</td>
                    <td className="p-2 text-right tabular-nums">{n0(resumen.reduce((a, b) => a + b.realMes, 0))}</td>
                    <td colSpan={4} />
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="mt-2 text-xs text-slate-500">
            &ldquo;Real vs proy.&rdquo; arriba de 100% significa que se facturó más de lo
            presupuestado: el desvío del presupuesto se traslada directo a la exigencia de flota.
          </p>
        </TabsContent>

        <TabsContent value="dias" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Proyectados ≥100%: <b className="ml-1">{picosProy.length}</b></Badge>
            <Badge variant="outline">Reales ≥100%: <b className="ml-1">{picosReal.length}</b></Badge>
          </div>
          {picosProy.length === 0 && picosReal.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="size-4 shrink-0" />
              Con esta capacidad ningún día llega al 100%. Bajá los camiones o la ocupación.
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Día</th>
                    <th className="p-2 text-right">Proyectado</th>
                    <th className="p-2 text-center">Nivel proy.</th>
                    <th className="p-2 text-right">Real</th>
                    <th className="p-2 text-center">Nivel real</th>
                  </tr>
                </thead>
                <tbody>
                  {dias
                    .filter((d) => d.nivelProy !== "BAJA" || (d.nivelReal && d.nivelReal !== "BAJA"))
                    .map((d) => (
                      <tr key={d.fecha} className="border-t border-slate-100">
                        <td className="p-2 tabular-nums text-slate-800">{d.fecha}</td>
                        <td className="p-2 text-slate-500">{DOW[d.dow]} · {MES_CORTO[d.mes]}</td>
                        <td className="p-2 text-right tabular-nums">{n0(d.hlProy)}</td>
                        <td className="p-2 text-center">
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COLOR[d.nivelProy]}`}>
                            {d.nivelProy} · {pct(d.cap > 0 ? d.hlProy / d.cap : 0)}
                          </span>
                        </td>
                        <td className="p-2 text-right tabular-nums">{d.hlReal != null ? n0(d.hlReal) : "—"}</td>
                        <td className="p-2 text-center">
                          {d.nivelReal ? (
                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COLOR[d.nivelReal]}`}>
                              {d.nivelReal} · {pct(d.cap > 0 ? (d.hlReal ?? 0) / d.cap : 0)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cal" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="font-medium">Referencia:</span>
            <span className="flex items-center gap-1"><i className="inline-block size-3 rounded bg-red-600" /> PICO &gt;120%</span>
            <span className="flex items-center gap-1"><i className="inline-block size-3 rounded bg-amber-400" /> MEDIA 100–120%</span>
            <span className="flex items-center gap-1"><i className="inline-block size-3 rounded bg-violet-500" /> SERVICIO</span>
            <span className="flex items-center gap-1"><i className="inline-block size-3 rounded bg-emerald-500/80" /> BAJA</span>
            <span className="text-slate-500">
              {vista === "base"
                ? "Cada celda: HL facturado, clientes, rechazo y ausentismo de ese día."
                : "Cada celda: proyectado, real, clientes y capacidad. Con ~ el dato es del día equivalente del año anterior."}
            </span>
          </div>
          <div className="grid gap-3 2xl:grid-cols-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) =>
              vista === "base" ? (
                <MesGrillaBase key={m} anio={anioBase} mes={m} dias={diasBase} />
              ) : (
                <MesGrilla key={m} anio={anio} mes={m} dias={dias} />
              ),
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}


/**
 * Grilla mensual estilo Excel. Cada día muestra las tres cifras rotuladas:
 *   Proy = presupuesto del mes repartido por el peso del año anterior
 *   Real = lo efectivamente facturado ese día (— si todavía no pasó)
 *   Cap  = capacidad de referencia del día, y el % que se usa de ella
 * La capacidad es la misma todo el mes, así que va también en el encabezado.
 */
function MesGrilla({
  anio, mes, dias,
}: {
  anio: number
  mes: number
  dias: { fecha: string; mes: number; dow: number; cap: number; hlProy: number; hlReal: number | null; cliRef: number | null; cliReal: number | null; nivelProy: Nivel; nivelReal: Nivel | null }[]
}) {
  const delMes = dias.filter((d) => d.mes === mes)
  const porDia = new Map(delMes.map((d) => [Number(d.fecha.slice(8, 10)), d]))
  const ultimo = new Date(anio, mes, 0).getDate()
  const offset = new Date(anio, mes - 1, 1).getDay() // 0 = domingo
  const capMes = delMes[0]?.cap ?? 0

  const celdas: (number | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= ultimo; d++) celdas.push(d)
  while (celdas.length % 7 !== 0) celdas.push(null)

  const picos = delMes.filter((d) => (d.nivelReal ?? d.nivelProy) === "PICO").length
  const medias = delMes.filter((d) => (d.nivelReal ?? d.nivelProy) === "MEDIA").length

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-2">
        <CardTitle className="text-sm font-semibold">{MESES[mes]}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Capacidad <b className="text-slate-700">{n0(capMes)} HL/día</b>
          </span>
          {medias > 0 && (
            <Badge className="bg-amber-400 text-[10px] text-amber-950 hover:bg-amber-400">{medias} media</Badge>
          )}
          {picos > 0 && (
            <Badge className="bg-red-600 text-[10px] text-white hover:bg-red-600">{picos} pico</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-1 text-center">
          {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
            <div key={i} className="pb-1 text-[11px] font-medium text-slate-400">{d}</div>
          ))}
          {celdas.map((num, i) => {
            if (num == null) return <div key={i} />
            const d = porDia.get(num)
            if (!d) {
              return (
                <div key={i} className="rounded border border-slate-100 bg-slate-50 p-1 text-[11px] text-slate-300">
                  {num}
                </div>
              )
            }
            const niv = d.nivelReal ?? d.nivelProy
            const usado = d.hlReal ?? d.hlProy
            return (
              <div key={i} className={`rounded p-1 text-left leading-tight ${COLOR[niv]}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold opacity-90">{num}</span>
                  <span className="text-[10px] font-semibold opacity-90">
                    {d.cap > 0 ? pct(usado / d.cap) : "—"}
                  </span>
                </div>
                <div className="mt-0.5 space-y-0.5 text-[10px]">
                  <div className="flex justify-between gap-1">
                    <span className="opacity-70">Proy</span>
                    <span className="font-semibold tabular-nums">{n0(d.hlProy)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="opacity-70">Real</span>
                    <span className="font-semibold tabular-nums">
                      {d.hlReal != null ? n0(d.hlReal) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="opacity-70">Cli</span>
                    <span className="font-semibold tabular-nums">
                      {d.cliReal != null && d.cliReal > 0
                        ? n0(d.cliReal)
                        : d.cliRef != null && d.cliRef > 0
                          ? `~${n0(d.cliRef)}`
                          : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1 border-t border-white/25 pt-0.5">
                    <span className="opacity-70">Cap</span>
                    <span className="tabular-nums opacity-80">{n0(d.cap)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Grilla del AÑO BASE. Acá el color sale de lo realmente facturado contra la
 * capacidad —es lo que define el período crítico— y las otras tres variables
 * que pide R3.4.1 (clientes, rechazo, ausentismo) van como contexto del día.
 */
function MesGrillaBase({
  anio, mes, dias,
}: {
  anio: number
  mes: number
  dias: { fecha: string; mes: number; dow: number; cap: number; hl: number; clientes: number; rechazo: number; ausentismo: number; nivel: Nivel }[]
}) {
  const delMes = dias.filter((d) => d.mes === mes)
  const porDia = new Map(delMes.map((d) => [Number(d.fecha.slice(8, 10)), d]))
  const ultimo = new Date(anio, mes, 0).getDate()
  const offset = new Date(anio, mes - 1, 1).getDay()
  const capMes = delMes[0]?.cap ?? 0

  const celdas: (number | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= ultimo; d++) celdas.push(d)
  while (celdas.length % 7 !== 0) celdas.push(null)

  const picos = delMes.filter((d) => d.nivel === "PICO").length
  const medias = delMes.filter((d) => d.nivel === "MEDIA").length
  const servicio = delMes.filter((d) => d.nivel === "SERVICIO").length

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-2">
        <CardTitle className="text-sm font-semibold">{MESES[mes]} {anio}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Capacidad <b className="text-slate-700">{n0(capMes)} HL/día</b>
          </span>
          {servicio > 0 && (
            <Badge className="bg-violet-500 text-[10px] text-white hover:bg-violet-500">{servicio} servicio</Badge>
          )}
          {medias > 0 && (
            <Badge className="bg-amber-400 text-[10px] text-amber-950 hover:bg-amber-400">{medias} media</Badge>
          )}
          {picos > 0 && (
            <Badge className="bg-red-600 text-[10px] text-white hover:bg-red-600">{picos} pico</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-1 text-center">
          {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
            <div key={i} className="pb-1 text-[11px] font-medium text-slate-400">{d}</div>
          ))}
          {celdas.map((num, i) => {
            if (num == null) return <div key={i} />
            const d = porDia.get(num)
            if (!d) {
              return (
                <div key={i} className="rounded border border-slate-100 bg-slate-50 p-1 text-[11px] text-slate-300">
                  {num}
                </div>
              )
            }
            return (
              <div key={i} className={`rounded p-1 text-left leading-tight ${COLOR[d.nivel]}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold opacity-90">{num}</span>
                  <span className="text-[10px] font-semibold opacity-90">
                    {d.cap > 0 ? pct(d.hl / d.cap) : "—"}
                  </span>
                </div>
                <div className="mt-0.5 space-y-0.5 text-[10px]">
                  <div className="flex justify-between gap-1">
                    <span className="opacity-70">HL</span>
                    <span className="font-semibold tabular-nums">{n0(d.hl)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="opacity-70">Cli</span>
                    <span className="font-semibold tabular-nums">{d.clientes > 0 ? n0(d.clientes) : "—"}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="opacity-70">Rech</span>
                    <span className="tabular-nums">{(d.rechazo * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between gap-1 border-t border-white/25 pt-0.5">
                    <span className="opacity-70">Aus</span>
                    <span className="tabular-nums opacity-80">{(d.ausentismo * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
