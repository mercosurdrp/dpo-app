"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { Activity, ArrowDownRight, ArrowUpRight, ExternalLink, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { getSciReunionData, guardarCausaSci, type SciReunionData } from "@/actions/reuniones-sci"
import { DIAS_SEMANA_CORTO, MESES_LARGO } from "@/lib/sci"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

export const SECCION_SCI = "sci"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

function fmtN(n: number | null | undefined, dec = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n)
}
function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}
function mesCerradoAnterior(fechaReunion: string): string {
  const [y, m] = fechaReunion.slice(0, 7).split("-").map(Number)
  if (!y || !m) return fechaReunion.slice(0, 7)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

/**
 * Curva de ventas (SCI) — etapa propia de la Reunión Ventas-Logística.
 * Evidencia de R4.3.3 (Planeamiento 4.3) y del KPI 2 del TOR: SCI del mes
 * cerrado vs año anterior, días pico con su causa, reparto por día de semana
 * y Action Log acotado a la sección.
 */
export function SeccionSci({
  fechaReunion,
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [periodo, setPeriodo] = useState(() => mesCerradoAnterior(fechaReunion))
  const [data, setData] = useState<SciReunionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancel = false
    const [y, m] = periodo.split("-").map(Number)
    void getSciReunionData({ fechaReunion, anio: y, mes: m }).then((res) => {
      if (cancel) return
      if ("error" in res) {
        toast.error(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [fechaReunion, periodo, reload])

  const mes = data?.mesActual ?? null
  const aa = data?.mesAA ?? null
  const delta = mes?.sci != null && aa?.sci != null ? mes.sci - aa.sci : null
  const mejora = delta !== null ? delta < 0 : null
  const ev = data?.evaluacion ?? null
  const usaFacturacion =
    !!data?.distribucionDesde && mes ? `${mes.key}-01` < data.distribucionDesde : false

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-indigo-900">
          <Activity className="size-5 text-indigo-600" />
          Curva de ventas (SCI)
          {mes && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {MESES_LARGO[mes.mes - 1]} {mes.anio}
              {mes.parcial ? " · en curso" : " · mes cerrado"}
            </Badge>
          )}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">Mes</label>
          <input
            type="month"
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value || mesCerradoAnterior(fechaReunion))
              setLoading(true)
            }}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
          />
          <Link
            href="/indicadores/sci"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium shadow-sm hover:bg-slate-50"
          >
            <ExternalLink className="mr-1 size-3.5" />
            Ver detalle
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Calculando la curva de ventas…
          </div>
        ) : !data || !mes || mes.sci === null ? (
          <div className="rounded-md border border-dashed border-indigo-300 bg-white py-8 text-center text-sm text-muted-foreground">
            Sin datos suficientes para ese mes (hacen falta al menos 5 días con reparto).
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label={`SCI ${MESES_LARGO[mes.mes - 1]}`}
                value={`${fmtN(mes.sci, 1)} %`}
                sub={`${fmtN(mes.promedio)} HL/día ± ${fmtN(mes.desvio)} · ${mes.dias} días`}
                valueClassName={mejora === null ? undefined : mejora ? "text-emerald-600" : "text-red-600"}
              />
              <KpiCard
                label={`Mismo mes ${mes.anio - 1}`}
                value={aa?.sci != null ? `${fmtN(aa.sci, 1)} %` : "—"}
                sub={
                  delta !== null ? (
                    <span className={cn("inline-flex items-center gap-0.5", mejora ? "text-emerald-600" : "text-red-600")}>
                      {mejora ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                      {delta > 0 ? "+" : ""}
                      {fmtN(delta, 1)} pp {mejora ? "mejor" : "peor"} (menor es mejor)
                    </span>
                  ) : (
                    "sin dato del año anterior"
                  )
                }
              />
              <KpiCard
                label="SCI de PDVs (paradas)"
                value={mes.sciPdv != null ? `${fmtN(mes.sciPdv, 1)} %` : "—"}
                sub={`${fmtN(mes.clientesProm)} clientes/día ± ${fmtN(mes.clientesDesvio)}`}
              />
              <KpiCard
                label="Día pico"
                value={mes.picoFecha ? `${fmtN(mes.picoHl)} HL` : "—"}
                sub={
                  mes.picoFecha
                    ? `${fmtFecha(mes.picoFecha)} · ${fmtN(mes.picoRatio, 2)}× el promedio${
                        data.valle ? ` · mínimo ${fmtN(data.valle.hl)} HL el ${fmtFecha(data.valle.fecha)}` : ""
                      }`
                    : undefined
                }
              />
            </div>

            {/* Criterios DPO */}
            {ev && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-normal",
                    ev.mejoraVsAA === null
                      ? ""
                      : ev.mejoraVsAA
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-red-300 bg-red-50 text-red-800",
                  )}
                >
                  Año a la fecha: {fmtN(ev.ytd, 1)} % vs {fmtN(ev.ytdAA, 1)} % en {mes.anio - 1}
                  {ev.mejoraVsAA === null ? "" : ev.mejoraVsAA ? " · mejor que el año anterior" : " · peor que el año anterior"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-normal",
                    ev.tendencia3 === null
                      ? ""
                      : ev.tendencia3
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-amber-300 bg-amber-50 text-amber-800",
                  )}
                >
                  Últimos 3 meses cerrados:{" "}
                  {ev.ultimos3.length
                    ? ev.ultimos3.map((u) => `${MESES_LARGO[u.mes - 1].slice(0, 3).toLowerCase()} ${fmtN(u.sci, 1)}`).join(" → ")
                    : "—"}
                  {ev.tendencia3 === null ? "" : ev.tendencia3 ? " · tendencia positiva" : " · sin tendencia positiva"}
                </Badge>
                {usaFacturacion && (
                  <Badge variant="outline" className="font-normal border-slate-300 text-slate-600">
                    † Mes anterior a las planillas de carga: HL de facturación, no comparable al decimal
                  </Badge>
                )}
              </div>
            )}

            {/* Días pico con causa */}
            <div className="rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                Días que se salieron de la banda (más de {fmtN(mes.promedio + mes.desvio)} HL = promedio + 1 desvío)
                <span className="ml-1 font-normal text-muted-foreground">({data.picos.length})</span>
              </div>
              {data.picos.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Ningún día se salió de la banda. Curva pareja.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Día</TableHead>
                      <TableHead className="text-right">HL</TableHead>
                      <TableHead className="text-right">× prom.</TableHead>
                      <TableHead>Causa (se carga en la reunión)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.picos.map((p) => (
                      <TableRow key={p.fecha}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {DIAS_SEMANA_CORTO[p.diaSemana - 1] ?? "Dom"} {fmtFecha(p.fecha)}
                          {p.feriado && (
                            <span className="ml-1 text-[10px] text-muted-foreground">({p.feriado})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(p.hl)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-amber-700">
                          {fmtN(p.ratio, 2)}×
                        </TableCell>
                        <TableCell>
                          <CausaInput
                            key={`${p.fecha}|${p.causa ?? ""}`}
                            reunionId={reunionId}
                            fecha={p.fecha}
                            inicial={p.causa}
                            puedeEditar={puedeEditar && data.causasDisponibles}
                            onSaved={() => {
                              setLoading(true)
                              setReload((k) => k + 1)
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!data.causasDisponibles && (
                <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Las causas todavía no se pueden guardar: falta aplicar la migración
                  20261019120000_sci_causas_dia.sql en Supabase.
                </p>
              )}
            </div>

            {/* Reparto por día de semana */}
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold text-slate-800">
                % del volumen por día de semana
                <span className="ml-1 font-normal text-muted-foreground">
                  · barra: {MESES_LARGO[mes.mes - 1]} {mes.anio} · marca: mismo mes {mes.anio - 1}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {DIAS_SEMANA_CORTO.map((d, i) => {
                  const v = data.pctDiaSemana[i] ?? 0
                  const vAA = data.pctDiaSemanaAA?.[i] ?? null
                  const max = Math.max(30, ...data.pctDiaSemana, ...(data.pctDiaSemanaAA ?? []))
                  return (
                    <div key={d} className="text-center">
                      <div className="relative mx-auto h-20 w-8 rounded-sm bg-slate-100">
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-sm bg-indigo-500"
                          style={{ height: `${Math.min(100, (v / max) * 100)}%` }}
                          title={`${d}: ${fmtN(v, 1)} %`}
                        />
                        {vAA !== null && (
                          <div
                            className="absolute left-0 right-0 h-0.5 bg-slate-700"
                            style={{ bottom: `${Math.min(100, (vAA / max) * 100)}%` }}
                            title={`${d} ${mes.anio - 1}: ${fmtN(vAA, 1)} %`}
                          />
                        )}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-700">{d}</div>
                      <div className="text-[11px] tabular-nums text-slate-900">{fmtN(v, 1)} %</div>
                      {vAA !== null && (
                        <div className="text-[10px] tabular-nums text-muted-foreground">{fmtN(vAA, 1)} %</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Un día que queda sistemáticamente abajo es capacidad ociosa; uno que queda arriba obliga a
                camiones u horas extra. Se corrige moviendo clientes de día de visita y entrega (plan territorial).
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground">
              SCI = desvío estándar de los HL distribuidos por día ÷ promedio diario × 100 (menor = curva más
              plana). Fuente: planillas de carga Chess + repartos GESCOM (ventas_diarias), sin domingos ni días sin
              reparto. Quilmes no fija objetivo: la referencia es el año anterior (Planeamiento 4.3 R4.3.3 ·
              Entrega 3.1 KPI 7 · TOR KPI 2).
            </p>

            {/* Action Log de la sección */}
            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo="logistica-ventas"
              seccion={SECCION_SCI}
              titulo="Curva de ventas (SCI)"
              actividades={actividades}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onActividadesChanged}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CausaInput({
  reunionId,
  fecha,
  inicial,
  puedeEditar,
  onSaved,
}: {
  reunionId: string
  fecha: string
  inicial: string | null
  puedeEditar: boolean
  onSaved: () => void
}) {
  // Se remonta por `key` cuando cambia la causa guardada, así no hace falta sincronizar por efecto.
  const [valor, setValor] = useState(inicial ?? "")
  const [pendiente, start] = useTransition()
  const cambiado = valor.trim() !== (inicial ?? "")

  if (!puedeEditar) {
    return <span className={cn("text-sm", !inicial && "text-muted-foreground italic")}>{inicial ?? "sin causa"}</span>
  }

  function guardar() {
    start(async () => {
      const res = await guardarCausaSci({ reunionId, fecha, causa: valor })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(res.data.causa ? "Causa guardada" : "Causa borrada")
      onSaved()
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cambiado) guardar()
        }}
        placeholder="Cliente grande, promoción, cierre de mes…"
        className="h-8 w-full min-w-[12rem] rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
        maxLength={500}
      />
      <Button
        type="button"
        size="sm"
        variant={cambiado ? "default" : "outline"}
        className="h-8 px-2"
        onClick={guardar}
        disabled={!cambiado || pendiente}
        title="Guardar causa"
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
      </Button>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string
  value: string
  sub?: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", valueClassName ?? "text-slate-900")}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
