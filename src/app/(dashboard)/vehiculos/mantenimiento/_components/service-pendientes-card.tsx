"use client"

// Service pendientes (vencidos y por vencer).
//
// Vivía en el Tablero operativo, arriba de la tabla de service general. Su lugar
// es Programación OT, junto al calendario del mes: es la lista de lo que hay que
// programar, y estando acá se programa en el acto en lugar de anotar el dominio
// y cambiar de solapa.
//
// Va con la misma cabecera oscura del calendario y de "Órdenes de trabajo
// abiertas", que son las otras dos piezas de esta pantalla. Los contadores de
// arriba filtran la lista (antes eran adorno) y cada unidad es una tira con el
// color de su estado a la izquierda, que es lo que se barre de un vistazo.

import { useState } from "react"
import { Gauge, CheckCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ServiceGeneralUnidad } from "@/lib/vehiculos/service-general"
import {
  ESTADO_SG,
  ORDEN_ESTADO,
  diasTexto,
  esAlertaService,
  fmtFecha,
  fmtNum,
} from "./service-estado"

export function ServicePendientesCard({
  programacion,
  puedeEditar,
  onProgramar,
}: {
  programacion: ServiceGeneralUnidad[]
  puedeEditar: boolean
  /** Abre el alta de OT con la unidad y la fecha del service ya cargadas. */
  onProgramar: (dominio: string, fecha: string) => void
}) {
  /** Los contadores de la cabecera filtran la lista. */
  const [filtro, setFiltro] = useState<"vencidos" | "por_vencer" | null>(null)

  const pendientes = programacion
    .filter((p) => esAlertaService(p.estado))
    .sort((a, b) => {
      const oe = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
      if (oe !== 0) return oe
      return (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity)
    })

  const vencidos = pendientes.filter((p) => p.estado === "vencido").length
  const porVencer = pendientes.length - vencidos
  const enPantalla =
    filtro == null
      ? pendientes
      : filtro === "vencidos"
        ? pendientes.filter((p) => p.estado === "vencido")
        : pendientes.filter((p) => p.estado !== "vencido")

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-sm">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
              <Gauge className="size-4" aria-hidden />
            </span>
            Service pendientes
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Contador
              color="bg-rose-400"
              n={vencidos}
              texto="vencidos"
              activo={filtro === "vencidos"}
              onClick={() => setFiltro((f) => (f === "vencidos" ? null : "vencidos"))}
            />
            <Contador
              color="bg-amber-400"
              n={porVencer}
              texto="por vencer"
              activo={filtro === "por_vencer"}
              onClick={() => setFiltro((f) => (f === "por_vencer" ? null : "por_vencer"))}
            />
          </div>
        </div>
      </div>

      {filtro && (
        <p className="border-b border-border/70 bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
          Mostrando {enPantalla.length} de {pendientes.length}.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setFiltro(null)}
          >
            Ver todos
          </button>
        </p>
      )}

      {enPantalla.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {pendientes.length === 0
              ? "No hay services vencidos ni próximos."
              : "Ninguna unidad en este filtro."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {enPantalla.map((p) => {
            const u = p.mide === "horas" ? "hs" : "km"
            const prox =
              p.proximaFecha == null
                ? "sin fecha de próximo service"
                : `próx. ${fmtFecha(p.proximaFecha)}${
                    p.motivo !== "tiempo" && p.proximoKm != null
                      ? ` · ${fmtNum(p.proximoKm)} ${u}`
                      : ""
                  }`
            // El service vencido se programa para hoy; el que todavía no venció,
            // para el día en que vence (en el diálogo se puede mover).
            const fecha =
              p.proximaFecha != null && p.proximaFecha.slice(0, 10) > hoy
                ? p.proximaFecha.slice(0, 10)
                : hoy
            const contenido = (
              <>
                <span
                  className={cn("h-8 w-1 shrink-0 rounded-full", ESTADO_SG[p.estado].dot)}
                  aria-hidden
                />
                <span className="w-20 shrink-0 font-medium tabular-nums">{p.dominio}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {prox}
                </span>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 whitespace-nowrap", ESTADO_SG[p.estado].badge)}
                >
                  {ESTADO_SG[p.estado].label}
                </Badge>
                <span
                  className={cn(
                    "w-20 shrink-0 text-right text-xs tabular-nums",
                    p.estado === "vencido" || p.estado === "rojo"
                      ? "font-semibold text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {diasTexto(p.diasRestantes)}
                </span>
              </>
            )
            return puedeEditar ? (
              <button
                key={p.dominio}
                type="button"
                onClick={() => onProgramar(p.dominio, fecha)}
                title={`Programar la OT de ${p.dominio}`}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                {contenido}
              </button>
            ) : (
              <div key={p.dominio} className="flex w-full items-center gap-3 px-4 py-2.5">
                {contenido}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function Contador({
  color,
  n,
  texto,
  activo,
  onClick,
}: {
  color: string
  n: number
  texto: string
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={activo ? "Quitar el filtro" : `Ver sólo los ${texto}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-white/80 transition-colors hover:bg-white/10",
        activo && "bg-white/15 text-white ring-1 ring-white/40"
      )}
    >
      <span className={cn("size-2 rounded-full", color)} aria-hidden />
      <span className="font-bold leading-none tabular-nums text-white">{n}</span>
      {texto}
    </button>
  )
}
