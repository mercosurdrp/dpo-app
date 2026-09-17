"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TooltipContentProps } from "recharts"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PROF_ALERTA_MM } from "@/lib/flota/neumaticos-control"
import { PROF_OBJETIVO_MM, type FilaDesgaste } from "@/lib/vehiculos/desgaste-neumaticos"

import { usePaletaViz } from "./paleta-viz"

// Vida de la cubierta: la profundidad medida contra los KM, no contra el mes.
//
// Por qué hace falta además de la evolución mensual: el mes no es lo que gasta
// la goma, los km sí. Dos camiones medidos el mismo día pueden haber hecho
// 1.800 y 4.700 km, así que en el eje de tiempo las pendientes no son
// comparables — en el eje de km sí lo son, y encima la recta se prolonga hasta
// el límite de circulación y contesta la pregunta del taller: cuántos km le
// quedan a esta goma.
//
// El eje X son los km RECORRIDOS desde la primera medición de ronda de cada
// cubierta, no el odómetro de la unidad: así arrancan todas en cero y se
// comparan entre sí aunque estén en camiones con odómetros muy distintos.

const fmtKm = (v: number) => new Intl.NumberFormat("es-AR").format(Math.round(v))

const fmtKmEje = (v: number) =>
  v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v))

const fmtMm = (v: number) => v.toFixed(2).replace(".", ",")

const fmtFecha = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

const fmtMes = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" })

/** Un punto dibujado: medido (trae fecha) o proyectado (no la trae). */
interface PuntoSerie {
  km: number
  prof: number
  fecha?: string
}

interface SerieCubierta {
  id: string
  /** "2DE · 83" — posición y número de fuego, que es como se la nombra. */
  nombre: string
  detalle: string
  color: string
  medidos: PuntoSerie[]
  /** Del último punto medido hasta el límite de cambio, al ritmo medido. */
  proyeccion: PuntoSerie[] | null
  mmPorMilKm: number | null
  kmHastaCambio: number | null
  fechaCambio: string | null
  puntos: number
}

