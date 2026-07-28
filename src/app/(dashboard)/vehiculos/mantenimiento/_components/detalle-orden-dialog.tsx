"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Ban,
  Cloud,
  FileDown,
  FileSpreadsheet,
  Paperclip,
  Pencil,
  Truck,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MANTENIMIENTO_ESTADO_LABELS } from "@/types/database"
import type {
  MantenimientoPlanTarea,
  MantenimientoRealizado,
  MantenimientoTareaReprogramada,
} from "@/types/database"
import {
  ESTADO_MANT_BADGE,
  TIPO_MANT_BADGE,
  TIPO_MANT_LABEL,
  fmtFechaHoraOt,
  fmtFechaOt,
  fmtMoneyOt,
  fmtNumOt,
  nombreArchivoDeUrl,
} from "./ot-formato"

// Detalle de una orden de trabajo (se abre al clickear la fila). Lo usan la
// solapa de Órdenes de Trabajo y la de Neumáticos, que lista las OT de cubiertas.

export function DetalleOrdenDialog({
  mantenimiento: m,
  tareasById,
  reprogramadas,
  puedeEditar,
  onClose,
  onEditar,
}: {
  mantenimiento: MantenimientoRealizado
  tareasById: Map<string, MantenimientoPlanTarea>
  /** Tareas del plan que esta OT dejó reprogramadas. */
  reprogramadas: MantenimientoTareaReprogramada[]
  puedeEditar: boolean
  onClose: () => void
  onEditar: () => void
}) {
  const tareas = m.tareas || []
  const fueraServicio = !!m.fuera_servicio_desde
  // Comprobantes con proveedor/nº/monto (una OT puede tener varios: repuestos de
  // un proveedor, mano de obra de otro).
  const comprobantes = [...(m.facturas ?? [])].sort((a, b) => a.orden - b.orden)
  // Adjuntos sueltos de las OT viejas: los que no cuelgan de ningún comprobante.
  const adjuntosSueltos = (m.evidencia_urls ?? []).filter(
    (url) => !comprobantes.some((f) => f.adjunto_url === url)
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Wrench className="size-4 text-muted-foreground/70" />
            Orden de trabajo · {m.dominio}
          </DialogTitle>
          <DialogDescription>
            {fmtFechaOt(m.fecha)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Estado / tipo */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={TIPO_MANT_BADGE[m.tipo]}>
              {TIPO_MANT_LABEL[m.tipo]}
            </Badge>
            <Badge variant="outline" className={ESTADO_MANT_BADGE[m.estado]}>
              {MANTENIMIENTO_ESTADO_LABELS[m.estado]}
            </Badge>
            {m.es_service_general && (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <Wrench className="size-3" /> Service general
              </Badge>
            )}
            {m.origen === "cloudfleet" && (
              <Badge
                variant="outline"
                className="gap-1 border-sky-200 bg-sky-50 text-sky-700"
              >
                <Cloud className="size-3" /> Cloudfleet
              </Badge>
            )}
            {fueraServicio ? (
              <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
                <Ban className="size-3" /> No disponible
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <Truck className="size-3" /> Disponible
              </Badge>
            )}
          </div>

          {/* Datos */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Dominio</dt>
              <dd className="font-medium text-foreground">{m.dominio}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Fecha</dt>
              <dd className="text-foreground">{fmtFechaOt(m.fecha)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Km / Horas</dt>
              <dd className="tabular-nums text-foreground">
                {m.odometro != null
                  ? `${fmtNumOt(m.odometro)} km`
                  : m.horometro != null
                    ? `${fmtNumOt(Number(m.horometro))} hs`
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Taller</dt>
              <dd className="text-foreground">{m.taller || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Costo total (mano de obra + repuestos)
              </dt>
              <dd className="tabular-nums text-foreground">
                {m.costo != null ? fmtMoneyOt(Number(m.costo)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">N° de factura</dt>
              <dd className="text-foreground">{m.numero_factura || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">N° de OT</dt>
              <dd className="text-foreground">{m.numero_ot || "—"}</dd>
            </div>
            {m.entrada_taller ? (
              <div className="col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Taller (entrada / salida)</dt>
                <dd className="text-foreground">
                  {fmtFechaHoraOt(m.entrada_taller)}
                  {m.salida_taller ? ` → ${fmtFechaHoraOt(m.salida_taller)}` : " → en el taller"}
                </dd>
              </div>
            ) : (
              fueraServicio && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Fuera de servicio</dt>
                  <dd className="text-foreground">
                    {fmtFechaOt(m.fuera_servicio_desde)}
                    {m.fuera_servicio_hasta
                      ? ` → ${fmtFechaOt(m.fuera_servicio_hasta)}`
                      : " → sigue"}
                  </dd>
                </div>
              )
            )}
          </dl>

          {/* Trabajo realizado: tareas cargadas y/o el detalle escrito en observaciones */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Trabajo realizado en la unidad
            </p>
            {tareas.length === 0 && !m.observaciones ? (
              <p className="text-muted-foreground/70">Sin detalle del trabajo cargado.</p>
            ) : (
              <div className="space-y-2">
                {tareas.length > 0 && (
                  <ul className="space-y-1">
                    {tareas.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5"
                      >
                        <span className="text-foreground">
                          {t.tarea_id
                            ? tareasById.get(t.tarea_id)?.nombre ?? "Tarea"
                            : t.descripcion || "Tarea"}
                        </span>
                        {t.costo != null && (
                          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                            {fmtMoneyOt(Number(t.costo))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {m.observaciones && (
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/50 px-2.5 py-1.5 text-foreground">
                    {m.observaciones}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tareas del plan que quedaron sin hacer en esta OT */}
          {reprogramadas.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-amber-700">
                Quedó pendiente (reprogramado)
              </p>
              <ul className="space-y-1">
                {reprogramadas.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground">
                        {tareasById.get(r.tarea_id)?.nombre ?? "Tarea del plan"}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-xs",
                          r.estado === "abierta"
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        )}
                      >
                        {r.estado === "abierta"
                          ? "Pendiente"
                          : r.estado === "resuelta"
                            ? "Hecha después"
                            : "Cancelada"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-amber-800">
                      {r.motivo || "Sin motivo cargado"}
                      {r.reprogramada_km != null && ` · para los ${fmtNumOt(r.reprogramada_km)} km`}
                      {r.reprogramada_fecha && ` · para el ${fmtFechaOt(r.reprogramada_fecha)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Repuestos */}
          {(m.repuestos?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Repuestos</p>
              <ul className="space-y-1">
                {m.repuestos!.map((r) => {
                  const sub = r.costo_unitario != null ? Number(r.costo_unitario) * Number(r.cantidad) : null
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5"
                    >
                      <span className="text-foreground">
                        {r.descripcion}
                        {Number(r.cantidad) !== 1 && (
                          <span className="text-muted-foreground/70"> ×{fmtNumOt(Number(r.cantidad))}</span>
                        )}
                      </span>
                      {sub != null && (
                        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                          {fmtMoneyOt(sub)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Mano de obra */}
          {(m.horas_mano_obra != null || m.costo_mano_obra != null) && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Mano de obra</p>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5">
                <span className="text-foreground">
                  {m.horas_mano_obra != null ? `${fmtNumOt(Number(m.horas_mano_obra))} hs` : "—"}
                </span>
                {m.costo_mano_obra != null && (
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {fmtMoneyOt(Number(m.costo_mano_obra))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Facturas de la OT: proveedor + nº + monto + su adjunto */}
          {comprobantes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Facturas y comprobantes
              </p>
              <div className="space-y-1">
                {comprobantes.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-white px-2 py-1.5 text-xs"
                  >
                    <span className="font-medium text-foreground">
                      {f.proveedor || "Sin proveedor"}
                    </span>
                    {f.numero && (
                      <span className="text-muted-foreground">Fc {f.numero}</span>
                    )}
                    {f.monto_total != null && (
                      <span className="tabular-nums text-muted-foreground">
                        {fmtMoneyOt(Number(f.monto_total))}
                      </span>
                    )}
                    {f.adjunto_url ? (
                      <a
                        href={f.adjunto_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-sky-600 hover:underline"
                      >
                        <Paperclip className="size-3" />
                        {nombreArchivoDeUrl(f.adjunto_url)}
                      </a>
                    ) : (
                      <span className="ml-auto text-muted-foreground/70">sin adjunto</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Adjuntos sin factura asociada (OT cargadas antes del desglose) */}
          {adjuntosSueltos.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Adjuntos</p>
              <div className="flex flex-wrap gap-2">
                {adjuntosSueltos.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-sky-600 hover:bg-sky-50"
                  >
                    <Paperclip className="size-3" />
                    {nombreArchivoDeUrl(url)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            title="Descargar esta orden de trabajo en Excel"
            render={<a href={`/api/vehiculos/ordenes/${m.id}/export`} download />}
          >
            <FileSpreadsheet className="mr-1 size-4 text-emerald-600" /> Excel
          </Button>
          <Button
            variant="outline"
            title="Descargar esta orden de trabajo en PDF"
            render={
              <a
                href={`/api/vehiculos/ordenes/${m.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileDown className="mr-1 size-4 text-red-600" /> PDF
          </Button>
          {puedeEditar && (
            <Button variant="outline" onClick={onEditar}>
              <Pencil className="mr-1 size-3.5" /> Editar
            </Button>
          )}
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

