"use client"

import { useMemo, useState, useTransition } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { CalendarDays, ChevronLeft, ChevronRight, Gauge, Plus, Trash2 } from "lucide-react"
import { KpiCard, type EstadoKpi } from "./_components/kpi-card"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { usePaletaViz } from "./_components/paleta-viz"
import { TooltipBarras } from "./_components/tooltip-barras"
import {
  registrarIndisponibilidad,
  eliminarIndisponibilidad,
} from "@/actions/mantenimiento-vehiculos"
import type {
  DiaRuteo,
  FlotaIndisponibilidad,
  MantenimientoRealizado,
} from "@/types/database"
import {
  TARGET_DISP,
  calcularDisponibilidadMes,
  flotaDeRuta,
  ruteoSetDe,
  type EstadoDiaFlota as Estado,
  type UnidadFlota,
} from "@/lib/vehiculos/disponibilidad-flota"

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

interface Props {
  mantenimientos: MantenimientoRealizado[]
  unidades: UnidadFlota[]
  diasRuteo: DiaRuteo[]
  indisponibilidades: FlotaIndisponibilidad[]
  puedeEditar: boolean
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
  /**
   * Abre en "Por día": el calendario pinta cada día de cada unidad con su color
   * (ruteó, correctivo, preventivo, indisponible) y se lee de un vistazo —qué
   * día paró cada camión—, mientras que "Por mes" son totales que hay que
   * interpretar. Los cuatro KPI están arriba de las dos vistas, así que el
   * porcentaje del mes se sigue viendo igual.
   */
  const [vista, setVista] = useState<"mes" | "dia">("dia")

  const flota = useMemo(() => flotaDeRuta(unidades), [unidades])

  /**
   * Meses que ofrece el filtro: TODOS los del historial, del más viejo con dato
   * hasta el actual, sin huecos.
   *
   * Antes la lista eran los meses que tenían OT o indisponibilidad cargada, y un
   * mes sin ninguna de las dos quedaba afuera del selector: justamente el mes en
   * que la flota no paró nunca —el 100 % de disponibilidad— no se podía mirar.
   */
  const meses = useMemo(() => {
    const conDato: string[] = [hoyISO().slice(0, 7)]
    for (const m of mantenimientos) {
      if (m.fecha) conDato.push(m.fecha.slice(0, 7))
      if (m.fuera_servicio_desde) conDato.push(m.fuera_servicio_desde.slice(0, 7))
    }
    for (const i of indisponibilidades) conDato.push(i.fecha_desde.slice(0, 7))

    const desde = conDato.reduce((a, b) => (b < a ? b : a))
    const hasta = conDato.reduce((a, b) => (b > a ? b : a)) // una OT programada puede caer el mes que viene
    const out: string[] = []
    let y = Number(desde.slice(0, 4))
    let m = Number(desde.slice(5, 7))
    for (let i = 0; i < 600; i++) {
      const ym = `${y}-${pad(m)}`
      out.push(ym)
      if (ym >= hasta) break
      m++
      if (m > 12) { m = 1; y++ }
    }
    return out.reverse()
  }, [mantenimientos, indisponibilidades])

  const [mesSel, setMesSel] = useState<string>(meses[0] ?? hoyISO().slice(0, 7))
  // `meses` está ordenado del más nuevo al más viejo: el anterior es el que sigue.
  const iMes = meses.indexOf(mesSel)
  const mesAnterior = iMes >= 0 ? meses[iMes + 1] : undefined
  const mesSiguiente = iMes > 0 ? meses[iMes - 1] : undefined
  const paleta = usePaletaViz()

  // Set de días ruteados: "DOMINIO|YYYY-MM-DD"
  const ruteoSet = useMemo(() => ruteoSetDe(diasRuteo), [diasRuteo])

  const calc = useMemo(
    () =>
      calcularDisponibilidadMes(
        mesSel,
        flota,
        mantenimientos,
        indisponibilidades,
        ruteoSet,
        hoyISO()
      ),
    [mesSel, mantenimientos, indisponibilidades, flota, ruteoSet]
  )

