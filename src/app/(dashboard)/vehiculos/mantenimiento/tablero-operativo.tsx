"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Archive, CircleDot, ClipboardList, Gauge, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  EstadoServiceGeneral,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type { NeumaticosResumen } from "@/lib/vehiculos/neumaticos-tipos"
import type { UnidadBaja } from "@/actions/mantenimiento-vehiculos"

const ESTADO_SG: Record<
  EstadoServiceGeneral,
  { label: string; dot: string; badge: string }
> = {
  vencido: { label: "Vencido", dot: "bg-red-600", badge: "border-red-200 bg-red-100 text-red-700" },
  rojo: { label: "≤10 días", dot: "bg-red-500", badge: "border-red-200 bg-red-100 text-red-700" },
  naranja: { label: "≤15 días", dot: "bg-orange-400", badge: "border-orange-200 bg-orange-100 text-orange-700" },
  amarillo: { label: "≤30 días", dot: "bg-amber-400", badge: "border-amber-200 bg-amber-100 text-amber-800" },
  ok: { label: "Al día", dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-100 text-emerald-700" },
  sin_datos: { label: "Sin datos", dot: "bg-slate-300", badge: "border-slate-200 bg-slate-100 text-slate-500" },
  no_aplica: { label: "No lleva service", dot: "bg-slate-200", badge: "border-slate-200 bg-slate-50 text-slate-400" },
}

const ORDEN_ESTADO: Record<EstadoServiceGeneral, number> = {
  vencido: 0,
  rojo: 1,
  naranja: 2,
  amarillo: 3,
  ok: 4,
  sin_datos: 5,
  no_aplica: 6,
}

export interface OTPendiente {
  id: string
  dominio: string
  fecha: string
  estado: "programado" | "en_taller"
  motivo: string
}

const OT_BADGE: Record<OTPendiente["estado"], { label: string; cls: string }> = {
  programado: { label: "Programada", cls: "border-blue-200 bg-blue-100 text-blue-700" },
  en_taller: { label: "En taller", cls: "border-amber-200 bg-amber-100 text-amber-800" },
}

const fmtNum = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v)

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

function diasTexto(dias: number | null): string {
  if (dias == null) return "—"
  if (dias < 0) return `hace ${Math.abs(dias)} d`
  if (dias === 0) return "hoy"
  return `en ${dias} d`
}

function antiguedad(fecha: string): string {
  const hoy = new Date()
  const f = new Date(fecha + "T00:00:00")
  const d = Math.round((hoy.getTime() - f.getTime()) / 86_400_000)
  if (d <= 0) return "hoy"
  if (d === 1) return "ayer"
  return `hace ${d} d`
}

function Dot({ estado }: { estado: EstadoServiceGeneral }) {
  return <span className={cn("inline-block size-2.5 rounded-full", ESTADO_SG[estado].dot)} />
}

interface Props {
  programacion: ServiceGeneralUnidad[]
  otPendientes: OTPendiente[]
  neumaticos: NeumaticosResumen
  unidadesBaja: UnidadBaja[]
  onNavigate: (tab: string, dominio?: string) => void
}

