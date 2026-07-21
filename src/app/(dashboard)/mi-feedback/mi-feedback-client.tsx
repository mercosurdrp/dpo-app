"use client"

import { useState, useTransition } from "react"
import { MessageSquarePlus, Loader2, CheckCircle2, Clock, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NuevoFeedbackDialog } from "@/components/feedback/nuevo-feedback-dialog"
import {
  CATEGORIA_LABEL,
  CRITICIDAD_LABEL,
  ESTADO_LABEL,
  type FeedbackEmpleado,
} from "@/types/feedback-empleados"
import { cn } from "@/lib/utils"

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  })

function EstadoBadge({ estado }: { estado: FeedbackEmpleado["estado"] }) {
  const cfg = {
    nuevo: { className: "bg-slate-100 text-slate-700", Icon: Clock },
    tratado: { className: "bg-sky-100 text-sky-800", Icon: CheckCircle2 },
    con_accion: { className: "bg-amber-100 text-amber-800", Icon: Wrench },
    cerrado: { className: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  }[estado]
  const { Icon } = cfg
  return (
    <Badge variant="secondary" className={cn("gap-1", cfg.className)}>
      <Icon className="size-3" />
      {ESTADO_LABEL[estado]}
    </Badge>
  )
}

export function MiFeedbackClient({ feedback }: { feedback: FeedbackEmpleado[] }) {
  const [abierto, setAbierto] = useState(false)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contanos qué viste o qué se puede mejorar. Lo que mandes se trata en la
            matinal del día siguiente y después te avisamos qué se resolvió.
          </p>
        </div>
        <Button onClick={() => setAbierto(true)} className="gap-2">
          <MessageSquarePlus className="size-4" />
          Enviar feedback
        </Button>
      </div>

      {feedback.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessageSquarePlus className="size-10 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              Todavía no mandaste ningún feedback.
            </p>
            <Button variant="outline" onClick={() => setAbierto(true)}>
              Enviar el primero
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feedback.map((f) => (
            <Card key={f.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">#{f.numero}</span>
                  <Badge variant="outline">{CATEGORIA_LABEL[f.categoria]}</Badge>
                  {f.criticidad === "alta" && (
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      Criticidad {CRITICIDAD_LABEL[f.criticidad]}
                    </Badge>
                  )}
                  <EstadoBadge estado={f.estado} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmtFecha(f.fecha)}
                  </span>
                </div>

                <div>
                  <p className="font-semibold text-slate-900">{f.titulo}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {f.descripcion}
                  </p>
                </div>

                {(f.adjuntos ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(f.adjuntos ?? []).map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                        <img
                          src={a.url}
                          alt={a.nombre_original ?? "foto"}
                          className="size-20 rounded-md border object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}

                {f.respuesta && (
                  <div className="rounded-md border-l-4 border-l-emerald-500 bg-emerald-50/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      Respuesta
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {f.respuesta}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NuevoFeedbackDialog
        open={abierto}
        onOpenChange={setAbierto}
        onCreated={() => {
          toast.success("¡Gracias! Tu feedback se trata en la próxima matinal.")
          startTransition(() => window.location.reload())
        }}
      />
    </div>
  )
}
