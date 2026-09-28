"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CalendarPlus, CheckCircle2, ExternalLink, Link2, Unlink, UserPlus } from "lucide-react"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  crearCapacitacionDesdeGap,
  inscribirGapsEnCapacitacion,
  vincularCapacitacion,
  type PacHabilidadPlan,
  type PacPlanRol,
} from "@/actions/skap-pac"
import type { CapacitacionPac } from "@/lib/skap/pac"
import type { SkapRol } from "@/types/database"

const ESTADO_CAP: Record<string, string> = {
  programada: "programada",
  en_curso: "en curso",
  completada: "completada",
  cancelada: "cancelada",
}

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

const CHIP_PERSONA = {
  cumplida: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  inscripta: "bg-sky-50 text-sky-800 ring-sky-200",
  no_inscripta: "bg-white text-slate-700 ring-slate-200",
} as const

export function PlanPacTab({ rol, plan, canEdit }: { rol: SkapRol; plan: PacPlanRol | null; canEdit: boolean }) {
  const [creando, setCreando] = useState<PacHabilidadPlan | null>(null)

  if (!plan) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-red-500">No se pudo leer el PAC.</CardContent>
      </Card>
    )
  }
  if (plan.habilidades.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-500">
          No hay gaps en este rol: no hace falta plan de acción.
        </CardContent>
      </Card>
    )
  }

  const total = plan.habilidades.reduce((s, h) => s + h.personas.length, 0)
  const cumplidas = plan.habilidades.reduce((s, h) => s + h.personas.filter((p) => p.pac === "cumplida").length, 0)
  const inscriptas = plan.habilidades.reduce((s, h) => s + h.personas.filter((p) => p.pac === "inscripta").length, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <span>
          <b className="text-slate-900">{total}</b> gaps en {plan.habilidades.length} habilidades
        </span>
        <span>
          <b className="text-emerald-700">{cumplidas}</b> cumplidos en el PAC
        </span>
        <span>
          <b className="text-sky-700">{inscriptas}</b> inscriptos, por dictar
        </span>
        <span>
          <b className="text-slate-900">{total - cumplidas - inscriptas}</b> sin capacitación asignada
        </span>
        <span className="ml-auto text-xs text-slate-400">
          Cumplido = aprobó el examen, o estuvo presente en una capacitación ya completada.
        </span>
      </div>

      {plan.habilidades.map((h) => (
        <HabilidadCard
          key={h.habilidad_id}
          rol={rol}
          h={h}
          caps={plan.capacitaciones}
          canEdit={canEdit}
          puedeGestionarPac={plan.puedeGestionarPac}
          onCrear={() => setCreando(h)}
        />
      ))}

      {creando && <DialogCrear rol={rol} h={creando} onClose={() => setCreando(null)} />}
    </div>
  )
}

