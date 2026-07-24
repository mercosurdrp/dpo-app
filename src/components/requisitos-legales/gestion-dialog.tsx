"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import {
  CheckCircle2,
  FileDown,
  Loader2,
  Paperclip,
  Plus,
  XCircle,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  cancelarGestion,
  getSignedUrl,
  listGestionesDeRequisito,
  registrarMovimientoGestion,
} from "@/actions/requisitos-legales"
import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import {
  ESTADOS_GESTION_OPCIONES,
  ESTADO_GESTION_LABEL,
  formatFechaCorta,
  GestionBadge,
} from "./gestion-badge"
import type {
  EstadoGestionRequisito,
  RequisitoLegalConResponsable,
  RequisitoLegalGestion,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  requisito: RequisitoLegalConResponsable | null
  /** El usuario puede cargar movimientos (editor o responsable del item). */
  puedeGestionar: boolean
  onSaved: () => void
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function GestionDialog({
  open,
  onOpenChange,
  requisito,
  puedeGestionar,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gestiones, setGestiones] = useState<RequisitoLegalGestion[]>([])
  const [estado, setEstado] = useState<EstadoGestionRequisito>("solicitado")
  const [verHistorial, setVerHistorial] = useState(false)

  const requisitoId = requisito?.id ?? null

  const cargar = useCallback(async () => {
    if (!requisitoId) return
    setCargando(true)
    setError(null)
    const result = await listGestionesDeRequisito(requisitoId)
    setCargando(false)
    if ("error" in result) {
      setError(result.error)
      setGestiones([])
      return
    }
    setGestiones(result.data)
  }, [requisitoId])

  useEffect(() => {
    if (open && requisitoId) {
      setVerHistorial(false)
      void cargar()
    }
  }, [open, requisitoId, cargar])

  const abierta = gestiones.find((g) => g.abierta) ?? null
  const cerradas = gestiones.filter((g) => !g.abierta)

  // El próximo movimiento arranca en el estado siguiente al actual: si ya hay
  // turno, lo natural es pasar a "en trámite".
  useEffect(() => {
    if (!abierta) {
      setEstado("solicitado")
      return
    }
    setEstado(
      abierta.estado === "solicitado"
        ? "turno_asignado"
        : abierta.estado === "turno_asignado"
          ? "en_tramite"
          : "en_tramite",
    )
  }, [abierta])

  if (!requisito) return null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set("estado", estado)

    startTransition(async () => {
      const result = await registrarMovimientoGestion(requisito!.id, formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      form.reset()
      await cargar()
      onSaved()
    })
  }

  function handleCancelar() {
    if (!abierta) return
    const motivo = prompt(
      "¿Por qué se cancela la gestión? (opcional)\n\nEl trámite queda cerrado en el historial y el requisito vuelve a figurar sin gestión.",
    )
    if (motivo === null) return
    startTransition(async () => {
      const result = await cancelarGestion(abierta.id, motivo)
      if ("error" in result) {
        setError(result.error)
        return
      }
      await cargar()
      onSaved()
    })
  }

  async function abrirComprobante(archivoUrl: string) {
    const result = await getSignedUrl(archivoUrl)
    if ("error" in result) {
      setError(`Error abriendo el comprobante: ${result.error}`)
      return
    }
    abrirArchivoEnVisor(result.data.url)
  }

  const vencido = requisito.estado === "vencido"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Gestión: {requisito.nombre}
            <GestionBadge gestion={abierta} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Encabezado del requisito */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
            <span>
              Vence:{" "}
              <span
                className={`font-semibold ${vencido ? "text-red-600" : "text-slate-800"}`}
              >
                {formatFechaCorta(requisito.fecha_vencimiento)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {vencido
                ? `Vencido hace ${Math.abs(requisito.dias_para_vencer)} día${
                    Math.abs(requisito.dias_para_vencer) === 1 ? "" : "s"
                  }`
                : `Faltan ${requisito.dias_para_vencer} día${
                    requisito.dias_para_vencer === 1 ? "" : "s"
                  }`}
            </span>
            <span className="text-muted-foreground">
              Responsable:{" "}
              <span className="font-medium text-slate-700">
                {requisito.responsable_nombre ?? "sin asignar"}
              </span>
            </span>
          </div>

          {/* Datos del trámite en curso */}
          {abierta && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {abierta.fecha_turno && (
                    <span>
                      Turno:{" "}
                      <span className="font-semibold text-slate-800">
                        {formatFechaCorta(abierta.fecha_turno)}
                      </span>
                    </span>
                  )}
                  {abierta.organismo && (
                    <span>
                      Organismo:{" "}
                      <span className="font-medium text-slate-700">
                        {abierta.organismo}
                      </span>
                    </span>
                  )}
                  {abierta.nro_tramite && (
                    <span>
                      N° trámite:{" "}
                      <span className="font-medium text-slate-700">
                        {abierta.nro_tramite}
                      </span>
                    </span>
                  )}
                </div>
                {puedeGestionar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={handleCancelar}
                    disabled={pending}
                  >
                    Cancelar gestión
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Alta de movimiento */}
          {puedeGestionar ? (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Plus className="size-4" />
                Registrar movimiento
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="estado_g">Estado *</Label>
                  <Select
                    value={estado}
                    onValueChange={(v: string | null) =>
                      setEstado((v as EstadoGestionRequisito) ?? "solicitado")
                    }
                  >
                    <SelectTrigger id="estado_g">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_GESTION_OPCIONES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {
                      ESTADOS_GESTION_OPCIONES.find((o) => o.value === estado)
                        ?.ayuda
                    }
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fecha_turno_g">
                    Fecha del turno {estado === "turno_asignado" ? "*" : ""}
                  </Label>
                  <Input
                    id="fecha_turno_g"
                    name="fecha_turno"
                    type="date"
                    defaultValue={abierta?.fecha_turno ?? ""}
                    required={estado === "turno_asignado"}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="organismo_g">Organismo / lugar</Label>
                  <Input
                    id="organismo_g"
                    name="organismo"
                    placeholder="SENASA, Municipalidad, aseguradora…"
                    defaultValue={abierta?.organismo ?? ""}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nro_tramite_g">N° de trámite / expediente</Label>
                  <Input
                    id="nro_tramite_g"
                    name="nro_tramite"
                    defaultValue={abierta?.nro_tramite ?? ""}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comentario_g">Comentario</Label>
                <Textarea
                  id="comentario_g"
                  name="comentario"
                  rows={2}
                  placeholder="Ej. Se presentó la documentación, entregan en 15 días."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="archivo_g">Comprobante (opcional)</Label>
                <Input
                  id="archivo_g"
                  name="archivo"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
                <p className="text-xs text-muted-foreground">
                  Constancia del turno o del inicio del trámite. El documento
                  definitivo se carga con <strong>Renovar</strong>, que además
                  cierra esta gestión.
                </p>
              </div>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Guardar movimiento
                </Button>
              </div>
            </form>
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Solo el responsable del requisito o un editor pueden cargar
              movimientos de gestión.
            </p>
          )}

          {/* Bitácora */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Historial del trámite
            </p>
            {cargando && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Cargando…
              </p>
            )}
            {!cargando && gestiones.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no se registró ninguna gestión para este requisito.
              </p>
            )}

            {abierta && (
              <Timeline
                gestion={abierta}
                onAbrirComprobante={abrirComprobante}
              />
            )}

            {cerradas.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  className="text-xs font-medium text-blue-600 hover:underline"
                  onClick={() => setVerHistorial((v) => !v)}
                >
                  {verHistorial ? "Ocultar" : "Ver"} gestiones anteriores (
                  {cerradas.length})
                </button>
                {verHistorial && (
                  <div className="mt-2 space-y-3">
                    {cerradas.map((g) => (
                      <div key={g.id} className="rounded-lg border bg-slate-50 p-2">
                        <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {g.cierre_motivo === "renovado" ? (
                            <CheckCircle2 className="size-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="size-3.5 text-slate-400" />
                          )}
                          Trámite del vencimiento{" "}
                          {formatFechaCorta(g.vencimiento_objetivo)} ·{" "}
                          {g.cierre_motivo === "renovado"
                            ? "renovado"
                            : "cancelado"}
                        </p>
                        <Timeline
                          gestion={g}
                          onAbrirComprobante={abrirComprobante}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Timeline({
  gestion,
  onAbrirComprobante,
}: {
  gestion: RequisitoLegalGestion
  onAbrirComprobante: (url: string) => void
}) {
  if (gestion.eventos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin movimientos cargados.</p>
    )
  }
  return (
    <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
      {gestion.eventos.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-slate-400" />
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-medium text-slate-800">
              {ESTADO_GESTION_LABEL[ev.estado]}
            </span>
            {ev.fecha_turno && (
              <span className="text-slate-600">
                · turno {formatFechaCorta(ev.fecha_turno)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatFechaHora(ev.created_at)}
              {ev.created_by_nombre ? ` · ${ev.created_by_nombre}` : ""}
            </span>
          </div>
          {ev.comentario && (
            <p className="text-sm text-slate-600">{ev.comentario}</p>
          )}
          {ev.archivo_url && (
            <button
              type="button"
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              onClick={() => onAbrirComprobante(ev.archivo_url!)}
            >
              <Paperclip className="size-3" />
              {ev.archivo_nombre ?? "comprobante"}
              <FileDown className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}
