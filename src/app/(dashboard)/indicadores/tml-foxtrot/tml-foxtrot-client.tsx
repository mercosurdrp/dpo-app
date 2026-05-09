"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Clock, Truck, AlertTriangle, CheckCircle2, RefreshCcw } from "lucide-react"
import type { TmlFoxtrotDia, TmlFoxtrotEquipo, TmlFoxtrotResumen } from "@/types/database"

interface Props {
  initial: TmlFoxtrotDia
}

function estadoColor(e: TmlFoxtrotEquipo["estado"]): {
  border: string
  text: string
  bg: string
  label: string
} {
  switch (e) {
    case "ok":
      return { border: "border-l-green-500", text: "text-green-700", bg: "bg-green-100", label: "OK" }
    case "fuera_meta":
      return { border: "border-l-red-500", text: "text-red-700", bg: "bg-red-100", label: "Fuera meta" }
    case "sin_marca":
      return { border: "border-l-amber-500", text: "text-amber-700", bg: "bg-amber-100", label: "Sin marca" }
    default:
      return { border: "border-l-slate-300", text: "text-slate-600", bg: "bg-slate-100", label: "Sin ruta" }
  }
}

export function TmlFoxtrotClient({ initial }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const [, startTransition] = useTransition()
  const [desde7, setDesde7] = useState(false)
  const [fecha, setFecha] = useState(initial.fecha)

  const onChangeFecha = (v: string) => {
    setFecha(v)
    const params = new URLSearchParams(search.toString())
    params.set("fecha", v)
    startTransition(() => router.push(`?${params.toString()}`))
  }

  const ResumenCard = ({ title, r, color }: { title: string; r: TmlFoxtrotResumen; color: string }) => {
    const valor = desde7 ? r.promedio_desde7_min : r.promedio_real_min
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">
            {valor != null ? `${valor} min` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.equipos_con_tml}/{r.equipos_totales} equipos · peor {r.peor_real_min ?? "—"} · mejor{" "}
            {r.mejor_real_min ?? "—"}
          </p>
          <div className={`mt-3 h-1 w-full rounded-full ${color}`} />
        </CardContent>
      </Card>
    )
  }

  const equipos = useMemo(() => initial.equipos, [initial.equipos])

  const fueraMeta = equipos.filter((e) => e.estado === "fuera_meta").length
  const ok = equipos.filter((e) => e.estado === "ok").length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Clock className="h-6 w-6 text-amber-600" />
            TML · Tiempo Medio de Liberación (Foxtrot)
          </h1>
          <p className="text-sm text-muted-foreground">
            Desde marca biométrica del equipo hasta inicio de ruta en Foxtrot · meta {initial.meta_minutos} min
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fecha" className="text-xs text-muted-foreground">
              Fecha
            </Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => onChangeFecha(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center rounded-md border bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setDesde7(false)}
              className={`rounded px-3 py-1 transition-colors ${
                !desde7 ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Marca real
            </button>
            <button
              type="button"
              onClick={() => setDesde7(true)}
              className={`rounded px-3 py-1 transition-colors ${
                desde7 ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Desde 07:00
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => startTransition(() => router.refresh())}
          >
            <RefreshCcw className="mr-1 h-4 w-4" /> Refrescar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ResumenCard title="Promedio total" r={initial.resumen} color="bg-slate-300" />
        <ResumenCard title="Eldorado" r={initial.por_sucursal.ELDORADO} color="bg-blue-300" />
        <ResumenCard title="Iguazú" r={initial.por_sucursal.IGUAZU} color="bg-emerald-300" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiBox label="Equipos OK" value={ok} icon={<CheckCircle2 className="h-4 w-4" />} color="green" />
        <KpiBox
          label="Fuera meta"
          value={fueraMeta}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="red"
        />
        <KpiBox
          label="Total equipos"
          value={equipos.length}
          icon={<Truck className="h-4 w-4" />}
          color="slate"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {equipos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay equipos operativos para esta fecha.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Ayudante</TableHead>
                    <TableHead>Marca equipo</TableHead>
                    <TableHead>Inicio ruta</TableHead>
                    <TableHead className="text-right">TML</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipos.map((e) => {
                    const c = estadoColor(e.estado)
                    const tml = desde7 ? e.tml_minutos_desde7 : e.tml_minutos_real
                    return (
                      <TableRow
                        key={`${e.camion_id}-${e.fecha}`}
                        className={`border-l-4 ${c.border}`}
                      >
                        <TableCell className="font-mono text-sm">{e.dominio ?? "—"}</TableCell>
                        <TableCell>
                          {e.sucursal ? (
                            <Badge variant="outline">{e.sucursal}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{e.chofer.nombre ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.chofer.hora_marca ? `marca ${e.chofer.hora_marca}` : "sin marca"}
                            {e.chofer.foxtrot_driver_id ? "" : " · sin map FX"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{e.ayudante.nombre ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.ayudante.hora_marca ? `marca ${e.ayudante.hora_marca}` : "sin marca"}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {e.hora_marca_equipo ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {e.hora_inicio_ruta ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {tml != null ? (
                            <span
                              className={`flex items-center justify-end gap-1 font-mono font-semibold ${c.text}`}
                            >
                              <Clock className="h-3 w-3" />
                              {tml} min
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${c.bg} ${c.text} hover:${c.bg}`}>{c.label}</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiBox({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: "green" | "red" | "slate"
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  }
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color === "red" ? "text-red-600" : "text-slate-900"}`}>
              {value}
            </p>
          </div>
          <div className={`rounded-full p-2 ${colorMap[color]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
