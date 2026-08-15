"use client"

// Calendario del plan preventivo (DPO 2.2 · R2.2.3): el mes completo con lo que
// vence cada día y las OT ya programadas, para planificar el taller y para
// mostrarle al auditor el plan en una herramienta digital.
//
// La vista es una FRANJA POR UNIDAD (estilo Gantt): una fila por camión con su
// color fijo y los días del mes como columnas. La grilla de siete columnas que
// había antes obligaba a leer celda por celda para saber qué unidad tenía qué;
// acá cada camión se sigue en horizontal y el mes se lee de un vistazo.
//
// Las tareas que vencen por km u horas no tienen fecha propia: se estiman con el
// ritmo de uso de cada unidad y se marcan con "~". Ver `lib/flota/calendario-preventivo`.
//
// 🚨 El SERVICE GENERAL no se recalcula acá: se toma de `programacion`, la misma
// proyección que muestra el Tablero operativo ("faltan 8 días"). Si el calendario
// lo midiera por su cuenta, el mismo service caería en dos días distintos según
// dónde se lo mire. Por eso el ritmo del tablero (`kmDia`) manda también sobre el
// resto de las tareas.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus, Warehouse } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
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
import { cn } from "@/lib/utils"
import { getOtProgramadas, type OtProgramada } from "@/actions/ot-programadas"
import {
  eventosPreventivos,
  isoDe,
  ritmoDiarioPorDominio,
  type EventoPreventivo,
  type LecturaDia,
  type ServiceProyectado,
} from "@/lib/flota/calendario-preventivo"
import type { EstadoPlanVehiculo, MantenimientoPlanTarea } from "@/types/database"
import type { ServiceGeneralUnidad } from "@/lib/vehiculos/service-general"

const DIAS_LETRA = ["L", "M", "M", "J", "V", "S", "D"]
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

/** Alto de cada carril dentro de la franja de una unidad. */
const ALTO_CARRIL = "1.5rem"
/** Carriles como máximo por unidad: lo que no entra se cuenta en "+N". */
const MAX_CARRILES = 3

const mesLargo = (iso: string) => {
  const [y, m] = iso.split("-").map(Number)
  return `${MESES[m - 1]} ${y}`
}
const addMesesIso = (iso: string, n: number) => {
  const [y, m] = iso.split("-").map(Number)
  return isoDe(new Date(y, m - 1 + n, 1))
}
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Días 1..N del mes de `ancla`, con su día de semana (0 = lunes). */
function diasDelMes(ancla: string) {
  const [y, m] = ancla.split("-").map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  const dias: { iso: string; n: number; dow: number }[] = []
  for (let d = 1; d <= ultimo; d++) {
    const fecha = new Date(y, m - 1, d)
    dias.push({ iso: isoDe(fecha), n: d, dow: (fecha.getDay() + 6) % 7 })
  }
  return dias
}

/** Color fijo de cada unidad: identifica la franja sin depender del texto. */
const COLORES_UNIDAD = [
  "bg-sky-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-lime-500", "bg-fuchsia-500",
]

type Tono = "ot" | "hecha" | "vencido" | "proximo" | "ok" | "arrastre"

/** Barras llenas: el Gantt se lee por el color del bloque, no por el borde. */
const CLS_BARRA: Record<Tono, string> = {
  ot: "bg-sky-600 text-white hover:bg-sky-500",
  hecha: "bg-emerald-600/85 text-white hover:bg-emerald-600",
  vencido: "bg-rose-600 text-white hover:bg-rose-500",
  arrastre: "bg-rose-700 text-white hover:bg-rose-600",
  proximo: "bg-amber-400 text-amber-950 hover:bg-amber-300",
  ok: "bg-slate-300 text-slate-800 hover:bg-slate-200 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-500",
}

const CLS_ESTADO_BADGE: Record<EventoPreventivo["estado"], string> = {
  vencido: "border-destructive/40 bg-destructive/10 text-destructive",
  proximo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ok: "border-border bg-muted text-muted-foreground",
}

