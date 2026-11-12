"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Check, ChevronDown, ChevronRight, Pencil, Target, X } from "lucide-react"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { guardarObtenidoPdp, type AvanceRol } from "@/actions/skap-avance"
import { accionHecha, type AvancePdp, type AvancePersona } from "@/lib/skap/avance"
import type { SkapEstadoAccion, SkapRol } from "@/types/database"

const LABEL_ESTADO: Record<SkapEstadoAccion, string> = {
  pendiente: "pendiente",
  programada: "programada",
  realizada: "cumplida",
  cerrada: "cerrada (reevaluada)",
}

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const pctTxt = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`)

/** Mismo semáforo de avance que el resto de los planes: ≥80 verde, ≥50 ámbar, menos rojo. */
function colorAvance(v: number | null) {
  if (v === null) return { bar: "bg-slate-200", text: "text-slate-400" }
  if (v >= 80) return { bar: "bg-emerald-500", text: "text-emerald-700" }
  if (v >= 50) return { bar: "bg-amber-400", text: "text-amber-700" }
  return { bar: "bg-rose-500", text: "text-rose-700" }
}

function Barra({ v }: { v: number | null }) {
  const c = colorAvance(v)
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${c.bar}`} style={{ width: `${v ?? 0}%` }} />
      </div>
      <span className={`w-11 text-right text-xs font-semibold tabular-nums ${c.text}`}>{pctTxt(v)}</span>
    </div>
  )
}

type OnObtenido = (o: AvancePdp, obtenido: number | null, listo: () => void) => void

export function AvanceTab({ avance, rol, canEdit }: { avance: AvanceRol | null; rol: SkapRol; canEdit: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const refrescar = useRefrescarConScroll()

  /** `obtenido: null` vuelve al valor de la plataforma. */
  const cambiarObtenido: OnObtenido = (o, obtenido, listo) => {
    if (!avance) return
    startTransition(async () => {
      const res = await guardarObtenidoPdp({ rol, anio: avance.anioPdp, clave: o.clave, obtenido })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(obtenido === null ? "Vuelve al avance de la plataforma" : "Avance del PDP guardado")
      listo()
      refrescar()
    })
  }

  if (!avance) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-red-500">No se pudo calcular el avance.</CardContent>
      </Card>
    )
  }
  const { personas, anioPdp, hayPdp } = avance
  if (personas.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-500">No hay personas en este rol.</CardContent>
      </Card>
    )
  }

  const conPlan = personas.filter((p) => p.avance_total !== null)
  const prom = conPlan.length ? conPlan.reduce((s, p) => s + p.avance_total!, 0) / conPlan.length : null
  const acciones = personas.flatMap((p) => p.acciones)
  const hechas = acciones.filter((a) => accionHecha(a.estado)).length
  const conPdp = personas.filter((p) => p.pdp.length > 0).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <span>
          Avance promedio <b className={colorAvance(prom).text}>{pctTxt(prom)}</b>
          <span className="text-slate-400"> ({conPlan.length} con plan)</span>
        </span>
        <span>
          SKAP: <b className="text-slate-900">{hechas}</b>/{acciones.length} acciones hechas
        </span>
        <span>
          PDP {anioPdp}: <b className="text-slate-900">{conPdp}</b>/{personas.length} con PDP
        </span>
        <span className="ml-auto text-xs text-slate-400">
          Avance = promedio del plan SKAP (acciones cumplidas o cerradas) y del PDP (obtenido / meta), cada uno pesa igual.
        </span>
      </div>

      {!hayPdp && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          RRHH todavía no importó los PDP {anioPdp} (RRHH › Desempeño › PDP): el avance sale sólo del plan SKAP.
        </p>
      )}

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="p-2">Persona</th>
                <th className="p-2">Plan SKAP</th>
                <th className="p-2">PDP (Desempeño)</th>
                <th className="p-2">Avance total</th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <FilaPersona
                  key={p.empleado_id}
                  p={p}
                  abierto={abierto === p.empleado_id}
                  onToggle={() => setAbierto(abierto === p.empleado_id ? null : p.empleado_id)}
                  canEdit={canEdit}
                  pendiente={pendiente}
                  onObtenido={cambiarObtenido}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-slate-400">
        Los PDP los cargan los líderes en la plataforma de la compañía y RRHH los importa en Desempeño; se cruzan por
        DNI. El avance cargado a mano («Avance», al desplegar la persona) manda sobre el de la plataforma aunque RRHH
        reimporte, hasta que se toque «usar plataforma».
      </p>
    </div>
  )
}

