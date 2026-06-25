"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
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
  Wallet,
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
import {
  GASTO_MEDIO_PAGO_LABELS,
  GASTO_TIPO_LABELS,
  type GastoMedioPago,
  type GastoTipo,
  type MantenimientoGasto,
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
  factura: "bg-indigo-100 text-indigo-700",
  boleta: "bg-sky-100 text-sky-700",
  caja_chica: "bg-amber-100 text-amber-700",
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function GastosTab({
  gastos,
  dominios,
  puedeEditar,
}: {
  gastos: MantenimientoGasto[]
  dominios: string[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [fMes, setFMes] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  const [busyId, setBusyId] = useState<string | null>(null)

  const meses = useMemo(() => {
    const s = new Set(gastos.map((g) => g.mes_imputacion))
    return Array.from(s).sort().reverse()
  }, [gastos])

  const filtrados = useMemo(
    () =>
      gastos.filter(
        (g) =>
          (fMes === "todos" || g.mes_imputacion === fMes) &&
          (fTipo === "todos" || g.tipo === fTipo)
      ),
    [gastos, fMes, fTipo]
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
    <Tabs defaultValue="listado" className="space-y-4">
      <TabsList>
        <TabsTrigger value="listado">Gastos</TabsTrigger>
        <TabsTrigger value="imputar">
          Imputar{pendientesImputar > 0 ? ` (${pendientesImputar})` : ""}
        </TabsTrigger>
      </TabsList>

      {/* ============ Sub-solapa: Listado / carga ============ */}
      <TabsContent value="listado" className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Total {fMes === "todos" ? "(todo)" : fmtMesLabel(fMes)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">{fmtMoney(total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Comprobantes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">{filtrados.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Sin imputar</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{pendientesImputar}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Imputados</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{imputados}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros + alta */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-slate-500">Mes</Label>
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
              <Label className="text-xs text-slate-500">Tipo</Label>
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
          </div>
          {puedeEditar && (
            <Button onClick={() => setNuevoOpen(true)}>
              <Plus className="mr-1 size-4" /> Nuevo gasto
            </Button>
          )}
        </div>

        {/* Tabla */}
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Mes imp.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-400">
                      No hay gastos cargados para este filtro.
                    </TableCell>
                  </TableRow>
                )}
                {filtrados.map((g) => {
                  const Icon = TIPO_ICON[g.tipo]
                  const busy = busyId === g.id
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="whitespace-nowrap text-sm text-slate-600">
                        {fmtFecha(g.fecha)}
                        {g.fecha_carga && (
                          <span className="block text-[11px] text-slate-400">
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
                        <div className="font-medium text-slate-800">{g.proveedor ?? "—"}</div>
                        <div className="text-xs text-slate-500">
                          {g.dominio ? `${g.dominio}` : ""}
                          {g.dominio && g.numero_comprobante ? " · " : ""}
                          {g.numero_comprobante ? `N° ${g.numero_comprobante}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                        {fmtMoney(Number(g.monto))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {fmtMesLabel(g.mes_imputacion)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className={
                              g.estado_imputacion === "imputado"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            {g.estado_imputacion === "imputado" ? "Imputado" : "Sin imputar"}
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-slate-400">
                            {g.mail_enviado ? (
                              <>
                                <Mail className="size-3 text-emerald-500" /> Avisado
                              </>
                            ) : (
                              <span title={g.mail_error ?? ""} className="flex items-center gap-1">
                                <MailWarning className="size-3 text-amber-500" /> Mail pendiente
                              </span>
                            )}
                            {g.estado_pago === "pagado" && (
                              <span className="ml-1 text-emerald-600">· Pagado</span>
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
                                  <Mail className="size-4 text-sky-600" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                title="Eliminar"
                                onClick={() => onEliminar(g)}
                              >
                                <Trash2 className="size-4 text-red-500" />
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
          onClose={() => setNuevoOpen(false)}
          onSaved={(mailOk) => {
            setNuevoOpen(false)
            toast.success(
              mailOk ? "Gasto cargado y aviso enviado" : "Gasto cargado (aviso por mail pendiente)"
            )
            refresh()
          }}
        />
      )}
    </Tabs>
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
                <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-400">
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
                  <TableCell className="whitespace-nowrap text-sm text-slate-600">
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
                    <div className="font-medium text-slate-800">{g.proveedor ?? "—"}</div>
                    {g.numero_comprobante && (
                      <div className="text-xs text-slate-500">N° {g.numero_comprobante}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                    {fmtMoney(Number(g.monto))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">
                    {fmtMesLabel(g.mes_imputacion)}
                  </TableCell>
                  <TableCell className="text-right">
                    {imputado ? (
                      <div className="flex items-center justify-end gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
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
                            <RotateCcw className="size-4 text-slate-400" />
                          </Button>
                        )}
                      </div>
                    ) : puedeEditar ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => onImputar(g)}
                      >
                        <CheckCircle2 className="mr-1 size-4" /> Imputar
                      </Button>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
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
  onClose,
  onSaved,
}: {
  dominios: string[]
  onClose: () => void
  onSaved: (mailOk: boolean) => void
}) {
  const [tipo, setTipo] = useState<GastoTipo>("factura")
  const [fecha, setFecha] = useState(hoyISO())
  const [fechaCarga, setFechaCarga] = useState(hoyISO())
  const [mes, setMes] = useState(hoyISO().slice(0, 7))
  const [monto, setMonto] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [medioPago, setMedioPago] = useState<GastoMedioPago | "">("")
  const [nroComp, setNroComp] = useState("")
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
    setSaving(true)
    const fd = new FormData()
    fd.set("tipo", tipo)
    fd.set("fecha", fecha)
    fd.set("fecha_carga", fechaCarga)
    fd.set("mes_imputacion", mes)
    fd.set("monto", monto)
    fd.set("proveedor", proveedor)
    fd.set("medio_pago", medioPago)
    fd.set("numero_comprobante", nroComp)
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
            <Input
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Nombre del proveedor"
            />
          </div>
          <div>
            <Label>N° comprobante</Label>
            <Input value={nroComp} onChange={(e) => setNroComp(e.target.value)} />
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
              <p className="mt-1 text-xs text-slate-500">
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
