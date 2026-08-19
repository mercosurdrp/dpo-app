"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { guardarHuellaMeta, guardarHuellaPlan } from "@/actions/huella"
import {
  ESTADO_PLAN_LABEL,
  FUENTE_PLAN_LABEL,
  type EstadoPlan,
  type FuentePlan,
  type HuellaAnual,
  type HuellaMeta,
  type HuellaPlan,
} from "@/lib/huella/definiciones"

const nf1 = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FUENTE_COLOR: Record<FuentePlan, string> = {
  camiones: "bg-emerald-50 text-emerald-700 border-emerald-200",
  autoelevadores: "bg-violet-50 text-violet-700 border-violet-200",
  electricidad: "bg-amber-50 text-amber-700 border-amber-200",
  acarreo: "bg-sky-50 text-sky-700 border-sky-200",
  general: "bg-slate-50 text-slate-700 border-slate-200",
}
const ESTADO_COLOR: Record<EstadoPlan, string> = {
  abierto: "bg-amber-50 text-amber-700 border-amber-200",
  en_curso: "bg-sky-50 text-sky-700 border-sky-200",
  cerrado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  descartado: "bg-slate-100 text-slate-500 border-slate-200",
}

export function MetaPlanes({
  huella,
  meta,
  planes,
  puedeEditar,
}: {
  huella: HuellaAnual
  meta: HuellaMeta | null
  planes: HuellaPlan[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const { totales, anio, meses } = huella

  const intensidadActual = totales.intensidadKgHl
  const [objetivo, setObjetivo] = useState<string>(meta?.intensidadObjetivo != null ? String(meta.intensidadObjetivo) : "")
  const [baseMeta, setBaseMeta] = useState<string>(meta?.base ?? "")

  // Cuánto hay que reducir por año para cumplir la meta, en t CO₂e:
  // (intensidad actual − objetivo) × HL proyectado del año (YTD anualizado).
  const hlAnualProyectado = meses.length > 0 ? (totales.hl / meses.length) * 12 : 0
  const obj = Number(objetivo)
  const reduccionNecesaria =
    intensidadActual != null && Number.isFinite(obj) && obj > 0 && obj < intensidadActual
      ? ((intensidadActual - obj) * hlAnualProyectado) / 1000
      : null
  const impactoPlanes = planes
    .filter((p) => p.estado === "abierto" || p.estado === "en_curso" || p.estado === "cerrado")
    .reduce((a, p) => a + (Number(p.impactoTCO2e) || 0), 0)

  const guardarMeta = () =>
    startTransition(async () => {
      const v = objetivo.trim() === "" ? null : Number(objetivo)
      const res = await guardarHuellaMeta(anio, { intensidadObjetivo: v, base: baseMeta.trim() || null })
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Meta guardada")
        router.refresh()
      }
    })

  return (
    <div className="space-y-4">
      {/* ===== Meta anual ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-emerald-600" /> Meta {anio}: intensidad objetivo (kg CO₂e por HL vendido)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Intensidad actual</p>
              <p className="text-2xl font-bold tabular-nums">{intensidadActual != null ? nf2(intensidadActual) : "—"}</p>
              <p className="text-xs text-muted-foreground">kg CO₂e/HL · acumulado {anio}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Meta</p>
              {puedeEditar ? (
                <Input type="number" step="0.01" className="mt-1 h-9 text-lg font-bold" value={objetivo}
                  placeholder={intensidadActual != null ? nf2(intensidadActual * 0.96) : ""}
                  onChange={(e) => setObjetivo(e.target.value)} />
              ) : (
                <p className="text-2xl font-bold tabular-nums">{meta?.intensidadObjetivo != null ? nf2(meta.intensidadObjetivo) : "sin fijar"}</p>
              )}
              <p className="text-xs text-muted-foreground">
                sugerido −4 %: {intensidadActual != null ? nf2(intensidadActual * 0.96) : "—"} (senda 2040 de la cadena)
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Reducción necesaria</p>
              <p className="text-2xl font-bold tabular-nums">{reduccionNecesaria != null ? `${nf1(reduccionNecesaria)} t` : "—"}</p>
              <p className="text-xs text-muted-foreground">CO₂e por año, sobre ~{Math.round(hlAnualProyectado).toLocaleString("es-AR")} HL proyectados</p>
            </div>
            <div className={`rounded-lg border p-3 ${reduccionNecesaria != null && impactoPlanes >= reduccionNecesaria ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="text-xs uppercase text-muted-foreground">Cubierto por planes</p>
              <p className="text-2xl font-bold tabular-nums">{nf1(impactoPlanes)} t</p>
              <p className="text-xs text-muted-foreground">
                {reduccionNecesaria != null
                  ? impactoPlanes >= reduccionNecesaria
                    ? "los planes alcanzan la meta ✓"
                    : `faltan planes por ${nf1(reduccionNecesaria - impactoPlanes)} t`
                  : "suma del impacto estimado de los planes"}
              </p>
            </div>
          </div>
          {puedeEditar && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 text-xs text-muted-foreground">
                De dónde sale la meta (para la auditoría)
                <Input className="mt-1 h-8" value={baseMeta} placeholder={`−4 % sobre la base ene–jul ${anio}`} onChange={(e) => setBaseMeta(e.target.value)} />
              </label>
              <Button size="sm" disabled={pendiente} onClick={guardarMeta}>Guardar meta</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Planes de acción ===== */}
      <PlanesLista anio={anio} planes={planes} puedeEditar={puedeEditar} />
    </div>
  )
}

function PlanesLista({ anio, planes, puedeEditar }: { anio: number; planes: HuellaPlan[]; puedeEditar: boolean }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [editando, setEditando] = useState<Partial<HuellaPlan> | null>(null)

  const guardar = () => {
    if (!editando) return
    startTransition(async () => {
      const res = await guardarHuellaPlan({
        id: editando.id,
        anio,
        fuente: (editando.fuente ?? "general") as FuentePlan,
        titulo: editando.titulo ?? "",
        descripcion: editando.descripcion ?? null,
        responsable: editando.responsable ?? null,
        fechaObjetivo: editando.fechaObjetivo ?? null,
        impactoTCO2e: editando.impactoTCO2e != null && String(editando.impactoTCO2e) !== "" ? Number(editando.impactoTCO2e) : null,
        estado: (editando.estado ?? "abierto") as EstadoPlan,
      })
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Plan guardado")
        setEditando(null)
        router.refresh()
      }
    })
  }

  const cambiarEstado = (plan: HuellaPlan, estado: EstadoPlan) =>
    startTransition(async () => {
      const res = await guardarHuellaPlan({ ...plan, estado })
      if ("error" in res) toast.error(res.error)
      else router.refresh()
    })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Planes de acción de reducción</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada plan lleva su impacto estimado en t CO₂e por año — así se ve si la meta cierra.
            Ejemplos con la huella actual: flota a GNC ≈ −23 t/año · una paleta más por viaje de
            acarreo ≈ −8 t/año · autoelevadores eléctricos ≈ −9 t/año (según la energía).
          </p>
        </div>
        {puedeEditar && !editando && (
          <Button size="sm" onClick={() => setEditando({ fuente: "general", estado: "abierto" })}>
            <Plus className="size-4" /> Nuevo plan
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {editando && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Título
                <Input className="mt-1 h-8 bg-white" value={editando.titulo ?? ""} placeholder="Ej.: convertir 3 camiones a GNC"
                  onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))} />
              </label>
              <label className="text-xs text-muted-foreground">
                Fuente sobre la que actúa
                <select className="mt-1 block h-8 w-full rounded-md border bg-white px-2 text-sm" value={editando.fuente ?? "general"}
                  onChange={(e) => setEditando((p) => ({ ...p, fuente: e.target.value as FuentePlan }))}>
                  {Object.entries(FUENTE_PLAN_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Responsable
                <Input className="mt-1 h-8 bg-white" value={editando.responsable ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p, responsable: e.target.value }))} />
              </label>
              <label className="text-xs text-muted-foreground">
                Fecha objetivo
                <Input type="date" className="mt-1 h-8 bg-white" value={editando.fechaObjetivo ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p, fechaObjetivo: e.target.value }))} />
              </label>
              <label className="text-xs text-muted-foreground">
                Impacto estimado (t CO₂e por año)
                <Input type="number" step="0.1" className="mt-1 h-8 bg-white" value={editando.impactoTCO2e ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p, impactoTCO2e: e.target.value as unknown as number }))} />
              </label>
              <label className="text-xs text-muted-foreground">
                Estado
                <select className="mt-1 block h-8 w-full rounded-md border bg-white px-2 text-sm" value={editando.estado ?? "abierto"}
                  onChange={(e) => setEditando((p) => ({ ...p, estado: e.target.value as EstadoPlan }))}>
                  {Object.entries(ESTADO_PLAN_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">
              Descripción / cómo se va a hacer
              <Textarea className="mt-1 bg-white" rows={2} value={editando.descripcion ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p, descripcion: e.target.value }))} />
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={pendiente} onClick={guardar}>Guardar plan</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        {planes.length === 0 && !editando && (
          <p className="text-sm text-muted-foreground">Todavía no hay planes cargados para {anio}.</p>
        )}
        {planes.map((p) => (
          <div key={p.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${FUENTE_COLOR[p.fuente]}`}>{FUENTE_PLAN_LABEL[p.fuente]}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${ESTADO_COLOR[p.estado]}`}>{ESTADO_PLAN_LABEL[p.estado]}</span>
                <span className="font-medium">{p.titulo}</span>
              </div>
              {p.descripcion && <p className="mt-1 text-sm text-muted-foreground">{p.descripcion}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {p.responsable ? `Responsable: ${p.responsable}` : "Sin responsable"}
                {p.fechaObjetivo ? ` · objetivo ${p.fechaObjetivo.split("-").reverse().join("/")}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tabular-nums">{p.impactoTCO2e != null ? `−${nf1(p.impactoTCO2e)} t` : "s/impacto"}</p>
              <p className="text-[11px] text-muted-foreground">CO₂e/año estimado</p>
              {puedeEditar && (
                <div className="mt-1 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditando(p)}>Editar</Button>
                  {p.estado !== "cerrado" && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pendiente} onClick={() => cambiarEstado(p, "cerrado")}>
                      Cerrar
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
