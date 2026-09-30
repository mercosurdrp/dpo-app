"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, Paperclip, Plus } from "lucide-react"
import { abrirArchivo } from "@/lib/abrir-archivo"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  agregarMiembro,
  borrarAvance,
  getSignedUrlMudanza,
  guardarConfig,
  quitarMiembro,
} from "@/actions/mudanza"
import {
  MUDANZA_RUBROS,
  type MudanzaAvance,
  type MudanzaConfig,
  type MudanzaGasto,
  type MudanzaMiembro,
  type MudanzaPartida,
  type MudanzaTarea,
} from "@/types/mudanza"
import { MudanzaGantt } from "@/components/mudanza/gantt"
import { AvanceSelect } from "@/components/mudanza/avance-select"
import { MontoInput } from "@/components/mudanza/monto-input"
import { TareaFormDialog } from "@/components/mudanza/tarea-form-dialog"
import { AvanceFormDialog } from "@/components/mudanza/avance-form-dialog"
import { GastoFormDialog } from "@/components/mudanza/gasto-form-dialog"
import { PartidaFormDialog } from "@/components/mudanza/partida-form-dialog"
import {
  colorResponsable,
  desvioDias,
  diasEntre,
  estaAtrasada,
  estadoClase,
  estadoLabel,
  formatFecha,
  formatMoney,
  isoHoy,
  superposiciones,
  tieneFechas,
} from "@/components/mudanza/formato"
import type { ArchivoAvance } from "@/lib/adjuntos-avance"

interface Props {
  config: MudanzaConfig
  tareas: MudanzaTarea[]
  equipo: MudanzaMiembro[]
  avances: MudanzaAvance[]
  partidas: MudanzaPartida[]
  gastos: MudanzaGasto[]
  perfiles: { id: string; nombre: string; email: string | null }[]
  puedeEditar: boolean
  usuarioId: string | null
}

const TODOS = "__todos__"

