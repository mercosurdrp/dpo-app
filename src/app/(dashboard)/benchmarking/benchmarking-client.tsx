"use client"

import { useMemo, useState, useTransition } from "react"
import {
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  GitCompareArrows,
  Pencil,
  Plus,
  Table2,
  Trash2,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { abrirArchivo, urlParaAbrir } from "@/lib/abrir-archivo"
import { calcularTendencia } from "@/lib/benchmarking-tendencia"
import {
  eliminarAplicacion,
  eliminarBench,
  eliminarEvidencia,
  getSignedUrlBenchmarking,
} from "@/actions/benchmarking"
import {
  APLICACION_ESTADOS,
  BENCH_MODALIDADES,
  type Bench,
  type BenchAplicacion,
  type BenchEvidencia,
  type BenchTipo,
} from "@/types/benchmarking"
import { BenchFormDialog } from "@/components/benchmarking/bench-form-dialog"
import { EvidenciaFormDialog } from "@/components/benchmarking/evidencia-form-dialog"
import { AplicacionFormDialog } from "@/components/benchmarking/aplicacion-form-dialog"
import { ValoresMesDialog } from "@/components/benchmarking/valores-mes-dialog"
import { TendenciaIndicador } from "@/components/benchmarking/tendencia-indicador"
import { cn } from "@/lib/utils"

interface Props {
  benchs: Bench[]
  puedeEditar: boolean
  conCuadro: boolean
}

const TEXTO_TAB: Record<BenchTipo, { titulo: string; requisitos: string; detalle: string }> = {
  interno: {
    titulo: "Bench interno",
    requisitos: "R5.2.1 · R5.2.2",
    detalle:
      "Comparar nuestros propios equipos o rutas de entrega (costo, nivel de servicio, SKPI: TLP, In Full, On Time, RMD), identificar los mejores y los peores y armar un plan de acción (como mínimo OWD sobre los SOP de los SKPI). Anual si los SKPI están arriba del presupuesto; trimestral si están abajo.",
  },
  externo: {
    titulo: "Bench externo",
    requisitos: "R5.2.3",
    detalle:
      "Si el costo, el servicio o los SKPI vienen abajo del presupuesto, compararse con otro distribuidor ABI del cluster o con una operación similar (otra empresa). Dejar minuta, fotos y qué se trajo para aplicar.",
  },
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function labelModalidad(v: string) {
  return BENCH_MODALIDADES.find((m) => m.value === v)?.label ?? v
}
function labelEstado(v: string) {
  return APLICACION_ESTADOS.find((m) => m.value === v)?.label ?? v
}

export function BenchmarkingClient({ benchs, puedeEditar, conCuadro }: Props) {
  const refrescar = useRefrescarConScroll()
  const [tab, setTab] = useState<BenchTipo>("externo")
  const [benchDlg, setBenchDlg] = useState<{ open: boolean; tipo: BenchTipo; bench: Bench | null }>({
    open: false,
    tipo: "externo",
    bench: null,
  })
  const [evidDlg, setEvidDlg] = useState<{ open: boolean; bench: Bench | null }>({ open: false, bench: null })
  const [aplDlg, setAplDlg] = useState<{ open: boolean; bench: Bench | null; aplicacion: BenchAplicacion | null }>({
    open: false,
    bench: null,
    aplicacion: null,
  })
  const [valDlg, setValDlg] = useState<{ open: boolean; aplicacion: BenchAplicacion | null }>({
    open: false,
    aplicacion: null,
  })

  const anio = new Date().getFullYear()
  const kpi = useMemo(() => {
    const delAnio = benchs.filter((b) => b.fecha.startsWith(String(anio)))
    const aplicaciones = benchs.flatMap((b) => b.aplicaciones)
    const conMejora = aplicaciones.filter(
      (a) => calcularTendencia(a.serie, a.fecha_aplicacion, a.mejor_si, a.meta).mejora === true,
    ).length
    const medibles = aplicaciones.filter(
      (a) => calcularTendencia(a.serie, a.fecha_aplicacion, a.mejor_si, a.meta).mejora !== null,
    ).length
    return {
      internos: delAnio.filter((b) => b.tipo === "interno").length,
      externos: delAnio.filter((b) => b.tipo === "externo").length,
      evidencias: benchs.reduce((n, b) => n + b.evidencias.length, 0),
      aplicaciones: aplicaciones.filter((a) => a.estado === "en_curso" || a.estado === "aplicada").length,
      conMejora,
      medibles,
      ultimo: benchs[0] ?? null,
    }
  }, [benchs, anio])

  // Para que los diálogos vean la versión fresca del bench después de un refresh.
  const benchActual = (id: string | undefined) => benchs.find((b) => b.id === id) ?? null
  const aplicacionActual = (id: string | undefined) =>
    benchs.flatMap((b) => b.aplicaciones).find((a) => a.id === id) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <GitCompareArrows className="size-6 text-blue-600" /> Benchmarking
          </h1>
          <p className="text-sm text-slate-500">
            Punto DPO Entrega 5.2 · cada bench deja minuta, evidencia y qué aplicamos; la mejora se mide sobre
            el indicador (R5.2.4).
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={() => setBenchDlg({ open: true, tipo: tab, bench: null })}>
            <Plus className="mr-1 size-4" /> Nuevo bench {tab}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={`Internos ${anio}`} value={kpi.internos} tone={kpi.internos ? "sky" : "red"} />
        <Kpi label={`Externos ${anio}`} value={kpi.externos} tone={kpi.externos ? "sky" : undefined} />
        <Kpi label="Evidencias" value={kpi.evidencias} />
        <Kpi label="Aplicaciones activas" value={kpi.aplicaciones} />
        <Kpi
          label="Indicadores que mejoraron"
          value={kpi.medibles ? `${kpi.conMejora} / ${kpi.medibles}` : "—"}
          tone={kpi.medibles ? (kpi.conMejora > 0 ? "emerald" : "amber") : undefined}
        />
        <Kpi label="Último bench" value={kpi.ultimo ? formatFecha(kpi.ultimo.fecha) : "—"} />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Auditoría H1 2026: 1.</strong> &quot;Realizaron bench con Palco un día antes de la auditoría.
        Vieron TLP, rechazos, RMD. Para H2 mostrar proceso documentado y resultados. Oportunidad de realizar
        bench interno.&quot; Para 3: R5.2.1, R5.2.2 y R5.2.3 con evidencia. Para 5: además, los SKPI mejoran
        desde el ejercicio (R5.2.4).
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab((v as BenchTipo) ?? "externo")} className="w-full">
        <TabsList variant="line">
          <TabsTrigger value="interno">
            <Users className="mr-1 size-4" /> Interno
            <Badge variant="secondary" className="ml-2 tabular-nums">
              {benchs.filter((b) => b.tipo === "interno").length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="externo">
            <Building2 className="mr-1 size-4" /> Externo
            <Badge variant="secondary" className="ml-2 tabular-nums">
              {benchs.filter((b) => b.tipo === "externo").length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {(["interno", "externo"] as BenchTipo[]).map((tipo) => {
          const lista = benchs.filter((b) => b.tipo === tipo)
          const txt = TEXTO_TAB[tipo]
          return (
            <TabsContent key={tipo} value={tipo} className="space-y-3 pt-3">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{txt.titulo}</h2>
                    <Badge variant="outline">{txt.requisitos}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{txt.detalle}</p>
                </CardContent>
              </Card>

              {lista.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  Todavía no hay benchs {tipo}s cargados.
                  {puedeEditar && (
                    <div className="mt-3">
                      <Button variant="outline" onClick={() => setBenchDlg({ open: true, tipo, bench: null })}>
                        <Plus className="mr-1 size-4" /> Cargar el primero
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                lista.map((b) => (
                  <BenchCard
                    key={b.id}
                    bench={b}
                    puedeEditar={puedeEditar}
                    onEditar={() => setBenchDlg({ open: true, tipo, bench: b })}
                    onEvidencia={() => setEvidDlg({ open: true, bench: b })}
                    onAplicacion={(a) => setAplDlg({ open: true, bench: b, aplicacion: a })}
                    onValores={(a) => setValDlg({ open: true, aplicacion: a })}
                    onCambio={refrescar}
                  />
                ))
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      <BenchFormDialog
        open={benchDlg.open}
        onOpenChange={(open) => setBenchDlg((s) => ({ ...s, open }))}
        onSaved={refrescar}
        tipo={benchDlg.tipo}
        bench={benchDlg.bench}
      />
      <EvidenciaFormDialog
        open={evidDlg.open}
        onOpenChange={(open) => setEvidDlg((s) => ({ ...s, open }))}
        onSaved={refrescar}
        bench={benchActual(evidDlg.bench?.id)}
      />
      <AplicacionFormDialog
        open={aplDlg.open}
        onOpenChange={(open) => setAplDlg((s) => ({ ...s, open }))}
        onSaved={refrescar}
        bench={benchActual(aplDlg.bench?.id)}
        aplicacion={aplDlg.aplicacion}
        conCuadro={conCuadro}
      />
      <ValoresMesDialog
        open={valDlg.open}
        onOpenChange={(open) => setValDlg((s) => ({ ...s, open }))}
        onSaved={refrescar}
        aplicacion={aplicacionActual(valDlg.aplicacion?.id)}
      />
    </div>
  )
}

// ---------------- Ficha de un bench ----------------

function BenchCard({
  bench,
  puedeEditar,
  onEditar,
  onEvidencia,
  onAplicacion,
  onValores,
  onCambio,
}: {
  bench: Bench
  puedeEditar: boolean
  onEditar: () => void
  onEvidencia: () => void
  onAplicacion: (a: BenchAplicacion | null) => void
  onValores: (a: BenchAplicacion) => void
  onCambio: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const mejoras = bench.aplicaciones.map((a) =>
    calcularTendencia(a.serie, a.fecha_aplicacion, a.mejor_si, a.meta).mejora,
  )
  const nMejora = mejoras.filter((m) => m === true).length
  const nMedibles = mejoras.filter((m) => m !== null).length

  function borrarBench() {
    if (!confirm(`¿Eliminar el bench "${bench.titulo}" con sus evidencias y aplicaciones?`)) return
    setError(null)
    startTransition(async () => {
      const r = await eliminarBench(bench.id)
      if ("error" in r) setError(r.error)
      else onCambio()
    })
  }
  function borrarEvidencia(e: BenchEvidencia) {
    if (!confirm(`¿Eliminar "${e.nombre}"?`)) return
    startTransition(async () => {
      const r = await eliminarEvidencia(e.id)
      if ("error" in r) setError(r.error)
      else onCambio()
    })
  }
  function borrarAplicacion(a: BenchAplicacion) {
    if (!confirm(`¿Eliminar la aplicación "${a.titulo}" y sus valores?`)) return
    startTransition(async () => {
      const r = await eliminarAplicacion(a.id)
      if ("error" in r) setError(r.error)
      else onCambio()
    })
  }
  async function abrir(e: BenchEvidencia) {
    if (e.url) {
      abrirArchivo(e.url, e.nombre)
      return
    }
    const r = await getSignedUrlBenchmarking(e.path)
    if ("data" in r) abrirArchivo(r.data.url, e.nombre)
  }

  const fotos = bench.evidencias.filter((e) => e.es_imagen)
  const archivos = bench.evidencias.filter((e) => !e.es_imagen)

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-start justify-between gap-3 p-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-500">{formatFecha(bench.fecha)}</span>
              <h3 className="text-base font-semibold text-slate-900">{bench.titulo}</h3>
              <Badge variant="outline">{labelModalidad(bench.modalidad)}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-600">
              {bench.contraparte ? `${bench.tipo === "interno" ? "Comparó" : "Con"} ${bench.contraparte}` : ""}
              {bench.lugar ? ` · ${bench.lugar}` : ""}
              {bench.indicadores.length > 0 ? ` · ${bench.indicadores.join(", ")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" /> {fotos.length} fotos
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3.5" /> {archivos.length} archivos
              </span>
              <span className="inline-flex items-center gap-1">
                <Table2 className="size-3.5" /> {bench.aplicaciones.length} aplicaciones
              </span>
              {nMedibles > 0 && (
                <span
                  className={cn(
                    "font-semibold",
                    nMejora > 0 ? "text-emerald-700" : "text-red-700",
                  )}
                >
                  {nMejora} / {nMedibles} indicadores mejoraron
                </span>
              )}
            </div>
          </div>
          {abierto ? <ChevronUp className="mt-1 size-5 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 size-5 shrink-0 text-slate-400" />}
        </button>

        {abierto && (
          <div className="space-y-5 border-t border-slate-100 p-4">
            {puedeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onEditar}>
                  <Pencil className="mr-1 size-3.5" /> Editar minuta
                </Button>
                <Button size="sm" variant="outline" onClick={onEvidencia}>
                  <Camera className="mr-1 size-3.5" /> Agregar evidencia
                </Button>
                <Button size="sm" onClick={() => onAplicacion(null)}>
                  <Plus className="mr-1 size-3.5" /> Qué aplicamos
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={borrarBench} disabled={pending}>
                  <Trash2 className="mr-1 size-3.5" /> Eliminar bench
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <Seccion titulo="Datos del bench">
                <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
                  <dt className="text-slate-500">Participantes</dt>
                  <dd>{bench.participantes ?? "—"}</dd>
                  <dt className="text-slate-500">Por qué</dt>
                  <dd className="whitespace-pre-wrap">{bench.objetivo ?? "—"}</dd>
                  <dt className="text-slate-500">Indicadores</dt>
                  <dd>
                    {bench.indicadores.length ? (
                      <span className="flex flex-wrap gap-1">
                        {bench.indicadores.map((i) => (
                          <Badge key={i} variant="secondary">
                            {i}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-slate-500">Cargó</dt>
                  <dd>
                    {bench.creador_nombre ?? "—"} · {formatFecha(bench.created_at)}
                  </dd>
                </dl>
              </Seccion>
              <Seccion titulo="Conclusiones / qué hacen distinto">
                <p className="whitespace-pre-wrap text-sm text-slate-700">{bench.conclusiones ?? "Sin conclusiones cargadas."}</p>
              </Seccion>
            </div>

            <Seccion titulo="Minuta: temas que se vieron">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{bench.temas ?? "Sin minuta cargada."}</p>
            </Seccion>

            <Seccion titulo={`Evidencia (${bench.evidencias.length})`}>
              {bench.evidencias.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay fotos ni archivos.</p>
              ) : (
                <div className="space-y-3">
                  {fotos.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {fotos.map((e) => (
                        <div key={e.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <button type="button" onClick={() => abrir(e)} className="block w-full" title={e.nombre}>
                            {e.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={urlParaAbrir(e.url, e.nombre)}
                                alt={e.descripcion ?? e.nombre}
                                className="aspect-[4/3] w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex aspect-[4/3] items-center justify-center text-slate-400">
                                <Camera className="size-6" />
                              </div>
                            )}
                          </button>
                          <div className="truncate px-2 py-1 text-[11px] text-slate-600" title={e.descripcion ?? e.nombre}>
                            {e.descripcion ?? e.nombre}
                          </div>
                          {puedeEditar && (
                            <button
                              type="button"
                              onClick={() => borrarEvidencia(e)}
                              className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-500 shadow hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
                              title="Eliminar"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {archivos.length > 0 && (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {archivos.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <FileText className="size-4 shrink-0 text-slate-400" />
                          <button type="button" onClick={() => abrir(e)} className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline">
                            {e.nombre}
                          </button>
                          {e.descripcion && <span className="hidden truncate text-xs text-slate-500 sm:inline">{e.descripcion}</span>}
                          <span className="text-xs tabular-nums text-slate-400">{formatFecha(e.created_at)}</span>
                          {puedeEditar && (
                            <button type="button" onClick={() => borrarEvidencia(e)} className="text-slate-400 hover:text-red-600" title="Eliminar">
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Seccion>

            <Seccion titulo={`Qué aplicamos y cómo mejoró (${bench.aplicaciones.length})`}>
              {bench.aplicaciones.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todavía no se registró nada aplicado. Es lo que pide R5.2.4: qué cambiamos a partir del bench y
                  cómo se movió el indicador.
                </p>
              ) : (
                <div className="space-y-3">
                  {bench.aplicaciones.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{a.titulo}</h4>
                            <Badge
                              variant={a.estado === "aplicada" ? "default" : a.estado === "descartada" ? "destructive" : "secondary"}
                            >
                              {labelEstado(a.estado)}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {a.proceso ? `${a.proceso} · ` : ""}
                            {a.responsable ? `${a.responsable} · ` : ""}
                            {a.fecha_aplicacion ? `desde ${formatFecha(a.fecha_aplicacion)}` : "sin fecha de aplicación"}
                            {a.indicador_nombre ? ` · mide: ${a.indicador_nombre}` : " · sin indicador"}
                          </p>
                        </div>
                        {puedeEditar && (
                          <div className="flex gap-1">
                            {a.fuente === "manual" && (
                              <Button size="sm" variant="outline" onClick={() => onValores(a)}>
                                <Table2 className="mr-1 size-3.5" /> Valores por mes
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => onAplicacion(a)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => borrarAplicacion(a)} disabled={pending}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {a.descripcion && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.descripcion}</p>}
                      <div className="mt-3">
                        <TendenciaIndicador aplicacion={a} />
                      </div>
                      {a.resultado && (
                        <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                          <span className="font-semibold">Lectura:</span> {a.resultado}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Seccion>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titulo}</h4>
      {children}
    </section>
  )
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
          ? "text-red-700"
          : tone === "amber"
            ? "text-amber-700"
            : "text-slate-900"
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  )
}
