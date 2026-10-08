"use client"

// Costo de neumáticos por unidad, al mismo estilo que el filtro de costos de
// "Órdenes de Trabajo": se elige unidad, concepto y período, y el cuadro de
// arriba dice cuánta plata es.
//
// 🚨 Por qué vive acá y no sumado al costo de las OT: el fierro (la cubierta y
// el recapado) se imputa en Neumáticos y la OT de mantenimiento se queda con la
// MANO DE OBRA. Así los dos totales se pueden sumar sin contar la misma plata
// dos veces. El caso que lo motivó fue la OT 1772 del AE591EI (15/09/2026), que
// traía las 4 cubiertas Dayton como repuestos Y como comprobante de Marsilli,
// mientras las mismas 4 cubiertas ya tenían su costo unitario en el parque: el
// EI figuraba con $1,85 M de goma en los dos lados.
//
// Dos fuentes, las mismas dos que ya usa el módulo:
//  - compra de cubiertas → `mantenimiento_neumaticos` (costo unitario + fecha
//    de compra). Es lo que mostraba la solapa "Compras y costos" de cada unidad,
//    pero una unidad a la vez y sin el recapado.
//  - servicio de recapado → los ítems del remito, que ya traen el costo
//    repartido por cubierta y de qué unidad venía cada una.

import { useMemo, useState } from "react"
import { CircleDollarSign, ChevronDown, ChevronRight } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Neumatico, Recapado } from "@/lib/vehiculos/neumaticos-tipos"
import type { VehiculoTipo } from "@/types/database"

import { KpiCard } from "./kpi-card"
import {
  FiltroPeriodo,
  dentroDe,
  etiquetaDe,
  periodoInicial,
  rangoDe,
  type PeriodoState,
} from "./filtro-periodo"

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

const fmtMesLargo = (ym: string) =>
  new Date(`${ym}-01T12:00:00`).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })

/** Fila "sin unidad": cubiertas en stock y recapados sin unidad de origen. */
const SIN_UNIDAD = "__sin_unidad__"

const TIPO_UNIDAD_LABEL: Record<string, string> = {
  camion: "Camión",
  camioneta: "Camioneta",
  utilitario: "Utilitario",
  acoplado: "Acoplado",
  autoelevador: "Autoelevador",
}

type Concepto = "nueva" | "recapado"

const CONCEPTO_LABEL: Record<Concepto, string> = {
  nueva: "Cubierta nueva",
  recapado: "Recapado",
}

interface LineaCosto {
  id: string
  /** Compra: fecha de factura. Recapado: fecha en que volvió del recapador. */
  fecha: string | null
  dominio: string | null
  concepto: Concepto
  detalle: string
  proveedor: string | null
  monto: number
}

interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
}

/**
 * Las dos fuentes de plata de goma, pasadas a una lista plana de líneas.
 *
 * La cubierta se imputa a la unidad que la tiene puesta (`dominio`); si está en
 * stock o ya se dio de baja queda en "sin unidad". El recapado se imputa a la
 * unidad de la que se desmontó (`dominio_origen`), que es la que gastó la goma.
 */
