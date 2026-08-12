"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ProveedorPicker } from "./_components/proveedor-picker"
import {
  Plus,
  Paperclip,
  Mail,
  MailWarning,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Receipt,
  FileText,
  FileSpreadsheet,
  FileDown,
  Wallet,
  Wrench,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createGasto,
  deleteGasto,
  reenviarMailGasto,
  updateGastoEstado,
} from "@/actions/mantenimiento-gastos"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import {
  GASTO_MEDIO_PAGO_LABELS,
  GASTO_MOTIVOS,
  GASTO_MOTIVO_SIN,
  GASTO_TIPO_LABELS,
  GASTO_TIPO_MANTENIMIENTO_LABELS,
  type GastoMedioPago,
  type GastoTipo,
  type MantenimientoGasto,
  type MantenimientoProveedor,
  type MantenimientoTipo,
} from "@/types/database"

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v)

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—")

const fmtMesLabel = (mes: string) => {
  const [y, m] = mes.split("-")
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ]
  return `${meses[Number(m) - 1] ?? m} ${y}`
}

const TIPO_ICON: Record<GastoTipo, typeof FileText> = {
  factura: FileText,
  boleta: Receipt,
  caja_chica: Wallet,
}

const TIPO_BADGE: Record<GastoTipo, string> = {
  factura: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  boleta: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  caja_chica: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Etiqueta del motivo de un gasto; los que todavía no lo tienen cargado se
 *  muestran como tales en vez de esconderse en un guion. */
const motivoLabel = (rubro: string | null) => rubro?.trim() || "Sin motivo"

/** Filtro de tipo de mantenimiento: además de los 3 tipos, "no corresponde"
 *  (NULL) es un valor legítimo — son los gastos que no son de mantenimiento
 *  (multas, seguros, peajes). */
const MANT_SIN = "__sin_mant"

export function GastosTab({
  gastos,
  proveedores,
  onProveedorCreado,
  dominios,
  puedeEditar,
}: {
  gastos: MantenimientoGasto[]
  proveedores: MantenimientoProveedor[]
  onProveedorCreado?: (p: MantenimientoProveedor) => void
  dominios: string[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // El catálogo lo mantiene el padre (MantenimientoClient), así un proveedor
  // agregado desde una OT o desde una compra de cubiertas también aparece acá.
  const provList = proveedores
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [fMes, setFMes] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  const [fMotivo, setFMotivo] = useState("todos")
  const [fMant, setFMant] = useState("todos")
  const [busyId, setBusyId] = useState<string | null>(null)

  const meses = useMemo(() => {
    const s = new Set(gastos.map((g) => g.mes_imputacion))
    return Array.from(s).sort().reverse()
  }, [gastos])

  /** Motivos del selector: el catálogo más los que ya estén cargados con otro
   *  texto (el campo es libre y viene de antes de que existiera la lista). */
  const motivosOpciones = useMemo(() => {
    const delCatalogo = new Set<string>(GASTO_MOTIVOS)
    const extra = gastos
      .map((g) => g.rubro?.trim())
      .filter((r): r is string => !!r && !delCatalogo.has(r))
    return [...GASTO_MOTIVOS, ...Array.from(new Set(extra)).sort()]
  }, [gastos])

  /** Base del desglose: todo menos el filtro de motivo, para que la tabla por
   *  motivo siga mostrando el reparto completo con un motivo seleccionado. */
  const baseMotivos = useMemo(
    () =>
      gastos.filter(
        (g) =>
          (fMes === "todos" || g.mes_imputacion === fMes) &&
          (fTipo === "todos" || g.tipo === fTipo) &&
          (fMant === "todos" ||
            (fMant === MANT_SIN ? !g.tipo_mantenimiento : g.tipo_mantenimiento === fMant))
      ),
    [gastos, fMes, fTipo, fMant]
  )

  const filtrados = useMemo(
    () =>
      baseMotivos.filter((g) => {
        if (fMotivo === "todos") return true
        if (fMotivo === GASTO_MOTIVO_SIN) return !g.rubro?.trim()
        return g.rubro?.trim() === fMotivo
      }),
    [baseMotivos, fMotivo]
  )

  /** Reparto del gasto por motivo — es la lectura que pide el R3.2.2. */
  const porMotivo = useMemo(() => {
    const acc = new Map<string, { motivo: string; monto: number; n: number }>()
    for (const g of baseMotivos) {
      const k = motivoLabel(g.rubro)
      const cur = acc.get(k) ?? { motivo: k, monto: 0, n: 0 }
      cur.monto += Number(g.monto)
      cur.n += 1
      acc.set(k, cur)
    }
    return Array.from(acc.values()).sort((a, b) => b.monto - a.monto)
  }, [baseMotivos])

  const totalMotivos = useMemo(
    () => porMotivo.reduce((a, m) => a + m.monto, 0),
    [porMotivo]
  )

  const total = useMemo(() => filtrados.reduce((a, g) => a + Number(g.monto), 0), [filtrados])
  const pendientesImputar = useMemo(
    () => gastos.filter((g) => g.estado_imputacion === "pendiente").length,
    [gastos]
  )
  const imputados = useMemo(
    () => filtrados.filter((g) => g.estado_imputacion === "imputado").length,
    [filtrados]
  )

  const refresh = () => startTransition(() => router.refresh())

  // URL de descarga (Excel/PDF) respetando los filtros visibles.
  const exportUrl = (formato: "xlsx" | "pdf") => {
    const params = new URLSearchParams()
    if (fMes !== "todos") params.set("mes", fMes)
    if (fTipo !== "todos") params.set("tipo", fTipo)
    if (fMotivo !== "todos") params.set("motivo", fMotivo)
    if (fMant !== "todos") params.set("mantenimiento", fMant)
    const qs = params.toString()
    return `/api/vehiculos/gastos/${formato === "xlsx" ? "export" : "pdf"}${qs ? `?${qs}` : ""}`
  }

  const onEstado = async (
    g: MantenimientoGasto,
    patch: Parameters<typeof updateGastoEstado>[1]
  ) => {
    setBusyId(g.id)
    const res = await updateGastoEstado(g.id, patch)
    setBusyId(null)
    if ("error" in res) return toast.error(res.error)
    toast.success("Actualizado")
    refresh()
  }

  const onReenviar = async (g: MantenimientoGasto) => {
    setBusyId(g.id)
    const res = await reenviarMailGasto(g.id)
    setBusyId(null)
    if ("error" in res) return toast.error(res.error)
    toast.success("Mail reenviado")
    refresh()
  }

  const onEliminar = async (g: MantenimientoGasto) => {
    if (!confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) return
    setBusyId(g.id)
    const res = await deleteGasto(g.id)
    setBusyId(null)
    if ("error" in res) return toast.error(res.error)
    toast.success("Gasto eliminado")
    refresh()
  }

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="gastos" />

      <Tabs defaultValue="listado" className="space-y-4">
        <TabsList>
          <TabsTrigger value="listado">Gastos</TabsTrigger>
          <TabsTrigger value="imputar">
            <span className="flex items-center gap-1.5">
              Imputar
              {pendientesImputar > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[11px] font-medium tabular-nums text-amber-700 dark:text-amber-400"
                >
                  {pendientesImputar}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ============ Sub-solapa: Listado / carga ============ */}
        <TabsContent value="listado" className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label={`Total ${fMes === "todos" ? "(todo)" : fmtMesLabel(fMes)}`}
              valor={fmtMoney(total)}
              sub="Gasto de flota imputado contra presupuesto"
              dpo="3.2"
            />
            <KpiCard
              label="Comprobantes"
              valor={filtrados.length}
              sub={fTipo === "todos" ? "Todos los tipos" : GASTO_TIPO_LABELS[fTipo as GastoTipo]}
            />
            <KpiCard
              label="Sin imputar"
              valor={pendientesImputar}
              estado={pendientesImputar > 0 ? "alerta" : "ok"}
              sub="Pendientes de administración"
            />
            <KpiCard
              label="Imputados"
              valor={imputados}
              estado={imputados > 0 ? "ok" : "neutro"}
              sub="Dentro del filtro actual"
            />
          </div>

          {/* Filtros + alta */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Mes</Label>
                <Select value={fMes} onValueChange={(v) => setFMes(v ?? "todos")}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los meses</SelectItem>
                    {meses.map((m) => (
                      <SelectItem key={m} value={m}>
                        {fmtMesLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={fTipo} onValueChange={(v) => setFTipo(v ?? "todos")}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="factura">Factura</SelectItem>
                    <SelectItem value="boleta">Boleta</SelectItem>
                    <SelectItem value="caja_chica">Caja chica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Motivo</Label>
                <Select value={fMotivo} onValueChange={(v) => setFMotivo(v ?? "todos")}>
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los motivos</SelectItem>
                    {motivosOpciones.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                    <SelectItem value={GASTO_MOTIVO_SIN}>Sin motivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mantenimiento</Label>
                <Select value={fMant} onValueChange={(v) => setFMant(v ?? "todos")}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {(Object.keys(GASTO_TIPO_MANTENIMIENTO_LABELS) as MantenimientoTipo[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {GASTO_TIPO_MANTENIMIENTO_LABELS[k]}
                        </SelectItem>
                      )
                    )}
                    <SelectItem value={MANT_SIN}>No corresponde</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                title="Descargar Excel con el filtro actual"
                render={<a href={exportUrl("xlsx")} download />}
              >
                <FileSpreadsheet className="mr-1 size-4 text-emerald-600 dark:text-emerald-400" />{" "}
                Excel
              </Button>
              <Button
                variant="outline"
                title="Descargar PDF con el filtro actual"
                render={<a href={exportUrl("pdf")} target="_blank" rel="noreferrer" />}
              >
                <FileDown className="mr-1 size-4 text-red-600 dark:text-red-400" /> PDF
              </Button>
              {puedeEditar && (
                <Button onClick={() => setNuevoOpen(true)}>
                  <Plus className="mr-1 size-4" /> Nuevo gasto
                </Button>
              )}
            </div>
          </div>

          {/* Desglose por motivo — R3.2.2: el gasto de flota abierto por su causa */}
          {porMotivo.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Gasto por motivo
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {fMes === "todos" ? "todos los meses" : fmtMesLabel(fMes)} · click para filtrar
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Comprobantes</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">% del total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porMotivo.map((m) => {
                      const valor = m.motivo === "Sin motivo" ? GASTO_MOTIVO_SIN : m.motivo
                      const activo = fMotivo === valor
                      return (
                        <TableRow
                          key={m.motivo}
                          className={`cursor-pointer ${activo ? "bg-muted/60" : ""}`}
                          onClick={() => setFMotivo(activo ? "todos" : valor)}
                        >
                          <TableCell className="font-medium text-foreground">
                            {m.motivo}
                            {m.motivo === "Sin motivo" && (
                              <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">
                                falta clasificar
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {m.n}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-foreground">
                            {fmtMoney(m.monto)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {totalMotivos > 0 ? `${((100 * m.monto) / totalMotivos).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Tabla */}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Mes imp.</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No hay gastos cargados para este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtrados.map((g) => {
                    const Icon = TIPO_ICON[g.tipo]
                    const busy = busyId === g.id
                    return (
                      <TableRow key={g.id}>
                        <TableCell className="whitespace-nowrap text-sm text-foreground">
                          {fmtFecha(g.fecha)}
                          {g.fecha_carga && (
                            <span className="block text-[11px] text-muted-foreground">
                              Cargada {fmtFecha(g.fecha_carga)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE[g.tipo]}`}
                          >
                            <Icon className="size-3" /> {GASTO_TIPO_LABELS[g.tipo]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{g.proveedor ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {[
                              g.dominio,
                              g.numero_comprobante ? `N° ${g.numero_comprobante}` : null,
                              g.orden_trabajo ? `OT ${g.orden_trabajo}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          {g.tipo_mantenimiento && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <Wrench className="size-3" />
                              {GASTO_TIPO_MANTENIMIENTO_LABELS[g.tipo_mantenimiento]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {g.rubro?.trim() ? (
                            <span className="text-foreground">{g.rubro}</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">Sin motivo</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-foreground">
                          {fmtMoney(Number(g.monto))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtMesLabel(g.mes_imputacion)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={
                                g.estado_imputacion === "imputado"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              }
                            >
                              {g.estado_imputacion === "imputado" ? "Imputado" : "Sin imputar"}
                            </Badge>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              {g.mail_enviado ? (
                                <>
                                  <Mail className="size-3 text-emerald-600 dark:text-emerald-400" />{" "}
                                  Avisado
                                </>
                              ) : (
                                <span
                                  title={g.mail_error ?? ""}
                                  className="flex items-center gap-1"
                                >
                                  <MailWarning className="size-3 text-amber-600 dark:text-amber-400" />{" "}
                                  Mail pendiente
                                </span>
                              )}
                              {g.estado_pago === "pagado" && (
                                <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                                  · Pagado
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {g.adjunto_urls[0] && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ver comprobante"
                                render={
                                  <a href={g.adjunto_urls[0]} target="_blank" rel="noreferrer" />
                                }
                              >
                                <Paperclip className="size-4" />
                              </Button>
                            )}
                            {puedeEditar && (
                              <>
                                {!g.mail_enviado && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={busy}
                                    title="Reenviar aviso por mail"
                                    onClick={() => onReenviar(g)}
                                  >
                                    <Mail className="size-4 text-sky-600 dark:text-sky-400" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={busy}
                                  title="Eliminar"
                                  onClick={() => onEliminar(g)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Sub-solapa: Imputar ============ */}
        <TabsContent value="imputar" className="space-y-4">
          <ImputarPanel
            gastos={gastos}
            puedeEditar={puedeEditar}
            busyId={busyId}
            onImputar={(g) => onEstado(g, { estado_imputacion: "imputado" })}
            onDesimputar={(g) => onEstado(g, { estado_imputacion: "pendiente" })}
          />
        </TabsContent>

        {nuevoOpen && (
          <NuevoGastoDialog
            dominios={dominios}
            proveedores={provList}
            onProveedorCreado={(p) => onProveedorCreado?.(p)}
            onClose={() => setNuevoOpen(false)}
            onSaved={(mailOk) => {
              setNuevoOpen(false)
              toast.success(
                mailOk
                  ? "Gasto cargado y aviso enviado"
                  : "Gasto cargado (aviso por mail pendiente)"
              )
              refresh()
            }}
          />
        )}
      </Tabs>
    </div>
  )
}

// ==================== Panel: Imputar ====================

function ImputarPanel({
  gastos,
  puedeEditar,
  busyId,
  onImputar,
  onDesimputar,
}: {
  gastos: MantenimientoGasto[]
  puedeEditar: boolean
  busyId: string | null
  onImputar: (g: MantenimientoGasto) => void
  onDesimputar: (g: MantenimientoGasto) => void
}) {
  // Pendientes primero (más nuevos arriba), después los ya imputados.
  const ordenados = useMemo(() => {
    const peso = (g: MantenimientoGasto) => (g.estado_imputacion === "pendiente" ? 0 : 1)
    return [...gastos].sort(
      (a, b) => peso(a) - peso(b) || (a.fecha < b.fecha ? 1 : -1)
    )
  }, [gastos])

  const pendientes = ordenados.filter((g) => g.estado_imputacion === "pendiente")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {pendientes.length > 0
            ? `${pendientes.length} comprobante(s) sin imputar`
            : "Todo imputado"}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Mes imp.</TableHead>
              <TableHead className="text-right">Imputación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No hay gastos cargados.
                </TableCell>
              </TableRow>
            )}
            {ordenados.map((g) => {
              const Icon = TIPO_ICON[g.tipo]
              const busy = busyId === g.id
              const imputado = g.estado_imputacion === "imputado"
              return (
                <TableRow key={g.id} className={imputado ? "opacity-60" : ""}>
                  <TableCell className="whitespace-nowrap text-sm text-foreground">
                    {fmtFecha(g.fecha)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE[g.tipo]}`}
                    >
                      <Icon className="size-3" /> {GASTO_TIPO_LABELS[g.tipo]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{g.proveedor ?? "—"}</div>
                    {g.numero_comprobante && (
                      <div className="text-xs text-muted-foreground">N° {g.numero_comprobante}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-foreground">
                    {fmtMoney(Number(g.monto))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtMesLabel(g.mes_imputacion)}
                  </TableCell>
                  <TableCell className="text-right">
                    {imputado ? (
                      <div className="flex items-center justify-end gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="mr-1 size-3" /> Imputado
                        </Badge>
                        {puedeEditar && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            title="Deshacer"
                            onClick={() => onDesimputar(g)}
                          >
                            <RotateCcw className="size-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ) : puedeEditar ? (
                      <Button size="sm" disabled={busy} onClick={() => onImputar(g)}>
                        <CheckCircle2 className="mr-1 size-4" /> Imputar
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      >
                        Sin imputar
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ==================== Diálogo: nuevo gasto ====================

function NuevoGastoDialog({
  dominios,
  proveedores,
  onProveedorCreado,
  onClose,
  onSaved,
}: {
  dominios: string[]
  proveedores: MantenimientoProveedor[]
  onProveedorCreado: (p: MantenimientoProveedor) => void
  onClose: () => void
  onSaved: (mailOk: boolean) => void
}) {
  const [tipo, setTipo] = useState<GastoTipo>("factura")
  const [fecha, setFecha] = useState(hoyISO())
  const [fechaCarga, setFechaCarga] = useState(hoyISO())
  const [mes, setMes] = useState(hoyISO().slice(0, 7))
  const [monto, setMonto] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [motivo, setMotivo] = useState("")
  const [tipoMant, setTipoMant] = useState<MantenimientoTipo | "">("")
  const [medioPago, setMedioPago] = useState<GastoMedioPago | "">("")
  const [nroComp, setNroComp] = useState("")
  const [ordenTrabajo, setOrdenTrabajo] = useState("")
  const [ctaContable, setCtaContable] = useState("")
  const [centroCosto, setCentroCosto] = useState("")
  const [dominio, setDominio] = useState("")
  const [obs, setObs] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const montoNum = Number(monto.replace(",", "."))
    if (!isFinite(montoNum) || montoNum <= 0) {
      toast.error("Ingresá un monto válido")
      return
    }
    if (tipo === "factura" && !ordenTrabajo.trim()) {
      toast.error("Ingresá el N° de orden de trabajo (obligatorio para facturas)")
      return
    }
    // Sin motivo el gasto no se puede analizar contra el presupuesto (R3.2.2):
    // así se llenaban todos los comprobantes hasta ahora.
    if (!motivo) {
      toast.error("Elegí el motivo del gasto")
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.set("tipo", tipo)
    fd.set("fecha", fecha)
    fd.set("fecha_carga", fechaCarga)
    fd.set("mes_imputacion", mes)
    fd.set("monto", monto)
    fd.set("proveedor", proveedor)
    fd.set("rubro", motivo)
    fd.set("tipo_mantenimiento", tipoMant)
    fd.set("medio_pago", medioPago)
    fd.set("numero_comprobante", nroComp)
    fd.set("orden_trabajo", ordenTrabajo)
    fd.set("cuenta_contable", ctaContable)
    fd.set("centro_costo", centroCosto)
    fd.set("dominio", dominio)
    fd.set("observaciones", obs)
    for (const f of files) fd.append("adjuntos", f)

    const res = await createGasto(fd)
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    onSaved(res.data.mail_enviado)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
          <DialogDescription>
            Factura, boleta o caja chica. Al guardar se avisa por mail a administración para su
            imputación.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as GastoTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="factura">Factura</SelectItem>
                <SelectItem value="boleta">Boleta</SelectItem>
                <SelectItem value="caja_chica">Caja chica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Fecha del comprobante</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value)
                if (e.target.value) setMes(e.target.value.slice(0, 7))
              }}
            />
          </div>
          <div>
            <Label>Mes de imputación</Label>
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div>
            <Label>Fecha de carga</Label>
            <Input
              type="date"
              value={fechaCarga}
              onChange={(e) => setFechaCarga(e.target.value)}
            />
          </div>
          <div>
            <Label>Medio de pago</Label>
            <Select
              value={medioPago || "__none"}
              onValueChange={(v) => setMedioPago(!v || v === "__none" ? "" : (v as GastoMedioPago))}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {(Object.keys(GASTO_MEDIO_PAGO_LABELS) as GastoMedioPago[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {GASTO_MEDIO_PAGO_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Proveedor</Label>
            <ProveedorPicker
              proveedores={proveedores}
              value={proveedor}
              onChange={setProveedor}
              onCreado={onProveedorCreado}
            />
          </div>
          <div className="col-span-2">
            <Label>
              Motivo del gasto <span className="text-destructive">*</span>
            </Label>
            <Select value={motivo || "__none"} onValueChange={(v) => setMotivo(!v || v === "__none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí el motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Elegí el motivo</SelectItem>
                {GASTO_MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Tipo de mantenimiento</Label>
            <Select
              value={tipoMant || "__none"}
              onValueChange={(v) =>
                setTipoMant(!v || v === "__none" ? "" : (v as MantenimientoTipo))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No corresponde</SelectItem>
                {(Object.keys(GASTO_TIPO_MANTENIMIENTO_LABELS) as MantenimientoTipo[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {GASTO_TIPO_MANTENIMIENTO_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>N° comprobante</Label>
            <Input value={nroComp} onChange={(e) => setNroComp(e.target.value)} />
          </div>
          <div>
            <Label>
              N° orden de trabajo
              {tipo === "factura" && <span className="text-destructive"> *</span>}
            </Label>
            <Input
              value={ordenTrabajo}
              onChange={(e) => setOrdenTrabajo(e.target.value)}
              placeholder={tipo === "factura" ? "Obligatorio para facturas" : "Opcional"}
            />
          </div>
          <div>
            <Label>Unidad (opcional)</Label>
            <Select
              value={dominio || "__none"}
              onValueChange={(v) => setDominio(!v || v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin unidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin unidad</SelectItem>
                {dominios.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cuenta contable</Label>
            <Input value={ctaContable} onChange={(e) => setCtaContable(e.target.value)} />
          </div>
          <div>
            <Label>Centro de costo</Label>
            <Input value={centroCosto} onChange={(e) => setCentroCosto(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Observaciones</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Comprobante (foto o PDF)</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {files.length} archivo(s): {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar y avisar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// El selector de proveedor vive en _components/proveedor-picker.tsx: lo comparten
// el form de gastos, las OT, las OT de neumáticos y la compra de cubiertas.
