"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  RefreshCcw,
  Activity,
  Users,
  ClipboardCheck,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react"
import type { PreRutaEnVivo, PreRutaEquipoLive } from "@/types/database"

interface Props {
  initial: PreRutaEnVivo
}

const HOY = new Date().toISOString().slice(0, 10)

function fmtClock(d: Date): string {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

function estadoColor(e: PreRutaEquipoLive["tml_estado"]): {
  border: string
  text: string
  bg: string
  label: string
} {
  switch (e) {
    case "ok":
      return { border: "border-l-green-500", text: "text-green-700", bg: "bg-green-100", label: "OK" }
    case "en_riesgo":
      return { border: "border-l-amber-500", text: "text-amber-700", bg: "bg-amber-100", label: "En riesgo" }
    case "fuera_meta":
      return { border: "border-l-red-500", text: "text-red-700", bg: "bg-red-100", label: "Fuera meta" }
    default:
      return { border: "border-l-slate-300", text: "text-slate-600", bg: "bg-slate-100", label: "Pendiente" }
  }
}

function ventanaColor(pct: number): string {
  if (pct >= 80) return "bg-green-500"
  if (pct >= 50) return "bg-amber-500"
  return "bg-red-500"
}

export function PreRutaClient({ initial }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [now, setNow] = useState<Date>(() => new Date())
  const isHoy = initial.fecha === HOY

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!isHoy) return
    const t = setInterval(() => {
      startTransition(() => router.refresh())
    }, 60_000)
    return () => clearInterval(t)
  }, [isHoy, router])

  const r = initial.resumen

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Activity className="h-6 w-6 text-indigo-600" />
            Pre-Ruta en Vivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Tablero operativo · {initial.fecha} · meta TML {initial.meta_minutos} min
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-slate-900 px-4 py-2 font-mono text-2xl font-bold text-white tabular-nums">
            {fmtClock(now)}
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

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Ventana operativa OK + en riesgo
              </p>
              <p className="text-3xl font-bold text-slate-900">{initial.ventana_pct}%</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {r.salidos}/{r.total_esperados} equipos liberados
            </div>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${ventanaColor(initial.ventana_pct)}`}
              style={{ width: `${initial.ventana_pct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiBox label="Esperados" value={r.total_esperados} icon={<Users className="h-4 w-4" />} color="slate" />
        <KpiBox label="Presentes" value={r.presentes} icon={<CheckCircle2 className="h-4 w-4" />} color="blue" />
        <KpiBox label="Matinal ✓" value={r.matinal_ok} icon={<ClipboardCheck className="h-4 w-4" />} color="indigo" />
        <KpiBox label="Checklists ✓" value={r.checklists_ok} icon={<ClipboardCheck className="h-4 w-4" />} color="teal" />
        <KpiBox label="Salidos" value={r.salidos} icon={<Truck className="h-4 w-4" />} color="green" />
        <KpiBox label="Fuera meta" value={r.fuera_meta} icon={<AlertTriangle className="h-4 w-4" />} color="red" />
      </div>

      <Card>
        <CardContent className="pt-6">
          {initial.equipos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay equipos cargados para esta fecha.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Ingreso</TableHead>
                    <TableHead>Matinal</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead className="text-right">TML</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initial.equipos.map((e) => {
                    const c = estadoColor(e.tml_estado)
                    return (
                      <TableRow key={`${e.legajo}-${e.chofer}`} className={`border-l-4 ${c.border}`}>
                        <TableCell className="font-medium">{e.chofer}</TableCell>
                        <TableCell className="font-mono text-sm">{e.dominio ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {e.presente ? (
                            <span className="font-mono">{e.hora_ingreso}</span>
                          ) : (
                            <Badge variant="secondary">Ausente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {e.matinal_marcada ? (
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                              ✓ {e.hora_matinal}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">—</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {e.checklist_liberacion_hecho ? (
                            <Badge
                              className={
                                e.resultado_checklist === "rechazado"
                                  ? "bg-red-100 text-red-700 hover:bg-red-100"
                                  : "bg-green-100 text-green-700 hover:bg-green-100"
                              }
                            >
                              {e.resultado_checklist === "rechazado" ? "✗" : "✓"} {e.hora_liberacion}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">—</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.tml_minutos != null ? (
                            <span className={`flex items-center justify-end gap-1 font-mono font-semibold ${c.text}`}>
                              <Clock className="h-3 w-3" />
                              {e.tml_minutos} min
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
  color: "slate" | "blue" | "indigo" | "teal" | "green" | "red"
}) {
  const colorMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    indigo: "bg-indigo-100 text-indigo-700",
    teal: "bg-teal-100 text-teal-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
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
