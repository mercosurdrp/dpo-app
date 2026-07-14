"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Gauge, Package, Clock, Truck, AlertTriangle, Info, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TlpFila, TlpResumen } from "@/actions/tlp"
import type { TlpArbol, TlpArbolNodo, TlpEvolucionAnual, TlpEvolucionFila } from "@/lib/tlp/calc"
import { TLP_META_GLOBAL, tlpMetaDe, type TlpMeta } from "@/lib/tlp/metas"
import { estadoSemaforo } from "@/lib/sueno/semaforo"
import type { TlpPlan } from "@/actions/tlp-planes"
import { ArbolTlp, type ModoArbol } from "./_components/arbol-tlp"
import { PlanesAccionBloque } from "./_components/planes/planes-accion-bloque"
import { TlpRutaDetalleDialog, type RutaFiltro } from "./tlp-ruta-detalle-dialog"

function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number)
  return {
    desde: `${mes}-01`,
    hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  }
}

const MES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

/**
 * Árbol del mes: mismos nodos que el YTD pero con las filas que `getTlpMes` ya
 * trajo, así el toggle Mes/YTD no dispara otra lectura de viajes.
 */
function arbolDelMes(data: TlpResumen, mes: string): TlpArbol {
  const nodo = (f: TlpFila | TlpResumen["total"]): TlpArbolNodo => ({
    ciudad: f.ciudad,
    ceq: f.ceq,
    horasRuta: f.horas_ruta,
    horasHombre: f.horas_hombre,
    // hs-hombre = Σ (hs × FTE) ⇒ FTE ponderado por horas.
    fte: f.horas_ruta > 0 ? Math.round((f.horas_hombre / f.horas_ruta) * 100) / 100 : null,
    viajes: f.viajes,
    tlp: f.tlp,
    tiempoPdv: f.tiempo_pdv,
  })

  return {
    anio: Number(mes.slice(0, 4)),
    hasta: rangoMes(mes).hasta,
    total: nodo(data.total),
    ciudades: [...data.por_ciudad].sort((a, b) => b.ceq - a.ceq).map(nodo),
  }
}

const fmtN = (n: number, dec = 0) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)

const fmtTlp = (v: number | null) => (v == null ? "—" : fmtN(v, 2))

function tlpColor(v: number | null, meta: TlpMeta = TLP_META_GLOBAL): string {
  const estado = estadoSemaforo(v, meta.meta, meta.gatillo, "mayor")
  if (estado === "verde") return "text-emerald-700"
  if (estado === "amarillo") return "text-amber-700"
  if (estado === "rojo") return "text-red-700"
  return "text-slate-400"
}

