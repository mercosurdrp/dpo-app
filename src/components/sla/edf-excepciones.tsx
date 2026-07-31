"use client"

/**
 * Panel de excepciones del SLA de equipos de frío.
 *
 * Lista los movimientos que salieron en camión FUERA de la ventana
 * lunes-miércoles y permite registrar la autorización conjunta del Jefe de
 * Logística y el Jefe de Ventas.
 *
 * 🚨 La excepción se carga DESPUÉS del hecho: no es un flujo de aprobación
 * previa. La idea es repasar esta lista en la reunión Ventas-Logística y dejar
 * constancia del motivo, no frenar la operación.
 */

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Snowflake, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  getMovimientosEdfFueraDeVentana,
  registrarExcepcionEdf,
  eliminarExcepcionEdf,
} from "@/actions/sla"
import {
  EDF_MOTIVOS_EXCEPCION,
  EDF_DIAS_PERMITIDOS_LABEL,
  SLA_EDF_MIDE_DESDE,
  type MovimientoEdfPendiente,
} from "@/lib/sla-cumplimiento"

const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

function fechaLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DIA_LARGO[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`
}

/** Primer día del mes actual y hoy, en hora Argentina. */
function rangoMesActual(): { desde: string; hasta: string } {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const y = arg.getUTCFullYear()
  const m = arg.getUTCMonth() + 1
  return {
    desde: `${y}-${String(m).padStart(2, "0")}-01`,
    hasta: arg.toISOString().slice(0, 10),
  }
}

export function EdfExcepciones({ puedeGestionar }: { puedeGestionar: boolean }) {
  const inicial = rangoMesActual()
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [movs, setMovs] = useState<MovimientoEdfPendiente[]>([])
  const [pending, start] = useTransition()

  // Diálogo de registro
  const [abierto, setAbierto] = useState<MovimientoEdfPendiente | null>(null)
  const [motivo, setMotivo] = useState<string>(EDF_MOTIVOS_EXCEPCION[0].valor)
  const [detalle, setDetalle] = useState("")
  const [jdl, setJdl] = useState("")
  const [jdv, setJdv] = useState("")
  const [guardando, startGuardar] = useTransition()

  function cargar(d = desde, h = hasta) {
    start(async () => {
      const r = await getMovimientosEdfFueraDeVentana(d, h)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setMovs(r.data)
    })
  }

  useEffect(() => {
    cargar(inicial.desde, inicial.hasta)
    // Sólo al montar: después se recarga a mano con el botón del rango.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Los movimientos previos a la vigencia están cargados como baseline: se
  // listan, pero no se piden justificar ni cuentan como pendientes.
  const esReferencia = (m: MovimientoEdfPendiente) =>
    m.fecha_entrega < SLA_EDF_MIDE_DESDE
  const pendientes = movs.filter((m) => !m.excepcion && !esReferencia(m))
  const justificados = movs.filter((m) => m.excepcion)
  const referencia = movs.filter(esReferencia)

  function abrirDialogo(m: MovimientoEdfPendiente) {
    setAbierto(m)
    setMotivo(m.excepcion?.motivo ?? EDF_MOTIVOS_EXCEPCION[0].valor)
    setDetalle(m.excepcion?.detalle ?? "")
    setJdl(m.excepcion?.autoriza_jdl ?? "")
    setJdv(m.excepcion?.autoriza_jdv ?? "")
  }

  function guardar() {
    if (!abierto) return
    startGuardar(async () => {
      const r = await registrarExcepcionEdf({
        movimientoId: abierto.id,
        motivo,
        detalle,
        autorizaJdl: jdl,
        autorizaJdv: jdv,
      })
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Excepción registrada")
      setAbierto(null)
      cargar()
    })
  }

  function borrar(m: MovimientoEdfPendiente) {
    startGuardar(async () => {
      const r = await eliminarExcepcionEdf(m.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Excepción eliminada")
      cargar()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p className="flex items-start gap-2">
          <Snowflake className="mt-0.5 size-4 shrink-0 text-sky-600" />
          <span>
            Los equipos de frío que salen en la carga de un camión se entregan o se
            levantan sólo <b>{EDF_DIAS_PERMITIDOS_LABEL}</b>. Acá se registran las
            excepciones autorizadas <b>en conjunto</b> por el Jefe de Logística y el
            Jefe de Ventas. Un movimiento con excepción cuenta como cumplido y se
            marca en amarillo. Los retiros en depósito y los documentos emitidos
            fuera de una carga no entran en esta lista.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Desde</label>
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-[10rem]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Hasta</label>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-[10rem]"
          />
        </div>
        <Button variant="outline" onClick={() => cargar()} disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Actualizar
        </Button>
        <div className="ml-auto flex gap-3 text-sm">
          <span className="rounded bg-red-100 px-2 py-1 font-semibold text-red-700">
            {pendientes.length} sin excepción
          </span>
          <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-700">
            {justificados.length} con excepción
          </span>
          {referencia.length > 0 && (
            <span
              className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-500"
              title="Movimientos previos a la vigencia del acuerdo: sirven de referencia, no se miden."
            >
              {referencia.length} de referencia
            </span>
          )}
        </div>
      </div>

      {movs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {pending
            ? "Cargando…"
            : "No hubo movimientos de equipos de frío fuera de la ventana en este rango."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-700">
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Movimiento</th>
                <th className="px-3 py-2 font-semibold">Camión</th>
                <th className="px-3 py-2 font-semibold">Equipo</th>
                <th className="px-3 py-2 font-semibold">Excepción</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {fechaLabel(m.fecha_entrega)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        m.tipo_doc === "COPOP"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {m.tipo_doc === "COPOP" ? "Entrega" : "Retiro"}
                    </span>
                    <span className="ml-2 text-slate-500">
                      cliente {m.id_cliente ?? "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                    {m.reparto ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {m.des_articulo ?? "—"}
                    {m.cantidad > 1 && (
                      <span className="text-slate-500"> ×{m.cantidad}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.excepcion ? (
                      <div className="text-slate-700">
                        <div className="font-medium text-amber-700">
                          {m.excepcion.motivoLabel}
                        </div>
                        {m.excepcion.detalle && (
                          <div className="text-xs text-slate-500">
                            {m.excepcion.detalle}
                          </div>
                        )}
                        <div className="text-xs text-slate-500">
                          Autorizan: {m.excepcion.autoriza_jdl} + {m.excepcion.autoriza_jdv}
                        </div>
                      </div>
                    ) : esReferencia(m) ? (
                      <span className="text-sm text-slate-400">
                        Referencia (previo al acuerdo)
                      </span>
                    ) : (
                      <span className="text-sm text-red-600">Sin excepción</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {puedeGestionar && !(esReferencia(m) && !m.excepcion) && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant={m.excepcion ? "outline" : "default"}
                          onClick={() => abrirDialogo(m)}
                        >
                          <ShieldCheck className="mr-1 size-3.5" />
                          {m.excepcion ? "Editar" : "Registrar"}
                        </Button>
                        {m.excepcion && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => borrar(m)}
                            disabled={guardando}
                          >
                            <Trash2 className="size-3.5 text-red-600" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={abierto !== null} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excepción autorizada</DialogTitle>
            <DialogDescription>
              {abierto && (
                <>
                  {abierto.tipo_doc === "COPOP" ? "Entrega" : "Retiro"} del{" "}
                  {fechaLabel(abierto.fecha_entrega)} · {abierto.reparto ?? "s/reparto"} ·{" "}
                  {abierto.des_articulo ?? "equipo"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Motivo
              </label>
              <Select value={motivo} onValueChange={(v) => setMotivo(v ?? motivo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDF_MOTIVOS_EXCEPCION.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Detalle {motivo === "otro" && <span className="text-red-600">*</span>}
              </label>
              <Textarea
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                rows={2}
                placeholder="Qué pasó, en una línea."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Autoriza (Jefe de Logística)
                </label>
                <Input value={jdl} onChange={(e) => setJdl(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Autoriza (Jefe de Ventas)
                </label>
                <Input value={jdv} onChange={(e) => setJdv(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              El acuerdo exige autorización conjunta: hacen falta los dos nombres.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
