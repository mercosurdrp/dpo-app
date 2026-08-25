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
  Loader2,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import {
  Dot,
  ESTADO_SG,
  ORDEN_ESTADO,
  fmtFecha,
  fmtNum,
} from "./_components/service-estado"
import { registrarLecturaVehiculo } from "@/actions/mantenimiento-vehiculos"
import type {
  DocumentoVencimiento,
  EstadoServiceGeneral,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type { UnidadBaja } from "@/actions/mantenimiento-vehiculos"

/** El tipo se re-exporta desde acá porque el resto del módulo lo importaba
 *  de este archivo; su definición vive con la tarjeta que lo usa. */
export type { OTPendiente } from "./_components/ot-abiertas-card"

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
  const [lecturaDe, setLecturaDe] = useState<ServiceGeneralUnidad | null>(null)
  const [verDocs, setVerDocs] = useState(true)

  const progOrdenada = [...programacion].sort((a, b) => {
    const oe = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
    if (oe !== 0) return oe
    return (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity)
  })

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
                  <TableRow key={p.dominio}>
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

