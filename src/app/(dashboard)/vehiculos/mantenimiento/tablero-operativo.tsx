"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, CalendarClock, FileWarning, Gauge } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  DocumentoVencimiento,
  EstadoServiceGeneral,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"

const ESTADO_SG: Record<
  EstadoServiceGeneral,
  { label: string; dot: string; badge: string }
> = {
  vencido: { label: "Vencido", dot: "bg-red-600", badge: "bg-red-100 text-red-700" },
  rojo: { label: "≤10 días", dot: "bg-red-500", badge: "bg-red-100 text-red-700" },
  naranja: { label: "≤15 días", dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700" },
  amarillo: { label: "≤30 días", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700" },
  ok: { label: "Al día", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  sin_datos: { label: "Sin datos", dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500" },
}

const ORDEN_ESTADO: Record<EstadoServiceGeneral, number> = {
  vencido: 0,
  rojo: 1,
  naranja: 2,
  amarillo: 3,
  ok: 4,
  sin_datos: 5,
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

function Dot({ estado }: { estado: EstadoServiceGeneral }) {
  return <span className={cn("inline-block size-2.5 rounded-full", ESTADO_SG[estado].dot)} />
}

interface Props {
  programacion: ServiceGeneralUnidad[]
  documentos: DocumentoVencimiento[]
}

export function TableroOperativo({ programacion, documentos }: Props) {
  const alerta = (e: EstadoServiceGeneral) =>
    e === "vencido" || e === "rojo" || e === "naranja" || e === "amarillo"

  const svcVencidos = programacion.filter((p) => p.estado === "vencido").length
  const svcProximos = programacion.filter(
    (p) => p.estado === "rojo" || p.estado === "naranja" || p.estado === "amarillo"
  ).length
  const docsVencidos = documentos.filter((d) => d.estado === "vencido").length
  const docsProximos = documentos.filter(
    (d) => d.estado === "rojo" || d.estado === "naranja" || d.estado === "amarillo"
  ).length

  const progOrdenada = [...programacion].sort((a, b) => {
    const oe = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
    if (oe !== 0) return oe
    const da = a.diasRestantes ?? Infinity
    const db = b.diasRestantes ?? Infinity
    return da - db
  })

  // Solo documentos vencidos o por vencer (≤30 días).
  const docsAlerta = documentos
    .filter((d) => alerta(d.estado))
    .sort((a, b) => a.diasRestantes - b.diasRestantes)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <AlertTriangle className="size-4 text-red-500" /> Services vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", svcVencidos > 0 ? "text-red-600" : "text-slate-900")}>
              {svcVencidos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <CalendarClock className="size-4 text-amber-500" /> Services por vencer (≤30 d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{svcProximos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <FileWarning className="size-4 text-red-500" /> Documentos vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", docsVencidos > 0 ? "text-red-600" : "text-slate-900")}>
              {docsVencidos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <FileWarning className="size-4 text-amber-500" /> Documentos por vencer (≤30 d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{docsProximos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {(["vencido", "rojo", "naranja", "amarillo", "ok", "sin_datos"] as EstadoServiceGeneral[]).map(
          (k) => (
            <span key={k} className="flex items-center gap-1.5">
              <Dot estado={k} /> {ESTADO_SG[k].label}
            </span>
          )
        )}
      </div>

      {/* Programación de mantenimiento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-slate-500" /> Programación de mantenimiento (service general)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Km / Hs actual</TableHead>
                <TableHead>Último service</TableHead>
                <TableHead>Próximo service</TableHead>
                <TableHead>Restante</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progOrdenada.map((p) => {
                const actual = p.mide === "horas" ? p.ultimoHorometro : p.kmActual
                const proximoTxt =
                  p.motivo === "km" && p.proximoKm != null
                    ? `${fmtNum(p.proximoKm)} km`
                    : p.proximaFecha
                      ? fmtFecha(p.proximaFecha)
                      : "—"
                const ultimoTxt =
                  p.ultimaFecha == null
                    ? "—"
                    : `${fmtFecha(p.ultimaFecha)}${
                        p.ultimoOdometro != null ? ` · ${fmtNum(p.ultimoOdometro)} km` : ""
                      }`
                return (
                  <TableRow key={p.dominio}>
                    <TableCell>
                      <Dot estado={p.estado} />
                    </TableCell>
                    <TableCell className="font-medium">{p.dominio}</TableCell>
                    <TableCell>
                      {actual != null ? `${fmtNum(actual)} ${p.mide === "horas" ? "hs" : "km"}` : "—"}
                    </TableCell>
                    <TableCell className="text-slate-600">{ultimoTxt}</TableCell>
                    <TableCell className="text-slate-600">{proximoTxt}</TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        p.estado === "vencido" || p.estado === "rojo"
                          ? "text-red-600"
                          : "text-slate-700"
                      )}
                    >
                      {p.estado === "sin_datos"
                        ? "—"
                        : p.mide === "km" && p.kmRestante != null && p.motivo === "km"
                          ? `${fmtNum(p.kmRestante)} km (${diasTexto(p.diasRestantes)})`
                          : diasTexto(p.diasRestantes)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          ESTADO_SG[p.estado].badge
                        )}
                      >
                        {ESTADO_SG[p.estado].label}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Documentos vencidos y por vencer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="size-4 text-slate-500" /> Documentos vencidos y por vencer
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {docsAlerta.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay documentos vencidos ni por vencer en los próximos 30 días.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Restante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docsAlerta.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Dot estado={d.estado} />
                    </TableCell>
                    <TableCell className="font-medium">{d.dominio}</TableCell>
                    <TableCell>{d.categoria}</TableCell>
                    <TableCell className="text-slate-600">{fmtFecha(d.fechaVencimiento)}</TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        d.estado === "vencido" || d.estado === "rojo"
                          ? "text-red-600"
                          : "text-slate-700"
                      )}
                    >
                      {diasTexto(d.diasRestantes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
