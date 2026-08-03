"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarClock, CheckCircle2, Loader2, PencilLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { guardarRevisionPdca } from "@/actions/herramientas-gestion"
import { mesActual, mesDe, mesesEntre } from "@/lib/herramientas-gestion"
import type { PdcaContenido, PdcaRevision } from "@/types/database"

interface Props {
  herramientaId: string
  contenido: PdcaContenido
  /** created_at de la herramienta: desde ese mes se precarga la grilla. */
  desde: string
}

/** "agosto 2026" a partir de 'YYYY-MM'. */
function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number)
  const texto = format(new Date(y, m - 1, 1), "MMMM yyyy", { locale: es })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return format(new Date(y, m - 1, d), "dd/MM", { locale: es })
}

export function PdcaRevisionesMensuales({ herramientaId, contenido, desde }: Props) {
  const router = useRouter()
  const [revisiones, setRevisiones] = useState<PdcaRevision[]>(
    contenido.revisiones ?? [],
  )
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState("")
  const [guardando, startTransition] = useTransition()

  const hoyMes = mesActual()

  // Una fila por mes desde que nació el PDCA hasta el mes en curso, la más
  // reciente arriba. Si alguna revisión quedó fechada antes, se estira.
  const meses = useMemo(() => {
    const conFecha = revisiones.map((r) => mesDe(r.fecha)).filter(Boolean)
    const inicio = [mesDe(desde) || hoyMes, ...conFecha].sort()[0]
    return mesesEntre(inicio, hoyMes).reverse()
  }, [desde, revisiones, hoyMes])

  const porMes = useMemo(() => {
    const map = new Map<string, PdcaRevision[]>()
    for (const r of revisiones) {
      const mes = mesDe(r.fecha)
      if (!mes) continue
      map.set(mes, [...(map.get(mes) ?? []), r])
    }
    return map
  }, [revisiones])

  // Revisiones viejas cargadas sin fecha: no entran en ningún mes, pero no se
  // esconden.
  const sinFecha = revisiones.filter((r) => !mesDe(r.fecha) && r.avance?.trim())
  const cargados = meses.filter((m) => (porMes.get(m) ?? []).length > 0).length
  const pendientes = meses.filter(
    (m) => m !== hoyMes && (porMes.get(m) ?? []).length === 0,
  ).length

  function abrir(mes: string) {
    const items = porMes.get(mes) ?? []
    setBorrador(items.map((r) => r.avance).join("\n"))
    setEditando(mes)
  }

  function guardar(mes: string) {
    startTransition(async () => {
      const r = await guardarRevisionPdca(herramientaId, mes, borrador)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setRevisiones(r.data.revisiones ?? [])
      setEditando(null)
      setBorrador("")
      toast.success(
        borrador.trim()
          ? `Revisión de ${etiquetaMes(mes).toLowerCase()} guardada`
          : `Revisión de ${etiquetaMes(mes).toLowerCase()} borrada`,
      )
      router.refresh()
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Revisión mensual</span>
          <span className="text-xs text-slate-500">
            (el manual pide mínimo una por mes)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
            {cargados}/{meses.length} meses
          </span>
          {pendientes > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
              {pendientes} sin registrar
            </span>
          )}
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {meses.map((mes) => {
          const items = porMes.get(mes) ?? []
          const cargada = items.length > 0
          const esActual = mes === hoyMes
          const enEdicion = editando === mes

          return (
            <li
              key={mes}
              className={
                cargada
                  ? "bg-white"
                  : esActual
                    ? "bg-slate-50"
                    : "bg-amber-50/50"
              }
            >
              {enEdicion ? (
                <div className="space-y-2 p-3">
                  <p className="text-xs font-semibold text-slate-700">
                    {etiquetaMes(mes)}
                  </p>
                  <Textarea
                    autoFocus
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    placeholder="¿Cómo viene el indicador contra la meta? ¿Qué se decidió?"
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={guardando || (!borrador.trim() && !cargada)}
                      onClick={() => guardar(mes)}
                    >
                      {guardando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                      Guardar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={guardando}
                      onClick={() => {
                        setEditando(null)
                        setBorrador("")
                      }}
                    >
                      Cancelar
                    </Button>
                    {cargada && (
                      <span className="text-[11px] text-slate-500">
                        Guardar en blanco borra la revisión del mes.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => abrir(mes)}
                  className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-slate-100/70"
                >
                  <span className="flex w-32 shrink-0 items-center gap-1.5">
                    {cargada ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <span
                        className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                          esActual
                            ? "border-slate-300 bg-white"
                            : "border-amber-300 bg-amber-100"
                        }`}
                      />
                    )}
                    <span className="text-xs font-medium text-slate-700">
                      {etiquetaMes(mes)}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    {cargada ? (
                      items.map((r, i) => (
                        <span key={i} className="block text-sm leading-snug text-slate-800">
                          {r.fecha && (
                            <span className="mr-1.5 text-xs text-slate-400">
                              {fechaCorta(r.fecha)}
                            </span>
                          )}
                          <span className="whitespace-pre-wrap">{r.avance}</span>
                        </span>
                      ))
                    ) : (
                      <span
                        className={`text-sm italic ${
                          esActual ? "text-slate-500" : "text-amber-700"
                        }`}
                      >
                        {esActual
                          ? "Registrar la revisión de este mes"
                          : "Sin registrar"}
                      </span>
                    )}
                  </span>

                  <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {sinFecha.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Revisiones sin mes asignado
          </p>
          {sinFecha.map((r, i) => (
            <p key={i} className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
              {r.avance}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
