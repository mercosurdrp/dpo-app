"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Download,
  FileText,
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
import type { RadarClienteView, RadarView } from "@/actions/radar-rechazos"

type MotivoFiltro = "todos" | "cerrado" | "sin_dinero"

// Umbral de "cliente crítico" para el PDF de Ventas: más de N rechazos por sin
// dinero en el año calendario. (El cálculo real vive en getRadarCriticos.)
const UMBRAL_CRITICO = 7

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

export function RadarClient({
  data,
  puedeRegenerar,
}: {
  data: RadarView | null
  puedeRegenerar: boolean
}) {
  const router = useRouter()
  const [regenerando, startRegen] = useTransition()
  const [busqueda, setBusqueda] = useState("")
  const [promotor, setPromotor] = useState("todos")
  const [motivo, setMotivo] = useState<MotivoFiltro>("todos")

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
      "Cerrado (año)", "Cerrado (mes)", "Sin dinero (año)", "Sin dinero (mes)",
      "Bultos pedido", "Riesgo total",
    ]
    const lines = filtrados.map((c) =>
      [
        c.nombre_promotor ?? "", c.nombre_cliente ?? "", c.localidad ?? "",
        c.telefono ?? "", c.reparto ?? "",
        c.cerrado_anio, c.cerrado_mes, c.sin_dinero_anio, c.sin_dinero_mes,
        c.bultos_pedido, c.riesgo_total,
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
              Radar de Rechazos de Mañana
            </h1>
            <p className="text-sm text-muted-foreground">
              Clientes que se entregan mañana con historial de rechazo por{" "}
              <strong>cerrado</strong> o <strong>sin dinero</strong>. Avisales hoy
              para evitar el rechazo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!data}>
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(`/api/radar-rechazos/pdf?umbral=${UMBRAL_CRITICO}`, "_blank")
            }
            disabled={!data}
            title={`PDF para Ventas: clientes con más de ${UMBRAL_CRITICO} sin dinero en el año`}
          >
            <FileText className="size-4" /> PDF críticos
          </Button>
          {puedeRegenerar && (
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

      {!data ? (
        <Card className="p-8 text-center text-muted-foreground">
          Todavía no se generó ninguna foto del radar. El cron corre a las 09:30 (AR)
          después del ruteo.
          {puedeRegenerar && " También podés generarla ahora con “Regenerar”."}
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              label="Bultos en juego"
              valor={nf.format(data.total_bultos_riesgo)}
            />
            <Kpi
              label="Monto en juego"
              valor={nfMoney.format(data.total_monto_riesgo)}
            />
          </div>

          {/* Filtros */}
          <Card className="flex flex-wrap items-center gap-3 p-3">
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
                          <th className="px-3 py-2 text-right font-medium">Cerrado<br />año / mes</th>
                          <th className="px-3 py-2 text-right font-medium">Sin dinero<br />año / mes</th>
                          <th className="px-3 py-2 text-right font-medium">Bultos</th>
                          <th className="px-3 py-2 font-medium">Contacto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((c, i) => (
                          <tr key={`${c.id_cliente}-${i}`} className="border-b last:border-0 hover:bg-slate-50/60">
                            <td className="px-4 py-2 font-medium text-slate-900">
                              {c.nombre_cliente ?? `Cliente ${c.id_cliente ?? "?"}`}
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
                        ))}
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
}: {
  label: string
  valor: string
  sub?: string
  destacado?: boolean
  chico?: boolean
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          chico
            ? "text-sm font-semibold capitalize text-slate-900"
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