  const colorPct = (pct: number | null, target = TARGET_DISP) =>
    pct == null
      ? "text-muted-foreground"
      : pct >= target
        ? "text-emerald-600 dark:text-emerald-400"
        : pct >= 90
          ? "text-amber-600 dark:text-amber-400"
          : "text-destructive"

  // Pastilla de color para el % (disponibilidad).
  const pillDisp = (pct: number | null) =>
    pct == null
      ? "bg-muted text-muted-foreground"
      : pct >= TARGET_DISP
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        : pct >= 90
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-destructive/10 text-destructive"

  // Estado del KPI de disponibilidad: el target es el del cálculo (TARGET_DISP).
  const estadoDisp: EstadoKpi =
    calc.flotaDisp == null
      ? "neutro"
      : calc.flotaDisp >= TARGET_DISP
        ? "ok"
        : calc.flotaDisp >= 95
          ? "alerta"
          : "critico"

  // Los cuadraditos del calendario son una leyenda cromática deliberada: los
  // colores del semáforo se mantienen; el resto va a tokens.
  const claseDia = (est: Estado | undefined, fueraPeriodo: boolean) =>
    fueraPeriodo
      ? "bg-muted"
      : est === "PMC"
        ? "bg-red-500"
        : est === "PMP"
          ? "bg-amber-400"
          : est === "IND"
            ? "bg-slate-500"
            : est === "DRT"
              ? "bg-emerald-500"
              : est === "DSP"
                ? "bg-sky-300"
                : "border border-dashed border-border bg-card" // LIB (no laboral)

  // Sólo las unidades que estuvieron paradas: una barra en cero por camión sano
  // llena el gráfico de filas vacías y esconde a los tres que importan.
  const paradasPorUnidad = useMemo(
    () =>
      calc.filas
        .filter((f) => f.pmc + f.pmp + f.ind > 0)
        .map((f) => ({
          dominio: f.dominio,
          pmc: f.pmc,
          pmp: f.pmp,
          ind: f.ind,
          parado: f.parado,
        }))
        .sort((a, b) => b.parado - a.parado || a.dominio.localeCompare(b.dominio)),
    [calc.filas]
  )

