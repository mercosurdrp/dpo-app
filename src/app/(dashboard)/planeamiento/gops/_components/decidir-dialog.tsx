"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { decidirPregunta, type DestinoDecision } from "@/actions/gops"
import { asociarPuntoAPlan, crearPlanGop, type GopPlan } from "@/actions/gops-planes"

export interface PuntoADecidir {
  preguntaId: string
  temaId: string
  temaNombre: string
  texto: string
  mesesEnNo: number
}

interface Props {
  punto: PuntoADecidir | null
  onOpenChange: (open: boolean) => void
  planes: GopPlan[]
  responsables: Array<{ id: string; nombre: string }>
  /** Destino con el que abre el diálogo (los botones de la fila entran directo al que eligió). */
  destinoInicial?: DestinoDecision
}

/**
 * El triage de un "No". Las tres salidas conviven en un mismo diálogo porque la decisión
 * real es una sola pregunta — "¿esto lo trabajo, lo difiero o no corresponde?" — y
 * separarlas en tres pantallas haría que diferir sea más cómodo que planificar.
 */
export function DecidirDialog({
  punto,
  onOpenChange,
  planes,
  responsables,
  destinoInicial = "plan",
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [destino, setDestino] = useState<DestinoDecision>(destinoInicial)
  const [planExistente, setPlanExistente] = useState("")

  const abierto = punto !== null
  const [prevPunto, setPrevPunto] = useState(punto?.preguntaId ?? null)
  if ((punto?.preguntaId ?? null) !== prevPunto) {
    setPrevPunto(punto?.preguntaId ?? null)
    setError(null)
    setDestino(destinoInicial)
    setPlanExistente("")
  }

  const planesDelTema = planes.filter((p) => p.tema_id === punto?.temaId)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!punto) return
    const form = new FormData(e.currentTarget)
    setError(null)

    startTransition(async () => {
      let res: { data: unknown } | { error: string }

      if (destino === "plan" && planExistente) {
        res = await asociarPuntoAPlan(punto.preguntaId, planExistente)
      } else if (destino === "plan") {
        form.set("tema_id", punto.temaId)
        form.set("pregunta_id", punto.preguntaId)
        if (!String(form.get("titulo") ?? "").trim()) {
          form.set("titulo", punto.texto.slice(0, 120))
        }
        res = await crearPlanGop(form)
      } else {
        res = await decidirPregunta({
          preguntaId: punto.preguntaId,
          destino,
          motivo: String(form.get("motivo") ?? ""),
          fechaRevision: String(form.get("fecha_revision") ?? "") || null,
        })
      }

      if ("error" in res) {
        setError(res.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Qué hacemos con este punto?</DialogTitle>
        </DialogHeader>

        {punto && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {punto.temaNombre}
              </p>
              <p className="text-sm text-slate-900">{punto.texto}</p>
              {punto.mesesEnNo > 1 && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  {punto.mesesEnNo} meses seguidos en No
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["plan", "Plan de acción"],
                  ["largo_plazo", "Largo plazo"],
                  ["no_aplica", "No aplica"],
                ] as Array<[DestinoDecision, string]>
              ).map(([valor, label]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setDestino(valor)}
                  className={`h-10 rounded-lg border px-2 text-sm font-medium transition-colors ${
                    destino === valor
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {destino === "plan" && (
              <div className="space-y-3">
                {planesDelTema.length > 0 && (
                  <div className="space-y-1">
                    <Label>Sumar a un plan que ya existe</Label>
                    <select
                      value={planExistente}
                      onChange={(e) => setPlanExistente(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">Crear un plan nuevo</option>
                      {planesDelTema.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!planExistente && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="titulo">Título del plan</Label>
                      <Input
                        id="titulo"
                        name="titulo"
                        defaultValue={punto.texto.slice(0, 120)}
                        maxLength={200}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="descripcion">Qué se va a hacer</Label>
                      <Textarea id="descripcion" name="descripcion" rows={3} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="horizonte">Horizonte</Label>
                        <select
                          id="horizonte"
                          name="horizonte"
                          defaultValue="corto"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="corto">Corto plazo</option>
                          <option value="largo">Largo plazo (inversión / terceros)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="prioridad">Prioridad</Label>
                        <select
                          id="prioridad"
                          name="prioridad"
                          defaultValue="media"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="alta">Alta</option>
                          <option value="media">Media</option>
                          <option value="baja">Baja</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="responsable_id">Responsable</Label>
                        <select
                          id="responsable_id"
                          name="responsable_id"
                          defaultValue=""
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="">Sin asignar</option>
                          {responsables.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="fecha_objetivo">Fecha objetivo</Label>
                        <Input id="fecha_objetivo" name="fecha_objetivo" type="date" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {destino !== "plan" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="motivo">
                    {destino === "largo_plazo"
                      ? "Por qué se difiere"
                      : "Por qué no aplica al sitio"}
                  </Label>
                  <Textarea id="motivo" name="motivo" rows={3} required />
                  <p className="text-xs text-muted-foreground">
                    {destino === "largo_plazo"
                      ? "Queda registrado como pendiente estructural, fuera de la lista de trabajo del mes."
                      : "Esta nota es la que el auditor busca al lado de la respuesta (R4.5.3)."}
                  </p>
                </div>
                {destino === "largo_plazo" && (
                  <div className="space-y-1">
                    <Label htmlFor="fecha_revision">Volver a revisarlo el</Label>
                    <Input id="fecha_revision" name="fecha_revision" type="date" />
                    <p className="text-xs text-muted-foreground">
                      Llegada esa fecha el punto vuelve solo a la lista de pendientes.
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">{error}</p>
            )}

            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar decisión
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
