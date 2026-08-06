"use client"

import { useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  AlertTriangle,
  Camera,
  Info,
  Loader2,
  MessageSquare,
  PackageX,
  ShieldCheck,
  TrendingDown,
} from "lucide-react"
import {
  getQuiebresMes,
  guardarComentarioQuiebre,
  type ComentarioQuiebre,
  type QuiebresMes,
} from "@/actions/quiebres-stock"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

interface Props {
  inicial: QuiebresMes
  meses: { anio: number; mes: number }[]
}

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })

/**
 * Códigos de SKU del producto, los que movieron primero. Una familia agrupa
 * varios códigos —es el punto del indicador— así que se muestran todos los que
 * tuvieron volumen: son los que uno busca en Chess.
 */
function codigosDe(f: { skus: { id_articulo: number; bultos_mes: number; bultos_previo: number }[] }) {
  const orden = [...f.skus].sort(
    (a, b) => b.bultos_mes + b.bultos_previo - (a.bultos_mes + a.bultos_previo),
  )
  const conMovimiento = orden.filter((s) => s.bultos_mes > 0 || s.bultos_previo > 0)
  const lista = (conMovimiento.length ? conMovimiento : orden).slice(0, 4)
  const resto = (conMovimiento.length ? conMovimiento : orden).length - lista.length
  return lista.map((s) => s.id_articulo).join(" · ") + (resto > 0 ? ` +${resto}` : "")
}

