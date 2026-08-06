"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ClipboardList, Loader2, Paperclip } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  agregarAvancePlanGop,
  listarAvancesPlanGop,
  urlArchivoGop,
  type GopPlan,
  type GopPlanAvance,
} from "@/actions/gops-planes"
import { ESTADO_LABEL } from "./formato"

interface Props {
  planes: GopPlan[]
  responsables: Array<{ id: string; nombre: string }>
  canEdit: boolean
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-emerald-100 text-emerald-700",
}

export function PlanesTab({ planes, canEdit }: Props) {
  const [filtro, setFiltro] = useState<"todos" | "corto" | "largo">("todos")

  const lista = useMemo(
    () => (filtro === "todos" ? planes : planes.filter((p) => p.horizonte === filtro)),
    [planes, filtro],
  )

  if (planes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ClipboardList className="h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-900">Todavía no hay planes</p>
          <p className="text-sm text-muted-foreground">
            Se crean desde la pestaña &ldquo;A decidir&rdquo;, sobre un punto concreto en No.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(
          [
            ["todos", "Todos"],
            ["corto", "Corto plazo"],
            ["largo", "Largo plazo"],
          ] as const
        ).map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filtro === valor
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {lista.map((plan) => (
        <PlanCard key={plan.id} plan={plan} canEdit={canEdit} />
      ))}
    </div>
  )
}

function PlanCard({ plan, canEdit }: { plan: GopPlan; canEdit: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [avances, setAvances] = useState<GopPlanAvance[] | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function alternar() {
    const nuevo = !abierto
    setAbierto(nuevo)
    if (nuevo && avances === null) {
      startTransition(async () => {
        const res = await listarAvancesPlanGop(plan.id)
        setAvances("data" in res ? res.data : [])
      })
    }
  }

  function guardarAvance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const el = e.currentTarget
    setError(null)
    startTransition(async () => {
      const res = await agregarAvancePlanGop(plan.id, form)
      if ("error" in res) {
        setError(res.error)
        return
      }
      el.reset()
      const recargado = await listarAvancesPlanGop(plan.id)
      setAvances("data" in recargado ? recargado.data : [])
      router.refresh()
    })
  }

  async function abrirArchivo(path: string) {
    const res = await urlArchivoGop(path)
    if ("data" in res) window.open(res.data.url, "_blank")
  }

  return (
    <Card>
      <CardContent className="py-4">
        <button onClick={alternar} className="w-full text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`text-xs ${ESTADO_COLOR[plan.estado]}`}>
              {ESTADO_LABEL[plan.estado]}
            </Badge>
            {plan.tema_nombre && (
              <Badge variant="secondary" className="text-xs">
                {plan.tema_nombre}
              </Badge>
            )}
            {plan.horizonte === "largo" && (
              <Badge variant="secondary" className="text-xs">
                Largo plazo
              </Badge>
            )}
            {plan.prioridad === "alta" && (
              <Badge className="bg-red-100 text-xs text-red-700">Alta</Badge>
            )}
          </div>

          <p className="mt-2 font-semibold text-slate-900">{plan.titulo}</p>
          {plan.descripcion && (
            <p className="text-sm text-muted-foreground">{plan.descripcion}</p>
          )}

          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            {plan.responsable_nombre && <span>Responsable: {plan.responsable_nombre}</span>}
            {plan.fecha_objetivo && <span>Objetivo: {plan.fecha_objetivo}</span>}
            <span>
              {plan.avances_count} {plan.avances_count === 1 ? "avance" : "avances"}
            </span>
            {plan.puntos.length > 0 && (
              <span>
                Cubre {plan.puntos.length}{" "}
                {plan.puntos.length === 1 ? "punto del GOP" : "puntos del GOP"}
              </span>
            )}
          </div>
        </button>

        {abierto && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
            {plan.puntos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Puntos que resuelve
                </p>
                <ul className="mt-1 space-y-1">
                  {plan.puntos.map((p) => (
                    <li key={p.pregunta_id} className="text-sm text-slate-700">
                      · {p.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Avances
              </p>
              {pending && avances === null ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </div>
              ) : (avances ?? []).length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">Todavía sin avances.</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {(avances ?? []).map((a) => (
                    <li key={a.id} className="rounded-lg bg-slate-50 p-2">
                      <p className="text-sm text-slate-900">{a.comentario}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(a.created_at).toLocaleDateString("es-AR")}</span>
                        {a.autor_nombre && <span>· {a.autor_nombre}</span>}
                        {a.estado_resultante && (
                          <span>· pasó a {ESTADO_LABEL[a.estado_resultante]}</span>
                        )}
                        {a.archivos.map((f) => (
                          <button
                            key={f.path}
                            onClick={() => abrirArchivo(f.path)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            {f.nombre}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canEdit && (
              <form onSubmit={guardarAvance} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={`avance-${plan.id}`}>Nuevo avance</Label>
                  <Textarea
                    id={`avance-${plan.id}`}
                    name="comentario"
                    rows={2}
                    placeholder="Qué se hizo, con qué evidencia"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    name="archivo"
                    multiple
                    className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
                  />
                  <select
                    name="nuevo_estado"
                    defaultValue=""
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                  >
                    <option value="">Mantener estado</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="en_progreso">En progreso</option>
                    <option value="completado">Completado</option>
                  </select>
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Registrar
                  </button>
                </div>
                {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