export function TableroOperativo({ programacion, otPendientes, neumaticos, unidadesBaja, onNavigate }: Props) {
  const [resaltado, setResaltado] = useState<string | null>(null)

  const esAlerta = (e: EstadoServiceGeneral) =>
    e === "vencido" || e === "rojo" || e === "naranja" || e === "amarillo"

  const progOrdenada = [...programacion].sort((a, b) => {
    const oe = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
    if (oe !== 0) return oe
    return (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity)
  })

  const servicePendientes = progOrdenada.filter((p) => esAlerta(p.estado))
  const serviceVencidos = servicePendientes.filter((p) => p.estado === "vencido").length
  const servicePorVencer = servicePendientes.length - serviceVencidos

  const irAProgramacion = (dominio: string) => {
    setResaltado(dominio)
    const el = document.getElementById(`svc-${dominio}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <div className="space-y-6">
      {/* ===== Alertas: solo Service pendientes + Órdenes de trabajo ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Service pendientes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-slate-500" /> Service pendientes
            </CardTitle>
            <div className="flex gap-1.5">
              <Badge className="border-red-200 bg-red-50 text-red-700">Vencidos: {serviceVencidos}</Badge>
              <Badge className="border-amber-200 bg-amber-50 text-amber-800">Por vencer: {servicePorVencer}</Badge>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {servicePendientes.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">No hay services vencidos ni próximos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Próx. service</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servicePendientes.map((p) => {
                    const u = p.mide === "horas" ? "hs" : "km"
                    const prox =
                      p.proximaFecha == null
                        ? "—"
                        : `${fmtFecha(p.proximaFecha)}${
                            p.motivo !== "tiempo" && p.proximoKm != null ? ` · ${fmtNum(p.proximoKm)} ${u}` : ""
                          }`
                    return (
                      <TableRow
                        key={p.dominio}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => irAProgramacion(p.dominio)}
                      >
                        <TableCell className="font-medium">{p.dominio}</TableCell>
                        <TableCell className="text-slate-600">{prox}</TableCell>
                        <TableCell
                          className={cn(
                            "font-medium",
                            p.estado === "vencido" || p.estado === "rojo" ? "text-red-600" : "text-slate-700"
                          )}
                        >
                          {diasTexto(p.diasRestantes)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ESTADO_SG[p.estado].badge}>
                            {ESTADO_SG[p.estado].label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Órdenes de trabajo pendientes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4 text-slate-500" /> Órdenes de trabajo
            </CardTitle>
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">Abiertas: {otPendientes.length}</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {otPendientes.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">No hay órdenes de trabajo abiertas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad</TableHead>
                    <TableHead>OT / motivo</TableHead>
                    <TableHead>Abierta</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otPendientes.map((ot) => (
                    <TableRow
                      key={ot.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => onNavigate("historial", ot.dominio)}
                    >
                      <TableCell className="font-medium">{ot.dominio}</TableCell>
                      <TableCell className="max-w-48 truncate text-slate-600">{ot.motivo}</TableCell>
                      <TableCell className="text-slate-600">{antiguedad(ot.fecha)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={OT_BADGE[ot.estado].cls}>
                          {OT_BADGE[ot.estado].label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== Neumáticos (resumen, atajo a la pestaña) ===== */}
      <Card
        className="cursor-pointer transition-colors hover:bg-slate-50"
        onClick={() => onNavigate("neumaticos")}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDot className="size-4 text-slate-500" /> Neumáticos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="En stock" value={neumaticos.stock} />
            <Mini label="Instaladas" value={neumaticos.instalados} />
            <Mini label="Desgaste crítico" value={neumaticos.criticos} danger />
            <Mini label="Bajas del mes" value={neumaticos.bajasMes} />
          </div>
        </CardContent>
      </Card>

      {/* Leyenda del semáforo de service */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {(["vencido", "rojo", "naranja", "amarillo", "ok", "sin_datos", "no_aplica"] as EstadoServiceGeneral[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <Dot estado={k} /> {ESTADO_SG[k].label}
          </span>
        ))}
      </div>

      {/* Programación de mantenimiento (detalle service general) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-slate-500" /> Programación de mantenimiento (service general)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Último service</TableHead>
                <TableHead>Últ. registro</TableHead>
                <TableHead>Próximo service</TableHead>
                <TableHead className="text-right">Días para service</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progOrdenada.map((p) => {
                const u = p.mide === "horas" ? "hs" : "km"
                const ultimoTxt =
                  p.ultimaFecha == null
                    ? "—"
                    : `${fmtFecha(p.ultimaFecha)}${p.ultimoOdometro != null ? ` · ${fmtNum(p.ultimoOdometro)} ${u}` : ""}`
                const registroTxt =
                  p.fechaUltRegistro == null
                    ? "—"
                    : `${fmtFecha(p.fechaUltRegistro)}${p.kmUltRegistro != null ? ` · ${fmtNum(p.kmUltRegistro)} ${u}` : ""}`
                const proximoTxt =
                  p.proximaFecha == null
                    ? "—"
                    : `${fmtFecha(p.proximaFecha)}${p.motivo !== "tiempo" && p.proximoKm != null ? ` · ${fmtNum(p.proximoKm)} ${u}` : ""}`
                return (
                  <TableRow
                    key={p.dominio}
                    id={`svc-${p.dominio}`}
                    className={cn(resaltado === p.dominio && "bg-amber-50 ring-1 ring-amber-200")}
                  >
                    <TableCell>
                      <Dot estado={p.estado} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.dominio}
                      {p.motivo === "tiempo" && (
                        <span className="ml-1 text-xs font-normal text-slate-400">(por tiempo)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{ultimoTxt}</TableCell>
                    <TableCell className="text-slate-600">{registroTxt}</TableCell>
                    <TableCell className="text-slate-600">{proximoTxt}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        p.estado === "vencido" || p.estado === "rojo" ? "text-red-600" : "text-slate-700"
                      )}
                    >
                      {p.diasRestantes == null ? "—" : p.diasRestantes}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ESTADO_SG[p.estado].badge}>
                        {ESTADO_SG[p.estado].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== Unidades dadas de baja (vendidas/retiradas) ===== */}
      {unidadesBaja.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-500">
              <Archive className="size-4" /> Unidades dadas de baja
            </CardTitle>
            <p className="text-xs text-slate-400">
              Fuera de la programación, pero con su historial de OTs y checklists conservado.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-slate-100">
              {unidadesBaja.map((u) => (
                <li key={u.dominio} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-600">{u.dominio}</span>
                  <span className="text-slate-400">{u.descripcion ?? "—"}</span>
                  <button
                    type="button"
                    className="ml-auto text-xs text-blue-600 hover:underline"
                    onClick={() => onNavigate("historial", u.dominio)}
                  >
                    Ver sus OTs
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Mini({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-center">
      <p className={cn("text-2xl font-bold", danger && value > 0 ? "text-red-600" : "text-slate-900")}>
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
