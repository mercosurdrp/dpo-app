"use client"

/**
 * Envíos a recapado — el remito de ida y vuelta al recapador.
 *
 * Por qué no es una OT: la OT es de UNA unidad y un envío junta cubiertas de
 * varios camiones; además el costo es de la cubierta (entra en su costo por km),
 * no del vehículo. Y la factura llega por el total de la tanda, así que se
 * prorratea entre las que volvieron recapadas — las que el recapador descarta no
 * se cobran y van a baja.
 *
 * Con esto se sabe, por primera vez, qué costó cada recapado, cuántas vueltas
 * lleva cada goma y qué hay hoy en poder del recapador.
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CircleDollarSign,
  PackageCheck,
  Paperclip,
  Recycle,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  crearEnvioRecapado,
  eliminarEnvioRecapado,
  registrarRecepcionRecapado,
  type RecepcionItemInput,
} from "@/actions/recapados"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type Neumatico,
  type NeumaticoDibujo,
  type Recapado,
  type RecapadoItem,
  NEUMATICO_DIBUJO_LABEL,
  NEUMATICO_DIBUJOS,
  SIN_DIBUJO,
} from "@/lib/vehiculos/neumaticos-tipos"
import { ProveedorPicker } from "./proveedor-picker"
import {
  FacturaField,
  LinkFacturaPdf,
  nombreDeFacturaUrl,
  subirFacturasNeumaticos,
} from "./factura-neumaticos"

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

const fmtMoney = (n: number) =>
  n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

const etiqueta = (n: { numero?: string | null; marca?: string | null; medida?: string | null }) =>
  [n.numero ? `N° ${n.numero}` : "sin código", n.marca, n.medida]
    .filter(Boolean)
    .join(" · ")

export function RecapadosPanel({
  recapados,
  neumaticos,
  puedeEditar,
  onRefresh,
}: {
  recapados: Recapado[]
  neumaticos: Neumatico[]
  puedeEditar: boolean
  onRefresh: () => void
}) {
  const [envioOpen, setEnvioOpen] = useState(false)
  const [recibir, setRecibir] = useState<Recapado | null>(null)
  const [ver, setVer] = useState<Recapado | null>(null)

  // Candidatas: las que esperan el recapado en el depósito. Las que ya están en
  // el recapador tienen estado propio y no se pueden volver a mandar.
  const paraRecapar = useMemo(
    () => neumaticos.filter((n) => n.estado === "para_recapar"),
    [neumaticos]
  )
  const enStock = useMemo(
    () => neumaticos.filter((n) => n.estado === "stock"),
    [neumaticos]
  )

  const anio = hoyISO().slice(0, 4)
  const resumen = useMemo(() => {
    let enRecapador = 0
    let recibidasAnio = 0
    let gastoAnio = 0
    let conCosto = 0
    // Se cuenta POR CUBIERTA y no por remito: con la vuelta en tandas, un envío
    // abierto puede tener la mitad en el recapador y la otra mitad ya en stock.
    for (const r of recapados) {
      for (const it of r.items) {
        if (it.resultado === "pendiente") {
          enRecapador++
          continue
        }
        if (it.resultado !== "recapada") continue
        if (r.fecha_retorno?.slice(0, 4) !== anio) continue
        recibidasAnio++
        if (it.costo != null) {
          gastoAnio += Number(it.costo)
          conCosto++
        }
      }
    }
    return {
      enRecapador,
      recibidasAnio,
      gastoAnio,
      promedio: conCosto > 0 ? gastoAnio / conCosto : null,
      conCosto,
    }
  }, [recapados, anio])

  const pendientes = recapados.filter((r) => r.estado === "enviado")

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Recycle className="size-4 text-muted-foreground" /> Envíos a recapado (
              {recapados.length})
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Un envío puede llevar cubiertas de varias unidades. La factura se carga
              al volver y se reparte entre las que el recapador devolvió recapadas.
            </p>
          </div>
          {puedeEditar && (
            <Button onClick={() => setEnvioOpen(true)}>
              <Send className="mr-1 size-4" /> Enviar a recapar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato
            label="En el recapador"
            valor={String(resumen.enRecapador)}
            sub={
              pendientes.length > 0
                ? `${pendientes.length} envío${pendientes.length > 1 ? "s" : ""} sin recibir`
                : "Sin envíos abiertos"
            }
            alerta={resumen.enRecapador > 0}
          />
          <Dato
            label={`Recapadas ${anio}`}
            valor={String(resumen.recibidasAnio)}
            sub="Cubiertas que volvieron y entraron al stock"
          />
          <Dato label={`Gasto ${anio}`} valor={fmtMoney(resumen.gastoAnio)} />
          <Dato
            label="Costo por recapado"
            valor={resumen.promedio != null ? fmtMoney(resumen.promedio) : "—"}
            sub={`${resumen.conCosto} con costo cargado`}
          />
        </div>

        {recapados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay envíos cargados.
            {paraRecapar.length > 0 &&
              ` Hay ${paraRecapar.length} cubierta${
                paraRecapar.length > 1 ? "s" : ""
              } esperando en la bandeja "Para recapar".`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Envío</th>
                  <th>Recapador</th>
                  <th>Remito</th>
                  <th className="text-right">Cubiertas</th>
                  <th>Estado</th>
                  <th>Retorno</th>
                  <th>Factura</th>
                  <th className="text-right">Costo total</th>
                  <th className="text-right">Por cubierta</th>
                  {puedeEditar && <th className="w-28" />}
                </tr>
              </thead>
              <tbody>
                {recapados.map((r, i) => {
                  const recapadas = r.items.filter((it) => it.resultado === "recapada")
                  const descartadas = r.items.filter((it) => it.resultado === "descartada")
                  // La vuelta puede venir por tandas: mientras falte alguna, el
                  // envío sigue abierto y hay que poder ver cuántas son.
                  const enElRecapador = r.items.filter((it) => it.resultado === "pendiente").length
                  const parcial = r.estado === "enviado" && enElRecapador < r.items.length
                  const porCubierta =
                    r.costo_total != null && recapadas.length > 0
                      ? Number(r.costo_total) / recapadas.length
                      : null
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setVer(r)}
                      title="Ver el envío completo"
                      className={cn(
                        "cursor-pointer border-b last:border-0 hover:bg-sky-50",
                        i % 2 === 1 && "bg-muted/40"
                      )}
                    >
                      <td className="py-2 font-medium whitespace-nowrap">
                        {fmtFecha(r.fecha_envio)}
                      </td>
                      <td className="text-muted-foreground">{r.proveedor}</td>
                      <td className="text-muted-foreground">{r.numero_remito || "—"}</td>
                      <td className="text-right tabular-nums">
                        {r.items.length}
                        {descartadas.length > 0 && (
                          <span className="text-xs text-destructive">
                            {" "}
                            ({descartadas.length} desc.)
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            r.estado === "enviado"
                              ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                              : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          )}
                        >
                          {r.estado === "recibido"
                            ? "Recibido"
                            : parcial
                              ? `Faltan ${enElRecapador} de ${r.items.length}`
                              : "En el recapador"}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap">
                        {fmtFecha(r.fecha_retorno)}
                      </td>
                      <td>
                        {(r.factura_urls?.length ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Paperclip className="size-3" />
                            {r.factura_numero || "Sí"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">
                            {r.factura_numero || "—"}
                          </span>
                        )}
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {r.costo_total != null ? fmtMoney(Number(r.costo_total)) : "—"}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {porCubierta != null ? fmtMoney(porCubierta) : "—"}
                      </td>
                      {puedeEditar && (
                        <td
                          className="text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.estado === "enviado" ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setRecibir(r)}
                              >
                                <PackageCheck className="mr-1 size-3.5" />{" "}
                                {parcial ? "Recibir el resto" : "Recibir"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                disabled={parcial}
                                title={
                                  parcial
                                    ? "No se puede borrar: ya volvió parte del envío"
                                    : "Borrar el envío (las cubiertas vuelven a Para recapar)"
                                }
                                onClick={async () => {
                                  const res = await eliminarEnvioRecapado({ id: r.id })
                                  if ("error" in res) toast.error(res.error)
                                  else {
                                    toast.success("Envío borrado")
                                    onRefresh()
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              Click en una fila para ver el remito: qué cubiertas fueron, con cuánta goma
              volvió cada una y cuánto costó.
            </p>
          </div>
        )}
      </CardContent>

      {envioOpen && (
        <NuevoEnvioDialog
          paraRecapar={paraRecapar}
          enStock={enStock}
          onClose={() => setEnvioOpen(false)}
          onDone={() => {
            setEnvioOpen(false)
            onRefresh()
          }}
        />
      )}
      {recibir && (
        <RecepcionDialog
          recapado={recibir}
          onClose={() => setRecibir(null)}
          onDone={() => {
            setRecibir(null)
            onRefresh()
          }}
        />
      )}
      {ver && <DetalleRecapadoDialog recapado={ver} onClose={() => setVer(null)} />}
    </Card>
  )
}

function Dato({
  label,
  valor,
  sub,
  alerta,
}: {
  label: string
  valor: string
  sub?: string
  alerta?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        alerta
          ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"
          : "border-border bg-muted/40"
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground/80">{sub}</p>}
    </div>
  )
}

// ==================== Nuevo envío ====================

function NuevoEnvioDialog({
  paraRecapar,
  enStock,
  onClose,
  onDone,
}: {
  paraRecapar: Neumatico[]
  enStock: Neumatico[]
  onClose: () => void
  onDone: () => void
}) {
  const [proveedor, setProveedor] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [remito, setRemito] = useState("")
  const [obs, setObs] = useState("")
  const [verStock, setVerStock] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Las de stock se ofrecen aparte: normalmente no van, pero pasa que una queda
  // guardada en el depósito y recién después se decide mandarla a recapar.
  const candidatas = verStock ? [...paraRecapar, ...enStock] : paraRecapar

  const toggle = (id: string) =>
    setSel((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  const enviar = async () => {
    setSaving(true)
    const res = await crearEnvioRecapado({
      proveedor,
      fecha_envio: fecha,
      numero_remito: remito,
      observaciones: obs,
      neumatico_ids: [...sel],
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(`${sel.size} cubierta${sel.size > 1 ? "s" : ""} enviada${sel.size > 1 ? "s" : ""} a ${proveedor}`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4 text-muted-foreground" /> Enviar cubiertas a recapar
          </DialogTitle>
          <DialogDescription>
            Elegí las cubiertas que salen. Quedan en estado &quot;En el recapador&quot;
            hasta que se registre la vuelta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Fecha de envío</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Recapador</Label>
              <ProveedorPicker value={proveedor} onChange={setProveedor} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Remito (opcional)</Label>
              <Input value={remito} onChange={(e) => setRemito(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
              <p className="text-sm font-medium">
                Cubiertas ({sel.size} elegida{sel.size === 1 ? "" : "s"})
              </p>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={verStock}
                  onCheckedChange={(v) => setVerStock(v === true)}
                />
                Ver también las que están en stock
              </label>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {candidatas.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No hay cubiertas esperando recapado. Desmontá una con destino
                  &quot;Para recapar&quot; o mostrá las de stock.
                </p>
              ) : (
                <ul className="divide-y">
                  {candidatas.map((n) => (
                    <li key={n.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                        <Checkbox
                          checked={sel.has(n.id)}
                          onCheckedChange={() => toggle(n.id)}
                        />
                        <span className="font-medium">{n.numero || "sin código"}</span>
                        <span className="text-muted-foreground">
                          {[n.marca, n.medida].filter(Boolean).join(" · ")}
                        </span>
                        {n.profundidad_actual_mm != null && (
                          <span className="text-xs text-muted-foreground">
                            · {n.profundidad_actual_mm} mm
                          </span>
                        )}
                        {n.vueltas_recapado > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {n.vueltas_recapado}ª vuelta cumplida
                          </Badge>
                        )}
                        {n.estado === "stock" && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            en stock
                          </Badge>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Observaciones (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={saving || sel.size === 0 || !proveedor.trim()}>
            {saving ? "Guardando…" : `Enviar ${sel.size || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Recepción ====================

interface FilaRecepcion {
  neumatico_id: string
  etiqueta: string
  profundidadEnvio: number | null
  /** Si esta cubierta llegó en esta tanda. Las que no, siguen en el recapador. */
  volvio: boolean
  descartada: boolean
  profundidad: string
  /** Con qué dibujo la devolvió el recapador: de eso depende la profundidad. */
  dibujo: NeumaticoDibujo | ""
  numeroRetorno: string
  obs: string
}

