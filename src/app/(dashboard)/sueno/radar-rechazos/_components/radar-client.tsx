"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarClock,
  Download,
  FileText,
  History,
  Loader2,
  Phone,
  RadarIcon,
  RefreshCw,
  Truck,
} from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type {
  RadarClienteView,
  RadarFechaOption,
  RadarView,
} from "@/actions/radar-rechazos"
import { evaluarCriticidad, textoCriterio } from "@/lib/radar-rechazos/criterio"

type MotivoFiltro = "todos" | "cerrado" | "sin_dinero" | "criticos"

const nf = new Intl.NumberFormat("es-AR")
const nfMoney = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

/** "lun 28/07" — para el selector de fotos, que tiene poco lugar. */
function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
}

export function RadarClient({
  data,
  puedeRegenerar,
  fechas,
  fechaPedida,
}: {
  data: RadarView | null
  puedeRegenerar: boolean
  fechas: RadarFechaOption[]
  /** `?fecha=` de la URL: si viene, se está consultando una foto histórica. */
  fechaPedida?: string
}) {
  const router = useRouter()
  const [regenerando, startRegen] = useTransition()
  const [navegando, startNav] = useTransition()
  const [busqueda, setBusqueda] = useState("")
  const [promotor, setPromotor] = useState("todos")
  const [motivo, setMotivo] = useState<MotivoFiltro>("todos")

  // La foto vigente es la más nueva que haya guardada; cualquier otra es historia.
  const fechaVigente = fechas[0]?.fecha_entrega
  const esHistorica = Boolean(
    fechaPedida && fechaVigente && fechaPedida !== fechaVigente,
  )

  function verFecha(f: string) {
    startNav(() => {
      router.push(
        f && f !== fechaVigente
          ? `/sueno/radar-rechazos?fecha=${f}`
          : "/sueno/radar-rechazos",
      )
    })
  }

  function regenerar() {
    startRegen(async () => {
      try {
        const r = await fetch("/api/radar-rechazos/cron", { method: "POST" })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? "Error regenerando")
        toast.success(
          `Radar actualizado: ${j.clientes_riesgo} clientes en riesgo de ${j.clientes_dia} del día`,
        )
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error regenerando")
      }
    })
  }

  // Críticos de TODA la foto (no de lo filtrado): es el número que se mira para
  // saber a cuántos hay que llamar.
  const criticos = useMemo(
    () => (data?.clientes ?? []).filter((c) => evaluarCriticidad(c).es_critico),
    [data],
  )

  const promotores = useMemo(() => {
    if (!data) return []
    const set = new Map<string, string>()
    for (const c of data.clientes) {
      const key = c.id_promotor ?? "sin"
      const label = c.nombre_promotor ?? "(Sin promotor)"
      set.set(key, label)
    }
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [data])

  const filtrados = useMemo(() => {
    if (!data) return []
    const q = busqueda.trim().toLowerCase()
    return data.clientes.filter((c) => {
      if (promotor !== "todos" && (c.id_promotor ?? "sin") !== promotor) return false
      if (motivo === "cerrado" && c.cerrado_anio === 0) return false
      if (motivo === "sin_dinero" && c.sin_dinero_anio === 0) return false
      if (motivo === "criticos" && !evaluarCriticidad(c).es_critico) return false
      if (q) {
        const hay = `${c.nombre_cliente ?? ""} ${c.localidad ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, busqueda, promotor, motivo])

  // Agrupar por promotor para el render
  const grupos = useMemo(() => {
    const m = new Map<string, { label: string; rows: RadarClienteView[] }>()
    for (const c of filtrados) {
      const key = c.id_promotor ?? "sin"
      const g = m.get(key) ?? { label: c.nombre_promotor ?? "(Sin promotor)", rows: [] }
      g.rows.push(c)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length)
  }, [filtrados])

  function exportarCsv() {
    if (filtrados.length === 0) return
    const headers = [
      "Promotor", "Cliente", "Localidad", "Telefono", "Reparto",
      "Cerrado veces (año)", "Cerrado veces (mes)",
      "Sin dinero veces (año)", "Sin dinero veces (mes)",
      "Bultos rechazados (año)", "Bultos pedido", "Riesgo total (veces)",
    ]
    const lines = filtrados.map((c) =>
      [
        c.nombre_promotor ?? "", c.nombre_cliente ?? "", c.localidad ?? "",
        c.telefono ?? "", c.reparto ?? "",
        c.cerrado_anio, c.cerrado_mes, c.sin_dinero_anio, c.sin_dinero_mes,
        c.bultos_rechazados_anio, c.bultos_pedido, c.riesgo_total,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    )
    const csv = [headers.join(","), ...lines].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `radar-rechazos-${data?.fecha_entrega ?? "hoy"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <RadarIcon className="mt-1 size-6 shrink-0 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Radar de Rechazos ·{" "}
              {esHistorica ? "Foto anterior" : "Pasado Mañana"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {esHistorica ? (
                <>
                  Foto del radar tal como se generó para la entrega del{" "}
                  <strong>{fechaLarga(fechaPedida!)}</strong>: los clientes que
                  estaban en riesgo ese día. Solo consulta.
                </>
              ) : (
                <>
                  Clientes que se entregan <strong>pasado mañana</strong> (a 2 días
                  de reparto: domingos y feriados no cuentan) con historial de
                  rechazo por <strong>cerrado</strong> o <strong>sin dinero</strong>.
                  Avisales hoy para evitar el rechazo.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de foto: la vigente o cualquier día anterior guardado */}
          {fechas.length > 0 && (
            <div className="flex items-center gap-1.5">
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <select
                value={fechaPedida ?? fechaVigente ?? ""}
                onChange={(e) => verFecha(e.target.value)}
                disabled={navegando}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                title="Ver la foto del radar de otro día de entrega"
              >
                {fechas.map((f, i) => (
                  <option key={f.fecha_entrega} value={f.fecha_entrega}>
                    {fechaCorta(f.fecha_entrega)}
                    {i === 0 ? " (vigente)" : ""} · {f.total_clientes_riesgo} en
                    riesgo
                  </option>
                ))}
              </select>
              {navegando && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!data}>
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                "/api/radar-rechazos/pdf" +
                  (data ? `?fecha=${data.fecha_entrega}` : ""),
                "_blank",
              )
            }
            disabled={!data || criticos.length === 0}
            title={
              criticos.length === 0
                ? "No hay clientes críticos en esta foto"
                : `PDF para Ventas con los ${criticos.length} críticos. Criterio: ${textoCriterio()}`
            }
          >
            <FileText className="size-4" /> PDF críticos
          </Button>
          {puedeRegenerar && !esHistorica && (
            <Button size="sm" onClick={regenerar} disabled={regenerando}>
              {regenerando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="ml-1">Regenerar</span>
            </Button>
          )}
        </div>
      </div>

      {/*
        Estás mirando historia, no el radar del día.
        🚨 `flex-row` explícito: Card trae `flex-col` y `flex-wrap` no lo pisa.
      */}
      {esHistorica && data && (
        <Card className="flex flex-row flex-wrap items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <History className="size-4 shrink-0" />
          <span>
            Foto histórica de la entrega del{" "}
            <strong>{fechaLarga(data.fecha_entrega)}</strong>, generada el{" "}
            {new Date(data.generado_at).toLocaleString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })}
            {" hs. "}
            Es solo para consultar: no refleja los rechazos que terminaron
            pasando.
          </span>
          {fechaVigente && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => verFecha(fechaVigente)}
            >
              Volver al radar vigente
            </Button>
          )}
        </Card>
      )}

      {!data ? (
        <Card className="p-8 text-center text-muted-foreground">
          {fechaPedida ? (
            <>
              No hay foto del radar para la entrega del {fechaLarga(fechaPedida)}.
              {fechaVigente && (
                <Button
                  variant="link"
                  className="px-1.5"
                  onClick={() => verFecha(fechaVigente)}
                >
                  Ver el radar vigente
                </Button>
              )}
            </>
          ) : (
            <>
              Todavía no se generó ninguna foto del radar. El cron corre a las 09:30
              (AR) después del ruteo.
              {puedeRegenerar && " También podés generarla ahora con “Regenerar”."}
            </>
          )}
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi
              label="Entrega"
              valor={fechaLarga(data.fecha_entrega)}
              chico
            />
            <Kpi
              label="Clientes en riesgo"
              valor={`${nf.format(data.total_clientes_riesgo)}`}
              sub={`de ${nf.format(data.total_clientes_dia)} del día`}
              destacado
            />
            <Kpi
              label="Críticos"
              valor={nf.format(criticos.length)}
              sub="prioridad para llamar"
              titulo={`Criterio: ${textoCriterio()}`}
              alerta={criticos.length > 0}
            />
            <Kpi
              label="Bultos en juego"
              valor={nf.format(data.total_bultos_riesgo)}
            />
            <Kpi
              label="Monto en juego"
              valor={nfMoney.format(data.total_monto_riesgo)}
            />
          </div>

          {/* El criterio a la vista, para que nadie tenga que adivinarlo */}
          <p className="-mt-1 px-1 text-xs text-muted-foreground">
            <strong className="text-red-700">Crítico</strong> = {textoCriterio()}
          </p>

          {/* Filtros */}
          <Card className="flex flex-row flex-wrap items-center gap-3 p-3">
            <Input
              placeholder="Buscar cliente o localidad…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-9 max-w-xs"
            />
            <select
              value={promotor}
              onChange={(e) => setPromotor(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="todos">Todos los promotores</option>
              {promotores.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoFiltro)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="todos">Todos los motivos</option>
              <option value="criticos">Solo críticos</option>
              <option value="cerrado">Con cerrado</option>
              <option value="sin_dinero">Con sin dinero</option>
            </select>
            <span className="ml-auto text-sm text-muted-foreground">
              {nf.format(filtrados.length)} cliente
              {filtrados.length === 1 ? "" : "s"}
            </span>
          </Card>

          {/* Tabla agrupada por promotor */}
          {grupos.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No hay clientes que coincidan con el filtro.
            </Card>
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => (
                <Card key={g.label} className="overflow-hidden p-0">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {g.label}
                    </h3>
                    <Badge variant="secondary">
                      {g.rows.length} cliente{g.rows.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Localidad</th>
                          <th className="px-3 py-2 font-medium">Reparto</th>
                          <th className="px-3 py-2 text-right font-medium" title="Veces que rechazó por cerrado (últimos 365 días / últimos 30 días)">Cerrado<br />veces año / mes</th>
                          <th className="px-3 py-2 text-right font-medium" title="Veces que rechazó por sin dinero (últimos 365 días / últimos 30 días)">Sin dinero<br />veces año / mes</th>
                          <th className="px-3 py-2 text-right font-medium" title="Bultos que rechazó por cerrado + sin dinero en los últimos 365 días">Bultos<br />rechazados</th>
                          <th className="px-3 py-2 text-right font-medium" title="Bultos del pedido que se le entrega pasado mañana">Bultos<br />pedido</th>
                          <th className="px-3 py-2 font-medium">Contacto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((c, i) => {
                          const crit = evaluarCriticidad(c)
                          return (
                          <tr
                            key={`${c.id_cliente}-${i}`}
                            className={
                              crit.es_critico
                                ? "border-b bg-red-50/60 last:border-0 hover:bg-red-50"
                                : "border-b last:border-0 hover:bg-slate-50/60"
                            }
                          >
                            <td className="px-4 py-2 font-medium text-slate-900">
                              <span className="flex items-center gap-1.5">
                                {c.nombre_cliente ?? `Cliente ${c.id_cliente ?? "?"}`}
                                {crit.es_critico && (
                                  <Badge
                                    variant="destructive"
                                    className="shrink-0 text-[10px]"
                                    title={
                                      crit.por_ultimos_30d
                                        ? `${crit.rechazos_30d} rechazos en los últimos 30 días`
                                        : `${crit.rechazos_anio} rechazos en 12 meses (más de 1 por mes)`
                                    }
                                  >
                                    CRÍTICO
                                  </Badge>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {c.localidad ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              {c.reparto ? (
                                <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                                  <Truck className="size-3" /> {c.reparto}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <Conteo anio={c.cerrado_anio} mes={c.cerrado_mes} color="amber" />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <Conteo anio={c.sin_dinero_anio} mes={c.sin_dinero_mes} color="rose" />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {c.bultos_rechazados_anio > 0
                                ? nf.format(c.bultos_rechazados_anio)
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {nf.format(c.bultos_pedido)}
                            </td>
                            <td className="px-3 py-2">
                              {c.telefono ? (
                                <a
                                  href={`tel:${c.telefono}`}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <Phone className="size-3" /> {c.telefono}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Foto generada el{" "}
            {new Date(data.generado_at).toLocaleString("es-AR")}. “Cerrado” lo
            previene ventas avisando al cliente; “sin dinero” coordinando el pago.
            Los rechazos se cuentan en <strong>veces</strong> (cliente × fecha), no
            en artículos: un rechazo de 13 productos cuenta 1.
          </p>
        </>
      )}
    </div>
  )
}

function Kpi({
  label,
  valor,
  sub,
  destacado,
  chico,
  alerta,
  titulo,
}: {
  label: string
  valor: string
  sub?: string
  destacado?: boolean
  chico?: boolean
  /** Rojo: el número exige acción (clientes críticos). */
  alerta?: boolean
  /** Tooltip nativo, para explicar el criterio sin ocupar lugar. */
  titulo?: string
}) {
  return (
    <Card className="gap-1 p-4" title={titulo}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          chico
            ? "text-sm font-semibold capitalize text-slate-900"
            : alerta
              ? "text-2xl font-bold text-red-600"
              : destacado
                ? "text-2xl font-bold text-amber-600"
                : "text-2xl font-bold text-slate-900"
        }
      >
        {valor}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

function Conteo({
  anio,
  mes,
  color,
}: {
  anio: number
  mes: number
  color: "amber" | "rose"
}) {
  if (anio === 0) return <span className="text-muted-foreground">—</span>
  const fuerte = color === "amber" ? "text-amber-700" : "text-rose-700"
  return (
    <span>
      <strong className={fuerte}>{anio}</strong>
      <span className="text-muted-foreground"> / {mes}</span>
    </span>
  )
}