  /**
   * Los cuatro KPI de arriba eran tarjetas mudas. Ahora cada una abre la vista
   * donde ese número se ve unidad por unidad y baja hasta el cuadro: el detalle
   * puede estar en la otra solapa, por eso el scroll espera al render.
   */
  const irA = (v: "mes" | "dia", anclaId: string) => {
    setVista(v)
    requestAnimationFrame(() => {
      document.getElementById(anclaId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const indDelMes = useMemo(
    () =>
      indisponibilidades
        .filter((i) => i.fecha_desde.slice(0, 7) === mesSel || i.fecha_hasta.slice(0, 7) === mesSel)
        .sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde)),
    [indisponibilidades, mesSel]
  )

  return (
    <Tabs
      value={vista}
      onValueChange={(v) => setVista(v as "mes" | "dia")}
      className="gap-6"
    >
      <DpoSeccionCinta seccionId="seguimiento" />

      {/* Controles.
          El mes se cambia con las flechas o con la lista. Las flechas no son un
          adorno: la lista se abre con el mes elegido encima del botón, y más de
          una vez el click volvió a caer sobre ese mismo mes —se elegía de nuevo
          el mes que ya estaba y parecía que el filtro no hacía nada—. Con «/» un
          click es un mes, sin ambigüedad. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Mes</p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => mesAnterior && setMesSel(mesAnterior)}
              disabled={!mesAnterior}
              title="Mes anterior"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Select value={mesSel} onValueChange={(v) => v && setMesSel(v)}>
              <SelectTrigger className="w-44 capitalize">
                <SelectValue />
              </SelectTrigger>
              {/* alignItemWithTrigger=false: la lista baja debajo del botón como
                  un desplegable normal, en vez de abrirse encima con el mes
                  actual tapando el botón. */}
              <SelectContent alignItemWithTrigger={false}>
                {meses.map((ym) => (
                  <SelectItem key={ym} value={ym} className="capitalize">
                    {fmtMesLargo(ym)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => mesSiguiente && setMesSel(mesSiguiente)}
              disabled={!mesSiguiente}
              title="Mes siguiente"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <TabsList>
          <TabsTrigger value="dia">
            <CalendarDays aria-hidden /> Por día
          </TabsTrigger>
          <TabsTrigger value="mes">
            <Gauge aria-hidden /> Por mes
          </TabsTrigger>
        </TabsList>
      </div>

      {/* KPIs — cada uno lleva al cuadro donde ese número se abre por unidad */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Disponibilidad de flota"
          valor={calc.flotaDisp == null ? null : `${calc.flotaDisp.toFixed(1)}%`}
          sub={`${fmtMesLargo(mesSel)} · objetivo ${TARGET_DISP}% · click para verla por unidad`}
          estado={estadoDisp}
          dpo="2.1"
          onClick={() => irA("mes", "tabla-disp-unidad")}
        />
        <KpiCard
          label="Utilización de flota"
          valor={calc.flotaUtil == null ? null : `${calc.flotaUtil.toFixed(1)}%`}
          sub={`${fmtMesLargo(mesSel)} · ruteados ÷ días laborales disp. · click para verla por unidad`}
          dpo="2.1"
          onClick={() => irA("mes", "tabla-disp-unidad")}
        />
        <KpiCard
          label="Camiones con paradas"
          valor={calc.camionesConParada}
          sub={`de ${calc.filas.length} unidades · click para ver cuáles`}
          onClick={() =>
            irA("mes", paradasPorUnidad.length > 0 ? "paradas-por-unidad" : "tabla-disp-unidad")
          }
        />
        <KpiCard
          label="Días laborales"
          valor={calc.diasLaborales}
          sub={`de ${calc.diasPeriodo} del período · click para ver el calendario`}
          onClick={() => irA("dia", "calendario-disp")}
        />
      </div>

      <TabsContent value="mes" className="space-y-6">
        {paradasPorUnidad.length > 0 && (
          <Card id="paradas-por-unidad">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Días fuera de servicio por unidad
                <span className="text-sm font-normal capitalize text-muted-foreground">
                  · {fmtMesLargo(mesSel)}
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                El largo de la barra es el total de días parado y cada tramo
                dice por qué: el preventivo es parada planificada y no se lee
                igual que la rotura.
              </p>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  height: Math.max(200, paradasPorUnidad.length * 38 + 60),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={paradasPorUnidad}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    barCategoryGap="28%"
                  >
                    <CartesianGrid
                      horizontal={false}
                      className="stroke-border"
                      strokeOpacity={0.5}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      type="category"
                      dataKey="dominio"
                      width={84}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    />
                    <RTooltip
                      cursor={{ className: "fill-muted", opacity: 0.4 }}
                      content={<TooltipBarras totalLabel="Días parado" sufijo=" d" />}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="pmc"
                      stackId="dias"
                      name="Correctivo"
                      fill={paleta.paradas.correctivo}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="pmp"
                      stackId="dias"
                      name="Preventivo"
                      fill={paleta.paradas.preventivo}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="ind"
                      stackId="dias"
                      name="Indisponible"
                      fill={paleta.paradas.indisponible}
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card id="tabla-disp-unidad">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Disponibilidad y utilización por unidad
              <span className="text-sm font-normal capitalize text-muted-foreground">
                · {fmtMesLargo(mesSel)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="rounded-l-md px-3 py-2">Unidad</th>
                  <th className="px-2">Modelo</th>
                  <th className="px-2 text-center">Año</th>
                  <th className="px-2 text-right">Días</th>
                  <th className="px-2 text-right text-destructive">Correctivo</th>
                  <th className="px-2 text-right text-amber-600 dark:text-amber-400">Preventivo</th>
                  <th className="px-2 text-right">Indisp.</th>
                  <th className="px-2 text-right text-emerald-600 dark:text-emerald-400">Ruteó</th>
                  <th className="px-2 text-right">% Disp.</th>
                  <th className="rounded-r-md px-3 text-right">% Util.</th>
                </tr>
              </thead>
              <tbody>
                {calc.filas.map((f, i) => (
                  <tr
                    key={f.dominio}
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}
                  >
                    <td className="px-3 py-2 font-semibold text-foreground">{f.dominio}</td>
                    <td className="px-2 text-muted-foreground">{f.modelo || "—"}</td>
                    <td className="px-2 text-center tabular-nums text-muted-foreground">{f.anio ?? "—"}</td>
                    <td className="px-2 text-right tabular-nums text-muted-foreground">{f.diasPeriodo}</td>
                    <td className="px-2 text-right tabular-nums text-destructive">{f.pmc || "—"}</td>
                    <td className="px-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{f.pmp || "—"}</td>
                    <td className="px-2 text-right tabular-nums text-muted-foreground">{f.ind || "—"}</td>
                    <td className="px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{f.drt || "—"}</td>
                    <td className="px-2 text-right">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                          pillDisp(f.pctDisp)
                        )}
                      >
                        {f.pctDisp == null ? "—" : `${f.pctDisp.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="px-3 text-right font-medium tabular-nums text-foreground">
                      {f.pctUtil == null ? "—" : `${f.pctUtil.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Leyendas />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="dia">
        <Card id="calendario-disp">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Calendario de disponibilidad
              <span className="text-sm font-normal capitalize text-muted-foreground">
                · {fmtMesLargo(mesSel)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="sticky left-0 bg-card px-2 py-1 text-left">Unidad</th>
                  {Array.from({ length: calc.diasDelMes }, (_, i) => i + 1).map((d) => (
                    <th key={d} className="w-6 px-0 text-center font-normal">{d}</th>
                  ))}
                  <th className="px-2 text-right">% Disp.</th>
                </tr>
              </thead>
              <tbody>
                {calc.filas.map((f) => (
                  <tr key={f.dominio}>
                    <td
                      className="sticky left-0 bg-card px-2 py-0.5 font-medium whitespace-nowrap"
                      title={[f.modelo, f.anio].filter(Boolean).join(" · ")}
                    >
                      {f.dominio}
                      {(f.modelo || f.anio) && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          {f.modelo ?? ""}{f.anio ? ` ${f.anio}` : ""}
                        </span>
                      )}
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
                                  : est === "DSP" ? "disponible sin uso"
                                    : "día no laboral"
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
      </TabsContent>

      {/* Indisponibilidades (no mantenimiento) */}
      <IndisponibilidadSection
        unidades={flota}
        items={indDelMes}
        puedeEditar={puedeEditar}
        onChange={refresh}
      />
    </Tabs>
  )
}

function Leyendas() {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <Leyenda clase="bg-emerald-500" txt="Disponible y ruteó (DRT)" />
      <Leyenda clase="bg-sky-300" txt="Disponible sin uso (DSP)" />
      <Leyenda clase="bg-red-500" txt="Parado correctivo (PMC)" />
      <Leyenda clase="bg-amber-400" txt="Parado preventivo (PMP)" />
      <Leyenda clase="bg-slate-500" txt="Indisponible (IND)" />
      <Leyenda clase="border border-dashed border-border bg-card" txt="Día no laboral (no cuenta utilización)" />
      <Leyenda clase="bg-muted" txt="Fuera del período" />
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
        <p className="text-xs text-muted-foreground">
          Paradas que NO son de mantenimiento (sin chofer, siniestro, documentación, etc.).
          Cuentan como no disponible, aparte de las órdenes de trabajo.
        </p>

        {abrir && puedeEditar && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted p-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <Label className="text-xs text-muted-foreground">Unidad</Label>
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
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Motivo</Label>
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
          <p className="text-sm text-muted-foreground">Sin indisponibilidades registradas en el mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
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
                  <td className="text-muted-foreground">{fmtFecha(i.fecha_desde)}</td>
                  <td className="text-muted-foreground">{fmtFecha(i.fecha_hasta)}</td>
                  <td className="text-muted-foreground">{i.motivo || "—"}</td>
                  {puedeEditar && (
                    <td className="text-right">
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
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
