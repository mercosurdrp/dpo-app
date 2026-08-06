"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GopPendiente, GopTemaResumen, DestinoDecision } from "@/actions/gops"
import type { GopPlan } from "@/actions/gops-planes"
import { DecidirDialog, type PuntoADecidir } from "./decidir-dialog"
import { pct } from "./formato"

interface Props {
  pendientes: GopPendiente[]
  resumen: GopTemaResumen[]
  planes: GopPlan[]
  responsables: Array<{ id: string; nombre: string }>
  canEdit: boolean
}

/**
 * La lista de trabajo del mes. Ordenada por impacto —cuánto sube el puntaje del GOP dar
 * vuelta ese punto— y no por cantidad de "No": un tema con un solo "No" que ya pasó el
 * target no debería competir con otro que necesita cerrar siete para llegar.
 */
export function PendientesTab({ pendientes, resumen, planes, responsables, canEdit }: Props) {
  const [punto, setPunto] = useState<PuntoADecidir | null>(null)
  const [destinoInicial, setDestinoInicial] = useState<DestinoDecision>("plan")
  const [soloBajoTarget, setSoloBajoTarget] = useState(false)

  const temaPorId = useMemo(() => new Map(resumen.map((t) => [t.id, t])), [resumen])

  const lista = useMemo(
    () =>
      soloBajoTarget
        ? pendientes.filter((p) => {
            const t = temaPorId.get(p.tema_id)
            return t && t.puntaje !== null && t.puntaje < t.target
          })
        : pendientes,
    [pendientes, soloBajoTarget, temaPorId],
  )

  function abrir(p: GopPendiente, destino: DestinoDecision) {
    setDestinoInicial(destino)
    setPunto({
      preguntaId: p.id,
      temaId: p.tema_id,
      temaNombre: p.tema_nombre,
      texto: p.texto,
      mesesEnNo: p.meses_en_no,
    })
  }

  if (pendientes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="font-semibold text-slate-900">Todo el mes está decidido</p>
          <p className="text-sm text-muted-foreground">
            Cada &ldquo;No&rdquo; tiene plan, diferimiento con motivo o no-aplica justificado.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lista.length} {lista.length === 1 ? "punto" : "puntos"} esperando decisión, del que más
          sube el puntaje al que menos.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={soloBajoTarget}
            onChange={(e) => setSoloBajoTarget(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Solo GOPs abajo del target
        </label>
      </div>

      <div className="space-y-2">
        {lista.map((p) => {
          const tema = temaPorId.get(p.tema_id)
          return (
            <Card key={p.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {p.tema_nombre}
                    </Badge>
                    {p.seccion && (
                      <span className="text-xs text-muted-foreground">{p.seccion}</span>
                    )}
                    {p.motivo_pendiente === "revision" && (
                      <Badge className="bg-amber-100 text-xs text-amber-800">
                        Venció la revisión
                      </Badge>
                    )}
                  </div>

                  <p className="text-[15px] text-slate-900">{p.texto}</p>

                  {p.comentario && (
                    <p className="mt-1 text-xs text-muted-foreground">{p.comentario}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {p.meses_en_no > 1 && (
                      <span className="font-semibold text-red-600">
                        {p.meses_en_no} meses seguidos en No
                      </span>
                    )}
                    {p.impacto !== null && (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <TrendingUp className="h-3 w-3" />
                        cerrarlo suma {pct(p.impacto)} al GOP
                      </span>
                    )}
                    {tema && tema.puntaje !== null && (
                      <span className="text-slate-500">
                        {p.tema_nombre} hoy {pct(tema.puntaje)} · target {pct(tema.target, 0)}
                        {tema.no_para_target > 0 && ` · faltan ${tema.no_para_target}`}
                      </span>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      onClick={() => abrir(p, "plan")}
                      className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Plan de acción
                    </button>
                    <button
                      onClick={() => abrir(p, "largo_plazo")}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Largo plazo
                    </button>
                    <button
                      onClick={() => abrir(p, "no_aplica")}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      No aplica
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <DecidirDialog
        punto={punto}
        onOpenChange={(open) => !open && setPunto(null)}
        planes={planes}
        responsables={responsables}
        destinoInicial={destinoInicial}
      />
    </div>
  )
}
