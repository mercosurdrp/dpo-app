"use client"

// Vista del OPERARIO — mobile-first. Un bloque por cada cosa que hizo en el
// mes; lo que no hizo, no se muestra. Nadie tiene "grupo" fijo: el mismo día
// se puede pickear, manejar la máquina y clasificar envases.

import { useRouter } from "next/navigation"
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Forklift,
  Gauge,
  PackageCheck,
  Truck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  DiaMinutos,
  DiaPicking,
  MiProductividad,
  ResumenTramo,
} from "@/actions/mi-productividad"

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function nombreMesLargo(mes: string): string {
  const [a, m] = mes.split("-")
  return `${NOMBRES_MES[Number(m) - 1]} ${a}`
}

/** Corre un "YYYY-MM" N meses. */
function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map((x) => parseInt(x, 10))
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Mes actual en hora Argentina. */
function mesActual(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

const fmt = (n: number, dec = 0) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec })

function diaCorto(fecha: string): string {
  const [, m, d] = fecha.split("-")
  return `${d}/${m}`
}

export function MiProductividadClient({ data }: { data: MiProductividad }) {
  const router = useRouter()
  const { mes, nombre, operario, picking, carga, descarga, envases, parcial } = data

  const hoyMes = mesActual()
  const puedeAvanzar = mes < hoyMes
  const irA = (m: string) => router.push(`/mi-productividad?mes=${m}`)

  const hayAlgo = Boolean(picking || carga || descarga || envases)

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {/* Header + selector de mes */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Gauge className="size-5 text-cyan-600" />
            Mi productividad
          </h1>
          <p className="truncate text-sm text-muted-foreground">{nombre}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => irA(sumarMeses(mes, -1))}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="w-28 text-center text-sm font-medium text-slate-700">
            {nombreMesLargo(mes)}
          </span>
          <button
            onClick={() => puedeAvanzar && irA(sumarMeses(mes, 1))}
            disabled={!puedeAvanzar}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {parcial && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Alguno de los datos del depósito no respondió. Lo que ves puede estar incompleto —
          probá de nuevo en un rato.
        </p>
      )}

      {!hayAlgo && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No hay registros tuyos en {nombreMesLargo(mes)}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {operario
                ? "Probá con otro mes."
                : "Todavía no encontramos tu nombre en los registros del depósito. Avisale a tu supervisor para que lo revise."}
            </p>
          </CardContent>
        </Card>
      )}

      {picking && <BloquePicking dias={picking.dias} promedio={picking.promedio} mejor={picking.mejor} />}
      {carga && <BloqueTramo titulo="Carga de camiones" icono={Truck} resumen={carga} />}
      {descarga && <BloqueTramo titulo="Descarga de camiones" icono={Forklift} resumen={descarga} />}
      {envases && <BloqueEnvases envases={envases} />}
    </div>
  )
}

// ── Picking ────────────────────────────────────────────────────────────────

function BloquePicking({
  dias,
  promedio,
  mejor,
}: {
  dias: DiaPicking[]
  promedio: number
  mejor: DiaPicking | null
}) {
  const tope = Math.max(...dias.map((d) => d.bul_hh), 1)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="size-4 text-blue-600" />
          Picking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Dato valor={fmt(promedio)} unidad="bultos/hora" etiqueta="Tu promedio" destacado />
          <Dato valor={fmt(dias.length)} unidad={dias.length === 1 ? "día" : "días"} etiqueta="Trabajados" />
          <Dato valor={mejor ? fmt(mejor.bul_hh) : "—"} unidad="bultos/hora" etiqueta="Tu mejor día" />
        </div>
        <ListaDias
          filas={dias.map((d) => ({
            fecha: d.fecha,
            valor: d.bul_hh,
            texto: `${fmt(d.bul_hh)} bul/h`,
            pct: (d.bul_hh / tope) * 100,
            detalle: d.grupo,
          }))}
          color="bg-blue-500"
        />
      </CardContent>
    </Card>
  )
}

// ── Maquinistas: minutos por camión ────────────────────────────────────────

