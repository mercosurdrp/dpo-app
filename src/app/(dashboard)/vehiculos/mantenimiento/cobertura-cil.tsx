"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, ChevronRight, Loader2, Truck, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DpoPuntoBadge } from "./_components/dpo-badge"
import {
  getCoberturaCilMes,
  getSerieCoberturaCil,
  type CoberturaCilMes,
  type PuntoSerieCil,
  type UnidadCobertura,
} from "@/actions/cil-cobertura"
import { CICLO_CIL_MENSUAL, labelTareaCil } from "@/lib/flota/cil-tareas"

/**
 * Cobertura del CIL del mes: qué unidad completó las tres letras y cuál falta.
 *
 * 🚨 Convive con el KPI de tareas (18/30) y dice otra cosa: el KPI cuenta tareas
 * sueltas, esto cuenta unidades completas. Ver `actions/cil-cobertura.ts`.
 *
 * Se reinicia solo el 1° de cada mes porque siempre se calcula sobre el mes
 * elegido; no hay nada programado que pueda fallar.
 */

function fmtMes(ym: string): string {
  const [a, m] = ym.split("-")
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ]
  return `${meses[Number(m) - 1]} ${a}`
}

function fmtDia(f: string): string {
  return f.slice(0, 10).split("-").reverse().slice(0, 2).join("/")
}

/**
 * El nombre corto de la tarea, para los encabezados de la grilla: sin el
 * paréntesis aclaratorio no se llevan puesto el ancho en el celular
 * («Inspección (control de fluidos)» ocupaba tres renglones y empujaba la
 * columna de Lubricación fuera de la pantalla).
 */
function labelCorto(id: string): string {
  return labelTareaCil(id).split(" (")[0]
}

