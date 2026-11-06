"use client"

// Control de aceite del CIL (DPO Flota 4.1): lo que el operador encontró en los
// últimos tres meses y el paso de cada hallazgo a su OT. Es la evidencia del
// R4.1.4 (el PI) y del R4.1.5 (las acciones) en una sola tarjeta.

import { useCallback, useEffect, useState, useTransition } from "react"
import { Droplet, ImageIcon, Loader2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  generarOtDesdeHallazgoAceite,
  getControlAceite,
  type ControlAceiteTablero,
} from "@/actions/cil-aceite"
import { cn } from "@/lib/utils"

const fmtFecha = (f: string) => f.split("-").reverse().join("/")

export function ControlAceite({ puedeEditar }: { puedeEditar: boolean }) {
  const [data, setData] = useState<ControlAceiteTablero | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  const cargar = useCallback(() => {
    iniciar(async () => {
      const res = await getControlAceite()
      if ("error" in res) setError(res.error)
      else {
        setError(null)
        setData(res.data)
      }
    })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function generarOt(id: string) {
    setGenerando(id)
    try {
      const res = await generarOtDesdeHallazgoAceite(id)
      if ("error" in res) return toast.error(res.error)
      toast.success(res.numeroOt ? `OT ${res.numeroOt} creada` : "OT creada")
      cargar()
    } finally {
      setGenerando(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Droplet className="size-4 text-sky-600" />
          Control de aceite
          <Badge variant="outline" className="font-normal">
            PI de ATO · R4.1.4 / R4.1.5
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Va con la I del CIL (inspección), una vez por mes por unidad, en camiones y
          autoelevadores. El checklist diario marcó el nivel de aceite OK en todos los
          controles de jul–nov; las reposiciones de aceite las encontró el CIL.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </p>
        )}
        {data && !data.disponible && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Falta aplicar la migración del control de aceite en esta base
            (APLICAR_EN_PAMPEANA_CIL_ACEITE.sql).
          </p>
        )}
        {data && data.disponible && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Unidades con control este mes</p>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    data.conControl === data.obligatorias ? "text-emerald-600" : "text-foreground",
                  )}
                >
                  {data.conControl} / {data.obligatorias}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Hallazgos desde el {fmtFecha(data.desde)}</p>
                <p className="text-2xl font-semibold tabular-nums">{data.hallazgos.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Litros repuestos desde el {fmtFecha(data.desde)}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.litrosTrimestre.toLocaleString("es-AR")} L
                </p>
              </div>
            </div>

            {data.sinControl.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Sin control este mes:</span>{" "}
                {data.sinControl.join(", ")}
              </p>
            )}

            {data.hallazgos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin hallazgos de aceite desde el {fmtFecha(data.desde)}.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {data.hallazgos.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                    <span className="font-semibold">{h.dominio}</span>
                    <span className="text-xs text-muted-foreground">{fmtFecha(h.fecha)}</span>
                    {h.reincidente && (
                      <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
                        Reincidente · 5 Porqués
                      </Badge>
                    )}
                    {h.backfill && (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        desde la descripción
                      </Badge>
                    )}
                    <span className="w-full text-muted-foreground sm:w-auto sm:flex-1">
                      {h.resumen} · {h.operario}
                    </span>
                    {h.foto_url && (
                      <a
                        href={h.foto_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ImageIcon className="size-3.5" /> Foto
                      </a>
                    )}
                    {h.ot ? (
                      <Badge variant="secondary" className="font-normal">
                        OT {h.ot.numero ?? "s/n"} · {h.ot.estado}
                      </Badge>
                    ) : puedeEditar ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generando === h.id}
                        onClick={() => void generarOt(h.id)}
                      >
                        {generando === h.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Wrench className="size-3.5" />
                        )}
                        Generar OT
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">sin OT</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
