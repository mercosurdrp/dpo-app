"use client"

/**
 * Desecho y reciclado — la bandeja de las cubiertas que ya no sirven y el
 * remito de retiro de la recicladora.
 *
 * "Dar de baja" era instantáneo, pero en el patio la goma se apila hasta que
 * pasa la recicladora a llevarse la tanda. Ahora ese paso existe: la cubierta
 * queda en "Para desechar" (no montable, todavía no es baja) y la baja la hace
 * el retiro, que además guarda el certificado de descarte.
 *
 * El retiro se registra en `mantenimiento_residuos`, la tabla de disposición de
 * residuos del módulo: así el mismo acto da de baja las cubiertas y deja la
 * evidencia ambiental, sin cargar lo mismo dos veces.
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Paperclip, Recycle, Trash2, Undo2 } from "lucide-react"
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
  marcarParaDesecho,
  registrarRetiroRecicladora,
  volverDeDesecho,
} from "@/actions/desecho-neumaticos"
import type { Neumatico, RetiroCubiertas } from "@/lib/vehiculos/neumaticos-tipos"
import { ProveedorPicker } from "./proveedor-picker"
import {
  FacturaField,
  LinkFacturaPdf,
  nombreDeFacturaUrl,
  subirFacturasNeumaticos,
} from "./factura-neumaticos"

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

export function DesechoPanel({
  neumaticos,
  retiros,
  puedeEditar,
  onRefresh,
}: {
  neumaticos: Neumatico[]
  retiros: RetiroCubiertas[]
  puedeEditar: boolean
  onRefresh: () => void
}) {
  const [retiroOpen, setRetiroOpen] = useState(false)
  const [marcarOpen, setMarcarOpen] = useState(false)
  const [ver, setVer] = useState<RetiroCubiertas | null>(null)

  const paraDesecho = useMemo(
    () =>
      neumaticos
        .filter((n) => n.estado === "para_desecho")
        .sort((a, b) => (a.numero ?? "").localeCompare(b.numero ?? "")),
    [neumaticos]
  )
  // Candidatas a marcar: lo que está en el depósito sin uso definido.
  const candidatas = useMemo(
    () =>
      neumaticos.filter((n) => n.estado === "stock" || n.estado === "para_recapar"),
    [neumaticos]
  )

  const anio = hoyISO().slice(0, 4)
  const retiradasAnio = retiros
    .filter((r) => r.fecha?.slice(0, 4) === anio)
    .reduce((a, r) => a + Number(r.cantidad ?? 0), 0)
  const sinCertificado = retiros.filter((r) => !r.certificado_url).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="size-4 text-muted-foreground" /> Desecho y reciclado
              {paraDesecho.length > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                >
                  {paraDesecho.length} esperando retiro
                </Badge>
              )}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              La cubierta que ya no sirve queda acá hasta que la recicladora se lleva la
              tanda. La baja se hace al registrar el retiro, con el certificado de
              descarte — que es la evidencia del pilar.
            </p>
          </div>
          {puedeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMarcarOpen(true)}>
                <Trash2 className="mr-1 size-4" /> Marcar para desecho
              </Button>
              <Button
                onClick={() => setRetiroOpen(true)}
                disabled={paraDesecho.length === 0}
              >
                <Recycle className="mr-1 size-4" /> Registrar retiro
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Bandeja */}
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">
            En el patio, esperando a la recicladora ({paraDesecho.length})
          </p>
          {paraDesecho.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay cubiertas esperando. Se llega acá al desmontar con destino
              &quot;Para desechar&quot;, con el botón de arriba, o cuando el recapador
              descarta una del envío.
            </p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {paraDesecho.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                >
                  <span className="font-medium">{n.numero || "sin código"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[n.marca, n.medida].filter(Boolean).join(" · ")}
                  </span>
                  {n.motivo_baja && (
                    <span
                      className="ml-auto truncate text-[11px] text-muted-foreground/80"
                      title={n.motivo_baja}
                    >
                      {n.motivo_baja}
                    </span>
                  )}
                  {puedeEditar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-6 shrink-0 text-muted-foreground hover:text-foreground"
                      title="Sacar de la bandeja y devolver al stock"
                      onClick={async () => {
                        const res = await volverDeDesecho({ id: n.id })
                        if ("error" in res) toast.error(res.error)
                        else {
                          toast.success(
                            `Cubierta ${n.numero || "s/n"} devuelta al stock`
                          )
                          onRefresh()
                        }
                      }}
                    >
                      <Undo2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Historial de retiros */}
        {retiros.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se registró ningún retiro a la recicladora.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-1 text-sm font-medium">
              Retiros ({retiros.length}) · {retiradasAnio} cubiertas en {anio}
              {sinCertificado > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-500">
                  {sinCertificado} sin certificado
                </span>
              )}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Fecha</th>
                  <th>Se las llevó</th>
                  <th className="text-right">Cubiertas</th>
                  <th>Códigos</th>
                  <th>Certificado</th>
                </tr>
              </thead>
              <tbody>
                {retiros.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setVer(r)}
                    title="Ver el retiro"
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-sky-50",
                      i % 2 === 1 && "bg-muted/40"
                    )}
                  >
                    <td className="py-2 font-medium whitespace-nowrap">
                      {fmtFecha(r.fecha)}
                    </td>
                    <td className="text-muted-foreground">{r.proveedor}</td>
                    <td className="text-right tabular-nums">{r.cantidad ?? "—"}</td>
                    <td className="max-w-64 truncate text-muted-foreground">
                      {r.numeros_fuego || "—"}
                    </td>
                    <td>
                      {r.certificado_url ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <Paperclip className="size-3" /> Sí
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700 dark:text-amber-500">
                          falta
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {marcarOpen && (
        <MarcarDesechoDialog
          candidatas={candidatas}
          onClose={() => setMarcarOpen(false)}
          onDone={() => {
            setMarcarOpen(false)
            onRefresh()
          }}
        />
      )}
      {retiroOpen && (
        <RetiroDialog
          cubiertas={paraDesecho}
          onClose={() => setRetiroOpen(false)}
          onDone={() => {
            setRetiroOpen(false)
            onRefresh()
          }}
        />
      )}
      {ver && (
        <DetalleRetiroDialog
          retiro={ver}
          cubiertas={neumaticos.filter((n) => n.residuo_id === ver.id)}
          onClose={() => setVer(null)}
        />
      )}
    </Card>
  )
}

