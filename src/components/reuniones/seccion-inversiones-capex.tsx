"use client"

import Link from "next/link"
import { ExternalLink, Landmark } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  agendaInversiones,
  type InversionConDesvios,
  type InversionesCapexReunionData,
} from "@/lib/reuniones-inversiones-capex"
import { formatFechaCorta, type Semaforo } from "@/lib/inversiones-seguimiento"
import {
  ESTADO_INVERSION_BADGE_CLASS,
  ESTADO_INVERSION_LABEL,
} from "@/components/presupuesto/inversiones-constantes"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

const fmtMoney = (n: number | null) =>
  n === null
    ? "—"
    : "$" +
      new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(
        Math.round(n || 0),
      )

const SEMAFORO_BADGE: Record<Semaforo, string> = {
  ok: "border-emerald-200 bg-emerald-100 text-emerald-700",
  atencion: "border-amber-200 bg-amber-100 text-amber-800",
  critico: "border-red-200 bg-red-100 text-red-700",
}

function Tile({
  label,
  valor,
  detalle,
  tono = "neutro",
}: {
  label: string
  valor: string
  detalle?: React.ReactNode
  tono?: "neutro" | "bien" | "atencion" | "mal"
}) {
  const color =
    tono === "bien"
      ? "text-emerald-700"
      : tono === "atencion"
        ? "text-amber-700"
        : tono === "mal"
          ? "text-red-700"
          : "text-slate-900"
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

function Fila({ item }: { item: InversionConDesvios }) {
  const { inv, tiempo, monto } = item
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900" title={inv.titulo}>
          {inv.titulo}
        </p>
        <p className="text-xs text-slate-500">
          prog. {formatFechaCorta(inv.fecha_programada)}
          {inv.fecha_realizada && inv.estado === "realizada" && (
            <> · real {formatFechaCorta(inv.fecha_realizada)}</>
          )}
          {" · "}
          {fmtMoney(inv.monto_estimado)}
          {inv.monto_real !== null && <> → {fmtMoney(inv.monto_real)}</>}
          {!inv.evidencia_url && (
            <span className="ml-1 text-amber-700">· sin cotización</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Badge
          className={`${ESTADO_INVERSION_BADGE_CLASS[inv.estado]} px-1.5 py-0 text-[10px] hover:opacity-100`}
        >
          {ESTADO_INVERSION_LABEL[inv.estado]}
        </Badge>
        {tiempo && (
          <Badge
            className={`${SEMAFORO_BADGE[tiempo.semaforo]} px-1.5 py-0 text-[10px] hover:opacity-100`}
            title={tiempo.vencida ? "Días desde la fecha programada" : "Fin real vs programado"}
          >
            {tiempo.vencida ? "vencida " : ""}
            {tiempo.dias === 0
              ? "en fecha"
              : `${tiempo.dias > 0 ? "+" : "−"}${Math.abs(tiempo.dias)} d`}
          </Badge>
        )}
        {monto && (
          <Badge
            className={`${SEMAFORO_BADGE[monto.semaforo]} px-1.5 py-0 text-[10px] hover:opacity-100`}
            title="Real vs estimado"
          >
            {monto.pct > 0 ? "+" : ""}
            {monto.pct.toFixed(1).replace(".", ",")} %
          </Badge>
        )}
      </div>
    </li>
  )
}

function Lista({
  titulo,
  items,
  vacio,
}: {
  titulo: string
  items: InversionConDesvios[]
  vacio: string
}) {
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {titulo}
        <span className="ml-1 font-normal normal-case text-slate-400">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="py-1.5 text-xs text-slate-400">{vacio}</p>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <Fila key={it.inv.id} item={it} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Temario de Inversiones / CAPEX en la Reunión de Presupuesto: el mismo
 * criterio que la solapa Inversiones de /presupuesto (desvío de plazo y de
 * monto por inversión, presupuesto CAPEX del año), recortado a lo que la
 * reunión decide: qué pasó con lo programado para el mes cerrado, qué quedó
 * vencido y qué viene. La edición se hace en /presupuesto.
 */
export function SeccionInversionesCapex({ data }: { data: InversionesCapexReunionData }) {
  const a = agendaInversiones(data)
  const r = a.resumen
  const base = r.presupuesto && r.presupuesto > 0 ? r.presupuesto : null
  const pctEjec = base ? Math.round((r.ejecutado / base) * 100) : null
  const excedido = r.disponible !== null && r.disponible < 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Landmark className="size-5 text-slate-500" />
            Inversiones / CAPEX {data.anio} · cierre de {MESES[data.mesCierre - 1]}
          </span>
          <Link
            href="/presupuesto"
            className="flex items-center gap-1 text-xs font-normal text-blue-600 hover:underline"
          >
            Ver Gantt y seguimiento en Presupuesto
            <ExternalLink className="size-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">
          Seguimiento mensual del registro de solicitudes de CAPEX (DPO 5.3):
          qué estaba programado para el mes, qué se hizo y con qué desvío de
          plazo y de monto, qué quedó vencido y qué viene en los próximos 60
          días. Lo que se decida queda en el Action Log.
        </p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            label="Presupuesto CAPEX"
            valor={r.presupuesto === null ? "sin cargar" : fmtMoney(r.presupuesto)}
            detalle={
              r.presupuesto === null
                ? "Cargarlo en Presupuesto → Inversiones → Seguimiento CAPEX"
                : `${r.nTotal} inversiones · comprometido ${fmtMoney(r.comprometido)}`
            }
            tono={r.presupuesto === null ? "atencion" : "neutro"}
          />
          <Tile
            label="Ejecutado"
            valor={fmtMoney(r.ejecutado)}
            detalle={
              pctEjec !== null
                ? `${pctEjec} % del presupuesto · pendiente ${fmtMoney(r.pendiente)}`
                : `pendiente ${fmtMoney(r.pendiente)}`
            }
          />
          <Tile
            label={excedido ? "Excede el presupuesto" : "Disponible"}
            valor={r.disponible === null ? "—" : fmtMoney(Math.abs(r.disponible))}
            tono={excedido ? "mal" : r.disponible === null ? "neutro" : "bien"}
            detalle="presupuesto − comprometido"
          />
          <Tile
            label="En plazo y en presupuesto"
            valor={`${r.nEnPlazo} / ${r.nEnPresupuesto}`}
            detalle={`de ${r.nRealizadas} realizadas · ${r.nTarde} tarde · ${r.nSobrePresupuesto} se pasaron`}
            tono={
              r.nRealizadas === 0
                ? "neutro"
                : r.nTarde + r.nSobrePresupuesto === 0
                  ? "bien"
                  : r.nTarde + r.nSobrePresupuesto <= 2
                    ? "atencion"
                    : "mal"
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Lista
            titulo={`Programadas para ${MESES[data.mesCierre - 1]}`}
            items={a.delMes}
            vacio="Nada programado para el mes."
          />
          <Lista
            titulo={`Realizadas en ${MESES[data.mesCierre - 1]}`}
            items={a.realizadasMes}
            vacio="No se concretó ninguna en el mes."
          />
          <Lista
            titulo="Vencidas (abiertas con fecha pasada)"
            items={a.vencidas}
            vacio="Ninguna vencida."
          />
          <Lista
            titulo="Próximos 60 días"
            items={a.proximas}
            vacio="Nada programado en los próximos 60 días."
          />
        </div>

        {a.sinEvidencia > 0 && (
          <p className="text-xs text-amber-700">
            {a.sinEvidencia} inversiones sin cotización ni factura adjunta. El
            5.3 pide al menos una cotización por proyecto en el registro.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