function HabilidadCard({
  rol,
  h,
  caps,
  canEdit,
  puedeGestionarPac,
  onCrear,
}: {
  rol: SkapRol
  h: PacHabilidadPlan
  caps: CapacitacionPac[]
  canEdit: boolean
  puedeGestionarPac: boolean
  onCrear: () => void
}) {
  const refrescar = useRefrescarConScroll()
  const [pending, startTransition] = useTransition()
  const [otra, setOtra] = useState("")
  const faltan = h.personas.filter((p) => p.pac !== "cumplida").length

  function vincular(capId: string, si: boolean) {
    startTransition(async () => {
      const res = await vincularCapacitacion(rol, h.habilidad_id, capId, si)
      if ("error" in res) { toast.error(res.error); return }
      toast.success(si ? "Capacitación vinculada" : "Vínculo quitado")
      setOtra("")
      refrescar()
    })
  }
  function inscribir(cap: CapacitacionPac) {
    startTransition(async () => {
      const res = await inscribirGapsEnCapacitacion(rol, h.habilidad_id, cap.id)
      if ("error" in res) { toast.error(res.error); return }
      toast.success(
        res.data.inscriptos === 0
          ? "Todos ya estaban cumplidos"
          : `${res.data.inscriptos} inscriptos en «${cap.titulo}» y acción programada para el ${fechaCorta(cap.fecha)}`,
      )
      refrescar()
    })
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Badge variant={h.criticidad === "A" ? "destructive" : "secondary"}>{h.criticidad}</Badge>
              <span className="font-semibold text-slate-800">{h.habilidad}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {h.bloque} · {h.personas.length} con gap · {h.personas.length - faltan} cumplido
              {h.personas.length - faltan === 1 ? "" : "s"} en el PAC
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {h.personas.map((p) => (
            <span
              key={p.empleado_id}
              title={p.pac === "cumplida" ? "Cumplió en el PAC" : p.pac === "inscripta" ? "Inscripto, falta dictar/aprobar" : "Sin capacitación"}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ring-1 ${CHIP_PERSONA[p.pac]}`}
            >
              {p.pac === "cumplida" && <CheckCircle2 className="size-3" />}
              {p.nombre}
              <span className="font-semibold tabular-nums">
                {p.nivel}/{p.estandar}
              </span>
            </span>
          ))}
        </div>

        {/* Capacitaciones del PAC ya vinculadas */}
        {h.vinculadas.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 px-2.5 py-1.5 text-sm">
            <Link2 className="size-4 text-emerald-700" />
            <Link href={`/capacitaciones/${c.id}`} className="font-medium text-slate-800 hover:underline">
              {c.titulo}
            </Link>
            <span className="text-xs text-slate-500">
              {fechaCorta(c.fecha)} · {ESTADO_CAP[c.estado] ?? c.estado} · {c.inscriptos}/{h.personas.length} inscriptos ·{" "}
              {c.cumplidos} cumplidos
            </span>
            <div className="ml-auto flex gap-1">
              {puedeGestionarPac && faltan > 0 && c.estado !== "cancelada" && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => inscribir(c)}>
                  <UserPlus className="mr-1 size-3.5" />
                  Inscribir a los {faltan} con gap
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => vincular(c.id, false)} title="Quitar vínculo">
                  <Unlink className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}

        {/* Sugerencias */}
        {h.sugeridas.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">
              {h.vinculadas.length ? "Otras del PAC que también lo tratan:" : "Sugeridas del PAC:"}
            </p>
            {h.sugeridas.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-sm">
                <span className="text-slate-700">{c.titulo}</span>
                <span className="text-xs text-slate-500">
                  {fechaCorta(c.fecha)} · {ESTADO_CAP[c.estado] ?? c.estado}
                </span>
                <Link href={`/capacitaciones/${c.id}`} className="text-slate-400 hover:text-slate-700" title="Ver en Capacitaciones">
                  <ExternalLink className="size-3.5" />
                </Link>
                {canEdit && (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={() => vincular(c.id, true)}>
                    <Link2 className="mr-1 size-3.5" />
                    Vincular
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={otra}
              onChange={(e) => setOtra(e.target.value)}
              className="h-8 max-w-md flex-1 rounded-md border bg-white px-2 text-sm"
            >
              <option value="">Vincular otra capacitación del PAC…</option>
              {caps
                .filter((c) => !h.vinculadas.some((v) => v.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {fechaCorta(c.fecha)} · {c.titulo.slice(0, 80)}
                  </option>
                ))}
            </select>
            <Button size="sm" variant="outline" disabled={!otra || pending} onClick={() => vincular(otra, true)}>
              Vincular
            </Button>
            {puedeGestionarPac && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onCrear}>
                <CalendarPlus className="mr-1 size-3.5" />
                Crear capacitación en el PAC
              </Button>
            )}
          </div>
        )}
        {!puedeGestionarPac && h.vinculadas.length > 0 && faltan > 0 && (
          <p className="text-xs text-slate-400">Inscribir en el PAC lo hace un admin o auditor de Capacitaciones.</p>
        )}
      </CardContent>
    </Card>
  )
}

function DialogCrear({ rol, h, onClose }: { rol: SkapRol; h: PacHabilidadPlan; onClose: () => void }) {
  const refrescar = useRefrescarConScroll()
  const [pending, startTransition] = useTransition()
  const [titulo, setTitulo] = useState(`SKAP · ${h.habilidad.charAt(0)}${h.habilidad.slice(1).toLowerCase()}`)
  const [fecha, setFecha] = useState("")
  const [instructor, setInstructor] = useState(h.plan?.instructor ?? "")
  const [horas, setHoras] = useState(String(h.plan?.horas ?? 1))

  function crear() {
    if (!fecha) { toast.error("Poné la fecha"); return }
    startTransition(async () => {
      const res = await crearCapacitacionDesdeGap({
        rol,
        habilidadId: h.habilidad_id,
        titulo,
        fecha,
        instructor,
        duracionHoras: Number(horas.replace(",", ".")),
      })
      if ("error" in res) { toast.error(res.error); return }
      toast.success(`Capacitación creada en el PAC con ${h.personas.length} inscriptos`)
      onClose()
      refrescar()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Crear capacitación en el PAC</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Se da de alta en Capacitaciones, queda vinculada a «{h.habilidad}» y se inscribe a las {h.personas.length}{" "}
            personas con el gap.
            {h.plan?.material && ` Material del plan de formación: ${h.plan.material}.`}
            {h.plan?.metodo && ` Método: ${h.plan.metodo}.`}
          </p>
          <div>
            <Label htmlFor="ct">Título</Label>
            <Input id="ct" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cf">Fecha</Label>
              <Input id="cf" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ch">Duración (horas)</Label>
              <Input id="ch" value={horas} onChange={(e) => setHoras(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ci">Instructor</Label>
            <Input id="ci" value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder="A definir" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={crear} disabled={pending || !titulo.trim()}>
              Crear e inscribir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
