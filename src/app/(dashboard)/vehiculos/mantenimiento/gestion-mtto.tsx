"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  History,
  Minus,
  Plus,
  Printer,
  Trash2,
  Truck,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { Checkbox } from "@/components/ui/checkbox"
import { DpoPuntoBadge, DpoResponde, DpoSeccionCinta } from "./_components/dpo-badge"
import { ProveedoresRepuestos } from "./_components/proveedores-repuestos"
import {
  PedidosRepuestosPanel,
  type OtParaPedido,
} from "@/components/flota/pedidos-repuestos-panel"
import {
  adoptarPoliticaSugerida,
  createConteo,
  createResiduo,
  deleteConteo,
  deleteGestionRow,
  deleteResiduo,
  getConteoDetalle,
  getMovimientosRepuesto,
  getSalidasPanol,
  registrarMovimientoRepuesto,
  setFrecuenciaRecuento,
  upsertRepuesto,
  type ConteoItemDetalle,
  type ConsumoRepuesto,
  type ConteoResumen,
  type MovimientoRepuesto,
  type PoliticaInventario,
  type Repuesto,
  type Residuo,
  type SalidaPanol,
} from "@/actions/mantenimiento-vehiculos"
import {
  CAUSA_DIFERENCIA_LABEL,
  CAUSAS_DIFERENCIA,
  ESTADO_STOCK_LABEL,
  type CausaDiferencia,
  type PoliticaItem,
} from "@/lib/flota/inventario-politica"
import type { MantenimientoProveedor } from "@/types/database"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}
const fmtNum = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v)
function parseNum(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s.replace(",", "."))
  return isNaN(n) ? null : n
}

// Escala única de badges del módulo: mismos tres tonos (crítico / alerta / ok)
// que el semáforo de <KpiCard>, en tokens que respetan el tema.
const BADGE_CRITICO = "border-destructive/30 bg-destructive/10 text-destructive"
const BADGE_OK =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
const BADGE_NEUTRO = "border-border bg-muted text-muted-foreground"

/**
 * Clase ABC de la pieza. A = lo que se mueve (hay que no quedarse sin), C = lo
 * que casi no sale. El color va de más a menos saturado, no de bueno a malo:
 * ser C no tiene nada de malo.
 */
const CLASE_ABC_BADGE: Record<string, string> = {
  A: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  B: "border-sky-500/20 bg-sky-500/5 text-sky-700/80 dark:text-sky-400/80",
  C: "border-border bg-muted text-muted-foreground",
}

const MATERIAL_LABEL: Record<string, string> = {
  neumaticos: "Neumáticos",
  aceite: "Aceite usado",
  filtros: "Filtros",
  baterias: "Baterías",
  chatarra: "Chatarra",
  otros: "Otros",
}

interface Props {
  dominios: string[]
  repuestos: Repuesto[]
  residuos: Residuo[]
  conteos: ConteoResumen[]
  /** Consumo real por pieza: respalda la política de stock declarada. */
  consumos: ConsumoRepuesto[]
  /** Política completa del pañol: sugeridos, FUERA/SOBRE, criticidad, valor (DPO 2.3). */
  politica: PoliticaInventario
  /** Proveedores (repuestos y talleres), para el maestro y la solapa Proveedores. */
  proveedores: MantenimientoProveedor[]
  /** Cada cuántos días se declaró el recuento físico. null = sin declarar. */
  recuentoFrecuenciaDias: number | null
  /** OT recientes y programadas, para colgar un pedido de la que lo espera. */
  otsParaPedido: OtParaPedido[]
  puedeEditar: boolean
}

const ESTADO_STOCK_BADGE: Record<PoliticaItem["estado"], string> = {
  fuera: "border-destructive/30 bg-destructive/10 text-destructive",
  sobre: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  sin_politica: "border-border bg-muted text-muted-foreground",
}

const CRITICIDAD_BADGE: Record<PoliticaItem["criticidad"]["nivel"], string> = {
  ALTA: "border-destructive/30 bg-destructive/10 text-destructive",
  MEDIA: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  BAJA: "border-border bg-muted text-muted-foreground",
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v)

