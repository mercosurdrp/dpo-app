"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PROF_OBJETIVO_MM, type PuntoEvolucion } from "@/lib/vehiculos/desgaste-neumaticos"
import { POSICION_AUXILIO } from "@/lib/vehiculos/neumaticos-layout"
import { PROF_ALERTA_MM } from "@/lib/flota/neumaticos-control"

// Evolución de la profundidad ronda por ronda.
//
// Por qué este gráfico y no un "desgaste del mes": el dibujo se mide una vez
// por mes, y en un mes un camión de la flota hace entre 1.800 y 4.700 km. Con
// un calibre que lee de a 0,5 mm, la TASA de un solo mes es ruido — restringido
// a agosto/2026 el cálculo devuelve cero cubiertas. La profundidad medida, en
// cambio, es un dato duro de cada ronda: se ve la pendiente y se comparan las
// posiciones entre sí, que es lo que el taller necesita decidir.
//
// La serie va por POSICIÓN, no por cubierta: lo que se mira es "cómo viene la
// 1I de este camión". Un salto hacia arriba significa que en esa posición entró
// goma nueva o recapada.

const COLORES = [
  "#0EA5E9", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444", "#14B8A6",
  "#F97316", "#6366F1", "#84CC16", "#EC4899", "#06B6D4", "#A16207",
]

const fmtFechaCorta = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

const fmtMes = (ym: string) =>
  new Date(ym + "-01T12:00:00").toLocaleDateString("es-AR", { month: "short", year: "2-digit" })

/** Valor del selector para ver la flota entera en vez de una unidad. */
const TODAS = "__todas__"

const promedio = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length

export function EvolucionProfundidad({
  puntos,
  dominioSel,
  onIrAUnidad,
}: {
  puntos: PuntoEvolucion[]
  dominioSel?: string
  onIrAUnidad?: (dominio: string) => void
}) {
  const unidades = useMemo(
    () =>
      [...new Set(puntos.map((p) => p.dominio).filter((d): d is string => !!d))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [puntos]
  )

  // La unidad del diagrama manda; si esa no tiene mediciones, la primera que sí.
  const [override, setOverride] = useState<string | null>(null)
  const unidad =
    override ??
    (dominioSel && unidades.includes(dominioSel) ? dominioSel : (unidades[0] ?? null))
  const todas = unidad === TODAS

  /**
   * Vista de flota: una línea por UNIDAD, con el promedio de dibujo de sus
   * cubiertas en cada mes.
   *
   * 🚨 Va por mes y no por fecha de ronda, al revés que la vista de una unidad.
   * Cada camión se mide un día distinto —julio/2026 tuvo rondas el 10, el 20, el
   * 27, el 28 y el 29—, así que con el eje por fecha exacta cada unidad aporta
   * un punto suelto en su propia columna y ninguna línea se conecta con la
   * siguiente. Agrupando por mes las rondas caen en la misma columna y se ve la
   * pendiente, que es para lo que sirve la vista.
   *
   * El auxilio queda afuera: viaja pero no apoya, así que su dibujo no baja y
   * levantaría el promedio de la unidad.
   */
  const flota = useMemo(() => {
    if (!todas) return { datos: [], series: [] as string[] }
    const utiles = puntos.filter((p) => p.dominio && p.posicion !== POSICION_AUXILIO)
    const meses = [...new Set(utiles.map((p) => p.fecha.slice(0, 7)))].sort()
    const doms = [...new Set(utiles.map((p) => p.dominio!))].sort((a, b) => a.localeCompare(b))
    const datos = meses.map((mes) => {
      const fila: Record<string, string | number | null> = { fecha: fmtMes(mes) }
      for (const d of doms) {
        const ns = utiles
          .filter((p) => p.dominio === d && p.fecha.slice(0, 7) === mes)
          .map((p) => p.profundidad_mm)
        fila[d] = ns.length ? Math.round(promedio(ns) * 10) / 10 : null
      }
      return fila
    })
    return { datos, series: doms }
  }, [puntos, todas])

  const { datos, series } = useMemo(() => {
    const delaUnidad = puntos.filter((p) => p.dominio === unidad)
    const fechas = [...new Set(delaUnidad.map((p) => p.fecha))].sort()
    const posiciones = [...new Set(delaUnidad.map((p) => p.posicion ?? "—"))].sort((a, b) =>
      a.localeCompare(b)
    )
    const datos = fechas.map((fecha) => {
      const fila: Record<string, string | number | null> = { fecha: fmtFechaCorta(fecha) }
      for (const pos of posiciones) {
        const p = delaUnidad.find((x) => x.fecha === fecha && (x.posicion ?? "—") === pos)
        fila[pos] = p ? p.profundidad_mm : null
      }
      return fila
    })
    return { datos, series: posiciones }
  }, [puntos, unidad])

  const datosEnPantalla = todas ? flota.datos : datos
  const seriesEnPantalla = todas ? flota.series : series

  if (unidades.length === 0)
    return <p className="text-sm text-muted-foreground">Todavía no hay profundidades cargadas.</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {todas ? (
            <>
              Una línea por unidad: el <span className="font-medium text-foreground">promedio</span>{" "}
              de dibujo de sus cubiertas en cada mes, sin contar el auxilio. Sirve para ver qué
              camión se está quedando sin goma; para saber cuál cubierta, elegí la unidad.
            </>
          ) : (
            <>
              Profundidad medida en cada ronda, por posición. Una línea que{" "}
              <span className="font-medium text-foreground">sube</span> es goma nueva o recapada
              montada en esa posición, no un error.
            </>
          )}
        </p>
        <Select
          value={unidad ?? ""}
          onValueChange={(v) => {
            if (!v) return
            setOverride(v)
            // "Todas" no es una unidad: no hay diagrama al que saltar.
            if (v !== TODAS) onIrAUnidad?.(v)
          }}
        >
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las unidades</SelectItem>
            {unidades.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {datosEnPantalla.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          {todas
            ? "Hay una sola ronda cargada: con un punto no hay evolución que mostrar."
            : unidad + " tiene una sola ronda cargada: con un punto no hay evolución que mostrar."}
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datosEnPantalla} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="fecha" fontSize={11} />
              <YAxis
                fontSize={11}
                unit=" mm"
                width={56}
                domain={[0, (max: number) => Math.ceil(max + 1)]}
              />
              <Tooltip
                formatter={(v) => (v == null ? "—" : `${Number(v).toFixed(1)} mm`)}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* Las dos líneas de decisión, las mismas del KPI de conformidad. */}
              <ReferenceLine
                y={PROF_ALERTA_MM}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                label={{ value: `${PROF_ALERTA_MM} mm · alerta`, position: "right", fontSize: 10 }}
              />
              <ReferenceLine
                y={PROF_OBJETIVO_MM}
                stroke="#EF4444"
                strokeDasharray="4 4"
                label={{ value: `${PROF_OBJETIVO_MM} mm · cambio`, position: "right", fontSize: 10 }}
              />
              {seriesEnPantalla.map((pos, i) => (
                <Line
                  key={pos}
                  type="monotone"
                  dataKey={pos}
                  name={pos}
                  stroke={COLORES[i % COLORES.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  // Sin esto, una posición que no se midió en una ronda parte la
                  // línea en dos y parece que la cubierta se cambió.
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
