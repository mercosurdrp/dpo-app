"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ExternalLink, ListTodo, Loader2, MessageSquareText, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  cargarSeguimientoDesvioPlan,
  type SeguimientoDesvioPlan,
} from "@/actions/desvio-plan-seguimiento"
import type { EstadoReunionActividad } from "@/types/database"

export type TipoCarga = "observacion" | "plan"

/** Lo que se precarga al abrir el formulario (ej. desde una ruta con desvío). */
export interface PrecargaSeguimiento {
  tipo: TipoCarga
  fecha?: string
  texto?: string
}

const ESTADO_LABEL: Record<EstadoReunionActividad, string> = {
  no_comenzada: "No comenzada",
  en_curso: "En curso",
  cerrada: "Cerrada",
}
const ESTADO_CLASE: Record<EstadoReunionActividad, string> = {
  no_comenzada: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  en_curso: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  cerrada: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
}

function hoyAR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Observaciones y planes de acción del Desvío s/ tiempo planificado. Se guardan
 * en la Matinal de Distribución del día elegido, atados al indicador del
 * tablero: se ven acá, en el historial del tablero y en el Action Log.
 */
export function SeguimientoDesvioPlanCard({
  seguimiento,
  precarga,
  onPrecargaUsada,
}: {
  seguimiento: SeguimientoDesvioPlan
  /** Si viene, abre el formulario con esos datos. */
  precarga: PrecargaSeguimiento | null
  onPrecargaUsada: () => void
}) {
  const { historial, responsables, puedeEditar } = seguimiento
  const [tab, setTab] = useState<string>("planes")
  const [form, setForm] = useState<PrecargaSeguimiento | null>(null)

  const abierto = form ?? precarga
  const abrir = (p: PrecargaSeguimiento) => {
    setForm(p)
    onPrecargaUsada()
  }
  const cerrar = () => {
    setForm(null)
    onPrecargaUsada()
  }

  const abiertos = historial.actividades.filter((a) => a.estado !== "cerrada").length

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Observaciones y planes de acción</CardTitle>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => abrir({ tipo: "observacion" })}>
              <MessageSquareText className="mr-1 h-4 w-4" /> Nueva observación
            </Button>
            <Button size="sm" onClick={() => abrir({ tipo: "plan" })}>
              <Plus className="mr-1 h-4 w-4" /> Nuevo plan de acción
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="planes">
              <ListTodo className="mr-1 h-3.5 w-3.5" /> Planes de acción ({historial.actividades.length}
              {abiertos > 0 ? ` · ${abiertos} abiertos` : ""})
            </TabsTrigger>
            <TabsTrigger value="observaciones">
              <MessageSquareText className="mr-1 h-3.5 w-3.5" /> Observaciones (
              {historial.observaciones.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planes" className="mt-3 space-y-2">
            {historial.actividades.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay planes de acción para este indicador.
              </p>
            )}
            {historial.actividades.map((a) => (
              <div key={a.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{a.descripcion}</p>
                  <Badge className={ESTADO_CLASE[a.estado]}>{ESTADO_LABEL[a.estado]}</Badge>
                </div>
                {a.motivo && <p className="mt-1 text-muted-foreground">Causa: {a.motivo}</p>}
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>Responsable: {a.responsable_nombre ?? "—"}</span>
                  <span>Compromiso: {fmtFecha(a.fecha_compromiso)}</span>
                  <Link
                    href={`/reuniones/${a.reunion_origen_id}`}
                    className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                  >
                    Matinal {fmtFecha(a.reunion_origen_fecha)} <ExternalLink className="h-3 w-3" />
                  </Link>
                </p>
              </div>
            ))}
            {historial.actividades.length > 0 && (
              <p className="text-xs text-muted-foreground">
                El avance, la evidencia y el cierre de cada plan se cargan en el Action Log de la matinal.
              </p>
            )}
          </TabsContent>

          <TabsContent value="observaciones" className="mt-3 space-y-2">
            {historial.observaciones.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay observaciones para este indicador.
              </p>
            )}
            {historial.observaciones.map((o) => (
              <div key={o.id} className="rounded-md border p-3 text-sm">
                <p className="whitespace-pre-wrap text-slate-900">{o.texto}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>{o.autor_nombre ?? "—"}</span>
                  <Link
                    href={`/reuniones/${o.reunion_id}`}
                    className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                  >
                    Matinal {fmtFecha(o.reunion_fecha)} <ExternalLink className="h-3 w-3" />
                  </Link>
                </p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>

      {abierto && (
        <CargaDialog
          key={`${abierto.tipo}-${abierto.fecha ?? ""}-${abierto.texto ?? ""}`}
          inicial={abierto}
          responsables={responsables}
          onClose={cerrar}
          onSaved={(tipo) => {
            setTab(tipo === "plan" ? "planes" : "observaciones")
            cerrar()
          }}
        />
      )}
    </Card>
  )
}

function CargaDialog({
  inicial,
  responsables,
  onClose,
  onSaved,
}: {
  inicial: PrecargaSeguimiento
  responsables: { id: string; nombre: string }[]
  onClose: () => void
  onSaved: (tipo: TipoCarga) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tipo, setTipo] = useState<TipoCarga>(inicial.tipo)
  const [fecha, setFecha] = useState(inicial.fecha ?? hoyAR())
  const [texto, setTexto] = useState(inicial.texto ?? "")
  const [motivo, setMotivo] = useState("")
  const [responsableId, setResponsableId] = useState("")
  const [fechaCompromiso, setFechaCompromiso] = useState("")

  const esPlan = tipo === "plan"

  const guardar = () => {
    startTransition(async () => {
      const res = await cargarSeguimientoDesvioPlan({
        tipo,
        fecha,
        texto,
        motivo: esPlan ? motivo : undefined,
        responsableId: esPlan ? responsableId : undefined,
        fechaCompromiso: esPlan ? fechaCompromiso : undefined,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(esPlan ? "Plan de acción cargado" : "Observación cargada")
      onSaved(tipo)
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{esPlan ? "Nuevo plan de acción" : "Nueva observación"}</DialogTitle>
          <DialogDescription>
            Queda registrado en la Matinal de Distribución del día elegido, en el indicador «Desvío s/
            tiempo planificado».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={esPlan ? "outline" : "default"}
              onClick={() => setTipo("observacion")}
            >
              Observación
            </Button>
            <Button
              type="button"
              size="sm"
              variant={esPlan ? "default" : "outline"}
              onClick={() => setTipo("plan")}
            >
              Plan de acción
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="dp-fecha">Fecha (matinal)</Label>
            <Input id="dp-fecha" type="date" value={fecha} max={hoyAR()} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="dp-texto">{esPlan ? "Acción" : "Observación"}</Label>
            <Textarea
              id="dp-texto"
              rows={4}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={
                esPlan
                  ? "Ej.: Revisar con el ruteador los tiempos de atención de la zona Pergamino"
                  : "Ej.: Ruta 12 salió tarde por demora en carga; el desvío no es del chofer"
              }
            />
          </div>

          {esPlan && (
            <>
              <div className="space-y-1">
                <Label htmlFor="dp-motivo">Causa del desvío</Label>
                <Textarea
                  id="dp-motivo"
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Por qué la ruta tardó más que el plan"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Responsable</Label>
                  <Select value={responsableId || "none"} onValueChange={(v) => setResponsableId(!v || v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Elegí…</SelectItem>
                      {responsables.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dp-compromiso">Fecha compromiso</Label>
                  <Input
                    id="dp-compromiso"
                    type="date"
                    value={fechaCompromiso}
                    onChange={(e) => setFechaCompromiso(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