export function TlpClient({
  mes,
  data,
  planesIniciales,
  evolucion,
  arbol,
}: {
  mes: string
  data: TlpResumen
  planesIniciales: TlpPlan[]
  evolucion: TlpEvolucionAnual | null
  arbol: TlpArbol | null
}) {
  const router = useRouter()
  const t = data.total
  const { desde, hasta } = rangoMes(mes)
  const [rutaFiltro, setRutaFiltro] = useState<RutaFiltro | null>(null)
  // El detalle de horas suele abrirse sobre el mes, pero el árbol es YTD:
  // cada origen fija el rango con el que se abre el modal.
  const [rutaRango, setRutaRango] = useState<{ desde: string; hasta: string } | null>(null)
  const [modoArbol, setModoArbol] = useState<ModoArbol>("mes")

  const abrirRuta = (filtro: RutaFiltro, rango?: { desde: string; hasta: string }) => {
    setRutaRango(rango ?? null)
    setRutaFiltro(filtro)
  }

  // El árbol arranca en el mes del filtro; el YTD sale del barrido anual que ya
  // hace la página (y es el número que muestra el Árbol del Sueño).
  const arbolMes = useMemo(() => arbolDelMes(data, mes), [data, mes])
  const ytdDisponible = modoArbol === "ytd" && arbol != null
  const arbolVisible = ytdDisponible ? arbol : arbolMes
  const periodoArbol = ytdDisponible
    ? `${arbol!.anio} acumulado`
    : `${MES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
  const rangoArbol = ytdDisponible
    ? { desde: `${arbol!.anio}-01-01`, hasta: arbol!.hasta }
    : { desde, hasta }

  // Catálogos para el foco de los planes.
  const ciudades = data.por_ciudad.map((f) => f.ciudad)
  const patentes = data.por_patente.map((f) => f.patente)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            TLP · Transport Labor Productivity
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cajas equivalentes entregadas ÷ horas-hombre en ruta (CEq/HH) — Pilar Entrega 1.3
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Mes
          <input
            type="month"
            value={mes}
            onChange={(e) =>
              e.target.value && router.push(`/indicadores/tlp?mes=${e.target.value}`)
            }
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400"
          />
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Gauge className="size-5 text-slate-400" />}
          label="TLP del mes"
          value={fmtTlp(t.tlp)}
          sub={`meta ${TLP_META_GLOBAL.meta} · gatillo ${TLP_META_GLOBAL.gatillo} CEq/HH`}
          valueClass={tlpColor(t.tlp)}
        />
        <Kpi
          icon={<Package className="size-5 text-slate-400" />}
          label="CEq entregadas"
          value={fmtN(t.ceq)}
          sub={`${fmtN(t.viajes)} viajes`}
        />
        <Kpi
          icon={<Clock className="size-5 text-slate-400" />}
          label="Horas-hombre"
          value={fmtN(t.horas_hombre, 1)}
          sub={`${fmtN(t.horas_ruta, 1)} h en ruta`}
        />
        <Kpi
          icon={<Truck className="size-5 text-slate-400" />}
          label="Viajes"
          value={fmtN(data.viajes_con_ceq)}
          sub={
            data.viajes_horas_estimadas > 0
              ? `${fmtN(data.viajes_horas_estimadas)} con tiempo estimado`
              : "todos con checklist de retorno"
          }
        />
      </div>

      {data.historico && (
        <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Mes de <strong>cierre</strong>: el checklist de retorno arrancó el 9 de abril, así que
            este mes no se calcula viaje a viaje. El TLP sale de las CEq del mes ÷ (camiones a la
            calle × dotación promedio × horas promedio de las rutas limpias de Foxtrot), y por eso
            no abre por ciudad.
          </span>
        </div>
      )}

      {(data.viajes_sin_tiempo > 0 || data.viajes_fte_fallback > 0 || data.viajes_horas_estimadas > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {data.viajes_horas_estimadas > 0 && (
              <>
                <strong>{fmtN(data.viajes_horas_estimadas)}</strong> viaje
                {data.viajes_horas_estimadas === 1 ? "" : "s"} sin checklist de retorno: el
                tiempo en ruta se estimó con los viajes medidos de esa misma patente que
                llevaron una carga parecida (CEq ±25%).{" "}
              </>
            )}
            {data.viajes_fte_fallback > 0 && (
              <>
                <strong>{fmtN(data.viajes_fte_fallback)}</strong> viaje
                {data.viajes_fte_fallback === 1 ? "" : "s"} sin registro de egreso: la
                dotación se estimó con el FTE promedio de esa patente en el mes.{" "}
              </>
            )}
            {data.viajes_sin_tiempo > 0 && (
              <>
                <strong>{fmtN(data.viajes_sin_tiempo)}</strong> viaje
                {data.viajes_sin_tiempo === 1 ? "" : "s"} quedaron sin tiempo en ruta y no
                entran al cálculo.
              </>
            )}
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => abrirRuta({ tipo: "all", label: "Todos los viajes" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Info className="size-3.5" />
          ¿Cómo se calculan las horas en ruta?
        </button>
      </div>

      {/* Árbol del TLP: el mes del filtro, o el YTD (el del Árbol del Sueño) */}
      {arbolVisible && arbolVisible.ciudades.length > 0 && (
        <ArbolTlp
          arbol={arbolVisible}
          modo={modoArbol}
          onModo={setModoArbol}
          periodoLabel={periodoArbol}
          onCiudad={(ciudad) =>
            abrirRuta(
              { tipo: "ciudad", valor: ciudad, label: `${ciudad} · ${periodoArbol}` },
              rangoArbol,
            )
          }
        />
      )}

      {/* Por ciudad */}
      <TablaTlp
        titulo="Por ciudad"
        labelCol="Ciudad"
        filas={data.por_ciudad.map((f) => ({ label: f.ciudad, meta: tlpMetaDe(f.ciudad), ...f }))}
        conMeta
        onRow={(label) => abrirRuta({ tipo: "ciudad", valor: label, label })}
      />

      {/* Objetivo por ciudad: evolución mensual del año */}
      {evolucion && evolucion.meses.length > 0 && (
        <EvolucionPorCiudad evolucion={evolucion} />
      )}

      {/* Por camión */}
      <TablaTlp
        titulo="Por camión"
        labelCol="Patente"
        mono
        filas={data.por_patente.map((f) => ({ label: f.patente, meta: TLP_META_GLOBAL, ...f }))}
        onRow={(label) => abrirRuta({ tipo: "patente", valor: label, label })}
      />

      {/* Planes de acción (foco ciudad / camión) */}
      <PlanesAccionBloque
        planesIniciales={planesIniciales}
        ciudades={ciudades}
        patentes={patentes}
      />

      <TlpRutaDetalleDialog
        open={!!rutaFiltro}
        onClose={() => setRutaFiltro(null)}
        desde={rutaRango?.desde ?? desde}
        hasta={rutaRango?.hasta ?? hasta}
        filtro={rutaFiltro}
      />
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-0.5 text-2xl font-bold tabular-nums ${valueClass ?? "text-slate-900"}`}>
              {value}
            </p>
            <p className="text-[11px] text-muted-foreground">{sub}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