interface Barra {
  key: string
  /** Columna donde arranca: 1..cantidad de días del mes. */
  dia: number
  /**
   * Días que ocupa DE VERDAD: una OT va desde que se programa hasta que se
   * cierra, y un vencimiento es un día solo. La barra no se estira para que
   * entre el texto — si no, una orden abierta y cerrada el mismo día parecía
   * durar una semana.
   */
  span: number
  carril: number
  tono: Tono
  /** Texto completo; se usa cuando la barra tiene ancho para mostrarlo. */
  texto: string
  /** Versión mínima (el N° de OT, el ◀): lo que entra en un solo día. */
  textoCorto: string
  titulo: string
  fecha: string
}

/**
 * Ancho de cada día, en píxeles. El calendario nació con los 31 días metidos a
 * la fuerza en 52rem: cada día quedaba en ~23 px, ahí no entra ni "OT 1756" y
 * por eso el texto terminaba dibujado sobre los días de al lado. Ahora el día
 * tiene un ancho de verdad y, si el mes no entra en la pantalla, se scrollea.
 */
const ZOOMS = {
  compacto: { px: 26, label: "Mes completo" },
  comodo: { px: 46, label: "Días cómodos" },
  amplio: { px: 92, label: "Días anchos" },
} as const
type Zoom = keyof typeof ZOOMS

/** Ancho de un texto de 10 px, en píxeles (aprox., para elegir qué mostrar). */
const anchoPx = (texto: string) => texto.length * 5.4

/** "Filtro de aire" → "FA": lo que se puede leer dentro de un solo día. */
function siglas(tarea: string): string {
  const palabras = tarea
    .split(/\s+/)
    .filter((p) => p.length > 2 && !/^(de|del|la|el|los|las|con|por)$/i.test(p))
  if (palabras.length === 0) return tarea.slice(0, 3).toUpperCase()
  return palabras
    .slice(0, 3)
    .map((p) => p[0].toUpperCase())
    .join("")
}

/** Reparte las barras en carriles para que ninguna se superponga con otra. */
function repartirEnCarriles(items: Omit<Barra, "carril">[]): { barras: Barra[]; ocultas: number } {
  const finDeCarril: number[] = []
  const barras: Barra[] = []
  let ocultas = 0
  for (const it of [...items].sort((a, b) => a.dia - b.dia)) {
    let carril = finDeCarril.findIndex((fin) => fin < it.dia)
    if (carril === -1) {
      if (finDeCarril.length >= MAX_CARRILES) {
        ocultas++
        continue
      }
      carril = finDeCarril.length
    }
    finDeCarril[carril] = it.dia + it.span - 1
    barras.push({ ...it, carril })
  }
  return { barras, ocultas }
}

