"use client"

// Estándares de Flota (DPO 1.2): matriz de cumplimiento ítem × unidad.
// Migrada de la planilla "ESTANDAR DE LA FLOTA"; las columnas salen del
// catálogo de vehículos ACTIVOS, así la matriz queda viva cuando entran o
// salen unidades. Click en una celda (admin/supervisor) cicla OK → NO OK → N/A.

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  setEstandarEstado,
  type EstandarCumplimiento,
  type EstandarEstado,
  type EstandarItem,
  type EstandarUnidad,
} from "@/actions/flota-estandares"

const CICLO: Record<EstandarEstado, EstandarEstado> = {
  ok: "no_ok",
  no_ok: "na",
  na: "ok",
}

const CELDA: Record<EstandarEstado, { label: string; cls: string }> = {
  ok: { label: "✓", cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  no_ok: { label: "✗", cls: "bg-red-100 font-bold text-red-700 hover:bg-red-200" },
  na: { label: "—", cls: "bg-slate-50 text-slate-300 hover:bg-slate-100" },
}

interface Props {
  items: EstandarItem[]
  cumplimiento: EstandarCumplimiento[]
  unidades: EstandarUnidad[]
  pct: number | null
  puedeEditar: boolean
}

export function EstandaresFlota({ items, cumplimiento, unidades, pct, puedeEditar }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Overrides optimistas para que el click no espere el refresh del server.
  const [overrides, setOverrides] = useState<Map<string, EstandarEstado>>(new Map())

  const estadoBy = useMemo(() => {
    const m = new Map<string, EstandarCumplimiento>()
    for (const c of cumplimiento) m.set(`${c.dominio}|${c.item_id}`, c)
    return m
  }, [cumplimiento])

  const estadoDe = (dominio: string, itemId: string): EstandarEstado =>
    overrides.get(`${dominio}|${itemId}`) ??
    estadoBy.get(`${dominio}|${itemId}`)?.estado ??
    "na"

  const clickCelda = async (dominio: string, itemId: string) => {
    if (!puedeEditar) return
    const siguiente = CICLO[estadoDe(dominio, itemId)]
    setOverrides((prev) => new Map(prev).set(`${dominio}|${itemId}`, siguiente))
    const res = await setEstandarEstado({ dominio, itemId, estado: siguiente })
    if ("error" in res) {
      toast.error(res.error)
      setOverrides((prev) => {
        const m = new Map(prev)
        m.delete(`${dominio}|${itemId}`)
        return m
      })
      return
    }
    startTransition(() => router.refresh())
  }

  const matriz = (ambito: "camion" | "autoelevador") => {
    const itemsAmbito = items.filter((i) => i.ambito === ambito)
    const cols = unidades.filter((u) => u.tipo === ambito)
    if (cols.length === 0 || itemsAmbito.length === 0) {
      return <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>
    }

    // % por unidad (ok ÷ evaluables), con overrides aplicados.
    const pctUnidad = (dominio: string) => {
      let ok = 0
      let noOk = 0
      for (const it of itemsAmbito) {
        const e = estadoDe(dominio, it.id)
        if (e === "ok") ok++
        else if (e === "no_ok") noOk++
      }
      return ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-64 border-b bg-white p-2 text-left font-medium text-slate-500">
                Ítem del estándar
              </th>
              {cols.map((u) => {
                const p = pctUnidad(u.dominio)
                return (
                  <th key={u.dominio} className="border-b p-2 text-center align-bottom">
                    <span className="block text-xs font-semibold text-slate-700">
                      {u.dominio}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px] font-medium tabular-nums",
                        p == null
                          ? "text-slate-300"
                          : p >= 100
                            ? "text-emerald-600"
                            : p >= 90
                              ? "text-amber-600"
                              : "text-red-600"
                      )}
                    >
                      {p == null ? "—" : `${p.toFixed(0)}%`}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {itemsAmbito.map((it) => {
              const justificacion = [
                it.productividad && `Productividad: ${it.productividad}`,
                it.seguridad && `Seguridad: ${it.seguridad}`,
                it.calidad && `Calidad: ${it.calidad}`,
              ]
                .filter(Boolean)
                .join("\n")
              return (
                <tr key={it.id} className="border-b last:border-0">
                  <td
                    className="sticky left-0 z-10 bg-white p-2 text-slate-700"
                    title={justificacion || undefined}
                  >
                    {it.nombre}
                  </td>
                  {cols.map((u) => {
                    const e = estadoDe(u.dominio, it.id)
                    const obs = estadoBy.get(`${u.dominio}|${it.id}`)?.observaciones
                    return (
                      <td key={u.dominio} className="p-0.5 text-center">
                        <button
                          className={cn(
                            "h-7 w-full min-w-14 rounded transition-colors",
                            CELDA[e].cls,
                            !puedeEditar && "cursor-default"
                          )}
                          title={obs ?? undefined}
                          onClick={() => clickCelda(u.dominio, it.id)}
                        >
                          {CELDA[e].label}
                          {obs && <span className="ml-0.5 align-super text-[9px]">•</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-slate-500" /> Estándares de flota
          </CardTitle>
          <Badge
            className={cn(
              "text-sm",
              pct != null && pct >= 100
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            )}
          >
            Conformidad: {pct != null ? `${pct.toFixed(1)}%` : "—"}
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Matriz de cumplimiento del estándar (GTS) por unidad, sobre la flota activa
            del catálogo.{" "}
            {puedeEditar && (
              <>Click en una celda para ciclar ✓ OK → ✗ NO OK → — N/A. El punto (•) indica
              una observación (se ve al pasar el mouse).</>
            )}
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="camion">
        <TabsList>
          <TabsTrigger value="camion">Camiones</TabsTrigger>
          <TabsTrigger value="autoelevador">Autoelevadores</TabsTrigger>
        </TabsList>
        <TabsContent value="camion">
          <Card>
            <CardContent className="pt-4">{matriz("camion")}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="autoelevador">
          <Card>
            <CardContent className="pt-4">{matriz("autoelevador")}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
