"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { PackageX, Loader2, ClipboardList, CheckCircle2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getRoturasReunion,
  upsertRoturaPlan,
  marcarRoturaPlanCompletado,
} from "@/actions/roturas-calle"
import {
  ROTURA_MOTIVO_LABELS,
  type RoturaConPlan,
} from "@/types/roturas"
import type { UserRole } from "@/types/database"

function ultimoDiaHabilAnterior(fechaReunionIso: string): string {
  const [y, m, d] = fechaReunionIso.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() - 1)
  }
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, "0")
  const dd = String(dt.getDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function formatFechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}

export function SeccionRoturasCalle({
  fechaReunion,
  currentRole,
}: {
  fechaReunion: string
  currentRole?: UserRole
}) {
  const [roturas, setRoturas] = useState<RoturaConPlan[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const fechaObjetivo = useMemo(
    () => ultimoDiaHabilAnterior(fechaReunion),
    [fechaReunion],
  )
  const puedeEditar = currentRole === "admin" || currentRole === "supervisor"

  function recargar() {
    setCargando(true)
    startTransition(async () => {
      const res = await getRoturasReunion(fechaObjetivo)
      if ("error" in res) setErrorMsg(res.error)
      else {
        setRoturas(res.data)
        setErrorMsg(null)
      }
      setCargando(false)
    })
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaObjetivo])

  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-orange-900">
            <PackageX className="size-5 text-orange-600" />
            Roturas en la calle
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Reportadas el {formatFechaCorta(fechaObjetivo)} ·{" "}
            {roturas.length} {roturas.length === 1 ? "rotura" : "roturas"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorMsg && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Error cargando roturas: {errorMsg}
          </p>
        )}
        {cargando ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando roturas…
          </div>
        ) : roturas.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-muted-foreground">
            Sin roturas reportadas el último día hábil.
          </p>
        ) : (
          <ul className="space-y-3">
            {roturas.map((r) => (
              <RoturaItem
                key={r.id}
                rotura={r}
                puedeEditar={puedeEditar}
                onChanged={recargar}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RoturaItem({
  rotura,
  puedeEditar,
  onChanged,
}: {
  rotura: RoturaConPlan
  puedeEditar: boolean
  onChanged: () => void
}) {
  const plan = rotura.plan
  const completado = !!plan?.fecha_completado
  const [saving, startSaving] = useTransition()

  const [descripcion, setDescripcion] = useState(plan?.descripcion ?? "")
  const [responsable, setResponsable] = useState(plan?.responsable ?? "")
  const [fechaPlan, setFechaPlan] = useState(plan?.fecha_planificada ?? "")

  function guardarPlan() {
    if (!descripcion.trim()) {
      toast.error("Escribí la acción a tomar")
      return
    }
    startSaving(async () => {
      const res = await upsertRoturaPlan(rotura.id, {
        descripcion,
        responsable: responsable || null,
        fecha_planificada: fechaPlan || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan de acción guardado")
      onChanged()
    })
  }

  function toggleCompletado() {
    startSaving(async () => {
      const res = await marcarRoturaPlanCompletado(rotura.id, !completado)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(!completado ? "Plan marcado como completado" : "Plan reabierto")
      onChanged()
    })
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">{rotura.patente}</Badge>
        <Badge variant="secondary">{ROTURA_MOTIVO_LABELS[rotura.motivo]}</Badge>
        {rotura.hora && (
          <span className="text-xs text-muted-foreground">{rotura.hora.slice(0, 5)}</span>
        )}
        {rotura.localidad && (
          <span className="text-xs text-muted-foreground">· {rotura.localidad}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          por {rotura.chofer_nombre ?? rotura.autor_nombre}
        </span>
      </div>

      <ul className="mt-2 space-y-0.5 text-sm">
        {rotura.items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{it.id_articulo}</span>
            <span className="flex-1 truncate">{it.des_articulo}</span>
            <span className="font-medium">{it.cantidad}</span>
          </li>
        ))}
      </ul>

      {rotura.observaciones && (
        <p className="mt-1 text-sm text-slate-600">{rotura.observaciones}</p>
      )}

      {rotura.adjuntos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {rotura.adjuntos.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block size-16 overflow-hidden rounded border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="Foto de la rotura" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {/* Plan de acción */}
      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <ClipboardList className="size-3.5" />
            Plan de acción
          </h4>
          {completado && (
            <Badge className="bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="mr-1 size-3" />
              Completado
            </Badge>
          )}
        </div>

        {puedeEditar ? (
          <div className="space-y-2">
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="¿Qué se va a hacer para que no se repita?"
              disabled={completado}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Responsable</Label>
                <Input
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  disabled={completado}
                />
              </div>
              <div>
                <Label className="text-xs">Fecha planificada</Label>
                <Input
                  type="date"
                  value={fechaPlan}
                  onChange={(e) => setFechaPlan(e.target.value)}
                  disabled={completado}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {!completado && (
                <Button size="sm" variant="outline" onClick={guardarPlan} disabled={saving}>
                  {saving ? "Guardando…" : plan ? "Actualizar plan" : "Crear plan"}
                </Button>
              )}
              {plan && (
                <Button
                  size="sm"
                  variant={completado ? "outline" : "default"}
                  onClick={toggleCompletado}
                  disabled={saving}
                >
                  {completado ? "Reabrir" : "Marcar completado"}
                </Button>
              )}
            </div>
          </div>
        ) : plan ? (
          <div className="space-y-1 text-sm">
            <p className="text-slate-700">{plan.descripcion}</p>
            <p className="text-xs text-muted-foreground">
              {plan.responsable ? `Responsable: ${plan.responsable}` : "Sin responsable"}
              {plan.fecha_planificada ? ` · para ${formatFechaCorta(plan.fecha_planificada)}` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin plan de acción todavía.</p>
        )}
      </div>
    </li>
  )
}
