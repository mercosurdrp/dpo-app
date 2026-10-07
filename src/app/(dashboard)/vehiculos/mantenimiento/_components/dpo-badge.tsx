"use client"

import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { hrefEvidencia, puntoFlota, seccionFlota } from "@/lib/flota/dpo-puntos"
import { DocsDePunto } from "@/components/flota/documentos-dpo"

/**
 * Badge que declara, a la vista del auditor, qué punto del pilar Flota responde
 * la sección. Enlaza a la evidencia cargada de ese punto.
 */
export function DpoPuntoBadge({ numero, className }: { numero: string; className?: string }) {
  const punto = puntoFlota(numero)
  if (!punto) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={hrefEvidencia(numero)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5",
              "text-[11px] font-medium text-muted-foreground transition-colors",
              "hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
              punto.mandatorio && "border-amber-500/40 text-amber-700 dark:text-amber-400",
              className
            )}
          >
            <ShieldCheck className="size-3" aria-hidden />
            DPO {numero}
          </Link>
        }
      />
      <TooltipContent>
        <p className="font-medium">
          Flota {numero} — {punto.titulo}
        </p>
        <p className="text-xs opacity-80">
          {punto.bloque}
          {punto.mandatorio ? " · Mandatorio" : ""}
        </p>
        <p className="mt-1 text-xs opacity-70">Ver evidencia cargada</p>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Qué responde UN bloque concreto, con el requisito puntual.
 *
 * La cinta de sección dice qué punto responde la solapa entera; esto dice qué
 * responde la caja que el auditor tiene delante —el recuento, la política de
 * stock, el retiro de cubiertas—. Sin esto hay que explicarle de palabra por
 * qué cada cosa está en pantalla, que es justo lo que no conviene en una
 * auditoría: lo que se explica de palabra no es evidencia.
 */
export function DpoResponde({
  puntos,
  requisitos,
  className,
}: {
  /** Puntos del pilar Flota, ej. ["2.3"]. */
  puntos: string[]
  /** Requisitos puntuales, ej. ["R2.3.2"]. */
  requisitos?: string[]
  className?: string
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[11px] text-muted-foreground">Responde a</span>
      {puntos.map((n) => (
        <DpoPuntoBadge key={n} numero={n} />
      ))}
      {requisitos?.length ? (
        <span className="text-[11px] text-muted-foreground/70">
          {requisitos.join(" · ")}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Cinta de puntos DPO de una sección. Va debajo del título de la solapa, para
 * que el auditor lea de una qué requisito está mirando.
 */
export function DpoSeccionCinta({ seccionId, className }: { seccionId: string; className?: string }) {
  const seccion = seccionFlota(seccionId)
  if (!seccion) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className="text-xs text-muted-foreground">Responde a</span>
      {seccion.puntos.map((n) => (
        <DpoPuntoBadge key={n} numero={n} />
      ))}
      {seccion.requisitos?.length ? (
        <span className="text-[11px] text-muted-foreground/70">
          ({seccion.requisitos.join(" · ")})
        </span>
      ) : null}
      {/* El procedimiento y el acuerdo que respaldan esta sección, a un click. */}
      <DocsDePunto puntos={seccion.puntos} />
      <span className="w-full text-xs text-muted-foreground/80 sm:w-auto sm:border-l sm:border-border sm:pl-2">
        {seccion.aporta}
      </span>
    </div>
  )
}
