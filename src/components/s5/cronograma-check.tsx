"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { AlertTriangle, CalendarCheck, Loader2, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getCheckSectores, marcarFalta, type CheckSector } from "@/actions/s5-check"
import { FRECUENCIA_LABEL, type AdherenciaCheck, type FrecuenciaCheck } from "@/lib/s5-cronograma"

const ORDEN_FRECUENCIA: FrecuenciaCheck[] = ["diaria", "semanal", "quincenal", "mensual"]

export function formatDiaCorto(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

export function textoAdherenciaCorto(a: AdherenciaCheck): string {
  if (a.dias === 0) return "todavía no cerró ningún día"
  return `${a.dias_completos} de ${a.dias} días sin faltas (${a.pct}%) · periódicos ${a.periodicos_hechos}/${a.periodicos_total}`
}

/**
 * El cronograma de un sector, agrupado por frecuencia, con las faltas de la
 * fecha consultada. Todo se da por hecho: lo único que se pinta es lo que la
 * recorrida marcó como "no se hizo". Con `onFalta` aparece el botón para
 * marcar o deshacer (sólo quien hace la recorrida).
 */
export function ListaCronograma({
  check,
  onFalta,
  guardando,
}: {
  check: CheckSector
  onFalta?: (itemId: string, falta: boolean) => void
  guardando?: string | null
}) {
  const grupos = ORDEN_FRECUENCIA.map((f) => ({
    frecuencia: f,
    items: check.items.filter((i) => i.frecuencia === f),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <div key={g.frecuencia}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {FRECUENCIA_LABEL[g.frecuencia]}
          </p>
          <ul className="space-y-1">
            {g.items.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                  item.falta ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                }`}
              >
                <span className={`min-w-0 flex-1 ${item.falta ? "text-red-900" : "text-slate-800"}`}>
                  {item.texto}
                  {item.falta && item.falta_el && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-700">
                      <AlertTriangle className="size-3" />
                      No se hizo {formatDiaCorto(item.falta_el)}
                      {item.falta_por ? ` · ${item.falta_por}` : ""}
                    </span>
                  )}
                </span>
                {onFalta && (
                  <Button
                    type="button"
                    size="sm"
                    variant={item.falta ? "outline" : "ghost"}
                    className={`h-7 shrink-0 px-2 text-xs ${
                      item.falta ? "border-red-300 text-red-700" : "text-slate-500 hover:text-red-700"
                    }`}
                    disabled={guardando !== null && guardando !== undefined}
                    onClick={() => onFalta(item.id, !item.falta)}
                  >
                    {guardando === item.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : item.falta ? (
                      <>
                        <Undo2 className="mr-1 size-3.5" /> Deshacer
                      </>
                    ) : (
                      "No se hizo"
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * Tarjeta de la página 5S: el cronograma de los cuatro sectores con la fecha
 * de la recorrida. Admin y auditor marcan "no se hizo"; el resto sólo mira.
 */
export function CronogramaRecorrida({
  inicial,
  nombres,
  puedeMarcar,
}: {
  inicial: CheckSector[]
  nombres: Record<number, string>
  puedeMarcar: boolean
}) {
  const [checks, setChecks] = useState(inicial)
  const [fecha, setFecha] = useState(inicial[0]?.fecha ?? "")
  const [cargando, startCargar] = useTransition()
  const [guardando, setGuardando] = useState<string | null>(null)
  const hoy = inicial[0]?.hoy ?? fecha

  function cambiarFecha(nueva: string) {
    if (!nueva) return
    setFecha(nueva)
    startCargar(async () => {
      const res = await getCheckSectores(
        checks.map((c) => c.sector),
        nueva
      )
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setChecks(res.data)
    })
  }

  async function marcar(sector: number, itemId: string, falta: boolean) {
    setGuardando(`${sector}:${itemId}`)
    const res = await marcarFalta({ sector, itemId, fecha, falta })
    setGuardando(null)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setChecks((prev) => prev.map((c) => (c.sector === sector ? res.data : c)))
  }

  if (checks.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="size-5 text-emerald-600" />
              Cronograma de limpieza y recorrida
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Los ítems diarios se dan por hechos al cerrar cada día. En la recorrida se marca
              sólo lo que no se hizo; un día sin faltas cuenta como completo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Recorrida del</span>
            <Input
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => cambiarFecha(e.target.value)}
              className="h-8 w-[150px] text-sm"
            />
            {cargando && <Loader2 className="size-4 animate-spin text-slate-400" />}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-4 lg:grid-cols-2 ${cargando ? "opacity-60" : ""}`}>
          {checks.map((c) => (
            <div key={c.sector} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {c.sector}. {nombres[c.sector] ?? `Sector ${c.sector}`}
                </p>
                <Badge
                  variant="outline"
                  className={
                    c.adherencia.dias === 0
                      ? "text-slate-400"
                      : (c.adherencia.pct ?? 0) >= 80
                        ? "border-emerald-300 text-emerald-700"
                        : "border-amber-300 text-amber-700"
                  }
                >
                  {textoAdherenciaCorto(c.adherencia)}
                </Badge>
              </div>
              <ListaCronograma
                check={c}
                onFalta={puedeMarcar ? (itemId, falta) => marcar(c.sector, itemId, falta) : undefined}
                guardando={
                  guardando && guardando.startsWith(`${c.sector}:`)
                    ? guardando.slice(guardando.indexOf(":") + 1)
                    : null
                }
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