function FilaPersona({
  p,
  abierto,
  onToggle,
  canEdit,
  pendiente,
  onObtenido,
}: {
  p: AvancePersona
  abierto: boolean
  onToggle: () => void
  canEdit: boolean
  pendiente: boolean
  onObtenido: OnObtenido
}) {
  const hechas = p.acciones.filter((a) => accionHecha(a.estado)).length
  const vencidas = p.acciones.filter((a) => a.vencida).length
  return (
    <>
      <tr className="cursor-pointer border-b hover:bg-slate-50" onClick={onToggle}>
        <td className="p-2 whitespace-nowrap">
          {abierto ? <ChevronDown className="mr-1 inline size-3.5" /> : <ChevronRight className="mr-1 inline size-3.5" />}
          {p.nombre}
          <span className="ml-1 text-xs text-slate-400">#{p.legajo}</span>
        </td>
        <td className="p-2">
          {p.acciones.length ? (
            <div className="flex items-center gap-2">
              <Barra v={p.avance_skap} />
              <span className="text-xs text-slate-500">
                {hechas}/{p.acciones.length}
                {vencidas > 0 && <span className="ml-1 text-rose-600">· {vencidas} vencida{vencidas === 1 ? "" : "s"}</span>}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">sin acciones</span>
          )}
        </td>
        <td className="p-2">
          {p.pdp.length ? (
            <div className="flex items-center gap-2">
              <Barra v={p.avance_pdp} />
              <span className="text-xs text-slate-500">
                {p.pdp.length} objetivo{p.pdp.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">sin PDP</span>
          )}
        </td>
        <td className="p-2">
          <Barra v={p.avance_total} />
        </td>
      </tr>
      {abierto && (
        <tr className="border-b bg-slate-50/60">
          <td colSpan={4} className="p-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">Acciones del plan SKAP</p>
                {p.acciones.length === 0 ? (
                  <p className="text-xs text-slate-400">No tiene acciones de formación.</p>
                ) : (
                  <ul className="space-y-1">
                    {p.acciones.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant={a.criticidad === "A" ? "destructive" : "secondary"} className="px-1 py-0 text-[10px]">
                          {a.criticidad}
                        </Badge>
                        <span className="text-slate-700">{a.habilidad}</span>
                        <Badge
                          variant="outline"
                          className={
                            accionHecha(a.estado)
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : a.vencida
                                ? "border-rose-300 bg-rose-50 text-rose-700"
                                : ""
                          }
                        >
                          {LABEL_ESTADO[a.estado]}
                          {a.estado === "realizada" && a.fecha_realizada && ` ${fechaCorta(a.fecha_realizada)}`}
                          {!accionHecha(a.estado) && a.fecha_programada && ` ${fechaCorta(a.fecha_programada)}`}
                          {a.vencida && " · vencida"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">PDP de Desempeño</p>
                {p.pdp.length === 0 ? (
                  <p className="text-xs text-slate-400">Su líder no le cargó PDP en la plataforma.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {p.pdp.map((o) => (
                      <li key={o.clave} className="text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Target className="size-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700" title={o.descripcion}>
                            {o.objetivo}
                          </span>
                          <ObtenidoPdp o={o} canEdit={canEdit} pendiente={pendiente} onObtenido={onObtenido} />
                        </div>
                        {o.descripcion && <p className="ml-5 text-slate-500">{o.descripcion}</p>}
                        {o.jefe && <p className="ml-5 text-slate-400">Líder: {o.jefe}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/** Obtenido / meta del PDP; quien edita la matriz lo puede cargar a mano. */
function ObtenidoPdp({
  o,
  canEdit,
  pendiente,
  onObtenido,
}: {
  o: AvancePdp
  canEdit: boolean
  pendiente: boolean
  onObtenido: OnObtenido
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState("")

  if (editando) {
    const guardar = () => {
      const n = Number(valor.replace(",", "."))
      if (valor.trim() === "" || !Number.isFinite(n) || n < 0) {
        toast.error("Poné un número mayor o igual a 0")
        return
      }
      onObtenido(o, n, () => setEditando(false))
    }
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar()
            if (e.key === "Escape") setEditando(false)
          }}
          className="h-6 w-16 rounded border px-1 text-right text-xs tabular-nums"
          aria-label="Obtenido"
        />
        <span className="text-slate-500">/{o.meta ?? "—"}</span>
        <button
          type="button"
          disabled={pendiente}
          onClick={guardar}
          className="rounded p-0.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          title="Guardar"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
          title="Cancelar"
        >
          <X className="size-3.5" />
        </button>
      </span>
    )
  }

  return (
    <>
      <span className={`font-semibold tabular-nums ${colorAvance(o.avance).text}`}>
        {o.obtenido ?? 0}/{o.meta ?? "—"} · {pctTxt(o.avance)}
      </span>
      {canEdit && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setValor(o.obtenido === null ? "" : String(o.obtenido))
            setEditando(true)
          }}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          title="Cargar el avance a mano"
        >
          <Pencil className="size-3" /> Avance
        </button>
      )}
      {o.manual && (
        <span
          className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-800"
          title="Cargado a mano: manda sobre la plataforma aunque RRHH reimporte"
        >
          a mano {fechaCorta(o.manual.fecha)} · plataforma {o.manual.plataforma ?? "—"}
          {canEdit && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => onObtenido(o, null, () => {})}
              className="ml-0.5 underline hover:text-sky-950 disabled:opacity-50"
            >
              usar plataforma
            </button>
          )}
        </span>
      )}
    </>
  )
}
