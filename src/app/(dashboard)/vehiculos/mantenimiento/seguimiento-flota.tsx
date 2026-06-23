"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { CalendarDays, Gauge, Plus, Trash2 } from "lucide-react"
import {
  registrarIndisponibilidad,
  eliminarIndisponibilidad,
} from "@/actions/mantenimiento-vehiculos"
import type {
  DiaRuteo,
  FlotaIndisponibilidad,
  MantenimientoRealizado,
  VehiculoTipo,
} from "@/types/database"

// Objetivo de disponibilidad de flota (de la planilla histórica: 98%).
const TARGET_DISP = 98

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const fmtMesLargo = (ym: string) => {
  const [y, m] = ym.split("-")
  return `${MESES[Number(m) - 1] ?? m} ${y}`
}
const pad = (n: number) => String(n).padStart(2, "0")
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
}

interface Props {
  mantenimientos: MantenimientoRealizado[]
  unidades: UnidadFlota[]
  diasRuteo: DiaRuteo[]
  indisponibilidades: FlotaIndisponibilidad[]
  puedeEditar: boolean
}

type Estado = "PMC" | "PMP" | "IND" | "DRT" | "DSP"

interface FilaDisp {
  dominio: string
  diasPeriodo: number
  pmc: number
  pmp: number
  ind: number
  drt: number
  dsp: number
  parado: number
  disponibles: number
  pctDisp: number | null
  pctUtil: number | null
  porDia: Map<number, Estado>
}

