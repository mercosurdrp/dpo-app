"use client"

/**
 * Sección de Períodos Críticos de la reunión Ventas-Logística (R3.4.2).
 *
 * El manual DPO 2026 (3.4) pide que el plan de períodos críticos se revise
 * MENSUALMENTE en la reunión de ventas y logística. Esta sección aparece sólo
 * en la reunión del último martes del mes y deja tres cosas registradas:
 *
 *   1. Los períodos críticos vigentes del año (lectura, para tratarlos).
 *   2. Una foto como evidencia de que se revisaron.
 *   3. Un action log con los compromisos que surgieron.
 *
 * La foto y el action log reusan `SeccionGaleriaFotos`, el mismo componente que
 * ya usan RMD y NPS en esta reunión: para el equipo es un bloque más de los que
 * ya conoce, y no hay tablas nuevas.
 */

import { useEffect, useState } from "react"
import { CalendarRange } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SeccionGaleriaFotos } from "./seccion-galeria-fotos"
import type { ReunionActividadConResponsable } from "@/types/database"

/** Mismo shape que espera SeccionGaleriaFotos para el selector de responsable. */
interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/** Slug de `reuniones_actividades.seccion` y `reunion_seccion_fotos.seccion`. */
export const SECCION_PERIODOS_CRITICOS = "periodos_criticos"

type PeriodoFoco = {
  id: string
  anio: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  prioridad: string | null
  foco: string | null
}

function formatearRango(inicio: string, fin: string): string {
  const f = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
    })
  return inicio === fin ? f(inicio) : `${f(inicio)} al ${f(fin)}`
}

/** Días que faltan para que arranque el período (negativo = ya empezó). */
function diasHasta(inicio: string, hoy: string): number {
  const ms =
    new Date(inicio + "T12:00:00").getTime() -
    new Date(hoy + "T12:00:00").getTime()
  return Math.round(ms / 86_400_000)
}

export function SeccionPeriodosCriticos({
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [periodos, setPeriodos] = useState<PeriodoFoco[] | null>(null)
  const [hoy, setHoy] = useState<string>("")

  useEffect(() => {
    let vivo = true
    fetch("/api/planeamiento/periodos-criticos/proximos")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return
        setPeriodos(j.periodos ?? [])
        setHoy(j.hoy ?? "")
      })
      // Si falla, la galería y el action log se siguen usando: la revisión no
      // depende de poder listar los períodos.
      .catch(() => vivo && setPeriodos([]))
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="space-y-3">
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-amber-900">
            <CalendarRange className="size-5" />
            Períodos críticos — revisión mensual
          </CardTitle>
          <p className="text-xs text-amber-800">
            Revisión mensual del plan de períodos críticos (DPO 3.4). Repasar el
            estado de cada período, dejar la foto como registro y cargar los
            compromisos en el action log.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {periodos === null ? (
            <p className="text-sm text-muted-foreground">Cargando períodos…</p>
          ) : periodos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay períodos críticos vigentes cargados. Se definen en
              Planeamiento → Períodos críticos.
            </p>
          ) : (
            periodos.map((p) => {
              const dias = hoy ? diasHasta(p.fecha_inicio, hoy) : null
              const proximo = dias !== null && dias >= 0 && dias <= 30
              return (
                <div
                  key={p.id}
                  className="rounded-md border bg-white p-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {p.nombre}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {formatearRango(p.fecha_inicio, p.fecha_fin)}
                    </Badge>
                    {p.prioridad && (
                      <Badge className="bg-amber-600 text-[10px]">
                        Prioridad {p.prioridad}
                      </Badge>
                    )}
                    {proximo && (
                      <Badge className="bg-red-600 text-[10px]">
                        {dias === 0 ? "Es hoy" : `En ${dias} días`}
                      </Badge>
                    )}
                  </div>
                  {p.foco && (
                    <p className="mt-1 text-xs text-slate-600">{p.foco}</p>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <SeccionGaleriaFotos
        reunionId={reunionId}
        seccion={SECCION_PERIODOS_CRITICOS}
        titulo="Períodos críticos — evidencia y compromisos"
        icono={CalendarRange}
        tema="rose"
        emptyHint="Sin fotos cargadas. Subí la captura del calendario de períodos críticos para dejar registro de la revisión del mes."
        actividades={actividades}
        responsables={responsables}
        puedeEditar={puedeEditar}
        onActividadesChanged={onActividadesChanged}
        verMasHref="/planeamiento/periodos-criticos"
        verMasLabel="Ver calendario completo"
      />
    </div>
  )
}
