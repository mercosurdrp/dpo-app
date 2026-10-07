"use client"

/**
 * Estado DPO del pilar Flota: punto por punto, qué puntuó la última auditoría y
 * qué hay hoy en la app para respaldarlo.
 *
 * Es la hoja de preparación de la próxima visita. Cruza tres cosas que ya
 * existen y que hasta ahora había que juntar de memoria:
 *  - el puntaje y el comentario de la auditoría cerrada,
 *  - las solapas del módulo que responden ese punto (`SECCIONES_FLOTA`),
 *  - los SOP y SLA que lo documentan.
 *
 * 🚨 No escribe ningún puntaje. La auditoría de julio queda intacta: acá se lee
 * para poder mostrar la mejora, no para pisarla.
 */

import { useEffect, useState } from "react"
import { ChevronDown, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { seccionesDeFlotaPorPunto } from "@/lib/flota/dpo-puntos"
import { getEstadoDpoFlota, type EstadoDpoFlota } from "@/actions/estado-dpo-flota"
import { DocsDePunto } from "@/components/flota/documentos-dpo"

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

/** Verde a partir de 3: es el puntaje con el que un requisito deja de arrastrar. */
function colorPuntaje(p: number | null): string {
  if (p == null) return "border-border bg-muted text-muted-foreground"
  if (p >= 5) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  if (p >= 3) return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
  if (p >= 1) return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
  return "border-destructive/40 bg-destructive/10 text-destructive"
}

export function EstadoDpoPanel() {
  const [estado, setEstado] = useState<EstadoDpoFlota | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getEstadoDpoFlota().then((r) => {
      if (vivo && "data" in r) setEstado(r.data)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (!estado) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  const puntos = estado.puntos
  const evaluados = puntos.filter((p) => p.puntaje != null)
  const promedio = evaluados.length
    ? evaluados.reduce((a, p) => a + (p.puntaje ?? 0), 0) / evaluados.length
    : null

  // Agrupado por bloque, que es como está ordenado el manual.
  const bloques = [...new Set(puntos.map((p) => p.bloque))]

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Estado DPO del pilar Flota</h3>
        <p className="text-sm text-muted-foreground">
          Punto por punto: lo que puntuó la última auditoría, lo que pidió el auditor y
          dónde está hoy la evidencia en la app. Tocá un punto para ver sus requisitos.
        </p>
        {estado.auditoria && (
          <p className="text-xs text-muted-foreground">
            Puntajes de <strong>{estado.auditoria.nombre}</strong> ·{" "}
            {fmtFecha(estado.auditoria.fechaInicio)} · {estado.auditoria.estado}
            {promedio != null && (
              <> · promedio del pilar {promedio.toFixed(1)} de 5 sobre {evaluados.length} puntos</>
            )}
            . Esta pantalla no modifica esos puntajes: para puntuar de nuevo se abre un
            ciclo nuevo desde Auditorías.
          </p>
        )}
      </div>

      {bloques.map((bloque) => (
        <Card key={bloque}>
          <CardContent className="space-y-1 pt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {bloque}
            </p>
            {puntos
              .filter((p) => p.bloque === bloque)
              .map((p) => {
                const secciones = seccionesDeFlotaPorPunto(p.numero)
                const estaAbierto = abierto === p.numero
                return (
                  <div key={p.numero} className="rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setAbierto(estaAbierto ? null : p.numero)}
                      className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40"
                      aria-expanded={estaAbierto}
                    >
                      <Badge
                        variant="outline"
                        className={cn("mt-0.5 shrink-0 tabular-nums", colorPuntaje(p.puntaje))}
                      >
                        {p.puntaje ?? "—"}/5
                      </Badge>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums text-foreground">
                            {p.numero}
                          </span>
                          <span className="text-sm text-foreground">{p.titulo}</span>
                          {p.mandatorio && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
                            >
                              Mandatorio
                            </Badge>
                          )}
                        </span>
                        {/* Dónde está la evidencia: las solapas del módulo que
                            responden este punto y sus documentos. */}
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {secciones.length > 0 ? (
                            <>
                              <span>Evidencia en</span>
                              {secciones.map((s) => (
                                <span
                                  key={s.id}
                                  className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80"
                                >
                                  {s.label}
                                </span>
                              ))}
                            </>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              Ninguna solapa del módulo declara responder este punto
                            </span>
                          )}
                          <DocsDePunto puntos={[p.numero]} />
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                          estaAbierto && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>

                    {estaAbierto && (
                      <div className="space-y-3 border-t border-border bg-muted/20 p-3 text-sm">
                        {p.comentario && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Lo que anotó el auditor
                            </p>
                            <p className="mt-0.5 text-foreground">{p.comentario}</p>
                          </div>
                        )}
                        {p.requisitos.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Requisitos
                            </p>
                            <ul className="mt-0.5 space-y-1">
                              {p.requisitos.map((r) => (
                                <li key={r} className="text-foreground">
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Object.keys(p.criterio).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Cómo se puntúa
                            </p>
                            <ul className="mt-0.5 space-y-0.5">
                              {Object.entries(p.criterio)
                                .sort(([a], [b]) => Number(a) - Number(b))
                                .map(([n, txt]) => (
                                  <li key={n} className="flex gap-2">
                                    <Badge
                                      variant="outline"
                                      className={cn("h-5 shrink-0 tabular-nums", colorPuntaje(Number(n)))}
                                    >
                                      {n}
                                    </Badge>
                                    <span className="text-muted-foreground">{txt}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                        {p.comoVerificar && (
                          <div>
                            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <ShieldCheck className="size-3" aria-hidden /> Cómo lo verifica
                            </p>
                            <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                              {p.comoVerificar}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
