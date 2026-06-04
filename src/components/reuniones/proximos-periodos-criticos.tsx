"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarClock, AlertTriangle, ArrowRight } from "lucide-react"

type Periodo = {
  id: string; nombre: string; fecha_inicio: string; fecha_fin: string
  prioridad: "alta" | "media" | "baja"; foco: string | null
}

const PRIO: Record<string, string> = {
  alta: "bg-red-600 text-white", media: "bg-amber-500 text-white", baja: "bg-slate-400 text-white",
}
const fmt = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

function cuando(ini: string, fin: string, hoy: string): { txt: string; urgente: boolean } {
  if (hoy >= ini && hoy <= fin) return { txt: "En curso", urgente: true }
  const dias = Math.round((new Date(ini + "T00:00:00").getTime() - new Date(hoy + "T00:00:00").getTime()) / 86400000)
  if (dias <= 0) return { txt: "Inminente", urgente: true }
  if (dias <= 7) return { txt: `En ${dias} día${dias === 1 ? "" : "s"}`, urgente: true }
  if (dias <= 31) return { txt: `En ${dias} días`, urgente: false }
  const sem = Math.round(dias / 7)
  return { txt: `En ~${sem} sem`, urgente: false }
}

// Alerta de próximos períodos críticos (los de foco que aún no terminaron),
// para anticiparlos en la reunión logística-ventas. Solo Misiones.
export function ProximosPeriodosCriticos() {
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [hoy, setHoy] = useState("")
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    fetch("/api/planeamiento/periodos-criticos/proximos")
      .then((r) => r.json())
      .then((j) => { if (j.periodos) { setPeriodos(j.periodos); setHoy(j.hoy) } })
      .catch(() => {})
      .finally(() => setCargado(true))
  }, [])

  if (!cargado || periodos.length === 0) return null // si no hay próximos, no ocupa espacio

  return (
    <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Próximos períodos críticos a anticipar
          </span>
          <Link href="/planeamiento/periodos-criticos" className="text-xs font-normal text-violet-700 hover:underline flex items-center gap-1">
            Ver detalle <ArrowRight className="w-3 h-3" />
          </Link>
        </CardTitle>
        <p className="text-xs text-slate-500">Preparar la operación para los días/semanas de alta exigencia que se vienen.</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-amber-100">
          {periodos.map((p) => {
            const c = cuando(p.fecha_inicio, p.fecha_fin, hoy)
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-medium text-sm text-slate-900">{p.nombre}</span>
                <span className="text-xs text-slate-600">
                  {fmt(p.fecha_inicio)}{p.fecha_fin !== p.fecha_inicio ? ` → ${fmt(p.fecha_fin)}` : ""}
                </span>
                <Badge className={`${PRIO[p.prioridad] ?? "bg-slate-400 text-white"} text-[10px] capitalize`}>{p.prioridad}</Badge>
                <span className={`ml-auto text-xs font-semibold ${c.urgente ? "text-red-700" : "text-slate-500"}`}>{c.txt}</span>
                {p.foco && <p className="basis-full text-[11px] text-slate-500 pl-6">{p.foco}</p>}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
