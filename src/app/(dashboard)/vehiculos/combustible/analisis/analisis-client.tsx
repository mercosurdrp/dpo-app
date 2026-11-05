"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Fuel, FileText, Loader2, Trophy, Info } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  getAnalisisCombustible,
  type AnalisisCombustible,
  type CombustibleCamion,
  type CombustibleChofer,
} from "@/actions/combustible-analisis"
import { ConsumoUrea } from "../consumo-urea"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const nf = new Intl.NumberFormat("es-AR")
const nf2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

function mesLargo(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return `${MESES[m - 1] ?? mes} ${y}`
}

/** Color del rendimiento de un camión según su desvío vs la flota. */
function semaforo(desvio: number | null): { label: string; cls: string } {
  if (desvio == null) return { label: "—", cls: "bg-slate-100 text-slate-500" }
  if (desvio >= -3) return { label: "OK", cls: "bg-emerald-100 text-emerald-700" }
  if (desvio >= -10) return { label: "Atención", cls: "bg-amber-100 text-amber-700" }
  return { label: "Crítico", cls: "bg-rose-100 text-rose-700" }
}

export function AnalisisCombustibleClient({ inicial }: { inicial: AnalisisCombustible }) {
  const [data, setData] = useState(inicial)
  const [mes, setMes] = useState(inicial.mes)
  const [cargando, startCarga] = useTransition()
  const [verJustificacion, setVerJustificacion] = useState(false)

  function cambiarMes(nuevo: string) {
    setMes(nuevo)
    startCarga(async () => {
      const res = await getAnalisisCombustible(nuevo)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setData(res.data)
    })
  }

  const cumpleMeta =
    data.rendimiento_flota != null && data.meta_flota != null
      ? data.rendimiento_flota >= data.meta_flota
      : null
  const eerr = data.eerr_gasoil
  const desvioEerr =
    eerr && eerr.presup > 0 ? ((eerr.real - eerr.presup) / eerr.presup) * 100 : null

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Fuel className="mt-1 size-6 shrink-0 text-sky-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Análisis de Combustible</h1>
            <p className="text-sm text-muted-foreground">
              Consumo, kilómetros y rendimiento (km/l) por camión y por chofer contra la meta de la
              flota y el piso por unidad. Los de peor rendimiento son el foco del plan de acción
              (DPO Flota 3.3).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => cambiarMes(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {data.meses_disponibles.map((m) => (
              <option key={m} value={m}>
                {mesLargo(m)}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/vehiculos/combustible/pdf?mes=${mes}`, "_blank")}
            disabled={data.camiones.length === 0}
          >
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Rendimiento flota"
          valor={data.rendimiento_flota != null ? `${nf2.format(data.rendimiento_flota)} km/l` : "—"}
          sub={
            data.meta_flota != null
              ? `meta ≥ ${nf2.format(data.meta_flota)}${data.l_100km_flota != null ? ` · ${nf2.format(data.l_100km_flota)} L/100km` : ""}`
              : data.l_100km_flota != null
                ? `${nf2.format(data.l_100km_flota)} L/100km`
                : ""
          }
          tono={cumpleMeta == null ? "neutro" : cumpleMeta ? "ok" : "mal"}
          destacado
        />
        <Kpi
          label="Camiones de reparto"
          valor={nf.format(data.total_camiones)}
          sub={`${nf.format(data.total_cargas)} cargas de gasoil`}
        />
        <Kpi label="Litros cargados" valor={nf.format(data.total_litros)} sub={`${nf.format(data.total_km)} km con medición`} />
        <Kpi
          label="Litros sin registrar"
          valor={`${nf.format(data.litros_sin_registrar)} L`}
          sub={
            data.total_sin_registrar > 0
              ? `${nf.format(data.total_sin_registrar)} ${data.total_sin_registrar === 1 ? "carga sospechosa" : "cargas sospechosas"} · meta 0`
              : "ninguna carga sospechosa · meta 0"
          }
          tono={data.total_sin_registrar > 0 ? "mal" : "ok"}
        />
        <Kpi
          label="Camiones +7 días sin carga"
          valor={nf.format(data.camiones_hueco_7d)}
          sub="hueco entre cargas en el mes · meta 0"
          tono={data.camiones_hueco_7d > 0 ? "mal" : "ok"}
        />
        <Kpi
          label="EERR gasoil"
          valor={eerr ? money(eerr.real) : "—"}
          sub={
            eerr
              ? `ppto ${money(eerr.presup)}${desvioEerr != null ? ` · ${desvioEerr > 0 ? "+" : ""}${nf.format(Math.round(desvioEerr))} %` : ""}`
              : "mes sin cerrar en el Estado de Resultado"
          }
          tono={desvioEerr == null ? "neutro" : desvioEerr > 0 ? "mal" : "ok"}
        />
      </div>

      {/* Justificación del KPI (R3.3.3) */}
      {data.justificacion_kpi && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-700">
          <button
            type="button"
            onClick={() => setVerJustificacion((v) => !v)}
            className="flex w-full items-center gap-2 text-left font-medium text-sky-800"
          >
            <Info className="size-4 shrink-0" />
            Por qué el KPI es km/l por camión {verJustificacion ? "▾" : "▸"}
          </button>
          {verJustificacion && <p className="mt-2 leading-relaxed">{data.justificacion_kpi}</p>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Tabla por camión */}
        <Card className="overflow-hidden p-0 xl:col-span-3">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
            <h3 className="text-sm font-semibold text-slate-800">
              Consumo por camión {cargando && <Loader2 className="ml-1 inline size-3 animate-spin" />}
            </h3>
            <span className="text-xs text-muted-foreground">
              peor rendimiento primero · piso {nf2.format(data.piso_unidad)} km/l
            </span>
          </div>
          {data.camiones.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No hay cargas de combustible en {mesLargo(mes)}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Camión</th>
                    <th className="px-3 py-2 text-right font-medium">Cargas</th>
                    <th className="px-3 py-2 text-right font-medium">Litros</th>
                    <th className="px-3 py-2 text-right font-medium">Km</th>
                    <th className="px-3 py-2 text-right font-medium">Rend. (km/l)</th>
                    <th className="px-3 py-2 text-right font-medium">L/100km</th>
                    <th className="px-3 py-2 text-right font-medium">vs Flota</th>
                    <th className="px-3 py-2 text-right font-medium" title="Cargas con una carga sin registrar en el medio (rendimiento imposible): no entran al km/l. Entre paréntesis, sus litros.">Sin registrar</th>
                    <th className="px-3 py-2 text-right font-medium" title="Hueco más largo entre cargas dentro del mes, contando desde la última carga hasta el cierre. Más de 7 días incumple la política.">Hueco máx.</th>
                    <th className="px-3 py-2 text-center font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.camiones.map((c) => (
                    <Fila key={c.dominio} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Ranking por chofer (GOP 817) */}
        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Trophy className="size-4 text-amber-500" /> Ranking por chofer
            </h3>
            <span className="text-xs text-muted-foreground">mejor primero</span>
          </div>
          {data.choferes.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sin cargas de reparto en el mes.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Chofer</th>
                    <th className="px-3 py-2 text-right font-medium">km/l</th>
                    <th className="px-3 py-2 text-right font-medium">Km</th>
                    <th className="px-3 py-2 text-right font-medium">Cargas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.choferes.map((c) => (
                    <FilaChofer key={c.chofer} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-2 text-[11px] leading-tight text-muted-foreground">
            El tramo entre dos cargas se le asigna al chofer que registró la carga que lo cierra.
            Los tres primeros se reconocen en la matinal; debajo del piso ({nf2.format(data.piso_unidad)} km/l)
            corresponde instrucción individual.
          </p>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Rendimiento = km ÷ litros (km/l): a mayor número, mejor. Usa solo las cargas con medición de km
        (la 1ª carga de cada camión no la tiene) y excluye los tramos con una carga sin registrar en el
        medio. “vs Flota” compara contra el promedio del mes. Los meses fuera de meta llevan plan de acción en{" "}
        <Link href="/vehiculos/mantenimiento?tab=indicadores" className="text-sky-700 hover:underline">
          Indicadores de Flota
        </Link>
        .
      </p>

      {/* Urea: estaba en la solapa de Check lists de Mantenimiento, donde no
          pinta nada. Es un consumo por unidad y su lectura es la misma que la de
          arriba (km entre cargas), así que vive acá. No entra en el km/l ni en
          el costo de combustible: se lee aparte. */}
      <ConsumoUrea />
    </div>
  )
}

function Fila({ c }: { c: CombustibleCamion }) {
  const s = semaforo(c.desvio_pct)
  const huecoMal = c.max_hueco_dias != null && c.max_hueco_dias > 7
  return (
    <tr className="border-b last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-2">
        <span className="font-medium text-slate-900">{c.dominio}</span>
        {(c.modelo || c.descripcion) && (
          <span className="ml-1 text-xs text-muted-foreground">{c.modelo || c.descripcion}</span>
        )}
        {!c.en_flota && (
          <span
            className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] uppercase text-slate-500"
            title="Autoelevador o camioneta: su consumo se registra pero no entra al km/l de la flota de reparto ni a los PI"
          >
            fuera del km/l flota
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.cargas)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.litros)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.km)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${c.bajo_piso ? "text-rose-700" : "text-slate-900"}`}>
        {c.rendimiento != null ? nf2.format(c.rendimiento) : "—"}
        {c.bajo_piso && <span className="ml-1 text-[10px] font-normal uppercase">bajo piso</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
        {c.l_100km != null ? nf2.format(c.l_100km) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {c.desvio_pct != null ? (
          <span className={c.desvio_pct < 0 ? "text-rose-700" : "text-emerald-700"}>
            {c.desvio_pct > 0 ? "+" : ""}
            {nf2.format(c.desvio_pct)}%
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {c.cargas_sin_registrar > 0 ? (
          <span
            className="font-semibold text-rose-700"
            title="Tramos con rendimiento imposible: hubo una carga que no se anotó en la app. Se excluyen del km/l."
          >
            {c.cargas_sin_registrar}
            <span className="ml-1 text-[11px] font-normal">({nf.format(c.litros_sin_registrar)} L)</span>
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {c.max_hueco_dias != null ? (
          <span className={huecoMal ? "font-semibold text-rose-700" : "text-slate-700"}>
            {c.max_hueco_dias} d
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        {c.rendimiento == null && c.cargas_sin_registrar > 0 ? (
          <Badge className="border-0 bg-rose-100 text-rose-700">Sin dato válido</Badge>
        ) : (
          <Badge className={`${s.cls} border-0`}>{s.label}</Badge>
        )}
      </td>
    </tr>
  )
}

function FilaChofer({ c }: { c: CombustibleChofer }) {
  const top3 = c.puesto != null && c.puesto <= 3
  return (
    <tr className={`border-b last:border-0 ${top3 ? "bg-amber-50/60" : "hover:bg-slate-50/60"}`}>
      <td className="px-3 py-2 tabular-nums text-slate-700">
        {c.puesto != null ? (top3 ? <span className="font-semibold text-amber-700">{c.puesto}</span> : c.puesto) : "—"}
      </td>
      <td className="px-3 py-2">
        <span className="font-medium text-slate-900">{c.chofer}</span>
        <span className="ml-1 text-[11px] text-muted-foreground">{c.camiones.join(", ")}</span>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${c.bajo_piso ? "text-rose-700" : "text-slate-900"}`}>
        {c.rendimiento != null ? nf2.format(c.rendimiento) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.km)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.cargas)}</td>
    </tr>
  )
}

function Kpi({
  label,
  valor,
  sub,
  destacado,
  tono = "neutro",
}: {
  label: string
  valor: string
  sub?: string
  destacado?: boolean
  tono?: "neutro" | "ok" | "mal"
}) {
  const colorValor =
    tono === "ok"
      ? "text-emerald-600"
      : tono === "mal"
        ? "text-rose-600"
        : destacado
          ? "text-sky-600"
          : "text-slate-900"
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${colorValor}`}>{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}