export function SeguimientoFlota({
  mantenimientos,
  unidades,
  diasRuteo,
  indisponibilidades,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())
  const [vista, setVista] = useState<"mes" | "dia">("mes")

  // Unidades de ruta (excluyo autoelevadores, que se miden distinto).
  const flota = useMemo(
    () => unidades.filter((u) => u.tipo !== "autoelevador"),
    [unidades]
  )

  const meses = useMemo(() => {
    const set = new Set<string>()
    set.add(hoyISO().slice(0, 7))
    for (const m of mantenimientos) {
      if (m.fecha) set.add(m.fecha.slice(0, 7))
      if (m.fuera_servicio_desde) set.add(m.fuera_servicio_desde.slice(0, 7))
    }
    for (const i of indisponibilidades) set.add(i.fecha_desde.slice(0, 7))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [mantenimientos, indisponibilidades])

  const [mesSel, setMesSel] = useState<string>(meses[0] ?? hoyISO().slice(0, 7))

  // Set de días ruteados: "DOMINIO|YYYY-MM-DD"
  const ruteoSet = useMemo(
    () => new Set(diasRuteo.map((r) => `${r.dominio}|${r.fecha}`)),
    [diasRuteo]
  )

  const calc = useMemo(() => {
    const [y, mm] = mesSel.split("-").map(Number)
    const diasDelMes = new Date(y, mm, 0).getDate()
    const hoy = hoyISO()
    const esMesActual = mesSel === hoy.slice(0, 7)
    const esFuturo = mesSel > hoy.slice(0, 7)
    const diasPeriodo = esFuturo ? 0 : esMesActual ? Number(hoy.slice(8, 10)) : diasDelMes

    // Paradas por OT (con período) por dominio.
    const paradas = new Map<string, { desde: string; hasta: string; causa: "PMC" | "PMP" }[]>()
    for (const m of mantenimientos) {
      if (!m.fuera_servicio_desde) continue
      const arr = paradas.get(m.dominio) ?? []
      arr.push({
        desde: m.fuera_servicio_desde,
        hasta: m.fuera_servicio_hasta || hoy,
        causa: m.tipo === "correctivo" ? "PMC" : "PMP",
      })
      paradas.set(m.dominio, arr)
    }
    // Indisponibilidades (IND) por dominio.
    const inds = new Map<string, { desde: string; hasta: string }[]>()
    for (const i of indisponibilidades) {
      const arr = inds.get(i.dominio) ?? []
      arr.push({ desde: i.fecha_desde, hasta: i.fecha_hasta })
      inds.set(i.dominio, arr)
    }

    const filas: FilaDisp[] = flota.map((u) => {
      const porDia = new Map<number, Estado>()
      const ps = paradas.get(u.dominio) ?? []
      const is = inds.get(u.dominio) ?? []
      for (let d = 1; d <= diasPeriodo; d++) {
        const fecha = `${mesSel}-${pad(d)}`
        // Prioridad: correctivo > preventivo > indisponible > (ruteó? DRT : DSP)
        let est: Estado | null = null
        for (const p of ps) {
          if (fecha >= p.desde && fecha <= p.hasta) {
            if (p.causa === "PMC") { est = "PMC"; break }
            est = "PMP"
          }
        }
        if (est !== "PMC") {
          if (est == null) {
            for (const i of is) {
              if (fecha >= i.desde && fecha <= i.hasta) { est = "IND"; break }
            }
          }
        }
        if (est == null) est = ruteoSet.has(`${u.dominio}|${fecha}`) ? "DRT" : "DSP"
        porDia.set(d, est)
      }
      let pmc = 0, pmp = 0, ind = 0, drt = 0, dsp = 0
      for (const e of porDia.values()) {
        if (e === "PMC") pmc++
        else if (e === "PMP") pmp++
        else if (e === "IND") ind++
        else if (e === "DRT") drt++
        else dsp++
      }
      const parado = pmc + pmp + ind
      const disponibles = drt + dsp
      const pctDisp = diasPeriodo > 0 ? (disponibles / diasPeriodo) * 100 : null
      const pctUtil = disponibles > 0 ? (drt / disponibles) * 100 : null
      return {
        dominio: u.dominio, diasPeriodo, pmc, pmp, ind, drt, dsp,
        parado, disponibles, pctDisp, pctUtil, porDia,
      }
    })

    const conDisp = filas.filter((f) => f.pctDisp != null)
    const flotaDisp = conDisp.length
      ? conDisp.reduce((a, f) => a + (f.pctDisp ?? 0), 0) / conDisp.length
      : null
    const totDisponibles = filas.reduce((a, f) => a + f.disponibles, 0)
    const totDrt = filas.reduce((a, f) => a + f.drt, 0)
    const flotaUtil = totDisponibles > 0 ? (totDrt / totDisponibles) * 100 : null
    const camionesConParada = filas.filter((f) => f.parado > 0).length

    return { diasDelMes, diasPeriodo, filas, flotaDisp, flotaUtil, camionesConParada }
  }, [mesSel, mantenimientos, indisponibilidades, flota, ruteoSet])

  const colorPct = (pct: number | null, target = TARGET_DISP) =>
    pct == null
      ? "text-slate-400"
      : pct >= target
        ? "text-emerald-600"
        : pct >= 90
          ? "text-amber-600"
          : "text-red-600"

  const claseDia = (est: Estado | undefined, fueraPeriodo: boolean) =>
    fueraPeriodo
      ? "bg-slate-100"
      : est === "PMC"
        ? "bg-red-500"
        : est === "PMP"
          ? "bg-amber-400"
          : est === "IND"
            ? "bg-slate-500"
            : est === "DRT"
              ? "bg-emerald-500"
              : "bg-sky-300"

  const indDelMes = useMemo(
    () =>
      indisponibilidades
        .filter((i) => i.fecha_desde.slice(0, 7) === mesSel || i.fecha_hasta.slice(0, 7) === mesSel)
        .sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde)),
    [indisponibilidades, mesSel]
  )

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Mes</p>
          <Select value={mesSel} onValueChange={(v) => v && setMesSel(v)}>
            <SelectTrigger className="w-48 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map((ym) => (
                <SelectItem key={ym} value={ym} className="capitalize">
                  {fmtMesLargo(ym)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          <Button size="sm" variant={vista === "mes" ? "default" : "ghost"} onClick={() => setVista("mes")}>
            <Gauge className="mr-1 size-4" /> Por mes
          </Button>
          <Button size="sm" variant={vista === "dia" ? "default" : "ghost"} onClick={() => setVista("dia")}>
            <CalendarDays className="mr-1 size-4" /> Por día
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Disponibilidad de flota" sub={`Objetivo ${TARGET_DISP}%`}>
          <span className={cn("text-2xl font-bold", colorPct(calc.flotaDisp))}>
            {calc.flotaDisp == null ? "—" : `${calc.flotaDisp.toFixed(1)}%`}
          </span>
        </KpiCard>
        <KpiCard label="Utilización de flota" sub="De los días disponibles, % que ruteó">
          <span className={cn("text-2xl font-bold", colorPct(calc.flotaUtil, 0))}>
            {calc.flotaUtil == null ? "—" : `${calc.flotaUtil.toFixed(1)}%`}
          </span>
        </KpiCard>
        <KpiCard label="Camiones con paradas" sub={`de ${calc.filas.length} unidades`}>
          <span className="text-2xl font-bold text-slate-900">{calc.camionesConParada}</span>
        </KpiCard>
        <KpiCard label="Días del período" sub={`de ${calc.diasDelMes} del mes`}>
          <span className="text-2xl font-bold text-slate-900">{calc.diasPeriodo}</span>
        </KpiCard>
      </div>

      {vista === "mes" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Disponibilidad y utilización por unidad</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2">Unidad</th>
                  <th className="text-right">Días</th>
                  <th className="text-right">Correctivo</th>
                  <th className="text-right">Preventivo</th>
                  <th className="text-right">Indisp.</th>
                  <th className="text-right">Ruteó</th>
                  <th className="text-right">% Disp.</th>
                  <th className="text-right">% Util.</th>
                </tr>
              </thead>
              <tbody>
                {calc.filas.map((f) => (
                  <tr key={f.dominio} className="border-b last:border-0">
                    <td className="py-2 font-medium">{f.dominio}</td>
                    <td className="text-right tabular-nums text-slate-600">{f.diasPeriodo}</td>
                    <td className="text-right tabular-nums text-red-600">{f.pmc || "—"}</td>
                    <td className="text-right tabular-nums text-amber-600">{f.pmp || "—"}</td>
                    <td className="text-right tabular-nums text-slate-600">{f.ind || "—"}</td>
                    <td className="text-right tabular-nums text-emerald-700">{f.drt || "—"}</td>
                    <td className={cn("text-right font-semibold tabular-nums", colorPct(f.pctDisp))}>
                      {f.pctDisp == null ? "—" : `${f.pctDisp.toFixed(1)}%`}
                    </td>
                    <td className="text-right tabular-nums text-slate-700">
                      {f.pctUtil == null ? "—" : `${f.pctUtil.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Leyendas />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calendario de disponibilidad</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="sticky left-0 bg-white px-2 py-1 text-left">Unidad</th>
                  {Array.from({ length: calc.diasDelMes }, (_, i) => i + 1).map((d) => (
                    <th key={d} className="w-6 px-0 text-center font-normal">{d}</th>
                  ))}
                  <th className="px-2 text-right">% Disp.</th>
                </tr>
              </thead>
              <tbody>
                {calc.filas.map((f) => (
                  <tr key={f.dominio}>
                    <td className="sticky left-0 bg-white px-2 py-0.5 font-medium whitespace-nowrap">
                      {f.dominio}
                    </td>
                    {Array.from({ length: calc.diasDelMes }, (_, i) => i + 1).map((d) => {
                      const est = f.porDia.get(d)
                      const fuera = d > calc.diasPeriodo
                      const txt =
                        fuera ? "—"
                          : est === "PMC" ? "parado (correctivo)"
                            : est === "PMP" ? "parado (preventivo)"
                              : est === "IND" ? "indisponible"
                                : est === "DRT" ? "disponible y ruteó"
                                  : "disponible sin uso"
                      return (
                        <td key={d} className="p-px">
                          <div className={cn("h-5 w-6 rounded-sm", claseDia(est, fuera))}
                            title={`${f.dominio} · día ${d}: ${txt}`} />
                        </td>
                      )
                    })}
                    <td className={cn("px-2 text-right font-semibold tabular-nums", colorPct(f.pctDisp))}>
                      {f.pctDisp == null ? "—" : `${Math.round(f.pctDisp)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Leyendas />
          </CardContent>
        </Card>
      )}

      {/* Indisponibilidades (no mantenimiento) */}
      <IndisponibilidadSection
        unidades={flota}
        items={indDelMes}
        puedeEditar={puedeEditar}
        onChange={refresh}
      />
    </div>
  )
}

function KpiCard({
  label, sub, children,
}: { label: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{children}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function Leyendas() {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
      <Leyenda clase="bg-emerald-500" txt="Disponible y ruteó (DRT)" />
      <Leyenda clase="bg-sky-300" txt="Disponible sin uso (DSP)" />
      <Leyenda clase="bg-red-500" txt="Parado correctivo (PMC)" />
      <Leyenda clase="bg-amber-400" txt="Parado preventivo (PMP)" />
      <Leyenda clase="bg-slate-500" txt="Indisponible (IND)" />
      <Leyenda clase="bg-slate-100" txt="Fuera del período" />
    </div>
  )
}

function Leyenda({ clase, txt }: { clase: string; txt: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", clase)} />
      <span>{txt}</span>
    </span>
  )
}

function IndisponibilidadSection({
  unidades, items, puedeEditar, onChange,
}: {
  unidades: UnidadFlota[]
  items: FlotaIndisponibilidad[]
  puedeEditar: boolean
  onChange: () => void
}) {
  const [abrir, setAbrir] = useState(false)
  const [dominio, setDominio] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const res = await registrarIndisponibilidad({
      dominio, fecha_desde: desde, fecha_hasta: hasta, motivo,
    })
    setSaving(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success("Indisponibilidad registrada")
    setDominio(""); setDesde(""); setHasta(""); setMotivo(""); setAbrir(false)
    onChange()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">
          Indisponibilidades sin mantenimiento (IND)
        </CardTitle>
        {puedeEditar && (
          <Button variant="outline" size="sm" onClick={() => setAbrir((v) => !v)}>
            <Plus className="mr-1 size-4" /> Registrar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          Paradas que NO son de mantenimiento (sin chofer, siniestro, documentación, etc.).
          Cuentan como no disponible, aparte de las órdenes de trabajo.
        </p>

        {abrir && puedeEditar && (
          <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <Label className="text-xs text-slate-500">Unidad</Label>
              <Select value={dominio} onValueChange={(v) => v && setDominio(v)}>
                <SelectTrigger><SelectValue placeholder="Dominio" /></SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.dominio} value={u.dominio}>{u.dominio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Motivo</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej. sin chofer" />
            </div>
            <div className="sm:col-span-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAbrir(false)}>Cancelar</Button>
              <Button size="sm" onClick={guardar} disabled={saving || !dominio || !desde || !hasta}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Sin indisponibilidades registradas en el mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Unidad</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Motivo</th>
                {puedeEditar && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{i.dominio}</td>
                  <td className="text-slate-600">{fmtFecha(i.fecha_desde)}</td>
                  <td className="text-slate-600">{fmtFecha(i.fecha_hasta)}</td>
                  <td className="text-slate-600">{i.motivo || "—"}</td>
                  {puedeEditar && (
                    <td className="text-right">
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 text-slate-400 hover:text-red-600"
                        onClick={async () => {
                          const res = await eliminarIndisponibilidad({ id: i.id })
                          if ("error" in res) toast.error(res.error)
                          else { toast.success("Eliminada"); onChange() }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
