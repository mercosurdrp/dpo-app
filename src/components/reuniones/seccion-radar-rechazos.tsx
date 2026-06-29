"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import {
  Loader2,
  Radar,
  RefreshCw,
  MessageCircle,
  Upload,
  Check,
  Trash2,
  ClipboardPaste,
  ListChecks,
  ExternalLink,
  Phone,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
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
  getRadarGestion,
  registrarContacto,
  quitarContacto,
  dispararPlanCliente,
  type RadarGestionData,
  type RadarGestionRow,
  type RadarModo,
} from "@/actions/reuniones-radar"
import { getPermisoCrearTareas } from "@/actions/tareas-directas"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable, TipoReunion } from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

const MOTIVO_LABEL: Record<string, string> = {
  sin_dinero: "Sin dinero",
  cerrado: "Cerrado",
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// wa.me con prefijo Argentina. Limpia no-dígitos y antepone 54 si falta.
function waHref(telefono: string | null, texto: string): string {
  const digits = (telefono ?? "").replace(/\D/g, "")
  const base = "https://wa.me/"
  const num = digits ? (digits.startsWith("54") ? digits : `54${digits}`) : ""
  return `${base}${num}?text=${encodeURIComponent(texto)}`
}

/**
 * Sección "Radar de Rechazos" de la reunión Ventas-Logística (vespertina).
 * Sobre la foto del radar (clientes con entrega a +2 días) los supervisores +
 * jefe de venta repasan los clientes en riesgo por SIN DINERO / CERRADO,
 * registran el contacto al cliente con la captura del chat (evidencia) y, si
 * hace falta, disparan un plan de acción puntual que cae en /planes.
 */
export function SeccionRadarRechazos({
  reunionId,
  reunionTipo = "logistica-ventas",
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  reunionId: string
  reunionTipo?: TipoReunion
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [modo, setModo] = useState<RadarModo>("criticos")
  const [data, setData] = useState<RadarGestionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [puedeCrearPlan, setPuedeCrearPlan] = useState(false)
  const [seleccionado, setSeleccionado] = useState<RadarGestionRow | null>(null)

  useEffect(() => {
    void getPermisoCrearTareas().then(setPuedeCrearPlan)
  }, [])

  useEffect(() => {
    let cancel = false
    setLoading(true)
    void getRadarGestion(reunionId, modo, 7).then((res) => {
      if (cancel) return
      if ("error" in res) {
        toast.error(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [reunionId, modo, reload])

  const refrescar = useCallback(() => setReload((k) => k + 1), [])

  // Mantener el cliente abierto sincronizado con los datos refrescados.
  const clienteVivo = seleccionado
    ? (data?.clientes.find((c) => c.id_cliente === seleccionado.id_cliente) ?? seleccionado)
    : null

  const total = data?.total ?? 0
  const contactados = data?.clientes.filter((c) => c.gestion?.contactado_at).length ?? 0
  const conPlan = data?.clientes.filter((c) => c.gestion?.plan_id).length ?? 0

  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-orange-900">
          <Radar className="size-5 text-orange-600" />
          Radar de Rechazos · gestión anticipada
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-orange-200">
            <button
              type="button"
              onClick={() => setModo("criticos")}
              className={`px-3 py-1 text-xs font-medium ${modo === "criticos" ? "bg-orange-600 text-white" : "bg-white text-orange-700 hover:bg-orange-100"}`}
            >
              Críticos (&gt;7)
            </button>
            <button
              type="button"
              onClick={() => setModo("todos")}
              className={`px-3 py-1 text-xs font-medium ${modo === "todos" ? "bg-orange-600 text-white" : "bg-white text-orange-700 hover:bg-orange-100"}`}
            >
              Todos
            </button>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={refrescar} disabled={loading}>
            <RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {data?.fecha_entrega && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-orange-900/80">
            <span>
              Entrega: <strong>{data.fecha_entrega}</strong> (a 2 días)
            </span>
            <span>Foto generada: {fmtFechaHora(data.generado_at)}</span>
            <span>
              {total} en lista · {contactados} contactados · {conPlan} con plan
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando radar…
          </div>
        ) : !data || data.clientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-orange-200 py-8 text-center text-sm text-muted-foreground">
            <Radar className="mb-2 size-6 text-orange-300" />
            {data?.fecha_entrega
              ? modo === "criticos"
                ? "No hay clientes críticos (>7 sin dinero) en la foto de hoy."
                : "No hay clientes en riesgo en la foto de hoy."
              : "Todavía no se generó la foto del radar."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-orange-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-orange-50/60 text-left text-xs text-orange-900/70">
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Promotor</th>
                  <th className="px-3 py-2 text-center font-medium">Sin dinero</th>
                  <th className="px-3 py-2 text-center font-medium">Cerrado</th>
                  <th className="px-3 py-2 text-right font-medium">Pedido</th>
                  <th className="px-3 py-2 text-center font-medium">Estado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((c) => (
                  <tr key={c.id_cliente} className="border-b last:border-0 hover:bg-orange-50/30">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{c.nombre ?? `Cliente ${c.id_cliente}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.localidad, c.reparto ? `Reparto ${c.reparto}` : null].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c.promotor ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-semibold ${c.sin_dinero_anio > 7 ? "text-red-600" : "text-slate-700"}`}>
                        {c.sin_dinero_anio}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700">{c.cerrado_anio}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-600">
                      {c.bultos_pedido} bto · ${c.monto_pedido.toLocaleString("es-AR")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {c.gestion?.contactado_at && (
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <Check className="mr-1 size-3" /> Contactado
                          </Badge>
                        )}
                        {c.gestion?.plan_id && (
                          <Badge className="border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-100">
                            <ListChecks className="mr-1 size-3" /> Con plan
                          </Badge>
                        )}
                        {!c.gestion?.contactado_at && !c.gestion?.plan_id && (
                          <span className="text-xs text-muted-foreground">Pendiente</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setSeleccionado(c)}
                      >
                        Gestionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ActionLogSeccion
          reunionId={reunionId}
          reunionTipo={reunionTipo}
          seccion="radar_rechazos"
          titulo="Radar de Rechazos"
          actividades={actividades}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onChanged={onActividadesChanged}
        />
      </CardContent>

      {clienteVivo && (
        <GestionClienteDialog
          reunionId={reunionId}
          cliente={clienteVivo}
          responsables={responsables}
          puedeEditar={puedeEditar}
          puedeCrearPlan={puedeCrearPlan}
          fechaEntrega={data?.fecha_entrega ?? null}
          onClose={() => setSeleccionado(null)}
          onChanged={refrescar}
        />
      )}
    </Card>
  )
}

// Dialog de gestión por cliente: WhatsApp + validar mensaje (captura) + plan.
// ──────────────────────────────────────────────────────────────────────────
function GestionClienteDialog({
  reunionId,
  cliente,
  responsables,
  puedeEditar,
  puedeCrearPlan,
  fechaEntrega,
  onClose,
  onChanged,
}: {
  reunionId: string
  cliente: RadarGestionRow
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  puedeCrearPlan: boolean
  fechaEntrega: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [captura, setCaptura] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [guardando, startGuardar] = useTransition()
  const [quitando, startQuitar] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const motivoLabel = MOTIVO_LABEL[cliente.motivo] ?? cliente.motivo
  const nombre = cliente.nombre ?? `Cliente ${cliente.id_cliente}`
  const mensajeWa = `Hola, te escribimos de Mercosur por tu pedido con entrega el ${fechaEntrega ?? "próximo"}. ¿Coordinamos para que esté todo listo y evitar el rechazo?`

  // Plan
  const [planAbierto, setPlanAbierto] = useState(false)
  const [titulo, setTitulo] = useState(`Gestión rechazo — ${nombre}`)
  const [descripcion, setDescripcion] = useState(
    `Cliente ${nombre} (id ${cliente.id_cliente})${cliente.localidad ? `, ${cliente.localidad}` : ""}. ` +
      `Riesgo por ${motivoLabel} (sin dinero: ${cliente.sin_dinero_anio}, cerrado: ${cliente.cerrado_anio} en el año). ` +
      `Entrega ${fechaEntrega ?? "próxima"}. Promotor: ${cliente.promotor ?? "—"}.`,
  )
  const [responsableId, setResponsableId] = useState<string>("")
  const [fechaLimite, setFechaLimite] = useState<string>(fechaEntrega ?? "")
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("alta")
  const [creandoPlan, startCrearPlan] = useTransition()

  // Pegar la captura con Ctrl+V mientras el dialog está abierto.
  useEffect(() => {
    if (!puedeEditar) return
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const img = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"))
      if (!img) return
      const blob = img.getAsFile()
      if (!blob) return
      const ext = blob.type.split("/")[1] || "png"
      const file = new File([blob], `chat-${cliente.id_cliente}-${Date.now()}.${ext}`, { type: blob.type })
      setCaptura(file)
      setPreview(URL.createObjectURL(file))
      toast.success("Captura pegada")
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [puedeEditar, cliente.id_cliente])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setCaptura(f)
    setPreview(URL.createObjectURL(f))
  }

  function guardarContacto() {
    if (!captura) {
      toast.error("Pegá (Ctrl+V) o subí la captura del chat")
      return
    }
    const fd = new FormData()
    fd.set("reunion_id", reunionId)
    fd.set("id_cliente", String(cliente.id_cliente))
    fd.set("nombre_cliente", nombre)
    fd.set("motivo", cliente.motivo)
    fd.set("foto", captura)
    startGuardar(async () => {
      const res = await registrarContacto(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Mensaje validado y guardado como evidencia")
      setCaptura(null)
      setPreview(null)
      onChanged()
    })
  }

  function quitar() {
    if (!confirm("¿Quitar la captura y marcar como no contactado?")) return
    startQuitar(async () => {
      const res = await quitarContacto(reunionId, cliente.id_cliente)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Contacto quitado")
      onChanged()
    })
  }

  function crearPlan() {
    if (!responsableId) {
      toast.error("Elegí un responsable")
      return
    }
    startCrearPlan(async () => {
      const res = await dispararPlanCliente({
        reunion_id: reunionId,
        id_cliente: cliente.id_cliente,
        nombre_cliente: nombre,
        motivo: cliente.motivo,
        titulo,
        descripcion,
        responsable_ids: [responsableId],
        fecha_limite: fechaLimite || null,
        prioridad,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan de acción disparado")
      setPlanAbierto(false)
      onChanged()
    })
  }

  const yaContactado = !!cliente.gestion?.contactado_at

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{nombre}</span>
            <Badge className="border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100">
              {motivoLabel}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            {[cliente.localidad, cliente.reparto ? `Reparto ${cliente.reparto}` : null, cliente.promotor]
              .filter(Boolean)
              .join(" · ")}
            <div className="mt-1">
              Sin dinero (año): <strong>{cliente.sin_dinero_anio}</strong> · Cerrado: {cliente.cerrado_anio} ·
              Pedido: {cliente.bultos_pedido} bto / ${cliente.monto_pedido.toLocaleString("es-AR")}
            </div>
          </div>

          {/* WhatsApp */}
          <a
            href={waHref(cliente.telefono, mensajeWa)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-md bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <MessageCircle className="size-4" />
            {cliente.telefono ? `Escribir por WhatsApp (${cliente.telefono})` : "Abrir WhatsApp"}
          </a>
          {!cliente.telefono && (
            <p className="-mt-2 flex items-center gap-1 text-xs text-amber-600">
              <Phone className="size-3" /> Sin teléfono cargado para este cliente.
            </p>
          )}

          {/* Validar mensaje enviado */}
          {puedeEditar && (
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <Label className="text-sm font-semibold">Validar mensaje enviado (evidencia)</Label>
              {yaContactado ? (
                <div className="space-y-2">
                  {cliente.gestion?.foto_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cliente.gestion.foto_url}
                      alt="Captura del chat"
                      className="max-h-48 w-auto rounded border"
                    />
                  )}
                  <p className="text-xs text-emerald-700">
                    Contactado por {cliente.gestion?.contactado_nombre ?? "—"} ·{" "}
                    {fmtFechaHora(cliente.gestion?.contactado_at ?? null)}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-red-600"
                    onClick={quitar}
                    disabled={quitando}
                  >
                    {quitando ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Trash2 className="mr-1 size-3.5" />}
                    Quitar captura
                  </Button>
                </div>
              ) : (
                <>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ClipboardPaste className="size-3.5" /> Pegá la captura con Ctrl+V o subila.
                  </p>
                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Previsualización" className="max-h-48 w-auto rounded border" />
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="mr-1 size-3.5" /> Subir
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={guardarContacto} disabled={guardando || !captura}>
                      {guardando ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Check className="mr-1 size-3.5" />}
                      Guardar evidencia
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Plan de acción */}
          {cliente.gestion?.plan_id ? (
            <Link
              href={`/planes/${cliente.gestion.plan_id}`}
              className="flex items-center justify-center gap-2 rounded-md border border-violet-200 bg-violet-50 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
            >
              <ListChecks className="size-4" /> Ver plan de acción
              <ExternalLink className="size-3.5" />
            </Link>
          ) : puedeCrearPlan && puedeEditar ? (
            !planAbierto ? (
              <Button variant="outline" className="w-full" onClick={() => setPlanAbierto(true)}>
                <ListChecks className="mr-2 size-4" /> Disparar plan de acción
              </Button>
            ) : (
              <div className="space-y-2 rounded-md border border-violet-200 p-3">
                <Label className="text-sm font-semibold text-violet-800">Plan de acción puntual</Label>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" className="h-8 text-sm" />
                <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Responsable</Label>
                    <Select value={responsableId} onValueChange={(v) => setResponsableId(v ?? "")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Elegir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {responsables.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridad</Label>
                    <Select value={prioridad} onValueChange={(v) => v && setPrioridad(v as "alta" | "media" | "baja")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="baja">Baja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Fecha límite</Label>
                  <Input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setPlanAbierto(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={crearPlan} disabled={creandoPlan}>
                    {creandoPlan ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <ListChecks className="mr-1 size-3.5" />}
                    Crear plan
                  </Button>
                </div>
              </div>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
