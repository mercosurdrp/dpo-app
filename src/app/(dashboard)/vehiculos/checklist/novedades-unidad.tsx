"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clock, Loader2, Wrench } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getNovedadesUnidad,
  type NovedadUnidad,
} from "@/actions/checklist-vehiculos"
import { formatDuracion } from "@/lib/vehiculos/tiempo-resolucion"

/**
 * Lo que el chofer ve arriba del checklist: qué pasó con los focos que reportó
 * en esta unidad. Cuando mantenimiento cierra el plan de acción, el ítem
 * aparece acá como RESUELTO, con qué se hizo y en cuánto tiempo se respondió.
 */
export function NovedadesUnidad({ dominio }: { dominio: string }) {
  const [novedades, setNovedades] = useState<NovedadUnidad[] | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!dominio) {
      setNovedades(null)
      return
    }
    let cancelado = false
    setCargando(true)
    void getNovedadesUnidad(dominio).then((res) => {
      if (cancelado) return
      setNovedades("data" in res ? res.data : [])
      setCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [dominio])

  if (!dominio) return null
  if (cargando) {
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Buscando novedades de {dominio}…
      </p>
    )
  }
  if (!novedades || novedades.length === 0) return null

  const resueltas = novedades.filter((n) => n.plan?.estado === "resuelto")
  const enGestion = novedades.filter((n) => n.plan && n.plan.estado !== "resuelto")

  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Wrench className="size-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800">
            Novedades de {dominio}
          </h2>
          <span className="text-xs text-slate-500">últimos 30 días</span>
        </div>

        {resueltas.length === 0 && enGestion.length === 0 && (
          <p className="text-sm text-slate-500">
            Lo que reportaste todavía no tiene plan de acción cargado.
          </p>
        )}

        {resueltas.map((n) => (
          <div
            key={n.respuestaId}
            className="rounded-lg border border-green-200 bg-green-50/70 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-green-600" />
              <span className="text-sm font-semibold text-slate-800">{n.item}</span>
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                RESUELTO
              </Badge>
              {n.plan?.horasResolucion != null && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-800">
                  <Clock className="size-3.5" />
                  respuesta en {formatDuracion(n.plan.horasResolucion)}
                </span>
              )}
            </div>
            <p className="ml-6 mt-1 text-sm text-slate-600">{n.plan?.descripcion}</p>
            <p className="ml-6 mt-0.5 text-xs text-slate-500">
              Reportado el {fmtFecha(n.fecha)}
              {n.chofer ? ` por ${n.chofer}` : ""}
            </p>
          </div>
        ))}

        {enGestion.map((n) => (
          <div
            key={n.respuestaId}
            className="rounded-lg border border-amber-200 bg-amber-50/70 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Clock className="size-4 shrink-0 text-amber-600" />
              <span className="text-sm font-semibold text-slate-800">{n.item}</span>
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                {n.plan?.estado === "en_proceso" ? "EN REPARACIÓN" : "PENDIENTE"}
              </Badge>
            </div>
            <p className="ml-6 mt-1 text-sm text-slate-600">{n.plan?.descripcion}</p>
            <p className="ml-6 mt-0.5 text-xs text-slate-500">
              Reportado el {fmtFecha(n.fecha)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}
