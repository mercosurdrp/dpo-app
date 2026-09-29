"use client"

import { useEffect, useState } from "react"
import { CalendarClock, Check, Clock, Loader2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DpoPuntoBadge } from "./_components/dpo-badge"
import { ScrollX } from "./_components/scroll-x"
import {
  getProgramacionCilMes,
  type DiaCil,
  type EstadoDiaCil,
  type ProgramacionCilMes,
} from "@/actions/cil-programacion"
import { PROGRAMACION_DESDE, fmtDiaConNombre } from "@/lib/flota/cil-programacion"
import { esFeriado } from "@/lib/feriados-ar"

/**
 * Los dos días del mes que le tocan a cada camión, y qué pasó con cada uno.
 *
 * 🚨 El día no se sortea en el momento ni queda guardado en una tabla: se calcula
 * con `lib/flota/cil-programacion` a partir de la unidad y el mes, así que esta
 * pantalla, el cartel del chofer en Mi CIL y el aviso de la campanita muestran
 * siempre el mismo día. Ver el comentario de ese archivo antes de tocar nada.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function fmtMes(ym: string): string {
  const [a, m] = ym.split("-")
  return `${MESES[Number(m) - 1]} ${a}`
}

function fmtDia(f: string): string {
  return f.slice(0, 10).split("-").reverse().slice(0, 2).join("/")
}

/** El mes anterior, el actual y el que viene: el sorteo del que viene ya se sabe. */
function mesesVisibles(mesActual: string): string[] {
  const [a, m] = mesActual.split("-").map(Number)
  return [-1, 0, 1].map((off) => {
    const d = new Date(Date.UTC(a, m - 1 + off, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  })
}

export function ProgramacionCil({ mesActual }: { mesActual: string }) {
  // Antes de que arranque la programación el mes en curso no tiene días y el
  // cuadro abre vacío: se lee como "no está hecho". Se abre en el primer mes
  // que sí tiene sorteo.
  const [ym, setYm] = useState(
    mesActual < PROGRAMACION_DESDE ? PROGRAMACION_DESDE : mesActual,
  )
  // El calendario primero: la pregunta con la que se entra es "qué día le toca a
  // cada uno", y eso en una tabla de dos columnas hay que reconstruirlo leyendo.
  const [vista, setVista] = useState<"calendario" | "unidades">("calendario")
  const [data, setData] = useState<ProgramacionCilMes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    const t = setTimeout(async () => {
      const res = await getProgramacionCilMes(ym)
      if (!vivo) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setError(null)
        setData(res.data)
      }
      setCargando(false)
    }, 0)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [ym])

  const deHoy = (data?.unidades ?? []).filter((u) =>
    u.dias.some((d) => d.estado === "hoy"),
  )
  const t = data?.totales

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" /> Programación del CIL
          {t && (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {t.hechas + t.fueraDeFecha}/{t.dias} días cumplidos
            </Badge>
          )}
          <DpoPuntoBadge numero="4.1" />
        </CardTitle>
        <Select value={ym} onValueChange={(v) => v && setYm(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mesesVisibles(mesActual).map((m) => (
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
          A cada camión le tocan <strong>2 días por mes</strong>, sorteados: uno en cada
          quincena, de lunes a viernes y sin feriados. El día sale de la unidad y del mes,
          así que es siempre el mismo y el chofer lo ve de antemano en Mi CIL; el día
          anterior y el mismo día le llega el aviso a su campanita.
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando…
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : !data ? null : data.unidades.every((u) => u.dias.length === 0) ? (
          /* Los meses anteriores a que existiera la programación no se muestran en
             rojo: no había días asignados y nadie estaba avisado. */
          <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            La programación arranca en {fmtMes(PROGRAMACION_DESDE)}. Para los meses
            anteriores hay cobertura del CIL, pero no días asignados: eso se mira en el
            cuadro de arriba.
          </p>
        ) : (
          <>
            {/* Lo primero que se busca al entrar: a quién hay que ir a ver hoy. */}
            {ym === mesActual && (
              <div
                className={`rounded-lg border px-3 py-2.5 text-sm ${
                  deHoy.length > 0
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300"
                    : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {deHoy.length > 0 ? (
                  <>
                    <strong>Hoy le toca a:</strong>{" "}
                    {deHoy
                      .map((u) => `${u.dominio}${u.chofer ? ` (${u.chofer})` : ""}`)
                      .join(" · ")}
                  </>
                ) : (
                  "Hoy no le toca a ninguna unidad."
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
              {(
                [
                  ["calendario", "Calendario"],
                  ["unidades", "Por unidad"],
                ] as Array<["calendario" | "unidades", string]>
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  onClick={() => setVista(v)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    vista === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile titulo="En fecha" valor={data.totales.hechas} tono="bien" nota="el día que le tocaba" />
              <Tile
                titulo="Fuera de fecha"
                valor={data.totales.fueraDeFecha}
                tono="medio"
                nota={`la hizo con ±2 días`}
              />
              <Tile titulo="Vencidos" valor={data.totales.vencidas} tono="mal" nota="pasó el día y no se cargó" />
              <Tile
                titulo="Por venir"
                valor={data.totales.pendientes + data.totales.hoy}
                tono="neutro"
                nota="incluye los de hoy"
              />
            </div>

            {vista === "calendario" && (
              <CalendarioMes ym={ym} hoy={data.hoy} unidades={data.unidades} />
            )}

            {vista === "unidades" && (
            <ScrollX>
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Unidad</th>
                    <th className="py-2 pr-3 font-medium">Chofer</th>
                    <th className="py-2 pr-3 font-medium">1ª quincena</th>
                    <th className="py-2 font-medium">2ª quincena</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unidades.map((u) => (
                    <tr key={u.dominio} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap font-medium">
                        {u.dominio}
                        {u.numero && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            N° {u.numero}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {u.chofer ?? "—"}
                        {u.choferOrigen === "ficha" && (
                          // Sin checklists en la ventana no hay usuario al que
                          // avisarle: se dice, porque es la diferencia entre "le
                          // avisamos" y "está en la ficha".
                          <span
                            title="Sale de la ficha: no carga checklists, así que no le llega el aviso a la campanita."
                            className="ml-1 text-[11px] text-amber-600 dark:text-amber-400"
                          >
                            (sin aviso)
                          </span>
                        )}
                      </td>
                      {[0, 1].map((i) => (
                        <td key={i} className="py-2 pr-3">
                          {u.dias[i] ? <ChipDia dia={u.dias[i]} /> : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
            )}

            <p className="text-xs text-muted-foreground">
              Un día se cumple con al menos una tarea CIL cargada ese día; con ±2 días
              cuenta como <strong>fuera de fecha</strong> —se hizo, pero no cuando tocaba—.
              La cobertura del mes, que es lo que mira el auditor, sigue siendo la de más
              arriba: esto dice <em>cuándo</em>, no <em>si</em> cerró las tres letras.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const TONOS_TILE = {
  bien: "text-emerald-600 dark:text-emerald-400",
  medio: "text-amber-600 dark:text-amber-400",
  mal: "text-red-600 dark:text-red-400",
  neutro: "text-foreground",
} as const

function Tile({
  titulo,
  valor,
  tono,
  nota,
}: {
  titulo: string
  valor: number
  tono: keyof typeof TONOS_TILE
  nota: string
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`mt-0.5 text-2xl leading-tight font-bold ${TONOS_TILE[tono]}`}>
        {valor}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{nota}</p>
    </div>
  )
}

function ChipDia({ dia }: { dia: DiaCil }) {
  const comun =
    "inline-flex flex-col items-start gap-0.5 rounded-md border px-2 py-1 text-[11px] leading-tight font-medium"
  const hechaEl = dia.tareas.length > 0 ? dia.tareas[0].fecha : null

  if (dia.estado === "hecha") {
    return (
      <span
        className={`${comun} border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}
        title={`Cargada el ${fmtDia(dia.fecha)} por ${dia.tareas[0]?.operario ?? "—"}`}
      >
        <span className="flex items-center gap-1">
          <Check className="size-3" strokeWidth={3} /> {fmtDiaConNombre(dia.fecha)}
        </span>
        <span className="font-normal text-muted-foreground">
          {dia.tareas.length} {dia.tareas.length === 1 ? "tarea" : "tareas"}
        </span>
      </span>
    )
  }
  if (dia.estado === "fuera_de_fecha") {
    return (
      <span
        className={`${comun} border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300`}
        title={`Le tocaba el ${fmtDia(dia.fecha)} y se cargó el ${hechaEl ? fmtDia(hechaEl) : "—"}`}
      >
        <span>{fmtDiaConNombre(dia.fecha)}</span>
        <span className="font-normal">se hizo el {hechaEl ? fmtDia(hechaEl) : "—"}</span>
      </span>
    )
  }
  if (dia.estado === "hoy") {
    return (
      <span
        className={`${comun} border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300`}
      >
        <span className="flex items-center gap-1">
          <Clock className="size-3" /> {fmtDiaConNombre(dia.fecha)}
        </span>
        <span className="font-normal">es HOY</span>
      </span>
    )
  }
  if (dia.estado === "vencida") {
    return (
      <span
        className={`${comun} border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300`}
      >
        <span className="flex items-center gap-1">
          <X className="size-3" strokeWidth={3} /> {fmtDiaConNombre(dia.fecha)}
        </span>
        <span className="font-normal">vencido</span>
      </span>
    )
  }
  return (
    <span className={`${comun} bg-muted/50 text-muted-foreground`}>
      <span>{fmtDiaConNombre(dia.fecha)}</span>
      <span className="font-normal">pendiente</span>
    </span>
  )
}

/** Los colores de cada estado, los mismos que los chips de la tabla. */
const TONO_ESTADO: Record<EstadoDiaCil, string> = {
  hecha:
    "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  fuera_de_fecha:
    "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  hoy: "border-sky-500/60 bg-sky-500/20 text-sky-800 dark:text-sky-200",
  vencida: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300",
  pendiente: "border-border bg-background text-foreground",
}

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

interface CeldaUnidad {
  dominio: string
  numero: string | null
  estado: EstadoDiaCil
}

/**
 * El mes como calendario: una columna por día de semana y las unidades que le
 * tocan adentro del día.
 *
 * 🚨 Sólo lunes a viernes, las cinco columnas: el sorteo nunca cae en sábado ni
 * domingo, y dos columnas siempre vacías achican las cinco que importan —en el
 * celular es la diferencia entre leerlo y no—.
 */
function CalendarioMes({
  ym,
  hoy,
  unidades,
}: {
  ym: string
  hoy: string
  unidades: ProgramacionCilMes["unidades"]
}) {
  const porDia = new Map<string, CeldaUnidad[]>()
  for (const u of unidades) {
    for (const d of u.dias) {
      if (!porDia.has(d.fecha)) porDia.set(d.fecha, [])
      porDia.get(d.fecha)!.push({
        dominio: u.dominio,
        numero: u.numero,
        estado: d.estado,
      })
    }
  }

  const [a, m] = ym.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  // Las semanas del mes, cada una con sus cinco días hábiles (null donde el mes
  // todavía no empezó o ya terminó).
  const semanas: Array<Array<number | null>> = []
  let semana: Array<number | null> = [null, null, null, null, null]
  for (let d = 1; d <= ultimo; d++) {
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
    if (dow === 0 || dow === 6) continue
    if (dow === 1 && semana.some((x) => x != null)) {
      semanas.push(semana)
      semana = [null, null, null, null, null]
    }
    semana[dow - 1] = d
  }
  if (semana.some((x) => x != null)) semanas.push(semana)

  return (
    <div className="space-y-2">
      <ScrollX>
        <div className="min-w-[36rem]">
          <div className="grid grid-cols-5 gap-1.5">
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-[11px] font-semibold uppercase text-muted-foreground"
              >
                {/* En pantalla chica, las tres primeras letras: "Miércoles" era lo
                    único que empujaba la grilla. */}
                <span className="sm:hidden">{d.slice(0, 3)}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
            {semanas.flatMap((sem, i) =>
              sem.map((dia, j) => {
                if (dia == null) {
                  return (
                    <div
                      key={`${i}-${j}`}
                      className="min-h-20 rounded-md border border-dashed border-border/40"
                    />
                  )
                }
                const fecha = `${ym}-${String(dia).padStart(2, "0")}`
                const celdas = porDia.get(fecha) ?? []
                const feriado = esFeriado(fecha)
                const esHoy = fecha === hoy
                return (
                  <div
                    key={`${i}-${j}`}
                    className={`min-h-20 space-y-1 rounded-md border p-1.5 ${
                      esHoy
                        ? "border-sky-500 bg-sky-500/5 ring-1 ring-sky-500/40"
                        : feriado
                          ? "border-dashed bg-muted/30"
                          : "bg-card"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          esHoy ? "text-sky-700 dark:text-sky-300" : "text-foreground"
                        }`}
                      >
                        {dia}
                      </span>
                      {esHoy && (
                        <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                          HOY
                        </span>
                      )}
                      {feriado && !esHoy && (
                        <span className="text-[10px] text-muted-foreground">feriado</span>
                      )}
                    </div>
                    {celdas.map((c) => (
                      <span
                        key={c.dominio}
                        title={`${c.dominio}${c.numero ? ` · N° ${c.numero}` : ""} — ${
                          c.estado === "hecha"
                            ? "hecha en fecha"
                            : c.estado === "fuera_de_fecha"
                              ? "hecha fuera de fecha"
                              : c.estado === "vencida"
                                ? "vencida"
                                : c.estado === "hoy"
                                  ? "le toca hoy"
                                  : "pendiente"
                        }`}
                        className={`block truncate rounded border px-1 py-0.5 text-[11px] leading-tight font-medium ${TONO_ESTADO[c.estado]}`}
                      >
                        {/* El número de flota primero: es como se lo nombra en el
                            galpón. La patente queda para el título. */}
                        {c.numero ?? c.dominio}
                      </span>
                    ))}
                  </div>
                )
              }),
            )}
          </div>
        </div>
      </ScrollX>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-emerald-500/50 bg-emerald-500/40"
          />{" "}
          hecha
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-amber-500/50 bg-amber-500/40"
          />{" "}
          fuera de fecha
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-red-500/50 bg-red-500/40"
          />{" "}
          vencida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm border bg-background" /> pendiente
        </span>
        <span>El número es el de flota; la patente está en el globito.</span>
      </p>
    </div>
  )
}