/** Los últimos 6 meses hasta el actual, para mirar hacia atrás sin recargar. */
function ultimosMeses(desde: string, cantidad = 6): string[] {
  const [a0, m0] = desde.split("-").map(Number)
  const out: string[] = []
  for (let i = 0; i < cantidad; i++) {
    const total = a0 * 12 + (m0 - 1) - i
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`)
  }
  return out
}

export function CoberturaCil({ mesActual }: { mesActual: string }) {
  const [ym, setYm] = useState(mesActual)
  const [data, setData] = useState<CoberturaCilMes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [serie, setSerie] = useState<PuntoSerieCil[] | null>(null)

  const cargar = useCallback(async (mes: string) => {
    setCargando(true)
    setError(null)
    const res = await getCoberturaCilMes(mes)
    if ("error" in res) setError(res.error)
    else setData(res.data)
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar(ym)
  }, [ym, cargar])

  // La tendencia no depende del mes elegido: se pide una sola vez.
  useEffect(() => {
    void (async () => {
      const res = await getSerieCoberturaCil(6)
      if (!("error" in res)) setSerie(res.data)
    })()
  }, [])

  const ciclo = CICLO_CIL_MENSUAL as readonly string[]
  const obligatorias = data?.unidades.filter((u) => u.obligatoria) ?? []
  const optativas = data?.unidades.filter((u) => !u.obligatoria) ?? []
  const pct =
    data && data.totalObligatorias > 0
      ? Math.round((data.completasObligatorias / data.totalObligatorias) * 100)
      : null

  // La letra que traba: la de menor avance, y sólo si hay alguna adelante. Con
  // las tres iguales no se señala ninguna — marcar un "peor" que empata sería
  // mandar a corregir algo que no está peor que el resto.
  const letraQueTraba = (() => {
    if (!data || data.porLetra.length === 0) return null
    const min = Math.min(...data.porLetra.map((l) => l.hechas))
    const max = Math.max(...data.porLetra.map((l) => l.hechas))
    if (min === max) return null
    return data.porLetra.find((l) => l.hechas === min)?.tarea ?? null
  })()

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Truck className="size-4 text-muted-foreground" /> Cobertura del CIL
          <DpoPuntoBadge numero="4.1" />
        </CardTitle>
        <Select value={ym} onValueChange={(v) => v && setYm(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ultimosMeses(mesActual).map((m) => (
              <SelectItem key={m} value={m}>
                {fmtMes(m)}
                {m === mesActual ? " (en curso)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Una unidad está al día cuando tiene las tres tareas del ciclo en el mes:{" "}
          {ciclo.map((t) => labelTareaCil(t)).join(", ")}. Arranca vacío el 1° de cada
          mes.
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando…
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : !data ? null : (
          <>
            {/* Los cuatro números de arriba, cada uno en su recuadro. Los cuatro
                se tocan: el número solo dice cuántos son, y lo que hace falta para
                salir a corregir es CUÁLES son. Ese detalle está abajo en la grilla
                de toda la flota, pero hay que ir a buscarlo unidad por unidad. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador
                titulo="Unidades al día"
                valor={String(data.completasObligatorias)}
                deTotal={`de ${data.totalObligatorias}`}
                tono={pct === 100 ? "bien" : pct != null && pct >= 70 ? "medio" : "mal"}
                nota="cerraron las tres tareas"
                detalle={{
                  descripcion: `${data.completasObligatorias} de ${data.totalObligatorias} unidades cerraron las tres tareas del ciclo en ${fmtMes(ym)}.`,
                  contenido: (
                    <ListaUnidades unidades={obligatorias} ciclo={ciclo} orden="completas" />
                  ),
                }}
              />
              <Indicador
                titulo="Cobertura"
                valor={pct != null ? `${pct}%` : "—"}
                tono={pct === 100 ? "bien" : pct != null && pct >= 70 ? "medio" : "mal"}
                nota="es lo que mira el auditor"
                detalle={{
                  descripcion: `${data.completasObligatorias} de ${data.totalObligatorias} = ${pct ?? "—"} %. Para el 100 % faltan ${data.totalObligatorias - data.completasObligatorias} unidades; arriba están las que menos tareas deben.`,
                  contenido: (
                    <ListaUnidades unidades={obligatorias} ciclo={ciclo} orden="mas_cerca" />
                  ),
                }}
              />
              <Indicador
                titulo="Tareas del mes"
                valor={String(data.tareasMes)}
                deTotal={`de ${data.metaMes}`}
                tono={data.tareasMes >= data.metaMes ? "bien" : "neutro"}
                nota="el KPI de actividad"
                detalle={{
                  descripcion: `${data.tareasMes} de ${data.metaMes} tareas cargadas en ${fmtMes(ym)}, de la más nueva a la más vieja.`,
                  contenido: (
                    <ListaTareas
                      unidades={data.unidades}
                      ciclo={ciclo}
                      tareasMes={data.tareasMes}
                    />
                  ),
                }}
              />
              {data.ritmo ? (
                <Indicador
                  titulo="Ritmo"
                  valor={
                    data.tareasMes >= data.ritmo.esperadoHoy ? "En ritmo" : "Atrasado"
                  }
                  tono={data.tareasMes >= data.ritmo.esperadoHoy ? "bien" : "mal"}
                  nota={`al día ${data.ritmo.diaDelMes} irían ${data.ritmo.esperadoHoy}`}
                  detalle={{
                    descripcion:
                      data.tareasMes >= data.ritmo.esperadoHoy
                        ? `Van ${data.tareasMes} tareas y al día ${data.ritmo.diaDelMes} irían ${data.ritmo.esperadoHoy}: el mes va en ritmo.`
                        : `Van ${data.tareasMes} tareas y al día ${data.ritmo.diaDelMes} irían ${data.ritmo.esperadoHoy}: faltan ${data.ritmo.esperadoHoy - data.tareasMes} para ponerse al día. Empezá por las de arriba.`,
                    contenido: (
                      <ListaUnidades unidades={obligatorias} ciclo={ciclo} orden="mas_debe" />
                    ),
                  }}
                />
              ) : (
                <Indicador
                  titulo="Mes cerrado"
                  valor={data.tareasMes >= data.metaMes ? "Meta ok" : "Bajo meta"}
                  tono={data.tareasMes >= data.metaMes ? "bien" : "mal"}
                  nota="ya no se puede cargar hacia atrás"
                  detalle={{
                    descripcion: `${fmtMes(ym)} cerró con ${data.tareasMes} de ${data.metaMes} tareas. Quedó así y no se puede cargar hacia atrás.`,
                    contenido: (
                      <ListaUnidades unidades={obligatorias} ciclo={ciclo} orden="mas_debe" />
                    ),
                  }}
                />
              )}
            </div>

            <AvancePorLetra
              porLetra={data.porLetra}
              letraQueTraba={letraQueTraba}
            />

            {serie && serie.length > 0 && (
              <SerieCobertura serie={serie} mesElegido={ym} onElegir={setYm} />
            )}

            <TablaCobertura
              titulo="Qué hizo cada unidad este mes"
              unidades={obligatorias}
              ciclo={ciclo}
            />

            {optativas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Fuera del porcentaje —{" "}
                  {optativas
                    .map((u) => `${u.dominio}: ${u.motivoExclusion}`)
                    .join(" · ")}
                  . Se muestran igual: que no cuenten no significa esconderlas.
                </p>
                <TablaCobertura
                  titulo="Unidades fuera del porcentaje"
                  unidades={optativas}
                  ciclo={ciclo}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Entran camiones, <strong>camionetas</strong> y autoelevadores. Cuando el
              lavado de una camioneta se hace en un lavadero externo, la tarea se carga
              igual aclarándolo en la descripción: que lo haga un tercero no la deja
              afuera del registro. El único que no entra es el{" "}
              <strong>acoplado</strong>, que no tiene motor.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const TONOS = {
  bien: "text-emerald-600 dark:text-emerald-400",
  medio: "text-amber-600 dark:text-amber-400",
  mal: "text-red-600 dark:text-red-400",
  neutro: "text-foreground",
} as const

/**
 * Un número grande con su rótulo y una línea que dice qué significa.
 *
 * Con `detalle` la caja pasa a ser un botón que abre CUÁLES son las unidades o
 * las tareas detrás del número: "5 de 13" no dice a quién hay que ir a buscar,
 * que es lo único que se hace después de mirarlo.
 */
function Indicador({
  titulo,
  valor,
  deTotal,
  tono,
  nota,
  detalle,
}: {
  titulo: string
  valor: string
  deTotal?: string
  tono: keyof typeof TONOS
  nota: string
  /** Qué hay detrás del número. Sin esto la caja no se toca. */
  detalle?: { descripcion: string; contenido: React.ReactNode }
}) {
  const [abierto, setAbierto] = useState(false)

  const cuerpo = (
    <>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`mt-0.5 text-2xl leading-tight font-bold ${TONOS[tono]}`}>
        {valor}
        {deTotal && (
          <span className="text-sm font-medium text-muted-foreground"> {deTotal}</span>
        )}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{nota}</p>
    </>
  )

  if (!detalle) {
    return <div className="rounded-lg border bg-muted/40 p-3">{cuerpo}</div>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Ver qué hay detrás de “${titulo}”`}
        className="rounded-lg border bg-muted/40 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {cuerpo}
        <span className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-primary">
          Ver el detalle <ChevronRight className="size-3" aria-hidden />
        </span>
      </button>

      {abierto && (
        <Dialog open onOpenChange={(o: boolean) => !o && setAbierto(false)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{titulo}</DialogTitle>
              <DialogDescription>{detalle.descripcion}</DialogDescription>
            </DialogHeader>
            {detalle.contenido}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

/**
 * Las unidades del mes, una por renglón, con las tres letras del ciclo: verde
 * la que cerró (con el día) y roja la que falta.
 *
 * El orden es lo que cambia según de qué número se abre:
 *   completas  → primero las que ya cerraron (es lo que cuenta ese número)
 *   mas_cerca  → primero las que están a una sola tarea de cerrar
 *   mas_debe   → primero las que más deben
 */
function ListaUnidades({
  unidades,
  ciclo,
  orden,
}: {
  unidades: UnidadCobertura[]
  ciclo: readonly string[]
  orden: "completas" | "mas_cerca" | "mas_debe"
}) {
  if (unidades.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Sin unidades.</p>
  }

  const faltan = (u: UnidadCobertura) => ciclo.filter((t) => !u.hechas[t]).length
  const ordenadas = [...unidades].sort((a, b) => {
    const fa = faltan(a)
    const fb = faltan(b)
    if (fa !== fb) {
      if (orden === "mas_debe") return fb - fa
      // completas y mas_cerca comparten criterio: primero lo que menos debe.
      return fa - fb
    }
    return a.dominio.localeCompare(b.dominio, "es")
  })

  return (
    <ul className="divide-y divide-border rounded-md border">
      {ordenadas.map((u) => {
        const debe = faltan(u)
        return (
          <li key={u.dominio} className="space-y-1.5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{u.dominio}</span>
              {u.numero && (
                <span className="text-xs text-muted-foreground">N° {u.numero}</span>
              )}
              <Badge
                variant="outline"
                className={
                  debe === 0
                    ? "ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "ml-auto border-destructive/30 bg-destructive/10 text-destructive"
                }
              >
                {debe === 0 ? "Al día" : `Le falta${debe > 1 ? "n" : ""} ${debe}`}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ciclo.map((t) => {
                const hecha = u.hechas[t]
                return (
                  <span
                    key={t}
                    title={
                      hecha
                        ? `${labelTareaCil(t)} · ${fmtDia(hecha.fecha)} · ${hecha.operario}`
                        : `${labelTareaCil(t)}: falta este mes`
                    }
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                      hecha
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {hecha ? <Check className="size-3" /> : <X className="size-3" />}
                    {labelCorto(t)}
                    {hecha && (
                      <span className="text-muted-foreground">{fmtDia(hecha.fecha)}</span>
                    )}
                  </span>
                )
              })}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Las tareas cargadas en el mes, de la más nueva a la más vieja.
 *
 * 🚨 Es una fila por unidad y tarea con el ÚLTIMO registro del mes, que es lo
 * que trae la cobertura. Si una unidad cargó dos veces la misma tarea, el
 * contador de arriba las cuenta a las dos y acá aparece una sola: por eso la
 * diferencia se avisa en vez de dejar que los números no cierren.
 */
function ListaTareas({
  unidades,
  ciclo,
  tareasMes,
}: {
  unidades: UnidadCobertura[]
  ciclo: readonly string[]
  tareasMes: number
}) {
  const filas = unidades
    .flatMap((u) =>
      ciclo
        .map((t) => {
          const hecha = u.hechas[t]
          return hecha ? { dominio: u.dominio, tarea: t, ...hecha } : null
        })
        .filter((f): f is NonNullable<typeof f> => f != null),
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  if (filas.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Todavía no se cargó ninguna tarea en el mes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-md border">
        {filas.map((f) => (
          <li
            key={`${f.dominio}-${f.tarea}-${f.fecha}`}
            className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
          >
            <span className="w-20 shrink-0 font-medium text-foreground">{f.dominio}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {labelTareaCil(f.tarea)}
            </span>
            <span className="text-xs text-muted-foreground">{f.operario}</span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {fmtDia(f.fecha)}
            </span>
          </li>
        ))}
      </ul>
      {tareasMes > filas.length && (
        <p className="text-[11px] text-muted-foreground">
          El contador dice {tareasMes} y acá hay {filas.length} renglones: la diferencia
          son tareas cargadas más de una vez sobre la misma unidad. Se muestra el
          último registro de cada una.
        </p>
      )}
    </div>
  )
}

/**
 * Cuánto avanzó cada letra del ciclo, en barras VERTICALES.
 *
 * 🚨 Es la lectura que faltaba: la cobertura dice "5 de 12 al día" pero no cuál
 * de las tres tareas es la que las deja afuera. Con esto se ve de una que —por
 * ejemplo— la limpieza está casi cerrada y lo que falta es la lubricación, que
 * es una instrucción distinta para el supervisor.
 *
 * 🚨 Eran tres barras horizontales de 10 px apiladas. Comparar el largo de tres
 * renglones finos obliga a leer los números; con las tres verticales, una al
 * lado de la otra y sobre el mismo riel, la más baja salta sola —que es la única
 * pregunta que esta caja tiene que contestar—. Mismo criterio que "Cómo viene
 * mes a mes", justo abajo, así las dos se leen igual.
 */
function AvancePorLetra({
  porLetra,
  letraQueTraba,
}: {
  porLetra: { tarea: string; hechas: number; total: number }[]
  letraQueTraba: string | null
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium text-foreground">Avance por tarea del ciclo</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sobre cuántas unidades quedó cerrada cada una de las tres.
      </p>

      {/* `items-start`: las columnas arrancan arriba, así los tres rieles quedan
          a la misma altura aunque una lleve el cartel de «la que más falta»
          debajo. Con `items-end` esa barra subía y dejaba de comparar. */}
      <div className="mt-4 flex items-start justify-center gap-3 sm:gap-6">
        {porLetra.map((l) => {
          const pct = l.total > 0 ? Math.round((l.hechas / l.total) * 100) : 0
          const traba = l.tarea === letraQueTraba
          return (
            <div
              key={l.tarea}
              className="flex flex-1 flex-col items-center gap-1.5"
              title={`${labelTareaCil(l.tarea)}: ${l.hechas} de ${l.total} unidades (${pct} %)`}
            >
              <span className="text-lg leading-none font-bold text-foreground">
                {l.hechas}
                <span className="text-sm font-medium text-muted-foreground">
                  /{l.total}
                </span>
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {pct}%
              </span>

              {/* Riel de alto fijo: sin él las tres barras no se comparan entre
                  sí, que es todo lo que se le pide al gráfico. */}
              <div className="flex h-44 w-full max-w-24 items-end overflow-hidden rounded-md border bg-muted/40 sm:h-56">
                <div
                  className={`w-full transition-all ${
                    pct === 100
                      ? "bg-emerald-500"
                      : traba
                        ? "bg-amber-500"
                        : "bg-sky-500"
                  }`}
                  // El 0 % deja un hilo visible: una barra en blanco se lee como
                  // "no hay dato", y acá el cero es un dato.
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
              </div>

              <span className="text-center text-xs leading-tight font-medium text-foreground">
                {/* En el celular sólo el nombre corto: «Inspección (control de
                    fluidos)» completo empuja las tres columnas. */}
                {labelCorto(l.tarea)}
              </span>
              {traba && (
                <p className="text-center text-[11px] leading-tight font-medium text-amber-700 dark:text-amber-400">
                  La que más falta: por acá se destraba la cobertura.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Tendencia mes a mes. El DPO no se conforma con el número del mes: pide ver que
 * el indicador mejore. Con un mes por vez esa lectura no existía.
 */
function SerieCobertura({
  serie,
  mesElegido,
  onElegir,
}: {
  serie: PuntoSerieCil[]
  mesElegido: string
  onElegir: (ym: string) => void
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Cómo viene mes a mes
        </p>
        <p className="text-xs text-muted-foreground">
          Unidades con el ciclo completo · la meta es 100 %
        </p>
      </div>

      <div className="mt-4 flex items-end gap-2 sm:gap-3">
        {serie.map((p) => (
          <button
            key={p.ym}
            type="button"
            onClick={() => onElegir(p.ym)}
            title={`${fmtMes(p.ym)}: ${p.completas} de ${p.total} unidades · ${p.tareas} tareas`}
            className={`group flex flex-1 flex-col items-center gap-1 rounded-md p-1 transition-colors hover:bg-accent ${
              p.ym === mesElegido ? "bg-accent" : ""
            }`}
          >
            <span className="text-xs font-semibold text-foreground">{p.pct}%</span>
            {/* Alto fijo del riel para que las barras se comparen entre sí. */}
            <span className="flex h-24 w-full items-end justify-center">
              <span
                className={`w-full max-w-10 rounded-t transition-all ${
                  p.pct === 100
                    ? "bg-emerald-500"
                    : p.pct === 0
                      ? "bg-muted-foreground/25"
                      : "bg-amber-400 dark:bg-amber-500"
                }`}
                // El 0 % igual deja un hilo visible: una barra invisible se lee
                // como "no hay dato", y acá el cero es un dato.
                style={{ height: `${Math.max(p.pct, 2)}%` }}
              />
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              {fmtMes(p.ym).slice(0, 3)}
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              {p.completas}/{p.total}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Se recalcula sobre las tareas cargadas, así que ningún mes se pierde ni
        depende de que un proceso haya corrido ese día. El denominador es la flota
        de hoy.
      </p>
    </div>
  )
}

/**
 * El cuadro de la flota: una fila por unidad y un recuadro por tarea del ciclo,
 * VERDE si la hizo y ROJO si le falta.
 *
 * 🚨 Antes cada tarea era un puntito de 3,5 px. De lejos —y esto se mira
 * proyectado en la reunión— no se distinguía el verde del rojo y había que
 * acercarse a leer la fecha. El recuadro pintado se lee de un vistazo desde
 * cualquier lado, que es todo lo que se le pide a esta grilla; la fecha y el
 * operario siguen adentro y en el `title`, porque son la prueba de la tarea.
 */
function TablaCobertura({
  titulo,
  unidades,
  ciclo,
}: {
  titulo: string
  unidades: CoberturaCilMes["unidades"]
  ciclo: readonly string[]
}) {
  if (unidades.length === 0) {
    return (
      <div className="rounded-lg border p-3 sm:p-4">
        <p className="mb-2 text-sm font-medium text-foreground">{titulo}</p>
        <p className="py-3 text-center text-sm text-muted-foreground">Sin unidades.</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border p-3 sm:p-4">
      <p className="mb-2 text-sm font-medium text-foreground">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Unidad</th>
              {ciclo.map((t) => (
                <th
                  key={t}
                  title={labelTareaCil(t)}
                  className="px-1 py-2 text-center font-medium whitespace-nowrap sm:pr-3"
                >
                  {/* En el celular sólo la primera palabra: con las tres columnas
                      completas la de Lubricación se iba de la pantalla. */}
                  <span className="sm:hidden">{labelCorto(t).split(" ")[0]}</span>
                  <span className="hidden sm:inline">{labelCorto(t)}</span>
                </th>
              ))}
              {/* El estado es el resumen de los tres puntos de la fila: en pantalla
                  chica se lee igual mirándolos, y sacarlo es lo que hace entrar la
                  grilla sin desplazar. */}
              <th className="hidden py-2 font-medium sm:table-cell">Estado</th>
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <tr key={u.dominio} className="border-b last:border-0">
                <td className="py-2 pr-2 whitespace-nowrap font-medium sm:pr-3">
                  {u.dominio}
                  {u.numero && (
                    // En el celular el número de flota baja de renglón: en la misma
                    // línea empujaba la última columna fuera de la pantalla.
                    <span className="block text-xs font-normal text-muted-foreground sm:ml-1 sm:inline">
                      N° {u.numero}
                    </span>
                  )}
                </td>
                {ciclo.map((t) => {
                  const hecha = u.hechas[t]
                  return (
                    <td key={t} className="px-1 py-1.5 align-middle sm:px-1.5">
                      {/*
                        Cuadro verde = hecha, rojo = falta. Se lee de un vistazo en
                        toda la grilla; la fecha va adentro del cuadro y el operario
                        en el `title`, porque son la prueba de la tarea y sin ellos
                        esto sería más lindo pero menos útil.
                      */}
                      <span
                        className={`flex min-h-11 w-full min-w-14 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-[11px] leading-tight font-medium ${
                          hecha
                            ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                            : "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
                        }`}
                        title={
                          hecha
                            ? `${labelTareaCil(t)} · ${fmtDia(hecha.fecha)} · ${hecha.operario}`
                            : `${labelTareaCil(t)}: falta este mes`
                        }
                      >
                        <span className="sr-only">
                          {hecha ? "hecha" : "falta"}
                        </span>
                        {hecha ? (
                          <>
                            <Check aria-hidden className="size-3.5" strokeWidth={3} />
                            <span>{fmtDia(hecha.fecha)}</span>
                          </>
                        ) : (
                          <>
                            <X aria-hidden className="size-3.5" strokeWidth={3} />
                            <span>falta</span>
                          </>
                        )}
                      </span>
                    </td>
                  )
                })}
                <td className="hidden py-2 sm:table-cell">
                  {u.completa ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    >
                      Al día
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                    >
                      Falta {u.faltan.length}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-emerald-500/50 bg-emerald-500/40"
          />{" "}
          hecha — con la fecha adentro
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-red-500/50 bg-red-500/30"
          />{" "}
          falta este mes
        </span>
        <span>Pasá el mouse por el cuadro para ver quién la hizo.</span>
      </p>
    </div>
  )
}
