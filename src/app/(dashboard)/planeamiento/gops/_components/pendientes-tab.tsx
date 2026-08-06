"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ChevronDown, ChevronRight, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GopPendiente, GopTemaResumen, DestinoDecision } from "@/actions/gops"
import type { GopPlan } from "@/actions/gops-planes"
import { DecidirDialog, type PuntoADecidir } from "./decidir-dialog"
import { COLOR_TONO, pct, tonoPuntaje } from "./formato"

interface Props {
  pendientes: GopPendiente[]
  resumen: GopTemaResumen[]
  planes: GopPlan[]
  responsables: Array<{ id: string; nombre: string }>
  canEdit: boolean
}

/**
 * La lista de trabajo del mes, agrupada por GOP: 41 puntos sueltos no se trabajan, y
 * cada GOP se relevó y se corrige por separado (tienen dueños distintos).
 *
 * Los grupos van del GOP más lejos del target al más cerca, y dentro de cada uno los
 * puntos van por impacto. Así lo primero que aparece es donde hay más para ganar, en vez
 * del tema que casualmente tenga más "No".
 */
export function PendientesTab({ pendientes, resumen, planes, responsables, canEdit }: Props) {
  const [punto, setPunto] = useState<PuntoADecidir | null>(null)
  const [destinoInicial, setDestinoInicial] = useState<DestinoDecision>("plan")
  const [area, setArea] = useState<string | null>(null)
  const [soloBajoTarget, setSoloBajoTarget] = useState(false)
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())

  const temaPorId = useMemo(() => new Map(resumen.map((t) => [t.id, t])), [resumen])

  const areas = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const p of pendientes) {
      const a = p.tema_area ?? "Sin área"
      cuenta.set(a, (cuenta.get(a) ?? 0) + 1)
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  }, [pendientes])

  const grupos = useMemo(() => {
    const filtrados = pendientes.filter((p) => {
      if (area && (p.tema_area ?? "Sin área") !== area) return false
      if (soloBajoTarget) {
        const t = temaPorId.get(p.tema_id)
        if (!t || t.puntaje === null || t.puntaje >= t.target) return false
      }
      return true
    })

    const porTema = new Map<string, GopPendiente[]>()
    for (const p of filtrados) {
      const arr = porTema.get(p.tema_id)
      if (arr) arr.push(p)
      else porTema.set(p.tema_id, [p])
    }

    return [...porTema.entries()]
      .map(([temaId, puntos]) => {
        const tema = temaPorId.get(temaId)
        const brecha = tema && tema.puntaje !== null ? tema.target - tema.puntaje : 0
        return { temaId, tema, puntos, brecha }
      })
      .sort((a, b) => b.brecha - a.brecha || b.puntos.length - a.puntos.length)
  }, [pendientes, area, soloBajoTarget, temaPorId])

  const totalFiltrado = grupos.reduce((a, g) => a + g.puntos.length, 0)

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

  function alternarGrupo(temaId: string) {
    setCerrados((prev) => {
      const s = new Set(prev)
      if (s.has(temaId)) s.delete(temaId)
      else s.add(temaId)
      return s
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setArea(null)}
          className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
            area === null
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Todas · {pendientes.length}
        </button>
        {areas.map(([nombre, cuenta]) => (
          <button
            key={nombre}
            onClick={() => setArea(nombre)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
              area === nombre
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {nombre} · {cuenta}
          </button>
        ))}

        <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={soloBajoTarget}
            onChange={(e) => setSoloBajoTarget(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Solo GOPs abajo del target
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        {totalFiltrado} {totalFiltrado === 1 ? "punto" : "puntos"} en {grupos.length}{" "}
        {grupos.length === 1 ? "GOP" : "GOPs"}, del que está más lejos del target al que está
        más cerca.
      </p>

      {grupos.map(({ temaId, tema, puntos }) => {
        const abiertoGrupo = !cerrados.has(temaId)
        const tono = tema ? tonoPuntaje(tema.puntaje, tema.target) : "lejos"

        return (
          <div key={temaId} className="rounded-xl border border-slate-200 bg-white">
            <button
              onClick={() => alternarGrupo(temaId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {abiertoGrupo ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {puntos[0].tema_nombre}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {tema?.tipo ?? "GOP"}
                  </Badge>
                  {puntos[0].tema_area && (
                    <span className="text-xs text-muted-foreground">{puntos[0].tema_area}</span>
                  )}
                </div>
                {tema && (
                  <p className="text-xs text-muted-foreground">
                    hoy <span className={`font-semibold ${COLOR_TONO[tono]}`}>
                      {pct(tema.puntaje)}
                    </span>{" "}
                    · target {pct(tema.target, 0)}
                    {tema.no_para_target > 0
                      ? ` · faltan ${tema.no_para_target} para pasarlo`
                      : " · ya pasó el target"}
                    {tema.dueno && ` · ${tema.dueno}`}
                  </p>
                )}
              </div>

              <Badge
                variant="secondary"
                className="shrink-0 text-xs"
              >
                {puntos.length} {puntos.length === 1 ? "punto" : "puntos"}
              </Badge>
            </button>

            {abiertoGrupo && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {puntos.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {p.seccion && (
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {p.seccion}
                          </span>
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

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        {p.meses_en_no > 1 && (
                          <span className="font-semibold text-red-600">
                            {p.meses_en_no} meses seguidos en No
                          </span>
                        )}
                        {p.impacto !== null && (
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <TrendingUp className="h-3 w-3" />
                            cerrarlo suma {pct(p.impacto)}
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

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