export function VidaCubierta({
  filas,
  dominioSel,
  onIrAUnidad,
}: {
  filas: FilaDesgaste[]
  /** Unidad abierta en el diagrama: es la que se muestra por defecto. */
  dominioSel?: string
  onIrAUnidad?: (dominio: string) => void
}) {
  const paleta = usePaletaViz()
  const [override, setOverride] = useState<string | null>(null)

  /** Sólo las que tienen dos o más mediciones de ronda con km: son las únicas
   *  que se pueden dibujar contra el eje de km. */
  const dibujables = useMemo(
    () => filas.filter((f) => f.tramoPuntos.length >= 2 && f.cubierta.dominio),
    [filas]
  )

  const unidades = useMemo(
    () =>
      [...new Set(dibujables.map((f) => f.cubierta.dominio as string))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [dibujables]
  )

  const unidad =
    override ??
    (dominioSel && unidades.includes(dominioSel) ? dominioSel : (unidades[0] ?? null))

  const series = useMemo<SerieCubierta[]>(() => {
    if (!unidad) return []
    return dibujables
      .filter((f) => f.cubierta.dominio === unidad)
      .sort((a, b) => (a.cubierta.posicion ?? "").localeCompare(b.cubierta.posicion ?? ""))
      .map((f, i) => {
        const km0 = f.tramoPuntos[0].km
        const medidos: PuntoSerie[] = f.tramoPuntos.map((p) => ({
          km: p.km - km0,
          prof: p.prof,
          fecha: p.fecha,
        }))
        const ultimo = medidos[medidos.length - 1]
        // La punteada va del último punto medido al límite de cambio, y su
        // largo es el mismo `kmHastaCambio` que muestra la tabla de arriba: un
        // solo número para la misma pregunta.
        const proyeccion =
          f.kmHastaCambio != null && f.kmHastaCambio > 0 && ultimo.prof > PROF_OBJETIVO_MM
            ? [
                { km: ultimo.km, prof: ultimo.prof },
                { km: ultimo.km + f.kmHastaCambio, prof: PROF_OBJETIVO_MM },
              ]
            : null
        const pos = f.cubierta.posicion ?? "—"
        return {
          id: f.neumatico_id,
          nombre: f.cubierta.numero ? `${pos} · ${f.cubierta.numero}` : pos,
          detalle: [f.cubierta.marca, f.cubierta.tipo === "recapado" ? "recapada" : "nueva"]
            .filter(Boolean)
            .join(" · "),
          color: paleta.serie(i),
          medidos,
          proyeccion,
          mmPorMilKm: f.mmPorMilKm,
          kmHastaCambio: f.kmHastaCambio,
          fechaCambio: f.fechaCambio,
          puntos: f.puntos,
        }
      })
  }, [dibujables, unidad, paleta])

  const maxKm = useMemo(() => {
    let max = 0
    for (const s of series) {
      const fin = s.proyeccion
        ? s.proyeccion[s.proyeccion.length - 1].km
        : s.medidos[s.medidos.length - 1].km
      if (fin > max) max = fin
    }
    return Math.max(1000, Math.ceil(max / 1000) * 1000)
  }, [series])

  const maxMm = useMemo(() => {
    let max = 0
    for (const s of series) for (const p of s.medidos) if (p.prof > max) max = p.prof
    return Math.ceil(max + 1)
  }, [series])

  if (unidades.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        Todavía ninguna cubierta tiene dos mediciones de ronda con km: sin dos puntos no hay
        recta que dibujar contra el eje de km.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-xl text-xs text-muted-foreground">
          Cada línea es una cubierta de la unidad: los puntos son las profundidades medidas en
          la ronda y la <span className="font-medium text-foreground">punteada</span> es lo que
          queda al ritmo medido, hasta los {PROF_OBJETIVO_MM} mm de cambio. El eje son los km
          recorridos desde su primera medición, así que las pendientes se comparan entre sí.
        </p>
        <Select
          value={unidad ?? ""}
          onValueChange={(v) => {
            if (!v) return
            setOverride(v)
            onIrAUnidad?.(v)
          }}
        >
          <SelectTrigger className="h-8 w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unidades.map((u) => {
              const n = dibujables.filter((f) => f.cubierta.dominio === u).length
              return (
                <SelectItem key={u} value={u}>
                  {u} ({n})
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 8, right: 76, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              type="number"
              dataKey="km"
              domain={[0, maxKm]}
              tickFormatter={fmtKmEje}
              fontSize={11}
              allowDecimals={false}
              height={38}
              label={{
                value: "km recorridos desde la primera medición",
                position: "insideBottom",
                offset: -2,
                fontSize: 10,
              }}
            />
            <YAxis
              type="number"
              domain={[0, maxMm]}
              unit=" mm"
              fontSize={11}
              width={56}
              allowDecimals={false}
            />
            <Tooltip content={<TooltipVida />} />
            {/* Las dos líneas de decisión, las mismas del KPI de conformidad. */}
            <ReferenceLine
              y={PROF_ALERTA_MM}
              stroke="#F59E0B"
              strokeDasharray="4 4"
              label={{
                value: `${PROF_ALERTA_MM} mm · alerta`,
                position: "right",
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={PROF_OBJETIVO_MM}
              stroke="#EF4444"
              strokeDasharray="4 4"
              label={{
                value: `${PROF_OBJETIVO_MM} mm · cambio`,
                position: "right",
                fontSize: 10,
              }}
            />
            {series.map((s) => (
              <Line
                key={s.id}
                data={s.medidos}
                dataKey="prof"
                name={s.nombre}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
            {series
              .filter((s) => s.proyeccion)
              .map((s) => (
                <Line
                  key={s.id + "-proy"}
                  data={s.proyeccion as PuntoSerie[]}
                  dataKey="prof"
                  name={s.nombre + " (proyección)"}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* La lectura escrita de cada línea: ritmo, cuánto le queda y cuándo. */}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-2 rounded-md border border-border px-2.5 py-1.5"
          >
            <span
              className="mt-1 size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <div className="min-w-0 text-xs">
              <p className="font-medium text-foreground">
                {s.nombre}
                {s.detalle && (
                  <span className="font-normal text-muted-foreground"> · {s.detalle}</span>
                )}
              </p>
              <p className="tabular-nums text-muted-foreground">
                {s.mmPorMilKm != null ? (
                  <>
                    {fmtMm(s.mmPorMilKm)} mm/1.000 km ·{" "}
                    {s.kmHastaCambio != null ? (
                      <span className="font-medium text-foreground">
                        quedan {fmtKm(s.kmHastaCambio)} km
                      </span>
                    ) : (
                      "sin proyección"
                    )}
                    {s.fechaCambio ? ` · ~${fmtMes(s.fechaCambio)}` : ""}
                  </>
                ) : (
                  <>{s.puntos} mediciones · todavía sin ritmo medible</>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tooltip propio: el de recharts trae fondo blanco fijo y en oscuro no se lee. */
function TooltipVida({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const d = p.payload as PuntoSerie
  return (
    <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
      <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-foreground">
        <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} aria-hidden />
        {String(p.name)}
      </div>
      <div className="tabular-nums text-muted-foreground">
        {fmtKm(d.km)} km · {fmtMm(d.prof)} mm
        {d.fecha ? ` · ${fmtFecha(d.fecha)}` : " · proyectado"}
      </div>
    </div>
  )
}