function RecepcionDialog({
  recapado,
  onClose,
  onDone,
}: {
  recapado: Recapado
  onClose: () => void
  onDone: () => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [facturaNumero, setFacturaNumero] = useState("")
  const [costoTotal, setCostoTotal] = useState("")
  const [facturas, setFacturas] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  // Sólo lo que sigue en el recapador: si el envío ya tuvo una tanda, esas
  // cubiertas ya entraron al stock y no se vuelven a tocar.
  const pendientes = recapado.items.filter((it) => it.resultado === "pendiente")
  const yaVueltas = recapado.items.length - pendientes.length
  const [filas, setFilas] = useState<FilaRecepcion[]>(() =>
    pendientes.map((it) => ({
      neumatico_id: it.neumatico_id,
      etiqueta: etiqueta({
        numero: it.numero_envio,
        marca: it.marca,
        medida: it.medida,
      }),
      profundidadEnvio: it.profundidad_envio_mm != null ? Number(it.profundidad_envio_mm) : null,
      volvio: true,
      descartada: false,
      profundidad: "",
      dibujo: "",
      // El recapador devuelve la goma con el mismo código; si le pusiera uno
      // nuevo se corrige acá y la cubierta se renumera sin perder su historial.
      numeroRetorno: it.numero_envio ?? "",
      obs: "",
    }))
  )

  const set = (id: string, cambio: Partial<FilaRecepcion>) =>
    setFilas((prev) => prev.map((f) => (f.neumatico_id === id ? { ...f, ...cambio } : f)))

  const llegaron = filas.filter((f) => f.volvio)
  const recapadas = llegaron.filter((f) => !f.descartada)
  const quedan = filas.length - llegaron.length
  const total = costoTotal ? Number(costoTotal) : null
  const porCubierta = total != null && recapadas.length > 0 ? total / recapadas.length : null
  const sinProfundidad = recapadas.filter((f) => !f.profundidad).length

  const guardar = async () => {
    if (llegaron.length === 0) {
      toast.error("Marcá al menos una cubierta como llegada")
      return
    }
    setSaving(true)
    const urls = await subirFacturasNeumaticos(facturas)
    if (urls === null) {
      setSaving(false)
      return
    }
    const items: RecepcionItemInput[] = llegaron.map((f) => ({
      neumatico_id: f.neumatico_id,
      resultado: f.descartada ? "descartada" : "recapada",
      profundidad_retorno_mm: f.profundidad ? Number(f.profundidad) : null,
      dibujo_retorno: f.dibujo || null,
      numero_retorno: f.numeroRetorno.trim() || null,
      observaciones: f.obs.trim() || null,
    }))
    const res = await registrarRecepcionRecapado({
      recapado_id: recapado.id,
      fecha_retorno: fecha,
      factura_numero: facturaNumero,
      factura_urls: urls,
      costo_total: total,
      items,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(
      `${res.recapadas} al stock como recapadas${
        res.descartadas > 0 ? ` · ${res.descartadas} a la bandeja de desecho` : ""
      }${
        res.pendientes > 0
          ? ` · quedan ${res.pendientes} en el recapador`
          : " · envío completo"
      }`
    )
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="size-4 text-muted-foreground" /> Recibir del recapador
          </DialogTitle>
          <DialogDescription>
            {recapado.proveedor} · enviadas el {fmtFecha(recapado.fecha_envio)} ·{" "}
            {recapado.items.length} cubierta{recapado.items.length > 1 ? "s" : ""}
            {yaVueltas > 0 && ` · ${yaVueltas} ya volvieron en tandas anteriores`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Fecha de retorno</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">N° de factura</Label>
              <Input
                value={facturaNumero}
                onChange={(e) => setFacturaNumero(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Costo total ($)</Label>
              <Input
                type="number"
                value={costoTotal}
                onChange={(e) => setCostoTotal(e.target.value)}
                placeholder="Lo facturado en esta tanda"
              />
            </div>
          </div>

          <FacturaField
            files={facturas}
            onChange={setFacturas}
            label="Factura del recapado (foto o PDF, opcional)"
          />

          <div className="rounded-md border border-border">
            <div className="border-b bg-muted/50 px-3 py-2">
              <p className="text-sm font-medium">Qué volvió en esta tanda</p>
              <p className="text-[11px] text-muted-foreground">
                Destildá &quot;Llegó&quot; en las que todavía siguen en el recapador: el
                envío queda abierto y se registran cuando lleguen, con su fecha y su
                factura. Marcá las que el recapador descartó: esas no llevan costo y caen
                en la bandeja &quot;Para desechar&quot;, hasta que las retire la
                recicladora. La profundidad con la que vuelve pasa a ser su profundidad de
                origen.
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-16 py-1.5 pl-3 text-center">Llegó</th>
                    <th className="py-1.5">Cubierta</th>
                    <th className="text-right">Salió con</th>
                    <th className="w-28">Volvió (mm)</th>
                    <th className="w-32">Dibujo</th>
                    <th className="w-28">Código</th>
                    <th className="w-24 text-center">Descartada</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.neumatico_id}
                      className={cn("border-b last:border-0", !f.volvio && "opacity-50")}
                    >
                      <td className="py-1.5 pl-3 text-center">
                        <Checkbox
                          checked={f.volvio}
                          onCheckedChange={(v) => set(f.neumatico_id, { volvio: v === true })}
                        />
                      </td>
                      <td className="py-1.5">
                        <span
                          className={cn(
                            "font-medium",
                            f.descartada && "text-muted-foreground line-through"
                          )}
                        >
                          {f.etiqueta}
                        </span>
                        {!f.volvio && (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            sigue en el recapador
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {f.profundidadEnvio != null ? `${f.profundidadEnvio} mm` : "—"}
                      </td>
                      <td className="pr-2">
                        <Input
                          type="number"
                          step="0.1"
                          className="h-8"
                          value={f.profundidad}
                          disabled={f.descartada || !f.volvio}
                          onChange={(e) =>
                            set(f.neumatico_id, { profundidad: e.target.value })
                          }
                        />
                      </td>
                      <td className="pr-2">
                        <Select
                          value={f.dibujo || SIN_DIBUJO}
                          disabled={f.descartada || !f.volvio}
                          onValueChange={(v) =>
                            set(f.neumatico_id, {
                              dibujo: v === SIN_DIBUJO ? "" : (v as NeumaticoDibujo),
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SIN_DIBUJO}>Sin dato</SelectItem>
                            {NEUMATICO_DIBUJOS.map((d) => (
                              <SelectItem key={d} value={d}>
                                {NEUMATICO_DIBUJO_LABEL[d]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="pr-2">
                        <Input
                          className="h-8"
                          value={f.numeroRetorno}
                          disabled={f.descartada || !f.volvio}
                          onChange={(e) =>
                            set(f.neumatico_id, { numeroRetorno: e.target.value })
                          }
                        />
                      </td>
                      <td className="text-center">
                        <Checkbox
                          checked={f.descartada}
                          disabled={!f.volvio}
                          onCheckedChange={(v) =>
                            set(f.neumatico_id, { descartada: v === true })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <CircleDollarSign className="size-4 text-muted-foreground" />
            <span>
              {recapadas.length} recapada{recapadas.length === 1 ? "" : "s"}
              {llegaron.length - recapadas.length > 0 &&
                ` · ${llegaron.length - recapadas.length} descartada${
                  llegaron.length - recapadas.length === 1 ? "" : "s"
                }`}
              {quedan > 0 && (
                <span className="text-amber-700 dark:text-amber-500">
                  {" "}
                  · {quedan} quedan en el recapador
                </span>
              )}
            </span>
            <span className="font-medium">
              {porCubierta != null
                ? `${fmtMoney(porCubierta)} por cubierta`
                : "Cargá el costo total para prorratearlo"}
            </span>
          </div>

          {sinProfundidad > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-500">
              <TriangleAlert className="size-3.5 shrink-0" />
              {sinProfundidad} cubierta{sinProfundidad > 1 ? "s" : ""} sin profundidad de
              retorno: van a quedar sin profundidad de origen y su desgaste no se va a
              poder medir.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Registrar la vuelta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Detalle ====================

function DetalleRecapadoDialog({
  recapado: r,
  onClose,
}: {
  recapado: Recapado
  onClose: () => void
}) {
  const recapadas = r.items.filter((it) => it.resultado === "recapada")
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Recycle className="size-4 text-muted-foreground" /> Envío a recapado
          </DialogTitle>
          <DialogDescription>
            {r.proveedor} · {fmtFecha(r.fecha_envio)}
            {r.numero_remito ? ` · remito ${r.numero_remito}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Campo label="Estado" valor={r.estado === "enviado" ? "En el recapador" : "Recibido"} />
            <Campo label="Retorno" valor={fmtFecha(r.fecha_retorno)} />
            <Campo label="Factura" valor={r.factura_numero || "—"} />
            <Campo
              label="Costo total"
              valor={r.costo_total != null ? fmtMoney(Number(r.costo_total)) : "—"}
            />
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Cubierta</th>
                  <th>Venía de</th>
                  <th className="text-right">Salió</th>
                  <th className="text-right">Volvió</th>
                  <th>Código vuelta</th>
                  <th>Resultado</th>
                  <th className="text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((it) => (
                  <FilaItem key={it.id} item={it} />
                ))}
              </tbody>
              {r.costo_total != null && recapadas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 font-medium">
                    <td className="py-2" colSpan={6}>
                      Total ({recapadas.length} recapada{recapadas.length > 1 ? "s" : ""})
                    </td>
                    <td className="text-right tabular-nums">
                      {fmtMoney(Number(r.costo_total))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {r.observaciones && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Observaciones</p>
              <p className="text-foreground">{r.observaciones}</p>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Factura</p>
            {(r.factura_urls?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground/70">No tiene factura cargada.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {r.factura_urls!.map((url) => (
                  <span
                    key={url}
                    className="inline-flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs dark:bg-transparent"
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Paperclip className="size-3" />
                      {nombreDeFacturaUrl(url)}
                    </a>
                    <LinkFacturaPdf url={url} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilaItem({ item: it }: { item: RecapadoItem }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 font-medium">
        {etiqueta({ numero: it.numero_envio, marca: it.marca, medida: it.medida })}
      </td>
      <td className="text-muted-foreground">{it.dominio_origen || "—"}</td>
      <td className="text-right tabular-nums text-muted-foreground">
        {it.profundidad_envio_mm != null ? `${it.profundidad_envio_mm} mm` : "—"}
      </td>
      <td className="text-right tabular-nums">
        {it.profundidad_retorno_mm != null ? `${it.profundidad_retorno_mm} mm` : "—"}
        {/* El dibujo es lo que explica con cuántos mm volvió. */}
        {it.dibujo_retorno && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            {NEUMATICO_DIBUJO_LABEL[it.dibujo_retorno]}
          </span>
        )}
      </td>
      <td className="text-muted-foreground">
        {it.numero_retorno && it.numero_retorno !== it.numero_envio ? (
          <Badge variant="outline" className="text-[10px]">
            {it.numero_retorno} (cambió)
          </Badge>
        ) : (
          it.numero_retorno || "—"
        )}
      </td>
      <td>
        {it.resultado === "pendiente" ? (
          <span className="text-xs text-muted-foreground">En el recapador</span>
        ) : it.resultado === "recapada" ? (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            Recapada
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-destructive/40 bg-destructive/5 text-[10px] text-destructive"
          >
            Descartada
          </Badge>
        )}
      </td>
      <td className="text-right tabular-nums text-muted-foreground">
        {it.costo != null ? fmtMoney(Number(it.costo)) : "—"}
      </td>
    </tr>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{valor}</dd>
    </div>
  )
}
