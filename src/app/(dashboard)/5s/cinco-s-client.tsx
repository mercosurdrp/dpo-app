"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Plus, Target, Truck, Warehouse, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { NuevaFlotaDialog } from "@/components/s5/nueva-flota-dialog"
import { NuevaAlmacenDialog } from "@/components/s5/nueva-almacen-dialog"
import { upsertSectorResponsable } from "@/actions/s5"
import {
  S5_AUDITORIA_ESTADO_COLORS,
  S5_AUDITORIA_ESTADO_LABELS,
  type S5AuditoriaConMeta,
  type S5SectorResponsableFull,
  type S5VehiculoPendiente,
  type UserRole,
} from "@/types/database"

function formatFecha(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function formatMes(periodo: string) {
  const d = new Date(periodo + "T00:00:00")
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

export function CincoSClient({
  periodoActual,
  currentRole,
  auditoriasFlota,
  auditoriasAlmacen,
  responsables,
  vehiculosActivos,
  vehiculosPendientes,
  empleados,
}: {
  periodoActual: string
  currentRole: UserRole
  auditoriasFlota: S5AuditoriaConMeta[]
  auditoriasAlmacen: S5AuditoriaConMeta[]
  responsables: S5SectorResponsableFull[]
  vehiculosActivos: { id: string; dominio: string; descripcion: string | null }[]
  vehiculosPendientes: S5VehiculoPendiente[]
  empleados: { id: string; legajo: number; nombre: string }[]
}) {
  const router = useRouter()
  const [openNuevaFlota, setOpenNuevaFlota] = useState(false)
  const [openNuevaAlmacen, setOpenNuevaAlmacen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const canEdit = currentRole === "admin" || currentRole === "auditor"

  // KPIs flota
  const kpisFlota = useMemo(() => {
    const completadas = auditoriasFlota.filter((a) => a.estado === "completada")
    const prom =
      completadas.length > 0
        ? completadas.reduce((acc, a) => acc + (a.nota_total ?? 0), 0) /
          completadas.length
        : 0
    return {
      total: auditoriasFlota.length,
      completadas: completadas.length,
      promedio: prom,
      pendientes: vehiculosPendientes.length,
    }
  }, [auditoriasFlota, vehiculosPendientes])

  const kpisAlmacen = useMemo(() => {
    const completadas = auditoriasAlmacen.filter(
      (a) => a.estado === "completada"
    )
    const prom =
      completadas.length > 0
        ? completadas.reduce((acc, a) => acc + (a.nota_total ?? 0), 0) /
          completadas.length
        : 0
    return {
      total: auditoriasAlmacen.length,
      completadas: completadas.length,
      promedio: prom,
    }
  }, [auditoriasAlmacen])

  const respBySector = useMemo(() => {
    const m = new Map<number, S5SectorResponsableFull>()
    for (const r of responsables) m.set(r.sector_numero, r)
    return m
  }, [responsables])

  function handleAsignarResponsable(sector: number, empleadoId: string) {
    if (!canEdit) return
    startTransition(async () => {
      const res = await upsertSectorResponsable(
        periodoActual,
        sector,
        empleadoId
      )
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Sector ${sector} asignado a ${res.data.empleado_nombre}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Target className="size-6 text-indigo-600" />
            5S — Flota y Almacén
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Auditorías mensuales de orden, limpieza y organización.{" "}
            <span className="font-medium capitalize">
              {formatMes(periodoActual)}
            </span>
          </p>
        </div>
      </div>

      <Tabs defaultValue="flota" className="space-y-4">
        <TabsList>
          <TabsTrigger value="flota">
            <Truck className="mr-1.5 size-4" />
            Flota
          </TabsTrigger>
          <TabsTrigger value="almacen">
            <Warehouse className="mr-1.5 size-4" />
            Almacén
          </TabsTrigger>
        </TabsList>

        {/* ============= Tab Flota ============= */}
        <TabsContent value="flota" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Auditorías del mes"
              value={kpisFlota.total}
              sub={`${kpisFlota.completadas} completadas`}
            />
            <KpiCard
              label="Promedio % completadas"
              value={`${kpisFlota.promedio.toFixed(1)}%`}
            />
            <KpiCard
              label="Vehículos pendientes"
              value={kpisFlota.pendientes}
              variant="warning"
            />
            <KpiCard
              label="Vehículos activos"
              value={vehiculosActivos.length}
            />
          </div>

          <div className="flex justify-end">
            {canEdit && (
              <Button onClick={() => setOpenNuevaFlota(true)}>
                <Plus className="mr-2 size-4" />
                Nueva auditoría de flota
              </Button>
            )}
          </div>

          {/* Tabla auditorías flota */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Auditorías del mes — Flota
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditoriasFlota.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aún no hay auditorías este mes.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Patente</TableHead>
                        <TableHead>Chofer</TableHead>
                        <TableHead>Auditor</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Nota</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditoriasFlota.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{formatFecha(a.fecha)}</TableCell>
                          <TableCell className="font-medium">
                            {a.vehiculo_dominio ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {a.chofer_nombre ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.auditor_nombre}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              style={{
                                backgroundColor:
                                  S5_AUDITORIA_ESTADO_COLORS[a.estado] + "20",
                                color: S5_AUDITORIA_ESTADO_COLORS[a.estado],
                              }}
                            >
                              {S5_AUDITORIA_ESTADO_LABELS[a.estado]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {a.nota_total !== null
                              ? `${a.nota_total.toFixed(1)}%`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Link href={`/5s/auditoria/${a.id}`}>
                              <Button size="sm" variant="ghost">
                                <ChevronRight className="size-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pendientes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Vehículos pendientes este mes ({vehiculosPendientes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vehiculosPendientes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Todos los vehículos ya tienen auditoría completada.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {vehiculosPendientes.map((v) => (
                    <Badge
                      key={v.id}
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-700"
                    >
                      {v.dominio}
                      {v.descripcion && (
                        <span className="ml-1 text-xs opacity-70">
                          · {v.descripcion}
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= Tab Almacén ============= */}
        <TabsContent value="almacen" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiCard
              label="Auditorías del mes"
              value={kpisAlmacen.total}
              sub={`${kpisAlmacen.completadas} completadas`}
            />
            <KpiCard
              label="Promedio % completadas"
              value={`${kpisAlmacen.promedio.toFixed(1)}%`}
            />
            <KpiCard label="Sectores" value={4} />
          </div>

          {/* Responsables del mes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Responsables del mes por sector
              </CardTitle>
              {!canEdit && (
                <span className="text-xs text-muted-foreground">
                  (sólo lectura)
                </span>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map((sector) => {
                  const actual = respBySector.get(sector)
                  return (
                    <div
                      key={sector}
                      className="rounded-lg border bg-muted/20 p-3"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        Sector {sector}
                      </p>
                      {canEdit ? (
                        <Select
                          value={actual?.empleado_id ?? ""}
                          onValueChange={(v) =>
                            v && handleAsignarResponsable(sector, v)
                          }
                          disabled={isPending}
                        >
                          <SelectTrigger className="mt-2 w-full">
                            <SelectValue placeholder="Seleccionar empleado" />
                          </SelectTrigger>
                          <SelectContent>
                            {empleados.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.nombre}{" "}
                                <span className="text-xs text-muted-foreground">
                                  · #{e.legajo}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {actual?.empleado_nombre ?? "Sin asignar"}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            {canEdit && (
              <Button onClick={() => setOpenNuevaAlmacen(true)}>
                <Plus className="mr-2 size-4" />
                Nueva auditoría de sector
              </Button>
            )}
          </div>

          {/* Tabla auditorías almacén */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Auditorías del mes — Almacén
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditoriasAlmacen.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aún no hay auditorías este mes.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Auditor</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Nota</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditoriasAlmacen.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{formatFecha(a.fecha)}</TableCell>
                          <TableCell className="font-medium">
                            Sector {a.sector_numero}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.auditor_nombre}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              style={{
                                backgroundColor:
                                  S5_AUDITORIA_ESTADO_COLORS[a.estado] + "20",
                                color: S5_AUDITORIA_ESTADO_COLORS[a.estado],
                              }}
                            >
                              {S5_AUDITORIA_ESTADO_LABELS[a.estado]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {a.nota_total !== null
                              ? `${a.nota_total.toFixed(1)}%`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Link href={`/5s/auditoria/${a.id}`}>
                              <Button size="sm" variant="ghost">
                                <ChevronRight className="size-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NuevaFlotaDialog
        open={openNuevaFlota}
        onOpenChange={setOpenNuevaFlota}
        vehiculos={vehiculosActivos}
        pendientes={vehiculosPendientes}
      />
      <NuevaAlmacenDialog
        open={openNuevaAlmacen}
        onOpenChange={setOpenNuevaAlmacen}
        responsables={responsables}
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string
  value: number | string
  sub?: string
  variant?: "default" | "warning"
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={
            variant === "warning"
              ? "mt-1 text-2xl font-bold text-amber-600"
              : "mt-1 text-2xl font-bold text-slate-900"
          }
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