export function CalendarioPreventivo({
  estados,
  tareas,
  historialLecturas,
  programacion,
  puedeEditar,
  onProgramar,
  onAbrirOt,
  refreshToken,
}: {
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  /** Historial de lecturas por dominio (de `getEstadoPlanFlota`), para el ritmo de uso. */
  historialLecturas: Record<string, LecturaDia[]>
  /** Service general por unidad, el mismo que muestra el Tablero operativo. */
  programacion: ServiceGeneralUnidad[]
  puedeEditar: boolean
  /** Abre el diálogo de programación del padre con la fecha (y unidad) elegida. */
  onProgramar: (fecha: string, dominio?: string, tareasSugeridas?: string[]) => void
  /** Abre una orden ya programada, que es desde donde se la finaliza. */
  onAbrirOt: (ot: OtProgramada) => void
  /** Cambia cuando el padre guarda una OT: fuerza recargar el mes. */
  refreshToken: number
}) {
  const hoy = isoDe(new Date())
  const [ancla, setAncla] = useState(() => `${hoy.slice(0, 7)}-01`)
  const [fUnidad, setFUnidad] = useState("todas")
  const [cacheOts, setCacheOts] = useState<{ clave: string; data: OtProgramada[] } | null>(null)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [verVacias, setVerVacias] = useState(false)
  const [zoom, setZoom] = useState<Zoom>("comodo")
  const anchoDia = ZOOMS[zoom].px

  const dias = useMemo(() => diasDelMes(ancla), [ancla])
  const primeroDelMes = dias[0].iso
  const ultimoDelMes = dias[dias.length - 1].iso
  const nDias = dias.length

  // Las OT del mes se piden al servidor. Se guardan junto con la clave del rango
  // para que un mes recién elegido no muestre las órdenes del anterior mientras
  // llega la respuesta (y sin resetear estado dentro del efecto).
  const clave = `${primeroDelMes}|${ultimoDelMes}|${refreshToken}`
  useEffect(() => {
    let cancelado = false
    void getOtProgramadas({ desde: primeroDelMes, hasta: ultimoDelMes }).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setCacheOts({ clave, data: res.data })
    })
    return () => {
      cancelado = true
    }
  }, [clave, primeroDelMes, ultimoDelMes])

  const ots = cacheOts?.clave === clave ? cacheOts.data : null

  const tareasById = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas])

  const servicePorDominio = useMemo(() => {
    const map = new Map<string, ServiceProyectado>()
    for (const p of programacion) {
      if (p.estado === "no_aplica") continue
      map.set(p.dominio, {
        dominio: p.dominio,
        proximaFecha: p.proximaFecha,
        diasRestantes: p.diasRestantes,
        kmDia: p.kmDia,
        motivo: p.motivo,
        kmRestante: p.kmRestante,
        mide: p.mide,
      })
    }
    return map
  }, [programacion])

  const eventos = useMemo(() => {
    const tipos = new Map(estados.map((e) => [e.vehiculo.dominio, e.vehiculo.tipo ?? "camion"]))
    const ritmo = ritmoDiarioPorDominio(historialLecturas, tipos)
    const todos = eventosPreventivos({
      estados,
      tareasById,
      ritmoPorDominio: ritmo,
      servicePorDominio,
      hoy,
    })
    return fUnidad === "todas" ? todos : todos.filter((e) => e.dominio === fUnidad)
  }, [estados, tareasById, historialLecturas, servicePorDominio, fUnidad, hoy])

  const delMes = useMemo(
    () => eventos.filter((e) => e.fecha >= primeroDelMes && e.fecha <= ultimoDelMes),
    [eventos, primeroDelMes, ultimoDelMes]
  )
  /** Vencidas con fecha anterior al mes: entran pegadas al día 1, con "◀". */
  const arrastre = useMemo(
    () => eventos.filter((e) => e.estado === "vencido" && e.fecha < primeroDelMes),
    [eventos, primeroDelMes]
  )

  // La orden cancelada no se muestra: no es trabajo que quede por hacer.
  const otsDelMes = useMemo(
    () =>
      (ots ?? []).filter(
        (o) =>
          o.fecha_programada >= primeroDelMes &&
          o.fecha_programada <= ultimoDelMes &&
          o.estado !== "cancelada" &&
          (fUnidad === "todas" || o.dominio === fUnidad)
      ),
    [ots, primeroDelMes, ultimoDelMes, fUnidad]
  )
  /** Sólo las que siguen esperando: es lo que cuenta el encabezado. */
  const otsPendientes = useMemo(
    () => otsDelMes.filter((o) => o.estado !== "realizada"),
    [otsDelMes]
  )

  const dominios = useMemo(() => estados.map((e) => e.vehiculo.dominio).sort(), [estados])

  const colorDeUnidad = useMemo(() => {
    const map = new Map<string, string>()
    dominios.forEach((d, i) => map.set(d, COLORES_UNIDAD[i % COLORES_UNIDAD.length]))
    return map
  }, [dominios])

  const diaDe = useMemo(() => {
    const map = new Map<string, number>()
    dias.forEach((d) => map.set(d.iso, d.n))
    return map
  }, [dias])

  /** Una franja por unidad, ya repartida en carriles y ordenada por severidad. */
  const franjas = useMemo(() => {
    const visibles = fUnidad === "todas" ? dominios : dominios.filter((d) => d === fUnidad)
    return visibles
      .map((dominio) => {
        const evs = delMes.filter((e) => e.dominio === dominio)
        const otsU = otsDelMes.filter((o) => o.dominio === dominio)
        const atras = arrastre.filter((e) => e.dominio === dominio)

        const items: Omit<Barra, "carril">[] = []

        if (atras.length > 0) {
          const texto =
            atras.length === 1 ? `◀ ${atras[0].tarea}` : `◀ ${atras.length} vencidas de antes`
          items.push({
            key: `atras-${dominio}`,
            dia: 1,
            span: 1,
            tono: "arrastre",
            texto,
            textoCorto: atras.length === 1 ? "◀" : `◀${atras.length}`,
            titulo: `Vencidas antes de ${mesLargo(ancla)}: ${atras
              .map((e) => `${e.tarea} (${fmtDia(e.fecha)})`)
              .join(" · ")}`,
            fecha: atras[0].fecha,
          })
        }
        for (const o of otsU) {
          // La orden resuelta se muestra hecha, no pendiente: si el trabajo ya
          // está, verla en azul como "OT por hacer" hace pensar que falta.
          const hecha = o.estado === "realizada"
          // La barra dura lo que duró la orden: de la fecha programada al
          // cierre. Si sigue abierta, hasta hoy — es lo que lleva esperando.
          const finReal = o.ot_cierre ?? (hecha ? o.fecha_programada : hoy)
          const fin = finReal < o.fecha_programada ? o.fecha_programada : finReal
          const ini = diaDe.get(o.fecha_programada) ?? 1
          const finDia = diaDe.get(fin) ?? (fin > ultimoDelMes ? nDias : ini)
          const nro = o.ot_numero ? `OT ${o.ot_numero}` : "OT"
          const texto = `${hecha ? "✓ " : ""}${nro} · ${o.taller || o.tareas[0] || "sin taller"}`
          const span = Math.max(1, finDia - ini + 1)
          items.push({
            key: `ot-${o.id}`,
            dia: ini,
            span,
            tono: hecha ? "hecha" : "ot",
            texto,
            textoCorto: `${hecha ? "✓" : ""}${o.ot_numero ?? "OT"}`,
            titulo: `${nro}${hecha ? " · resuelta" : " · abierta"} · ${
              o.taller ? `taller: ${o.taller}` : "sin taller asignado"
            } · programada el ${fmtDia(o.fecha_programada)}${
              o.ot_cierre ? `, cerrada el ${fmtDia(o.ot_cierre)}` : ""
            }: ${o.tareas.join(" · ") || "sin trabajos cargados"}`,
            fecha: o.fecha_programada,
          })
        }
        for (const e of evs) {
          // Un vencimiento cae un día: ocupa una columna y el nombre va al lado.
          const texto = `${e.estimada ? "~" : ""}${e.tarea}`
          items.push({
            key: `ev-${dominio}-${e.tareaId}`,
            dia: diaDe.get(e.fecha) ?? 1,
            span: 1,
            tono: e.estado,
            texto,
            // Iniciales de la tarea: en un solo día no entra "Filtro de aire".
            textoCorto: `${e.estimada ? "~" : ""}${siglas(e.tarea)}`,
            titulo: `${e.tarea} · ${fmtDia(e.fecha)}${e.detalle ? ` · ${e.detalle}` : ""}${
              e.estimada ? " (fecha estimada por el uso)" : ""
            }`,
            fecha: e.fecha,
          })
        }

        const { barras, ocultas } = repartirEnCarriles(items)
        const severidad = atras.length > 0 || evs.some((e) => e.estado === "vencido")
          ? 0
          : evs.some((e) => e.estado === "proximo")
            ? 1
            : items.length > 0
              ? 2
              : 3
        return { dominio, barras, ocultas, severidad, evs, otsU, atras }
      })
      .sort((a, b) => a.severidad - b.severidad || a.dominio.localeCompare(b.dominio))
  }, [dominios, fUnidad, delMes, otsDelMes, arrastre, diaDe, ancla, hoy, nDias, ultimoDelMes])

  const conAlgo = franjas.filter((f) => f.barras.length > 0 || f.ocultas > 0)
  const sinNada = franjas.filter((f) => f.barras.length === 0 && f.ocultas === 0)
  const mostradas = verVacias ? [...conAlgo, ...sinNada] : conAlgo

  /** Abre el detalle de un día completo (todas las unidades). */
  const abrirDia = (fecha: string) =>
    setDetalle({
      titulo: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`,
      subtitulo: "Lo que vence ese día y las órdenes ya programadas.",
      eventos: eventos.filter((e) => e.fecha === fecha),
      ots: (ots ?? []).filter(
        (o) => o.fecha_programada === fecha && (fUnidad === "todas" || o.dominio === fUnidad)
      ),
      fecha,
    })

  /** Abre el detalle de una unidad en un día (o el arrastre de esa unidad). */
  const abrirBarra = (dominio: string, b: Barra) =>
    setDetalle(
      b.tono === "arrastre"
        ? {
            titulo: `${dominio} · vencidas de antes`,
            subtitulo: `Su fecha quedó fuera de ${mesLargo(ancla)}: siguen abiertas.`,
            eventos: arrastre.filter((e) => e.dominio === dominio),
            ots: [],
            fecha: hoy,
          }
        : {
            titulo: `${dominio} · ${fmtDia(b.fecha)}`,
            subtitulo: "Lo que vence ese día y las órdenes ya programadas.",
            eventos: delMes.filter((e) => e.dominio === dominio && e.fecha === b.fecha),
            ots: otsDelMes.filter((o) => o.dominio === dominio && o.fecha_programada === b.fecha),
            fecha: b.fecha,
          }
    )

  // Cada día tiene un ancho mínimo real: si el mes no entra, se scrollea. Antes
  // los 31 días se apretaban en 52rem y el texto se salía del día.
  const colsMes = { gridTemplateColumns: `repeat(${nDias}, minmax(${anchoDia}px, 1fr))` }
  const anchoGrilla = { minWidth: `calc(7rem + ${nDias * anchoDia + 8}px)` }

  return (
    <div className="space-y-4">
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-sm">
        {/* Encabezado con color pleno: el mes tiene que pesar más que la grilla. */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white dark:from-slate-950 dark:to-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                <CalendarDays className="size-4" />
              </span>
              {mesLargo(ancla)}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value={fUnidad} onValueChange={(v) => setFUnidad(v ?? "todas")}>
                <SelectTrigger className="h-8 w-40 border-white/20 bg-white/10 text-white hover:bg-white/15 [&_svg]:text-white/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las unidades</SelectItem>
                  {dominios.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Ancho de los días: con el mes entero apretado en pantalla no
                  entra el texto de una OT; acá se le da aire y se scrollea. */}
              <Select value={zoom} onValueChange={(v) => v && setZoom(v as Zoom)}>
                <SelectTrigger
                  className="h-8 w-36 border-white/20 bg-white/10 text-white hover:bg-white/15 [&_svg]:text-white/70"
                  title="Ancho de cada día"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
                    <SelectItem key={z} value={z}>
                      {ZOOMS[z].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center rounded-lg border border-white/20 bg-white/10 p-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Mes anterior"
                  className="text-white hover:bg-white/20 hover:text-white"
                  onClick={() => setAncla(addMesesIso(ancla, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
                  onClick={() => setAncla(`${hoy.slice(0, 7)}-01`)}
                >
                  Hoy
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Mes siguiente"
                  className="text-white hover:bg-white/20 hover:text-white"
                  onClick={() => setAncla(addMesesIso(ancla, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px]">
            <Contador color="bg-sky-400" n={otsPendientes.length} texto="OT por hacer" />
            <Contador
              color="bg-amber-400"
              n={delMes.filter((e) => e.estado !== "vencido").length}
              texto="vence este mes"
            />
            <Contador
              color="bg-rose-500"
              n={delMes.filter((e) => e.estado === "vencido").length + arrastre.length}
              texto="vencido"
            />
            <span className="text-white/60">
              «~» = fecha estimada por el uso · el Service general cae el mismo día que dice el
              Tablero operativo
            </span>
          </div>
        </div>

        {/* Cuerpo gris: las franjas de color son lo que resalta. */}
        <div className="overflow-x-auto bg-slate-100 dark:bg-slate-900/50">
          <div style={anchoGrilla}>
            {/* Regla de días */}
            <div className="flex items-end border-b border-slate-300/70 bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="sticky left-0 z-20 w-28 shrink-0 bg-slate-200/60 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur dark:bg-slate-800/60">
                Unidad
              </div>
              <div className="grid flex-1 pr-2" style={colsMes}>
                {dias.map((d) => {
                  const esHoy = d.iso === hoy
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => abrirDia(d.iso)}
                      title={`Ver el ${fmtDia(d.iso)}`}
                      className={cn(
                        "flex flex-col items-center py-1 text-[10px] leading-tight transition-colors hover:bg-white/60 dark:hover:bg-white/10",
                        d.dow >= 5 ? "text-muted-foreground/60" : "text-muted-foreground"
                      )}
                    >
                      <span>{DIAS_LETRA[d.dow]}</span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                          esHoy ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-foreground/80"
                        )}
                      >
                        {d.n}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Una franja por unidad */}
            {mostradas.map((f) => {
              const carriles = Math.max(1, ...f.barras.map((b) => b.carril + 1))
              return (
                <div
                  key={f.dominio}
                  className="flex items-stretch border-b border-slate-200 last:border-0 odd:bg-white/70 hover:bg-white dark:border-slate-800 dark:odd:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                >
                  <button
                    type="button"
                    disabled={!puedeEditar}
                    onClick={() => onProgramar(hoy, f.dominio)}
                    title={puedeEditar ? `Programar una OT para ${f.dominio}` : f.dominio}
                    className="group sticky left-0 z-10 flex w-28 shrink-0 items-center gap-1.5 bg-slate-50 px-2 py-1.5 text-left backdrop-blur enabled:hover:bg-white disabled:cursor-default dark:bg-slate-900 dark:enabled:hover:bg-slate-800"
                  >
                    <span
                      className={cn("size-2 shrink-0 rounded-sm", colorDeUnidad.get(f.dominio))}
                    />
                    <span className="truncate text-xs font-bold tracking-tight">{f.dominio}</span>
                    {puedeEditar && (
                      <Plus className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </button>

                  <div
                    className="relative grid flex-1 gap-y-0.5 py-1 pr-2"
                    style={{
                      ...colsMes,
                      gridTemplateRows: `repeat(${carriles}, ${ALTO_CARRIL})`,
                    }}
                  >
                    {/* Fondo de las columnas: findes apagados y el día de hoy marcado. */}
                    {dias.map((d, i) => (
                      <span
                        key={d.iso}
                        aria-hidden
                        style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                        className={cn(
                          "border-l border-slate-200/70 dark:border-slate-800/70",
                          d.dow >= 5 && "bg-slate-200/50 dark:bg-slate-800/40",
                          d.iso === hoy && "bg-sky-500/10 ring-1 ring-inset ring-sky-500/30"
                        )}
                      />
                    ))}

                    {f.barras.map((b) => {
                      const span = Math.min(b.span, nDias - b.dia + 1)
                      // 🚨 El texto va SIEMPRE adentro de la barra. Cuando se
                      // dibujaba al costado, una OT del día 5 se leía encima de
                      // los días 6 y 7 y parecía que el trabajo caía ahí. Si en
                      // el ancho de la barra no entra el texto largo, entra el
                      // corto (el N° de OT, las iniciales de la tarea) y el
                      // detalle completo queda en el tooltip y en el click.
                      const disponible = span * anchoDia - 12
                      const label = anchoPx(b.texto) <= disponible ? b.texto : b.textoCorto
                      return (
                        <button
                          key={b.key}
                          type="button"
                          title={b.titulo}
                          onClick={() => abrirBarra(f.dominio, b)}
                          style={{ gridColumn: `${b.dia} / span ${span}`, gridRow: b.carril + 1 }}
                          className={cn(
                            "z-10 mx-px flex items-center justify-center overflow-hidden rounded px-1 text-[10px] font-semibold leading-none shadow-sm transition-colors",
                            CLS_BARRA[b.tono]
                          )}
                        >
                          <span className="truncate">{label}</span>
                        </button>
                      )
                    })}

                    {f.ocultas > 0 && (
                      <span
                        style={{ gridColumn: nDias, gridRow: carriles }}
                        className="z-10 self-center justify-self-end text-[10px] font-medium text-muted-foreground"
                      >
                        +{f.ocultas}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {mostradas.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Ninguna unidad tiene vencimientos ni OT en {mesLargo(ancla)}.
              </p>
            )}
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <Ref cls="bg-sky-600" texto="OT por hacer" />
          <Ref cls="bg-emerald-600/85" texto="Resuelta" />
          <Ref cls="bg-rose-600" texto="Vencido" />
          <Ref cls="bg-amber-400" texto="Por vencer" />
          <Ref cls="bg-slate-300 dark:bg-slate-600" texto="En plazo" />
          <span className="basis-full text-muted-foreground/80 sm:basis-auto">
            Cuando el día es angosto la barra muestra el N° de OT o las iniciales de la tarea:
            tocala para ver el detalle, o poné «Días anchos» para leer el texto completo.
          </span>
          {sinNada.length > 0 && (
            <button
              type="button"
              onClick={() => setVerVacias((v) => !v)}
              className="ml-auto font-medium underline-offset-2 hover:underline"
            >
              {verVacias
                ? "Ocultar las unidades sin nada este mes"
                : `Ver ${sinNada.length} ${
                    sinNada.length === 1 ? "unidad sin nada" : "unidades sin nada"
                  } este mes`}
            </button>
          )}
        </div>
      </Card>

      {detalle && (
        <DetalleDialog
          detalle={detalle}
          puedeEditar={puedeEditar}
          onProgramar={onProgramar}
          onAbrirOt={(o) => {
            setDetalle(null)
            onAbrirOt(o)
          }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  )
}

function Contador({ color, n, texto }: { color: string; n: number; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-white/80">
      <span className={cn("size-2 rounded-full", color)} />
      <span className="text-sm font-bold tabular-nums leading-none text-white">{n}</span>
      {texto}
    </span>
  )
}

function Ref({ cls, texto }: { cls: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-4 rounded-sm", cls)} />
      {texto}
    </span>
  )
}

interface Detalle {
  titulo: string
  subtitulo: string
  eventos: EventoPreventivo[]
  ots: OtProgramada[]
  /** Fecha con la que se abre el diálogo de programación desde acá. */
  fecha: string
}

function DetalleDialog({
  detalle,
  puedeEditar,
  onProgramar,
  onAbrirOt,
  onClose,
}: {
  detalle: Detalle
  puedeEditar: boolean
  onProgramar: (fecha: string, dominio?: string, tareasSugeridas?: string[]) => void
  onAbrirOt: (ot: OtProgramada) => void
  onClose: () => void
}) {
  const { titulo, subtitulo, eventos, ots, fecha } = detalle
  const porUnidad = useMemo(() => {
    const map = new Map<string, EventoPreventivo[]>()
    for (const e of eventos) {
      const arr = map.get(e.dominio)
      if (arr) arr.push(e)
      else map.set(e.dominio, [e])
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [eventos])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{subtitulo}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ots.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Órdenes programadas</Label>
              {ots.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {o.dominio}
                      {o.ot_numero && (
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          OT {o.ot_numero}
                        </span>
                      )}
                    </p>
                    {/* El taller iba pegado al final de los trabajos y el
                        truncado se lo comía. Es lo primero que se pregunta de
                        un día ("¿a dónde fue?"), así que va en su propia línea
                        y con nombre: si no está cargado, se dice. */}
                    <p className="mt-0.5 flex items-center gap-1 text-xs">
                      <Warehouse className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {o.taller ? (
                        <span className="truncate font-medium text-foreground">{o.taller}</span>
                      ) : (
                        <span className="text-muted-foreground/70">Sin taller asignado</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.tareas.join(" · ") || "Sin trabajos cargados"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(`/api/vehiculos/ot-programada/pdf?id=${o.id}`, "_blank")
                      }
                    >
                      <FileDown className="mr-1 size-4" /> PDF
                    </Button>
                    {puedeEditar && o.estado !== "realizada" && (
                      <Button size="sm" onClick={() => onAbrirOt(o)}>
                        Finalizar OT
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {porUnidad.length === 0 && ots.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No vence nada ese día.
            </p>
          )}

          {porUnidad.map(([dominio, evs]) => (
            <div key={dominio} className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{dominio}</p>
                {puedeEditar && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onProgramar(
                        fecha,
                        dominio,
                        evs.map((e) => e.tarea)
                      )
                    }
                  >
                    <Plus className="mr-1 size-4" /> Programar OT
                  </Button>
                )}
              </div>
              {evs.map((e) => (
                <div
                  key={e.tareaId}
                  className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Badge
                    variant="outline"
                    className={cn("px-1.5 py-0 text-[10px]", CLS_ESTADO_BADGE[e.estado])}
                  >
                    {e.estado === "vencido" ? "Vencido" : e.estado === "proximo" ? "Próximo" : "En plazo"}
                  </Badge>
                  <span className="text-foreground">{e.tarea}</span>
                  <span>
                    · {fmtDia(e.fecha)} · {e.estimada ? "estimado por " : "por "}
                    {e.eje === "tiempo" ? "plazo" : e.eje === "km" ? "kilómetros" : "horas"}
                    {e.detalle ? ` · ${e.detalle}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
