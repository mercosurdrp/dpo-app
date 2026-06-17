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
import { ClipboardList, FileWarning, Gauge, ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  DocumentoVencimiento,
  EstadoServiceGeneral,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type { TableroAlertaTri, TableroResumen } from "@/actions/mantenimiento-vehiculos"

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

// ---------- Tarjetas tipo Cloudfleet ----------

type Tono = "danger" | "warn"

function Circulo({ label, value, tono }: { label: string; value: number; tono: Tono }) {
  const cero = value === 0
  const bg = cero ? "bg-emerald-500" : tono === "warn" ? "bg-amber-400" : "bg-red-500"
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <span className="text-center text-[11px] leading-tight text-slate-500">{label}</span>
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-full text-base font-bold text-white",
          bg
        )}
      >
        {value}
      </span>
    </div>
  )
}

function CirclesCard({
  title,
  items,
}: {
  title: string
  items: { label: string; value: number; tono: Tono }[]
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="mb-3 text-center text-sm font-medium text-slate-600">{title}</p>
      <div className="flex justify-around gap-2">
        {items.map((it) => (
          <Circulo key={it.label} {...it} />
        ))}
      </div>
    </div>
  )
}

function triItems(tri: TableroAlertaTri): { label: string; value: number; tono: Tono }[] {
  return [
    { label: "Vencidas", value: tri.vencidas, tono: "danger" },
    { label: "Vencen hoy", value: tri.hoy, tono: "danger" },
    { label: "Próximas", value: tri.proximas, tono: "warn" },
  ]
}

function StatRow({
  label,
  value,
  tono,
}: {
  label: string
  value: number
  tono: "pendiente" | "info"
}) {
  const bg =
    tono === "info"
      ? "bg-slate-100 text-slate-700"
      : value > 0
        ? "bg-red-500 text-white"
        : "bg-emerald-500 text-white"
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span
        className={cn(
          "inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold",
          bg
        )}
      >
        {value}
      </span>
    </div>
  )
}

interface Props {
  programacion: ServiceGeneralUnidad[]
  documentos: DocumentoVencimiento[]
  resumen: TableroResumen
}

export function TableroOperativo({ programacion, documentos, resumen }: Props) {
  const alerta = (e: EstadoServiceGeneral) =>
    e === "vencido" || e === "rojo" || e === "naranja" || e === "amarillo"

  const progOrdenada = [...programacion].sort((a, b) => {
    const oe = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
    if (oe !== 0) return oe
    const da = a.diasRestantes ?? Infinity
    const db = b.diasRestantes ?? Infinity
    return da - db
  })

  const docsAlerta = documentos
    .filter((d) => alerta(d.estado))
    .sort((a, b) => a.diasRestantes - b.diasRestantes)

  const { pendientes, hoy, alertas } = resumen

  return (
    <div className="space-y-6">
      {/* ===== Vista general estilo Cloudfleet ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna izquierda: Pendientes + Registro de actividades */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4 text-slate-500" /> Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <StatRow label="OT abiertas" value={pendientes.otAbiertas} tono="pendiente" />
              <StatRow
                label="Trabajos pendientes"
                value={pendientes.trabajosPendientes}
                tono="pendiente"
              />
              <StatRow
                label="Novedades sin resolver"
                value={pendientes.novedadesSinResolver}
                tono="pendiente"
              />
              <StatRow label="OC sin compra" value={pendientes.ocSinCompra} tono="pendiente" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4 text-slate-500" /> Registro de actividades (hoy)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <StatRow label="Vehículos con checklist" value={hoy.vehiculosChecklist} tono="info" />
              <StatRow label="Novedades creadas" value={hoy.novedadesCreadas} tono="info" />
              <StatRow label="OT creadas" value={hoy.otCreadas} tono="info" />
              <StatRow
                label="OT cerradas técnicamente"
                value={hoy.otCerradasTecnica}
                tono="info"
              />
              <StatRow
                label="OT cerradas completamente"
                value={hoy.otCerradasCompleta}
                tono="info"
              />
              <StatRow
                label="Llantas inspeccionadas"
                value={hoy.llantasInspeccionadas}
                tono="info"
              />
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: Alertas */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <CirclesCard
                title="Programaciones de Mantenimiento"
                items={triItems(alertas.mantenimiento)}
              />
              <CirclesCard
                title="Documentos de Vehículos"
                items={triItems(alertas.docsVehiculos)}
              />
              <CirclesCard
                title="Documentos de Personal"
                items={triItems(alertas.docsPersonal)}
              />
              <CirclesCard
                title="Documentos de Proveedores"
                items={triItems(alertas.docsProveedores)}
              />
              <CirclesCard
                title="Llantas"
                items={[
                  { label: "Profundidad mínima", value: alertas.llantas.profundidadBaja, tono: "danger" },
                  { label: "Presión mínima", value: alertas.llantas.presionBaja, tono: "danger" },
                  { label: "Presión máxima", value: alertas.llantas.presionAlta, tono: "danger" },
                ]}
              />
              <CirclesCard
                title="Próximo Checklist"
                items={triItems(alertas.proximoChecklist)}
              />
              <CirclesCard
                title="Existencias de Inventario"
                items={[
                  { label: "Mínima superada", value: alertas.inventario.minimaSuperada, tono: "danger" },
                  { label: "Máxima superada", value: alertas.inventario.maximaSuperada, tono: "danger" },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leyenda del semáforo de service */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {(["vencido", "rojo", "naranja", "amarillo", "ok", "sin_datos"] as EstadoServiceGeneral[]).map(
          (k) => (
            <span key={k} className="flex items-center gap-1.5">
              <Dot estado={k} /> {ESTADO_SG[k].label}
            </span>
          )
        )}
      </div>

      {/* Programación de mantenimiento (detalle service general) */}
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
                    : `${fmtFecha(p.ultimaFecha)}${
                        p.ultimoOdometro != null ? ` · ${fmtNum(p.ultimoOdometro)} ${u}` : ""
                      }`
                const registroTxt =
                  p.fechaUltRegistro == null
                    ? "—"
                    : `${fmtFecha(p.fechaUltRegistro)}${
                        p.kmUltRegistro != null ? ` · ${fmtNum(p.kmUltRegistro)} ${u}` : ""
                      }`
                const proximoTxt =
                  p.proximaFecha == null
                    ? "—"
                    : `${fmtFecha(p.proximaFecha)}${
                        p.motivo === "km" && p.proximoKm != null
                          ? ` · ${fmtNum(p.proximoKm)} ${u}`
                          : ""
                      }`
                return (
                  <TableRow key={p.dominio}>
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
                        p.estado === "vencido" || p.estado === "rojo"
                          ? "text-red-600"
                          : "text-slate-700"
                      )}
                    >
                      {p.diasRestantes == null ? "—" : p.diasRestantes}
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