// ==================== Marcar para desecho ====================

function MarcarDesechoDialog({
  candidatas,
  onClose,
  onDone,
}: {
  candidatas: Neumatico[]
  onClose: () => void
  onDone: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) =>
    setSel((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  const guardar = async () => {
    setSaving(true)
    const res = await marcarParaDesecho({ ids: [...sel], motivo })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(`${res.marcadas} cubierta${res.marcadas > 1 ? "s" : ""} para desecho`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-4 text-muted-foreground" /> Marcar cubiertas para
            desecho
          </DialogTitle>
          <DialogDescription>
            Salen del stock y quedan esperando el retiro. Todavía no son baja: la baja la
            hace el retiro de la recicladora.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Motivo (por qué no sirve más)
            </Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Lisa, rotura de talón, no es recapable…"
            />
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">
              Cubiertas del depósito ({sel.size} elegida{sel.size === 1 ? "" : "s"})
            </div>
            <div className="max-h-64 overflow-y-auto">
              {candidatas.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No hay cubiertas en el depósito. Las que están montadas se mandan al
                  desecho desde el diagrama, al desmontarlas.
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
                        {n.estado === "para_recapar" && (
                          <Badge variant="outline" className="text-[10px]">
                            estaba para recapar
                          </Badge>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving || sel.size === 0}>
            {saving ? "Guardando…" : `Marcar ${sel.size || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Retiro ====================

function RetiroDialog({
  cubiertas,
  onClose,
  onDone,
}: {
  cubiertas: Neumatico[]
  onClose: () => void
  onDone: () => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [proveedor, setProveedor] = useState("")
  const [obs, setObs] = useState("")
  const [certificados, setCertificados] = useState<File[]>([])
  // Por defecto se lleva toda la bandeja: es lo que pasa en el patio.
  const [sel, setSel] = useState<Set<string>>(() => new Set(cubiertas.map((n) => n.id)))
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) =>
    setSel((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  const guardar = async () => {
    setSaving(true)
    const urls = await subirFacturasNeumaticos(certificados)
    if (urls === null) {
      setSaving(false)
      return
    }
    const res = await registrarRetiroRecicladora({
      fecha,
      proveedor,
      neumatico_ids: [...sel],
      certificado_urls: urls,
      observaciones: obs,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(
      `${res.retiradas} cubierta${res.retiradas > 1 ? "s" : ""} retirada${
        res.retiradas > 1 ? "s" : ""
      } por ${proveedor} y dada${res.retiradas > 1 ? "s" : ""} de baja`
    )
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Recycle className="size-4 text-muted-foreground" /> Retiro a la recicladora
          </DialogTitle>
          <DialogDescription>
            Al confirmar, las cubiertas quedan de baja y se registra la disposición del
            residuo con su certificado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Fecha del retiro</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Quién se las lleva (recicladora)
              </Label>
              <ProveedorPicker value={proveedor} onChange={setProveedor} />
            </div>
          </div>

          <FacturaField
            files={certificados}
            onChange={setCertificados}
            label="Certificado de descarte (foto o PDF)"
          />

          <div className="rounded-md border border-border">
            <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">
              Se llevan ({sel.size} de {cubiertas.length})
            </div>
            <div className="max-h-56 overflow-y-auto">
              <ul className="divide-y">
                {cubiertas.map((n) => (
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
                      {n.motivo_baja && (
                        <span className="ml-auto truncate text-[11px] text-muted-foreground/80">
                          {n.motivo_baja}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
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
          <Button onClick={guardar} disabled={saving || sel.size === 0 || !proveedor.trim()}>
            {saving ? "Guardando…" : "Registrar el retiro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Detalle ====================

function DetalleRetiroDialog({
  retiro: r,
  cubiertas,
  onClose,
}: {
  retiro: RetiroCubiertas
  cubiertas: Neumatico[]
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Recycle className="size-4 text-muted-foreground" /> Retiro a la recicladora
          </DialogTitle>
          <DialogDescription>
            {r.proveedor} · {fmtFecha(r.fecha)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Cantidad</dt>
              <dd className="font-medium text-foreground">
                {r.cantidad ?? "—"} {r.unidad || ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Medidas</dt>
              <dd className="text-foreground">{r.descripcion || "—"}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Cubiertas retiradas
            </p>
            {cubiertas.length === 0 ? (
              <p className="text-muted-foreground/70">
                {r.numeros_fuego || "Sin códigos registrados."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {cubiertas.map((n) => (
                  <Badge key={n.id} variant="outline" className="text-[11px]">
                    {n.numero || "s/n"}
                    {n.medida ? ` · ${n.medida}` : ""}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {r.observaciones && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Observaciones
              </p>
              <p className="text-foreground">{r.observaciones}</p>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Certificado de descarte
            </p>
            {!r.certificado_url ? (
              <p className="text-amber-700 dark:text-amber-500">
                Falta cargarlo: es la evidencia de la disposición del residuo.
              </p>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs dark:bg-transparent">
                <a
                  href={r.certificado_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <Paperclip className="size-3" />
                  {nombreDeFacturaUrl(r.certificado_url)}
                </a>
                <LinkFacturaPdf url={r.certificado_url} />
              </span>
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