export function QuiebresStockClient({ inicial, meses }: Props) {
  const [datos, setDatos] = useState(inicial)
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  const clave = `${datos.anio}-${datos.mes}`

  function cambiarMes(valor: string | null) {
    if (!valor) return
    const [anio, mes] = valor.split("-").map(Number)
    setError(null)
    startTransition(async () => {
      const res = await getQuiebresMes({ anio, mes, minDias: datos.min_dias })
      if ("error" in res) setError(res.error)
      else setDatos(res.data)
    })
  }

  const conQuiebre = useMemo(
    () => datos.familias.filter((f) => f.dias_quiebre > 0),
    [datos.familias],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quiebres de Stock</h1>
          <p className="text-sm text-muted-foreground">
            Día a día, qué producto quedó sin stock — Pilar Almacén
          </p>
        </div>
        <Select value={clave} onValueChange={cambiarMes} disabled={pendiente}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meses.map((m) => (
              <SelectItem key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`}>
                {MESES[m.mes - 1]} {m.anio}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* De dónde sale el número. Va arriba de todo a propósito: mientras la
          fuente sea la venta, esto es una inferencia y quien lo lea tiene que
          saberlo antes de mirar la grilla. */}
      <FuenteAviso datos={datos} />

      {/* Puntaje del variable — el número que se paga */}
      <Card className="border-l-4 border-l-slate-900">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Puntaje del mes
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span
                  className={`text-4xl font-bold ${
                    datos.kpis.puntaje_neto === 100 ? "text-emerald-600" : "text-slate-900"
                  }`}
                >
                  {datos.kpis.puntaje_neto}%
                </span>
                {datos.kpis.puntaje_bruto !== datos.kpis.puntaje_neto && (
                  <span className="text-sm text-muted-foreground">
                    bruto {datos.kpis.puntaje_bruto}% · {datos.kpis.familias_no_imputables} no
                    imputable{datos.kpis.familias_no_imputables === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                100% menos {datos.kpis.descuento_por_quiebre} puntos por cada producto que
                quebró {datos.min_dias}+ días. Se descuenta una vez por producto, aunque
                haya quebrado dos veces en el mes.
              </p>
            </div>
            {datos.kpis.familias_sin_causa > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>{datos.kpis.familias_sin_causa}</strong> quiebre
                {datos.kpis.familias_sin_causa === 1 ? "" : "s"} sin causa cargada. Hasta que
                se clasifiquen, descuentan en los dos números.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          titulo="Productos con quiebre"
          valor={`${datos.kpis.familias_con_quiebre} / ${datos.kpis.universo}`}
          detalle={`${datos.min_dias}+ días operativos seguidos sin movimiento`}
          alerta={datos.kpis.familias_con_quiebre > 0}
          icono={<PackageX className="h-5 w-5" />}
        />
        <Kpi
          titulo="Días-producto en quiebre"
          valor={nf.format(datos.kpis.dias_familia_quiebre)}
          detalle={`sobre ${nf.format(datos.kpis.dias_familia_posibles)} posibles`}
          icono={<TrendingDown className="h-5 w-5" />}
        />
        <Kpi
          titulo="% del mes en quiebre"
          valor={`${datos.kpis.pct_quiebre.toFixed(1)}%`}
          detalle={`${datos.dias_operativos.length} días operativos`}
          alerta={datos.kpis.pct_quiebre > 5}
          icono={<AlertTriangle className="h-5 w-5" />}
        />
        <Kpi
          titulo="Rechazos SIN STOCK"
          valor={nf.format(datos.kpis.rechazos_sin_stock)}
          detalle="motivo 13 — sólo ve el quiebre que llegó al camión"
          icono={<PackageX className="h-5 w-5" />}
        />
      </div>

      {/* Grilla día × producto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Calendario de quiebres — top {datos.kpis.universo} por rotación
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Una fila por producto físico (marca + calibre), no por SKU: los códigos
            migran y una migración de código imita un quiebre perfecto.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-medium text-slate-500">
                    Producto
                  </th>
                  {datos.dias_operativos.map((d) => (
                    <th
                      key={d}
                      className="px-0.5 py-1 text-center font-normal text-slate-400"
                      title={d}
                    >
                      {d.slice(8)}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right font-medium text-slate-500">Días</th>
                </tr>
              </thead>
              <tbody>
                {datos.familias.map((f) => (
                  <tr key={f.familia} className="hover:bg-slate-50">
                    <td
                      className="sticky left-0 z-10 max-w-[260px] cursor-pointer bg-white px-2 py-1 hover:bg-slate-50"
                      title={`${f.familia} — SKU ${codigosDe(f)}`}
                      onClick={() => setAbierta(abierta === f.familia ? null : f.familia)}
                    >
                      <div className="truncate">{f.familia}</div>
                      <div className="truncate font-mono text-[10px] text-slate-400">
                        {codigosDe(f)}
                      </div>
                    </td>
                    {datos.dias_operativos.map((d) => {
                      const bultos = f.por_dia[d] ?? 0
                      const stockCero = f.dias_stock_cero.includes(d)
                      const vendio = bultos > 0
                      const enVentana = f.ventanas.some((v) => d >= v.desde && d <= v.hasta)
                      return (
                        <td key={d} className="px-0.5 py-1 text-center">
                          <span
                            className={`inline-block h-4 w-4 rounded-sm ${
                              stockCero
                                ? "bg-red-600"
                                : enVentana
                                  ? "bg-red-300"
                                  : vendio
                                    ? "bg-emerald-200"
                                    : "bg-slate-100"
                            }`}
                            title={`${d} · ${vendio ? `${nf.format(bultos)} bultos` : "sin movimiento"}${stockCero ? " · foto: stock 0" : ""}`}
                          />
                        </td>
                      )
                    })}
                    <td className="px-2 py-1 text-right font-medium">
                      {f.dias_quiebre > 0 ? (
                        <span className="text-red-600">{f.dias_quiebre}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <Leyenda color="bg-emerald-200" texto="vendió" />
            <Leyenda color="bg-red-600" texto="stock 0 (foto de la mañana)" />
            <Leyenda color="bg-red-300" texto="sin movimiento (inferido)" />
            <Leyenda color="bg-slate-100" texto="sin movimiento, racha corta" />
            {datos.dias_descartados.length > 0 && (
              <span>
                Descartados:{" "}
                {datos.dias_descartados
                  .map((d) => `${d.fecha.slice(5)} (${d.motivo})`)
                  .join(" · ")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detalle de los que quebraron */}
      {conQuiebre.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Detalle — {conQuiebre.length} producto{conQuiebre.length === 1 ? "" : "s"} con quiebre
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Abrí cada uno para ver los SKUs que lo componen. Si un código cae a
              cero y otro de la misma familia arranca, fue cambio de envase y no
              quiebre — el indicador ya lo trata como un solo producto.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {conQuiebre.map((f) => (
              <div key={f.familia} className="rounded-lg border border-slate-200">
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => setAbierta(abierta === f.familia ? null : f.familia)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {f.familia}{" "}
                      <span className="font-mono text-xs font-normal text-slate-400">
                        {codigosDe(f)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.ventanas
                        .map((v) => `${v.desde.slice(5)} → ${v.hasta.slice(5)} (${v.dias}d)`)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(() => {
                      const c = datos.comentarios.find((x) => x.familia === f.familia)
                      if (c?.no_imputable) {
                        return (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">
                            <ShieldCheck className="mr-1 h-3 w-3" /> no descuenta
                          </Badge>
                        )
                      }
                      return (
                        <Badge variant="outline" className={c ? "" : "text-amber-600"}>
                          <MessageSquare className="mr-1 h-3 w-3" />
                          −{datos.kpis.descuento_por_quiebre} pts
                          {c ? "" : " · sin justificar"}
                        </Badge>
                      )
                    })()}
                    {f.rechazos_sin_stock > 0 && (
                      <Badge variant="destructive">
                        {f.rechazos_sin_stock} rechazo{f.rechazos_sin_stock === 1 ? "" : "s"} SIN STOCK
                      </Badge>
                    )}
                    {f.dias_stock_cero.length > 0 && (
                      <Badge variant="destructive">
                        <Camera className="mr-1 h-3 w-3" />
                        {f.dias_stock_cero.length}d con stock 0
                      </Badge>
                    )}
                    <Badge variant="outline">{f.dias_quiebre} días</Badge>
                    <Badge variant="outline">{nf.format(f.bultos_mes)} bultos</Badge>
                  </div>
                </button>
                {abierta === f.familia && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    <ComentarioEditor
                      familia={f.familia}
                      anio={datos.anio}
                      mes={datos.mes}
                      inicial={datos.comentarios.find((c) => c.familia === f.familia)}
                      descuento={datos.kpis.descuento_por_quiebre}
                      onGuardado={(c) =>
                        setDatos((d) => ({
                          ...d,
                          comentarios: [
                            ...d.comentarios.filter((x) => x.familia !== c.familia),
                            c,
                          ],
                        }))
                      }
                    />
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="py-1 text-left font-medium">SKU</th>
                          <th className="py-1 text-left font-medium">Descripción</th>
                          <th className="py-1 text-right font-medium">Mes anterior</th>
                          <th className="py-1 text-right font-medium">Mes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.skus.map((s) => (
                          <tr key={s.id_articulo} className="border-t border-slate-50">
                            <td className="py-1 font-mono">{s.id_articulo}</td>
                            <td className="py-1">
                              {s.ds_articulo}
                              {s.anulado && (
                                <Badge variant="outline" className="ml-2">anulado</Badge>
                              )}
                            </td>
                            <td className="py-1 text-right">{nf.format(s.bultos_previo)}</td>
                            <td
                              className={`py-1 text-right ${
                                s.bultos_mes === 0 && s.bultos_previo > 0 ? "font-semibold text-red-600" : ""
                              }`}
                            >
                              {nf.format(s.bultos_mes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Por qué quebró. No sale de ningún sistema: lo sabe quien compra, y es lo que
 * separa el quiebre evitable del que no lo era. Se guarda por producto y mes.
 */
function ComentarioEditor({
  familia,
  anio,
  mes,
  inicial,
  descuento: DESCUENTO,
  onGuardado,
}: {
  familia: string
  anio: number
  mes: number
  inicial?: ComentarioQuiebre
  descuento: number
  onGuardado: (c: ComentarioQuiebre) => void
}) {
  const [texto, setTexto] = useState(inicial?.comentario ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const noDescuenta = inicial?.no_imputable ?? false
  const textoSucio = texto !== (inicial?.comentario ?? "")
  const hayJustificacion = texto.trim().length > 0

  async function guardar(noImputable: boolean) {
    setGuardando(true)
    setError(null)
    setOk(false)
    const res = await guardarComentarioQuiebre({
      familia,
      anio,
      mes,
      comentario: texto,
      noImputable,
    })
    setGuardando(false)
    if ("error" in res) setError(res.error)
    else {
      onGuardado(res.data)
      setOk(true)
    }
  }

  return (
    <div
      className={`mb-3 rounded-md p-3 ${noDescuenta ? "bg-emerald-50" : "bg-slate-50"}`}
    >
      <Label className="text-xs font-medium text-slate-700">
        ¿Por qué quebró?{" "}
        <span className="font-normal text-muted-foreground">
          {noDescuenta
            ? "— justificado, este quiebre no descuenta"
            : `— hoy descuenta ${DESCUENTO} puntos`}
        </span>
      </Label>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej: no había en fábrica · no se vende, hay que sacarlo del universo · pedido tardío"
        className="mt-1 min-h-[60px] bg-white text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {error && <span className="text-red-600">{error}</span>}
          {!error && ok && !textoSucio && <span className="text-emerald-600">Guardado</span>}
          {!error && !ok && inicial?.updated_at && !textoSucio && (
            <span>últ. edición {inicial.updated_at.slice(0, 10)}</span>
          )}
          {!hayJustificacion && !noDescuenta && (
            <span>Escribí el motivo para poder no descontarlo.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {guardando && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {/* Guardar el motivo sin sacarle el descuento: el quiebre fue
              evitable, pero queda escrito qué pasó. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => guardar(noDescuenta)}
            disabled={guardando || !textoSucio}
          >
            Guardar motivo
          </Button>
          {noDescuenta ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => guardar(false)}
              disabled={guardando}
            >
              Volver a descontar
            </Button>
          ) : (
            // Exige justificación escrita: sacar el descuento sin decir por qué
            // es exactamente lo que después no se puede defender en una
            // discusión con el empleado.
            <Button
              size="sm"
              onClick={() => guardar(true)}
              disabled={guardando || !hayJustificacion}
            >
              <ShieldCheck className="mr-1 h-3 w-3" />
              No descontar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function FuenteAviso({ datos }: { datos: QuiebresMes }) {
  if (datos.fuente === "stock") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <Camera className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-medium">Medido con stock real.</span> Los{" "}
          {datos.dias_operativos.length} días operativos del mes tienen foto de la
          mañana. El quiebre es un hecho registrado, no una inferencia.
        </p>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {datos.fuente === "mixta" ? (
          <>
            <span className="font-medium">Fuente mixta.</span> {datos.dias_con_foto.length} de{" "}
            {datos.dias_operativos.length} días tienen foto de stock; el resto se
            infiere de la ausencia de venta.
          </>
        ) : (
          <>
            <span className="font-medium">Inferido de la venta, no del stock.</span> Este
            mes no tiene fotos de la mañana: el quiebre se deduce de que el producto
            no movió nada {datos.min_dias}+ días operativos seguidos.
          </>
        )}{" "}
        Sirve para priorizar y para revisarlo con el comprador. Para pagar un
        variable hace falta la foto diaria — sin ella no distingue quiebre de caída
        de demanda.
      </p>
    </div>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
  alerta,
  icono,
}: {
  titulo: string
  valor: string
  detalle: string
  alerta?: boolean
  icono: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className={alerta ? "text-red-500" : ""}>{icono}</span>
          <p className="text-xs font-medium uppercase tracking-wide">{titulo}</p>
        </div>
        <p className={`mt-2 text-2xl font-bold ${alerta ? "text-red-600" : "text-slate-900"}`}>
          {valor}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  )
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
      {texto}
    </span>
  )
}
