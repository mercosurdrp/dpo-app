"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { MessageSquare, Loader2, CheckCircle2, Wrench } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getFeedbackParaReunion,
  tratarFeedback,
  derivarFeedbackAActividad,
} from "@/actions/feedback-empleados"
import {
  CATEGORIA_LABEL,
  type FeedbackEmpleado,
} from "@/types/feedback-empleados"
import type { UserRole } from "@/types/database"
import { cn } from "@/lib/utils"

const PUEDE_GESTIONAR: UserRole[] = ["admin", "supervisor", "admin_rrhh"]

const CRITICIDAD_STYLE = {
  alta: "border-l-red-500 bg-red-50/50",
  media: "border-l-amber-400 bg-amber-50/30",
  baja: "border-l-slate-300",
} as const

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })

export function SeccionFeedbackEmpleados({
  reunionId,
  currentRole,
}: {
  reunionId: string
  currentRole: UserRole
}) {
  const [items, setItems] = useState<FeedbackEmpleado[]>([])
  const [cargando, setCargando] = useState(true)
  const [pending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState("")
  const [accion, setAccion] = useState("")
  const [fechaCompromiso, setFechaCompromiso] = useState("")

  const puedeGestionar = PUEDE_GESTIONAR.includes(currentRole)

  // El setState va después del await a propósito: llamarlo sincrónico dentro
  // del effect dispara renders en cascada (react-hooks/set-state-in-effect).
  async function cargar() {
    const res = await getFeedbackParaReunion(reunionId)
    setItems("data" in res ? res.data : [])
    setCargando(false)
  }

  useEffect(() => {
    // Carga inicial de datos remotos al montar / cambiar de reunión: el estado
    // se setea recién después del await, no en el cuerpo del effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunionId])

  function abrir(id: string) {
    setAbierto(abierto === id ? null : id)
    setRespuesta("")
    setAccion("")
    setFechaCompromiso("")
  }

  function marcarTratado(f: FeedbackEmpleado, estado: "tratado" | "cerrado") {
    if (!respuesta.trim()) {
      toast.error("Escribí qué se le responde a la persona.")
      return
    }
    startTransition(async () => {
      const res = await tratarFeedback(f.id, { respuesta, reunionId, estado })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Feedback #${f.numero} ${estado === "cerrado" ? "cerrado" : "tratado"}.`)
      setAbierto(null)
      await cargar()
    })
  }

  function derivar(f: FeedbackEmpleado) {
    if (!accion.trim()) {
      toast.error("Describí la acción a tomar.")
      return
    }
    startTransition(async () => {
      const res = await derivarFeedbackAActividad(f.id, {
        reunionId,
        descripcion: accion,
        fechaCompromiso: fechaCompromiso || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Acción creada en el action log.")
      setAbierto(null)
      await cargar()
    })
  }

  const pendientes = items.filter((f) => f.estado === "nuevo")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-slate-600" />
          Feedback de la gente
          {pendientes.length > 0 && (
            <Badge variant="secondary" className="bg-red-100 text-red-700">
              {pendientes.length} sin tratar
            </Badge>
          )}
        </CardTitle>
        {cargando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </CardHeader>

      <CardContent className="space-y-3">
        {!cargando && items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay feedback pendiente. Aparece acá apenas alguien lo carga desde la app.
          </p>
        )}

        {items.map((f) => (
          <div
            key={f.id}
            className={cn(
              "rounded-md border border-l-4 p-3",
              CRITICIDAD_STYLE[f.criticidad],
              f.estado !== "nuevo" && "opacity-70"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">#{f.numero}</span>
              <Badge variant="outline">{CATEGORIA_LABEL[f.categoria]}</Badge>
              <span className="text-sm font-semibold text-slate-900">{f.titulo}</span>
              {f.estado === "tratado" && (
                <Badge variant="secondary" className="gap-1 bg-sky-100 text-sky-800">
                  <CheckCircle2 className="size-3" /> Tratado
                </Badge>
              )}
              {f.estado === "con_accion" && (
                <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800">
                  <Wrench className="size-3" /> Con acción
                </Badge>
              )}
              {f.estado === "cerrado" && (
                <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="size-3" /> Cerrado
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {f.empleado_nombre ?? "—"}
                {f.sector ? ` · ${f.sector}` : ""} · {fmt(f.fecha)}
              </span>
            </div>

            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{f.descripcion}</p>

            {(f.adjuntos ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(f.adjuntos ?? []).map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    <img
                      src={a.url}
                      alt={a.nombre_original ?? "foto"}
                      className="size-16 rounded border object-cover"
                    />
                  </a>
                ))}
              </div>
            )}

            {f.respuesta && (
              <p className="mt-2 rounded bg-white/70 p-2 text-sm text-slate-700">
                <span className="font-semibold">Respuesta: </span>
                {f.respuesta}
              </p>
            )}

            {puedeGestionar && f.estado === "nuevo" && (
              <div className="mt-2">
                {abierto !== f.id ? (
                  <Button size="sm" variant="outline" onClick={() => abrir(f.id)}>
                    Tratar
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-md border bg-white p-3">
                    <div className="space-y-1.5">
                      <Label>Qué se le responde</Label>
                      <Textarea
                        rows={2}
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                        placeholder="Lo que se habló y qué se resolvió."
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => marcarTratado(f, "tratado")}
                        >
                          Tratado
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => marcarTratado(f, "cerrado")}
                        >
                          Tratado y cerrado
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t pt-3">
                      <Label>…o abrir una acción en el action log</Label>
                      <Input
                        value={accion}
                        onChange={(e) => setAccion(e.target.value)}
                        placeholder="Acción a tomar"
                      />
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Fecha compromiso</Label>
                          <Input
                            type="date"
                            value={fechaCompromiso}
                            onChange={(e) => setFechaCompromiso(e.target.value)}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => derivar(f)}
                        >
                          Crear acción
                        </Button>
                      </div>
                    </div>

                    <Button size="sm" variant="ghost" onClick={() => setAbierto(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