export function GestionMtto({
  dominios,
  repuestos,
  residuos,
  conteos,
  consumos,
  politica,
  proveedores,
  recuentoFrecuenciaDias,
  otsParaPedido,
  puedeEditar,
}: Props) {
  const provNombre = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores])
  const [adoptando, setAdoptando] = useState(false)
  const adoptarTodos = async () => {
    if (!confirm("¿Adoptar la política sugerida (mínimo, objetivo, máximo y ABC) en todas las piezas del pañol?")) return
    setAdoptando(true)
    const res = await adoptarPoliticaSugerida({ repuestoId: "todos" })
    setAdoptando(false)
    if ("error" in res) return toast.error(res.error)
    if (res.warning) toast.warning(res.warning)
    else toast.success(`Política adoptada en ${res.actualizados} piezas`)
    refresh()
  }
  const adoptarUna = async (r: Repuesto) => {
    const res = await adoptarPoliticaSugerida({ repuestoId: r.id })
    if ("error" in res) return toast.error(res.error)
    if (res.warning) toast.warning(res.warning)
    else toast.success(`${r.nombre}: política adoptada`)
    refresh()
  }
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [dialog, setDialog] = useState<
    null | "repuesto" | "residuo" | "conteo" | "frecuencia"
  >(null)
  const [conteoVer, setConteoVer] = useState<ConteoResumen | null>(null)
  const [repuestoEdit, setRepuestoEdit] = useState<Repuesto | null>(null)
  const consumoPorPieza = useMemo(
    () => new Map(consumos.map((c) => [c.repuestoId, c])),
    [consumos]
  )
  /**
   * Estado del recuento contra la frecuencia declarada.
   *
   * R2.3.2 no pide sólo que los recuentos existan: pide una **frecuencia
   * definida**. Sin esto había dos recuentos sueltos y nada contra qué medir si
   * la rutina se cumplía.
   */
  // El "hoy" se fija una vez al montar: leer el reloj en cada render es impuro
  // y además haría parpadear el cálculo.
  const [hoyMs] = useState(() => Date.now())
  const recuento = useMemo(() => {
    const ultimo = conteos.map((c) => c.fecha).sort().at(-1) ?? null
    if (!ultimo) return { ultimo: null, dias: null as number | null, vencido: false }
    const dias = Math.floor((hoyMs - Date.parse(`${ultimo}T00:00:00`)) / 86_400_000)
    return {
      ultimo,
      dias,
      vencido: recuentoFrecuenciaDias != null && dias > recuentoFrecuenciaDias,
    }
  }, [conteos, recuentoFrecuenciaDias, hoyMs])
  // Movimiento de stock: repuesto + tipo inicial (ingreso/egreso) del botón.
  const [movimiento, setMovimiento] = useState<{
    repuesto: Repuesto
    tipo: "ingreso" | "egreso"
  } | null>(null)
  // Historial de movimientos del repuesto seleccionado.
  const [historialRep, setHistorialRep] = useState<Repuesto | null>(null)

  const borrar = async (
    tabla: "novedades" | "repuestos" | "ordenes_compra",
    id: string
  ) => {
    const res = await deleteGestionRow(tabla, id)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Eliminado")
      refresh()
    }
  }

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="repuestos" />

      <Tabs defaultValue="repuestos">
        <TabsList>
          <TabsTrigger value="repuestos">Inventario</TabsTrigger>
          <TabsTrigger value="salidas">Salidas a unidades</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos de repuestos</TabsTrigger>
          <TabsTrigger value="proveedores">Proveedores</TabsTrigger>
          <TabsTrigger value="residuos">Residuos</TabsTrigger>
        </TabsList>

        {/* ===== Trazabilidad al revés: del pañol a la unidad (R2.3.2) =====
            Vive en su propia solapa y no al pie del inventario: ahí, debajo de
            una tabla de 14 columnas, no se encontraba. */}
        <TabsContent value="salidas" className="space-y-3">
          <SalidasPanolCard />
        </TabsContent>

        {/* ===== Proveedores de piezas y ANS (DPO 2.3, R2.3.1a) ===== */}
        <TabsContent value="proveedores" className="space-y-3">
          <ProveedoresRepuestos
            proveedores={proveedores}
            repuestos={repuestos}
            puedeEditar={puedeEditar}
            columnasNuevas={politica.columnasNuevas}
          />
        </TabsContent>

        {/* ===== Residuos de mantenimiento (DPO 1.4) ===== */}
        <TabsContent value="residuos" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Disposición de residuos
                </h3>
                <DpoPuntoBadge numero="1.4" />
              </div>
              <p className="text-sm text-muted-foreground">
                Registro de disposición de residuos de mantenimiento (neumáticos, aceites,
                filtros…) con proveedor y certificado de descarte.
              </p>
              <DpoResponde puntos={["1.4"]} requisitos={["R1.4.1", "R1.4.2"]} />
            </div>
            {puedeEditar && (
              <Button size="sm" onClick={() => setDialog("residuo")}>
                <Plus className="mr-1 size-4" /> Registrar disposición
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {residuos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin disposiciones registradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>N° de fuego</TableHead>
                      <TableHead>Certificado</TableHead>
                      {puedeEditar && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {residuos.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(r.fecha)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={BADGE_NEUTRO}>
                            {MATERIAL_LABEL[r.material] ?? r.material}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-56 text-foreground">
                          {r.descripcion ?? "—"}
                          {r.observaciones && (
                            <span className="block text-xs text-muted-foreground">
                              {r.observaciones}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {r.cantidad != null ? `${fmtNum(r.cantidad)} ${r.unidad ?? ""}` : "—"}
                        </TableCell>
                        <TableCell className="text-foreground">{r.proveedor}</TableCell>
                        <TableCell className="max-w-40 text-xs text-muted-foreground">
                          {r.numeros_fuego ?? "—"}
                        </TableCell>
                        <TableCell>
                          {r.certificado_url ? (
                            <a
                              href={r.certificado_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <FileText className="size-3.5" /> Ver
                            </a>
                          ) : (
                            <span className="text-xs italic text-amber-600 dark:text-amber-400">
                              falta
                            </span>
                          )}
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive"
                              onClick={async () => {
                                const res = await deleteResiduo(r.id)
                                if ("error" in res) toast.error(res.error)
                                else {
                                  toast.success("Eliminado")
                                  refresh()
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Pedidos de repuestos (DPO 2.3) =====
            Reemplaza a Novedades y a Órdenes de compra, que hacían la mitad de
            esto cada una y entre las dos tenían una sola fila cargada. */}
        <TabsContent value="pedidos" className="space-y-3">
          <PedidosRepuestosPanel
            dominios={dominios}
            ots={otsParaPedido}
            puedeEditar={puedeEditar}
            proveedores={proveedores}
          />
        </TabsContent>

        {/* ===== Repuestos / Inventario (DPO 2.3) ===== */}
        <TabsContent value="repuestos" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Inventario de piezas
                </h3>
                <DpoPuntoBadge numero="2.3" />
              </div>
              <p className="text-sm text-muted-foreground">
                Stock mínimo, objetivo y máximo por pieza, con movimientos y conteos
                físicos que respaldan la exactitud del inventario.
              </p>
              <DpoResponde puntos={["2.3"]} requisitos={["R2.3.2", "R2.3.3"]} />
              {/* La frecuencia declarada y si la rutina se está cumpliendo: es
                  la mitad del R2.3.2 que no vivía en ningún lado. */}
              <p className="text-xs text-muted-foreground">
                {recuentoFrecuenciaDias
                  ? `Recuento físico cada ${recuentoFrecuenciaDias} días.`
                  : "Frecuencia de recuento sin declarar."}{" "}
                {recuento.ultimo ? (
                  <span className={cn(recuento.vencido && "font-medium text-destructive")}>
                    Último hace {recuento.dias} día{recuento.dias === 1 ? "" : "s"}
                    {recuento.vencido ? " — vencido" : ""}.
                  </span>
                ) : (
                  <span>Todavía no se hizo ninguno.</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => window.open("/api/vehiculos/conteo-planilla", "_blank")}>
                <Printer className="mr-1 size-4" /> Planilla de conteo
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open("/api/vehiculos/inventario-2-3", "_blank")}>
                <FileSpreadsheet className="mr-1 size-4" /> Planilla DPO 2.3
              </Button>
              {puedeEditar && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setDialog("frecuencia")}>
                    <CalendarClock className="mr-1 size-4" /> Frecuencia
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog("conteo")}>
                    <ClipboardCheck className="mr-1 size-4" /> Conteo de stock
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setRepuestoEdit(null)
                      setDialog("repuesto")
                    }}
                  >
                    <Plus className="mr-1 size-4" /> Nuevo repuesto
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Cabecera de la política (R2.3.2/R2.3.3): FUERA, SOBRE, capital
              inmovilizado y la rutina de recuento, en una mirada. */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <TarjetaResumen
              label="Valor del pañol"
              valor={politica.resumen.itemsConPrecio > 0 ? fmtMoney(politica.resumen.valorTotal) : "—"}
              sub={
                politica.resumen.itemsConPrecio > 0
                  ? `${politica.resumen.itemsConPrecio} de ${politica.resumen.items} piezas con precio`
                  : politica.columnasNuevas
                    ? "Cargá el precio unitario en cada pieza"
                    : "Falta aplicar el SQL del 2.3"
              }
            />
            <TarjetaResumen
              label="FUERA (bajo mínimo)"
              valor={String(politica.resumen.fuera)}
              sub="piezas por debajo del mínimo"
              tono={politica.resumen.fuera > 0 ? "critico" : "ok"}
            />
            <TarjetaResumen
              label="SOBRE (sobre máximo)"
              valor={String(politica.resumen.sobre)}
              sub="piezas por encima del máximo"
              tono={politica.resumen.sobre > 0 ? "alerta" : "ok"}
            />
            <TarjetaResumen
              label="Sin política"
              valor={String(politica.resumen.sinPolitica)}
              sub="sin mínimo, objetivo o ABC"
              tono={politica.resumen.sinPolitica > 0 ? "alerta" : "ok"}
            />
            <TarjetaResumen
              label="Recuento"
              valor={recuento.ultimo ? fmtFecha(recuento.ultimo) : "—"}
              sub={
                recuento.ultimo
                  ? recuento.vencido
                    ? `VENCIDO: hace ${recuento.dias} d (cada ${recuentoFrecuenciaDias})`
                    : `hace ${recuento.dias} d · vence en ${
                        recuentoFrecuenciaDias != null && recuento.dias != null ? recuentoFrecuenciaDias - recuento.dias : "?"
                      } d`
                  : "sin conteos"
              }
              tono={recuento.vencido ? "critico" : "ok"}
            />
          </div>
          {puedeEditar && Object.values(politica.items).some((i) => i.difiere) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-sky-500/30 bg-sky-500/5 p-3 text-sm">
              <span>
                El consumo real de los últimos 90 días sugiere otra política en{" "}
                <strong>{Object.values(politica.items).filter((i) => i.difiere).length}</strong> piezas (mínimo,
                objetivo, máximo o ABC). Adoptarla deja fecha y autor: es el «se actualiza con las salidas» del
                R2.3.2.
              </span>
              <Button size="sm" variant="outline" onClick={adoptarTodos} disabled={adoptando}>
                <Wand2 className="mr-1 size-4" /> {adoptando ? "Adoptando…" : "Adoptar sugeridos en todas"}
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {repuestos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin repuestos cargados.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Repuesto</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Mín</TableHead>
                      <TableHead className="text-right">Obj</TableHead>
                      <TableHead className="text-right">Máx</TableHead>
                      <TableHead>ABC</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Criticidad</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Sugerido</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Proveedor</TableHead>
                      {puedeEditar && <TableHead className="w-44" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repuestos.map((r) => {
                      const bajo = r.stock_actual <= r.stock_min
                      const p = politica.items[r.id]
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-muted-foreground">{r.codigo || "—"}</TableCell>
                          <TableCell className="font-medium">
                            <button
                              className="text-left hover:underline"
                              onClick={() => {
                                if (!puedeEditar) return
                                setRepuestoEdit(r)
                                setDialog("repuesto")
                              }}
                            >
                              {r.nombre}
                            </button>
                            {r.unidad && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({r.unidad})
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular-nums",
                              bajo ? "text-destructive" : "text-foreground"
                            )}
                          >
                            {fmtNum(r.stock_actual)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtNum(r.stock_min)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {r.stock_objetivo != null ? fmtNum(r.stock_objetivo) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtNum(r.stock_max)}
                          </TableCell>
                          <TableCell>
                            {r.clase_abc ? (
                              <Badge variant="outline" className={CLASE_ABC_BADGE[r.clase_abc]}>
                                {r.clase_abc}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">sin clasificar</span>
                            )}
                          </TableCell>
                          {/* Días que dura el stock al ritmo real de salida: es
                              lo que hace discutible el mínimo declarado. */}
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {(() => {
                              const c = consumoPorPieza.get(r.id)
                              if (!c || c.coberturaDias == null)
                                return <span className="text-muted-foreground/60">sin salidas</span>
                              return `${c.coberturaDias} d`
                            })()}
                          </TableCell>
                          {/* FUERA / SOBRE / OK: la lectura del R2.3.2 en una palabra. */}
                          <TableCell>
                            {p ? (
                              <Badge variant="outline" className={cn("whitespace-nowrap", ESTADO_STOCK_BADGE[p.estado])}>
                                {ESTADO_STOCK_LABEL[p.estado].split(" ")[0]}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          {/* Matriz de la planilla oficial: tipo + bajo mínimo + parada + reposición. */}
                          <TableCell>
                            {p ? (
                              <Badge
                                variant="outline"
                                className={CRITICIDAD_BADGE[p.criticidad.nivel]}
                                title={`Tipo ${p.criticidad.tipo} + bajo mínimo ${p.criticidad.bajoMinimo} + parada ${p.criticidad.parada} + reposición ${p.criticidad.reposicion} = ${p.criticidad.total}`}
                              >
                                {p.criticidad.nivel} {p.criticidad.total}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {p?.valor != null ? fmtMoney(p.valor) : "—"}
                          </TableCell>
                          {/* Lo que el consumo real sugiere, al lado de lo declarado. */}
                          <TableCell className="text-xs text-muted-foreground">
                            {p ? (
                              p.difiere ? (
                                <span title="mín / obj / máx / ABC sugeridos por el consumo de 90 días">
                                  {p.minSugerido} / {p.objetivoSugerido} / {p.maxSugerido} · {p.claseSugerida}
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">= declarado</span>
                              )
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-foreground">{r.ubicacion || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.proveedor_id ? (provNombre.get(r.proveedor_id) ?? "—") : "—"}
                            {r.lead_time_dias != null && <div>{r.lead_time_dias} d</div>}
                          </TableCell>
                          {puedeEditar && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {p?.difiere && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-sky-600 dark:text-sky-400"
                                    title="Adoptar la política sugerida en esta pieza"
                                    onClick={() => adoptarUna(r)}
                                  >
                                    <Wand2 className="size-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-emerald-600 dark:text-emerald-400"
                                  title="Registrar ingreso"
                                  onClick={() =>
                                    setMovimiento({ repuesto: r, tipo: "ingreso" })
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-amber-600 dark:text-amber-400"
                                  title="Registrar egreso"
                                  onClick={() =>
                                    setMovimiento({ repuesto: r, tipo: "egreso" })
                                  }
                                >
                                  <Minus className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground"
                                  title="Ver movimientos"
                                  onClick={() => setHistorialRep(r)}
                                >
                                  <History className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive"
                                  title="Eliminar repuesto"
                                  onClick={() => borrar("repuestos", r.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Historial de conteos físicos (DPO 2.3) */}
          {conteos.length > 0 && (
            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Conteos de stock realizados
                  </p>
                  <DpoResponde puntos={["2.3"]} requisitos={["R2.3.2", "R2.3.3"]} />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Realizado por</TableHead>
                      <TableHead className="text-right">Ítems</TableHead>
                      <TableHead className="text-right">Con diferencia</TableHead>
                      <TableHead className="text-right">Exactitud</TableHead>
                      <TableHead>Ajuste</TableHead>
                      {puedeEditar && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conteos.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setConteoVer(c)}
                      >
                        <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                        <TableCell className="text-foreground">{c.realizado_por}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.items_total}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            c.items_con_diferencia > 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {c.items_con_diferencia}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {c.exactitud_pct != null ? `${c.exactitud_pct.toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell>
                          {c.ajustado ? (
                            <Badge variant="outline" className={BADGE_OK}>
                              stock ajustado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={BADGE_NEUTRO}>
                              sin ajuste
                            </Badge>
                          )}
                        </TableCell>
                        {puedeEditar && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive"
                              onClick={async () => {
                                const res = await deleteConteo(c.id)
                                if ("error" in res) toast.error(res.error)
                                else {
                                  toast.success("Conteo eliminado")
                                  refresh()
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>

      {/* ===== Dialogs ===== */}
      {dialog === "repuesto" && (
        <RepuestoDialog
          repuesto={repuestoEdit}
          proveedores={proveedores}
          politica={repuestoEdit ? (politica.items[repuestoEdit.id] ?? null) : null}
          columnasNuevas={politica.columnasNuevas}
          consumo={repuestoEdit ? (consumoPorPieza.get(repuestoEdit.id) ?? null) : null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "frecuencia" && (
        <FrecuenciaRecuentoDialog
          actual={recuentoFrecuenciaDias}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "residuo" && (
        <ResiduoDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "conteo" && (
        <ConteoDialog
          repuestos={repuestos}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {conteoVer && (
        <ConteoDetalleDialog conteo={conteoVer} onClose={() => setConteoVer(null)} />
      )}
      {movimiento && (
        <MovimientoDialog
          repuesto={movimiento.repuesto}
          tipoInicial={movimiento.tipo}
          onClose={() => setMovimiento(null)}
          onSaved={() => {
            setMovimiento(null)
            refresh()
          }}
        />
      )}
      {historialRep && (
        <HistorialMovimientosDialog
          repuesto={historialRep}
          onClose={() => setHistorialRep(null)}
        />
      )}
    </div>
  )
}

/** Tarjeta chica de la cabecera de Inventario (valor, FUERA, SOBRE, recuento). */
function TarjetaResumen({
  label,
  valor,
  sub,
  tono = "neutro",
}: {
  label: string
  valor: string
  sub: string
  tono?: "neutro" | "ok" | "alerta" | "critico"
}) {
  const color =
    tono === "critico"
      ? "text-destructive"
      : tono === "alerta"
        ? "text-amber-700 dark:text-amber-400"
        : tono === "ok"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-foreground"
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", color)}>{valor}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

// ---------- Dialogs ----------

function ConteoDialog({
  repuestos,
  onClose,
  onSaved,
}: {
  repuestos: Repuesto[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [realizadoPor, setRealizadoPor] = useState("")
  const [observaciones, setObservaciones] = useState("")
  // contado por repuesto: arranca vacío; vacío = no contado (no entra al conteo).
  const [contados, setContados] = useState<Record<string, string>>({})
  // Causa y nota por repuesto, sólo si lo contado difiere del sistema (R2.3.2:
  // "toda diferencia se explica; no alcanza con ajustar").
  const [causas, setCausas] = useState<Record<string, CausaDiferencia | "">>({})
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [ajustar, setAjustar] = useState(true)
  const [saving, setSaving] = useState(false)

  const items = repuestos
    .map((r) => ({ r, raw: contados[r.id] ?? "" }))
    .filter((x) => x.raw.trim() !== "")
    .map((x) => ({
      repuestoId: x.r.id,
      contado: parseNum(x.raw),
      dif: parseNum(x.raw) != null ? parseNum(x.raw)! - x.r.stock_actual : 0,
    }))
  const sinCausa = items.filter((i) => i.dif !== 0 && !causas[i.repuestoId]).length

  const submit = async () => {
    if (!realizadoPor.trim()) return toast.error("Indicá quién hizo el conteo")
    if (items.length === 0) return toast.error("Cargá al menos un ítem contado")
    if (items.some((i) => i.contado == null || i.contado < 0))
      return toast.error("Hay cantidades inválidas")
    if (sinCausa > 0)
      return toast.error(`Falta la causa en ${sinCausa} diferencia${sinCausa === 1 ? "" : "s"}: el R2.3.2 pide explicar cada una`)
    setSaving(true)
    const res = await createConteo({
      fecha,
      realizadoPor,
      observaciones,
      ajustar,
      items: items.map((i) => ({
        repuestoId: i.repuestoId,
        contado: i.contado!,
        causa: i.dif !== 0 ? (causas[i.repuestoId] || null) : null,
        nota: i.dif !== 0 ? notas[i.repuestoId] || null : null,
      })),
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    if (res.warning) toast.warning(res.warning)
    else toast.success(ajustar ? "Conteo guardado y stock ajustado por movimiento" : "Conteo guardado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conteo físico de stock</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label>Realizado por</Label>
            <Input
              value={realizadoPor}
              onChange={(e) => setRealizadoPor(e.target.value)}
              placeholder="Nombre"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repuesto</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="w-28 text-right">Contado</TableHead>
                <TableHead className="w-20 text-right">Dif.</TableHead>
                <TableHead className="w-64">Causa de la diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repuestos.map((r) => {
                const raw = contados[r.id] ?? ""
                const contado = raw.trim() === "" ? null : parseNum(raw)
                const dif = contado != null ? contado - r.stock_actual : null
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.nombre}
                      {r.unidad && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({r.unidad})
                        </span>
                      )}
                      {r.ubicacion && (
                        <div className="text-[11px] text-muted-foreground">{r.ubicacion}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(r.stock_actual)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={raw}
                        onChange={(e) =>
                          setContados((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="—"
                        className="h-7 w-24 text-right text-sm"
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        dif == null
                          ? "text-muted-foreground/50"
                          : dif === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "font-medium text-destructive"
                      )}
                    >
                      {dif == null ? "—" : dif > 0 ? `+${fmtNum(dif)}` : fmtNum(dif)}
                    </TableCell>
                    <TableCell>
                      {dif != null && dif !== 0 ? (
                        <div className="space-y-1">
                          <Select
                            value={causas[r.id] || "none"}
                            onValueChange={(v) =>
                              setCausas((prev) => ({ ...prev, [r.id]: !v || v === "none" ? "" : (v as CausaDiferencia) }))
                            }
                          >
                            <SelectTrigger className={cn("h-7 text-xs", !causas[r.id] && "border-destructive/50")}>
                              <SelectValue placeholder="Elegí la causa" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Elegí la causa…</SelectItem>
                              {CAUSAS_DIFERENCIA.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {CAUSA_DIFERENCIA_LABEL[c]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={notas[r.id] ?? ""}
                            onChange={(e) => setNotas((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            placeholder="Detalle (opcional)"
                            className="h-7 text-xs"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div>
          <Label>Observaciones</Label>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={ajustar}
            onChange={(e) => setAjustar(e.target.checked)}
            className="size-4"
          />
          Ajustar el stock del sistema a lo contado (cada diferencia queda como movimiento con su causa)
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : `Guardar conteo (${items.length} ítems)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConteoDetalleDialog({
  conteo,
  onClose,
}: {
  conteo: ConteoResumen
  onClose: () => void
}) {
  const [detalle, setDetalle] = useState<ConteoItemDetalle[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getConteoDetalle(conteo.id).then((res) => {
      if ("error" in res) setError(res.error)
      else setDetalle(res.data)
    })
  }, [conteo.id])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Conteo del {fmtFecha(conteo.fecha)} · {conteo.realizado_por}
          </DialogTitle>
        </DialogHeader>
        {conteo.observaciones && (
          <p className="text-sm text-muted-foreground">{conteo.observaciones}</p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="py-4 text-sm text-destructive">{error}</p>
          ) : detalle == null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repuesto</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Dif.</TableHead>
                  <TableHead>Causa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalle.map((d) => {
                  const dif = d.stock_contado - d.stock_sistema
                  return (
                    <TableRow key={d.repuesto_id}>
                      <TableCell>{d.nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(d.stock_sistema)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(d.stock_contado)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          dif === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "font-medium text-destructive"
                        )}
                      >
                        {dif > 0 ? `+${fmtNum(dif)}` : fmtNum(dif)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dif === 0 ? "" : d.causa ? CAUSA_DIFERENCIA_LABEL[d.causa] : <span className="text-destructive">sin causa</span>}
                        {d.nota && <div>{d.nota}</div>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Salidas del pañol: a qué unidad fue cada pieza.
 *
 * La trazabilidad existía al revés —desde la OT se veía qué repuesto se usó—,
 * pero para saber dónde terminaron los focos del pañol había que abrir Órdenes
 * de Trabajo y revisarlas una por una. Acá está la lista completa y filtrable
 * por unidad (DPO 2.3 / R2.3.2).
 *
 * Lo que aparece en ámbar es el agujero: stock que bajó sin decir a qué camión
 * fue. Casi siempre son los ajustes del conteo físico («se usó sin cargar»),
 * que es la forma cara de enterarse de una salida.
 */
const ORIGEN_SALIDA_LABEL: Record<SalidaPanol["origen"], string> = {
  ot: "OT",
  checklist: "Plan del checklist",
  conteo: "Ajuste de conteo",
  manual: "Cargado a mano",
}

function SalidasPanolCard() {
  const [salidas, setSalidas] = useState<SalidaPanol[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unidad, setUnidad] = useState("todas")
  const [busqueda, setBusqueda] = useState("")

  useEffect(() => {
    getSalidasPanol().then((res) => {
      if ("error" in res) setError(res.error)
      else setSalidas(res.data)
    })
  }, [])

  // Cuánto salió para cada unidad, de mayor a menor. Los badges filtran.
  const porUnidad = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of salidas ?? []) {
      const k = s.dominio ?? "__sin__"
      m.set(k, (m.get(k) ?? 0) + s.cantidad)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [salidas])

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    return (salidas ?? []).filter((s) => {
      if (unidad === "sin" && s.dominio) return false
      if (unidad !== "todas" && unidad !== "sin" && s.dominio !== unidad) return false
      if (t && !`${s.repuesto} ${s.motivo ?? ""} ${s.otNumero ?? ""}`.toLowerCase().includes(t))
        return false
      return true
    })
  }, [salidas, unidad, busqueda])

  const sinUnidad = (salidas ?? []).filter((s) => !s.dominio)
  const totalSinUnidad = sinUnidad.reduce((a, s) => a + s.cantidad, 0)

  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Truck className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Salidas del pañol — a qué unidad fue
          </p>
          <DpoResponde puntos={["2.3"]} requisitos={["R2.3.2"]} />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Cada pieza que bajó del stock, con la unidad y la OT que la consumió. No hace falta abrir
          Órdenes de Trabajo para saber dónde terminó un foco.
        </p>

        {error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : salidas == null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : salidas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay egresos registrados.
          </p>
        ) : (
          <>
            {totalSinUnidad > 0 && (
              <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <span className="font-medium">
                  {fmtNum(totalSinUnidad)} piezas salieron sin unidad asignada
                </span>{" "}
                ({sinUnidad.length} movimiento{sinUnidad.length === 1 ? "" : "s"}). Son las que el
                conteo físico detectó como «usadas sin cargar»: el stock baja pero no queda dicho a
                qué camión fueron. Cargá la OT interna eligiendo la pieza del pañol y la salida
                queda registrada sola.
              </p>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setUnidad("todas")}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  unidad === "todas"
                    ? "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                Todas
              </button>
              {porUnidad.map(([dom, cant]) => {
                const esSin = dom === "__sin__"
                const valor = esSin ? "sin" : dom
                return (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => setUnidad(unidad === valor ? "todas" : valor)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      unidad === valor
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                        : esSin
                          ? "border-amber-300/60 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
                          : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {esSin ? "Sin unidad" : dom} · {fmtNum(cant)}
                  </button>
                )
              })}
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar pieza u OT…"
                className="h-8 w-44 text-xs"
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Pieza</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead>De dónde salió</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((s) => (
                  <TableRow
                    key={s.id}
                    className={!s.dominio ? "bg-amber-50/50 dark:bg-amber-500/5" : undefined}
                  >
                    <TableCell className="whitespace-nowrap">{fmtFecha(s.fecha)}</TableCell>
                    <TableCell className="text-foreground">{s.repuesto}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmtNum(s.cantidad)}
                      {s.unidadMedida && (
                        <span className="ml-1 text-xs text-muted-foreground">{s.unidadMedida}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.dominio ? (
                        <Badge variant="outline" className="font-medium text-foreground">
                          {s.dominio}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-300/60 text-amber-700 dark:border-amber-500/30 dark:text-amber-400"
                        >
                          sin unidad
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {s.otNumero ? (
                        <>
                          N° {s.otNumero}
                          {s.taller && (
                            <span className="block text-xs text-muted-foreground/70">
                              {s.taller}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 text-xs text-muted-foreground">
                      <span className="text-foreground">{ORIGEN_SALIDA_LABEL[s.origen]}</span>
                      {s.motivo && s.origen !== "ot" && <span className="block">{s.motivo}</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Sin salidas para ese filtro.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MovimientoDialog({
  repuesto,
  tipoInicial,
  onClose,
  onSaved,
}: {
  repuesto: Repuesto
  tipoInicial: "ingreso" | "egreso"
  onClose: () => void
  onSaved: () => void
}) {
  const [tipo, setTipo] = useState<"ingreso" | "egreso">(tipoInicial)
  const [cantidad, setCantidad] = useState("")
  const [motivo, setMotivo] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const cant = parseNum(cantidad)
    if (cant == null || cant <= 0) return toast.error("Ingresá una cantidad mayor a 0")
    setSaving(true)
    const res = await registrarMovimientoRepuesto({
      repuestoId: repuesto.id,
      tipo,
      cantidad: cant,
      motivo,
      fecha,
    })
    setSaving(false)
    // El error de "Stock insuficiente…" viene de la función y se muestra tal cual.
    if ("error" in res) return toast.error(res.error)
    toast.success(tipo === "ingreso" ? "Ingreso registrado" : "Egreso registrado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Movimiento de stock · {repuesto.nombre}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Stock actual:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {fmtNum(repuesto.stock_actual)}
          </span>
          {repuesto.unidad && <span> {repuesto.unidad}</span>}
        </p>
        <div className="space-y-3">
          <div>
            <Label>Tipo de movimiento</Label>
            <Select value={tipo} onValueChange={(v) => v && setTipo(v as "ingreso" | "egreso")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ingreso">Ingreso (+)</SelectItem>
                <SelectItem value="egreso">Egreso (−)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                tipo === "ingreso"
                  ? "compra / reposición"
                  : "uso en OT / reparación"
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Registrar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistorialMovimientosDialog({
  repuesto,
  onClose,
}: {
  repuesto: Repuesto
  onClose: () => void
}) {
  const [movimientos, setMovimientos] = useState<MovimientoRepuesto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMovimientosRepuesto(repuesto.id).then((res) => {
      if ("error" in res) setError(res.error)
      else setMovimientos(res.data)
    })
  }, [repuesto.id])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movimientos · {repuesto.nombre}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="py-4 text-sm text-destructive">{error}</p>
          ) : movimientos == null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Stock después</TableHead>
                  <TableHead>Registró</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(m.fecha)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={m.tipo === "ingreso" ? BADGE_OK : BADGE_CRITICO}
                      >
                        {m.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        m.tipo === "ingreso"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      )}
                    >
                      {m.tipo === "ingreso" ? "+" : "−"}
                      {fmtNum(m.cantidad)}
                    </TableCell>
                    {/* A qué camión fue la pieza: sale del vínculo con la OT,
                        no del texto del motivo. */}
                    <TableCell className="whitespace-nowrap">
                      {m.dominio ? (
                        <>
                          <Badge variant="outline" className="font-medium text-foreground">
                            {m.dominio}
                          </Badge>
                          {m.otNumero && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              OT {m.otNumero}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 text-muted-foreground">
                      {m.motivo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {fmtNum(m.stock_resultante)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.autor ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResiduoDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [material, setMaterial] = useState("neumaticos")
  const [descripcion, setDescripcion] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [unidad, setUnidad] = useState("un")
  const [proveedor, setProveedor] = useState("")
  const [numerosFuego, setNumerosFuego] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [certificado, setCertificado] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!proveedor.trim()) return toast.error("Cargá el proveedor de la disposición")
    setSaving(true)
    const fd = new FormData()
    fd.set("fecha", fecha)
    fd.set("material", material)
    fd.set("proveedor", proveedor)
    fd.set("descripcion", descripcion)
    fd.set("cantidad", cantidad)
    fd.set("unidad", unidad)
    fd.set("numeros_fuego", numerosFuego)
    fd.set("observaciones", observaciones)
    // Si es imagen (foto del certificado), se comprime; los PDF pasan tal cual.
    if (certificado) fd.set("certificado", await comprimirImagen(certificado))
    const res = await createResiduo(fd)
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Disposición registrada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar disposición de residuos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha de eliminación</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Material</Label>
              <Select value={material} onValueChange={(v) => v && setMaterial(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MATERIAL_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Proveedor de disposición</Label>
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Responsable del retiro/descarte"
              />
            </div>
            <div>
              <Label>Cantidad</Label>
              <div className="flex gap-1.5">
                <Input
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="0"
                  className="flex-1"
                />
                <Select value={unidad} onValueChange={(v) => v && setUnidad(v)}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">un</SelectItem>
                    <SelectItem value="lts">lts</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div>
            <Label>Detalle del material</Label>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: cubiertas 295/80 R22.5 fuera de uso"
            />
          </div>
          {material === "neumaticos" && (
            <div>
              <Label>Números de fuego</Label>
              <Input
                value={numerosFuego}
                onChange={(e) => setNumerosFuego(e.target.value)}
                placeholder="Separados por coma"
              />
            </div>
          )}
          <div>
            <Label>Certificado de descarte (PDF o foto)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setCertificado(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RepuestoDialog({
  repuesto,
  proveedores,
  politica,
  columnasNuevas,
  onClose,
  onSaved,
  consumo,
}: {
  repuesto: Repuesto | null
  proveedores: MantenimientoProveedor[]
  /** Política calculada para esta pieza (sugeridos, criticidad). null = pieza nueva. */
  politica: PoliticaItem | null
  columnasNuevas: boolean
  /** Lo que dicen los egresos reales de esta pieza. null = pieza nueva. */
  consumo?: ConsumoRepuesto | null
  onClose: () => void
  onSaved: () => void
}) {
  const [codigo, setCodigo] = useState(repuesto?.codigo ?? "")
  const [nombre, setNombre] = useState(repuesto?.nombre ?? "")
  const [unidad, setUnidad] = useState(repuesto?.unidad ?? "")
  const [stock, setStock] = useState(repuesto ? String(repuesto.stock_actual) : "")
  const [min, setMin] = useState(repuesto ? String(repuesto.stock_min) : "")
  const [max, setMax] = useState(repuesto?.stock_max != null ? String(repuesto.stock_max) : "")
  const [ubicacion, setUbicacion] = useState(repuesto?.ubicacion ?? "")
  const [objetivo, setObjetivo] = useState(
    repuesto?.stock_objetivo != null ? String(repuesto.stock_objetivo) : ""
  )
  const [dias, setDias] = useState(
    repuesto?.dias_stock != null ? String(repuesto.dias_stock) : ""
  )
  const [abc, setAbc] = useState<string>(repuesto?.clase_abc ?? "")
  // Columnas del 2.3 (migración 20261105120000).
  const [precio, setPrecio] = useState(repuesto?.precio_unitario != null ? String(repuesto.precio_unitario) : "")
  const [proveedorId, setProveedorId] = useState<string>(repuesto?.proveedor_id ?? "none")
  const [leadTime, setLeadTime] = useState(repuesto?.lead_time_dias != null ? String(repuesto.lead_time_dias) : "")
  const [parada, setParada] = useState(!!repuesto?.parada_por_falta)
  const [revisada, setRevisada] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await upsertRepuesto({
      id: repuesto?.id,
      codigo,
      nombre,
      unidad,
      stock_actual: parseNum(stock) ?? 0,
      stock_min: parseNum(min) ?? 0,
      stock_max: parseNum(max),
      ubicacion,
      stock_objetivo: parseNum(objetivo),
      dias_stock: parseNum(dias),
      clase_abc: abc === "A" || abc === "B" || abc === "C" ? abc : null,
      precio_unitario: parseNum(precio),
      proveedor_id: proveedorId === "none" ? null : proveedorId,
      lead_time_dias: parseNum(leadTime),
      parada_por_falta: parada,
      politica_revisada: revisada,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    if (res.warning) toast.warning(res.warning)
    else toast.success(repuesto ? "Repuesto actualizado" : "Repuesto cargado")
    onSaved()
  }
  const usarSugerido = () => {
    if (!politica) return
    setMin(String(politica.minSugerido))
    setObjetivo(String(politica.objetivoSugerido))
    setMax(String(politica.maxSugerido))
    setAbc(politica.claseSugerida)
    if (!dias) setDias("30")
    setRevisada(true)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{repuesto ? "Editar repuesto" : "Nuevo repuesto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <div>
              <Label>Unidad de medida</Label>
              <Input
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder="u / lt / kg"
              />
            </div>
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Stock actual</Label>
              <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div>
              <Label>Stock mín</Label>
              <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <Label>Stock máx</Label>
              <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ubicación (armario / estante / cajón)</Label>
              <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Armario 1 · estante 2" />
            </div>
            <div>
              <Label>Precio unitario (ARS)</Label>
              <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} disabled={!columnasNuevas} />
            </div>
            <div>
              <Label>Proveedor habitual</Label>
              <Select value={proveedorId} onValueChange={(v) => setProveedorId(v ?? "none")} disabled={!columnasNuevas}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {proveedores
                    .filter((p) => p.activo)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tiempo de reposición (días)</Label>
              <Input type="number" min={0} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} disabled={!columnasNuevas} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={parada} onCheckedChange={(c) => setParada(c === true)} disabled={!columnasNuevas} />
            Alguna vez una unidad quedó parada por faltar esta pieza
          </label>
          {!columnasNuevas && (
            <p className="text-xs text-amber-700">
              Precio, proveedor, reposición y parada se habilitan al aplicar APLICAR_EN_PAMPEANA_INVENTARIO_2_3.sql.
            </p>
          )}

          {/*
            Política de stock (DPO 2.3 / R2.3.2). El verificador no pregunta sólo
            si los números existen: pregunta cómo se definieron y si se
            actualizan según cómo se comportan las salidas. Por eso lo declarado
            va acá y lo que dice el consumo real, abajo, para contrastarlo.
          */}
          <div className="rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Política de stock</Label>
              <div className="flex items-center gap-2">
                {politica && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={usarSugerido}>
                    <Wand2 className="mr-1 size-3.5" /> Usar sugerido ({politica.minSugerido} / {politica.objetivoSugerido} / {politica.maxSugerido} · {politica.claseSugerida})
                  </Button>
                )}
                <DpoResponde puntos={["2.3"]} requisitos={["R2.3.2"]} />
              </div>
            </div>
            {politica && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Criticidad {politica.criticidad.nivel} ({politica.criticidad.total} pts) · estado {ESTADO_STOCK_LABEL[politica.estado]}
                {repuesto?.politica_actualizada_at && ` · política revisada el ${fmtFecha(repuesto.politica_actualizada_at.slice(0, 10))}`}
              </p>
            )}
            <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={revisada} onCheckedChange={(c) => setRevisada(c === true)} />
              Revisé la política con el consumo real (sella la fecha de revisión, R2.3.2)
            </label>
            <div className="mt-1 grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Objetivo</Label>
                <Input
                  type="number"
                  value={objetivo}
                  onChange={(e) => setObjetivo(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Días de cobertura</Label>
                <Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Clase ABC</Label>
                <Select
                  value={abc || "sin"}
                  onValueChange={(v: string | null) => setAbc(!v || v === "sin" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sin">Sin clasificar</SelectItem>
                    <SelectItem value="A">A — alta rotación</SelectItem>
                    <SelectItem value="B">B — media</SelectItem>
                    <SelectItem value="C">C — baja o nula</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {consumo && (
              <div className="mt-2 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                {consumo.consumo > 0 ? (
                  <>
                    Salieron <strong className="text-foreground">{consumo.consumo}</strong> en{" "}
                    {consumo.ventanaDias} días ({consumo.consumoDia.toFixed(2)} por día).
                    {consumo.coberturaDias != null && (
                      <> El stock de hoy dura <strong className="text-foreground">{consumo.coberturaDias} días</strong>.</>
                    )}{" "}
                    Por consumo sería clase{" "}
                    <strong className="text-foreground">{consumo.claseSugerida}</strong>
                    {consumo.objetivoSugerido != null && (
                      <> y el objetivo, <strong className="text-foreground">{consumo.objetivoSugerido}</strong> unidades</>
                    )}
                    .{" "}
                    <button
                      type="button"
                      className="font-medium text-primary underline"
                      onClick={() => {
                        setAbc(consumo.claseSugerida)
                        if (consumo.objetivoSugerido != null)
                          setObjetivo(String(consumo.objetivoSugerido))
                        if (!dias) setDias("30")
                      }}
                    >
                      Usar estos valores
                    </button>
                  </>
                ) : (
                  <>
                    Sin un solo egreso en la ventana observada ({consumo.ventanaDias} días):
                    por consumo es clase C. Lo que tengas en el pañol es por criterio, no
                    por rotación.
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Cada cuántos días se hace el recuento físico.
 *
 * R2.3.2 pide la frecuencia **definida**, no sólo que haya recuentos: sin un
 * número declarado no hay contra qué decir si la rutina se cumple. Se guarda en
 * la config del módulo, que es una sola fila para todo el pañol.
 */
function FrecuenciaRecuentoDialog({
  actual,
  onClose,
  onSaved,
}: {
  actual: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [dias, setDias] = useState(actual != null ? String(actual) : "30")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await setFrecuenciaRecuento(parseNum(dias) ?? null)
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Frecuencia de recuento actualizada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Frecuencia del recuento físico</DialogTitle>
        </DialogHeader>
        <DpoResponde puntos={["2.3"]} requisitos={["R2.3.2"]} />
        <div className="space-y-2">
          <Label>Cada cuántos días</Label>
          <Input type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Con esto la solapa avisa cuando el recuento está vencido. Son 19 piezas: el
            recuento mensual es el que la operación sostiene.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

