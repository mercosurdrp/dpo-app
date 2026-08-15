"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Archive,
  ClipboardList,
  FileWarning,
  Gauge,
  Loader2,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { registrarLecturaVehiculo } from "@/actions/mantenimiento-vehiculos"
import type {
  DocumentoVencimiento,
  EstadoServiceGeneral,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type { UnidadBaja } from "@/actions/mantenimiento-vehiculos"

const ESTADO_SG: Record<
  EstadoServiceGeneral,
  { label: string; dot: string; badge: string }
> = {
  vencido: {
    label: "Vencido",
    dot: "bg-destructive",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  rojo: {
    label: "≤10 días",
    dot: "bg-destructive/70",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  naranja: {
    label: "≤15 días",
    dot: "bg-orange-500",
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  },
  amarillo: {
    label: "≤30 días",
    dot: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  ok: {
    label: "Al día",
    dot: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  sin_datos: {
    label: "Sin datos",
    dot: "bg-muted-foreground/40",
    badge: "border-border bg-muted text-muted-foreground",
  },
  no_aplica: {
    label: "No lleva service",
    dot: "bg-border",
    badge: "border-border bg-muted/50 text-muted-foreground/70",
  },
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

/** El tipo se re-exporta desde acá porque el resto del módulo lo importaba
 *  de este archivo; su definición vive con la tarjeta que lo usa. */
export type { OTPendiente } from "./_components/ot-abiertas-card"

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

/**
 * Contador del encabezado de una tarjeta. Antes era un `<Badge>` suelto: decía
 * cuántos había y para verlos había que buscarlos a ojo en la tabla de abajo.
 */
function BadgeFiltro({
  activo,
  onClick,
  cls,
  children,
  titulo,
}: {
  activo: boolean
  onClick: () => void
  cls: string
  children: React.ReactNode
  titulo?: string
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} title={titulo ?? (activo ? "Quitar el filtro" : "Ver sólo estos")}>
      <Badge
        className={cn(
          cls,
          "transition-shadow hover:brightness-95",
          activo && "ring-2 ring-ring ring-offset-1"
        )}
      >
        {children}
      </Badge>
    </button>
  )
}

// Diálogo de carga rápida de lectura de odómetro/horómetro, para unidades sin
// fuente automática (autoelevadores sin checklist diario, camionetas del
// depósito). La lectura alimenta el "km/hs actual" y la proyección del service.
function CargarLecturaDialog({
  unidad,
  onClose,
}: {
  unidad: ServiceGeneralUnidad
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [valor, setValor] = useState("")
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [guardando, setGuardando] = useState(false)
  const esHoras = unidad.mide === "horas"

  const guardar = async () => {
    const v = Number(valor)
    if (!valor.trim() || !Number.isFinite(v) || v < 0) {
      toast.error(`Cargá ${esHoras ? "las horas" : "los km"} de la unidad`)
      return
    }
    setGuardando(true)
    const res = await registrarLecturaVehiculo({
      dominio: unidad.dominio,
      fecha,
      valor: v,
    })
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(`Lectura de ${unidad.dominio} guardada`)
    onClose()
    startTransition(() => router.refresh())
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cargar lectura — {unidad.dominio}</DialogTitle>
          <DialogDescription>
            {esHoras
              ? "Horas del horómetro tal como figuran en el tablero de la unidad."
              : "Kilómetros del odómetro tal como figuran en el tablero de la unidad."}{" "}
            Actualiza el {esHoras ? "horas" : "km"} actual y la proyección del próximo service.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{esHoras ? "Horómetro (hs)" : "Odómetro (km)"}</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={
                unidad.kmActual != null
                  ? `última: ${new Intl.NumberFormat("es-AR").format(unidad.kmActual)}`
                  : esHoras
                    ? "hs actuales"
                    : "km actuales"
              }
              autoFocus
            />
          </div>
          <div>
            <Label>Fecha de la lectura</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || pending}>
            {guardando && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Props {
  programacion: ServiceGeneralUnidad[]
  documentos: DocumentoVencimiento[]
  unidadesBaja: UnidadBaja[]
  puedeEditar: boolean
  onNavigate: (tab: string, dominio?: string) => void
}

export function TableroOperativo({ programacion, documentos, unidadesBaja, puedeEditar, onNavigate }: Props) {
  const [resaltado, setResaltado] = useState<string | null>(null)
  const [lecturaDe, setLecturaDe] = useState<ServiceGeneralUnidad | null>(null)
  /** Los contadores de arriba de cada tabla ahora la filtran (eran adorno). */
  const [filtroService, setFiltroService] = useState<"vencidos" | "por_vencer" | null>(null)
  const [verDocs, setVerDocs] = useState(true)

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
  const serviceEnPantalla =
    filtroService == null
      ? servicePendientes
      : filtroService === "vencidos"
        ? servicePendientes.filter((p) => p.estado === "vencido")
        : servicePendientes.filter((p) => p.estado !== "vencido")

  const irAProgramacion = (dominio: string) => {
    setResaltado(dominio)
    const el = document.getElementById(`svc-${dominio}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  // Documentación vencida por unidad: la unidad queda fuera de servicio hasta
  // regularizar (DPO Flota R1.1.4). Ordenado por el vencimiento más viejo.
  const docsVencidos = documentos
    .filter((d) => d.diasRestantes < 0)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
  // El aviso cuenta UNIDADES y la lista son PAPELES: una unidad puede tener dos.
  const unidadesSinPapeles = new Set(docsVencidos.map((d) => d.dominio)).size

  return (
    <div className="space-y-6">
      <DpoSeccionCinta seccionId="tablero" />

      {/* ===== Fuera de servicio por documentación vencida ===== */}
      {docsVencidos.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <FileWarning className="size-4" /> Fuera de servicio por documentación
              <BadgeFiltro
                activo={verDocs}
                onClick={() => setVerDocs((v) => !v)}
                cls="border-destructive/30 bg-destructive/10 text-destructive"
                titulo={verDocs ? "Ocultar el detalle" : "Ver qué papel le falta a cada unidad"}
              >
                {unidadesSinPapeles}{" "}
                {unidadesSinPapeles === 1 ? "unidad" : "unidades"}
              </BadgeFiltro>
            </CardTitle>
          </CardHeader>
          {verDocs && (
            <CardContent>
              <p className="mb-2 text-xs text-destructive">
                Estas unidades tienen documentación vencida y no deben salir a ruta hasta
                regularizarla. Tocá una para abrir su ficha.
              </p>
              <div className="flex flex-wrap gap-2">
                {docsVencidos.map((d) => (
                  <Link
                    key={d.id}
                    href={`/vehiculos/${encodeURIComponent(d.dominio)}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-card px-2 py-1 text-xs transition-colors hover:bg-destructive/10"
                  >
                    <span className="font-semibold text-foreground">{d.dominio}</span>
                    <span className="text-muted-foreground">{d.categoria}</span>
                    <span className="font-medium text-destructive">
                      venció hace {Math.abs(d.diasRestantes)} d
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ===== Alertas: Service pendientes =====
          "Órdenes de trabajo" se mudó a Programación OT, debajo del calendario:
          quien programa la semana necesita verlas ahí, no acá. */}
      <div className="grid gap-4">
        {/* Service pendientes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-muted-foreground" /> Service pendientes
            </CardTitle>
            <div className="flex gap-1.5">
              <BadgeFiltro
                activo={filtroService === "vencidos"}
                onClick={() =>
                  setFiltroService((f) => (f === "vencidos" ? null : "vencidos"))
                }
                cls="border-destructive/30 bg-destructive/10 text-destructive"
              >
                Vencidos: {serviceVencidos}
              </BadgeFiltro>
              <BadgeFiltro
                activo={filtroService === "por_vencer"}
                onClick={() =>
                  setFiltroService((f) => (f === "por_vencer" ? null : "por_vencer"))
                }
                cls="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              >
                Por vencer: {servicePorVencer}
              </BadgeFiltro>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {filtroService && (
              <p className="pb-2 text-xs text-muted-foreground">
                Mostrando {serviceEnPantalla.length} de {servicePendientes.length}.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setFiltroService(null)}
                >
                  Ver todos
                </button>
              </p>
            )}
            {serviceEnPantalla.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No hay services vencidos ni próximos.</p>
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
                  {serviceEnPantalla.map((p) => {
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
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => irAProgramacion(p.dominio)}
                      >
                        <TableCell className="font-medium">{p.dominio}</TableCell>
                        <TableCell className="text-muted-foreground">{prox}</TableCell>
                        <TableCell
                          className={cn(
                            "font-medium",
                            p.estado === "vencido" || p.estado === "rojo"
                              ? "text-destructive"
                              : "text-foreground"
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
      </div>

      {/* Leyenda del semáforo de service */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
            <ClipboardList className="size-4 text-muted-foreground" /> Programación de mantenimiento (service general)
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
                {puedeEditar && <TableHead className="w-10" />}
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
                    className={cn(resaltado === p.dominio && "bg-amber-500/10 ring-1 ring-amber-500/40")}
                  >
                    <TableCell>
                      <Dot estado={p.estado} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.dominio}
                      {p.motivo === "tiempo" && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">(por tiempo)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{ultimoTxt}</TableCell>
                    <TableCell className="text-muted-foreground">{registroTxt}</TableCell>
                    <TableCell className="text-muted-foreground">{proximoTxt}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        p.estado === "vencido" || p.estado === "rojo"
                          ? "text-destructive"
                          : "text-foreground"
                      )}
                    >
                      {p.diasRestantes == null ? "—" : p.diasRestantes}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ESTADO_SG[p.estado].badge}>
                        {ESTADO_SG[p.estado].label}
                      </Badge>
                    </TableCell>
                    {puedeEditar && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title={`Cargar lectura de ${p.mide === "horas" ? "horómetro" : "odómetro"}`}
                          onClick={() => setLecturaDe(p)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {lecturaDe && <CargarLecturaDialog unidad={lecturaDe} onClose={() => setLecturaDe(null)} />}

      {/* ===== Unidades dadas de baja (vendidas/retiradas) ===== */}
      {unidadesBaja.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
              <Archive className="size-4" /> Unidades dadas de baja
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Fuera de la programación, pero con su historial de OTs y checklists conservado.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {unidadesBaja.map((u) => (
                <li key={u.dominio} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium text-foreground">{u.dominio}</span>
                  <span className="text-muted-foreground">{u.descripcion ?? "—"}</span>
                  <button
                    type="button"
                    className="ml-auto text-xs text-primary hover:underline"
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

