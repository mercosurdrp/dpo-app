"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Loader2, Paperclip, Plus, TrendingUp } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  agregarAvancePlanGop,
  getGopsMejorasDetalle,
  registrarCierreGop,
  urlArchivoGop,
  type GopMejoraDetalle,
  type GopMejoraPlan,
} from "@/actions/gops-planes"
import { ESTADO_LABEL, MES_NOMBRE, pct } from "./formato"

/** Qué celda del Resumen se abrió: un GOP en un mes, o el total de la región (temaId null). */
export interface CeldaMejoras {
  anio: number
  mes: number
  temaId: string | null
  titulo: string
}

interface Props {
  celda: CeldaMejoras | null
  onOpenChange: (open: boolean) => void
  responsables: Array<{ id: string; nombre: string }>
  canEdit: boolean
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  en_progreso: "bg-amber-100 text-amber-800",
  completado: "bg-emerald-100 text-emerald-700",
}

/**
 * Detrás de cada subida del porcentaje: qué punto pasó a Si y qué plan lo cerró, con
 * sus avances y evidencia. Si el punto se cerró sin plan en la app (todo lo de feb–ago
 * 2026), se puede registrar acá cómo se cerró.
 */
export function MejorasDialog({ celda, onOpenChange, responsables, canEdit }: Props) {
  const [items, setItems] = useState<GopMejoraDetalle[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, startCarga] = useTransition()

  function cargar(c: CeldaMejoras) {
    startCarga(async () => {
      const res = await getGopsMejorasDetalle(c.anio, c.mes, c.temaId)
      if ("error" in res) {
        setError(res.error)
        setItems([])
      } else {
        setError(null)
        setItems(res.data)
      }
    })
  }

  useEffect(() => {
    setItems(null)
    setError(null)
    if (celda) cargar(celda)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celda?.anio, celda?.mes, celda?.temaId])

  const conPlan = (items ?? []).filter((i) => i.plan).length

  return (
    <Dialog open={celda !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            {celda?.titulo} · {celda ? MES_NOMBRE[celda.mes] : ""} {celda?.anio}
          </DialogTitle>
          {items && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "punto pasó" : "puntos pasaron"} a Si ·{" "}
              {conPlan} con plan registrado
            </p>
          )}
        </DialogHeader>

        {cargando && items === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : error ? (
          <p className="text-sm font-medium text-red-600">{error}</p>
        ) : (items ?? []).length === 0 ? (
          <p className="py-4 text-sm text-slate-600">
            Ningún punto pasó a Si este mes. La subida viene de un cambio en las N/A (salen
            del denominador) o de la comparación con un mes bimestral.
          </p>
        ) : (
          <ul className="space-y-3">
            {(items ?? []).map((m) => (
              <MejoraItem
                key={m.pregunta_id}
                mejora={m}
                mesLabel={celda ? `${MES_NOMBRE[celda.mes]} ${celda.anio}` : ""}
                mostrarTema={celda?.temaId === null}
                responsables={responsables}
                canEdit={canEdit}
                onCambio={() => celda && cargar(celda)}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MejoraItem({
  mejora,
  mesLabel,
  mostrarTema,
  responsables,
  canEdit,
  onCambio,
}: {
  mejora: GopMejoraDetalle
  mesLabel: string
  mostrarTema: boolean
  responsables: Array<{ id: string; nombre: string }>
  canEdit: boolean
  onCambio: () => void
}) {
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {mostrarTema && (
          <span className="font-semibold text-slate-700">{mejora.tema_nombre}</span>
        )}
        {mejora.seccion && <span className="text-muted-foreground">· {mejora.seccion}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            {mejora.valor_previo === "na" ? "N/A" : "No"}
          </span>
          <ArrowRight className="h-3 w-3" />
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            Si
          </span>
          {mejora.impacto !== null && (
            <span className="font-semibold tabular-nums text-emerald-600">
              +{pct(mejora.impacto)} del GOP
            </span>
          )}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-900">{mejora.texto}</p>

      <div className="mt-2 border-t border-slate-100 pt-2">
        {mejora.plan ? (
          <PlanBloque plan={mejora.plan} canEdit={canEdit} onCambio={onCambio} />
        ) : canEdit ? (
          <RegistrarCierre
            mejora={mejora}
            mesLabel={mesLabel}
            responsables={responsables}
            onCambio={onCambio}
          />
        ) : (
          <p className="text-sm text-amber-700">
            Sin plan registrado: se cerró sin pasar por la app.
          </p>
        )}
      </div>
    </li>
  )
}

function PlanBloque({
  plan,
  canEdit,
  onCambio,
}: {
  plan: GopMejoraPlan
  canEdit: boolean
  onCambio: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function abrirArchivo(path: string) {
    const res = await urlArchivoGop(path)
    if ("data" in res) window.open(res.data.url, "_blank")
  }

  function cerrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    form.set("nuevo_estado", "completado")
    setError(null)
    start(async () => {
      const res = await agregarAvancePlanGop(plan.id, form)
      if ("error" in res) {
        setError(res.error)
        return
      }
      onCambio()
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Plan de acción
        </span>
        <Badge className={`text-xs ${ESTADO_COLOR[plan.estado]}`}>
          {ESTADO_LABEL[plan.estado]}
        </Badge>
      </div>
      <p className="text-sm font-semibold text-slate-900">{plan.titulo}</p>
      {plan.descripcion && <p className="text-sm text-slate-600">{plan.descripcion}</p>}
      <p className="text-xs text-muted-foreground">
        {plan.responsable_nombre ? `Responsable: ${plan.responsable_nombre} · ` : ""}
        Creado el {new Date(plan.created_at).toLocaleDateString("es-AR")}
        {plan.fecha_objetivo ? ` · objetivo ${plan.fecha_objetivo}` : ""}
      </p>

      {plan.avances.length > 0 ? (
        <ul className="space-y-1.5">
          {plan.avances.map((a) => (
            <li key={a.id} className="rounded-md bg-slate-50 p-2">
              {a.comentario && <p className="text-sm text-slate-800">{a.comentario}</p>}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(a.created_at).toLocaleDateString("es-AR")}</span>
                {a.autor_nombre && <span>· {a.autor_nombre}</span>}
                {a.estado_resultante && <span>· pasó a {ESTADO_LABEL[a.estado_resultante]}</span>}
                {a.archivos.map((f) => (
                  <button
                    key={f.path}
                    type="button"
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
      ) : (
        <p className="text-xs text-muted-foreground">Sin avances cargados.</p>
      )}

      {plan.estado !== "completado" && canEdit && (
        <form onSubmit={cerrar} className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-2">
          <p className="text-xs font-medium text-amber-800">
            El punto ya está en Si: cargá la evidencia y cerrá el plan.
          </p>
          <Textarea name="comentario" rows={2} placeholder="Qué se hizo para cerrarlo" />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="archivo"
              multiple
              className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Cerrar plan
            </button>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </form>
      )}
    </div>
  )
}

function RegistrarCierre({
  mejora,
  mesLabel,
  responsables,
  onCambio,
}: {
  mejora: GopMejoraDetalle
  mesLabel: string
  responsables: Array<{ id: string; nombre: string }>
  onCambio: () => void
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    form.set("pregunta_id", mejora.pregunta_id)
    form.set("tema_id", mejora.tema_id)
    form.set("mes_label", mesLabel)
    setError(null)
    start(async () => {
      const res = await registrarCierreGop(form)
      if ("error" in res) {
        setError(res.error)
        return
      }
      onCambio()
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-amber-700">Sin plan registrado.</span>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar cómo se cerró
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={guardar} className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Queda como plan completado de este punto, con lo que se hizo como avance.
      </p>
      <div className="space-y-1">
        <Label htmlFor={`tit-${mejora.pregunta_id}`}>Título</Label>
        <Input
          id={`tit-${mejora.pregunta_id}`}
          name="titulo"
          defaultValue={mejora.texto.slice(0, 120)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`com-${mejora.pregunta_id}`}>Qué se hizo</Label>
        <Textarea
          id={`com-${mejora.pregunta_id}`}
          name="comentario"
          rows={3}
          required
          placeholder="La acción concreta que dio vuelta el punto (procedimiento, capacitación, compra…)"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`resp-${mejora.pregunta_id}`}>Responsable</Label>
          <select
            id={`resp-${mejora.pregunta_id}`}
            name="responsable_id"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="">—</option>
            {responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`fec-${mejora.pregunta_id}`}>Fecha en que se cerró</Label>
          <Input id={`fec-${mejora.pregunta_id}`} name="fecha_cierre" type="date" />
        </div>
      </div>
      <input
        type="file"
        name="archivo"
        multiple
        className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
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
  )
}