function armarLineas(neumaticos: Neumatico[], recapados: Recapado[]): LineaCosto[] {
  const lineas: LineaCosto[] = []

  for (const n of neumaticos) {
    if (n.costo_unitario == null) continue
    const monto = Number(n.costo_unitario)
    if (!(monto > 0)) continue
    const cubierta = [n.marca, n.medida].filter(Boolean).join(" ")
    lineas.push({
      id: `cub-${n.id}`,
      fecha: n.fecha_compra,
      dominio: n.dominio,
      // Una cubierta comprada ya recapada es gasto de recapado, no de goma nueva.
      concepto: n.tipo === "recapado" ? "recapado" : "nueva",
      detalle: [cubierta || "Cubierta", n.numero ? `N° ${n.numero}` : null]
        .filter(Boolean)
        .join(" · "),
      proveedor: n.proveedor,
      monto,
    })
  }

  for (const r of recapados) {
    for (const it of r.items ?? []) {
      if (it.costo == null) continue
      const monto = Number(it.costo)
      if (!(monto > 0)) continue
      const numero = it.numero_retorno ?? it.numero_envio
      lineas.push({
        id: `rec-${it.id}`,
        // El costo se conoce cuando vuelve con la factura; si todavía está en el
        // recapador, se imputa a la fecha en que salió.
        fecha: r.fecha_retorno ?? r.fecha_envio,
        dominio: it.dominio_origen,
        concepto: "recapado",
        detalle: [
          numero ? `Cubierta N° ${numero}` : "Cubierta sin numerar",
          r.numero_remito ? `remito ${r.numero_remito}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        proveedor: r.proveedor,
        monto,
      })
    }
  }

  return lineas.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
}

interface Totales {
  nueva: number
  recapado: number
  total: number
  cubiertas: number
}

const totalesVacios = (): Totales => ({ nueva: 0, recapado: 0, total: 0, cubiertas: 0 })

function sumar(acc: Totales, l: LineaCosto): Totales {
  acc[l.concepto] += l.monto
  acc.total += l.monto
  acc.cubiertas++
  return acc
}

export function CostosNeumaticosPanel({
  neumaticos,
  recapados,
  unidades,
}: {
  neumaticos: Neumatico[]
  recapados: Recapado[]
  unidades: UnidadFlota[]
}) {
  const [periodo, setPeriodo] = useState<PeriodoState>(() => periodoInicial("anio"))
  const [fUnidad, setFUnidad] = useState("todos")
  const [fConcepto, setFConcepto] = useState("todos")
  const [agrupar, setAgrupar] = useState<"unidad" | "mes">("unidad")
  const [verDetalle, setVerDetalle] = useState(false)

  const todas = useMemo(() => armarLineas(neumaticos, recapados), [neumaticos, recapados])

  const anios = useMemo(
    () =>
      Array.from(new Set(todas.filter((l) => l.fecha).map((l) => l.fecha!.slice(0, 4)))).sort(
        (a, b) => b.localeCompare(a)
      ),
    [todas]
  )

  const rango = useMemo(() => rangoDe(periodo), [periodo])

  const lineas = useMemo(() => {
    // Con el período en "histórico completo" el rango queda abierto de los dos
    // lados: ahí también entran las líneas sin fecha (cubiertas viejas cargadas
    // sin fecha de compra), que en cualquier recorte quedarían afuera.
    const abierto = !rango.desde && !rango.hasta
    return todas.filter((l) => {
      if (!abierto && !dentroDe(l.fecha, rango)) return false
      if (fConcepto !== "todos" && l.concepto !== fConcepto) return false
      if (fUnidad === "todos") return true
      if (fUnidad === SIN_UNIDAD) return l.dominio == null
      return l.dominio === fUnidad
    })
  }, [todas, rango, fConcepto, fUnidad])

  const total = useMemo(() => lineas.reduce(sumar, totalesVacios()), [lineas])

  /** Cubiertas del parque sin precio: es lo que le falta al total para ser real. */
  const sinCosto = useMemo(
    () => neumaticos.filter((n) => n.costo_unitario == null).length,
    [neumaticos]
  )

  const tipoPorDominio = useMemo(
    () => new Map(unidades.map((u) => [u.dominio, u.tipo])),
    [unidades]
  )

  const filas = useMemo(() => {
    const mapa = new Map<string, Totales>()
    for (const l of lineas) {
      const clave =
        agrupar === "unidad" ? (l.dominio ?? SIN_UNIDAD) : (l.fecha?.slice(0, 7) ?? "sin-fecha")
      if (!mapa.has(clave)) mapa.set(clave, totalesVacios())
      sumar(mapa.get(clave)!, l)
    }
    const arr = Array.from(mapa.entries()).map(([clave, t]) => ({ clave, ...t }))
    // Por unidad: la que más gastó arriba. Por mes: cronológico inverso.
    return agrupar === "unidad"
      ? arr.sort((a, b) => b.total - a.total)
      : arr.sort((a, b) => b.clave.localeCompare(a.clave))
  }, [lineas, agrupar])

  const dominiosConGasto = useMemo(
    () => Array.from(new Set(todas.map((l) => l.dominio).filter((d): d is string => d != null))).sort(),
    [todas]
  )
  const haySinUnidad = useMemo(() => todas.some((l) => l.dominio == null), [todas])

  const etiquetaClave = (clave: string) => {
    if (agrupar === "mes") return clave === "sin-fecha" ? "Sin fecha" : fmtMesLargo(clave)
    return clave === SIN_UNIDAD ? "Sin unidad" : clave
  }

  return (
    <Card id="costos-neumaticos">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDollarSign className="size-4 text-muted-foreground" aria-hidden />
          Costo de neumáticos por unidad
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cubiertas nuevas (precio de compra) y recapados (costo del servicio, repartido por
          cubierta). No incluye la mano de obra del montaje, la rotación ni la alineación: eso va
          en las OT de mantenimiento, para que los dos totales no cuenten la misma plata.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filtros: unidad, concepto y período (día, mes, año o rango) */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Unidad</Label>
            <Select value={fUnidad} onValueChange={(v: string | null) => setFUnidad(v ?? "todos")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {dominiosConGasto.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
                {haySinUnidad && <SelectItem value={SIN_UNIDAD}>Sin unidad</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Concepto</Label>
            <Select
              value={fConcepto}
              onValueChange={(v: string | null) => setFConcepto(v ?? "todos")}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Nuevas y recapados</SelectItem>
                <SelectItem value="nueva">Sólo cubiertas nuevas</SelectItem>
                <SelectItem value="recapado">Sólo recapados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Período</Label>
            <FiltroPeriodo value={periodo} onChange={setPeriodo} anios={anios} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Ver</Label>
            <Select
              value={agrupar}
              onValueChange={(v: string | null) => setAgrupar(v === "mes" ? "mes" : "unidad")}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unidad">Por unidad</SelectItem>
                <SelectItem value="mes">Por mes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto rounded-lg border bg-muted/50 px-4 py-2 text-right">
            <p className="text-xs font-medium text-muted-foreground">
              Costo total ({total.cubiertas}{" "}
              {total.cubiertas === 1 ? "cubierta" : "cubiertas"}) · {etiquetaDe(rango)}
            </p>
            <p className="text-xl font-bold text-foreground">{fmtMoney(total.total)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total del período" valor={fmtMoney(total.total)} sub={etiquetaDe(rango)} />
          <KpiCard
            label="Cubiertas nuevas"
            valor={fmtMoney(total.nueva)}
            sub="Precio de compra de la goma"
          />
          <KpiCard
            label="Recapados"
            valor={fmtMoney(total.recapado)}
            sub="Servicio, repartido por cubierta"
          />
          <KpiCard
            label="Sin costo cargado"
            valor={`${sinCosto} de ${neumaticos.length}`}
            estado={sinCosto > 0 ? "alerta" : "ok"}
            sub="Cubiertas del parque sin precio: lo que le falta al total para ser real"
          />
        </div>

        {filas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay costos de neumáticos cargados en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-2">{agrupar === "unidad" ? "Unidad" : "Mes"}</th>
                  {agrupar === "unidad" && <th>Tipo</th>}
                  <th className="text-right">Cubiertas</th>
                  <th className="text-right">Nuevas</th>
                  <th className="text-right">Recapados</th>
                  <th className="pr-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.clave} className="border-b last:border-0">
                    <td className="py-2 pl-2 font-medium capitalize">{etiquetaClave(f.clave)}</td>
                    {agrupar === "unidad" && (
                      <td className="text-muted-foreground">
                        {f.clave === SIN_UNIDAD
                          ? "stock / baja"
                          : (TIPO_UNIDAD_LABEL[tipoPorDominio.get(f.clave) ?? ""] ?? "—")}
                      </td>
                    )}
                    <td className="text-right tabular-nums text-muted-foreground">{f.cubiertas}</td>
                    <td className="text-right tabular-nums">
                      {f.nueva > 0 ? fmtMoney(f.nueva) : "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {f.recapado > 0 ? fmtMoney(f.recapado) : "—"}
                    </td>
                    <td className="pr-2 text-right font-semibold tabular-nums">
                      {fmtMoney(f.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="py-2 pl-2">Total</td>
                  {agrupar === "unidad" && <td />}
                  <td className="text-right tabular-nums">{total.cubiertas}</td>
                  <td className="text-right tabular-nums">{fmtMoney(total.nueva)}</td>
                  <td className="text-right tabular-nums">{fmtMoney(total.recapado)}</td>
                  <td className="pr-2 text-right tabular-nums">{fmtMoney(total.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {lineas.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setVerDetalle((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {verDetalle ? (
                <ChevronDown className="size-3.5" aria-hidden />
              ) : (
                <ChevronRight className="size-3.5" aria-hidden />
              )}
              {verDetalle ? "Ocultar" : "Ver"} el detalle ({lineas.length}{" "}
              {lineas.length === 1 ? "línea" : "líneas"})
            </button>

            {verDetalle && (
              <div className="mt-2 max-h-96 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pl-2">Fecha</th>
                      <th>Unidad</th>
                      <th>Concepto</th>
                      <th>Detalle</th>
                      <th>Proveedor</th>
                      <th className="pr-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-1.5 pl-2 tabular-nums">{fmtFecha(l.fecha)}</td>
                        <td className="font-medium">{l.dominio ?? "—"}</td>
                        <td>
                          <Badge
                            variant="outline"
                            className={
                              l.concepto === "nueva"
                                ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            }
                          >
                            {CONCEPTO_LABEL[l.concepto]}
                          </Badge>
                        </td>
                        <td className="text-muted-foreground">{l.detalle}</td>
                        <td className="text-muted-foreground">{l.proveedor ?? "—"}</td>
                        <td className="pr-2 text-right tabular-nums">{fmtMoney(l.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
