"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ClipboardList, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { crearPlanTiempoRuta, type TiempoRutaPlan } from "@/actions/tiempo-ruta-planes"
import { tiempoRutaMesFueraDeMeta } from "@/lib/tiempo-ruta/meta"
import type { TiempoRutaMensual } from "@/types/database"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MESES_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-slate-100 text-slate-500",
}

function hhmm(min: number): string {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`
}

/**
 * DPO Entrega 1.2 · R1.2.5: si el tiempo en ruta no cumple la meta, tiene que
 * haber un plan de acción. Lista los meses fuera de meta, marca cuáles ya tienen
 * plan y deja crearlo desde acá.
 */
export function PlanesTiempoRuta({
  mensual,
  metaMinutos,
  planes,
}: {
  mensual: TiempoRutaMensual[]
  metaMinutos: number
  planes: TiempoRutaPlan[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [abierto, setAbierto] = useState<TiempoRutaMensual | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fechaLimite, setFechaLimite] = useState("")
  const [saving, setSaving] = useState(false)

  const planesPorMes = new Map<string, TiempoRutaPlan[]>()
  for (const p of planes) {
    if (p.year == null || p.month == null) continue
    const k = `${p.year}-${p.month}`
    planesPorMes.set(k, [...(planesPorMes.get(k) ?? []), p])
  }

  const fuera = mensual
    .filter((m) => tiempoRutaMesFueraDeMeta(m.promedio_minutos))
    .slice()
    .sort((a, b) => b.year - a.year || b.mes - a.mes)

  const abrir = (m: TiempoRutaMensual) => {
    setAbierto(m)
    setDescripcion(
      `Bajar el tiempo en ruta de ${MESES_FULL[m.mes - 1]} ${m.year}: promedio ${hhmm(m.promedio_minutos)} ` +
        `contra la meta de ${hhmm(metaMinutos)} (${m.pct_dentro_meta} % de los retornos dentro de meta). Causa raíz: `,
    )
    setResponsable("Supervisor de Distribución")
    setFechaLimite("")
  }

  const guardar = () => {
    if (!abierto) return
    setSaving(true)
    startTransition(async () => {
      const res = await crearPlanTiempoRuta({
        year: abierto.year,
        month: abierto.mes,
        descripcion,
        responsable,
        fecha_limite: fechaLimite || undefined,
        prioridad: "alta",
      })
      setSaving(false)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Plan creado para ${MESES_FULL[abierto.mes - 1]} ${abierto.year}`)
      setAbierto(null)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-1 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-700">Planes de acción · Tiempo en ruta</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          DPO Entrega 1.2 (R1.2.5): cada mes con promedio por encima de {hhmm(metaMinutos)} necesita su plan.
        </p>

        {fuera.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {fuera.map((m) => {
              const tiene = planesPorMes.has(`${m.year}-${m.mes}`)
              return (
                <button
                  key={`${m.year}-${m.mes}`}
                  type="button"
                  onClick={() => abrir(m)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                    tiene
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {!tiene && <AlertTriangle className="h-3 w-3" />}
                  {MESES[m.mes - 1]} {m.year} · {hhmm(m.promedio_minutos)} · {tiene ? "con plan" : "sin plan"}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="mb-4 text-sm text-emerald-700">Todos los meses están dentro de meta.</p>
        )}

        {planes.length > 0 ? (
          <div className="space-y-2">
            {planes.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  {p.month != null && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {MESES[p.month - 1]} {p.year}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      ESTADO_BADGE[p.estado] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.estado}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{p.descripcion}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {p.responsable ?? "—"}
                  {p.fecha_limite ? ` · vence ${p.fecha_limite}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Todavía no hay planes cargados.</p>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          El avance y el cierre de cada plan se cargan en el menú Planes (punto 1.2 de Entrega).
        </p>
      </CardContent>

      <Dialog open={abierto != null} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Plan de acción · {abierto ? `${MESES_FULL[abierto.mes - 1]} ${abierto.year}` : ""}
            </DialogTitle>
            <DialogDescription>
              {abierto && (
                <>
                  Promedio del mes: <strong>{hhmm(abierto.promedio_minutos)}</strong> · meta {hhmm(metaMinutos)} ·{" "}
                  {abierto.total_retornos} retornos
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="tr-desc">Descripción (incluí la causa raíz)</Label>
              <Textarea
                id="tr-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tr-resp">Responsable</Label>
                <Input id="tr-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="tr-fecha">Fecha límite</Label>
                <Input
                  id="tr-fecha"
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving || !descripcion.trim() || !responsable.trim()}>
              {saving ? "Guardando…" : "Crear plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