export function MudanzaClient({
  config,
  tareas,
  equipo,
  avances,
  partidas,
  gastos,
  perfiles,
  puedeEditar,
  usuarioId,
}: Props) {
  const refrescar = useRefrescarConScroll()
  const hoy = isoHoy()
  const ordenResp = useMemo(() => equipo.map((m) => m.profile_id), [equipo])

  // filtros
  const [fResp, setFResp] = useState(TODOS)
  const [fRubro, setFRubro] = useState(TODOS)
  const [fEstado, setFEstado] = useState(TODOS)
  const [q, setQ] = useState("")
  const [modoGantt, setModoGantt] = useState<"rubro" | "responsable">("rubro")

  // diálogos
  const [tareaDlg, setTareaDlg] = useState<{ open: boolean; tarea: MudanzaTarea | null; rubro?: string }>({
    open: false,
    tarea: null,
  })
  const [avanceDlg, setAvanceDlg] = useState<{ open: boolean; tarea: MudanzaTarea | null }>({
    open: false,
    tarea: null,
  })
  const [gastoDlg, setGastoDlg] = useState<{ open: boolean; gasto: MudanzaGasto | null; partida?: string; tarea?: string }>({
    open: false,
    gasto: null,
  })
  const [partidaDlg, setPartidaDlg] = useState<{ open: boolean; partida: MudanzaPartida | null }>({
    open: false,
    partida: null,
  })

  const rubros = useMemo(
    () => Array.from(new Set([...MUDANZA_RUBROS, ...tareas.map((t) => t.rubro), ...partidas.map((p) => p.rubro)])),
    [tareas, partidas],
  )

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return tareas.filter(
      (t) =>
        (fResp === TODOS || (fResp === "__sin__" ? !t.responsable_id : t.responsable_id === fResp)) &&
        (fRubro === TODOS || t.rubro === fRubro) &&
        (fEstado === TODOS || t.estado === fEstado) &&
        (!qq || `${t.nombre} ${t.notas ?? ""} ${t.responsable_nombre ?? ""}`.toLowerCase().includes(qq)),
    )
  }, [tareas, fResp, fRubro, fEstado, q])

  const pisadas = useMemo(() => superposiciones(tareas), [tareas])
  const kpi = useMemo(() => {
    const noHitos = tareas.filter((t) => !t.hito)
    return {
      total: noHitos.length,
      enCurso: noHitos.filter((t) => t.estado === "en_curso").length,
      hechas: noHitos.filter((t) => t.estado === "hecha").length,
      atrasadas: tareas.filter((t) => estaAtrasada(t, hoy)).length,
      sinFecha: tareas.filter((t) => !tieneFechas(t)).length,
      sinResp: noHitos.filter((t) => !t.responsable_id).length,
      pisadas: new Set(pisadas.flat().map((t) => t.id)).size,
      avanceProm: noHitos.length
        ? Math.round(noHitos.reduce((a, t) => a + t.avance, 0) / noHitos.length)
        : 0,
    }
  }, [tareas, pisadas, hoy])

  const presupuesto = useMemo(() => {
    const porRubro: Record<
      string,
      { ppto: number; pagado: number; comprometido: number; partidas: MudanzaPartida[]; gastos: MudanzaGasto[] }
    > = {}
    const get = (r: string) =>
      (porRubro[r] ??= { ppto: 0, pagado: 0, comprometido: 0, partidas: [], gastos: [] })
    for (const p of partidas) {
      const g = get(p.rubro)
      g.ppto += p.monto
      g.partidas.push(p)
    }
    for (const x of gastos) {
      const g = get(x.rubro)
      if (x.estado === "pagado") g.pagado += x.monto
      else g.comprometido += x.monto
      g.gastos.push(x)
    }
    const filas = Object.entries(porRubro)
      .map(([rubro, v]) => ({ rubro, ...v, total: v.pagado + v.comprometido, desvio: v.pagado + v.comprometido - v.ppto }))
      .sort((a, b) => {
        const ia = MUDANZA_RUBROS.indexOf(a.rubro)
        const ib = MUDANZA_RUBROS.indexOf(b.rubro)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.rubro.localeCompare(b.rubro)
      })
    const tot = filas.reduce(
      (a, f) => ({ ppto: a.ppto + f.ppto, pagado: a.pagado + f.pagado, comprometido: a.comprometido + f.comprometido }),
      { ppto: 0, pagado: 0, comprometido: 0 },
    )
    const porPartida: Record<string, { pagado: number; comprometido: number }> = {}
    for (const x of gastos) {
      if (!x.partida_id) continue
      const p = (porPartida[x.partida_id] ??= { pagado: 0, comprometido: 0 })
      if (x.estado === "pagado") p.pagado += x.monto
      else p.comprometido += x.monto
    }
    return { filas, tot, porPartida }
  }, [partidas, gastos])

  const [pendingCfg, startCfg] = useTransition()
  const [cfgMsg, setCfgMsg] = useState<string | null>(null)
  function submitConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startCfg(async () => {
      const r = await guardarConfig(fd)
      setCfgMsg("error" in r ? r.error : "Guardado.")
      if (!("error" in r)) refrescar()
    })
  }

  const [nuevoMiembro, setNuevoMiembro] = useState("")
  const [pendingEq, startEq] = useTransition()
  function addMiembro() {
    if (!nuevoMiembro) return
    startEq(async () => {
      const r = await agregarMiembro(nuevoMiembro)
      if (!("error" in r)) {
        setNuevoMiembro("")
        refrescar()
      }
    })
  }
  function delMiembro(id: string) {
    startEq(async () => {
      const r = await quitarMiembro(id)
      if (!("error" in r)) refrescar()
    })
  }

  async function abrir(a: ArchivoAvance) {
    const r = await getSignedUrlMudanza(a.path)
    if ("error" in r) return
    abrirArchivo(r.data.url, a.nombre)
  }

  const [pendingAv, startAv] = useTransition()
  const [confirmAv, setConfirmAv] = useState<string | null>(null)
  function delAvance(id: string) {
    if (confirmAv !== id) {
      setConfirmAv(id)
      return
    }
    startAv(async () => {
      const r = await borrarAvance(id)
      setConfirmAv(null)
      if (!("error" in r)) refrescar()
    })
  }

  const puedeAvanzar = (t: MudanzaTarea) => puedeEditar || (!!usuarioId && t.responsable_id === usuarioId)
  const abrirTarea = (t: MudanzaTarea) => {
    if (puedeEditar) setTareaDlg({ open: true, tarea: t })
    else if (puedeAvanzar(t)) setAvanceDlg({ open: true, tarea: t })
  }

  const gastoPorTarea = useMemo(() => {
    const m: Record<string, { pagado: number; comprometido: number }> = {}
    for (const g of gastos) {
      if (!g.tarea_id) continue
      const x = (m[g.tarea_id] ??= { pagado: 0, comprometido: 0 })
      if (g.estado === "pagado") x.pagado += g.monto
      else x.comprometido += g.monto
    }
    return m
  }, [gastos])
  const pptoTareas = useMemo(() => {
    const ppto = tareas.reduce((a, t) => a + (t.presupuesto ?? 0), 0)
    let pagado = 0
    let comprometido = 0
    for (const g of gastos) {
      if (g.estado === "pagado") pagado += g.monto
      else comprometido += g.monto
    }
    return { ppto, pagado, comprometido }
  }, [tareas, gastos])

  const ultimosAvancesPorTarea = useMemo(() => {
    const m: Record<string, MudanzaAvance> = {}
    for (const a of avances) if (!m[a.tarea_id]) m[a.tarea_id] = a
    return m
  }, [avances])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{config.nombre}</h1>
          <p className="text-sm text-slate-500">
            Llaves {formatFecha(config.fecha_llaves)} · Mudanza{" "}
            {config.fecha_mudanza ? formatFecha(config.fecha_mudanza) : "sin fecha"} · Hoy {formatFecha(hoy)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAvanceDlg({ open: true, tarea: null })}
            disabled={!puedeEditar && !tareas.some(puedeAvanzar)}
          >
            Registrar avance
          </Button>
          {puedeEditar && (
            <Button onClick={() => setTareaDlg({ open: true, tarea: null })}>
              <Plus className="mr-1 size-4" /> Nueva tarea
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Tareas" value={kpi.total} />
        <Kpi label="En curso" value={kpi.enCurso} tone="sky" />
        <Kpi label="Hechas" value={kpi.hechas} tone="emerald" />
        <Kpi label="Atrasadas" value={kpi.atrasadas} tone={kpi.atrasadas ? "red" : undefined} />
        <Kpi label="Se pisan" value={kpi.pisadas} tone={kpi.pisadas ? "amber" : undefined} />
        <Kpi label="Sin fecha" value={kpi.sinFecha} />
        <Kpi label="Sin responsable" value={kpi.sinResp} />
        <Kpi label="Avance" value={`${kpi.avanceProm} %`} />
      </div>

      <Tabs defaultValue="cronograma" className="w-full">
        <TabsList variant="line">
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="avances">Avances</TabsTrigger>
          <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
          <TabsTrigger value="equipo">Equipo y fechas</TabsTrigger>
        </TabsList>

        {/* ---------------- CRONOGRAMA ---------------- */}
        <TabsContent value="cronograma" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filtros />
            <div className="ml-auto inline-flex overflow-hidden rounded-md border border-slate-200 text-sm">
              <button
                type="button"
                className={`px-3 py-1.5 ${modoGantt === "rubro" ? "bg-slate-900 text-white" : "bg-white"}`}
                onClick={() => setModoGantt("rubro")}
              >
                Por rubro
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${modoGantt === "responsable" ? "bg-slate-900 text-white" : "bg-white"}`}
                onClick={() => setModoGantt("responsable")}
              >
                Por responsable
              </button>
            </div>
          </div>
          <MudanzaGantt
            tareas={filtradas}
            config={config}
            ordenResponsables={ordenResp}
            modo={modoGantt}
            onSelect={abrirTarea}
            puedeAvanzar={puedeAvanzar}
            onAvance={refrescar}
          />
          {pisadas.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="mb-2 font-semibold text-slate-800">Superposiciones por responsable</h3>
                <ul className="space-y-1 text-sm">
                  {pisadas.map(([a, b]) => (
                    <li key={a.id + b.id} className="flex flex-wrap items-center gap-1">
                      <i
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: colorResponsable(a.responsable_id, ordenResp) }}
                      />
                      <b>{a.responsable_nombre}</b>: {a.nombre} ({formatFecha(a.inicio)}–{formatFecha(a.fin)}) se
                      pisa con {b.nombre} ({formatFecha(b.inicio)}–{formatFecha(b.fin)})
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- TAREAS ---------------- */}
        <TabsContent value="tareas" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filtros />
          </div>
          {rubros
            .filter((r) => filtradas.some((t) => t.rubro === r))
            .map((r) => {
              const lista = filtradas.filter((t) => t.rubro === r)
              return (
                <Card key={r}>
                  <CardContent className="pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">
                        {r} <span className="font-normal text-slate-400">· {lista.length}</span>
                      </h3>
                      {puedeEditar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTareaDlg({ open: true, tarea: null, rubro: r })}
                        >
                          <Plus className="size-4" /> Agregar
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="py-1 pr-2">Tarea</th>
                            <th className="py-1 pr-2">Responsable</th>
                            <th className="py-1 pr-2">Plan</th>
                            <th className="py-1 pr-2">Real</th>
                            <th className="py-1 pr-2">Desvío</th>
                            <th className="py-1 pr-2">Estado</th>
                            <th className="py-1 pr-2 text-right">Avance</th>
                            <th className="py-1 pr-2 text-right">Presupuesto</th>
                            <th className="py-1 pr-2 text-right">Gastado</th>
                            <th className="py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((t) => {
                            const d = desvioDias(t, hoy)
                            const ult = ultimosAvancesPorTarea[t.id]
                            return (
                              <tr key={t.id} className="border-t border-slate-100 align-top">
                                <td className="py-1.5 pr-2">
                                  <button
                                    type="button"
                                    className="text-left font-medium hover:underline"
                                    onClick={() => abrirTarea(t)}
                                  >
                                    {t.hito ? "◆ " : ""}
                                    {t.nombre}
                                  </button>
                                  {t.notas && <div className="text-xs text-slate-500">{t.notas}</div>}
                                  {ult && (
                                    <div className="text-xs text-slate-400">
                                      Último avance {formatFecha(ult.fecha)}: {ult.comentario ?? `${ult.avance} %`}
                                    </div>
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-2">
                                  <span className="inline-flex items-center gap-1.5">
                                    <i
                                      className="inline-block size-2 rounded-full"
                                      style={{ background: colorResponsable(t.responsable_id, ordenResp) }}
                                    />
                                    {t.responsable_nombre ?? <span className="text-slate-400">sin asignar</span>}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">
                                  {tieneFechas(t) ? (
                                    <>
                                      {formatFecha(t.inicio)}
                                      {!t.hito && <> – {formatFecha(t.fin)}</>}
                                      {!t.hito && (
                                        <span className="text-slate-400"> · {diasEntre(t.inicio!, t.fin!)} d</span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-slate-400">sin fecha</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">
                                  {t.inicio_real ? (
                                    <>
                                      {formatFecha(t.inicio_real)}
                                      {!t.hito && <> – {t.fin_real ? formatFecha(t.fin_real) : "…"}</>}
                                    </>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">
                                  {d == null ? (
                                    <span className="text-slate-400">—</span>
                                  ) : d > 0 ? (
                                    <span className="font-semibold text-red-600">+{d} d</span>
                                  ) : d < 0 ? (
                                    <span className="text-emerald-600">{d} d</span>
                                  ) : (
                                    <span className="text-slate-500">en fecha</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-2">
                                  <Badge variant="outline" className={estadoClase(t.estado)}>
                                    {estadoLabel(t.estado)}
                                  </Badge>
                                  {estaAtrasada(t, hoy) && (
                                    <span className="ml-1 text-xs font-semibold text-red-600">atrasada</span>
                                  )}
                                </td>
                                <td className="w-24 py-1.5 pr-2 text-right">
                                  {!t.hito && (
                                    <AvanceSelect
                                      tareaId={t.id}
                                      avance={t.avance}
                                      disabled={!puedeAvanzar(t)}
                                      onSaved={refrescar}
                                    />
                                  )}
                                </td>
                                <td className="py-1.5 pr-2 text-right">
                                  {!t.hito && (
                                    <MontoInput
                                      tareaId={t.id}
                                      monto={t.presupuesto}
                                      disabled={!puedeEditar}
                                      onSaved={refrescar}
                                    />
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-2 text-right text-xs tabular-nums">
                                  {!t.hito && (() => {
                                    const g = gastoPorTarea[t.id] ?? { pagado: 0, comprometido: 0 }
                                    const usado = g.pagado + g.comprometido
                                    const dif = t.presupuesto != null ? usado - t.presupuesto : null
                                    return (
                                      <div>
                                        <div>{usado ? formatMoney(usado) : <span className="text-slate-400">—</span>}</div>
                                        {g.comprometido > 0 && (
                                          <div className="text-[10px] text-amber-600">{formatMoney(g.comprometido)} comprom.</div>
                                        )}
                                        {dif != null && Math.abs(dif) >= 1 && (
                                          <div className={dif > 0 ? "text-[10px] font-semibold text-red-600" : "text-[10px] text-emerald-600"}>
                                            {dif > 0 ? "+" : ""}
                                            {formatMoney(dif)}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </td>
                                <td className="whitespace-nowrap py-1.5 text-right">
                                  {puedeEditar && !t.hito && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setGastoDlg({ open: true, gasto: null, tarea: t.id })}
                                      title="Cargar gasto de esta tarea"
                                    >
                                      + gasto
                                    </Button>
                                  )}
                                  {puedeAvanzar(t) && t.estado !== "hecha" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setAvanceDlg({ open: true, tarea: t })}
                                    >
                                      Avance
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          {filtradas.length === 0 && (
            <p className="text-sm text-slate-500">Ninguna tarea coincide con el filtro.</p>
          )}
        </TabsContent>

        {/* ---------------- AVANCES ---------------- */}
        <TabsContent value="avances" className="space-y-3 pt-3">
          {avances.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no hay avances cargados. Usá &quot;Registrar avance&quot; o el botón Avance de cada tarea.
            </p>
          ) : (
            <div className="space-y-2">
              {avances.map((a) => {
                const t = tareas.find((x) => x.id === a.tarea_id)
                return (
                  <Card key={a.id}>
                    <CardContent className="flex flex-wrap items-start gap-3 pt-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono text-xs text-slate-500">{formatFecha(a.fecha)}</span>
                          <b>{t?.nombre ?? "(tarea borrada)"}</b>
                          <Badge variant="outline" className={estadoClase(a.estado)}>
                            {estadoLabel(a.estado)}
                          </Badge>
                          <span className="text-xs tabular-nums text-slate-500">{a.avance} %</span>
                          <span className="text-xs text-slate-400">· {a.autor_nombre ?? "—"}</span>
                        </div>
                        {a.comentario && <p className="mt-1 text-sm text-slate-700">{a.comentario}</p>}
                        {a.archivos.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {a.archivos.map((f) => (
                              <button
                                key={f.path}
                                type="button"
                                onClick={() => abrir(f)}
                                className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                              >
                                <Paperclip className="size-3" /> {f.nombre}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {(puedeEditar || a.created_by === usuarioId) && (
                        <Button
                          size="sm"
                          variant={confirmAv === a.id ? "destructive" : "ghost"}
                          onClick={() => delAvance(a.id)}
                          disabled={pendingAv}
                        >
                          {confirmAv === a.id ? "¿Borrar?" : "Borrar"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------------- PRESUPUESTO ---------------- */}
        <TabsContent value="presupuesto" className="space-y-4 pt-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Presupuesto (tareas)" value={formatMoney(pptoTareas.ppto)} />
            <Kpi label="Pagado" value={formatMoney(pptoTareas.pagado)} tone="emerald" />
            <Kpi label="Comprometido" value={formatMoney(pptoTareas.comprometido)} tone="amber" />
            <Kpi
              label="Disponible"
              value={formatMoney(pptoTareas.ppto - pptoTareas.pagado - pptoTareas.comprometido)}
              tone={pptoTareas.ppto - pptoTareas.pagado - pptoTareas.comprometido < 0 ? "red" : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">Por tarea</h3>
            {puedeEditar && (
              <Button onClick={() => setGastoDlg({ open: true, gasto: null })}>
                <Plus className="mr-1 size-4" /> Cargar gasto
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Rubro / tarea</th>
                  <th className="px-3 py-2 text-right">Presupuesto</th>
                  <th className="px-3 py-2 text-right">Pagado</th>
                  <th className="px-3 py-2 text-right">Comprometido</th>
                  <th className="px-3 py-2 text-right">Desvío</th>
                  <th className="px-3 py-2">Ejecución</th>
                </tr>
              </thead>
              <tbody>
                {rubros
                  .filter((r) => r !== "Hitos" && tareas.some((t) => t.rubro === r && !t.hito))
                  .map((r) => {
                    const lista = tareas.filter((t) => t.rubro === r && !t.hito)
                    const ppto = lista.reduce((a, t) => a + (t.presupuesto ?? 0), 0)
                    const pag = lista.reduce((a, t) => a + (gastoPorTarea[t.id]?.pagado ?? 0), 0)
                    const com = lista.reduce((a, t) => a + (gastoPorTarea[t.id]?.comprometido ?? 0), 0)
                    return (
                      <RubroTareas
                        key={r}
                        rubro={r}
                        ppto={ppto}
                        pagado={pag}
                        comprometido={com}
                        tareas={lista}
                        gastoPorTarea={gastoPorTarea}
                        puedeEditar={puedeEditar}
                        onSaved={refrescar}
                        onGasto={(tid) => setGastoDlg({ open: true, gasto: null, tarea: tid })}
                      />
                    )
                  })}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(pptoTareas.ppto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(pptoTareas.pagado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(pptoTareas.comprometido)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Desvio v={pptoTareas.pagado + pptoTareas.comprometido - pptoTareas.ppto} />
                  </td>
                  <td className="px-3 py-2">
                    <Ejecucion ppto={pptoTareas.ppto} usado={pptoTareas.pagado + pptoTareas.comprometido} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Los gastos sin tarea asignada suman al total pero no a ninguna fila. El presupuesto se edita haciendo clic en el monto.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <h3 className="font-semibold text-slate-800">Partidas del Excel de inversión (referencia)</h3>
            {puedeEditar && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPartidaDlg({ open: true, partida: null })}>
                  <Plus className="mr-1 size-4" /> Partida
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Rubro / partida</th>
                  <th className="px-3 py-2 text-right">Presupuesto</th>
                  <th className="px-3 py-2 text-right">Pagado</th>
                  <th className="px-3 py-2 text-right">Comprometido</th>
                  <th className="px-3 py-2 text-right">Desvío</th>
                  <th className="px-3 py-2">Ejecución</th>
                </tr>
              </thead>
              <tbody>
                {presupuesto.filas.map((f) => (
                  <RubroFilas
                    key={f.rubro}
                    f={f}
                    porPartida={presupuesto.porPartida}
                    puedeEditar={puedeEditar}
                    onPartida={(p) => setPartidaDlg({ open: true, partida: p })}
                    onGasto={(pid) => setGastoDlg({ open: true, gasto: null, partida: pid })}
                  />
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(presupuesto.tot.ppto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(presupuesto.tot.pagado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(presupuesto.tot.comprometido)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Desvio v={presupuesto.tot.pagado + presupuesto.tot.comprometido - presupuesto.tot.ppto} />
                  </td>
                  <td className="px-3 py-2">
                    <Ejecucion ppto={presupuesto.tot.ppto} usado={presupuesto.tot.pagado + presupuesto.tot.comprometido} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold text-slate-800">Gastos cargados</h3>
          {gastos.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay gastos. Cada gasto lleva fecha, partida, proveedor, monto y comprobante.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Concepto</th>
                    <th className="px-3 py-2">Partida</th>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2">Comprobante</th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g) => (
                    <tr key={g.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatFecha(g.fecha)}</td>
                      <td className="px-3 py-1.5">
                        {puedeEditar ? (
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => setGastoDlg({ open: true, gasto: g })}
                          >
                            {g.concepto}
                          </button>
                        ) : (
                          g.concepto
                        )}
                        {g.notas && <div className="text-xs text-slate-500">{g.notas}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {g.partida_nombre ?? <span className="text-slate-400">{g.rubro}</span>}
                      </td>
                      <td className="px-3 py-1.5">{g.proveedor ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <Badge
                          variant="outline"
                          className={
                            g.estado === "pagado"
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "border-amber-200 bg-amber-100 text-amber-700"
                          }
                        >
                          {g.estado}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{formatMoney(g.monto)}</td>
                      <td className="px-3 py-1.5">
                        {g.archivos.map((f) => (
                          <button
                            key={f.path}
                            type="button"
                            onClick={() => abrir(f)}
                            className="mr-2 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                          >
                            <Paperclip className="size-3" /> {f.nombre}
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ---------------- EQUIPO Y FECHAS ---------------- */}
        <TabsContent value="equipo" className="grid gap-4 pt-3 md:grid-cols-2">
          <Card>
            <CardContent className="pt-4">
              <h3 className="mb-3 font-semibold text-slate-800">Fechas clave</h3>
              <form onSubmit={submitConfig} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-nombre">Nombre del proyecto</Label>
                  <Input id="cfg-nombre" name="nombre" defaultValue={config.nombre} disabled={!puedeEditar} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-llaves">Entrega de llaves</Label>
                    <Input
                      id="cfg-llaves"
                      name="fecha_llaves"
                      type="date"
                      defaultValue={config.fecha_llaves ?? ""}
                      disabled={!puedeEditar}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-mudanza">Día de mudanza</Label>
                    <Input
                      id="cfg-mudanza"
                      name="fecha_mudanza"
                      type="date"
                      defaultValue={config.fecha_mudanza ?? ""}
                      disabled={!puedeEditar}
                    />
                  </div>
                </div>
                {puedeEditar && (
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={pendingCfg}>
                      {pendingCfg && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Guardar fechas
                    </Button>
                    {cfgMsg && <span className="text-sm text-slate-500">{cfgMsg}</span>}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <h3 className="mb-1 font-semibold text-slate-800">Equipo de la mudanza</h3>
              <p className="mb-3 text-xs text-slate-500">
                Sólo estas personas pueden ser responsables de tareas. Cada una carga los avances de las suyas.
              </p>
              <ul className="space-y-1.5">
                {equipo.map((m) => (
                  <li key={m.profile_id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <i
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: colorResponsable(m.profile_id, ordenResp) }}
                      />
                      {m.nombre}
                      <span className="text-xs text-slate-400">
                        · {tareas.filter((t) => t.responsable_id === m.profile_id).length} tareas
                      </span>
                    </span>
                    {puedeEditar && (
                      <Button size="sm" variant="ghost" onClick={() => delMiembro(m.profile_id)} disabled={pendingEq}>
                        Quitar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {puedeEditar && (
                <div className="mt-3 flex gap-2">
                  <Select value={nuevoMiembro} onValueChange={(v: string | null) => setNuevoMiembro(v ?? "")}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Agregar persona…" />
                    </SelectTrigger>
                    <SelectContent>
                      {perfiles
                        .filter((p) => !equipo.some((m) => m.profile_id === p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={addMiembro} disabled={!nuevoMiembro || pendingEq}>
                    Agregar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TareaFormDialog
        open={tareaDlg.open}
        onOpenChange={(o) => setTareaDlg((s) => ({ ...s, open: o }))}
        onSaved={refrescar}
        tarea={tareaDlg.tarea}
        equipo={equipo}
        rubros={rubros}
        rubroInicial={tareaDlg.rubro}
      />
      <AvanceFormDialog
        open={avanceDlg.open}
        onOpenChange={(o) => setAvanceDlg((s) => ({ ...s, open: o }))}
        onSaved={refrescar}
        tarea={avanceDlg.tarea}
        tareas={tareas.filter(puedeAvanzar)}
      />
      <GastoFormDialog
        open={gastoDlg.open}
        onOpenChange={(o) => setGastoDlg((s) => ({ ...s, open: o }))}
        onSaved={refrescar}
        gasto={gastoDlg.gasto}
        partidas={partidas}
        tareas={tareas}
        partidaInicial={gastoDlg.partida}
        tareaInicial={gastoDlg.tarea}
      />
      <PartidaFormDialog
        open={partidaDlg.open}
        onOpenChange={(o) => setPartidaDlg((s) => ({ ...s, open: o }))}
        onSaved={refrescar}
        partida={partidaDlg.partida}
        rubros={rubros}
      />
    </div>
  )

  function Filtros() {
    return (
      <>
        <Select value={fResp} onValueChange={(v: string | null) => setFResp(v ?? TODOS)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los responsables</SelectItem>
            <SelectItem value="__sin__">Sin responsable</SelectItem>
            {equipo.map((m) => (
              <SelectItem key={m.profile_id} value={m.profile_id}>
                {m.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fRubro} onValueChange={(v: string | null) => setFRubro(v ?? TODOS)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Rubro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los rubros</SelectItem>
            {rubros.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fEstado} onValueChange={(v: string | null) => setFEstado(v ?? TODOS)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="en_curso">En curso</SelectItem>
            <SelectItem value="hecha">Hecha</SelectItem>
            <SelectItem value="bloqueada">Bloqueada</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="search"
          placeholder="Buscar tarea…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-48"
        />
      </>
    )
  }
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: "sky" | "emerald" | "red" | "amber"
}) {
  const color =
    tone === "sky"
      ? "text-sky-700"
      : tone === "emerald"
        ? "text-emerald-700"
        : tone === "red"
          ? "text-red-600"
          : tone === "amber"
            ? "text-amber-600"
            : "text-slate-900"
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  )
}

function Desvio({ v }: { v: number }) {
  if (Math.abs(v) < 1) return <span className="text-slate-400">—</span>
  return (
    <span className={v > 0 ? "font-semibold text-red-600" : "text-emerald-600"}>
      {v > 0 ? "+" : ""}
      {formatMoney(v)}
    </span>
  )
}

function Ejecucion({ ppto, usado }: { ppto: number; usado: number }) {
  const pct = ppto > 0 ? Math.round((usado / ppto) * 100) : usado > 0 ? 100 : 0
  return (
    <div className="flex items-center gap-2">
      <Progress value={Math.min(100, pct)} className={`h-1.5 ${pct > 100 ? "[&>div]:bg-red-500" : ""}`} />
      <span className="w-10 text-right text-xs tabular-nums">{pct} %</span>
    </div>
  )
}

function RubroTareas({
  rubro,
  ppto,
  pagado,
  comprometido,
  tareas,
  gastoPorTarea,
  puedeEditar,
  onSaved,
  onGasto,
}: {
  rubro: string
  ppto: number
  pagado: number
  comprometido: number
  tareas: MudanzaTarea[]
  gastoPorTarea: Record<string, { pagado: number; comprometido: number }>
  puedeEditar: boolean
  onSaved: () => void
  onGasto: (tareaId: string) => void
}) {
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold">
        <td className="px-3 py-2">{rubro}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(ppto)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(pagado)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(comprometido)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Desvio v={pagado + comprometido - ppto} />
        </td>
        <td className="px-3 py-2">
          <Ejecucion ppto={ppto} usado={pagado + comprometido} />
        </td>
      </tr>
      {tareas.map((t) => {
        const g = gastoPorTarea[t.id] ?? { pagado: 0, comprometido: 0 }
        return (
          <tr key={t.id} className="border-t border-slate-100 text-slate-700">
            <td className="px-3 py-1 pl-7">
              {t.nombre}
              {puedeEditar && (
                <button type="button" className="ml-2 text-xs text-sky-700 hover:underline" onClick={() => onGasto(t.id)}>
                  + gasto
                </button>
              )}
            </td>
            <td className="px-3 py-1 text-right">
              <MontoInput tareaId={t.id} monto={t.presupuesto} disabled={!puedeEditar} onSaved={onSaved} />
            </td>
            <td className="px-3 py-1 text-right tabular-nums">{g.pagado ? formatMoney(g.pagado) : "—"}</td>
            <td className="px-3 py-1 text-right tabular-nums">{g.comprometido ? formatMoney(g.comprometido) : "—"}</td>
            <td className="px-3 py-1 text-right tabular-nums">
              {t.presupuesto == null ? <span className="text-slate-400">—</span> : <Desvio v={g.pagado + g.comprometido - t.presupuesto} />}
            </td>
            <td className="px-3 py-1">
              {t.presupuesto != null && <Ejecucion ppto={t.presupuesto} usado={g.pagado + g.comprometido} />}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function RubroFilas({
  f,
  porPartida,
  puedeEditar,
  onPartida,
  onGasto,
}: {
  f: {
    rubro: string
    ppto: number
    pagado: number
    comprometido: number
    total: number
    desvio: number
    partidas: MudanzaPartida[]
  }
  porPartida: Record<string, { pagado: number; comprometido: number }>
  puedeEditar: boolean
  onPartida: (p: MudanzaPartida) => void
  onGasto: (partidaId: string) => void
}) {
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold">
        <td className="px-3 py-2">{f.rubro}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(f.ppto)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(f.pagado)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(f.comprometido)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Desvio v={f.desvio} />
        </td>
        <td className="px-3 py-2">
          <Ejecucion ppto={f.ppto} usado={f.total} />
        </td>
      </tr>
      {f.partidas.map((p) => {
        const u = porPartida[p.id] ?? { pagado: 0, comprometido: 0 }
        return (
          <tr key={p.id} className="border-t border-slate-100 text-slate-700">
            <td className="px-3 py-1.5 pl-7">
              {puedeEditar ? (
                <button type="button" className="text-left hover:underline" onClick={() => onPartida(p)}>
                  {p.nombre}
                </button>
              ) : (
                p.nombre
              )}
              {p.cantidad !== 1 && (
                <span className="ml-1 text-xs text-slate-400">
                  ({p.cantidad} × {formatMoney(p.unitario)})
                </span>
              )}
              {puedeEditar && (
                <button
                  type="button"
                  className="ml-2 text-xs text-sky-700 hover:underline"
                  onClick={() => onGasto(p.id)}
                >
                  + gasto
                </button>
              )}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(p.monto)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(u.pagado)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(u.comprometido)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              <Desvio v={u.pagado + u.comprometido - p.monto} />
            </td>
            <td className="px-3 py-1.5">
              <Ejecucion ppto={p.monto} usado={u.pagado + u.comprometido} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