function BloqueTramo({
  titulo,
  icono: Icono,
  resumen,
}: {
  titulo: string
  icono: typeof Truck
  resumen: ResumenTramo
}) {
  // Acá menos es mejor, así que la barra se dibuja invertida: la más corta es
  // la del día más rápido.
  const tope = Math.max(...resumen.dias.map((d: DiaMinutos) => d.min_camion), 1)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icono className="size-4 text-emerald-600" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Dato valor={fmt(resumen.min_camion, 1)} unidad="min/camión" etiqueta="Tu promedio" destacado />
          <Dato valor={fmt(resumen.camiones)} unidad="camiones" etiqueta="Hiciste" />
          <Dato valor={fmt(resumen.pallets)} unidad="pallets" etiqueta="Movidos" />
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Son los minutos que tardás por camión: acá <strong>menos es mejor</strong>.
          {resumen.en_equipo > 0 && (
            <>
              {" "}
              {resumen.en_equipo} {resumen.en_equipo === 1 ? "camión lo hiciste" : "camiones los hiciste"} entre
              dos — ahí se cuenta el tiempo que estuviste vos.
            </>
          )}
        </p>
        <ListaDias
          filas={resumen.dias.map((d) => ({
            fecha: d.fecha,
            valor: d.min_camion,
            texto: `${fmt(d.min_camion, 1)} min`,
            pct: (d.min_camion / tope) * 100,
            detalle: `${d.camiones} ${d.camiones === 1 ? "camión" : "camiones"}`,
          }))}
          color="bg-emerald-500"
        />
      </CardContent>
    </Card>
  )
}

// ── Clasificación de envases ───────────────────────────────────────────────

function BloqueEnvases({ envases }: { envases: NonNullable<MiProductividad["envases"]> }) {
  const { dias, totales } = envases
  const tope = Math.max(...dias.map((d) => d.cajones_por_hora), 1)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="size-4 text-amber-600" />
          Clasificación de envases
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Dato valor={fmt(totales.cajones_por_hora, 1)} unidad="cajones/hora" etiqueta="Tu promedio" destacado />
          <Dato valor={fmt(totales.cajones_total)} unidad="cajones" etiqueta="Clasificaste" />
          <Dato valor={fmt(totales.horas, 1)} unidad="horas" etiqueta="Trabajadas" />
        </div>
        <ListaDias
          filas={dias.map((d) => ({
            fecha: d.fecha,
            valor: d.cajones_por_hora,
            texto: `${fmt(d.cajones_por_hora, 1)} caj/h`,
            pct: (d.cajones_por_hora / tope) * 100,
            detalle: `${fmt(d.cajones_total)} cajones`,
          }))}
          color="bg-amber-500"
        />
      </CardContent>
    </Card>
  )
}

// ── Piezas compartidas ─────────────────────────────────────────────────────

function Dato({
  valor,
  unidad,
  etiqueta,
  destacado = false,
}: {
  valor: string
  unidad: string
  etiqueta: string
  destacado?: boolean
}) {
  return (
    <div className={`rounded-lg px-2 py-3 ${destacado ? "bg-slate-900 text-white" : "bg-slate-50"}`}>
      <p className={`text-xl font-bold leading-none ${destacado ? "text-white" : "text-slate-900"}`}>
        {valor}
      </p>
      <p className={`mt-1 text-[10px] ${destacado ? "text-slate-300" : "text-slate-500"}`}>{unidad}</p>
      <p className={`mt-1.5 text-[11px] font-medium ${destacado ? "text-slate-200" : "text-slate-600"}`}>
        {etiqueta}
      </p>
    </div>
  )
}

interface FilaDia {
  fecha: string
  valor: number
  texto: string
  pct: number
  detalle?: string | null
}

function ListaDias({ filas, color }: { filas: FilaDia[]; color: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-500">Día por día</p>
      {filas.map((f) => (
        <div key={f.fecha} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-xs tabular-nums text-slate-500">{diaCorto(f.fecha)}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className={`h-full ${color} transition-all`}
              style={{ width: `${Math.max(4, Math.min(100, f.pct))}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
            {f.texto}
          </span>
        </div>
      ))}
      {filas.some((f) => f.detalle) && (
        <p className="pt-1 text-[11px] text-slate-400">
          {filas
            .filter((f) => f.detalle)
            .slice(-1)
            .map((f) => `Último día: ${f.detalle}`)}
        </p>
      )}
    </div>
  )
}
