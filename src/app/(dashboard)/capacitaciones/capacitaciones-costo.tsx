"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CalendarRange,
  ChevronDown,
  Download,
  ListChecks,
  RotateCcw,
  Save,
  Scale,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  COSTO_CONFIG_DEFAULT,
  PILARES_COSTO,
  calcularCosto,
  type CostoConfig,
  type ItemCosto,
} from "@/lib/capacitacion-costo"
import { saveCostoConfig } from "@/actions/capacitacion-costo"
import { Cuadro } from "./tablero-cuadro"

interface Props {
  capacitaciones: ItemCosto[]
  config: CostoConfig
  /** Sólo admin edita los parámetros; auditor los ve. */
  puedeEditar: boolean
  hoy: string
  /** Abrir ya desplegado (cuando se elige desde el tablero). */
  inicialAbierto?: boolean
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const VERDE = "#10B981"
const AMARILLO = "#F59E0B"
const ROJO = "#EF4444"
const GRIS = "#94A3B8"

const $ = (n: number) => "$ " + Math.round(n).toLocaleString("es-AR")
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
const fmtH = (h: number) => (Math.round(h * 10) / 10).toLocaleString("es-AR")
const signo$ = (n: number) => (Math.round(n) > 0 ? "+" : Math.round(n) < 0 ? "−" : "") + $(Math.abs(n)).slice(2)
const signoK = (n: number) =>
  (Math.round(n / 1000) > 0 ? "+" : Math.round(n / 1000) < 0 ? "−" : "") +
  Math.abs(Math.round(n / 1000)).toLocaleString("es-AR") + " k"

type Vista = "pac" | "resumen" | "escenario" | "detalle" | "parametros"
const SECCIONES: Vista[] = ["pac", "resumen", "escenario", "detalle", "parametros"]

export function CapacitacionesCosto({
  capacitaciones,
  config,
  puedeEditar,
  hoy,
  inicialAbierto = false,
}: Props) {
  const anio = Number(hoy.slice(0, 4))
  const [abierto, setAbierto] = useState(inicialAbierto)
  const [sel, setSel] = useState<Set<Vista>>(() => new Set<Vista>(["pac"]))
  const toggle = (v: Vista) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  const [cfg, setCfg] = useState<CostoConfig>(config)
  const [guardado, setGuardado] = useState<CostoConfig>(config)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Se calcula con los parámetros en edición: lo que se tipea se ve al instante.
  const r = useMemo(() => calcularCosto(capacitaciones, cfg, anio, hoy), [capacitaciones, cfg, anio, hoy])
  const sucio = JSON.stringify(cfg) !== JSON.stringify(guardado)

  if (r.filas.length === 0) return null

  const pctEjec = pct(r.ejecutado, r.presupuesto)
  const pctPac = pct(r.pac.total.real, r.pac.total.pac)
  const desvioPac = r.pac.total.pac - r.pac.total.real
  const pctEsc = pct(r.escenario.real, r.escenario.meta)
  const desde = MESES[cfg.mesDesde]
  const hasta = MESES[cfg.mesHasta]

  async function descargar() {
    const [XLSX, { libroCosto }] = await Promise.all([import("xlsx"), import("@/lib/capacitacion-costo-xlsx")])
    XLSX.writeFile(libroCosto(XLSX, r, cfg, hoy), `Presupuesto_Costo_Capacitaciones_${hoy}.xlsx`)
  }

  function guardar() {
    setMsg(null)
    startTransition(async () => {
      const res = await saveCostoConfig(cfg)
      if ("error" in res) {
        setMsg("Error: " + res.error)
        return
      }
      setCfg(res.data)
      setGuardado(res.data)
      setMsg("Parámetros guardados")
      router.refresh()
    })
  }

  const setNum = (k: keyof CostoConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg((c) => ({ ...c, [k]: Math.max(0, Number(e.target.value) || 0) }))

  return (
    <Card>
      <CardHeader className={abierto ? "pb-3" : "py-3"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-2 text-left outline-none"
            title={abierto ? "Ocultar presupuesto de costo" : "Ver presupuesto de costo"}
          >
            <ChevronDown
              className={`size-4 text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`}
            />
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4 text-slate-400" />
              Presupuesto de Costo {anio}
            </CardTitle>
            {!abierto && (
              <span className="text-xs text-slate-500">
                · PAC <b className="text-slate-700">{$(r.pac.total.pac)}</b> · real dictado{" "}
                <b className="text-slate-700">{$(r.pac.total.real)}</b> ({pctPac ?? "—"} %) · desvío{" "}
                <b style={{ color: desvioPac >= 0 ? VERDE : ROJO }}>{$(desvioPac)}</b>
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={descargar}>
              <Download className="mr-1.5 size-3.5" />
              Descargar Excel
            </Button>
            <Badge variant="secondary" className="text-[11px] text-slate-500">
              Sólo admin / auditor
            </Badge>
          </div>
        </div>
      </CardHeader>

      {abierto && (
        <CardContent className="space-y-4">
          {/* Tablero: cada cuadro abre/cierra su sección (se pueden tildar varios) */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Tocá un cuadro para ver su detalle. Podés abrir varios a la vez.</p>
            <button
              type="button"
              onClick={() => setSel(sel.size === SECCIONES.length ? new Set() : new Set(SECCIONES))}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              {sel.size === SECCIONES.length ? "Cerrar todo" : "Ver todo"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Cuadro
              activo={sel.has("pac")}
              onClick={() => toggle("pac")}
              icono={<Scale className="size-4" />}
              titulo="PAC vs Real"
              valor={$(r.pac.total.real)}
              color={desvioPac >= 0 ? VERDE : ROJO}
              detalle={`${pctPac ?? "—"} % del PAC ${$(r.pac.total.pac)}`}
              pie={`Desvío ${signo$(desvioPac)}`}
              pieColor={desvioPac >= 0 ? VERDE : ROJO}
              barra={pctPac}
            />
            <Cuadro
              activo={sel.has("resumen")}
              onClick={() => toggle("resumen")}
              icono={<CalendarRange className="size-4" />}
              titulo="Presupuesto por horas"
              valor={$(r.presupuesto)}
              detalle={`Ejecutado ${$(r.ejecutado)} · ${pctEjec ?? "—"} %`}
              pie={`Oficial PxQ ${$(r.oficial)}`}
              barra={pctEjec}
            />
            <Cuadro
              activo={sel.has("escenario")}
              onClick={() => toggle("escenario")}
              icono={<Users className="size-4" />}
              titulo={`Escenario ${cfg.capsPorMes} x mes`}
              valor={`${r.escenario.real} / ${r.escenario.meta}`}
              color={pctEsc === null ? GRIS : pctEsc >= 100 ? VERDE : pctEsc >= 80 ? AMARILLO : ROJO}
              detalle={`${pctEsc ?? "—"} % de la meta · ${desde}→${hasta}`}
              pie={`Costaría ${$(r.escenario.costoEscenario)}`}
              barra={pctEsc}
            />
            <Cuadro
              activo={sel.has("detalle")}
              onClick={() => toggle("detalle")}
              icono={<ListChecks className="size-4" />}
              titulo="Detalle"
              valor={`${r.filas.length} caps`}
              detalle={`${r.cumplidas} cumplidas · ${r.filas.length - r.cumplidas} pendientes`}
              pie="Costo de cada capacitación"
              barra={pct(r.cumplidas, r.filas.length)}
            />
            <Cuadro
              activo={sel.has("parametros")}
              onClick={() => toggle("parametros")}
              icono={<SlidersHorizontal className="size-4" />}
              titulo="Parámetros"
              valor={sucio ? "Sin guardar" : "Sueldos · PAC"}
              color={sucio ? AMARILLO : undefined}
              detalle={puedeEditar ? "Editables por admin" : "Sólo lectura"}
              pie={`${cfg.horasMes} h/mes · ${cfg.horasPreparacion} h de preparación`}
            />
          </div>

          {sel.has("pac") && (
            <Seccion titulo="PAC vs Real — presupuesto oficial contra lo dictado" onCerrar={() => toggle("pac")}>
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Por pilar — PAC vs real dictado
                  </p>
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Pilar</th>
                        <th className="py-1.5 pr-2 text-right">Caps PAC / real</th>
                        <th className="py-1.5 pr-2 text-right">Horas PAC / real</th>
                        <th className="py-1.5 pr-2 text-right">Desvío hs</th>
                        <th className="py-1.5 pr-2 text-right">$ PAC</th>
                        <th className="py-1.5 pr-2 text-right">$ Real</th>
                        <th className="py-1.5 pr-2 text-right">Desvío $</th>
                        <th className="py-1.5 text-right">Ejec.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...r.pac.porPilar, { pilar: "Total", ...r.pac.total, porMes: [] }].map((p) => {
                        const dh = p.horasPac - p.horasReal
                        const d = p.pac - p.real
                        const e = pct(p.real, p.pac)
                        const tot = p.pilar === "Total"
                        return (
                          <tr key={p.pilar} className={tot ? "border-t-2 font-semibold" : "border-b last:border-0"}>
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{p.pilar}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-600">
                              {p.capsPac} / {p.capsReal}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-slate-600">
                              {fmtH(p.horasPac)} / {fmtH(p.horasReal)}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-xs" style={{ color: dh >= 0 ? VERDE : ROJO }}>
                              {dh > 0 ? "+" : dh < 0 ? "−" : ""}
                              {fmtH(Math.abs(dh))}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-slate-500">{$(p.pac)}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-900">{$(p.real)}</td>
                            <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: d >= 0 ? VERDE : ROJO }}>
                              {signo$(d)}
                            </td>
                            <td className="py-1.5 text-right text-xs text-slate-500">{e === null ? "—" : `${e} %`}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
  
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Por mes — todos los pilares
                  </p>
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Mes</th>
                        <th className="py-1.5 pr-2 text-right">Caps PAC / real</th>
                        <th className="py-1.5 pr-2 text-right">Horas PAC / real</th>
                        <th className="py-1.5 pr-2 text-right">$ PAC</th>
                        <th className="py-1.5 pr-2 text-right">$ Real</th>
                        <th className="py-1.5 pr-2 text-right">Desvío $</th>
                        <th className="py-1.5 text-right">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.pac.porMes.map((m) => {
                        const d = m.pac - m.real
                        return (
                          <tr key={m.mes} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{MESES[m.mes]}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-600">
                              {m.capsPac} / {m.capsReal}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-slate-600">
                              {fmtH(m.horasPac)} / {fmtH(m.horasReal)}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-slate-500">{$(m.pac)}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-900">{$(m.real)}</td>
                            <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: d >= 0 ? VERDE : ROJO }}>
                              {signo$(d)}
                            </td>
                            <td
                              className="py-1.5 text-right text-xs font-semibold"
                              style={{ color: m.desvioAcumulado >= 0 ? VERDE : ROJO }}
                            >
                              {signo$(m.desvioAcumulado)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
  
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Desvío $ por pilar y mes (PAC − Real)
                  </p>
                  <table className="w-full min-w-[46rem] text-xs">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Pilar</th>
                        {r.pac.meses.map((m) => (
                          <th key={m} className="px-1 py-1.5 text-right">
                            {MESES[m]}
                          </th>
                        ))}
                        <th className="py-1.5 pl-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.pac.porPilar.map((p) => (
                        <tr key={p.pilar} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{p.pilar}</td>
                          {p.porMes.map((c, i) => {
                            const d = c.pac - c.real
                            return (
                              <td
                                key={i}
                                className="px-1 py-1.5 text-right tabular-nums"
                                title={`PAC ${$(c.pac)} (${c.capsPac} caps, ${fmtH(c.horasPac)} h) · Real ${$(c.real)} (${c.capsReal} caps, ${fmtH(c.horasReal)} h)`}
                                style={{ color: d === 0 ? GRIS : d > 0 ? VERDE : ROJO }}
                              >
                                {d === 0 ? "—" : signoK(d)}
                              </td>
                            )
                          })}
                          <td
                            className="py-1.5 pl-2 text-right font-semibold tabular-nums"
                            style={{ color: p.pac - p.real >= 0 ? VERDE : ROJO }}
                          >
                            {signoK(p.pac - p.real)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    En miles de $ (pasá el mouse para ver el detalle). PAC = capacitaciones previstas × horas por
                    capacitación (preparación + búsqueda + test + presentación) × valor/hora del pilar. Real = las
                    efectivamente dictadas (cumplidas o con algún presente): horas de preparación del PAC + duración
                    real dictada, al mismo valor/hora. Desvío = PAC − Real: verde = se gastó menos de lo presupuestado.
                  </p>
                </div>
              </div>
            </Seccion>
          )}

          {sel.has("resumen") && (
            <Seccion titulo="Presupuesto por horas — por mes y pilar" onCerrar={() => toggle("resumen")}>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Por mes
                  </p>
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Mes</th>
                        <th className="py-1.5 pr-2 text-right">Caps</th>
                        <th className="py-1.5 pr-2 text-right">Presupuesto</th>
                        <th className="py-1.5 pr-2 text-right">Ejecutado</th>
                        <th className="py-1.5 pr-2 text-right">Oficial PxQ</th>
                        <th className="py-1.5 text-right">Ofic. − Ppto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.porMes
                        .filter((m) => m.caps > 0 || m.oficial > 0)
                        .map((m) => {
                          const brecha = m.oficial - m.presupuesto
                          return (
                            <tr key={m.mes} className="border-b last:border-0">
                              <td className="py-1.5 pr-2 font-medium text-slate-700">{MESES[m.mes]}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-600">{m.caps || "—"}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-900">{$(m.presupuesto)}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-600">{$(m.ejecutado)}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-400">{$(m.oficial)}</td>
                              <td
                                className="py-1.5 text-right text-xs font-semibold"
                                style={{ color: brecha >= 0 ? VERDE : ROJO }}
                              >
                                {brecha >= 0 ? "+" : "−"}
                                {$(Math.abs(brecha)).slice(2)}
                              </td>
                            </tr>
                          )
                        })}
                      <tr className="border-t-2 font-semibold">
                        <td className="py-1.5 pr-2">Total</td>
                        <td className="py-1.5 pr-2 text-right">{r.filas.length}</td>
                        <td className="py-1.5 pr-2 text-right">{$(r.presupuesto)}</td>
                        <td className="py-1.5 pr-2 text-right">{$(r.ejecutado)}</td>
                        <td className="py-1.5 pr-2 text-right">{$(r.oficial)}</td>
                        <td
                          className="py-1.5 text-right text-xs"
                          style={{ color: r.oficial - r.presupuesto >= 0 ? VERDE : ROJO }}
                        >
                          {r.oficial - r.presupuesto >= 0 ? "+" : "−"}
                          {$(Math.abs(r.oficial - r.presupuesto)).slice(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
  
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Por pilar
                  </p>
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Pilar</th>
                        <th className="py-1.5 pr-2">Capacitador</th>
                        <th className="py-1.5 pr-2 text-right">Caps</th>
                        <th className="py-1.5 pr-2 text-right">Asist.</th>
                        <th className="py-1.5 pr-2 text-right">Presupuesto</th>
                        <th className="py-1.5 text-right">Ejecutado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.porPilar.map((p) => (
                        <tr key={p.pilar} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{p.pilar}</td>
                          <td className="py-1.5 pr-2 text-xs text-slate-500">{p.capacitador}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-600">{p.caps}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-600">{p.asistentes}</td>
                          <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                            {$(p.presupuesto)}
                          </td>
                          <td className="py-1.5 text-right text-slate-600">{$(p.ejecutado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400 xl:col-span-2">
                  Costo de cada capacitación = duración × costo/hora del capacitador + {cfg.horasPreparacion} h
                  de preparación × costo/hora{cfg.logisticaFija > 0 ? ` + ${$(cfg.logisticaFija)} de logística` : ""}
                  {cfg.materialPorAsistente > 0 ? ` + ${$(cfg.materialPorAsistente)} por asistente` : ""}. Costo/hora =
                  sueldo ÷ {cfg.horasMes} h. Presupuesto = calendarizadas no canceladas · Ejecutado = cumplidas.
                  Oficial = línea GENTE/CAPACITACIONES del PxQ MRP (incluye formación comercial, no sólo DPO).
                </p>
              </div>
            </Seccion>
          )}

          {sel.has("escenario") && (
            <Seccion titulo={`Escenario ${cfg.capsPorMes} capacitaciones por mes`} onCerrar={() => toggle("escenario")}>
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Capacitaciones dadas por capacitador vs. meta de {cfg.capsPorMes} por mes ({desde}→{hasta})
                  </p>
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Capacitador</th>
                        {r.escenario.meses.map((m) => (
                          <th key={m} className="px-1 py-1.5 text-center">
                            {MESES[m]}
                          </th>
                        ))}
                        <th className="py-1.5 pl-2 text-right">Real</th>
                        <th className="py-1.5 pl-2 text-right">Meta</th>
                        <th className="py-1.5 pl-2 text-right">Brecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.escenario.capacitadores.map((c) => {
                        const brecha = c.real - c.meta
                        return (
                          <tr key={c.nombre} className="border-b last:border-0">
                            <td className="py-1.5 pr-2">
                              <div className="font-medium text-slate-700">{c.nombre}</div>
                              <div className="text-[11px] text-slate-400">{c.pilares.join(" + ")}</div>
                            </td>
                            {c.porMes.map((n, i) => (
                              <td key={i} className="px-1 py-1.5 text-center">
                                <span
                                  className="inline-block min-w-7 rounded px-1.5 py-0.5 text-xs font-semibold"
                                  style={{
                                    backgroundColor:
                                      (n >= cfg.capsPorMes ? VERDE : n > 0 ? AMARILLO : ROJO) + "1F",
                                    color: n >= cfg.capsPorMes ? VERDE : n > 0 ? "#B45309" : ROJO,
                                  }}
                                >
                                  {n}
                                </span>
                              </td>
                            ))}
                            <td className="py-1.5 pl-2 text-right font-semibold text-slate-900">{c.real}</td>
                            <td className="py-1.5 pl-2 text-right text-slate-500">{c.meta}</td>
                            <td
                              className="py-1.5 pl-2 text-right font-semibold"
                              style={{ color: brecha >= 0 ? VERDE : ROJO }}
                            >
                              {brecha > 0 ? "+" : ""}
                              {brecha}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="border-t-2 font-semibold">
                        <td className="py-1.5 pr-2">Total</td>
                        {r.escenario.totalMes.map((n, i) => (
                          <td key={i} className="px-1 py-1.5 text-center text-xs">
                            {n}
                            <span className="font-normal text-slate-400">/{r.escenario.metaMes}</span>
                          </td>
                        ))}
                        <td className="py-1.5 pl-2 text-right">{r.escenario.real}</td>
                        <td className="py-1.5 pl-2 text-right text-slate-500">{r.escenario.meta}</td>
                        <td
                          className="py-1.5 pl-2 text-right"
                          style={{ color: r.escenario.real - r.escenario.meta >= 0 ? VERDE : ROJO }}
                        >
                          {r.escenario.real - r.escenario.meta > 0 ? "+" : ""}
                          {r.escenario.real - r.escenario.meta}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
  
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Costo: escenario vs. real
                  </p>
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Capacitador</th>
                        <th className="py-1.5 pr-2 text-right">Costo/hora</th>
                        <th className="py-1.5 pr-2 text-right">x capacitación</th>
                        <th className="py-1.5 pr-2 text-right">Escenario</th>
                        <th className="py-1.5 pr-2 text-right">Real</th>
                        <th className="py-1.5 text-right">Esc. − Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.escenario.capacitadores.map((c) => (
                        <tr key={c.nombre} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{c.nombre}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-500">{$(c.costoHora)}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-500">{$(c.costoPorCap)}</td>
                          <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                            {$(c.costoEscenario)}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-slate-600">{$(c.costoReal)}</td>
                          <td className="py-1.5 text-right text-slate-600">
                            {$(c.costoEscenario - c.costoReal)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 font-semibold">
                        <td className="py-1.5 pr-2" colSpan={3}>
                          Total
                        </td>
                        <td className="py-1.5 pr-2 text-right">{$(r.escenario.costoEscenario)}</td>
                        <td className="py-1.5 pr-2 text-right">{$(r.escenario.costoReal)}</td>
                        <td className="py-1.5 text-right">
                          {$(r.escenario.costoEscenario - r.escenario.costoReal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    Escenario: cada capacitador da {cfg.capsPorMes} capacitaciones por mes de {desde} a {hasta}, de{" "}
                    {cfg.duracionEstandar} h + {cfg.horasPreparacion} h de preparación a su costo/hora. Real = lo
                    calendarizado en la app en esos meses (cada pilar cuenta para su capacitador).
                  </p>
                </div>
              </div>
            </Seccion>
          )}

          {sel.has("detalle") && (
            <Seccion titulo="Detalle por capacitación" onCerrar={() => toggle("detalle")}>
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2">Fecha</th>
                      <th className="py-1.5 pr-2">Pilar</th>
                      <th className="py-1.5 pr-2">Capacitación</th>
                      <th className="py-1.5 pr-2 text-right">Hs</th>
                      <th className="py-1.5 pr-2 text-right">Asist.</th>
                      <th className="py-1.5 pr-2 text-right">Costo</th>
                      <th className="py-1.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.filas.map((f) => (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap py-1.5 pr-2 text-slate-500">
                          {new Date(f.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">{f.pilarN}</td>
                        <td className="py-1.5 pr-2">
                          <Link href={`/capacitaciones/${f.id}`} className="text-slate-800 hover:underline">
                            {f.titulo}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-2 text-right text-slate-500">{f.duracion_horas}</td>
                        <td className="py-1.5 pr-2 text-right text-slate-500">{f.total_asistentes}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">{$(f.total)}</td>
                        <td className="py-1.5 text-xs">
                          <span
                            style={{
                              color: f.cumplida ? VERDE : f.estadoReal === "en_curso" ? AMARILLO : GRIS,
                            }}
                          >
                            {f.cumplida ? "Cumplida" : f.estadoReal === "en_curso" ? "En curso" : "Programada"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          )}

          {sel.has("parametros") && (
            <Seccion titulo="Parámetros" onCerrar={() => toggle("parametros")}>
              <div className="space-y-4">
                {!puedeEditar && (
                  <p className="text-xs text-slate-500">Sólo un admin puede cambiar los parámetros.</p>
                )}
                <fieldset disabled={!puedeEditar || isPending} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Campo label="Horas laborales por mes" value={cfg.horasMes} onChange={setNum("horasMes")} />
                    <Campo
                      label="Horas de preparación por capacitación"
                      value={cfg.horasPreparacion}
                      step="0.5"
                      onChange={setNum("horasPreparacion")}
                    />
                    <Campo
                      label="Logística fija por capacitación ($)"
                      value={cfg.logisticaFija}
                      onChange={setNum("logisticaFija")}
                    />
                    <Campo
                      label="Material por asistente ($)"
                      value={cfg.materialPorAsistente}
                      onChange={setNum("materialPorAsistente")}
                    />
                    <Campo
                      label="Escenario: capacitaciones por mes"
                      value={cfg.capsPorMes}
                      onChange={setNum("capsPorMes")}
                    />
                    <Campo
                      label="Escenario: duración estándar (h)"
                      value={cfg.duracionEstandar}
                      step="0.5"
                      onChange={setNum("duracionEstandar")}
                    />
                    <MesSelect
                      label="Escenario: desde"
                      value={cfg.mesDesde}
                      onChange={(m) => setCfg((c) => ({ ...c, mesDesde: m, mesHasta: Math.max(m, c.mesHasta) }))}
                    />
                    <MesSelect
                      label="Escenario: hasta"
                      value={cfg.mesHasta}
                      onChange={(m) => setCfg((c) => ({ ...c, mesHasta: m, mesDesde: Math.min(m, c.mesDesde) }))}
                    />
                  </div>
  
                  <div className="overflow-x-auto">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Capacitador y sueldo por pilar
                    </p>
                    <table className="w-full min-w-[30rem] text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <th className="py-1.5 pr-2">Pilar</th>
                          <th className="py-1.5 pr-2">Capacitador</th>
                          <th className="py-1.5 pr-2">Sueldo mensual ($)</th>
                          <th className="py-1.5 text-right">Costo/hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PILARES_COSTO.map((p) => (
                          <tr key={p} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{p}</td>
                            <td className="py-1 pr-2">
                              <Input
                                className="h-8 text-sm"
                                value={cfg.instructores[p].nombre}
                                onChange={(e) =>
                                  setCfg((c) => ({
                                    ...c,
                                    instructores: {
                                      ...c.instructores,
                                      [p]: { ...c.instructores[p], nombre: e.target.value },
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <Input
                                type="number"
                                min={0}
                                className="h-8 text-sm"
                                value={cfg.instructores[p].sueldo}
                                onChange={(e) =>
                                  setCfg((c) => ({
                                    ...c,
                                    instructores: {
                                      ...c.instructores,
                                      [p]: { ...c.instructores[p], sueldo: Math.max(0, Number(e.target.value) || 0) },
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1.5 text-right text-slate-500">
                              {$(cfg.instructores[p].sueldo / (cfg.horasMes || 1))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
  
                  <div className="overflow-x-auto">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      PAC — presupuesto oficial por pilar (horas por capacitación, valor/hora y cantidad por mes)
                    </p>
                    <table className="w-full min-w-[60rem] text-xs">
                      <thead>
                        <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <th className="py-1.5 pr-2">Pilar</th>
                          <th className="py-1.5 pr-1">Hs x cap</th>
                          <th className="py-1.5 pr-1">Present.</th>
                          <th className="py-1.5 pr-1">Valor/hora</th>
                          {MESES.map((m) => (
                            <th key={m} className="px-0.5 py-1.5 text-center">
                              {m}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PILARES_COSTO.map((p) => {
                          const q = cfg.pac[p]
                          const setPac = (patch: Partial<typeof q>) =>
                            setCfg((c) => ({ ...c, pac: { ...c.pac, [p]: { ...c.pac[p], ...patch } } }))
                          const n = (e: React.ChangeEvent<HTMLInputElement>) => Math.max(0, Number(e.target.value) || 0)
                          return (
                            <tr key={p} className="border-b last:border-0">
                              <td className="py-1 pr-2 font-medium text-slate-700">{p}</td>
                              <td className="py-1 pr-1">
                                <Input type="number" min={0} step="0.25" className="h-7 w-16 px-1 text-xs" value={q.horasPorCap} onChange={(e) => setPac({ horasPorCap: n(e) })} />
                              </td>
                              <td className="py-1 pr-1">
                                <Input type="number" min={0} step="0.25" className="h-7 w-16 px-1 text-xs" value={q.presentacion} onChange={(e) => setPac({ presentacion: n(e) })} />
                              </td>
                              <td className="py-1 pr-1">
                                <Input type="number" min={0} className="h-7 w-24 px-1 text-xs" value={Math.round(q.valorHora * 100) / 100} onChange={(e) => setPac({ valorHora: n(e) })} />
                              </td>
                              {MESES.map((m, i) => (
                                <td key={m} className="px-0.5 py-1">
                                  <Input
                                    type="number"
                                    min={0}
                                    className="h-7 w-11 px-1 text-center text-xs"
                                    value={q.cant[i]}
                                    onChange={(e) => setPac({ cant: q.cant.map((v, j) => (j === i ? Math.floor(n(e)) : v)) })}
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
  
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Presupuesto oficial PxQ por mes ($)
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                      {MESES.map((m, i) => (
                        <label key={m} className="text-[11px] text-slate-500">
                          {m}
                          <Input
                            type="number"
                            min={0}
                            className="mt-0.5 h-8 px-2 text-xs"
                            value={cfg.oficialPxQ[i]}
                            onChange={(e) =>
                              setCfg((c) => ({
                                ...c,
                                oficialPxQ: c.oficialPxQ.map((v, j) =>
                                  j === i ? Math.max(0, Number(e.target.value) || 0) : v
                                ),
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </fieldset>
  
                {puedeEditar && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={guardar} disabled={!sucio || isPending}>
                      <Save className="mr-1.5 size-3.5" />
                      {isPending ? "Guardando…" : "Guardar parámetros"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCfg(guardado)} disabled={!sucio || isPending}>
                      Descartar cambios
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCfg(COSTO_CONFIG_DEFAULT)}
                      disabled={isPending}
                      title="Vuelve a los valores de la planilla de julio (sin guardar)"
                    >
                      <RotateCcw className="mr-1.5 size-3.5" />
                      Valores originales
                    </Button>
                    {msg && <span className="text-xs text-slate-500">{msg}</span>}
                    {sucio && !msg && (
                      <span className="text-xs text-amber-600">
                        Los números de arriba ya usan estos valores; guardá para que queden.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Seccion>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function Seccion({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string
  onCerrar: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>
      {children}
    </section>
  )
}

function Campo({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="text-xs text-slate-600">
      {label}
      <Input type="number" min={0} step={step ?? "1"} className="mt-1 h-8 text-sm" value={value} onChange={onChange} />
    </label>
  )
}

function MesSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (m: number) => void
}) {
  return (
    <label className="text-xs text-slate-600">
      {label}
      <select
        className="mt-1 block h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {MESES.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
    </label>
  )
}
