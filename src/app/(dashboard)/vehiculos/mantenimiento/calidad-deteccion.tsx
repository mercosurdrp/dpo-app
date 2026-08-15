"use client"

// "¿El checklist está encontrando algo?" — DPO 1.3.
//
// Se lee al revés que el resto del módulo: acá una tasa BAJA es la mala
// noticia. Un chofer con 200 revisiones y cero hallazgos no describe un camión
// impecable; describe un formulario completado sin mirar. Y mientras la base
// esté subreportada, todo lo que cuelga de ella —la pirámide, la tasa por
// ítem— mide más quién reporta que qué se rompe.

import { useEffect, useState } from "react"
import { Info, ScanSearch } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  getCalidadDeteccion,
  type CalidadDeteccion,
} from "@/actions/checklist-deteccion"
import { DpoPuntoBadge } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import { usePaletaViz } from "./_components/paleta-viz"
import type { RangoFechas } from "./_components/filtro-periodo"

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)
const fmtPct = (v: number | null, dec = 1) =>
  v == null
    ? "—"
    : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(v)}%`

/** Debajo de esto, el checklist no está mirando: es el piso de sospecha. */
const PISO_DETECCION = 1

/** "RIVERO LAUREANO" → "RIVERO L." — en la flota hay tres Rivero y el apellido
 *  solo los vuelve indistinguibles en el eje. */
function nombreCorto(nombre: string): string {
  const [apellido, ...resto] = nombre.split(/\s+/)
  if (resto.length === 0) return apellido
  return `${apellido} ${resto[0][0]}.`
}

interface Props {
  rango: RangoFechas
  etiquetaPeriodo: string
}

export function CalidadDeteccion({ rango, etiquetaPeriodo }: Props) {
  // El resultado se guarda JUNTO al rango que lo produjo: así "está cargando"
  // es un dato derivado (el rango pedido todavía no es el rango que tengo) y no
  // hace falta un setState de más al entrar al efecto.
  const [resultado, setResultado] = useState<{
    rango: RangoFechas
    datos: CalidadDeteccion | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    let vigente = true
    getCalidadDeteccion(rango).then((res) => {
      if (!vigente) return
      setResultado(
        "error" in res
          ? { rango, datos: null, error: res.error }
          : { rango, datos: res.data, error: null }
      )
    })
    return () => {
      vigente = false
    }
  }, [rango])

  const alDia =
    resultado != null &&
    resultado.rango.desde === rango.desde &&
    resultado.rango.hasta === rango.hasta
  const datos = resultado?.datos ?? null
  const error = alDia ? resultado?.error : null
  const cargando = !alDia

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          No se pudo calcular la detección: {error}
        </CardContent>
      </Card>
    )
  }

  if (cargando && !datos) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Calculando la detección del período…
        </CardContent>
      </Card>
    )
  }
  if (!datos) return null

  return <PanelDeteccion datos={datos} etiquetaPeriodo={etiquetaPeriodo} />
}

/** El dibujo, sin la consulta: así se puede ver con datos de prueba. */
export function PanelDeteccion({
  datos,
  etiquetaPeriodo,
}: {
  datos: CalidadDeteccion
  etiquetaPeriodo: string
}) {
  const paleta = usePaletaViz()
  const { porChofer, totales } = datos
  /**
   * Las tres tarjetas eran números sueltos: el de choferes que nunca detectaron
   * obligaba a buscar a mano cuál era cuál en la tabla de abajo. Ahora la
   * enfocan. El corte del cero es el mismo del total (checklists > 0), no el de
   * la marca «nunca detectó», que recién aparece a partir de 20.
   */
  const [foco, setFoco] = useState<"sin_detectar" | "detectaron" | null>(null)
  const choferesEnTabla =
    foco == null
      ? porChofer
      : foco === "sin_detectar"
        ? porChofer.filter((c) => c.conHallazgo === 0 && c.checklists > 0)
        : porChofer.filter((c) => c.conHallazgo > 0)
  // Sólo choferes con volumen suficiente: con 3 checklists, cero hallazgos no
  // dice nada.
  const conVolumen = porChofer.filter((c) => c.checklists >= 20)
  const grafico = conVolumen.slice(0, 12).map((c) => ({
    chofer: nombreCorto(c.chofer),
    nombre: c.chofer,
    pct: Number((c.pctDeteccion ?? 0).toFixed(2)),
    checklists: c.checklists,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        {/* El período iba suelto al final de la línea: con el título largo y el
            badge delante, quedaba pegado al borde y se montaba sobre él. Ahora
            el título y el badge forman un bloque que puede encoger, y la fecha
            es una pieza propia que no se parte ni se pisa: si no entra, baja
            entera al renglón de abajo. */}
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
          <span className="flex min-w-0 items-center gap-2">
            <ScanSearch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ¿El checklist está detectando?
            <DpoPuntoBadge numero="1.3" className="shrink-0" />
          </span>
          <span className="shrink-0 whitespace-nowrap text-sm font-normal capitalize text-muted-foreground">
            · {etiquetaPeriodo}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Acá una tasa BAJA es la mala noticia: mide qué proporción de los
          checklists encontró algo. Doscientas revisiones seguidas sin un solo
          hallazgo no describen una flota impecable.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tres tarjetas en una fila dejaban cada una tan angosta que el valor
            con su fracción ("2,33 % 41/1.762") no entraba, y la tarjeta lo
            recorta por su overflow. Dos columnas hasta xl le dan el ancho que
            el número necesita. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            onClick={() => setFoco(null)}
            label="Checklists con hallazgo"
            valor={
              // El valor y su fracción son dos piezas: si no entran juntas, la
              // fracción baja de renglón en vez de cortarse contra el borde.
              <span className="flex flex-wrap items-baseline gap-x-1">
                {fmtPct(totales.pctDeteccion, 2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {fmtNum(totales.conHallazgo)}/{fmtNum(totales.checklists)}
                </span>
              </span>
            }
            estado={
              totales.pctDeteccion == null
                ? "neutro"
                : totales.pctDeteccion < PISO_DETECCION
                  ? "critico"
                  : totales.pctDeteccion < 5
                    ? "alerta"
                    : "ok"
            }
            sub="De cada 100 revisiones, cuántas marcaron algo · click para ver a todos"
            dpo="1.3"
          />
          <KpiCard
            onClick={() => setFoco((f) => (f === "sin_detectar" ? null : "sin_detectar"))}
            label="Choferes que nunca detectaron"
            valor={totales.choferesSinDetectar}
            estado={totales.choferesSinDetectar > 0 ? "critico" : "ok"}
            sub="Cero hallazgos en el período · click para ver quiénes"
          />
          <KpiCard
            onClick={() => setFoco((f) => (f === "detectaron" ? null : "detectaron"))}
            label="Ítems marcados"
            valor={fmtNum(totales.hallazgos)}
            sub="Un checklist puede aportar más de uno · click para ver quiénes los marcaron"
          />
        </div>

        {foco && (
          <p className="text-xs text-muted-foreground">
            Mostrando {choferesEnTabla.length} de {porChofer.length} choferes:{" "}
            {foco === "sin_detectar"
              ? "los que cargaron checklists y no marcaron nada."
              : "los que sí marcaron algo."}{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setFoco(null)}
            >
              Ver todos
            </button>
          </p>
        )}

        {grafico.length > 0 && (
          <div style={{ height: Math.max(200, grafico.length * 30 + 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={grafico}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  className="stroke-border"
                  strokeOpacity={0.5}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  unit="%"
                />
                {/* 92 px no alcanzaban para "RIVERO F.": el nombre se metía
                    debajo de su propia barra. */}
                <YAxis
                  type="category"
                  dataKey="chofer"
                  width={128}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                />
                <RTooltip
                  cursor={{ className: "fill-muted", opacity: 0.4 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as (typeof grafico)[number]
                    return (
                      <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                        <div className="mb-1 font-semibold text-foreground">
                          {p.nombre}
                        </div>
                        <div className="text-muted-foreground">
                          Detección:{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {fmtPct(p.pct, 2)}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          Checklists:{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {fmtNum(p.checklists)}
                          </span>
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar
                  dataKey="pct"
                  name="Detección"
                  fill={paleta.leve}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Con el badge "nunca detectó" al lado del nombre, la tabla pide más
            ancho del que tiene la tarjeta: que scrollee ella y no empuje al
            resto de la pantalla. */}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Chofer</TableHead>
              <TableHead className="text-right">Checklists</TableHead>
              <TableHead className="text-right">Con hallazgo</TableHead>
              <TableHead className="text-right">Ítems marcados</TableHead>
              <TableHead className="text-right">Detección</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {choferesEnTabla.map((c) => {
              const sospechoso = c.conHallazgo === 0 && c.checklists >= 20
              return (
                <TableRow key={c.chofer}>
                  <TableCell className="font-medium">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {c.chofer}
                      {sospechoso && (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap border-destructive/30 bg-destructive/10 text-[10px] text-destructive"
                        >
                          nunca detectó
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(c.checklists)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(c.conHallazgo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtNum(c.hallazgos)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      c.pctDeteccion != null &&
                        c.checklists >= 20 &&
                        c.pctDeteccion < PISO_DETECCION &&
                        "text-destructive"
                    )}
                  >
                    {fmtPct(c.pctDeteccion, 2)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] italic text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
          La marca «nunca detectó» aparece recién a partir de 20 checklists en el
          período: con menos, el cero no significa nada.
        </p>
      </CardContent>
    </Card>
  )
}