interface FilaTlp {
  label: string
  ceq: number
  horas_ruta: number
  horas_hombre: number
  viajes: number
  tlp: number | null
  meta?: TlpMeta
}

function TablaTlp({
  titulo,
  labelCol,
  filas,
  mono,
  onRow,
  conMeta,
}: {
  titulo: string
  labelCol: string
  filas: FilaTlp[]
  mono?: boolean
  onRow?: (label: string) => void
  conMeta?: boolean
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
        {onRow && (
          <span className="text-xs text-muted-foreground">tocá una fila para ver sus horas en ruta</span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labelCol}</TableHead>
                <TableHead className="text-right">CEq</TableHead>
                <TableHead className="text-right">Hs ruta</TableHead>
                <TableHead className="text-right">Hs-hombre</TableHead>
                <TableHead className="text-right">Viajes</TableHead>
                <TableHead className="text-right">TLP</TableHead>
                {conMeta && <TableHead className="text-right">Meta</TableHead>}
                {onRow && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(onRow ? 7 : 6) + (conMeta ? 1 : 0)} className="py-6 text-center text-sm text-muted-foreground">
                    Sin datos para este mes.
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((f) => (
                  <TableRow
                    key={f.label}
                    onClick={onRow ? () => onRow(f.label) : undefined}
                    className={onRow ? "group cursor-pointer hover:bg-slate-50" : undefined}
                  >
                    <TableCell className={mono ? "font-mono text-xs" : "font-medium"}>
                      {f.label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtN(f.ceq)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-slate-700 group-hover:text-sky-700">{fmtN(f.horas_ruta, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{fmtN(f.horas_hombre, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{fmtN(f.viajes)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${tlpColor(f.tlp, f.meta)}`}>
                      {fmtTlp(f.tlp)}
                    </TableCell>
                    {conMeta && (
                      <TableCell className="text-right tabular-nums text-slate-400">
                        {f.meta ? `${f.meta.meta}` : "—"}
                      </TableCell>
                    )}
                    {onRow && (
                      <TableCell className="px-2 text-slate-300">
                        <ChevronRight className="size-4 transition-colors group-hover:text-slate-500" />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function EvolucionPorCiudad({ evolucion }: { evolucion: TlpEvolucionAnual }) {
  const filas: TlpEvolucionFila[] = [...evolucion.filas, evolucion.total]
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Objetivo por ciudad · evolución {evolucion.anio}
        </h3>
        <span className="text-xs text-muted-foreground">
          verde ≥ meta · amarillo ≥ gatillo · rojo &lt; gatillo
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciudad</TableHead>
                {evolucion.meses.map((m) => (
                  <TableHead key={m} className="text-right">
                    {MES_CORTO[m - 1]}
                  </TableHead>
                ))}
                <TableHead className="text-right">YTD</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">Gatillo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => {
                const esTotal = f.ciudad === "Total"
                const meta = esTotal ? TLP_META_GLOBAL : tlpMetaDe(f.ciudad)
                return (
                  <TableRow key={f.ciudad} className={esTotal ? "bg-slate-50 font-semibold" : undefined}>
                    <TableCell className="font-medium">
                      {esTotal ? "Total Mercosur" : f.ciudad}
                    </TableCell>
                    {evolucion.meses.map((m) => {
                      const v = f.meses[m] ?? null
                      return (
                        <TableCell
                          key={m}
                          className={`text-right tabular-nums ${tlpColor(v, meta)}`}
                        >
                          {v == null ? "—" : fmtN(v, 1)}
                        </TableCell>
                      )
                    })}
                    <TableCell className={`text-right font-semibold tabular-nums ${tlpColor(f.ytd, meta)}`}>
                      {f.ytd == null ? "—" : fmtN(f.ytd, 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{meta.meta}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-400">{meta.gatillo}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Meta = mejor mes completo ya logrado por la ciudad (abr–jun 2026) · Gatillo = piso demostrado (peor mes). El TLP varía por ciudad según sus horas en ruta: cada una mide contra su propio objetivo.
      </p>
    </div>
  )
}
