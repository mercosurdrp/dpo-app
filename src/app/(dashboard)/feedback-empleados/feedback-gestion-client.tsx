"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { MessageSquare, CheckCircle2, Wrench, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { tratarFeedback } from "@/actions/feedback-empleados"
import {
  CATEGORIA_LABEL,
  ESTADO_LABEL,
  type FeedbackEmpleado,
  type FeedbackEstado,
} from "@/types/feedback-empleados"
import type { UserRole } from "@/types/database"
import { cn } from "@/lib/utils"

interface Resumen {
  total: number
  nuevos: number
  tratados: number
  con_accion: number
  cerrados: number
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })

export function FeedbackGestionClient({
  feedback,
  resumen,
  currentRole,
}: {
  feedback: FeedbackEmpleado[]
  resumen: Resumen
  currentRole: UserRole
}) {
  const [filtro, setFiltro] = useState<string>("todos")
  const [abierto, setAbierto] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState("")
  const [pending, startTransition] = useTransition()

  const visibles = useMemo(
    () => (filtro === "todos" ? feedback : feedback.filter((f) => f.estado === filtro)),
    [feedback, filtro]
  )

  // El KPI del punto 2.2 no es cuánto entra: es qué proporción se cierra.
  const pctCerrado =
    resumen.total > 0
      ? Math.round(((resumen.cerrados + resumen.con_accion) / resumen.total) * 100)
      : 0

  function cerrar(f: FeedbackEmpleado, estado: FeedbackEstado) {
    if (!respuesta.trim()) {
      toast.error("Escribí la respuesta para la persona.")
      return
    }
    startTransition(async () => {
      const res = await tratarFeedback(f.id, {
        respuesta,
        reunionId: f.reunion_id,
        estado: estado as "tratado" | "con_accion" | "cerrado",
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Feedback #${f.numero} actualizado.`)
      setAbierto(null)
      setRespuesta("")
      window.location.reload()
    })
  }

  const tiles = [
    { label: "Recibidos", valor: resumen.total, Icon: MessageSquare, color: "text-slate-700" },
    { label: "Sin tratar", valor: resumen.nuevos, Icon: Clock, color: "text-red-600" },
    { label: "Con acción", valor: resumen.con_accion, Icon: Wrench, color: "text-amber-600" },
    { label: "Cerrados", valor: resumen.cerrados, Icon: CheckCircle2, color: "text-emerald-600" },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Feedback de empleados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que carga la gente desde la app. Se trata en la matinal de distribución;
          acá queda el seguimiento y el cierre.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-muted-foreground">{t.label}</p>
                <p className={cn("text-3xl font-bold", t.color)}>{t.valor}</p>
              </div>
              <t.Icon className={cn("size-5", t.color)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Tratamiento del feedback recibido
          </p>
          <p className="text-3xl font-bold text-slate-900">{pctCerrado}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Es el número que mira la auditoría del punto 2.2: no alcanza con recibir
            feedback, hay que tratarlo y responderlo.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Select value={filtro} onValueChange={(v) => setFiltro(v ?? "todos")}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nuevo">Sin tratar</SelectItem>
            <SelectItem value="tratado">Tratados</SelectItem>
            <SelectItem value="con_accion">Con acción</SelectItem>
            <SelectItem value="cerrado">Cerrados</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{visibles.length} ítems</span>
      </div>

      <div className="space-y-3">
        {visibles.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No hay feedback con ese filtro.
            </CardContent>
          </Card>
        )}

        {visibles.map((f) => (
          <Card key={f.id}>
            <CardContent className="space-y-2 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">#{f.numero}</span>
                <Badge variant="outline">{CATEGORIA_LABEL[f.categoria]}</Badge>
                {f.criticidad === "alta" && (
                  <Badge variant="secondary" className="bg-red-100 text-red-700">
                    Alta
                  </Badge>
                )}
                <Badge variant="secondary">{ESTADO_LABEL[f.estado]}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {f.empleado_nombre ?? "—"}
                  {f.sector ? ` · ${f.sector}` : ""} · {fmt(f.fecha)}
                </span>
              </div>

              <p className="font-semibold text-slate-900">{f.titulo}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{f.descripcion}</p>

              {(f.adjuntos ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(f.adjuntos ?? []).map((a) => (
                    // eslint-disable-next-line @next/next/no-img-element
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
                <p className="rounded bg-emerald-50/60 p-2 text-sm text-slate-700">
                  <span className="font-semibold">Respuesta: </span>
                  {f.respuesta}
                </p>
              )}

              {f.estado !== "cerrado" && (
                <div>
                  {abierto !== f.id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAbierto(f.id)
                        setRespuesta(f.respuesta ?? "")
                      }}
                    >
                      Responder / cerrar
                    </Button>
                  ) : (
                    <div className="space-y-2 rounded-md border p-3">
                      <Textarea
                        rows={2}
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                        placeholder="Qué se le responde a la persona."
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={pending} onClick={() => cerrar(f, "cerrado")}>
                          Cerrar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => cerrar(f, "tratado")}
                        >
                          Guardar respuesta
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAbierto(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
