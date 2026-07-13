"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Plus,
  Target,
  Truck,
  Warehouse,
  Pencil,
  Trash2,
  BarChart3,
  Users,
  ClipboardList,
  Shuffle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import {
  upsertSectorResponsable,
  eliminarAuditoria,
  actualizarNombreSectorAlmacen,
  sortearResponsablesMes,
  setElegible5S,
} from "@/actions/s5"
import {
  S5_AUDITORIA_ESTADO_COLORS,
  S5_AUDITORIA_ESTADO_LABELS,
  type S5AuditoriaConMeta,
  type S5Elegible,
  type S5SectorAlmacen,
  type S5SectorResponsableFull,
  type S5Tipo,
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
  tipoInicial = "flota",
  currentRole,
  auditoriasFlota,
  auditoriasAlmacen,
  responsables,
  vehiculosActivos,
  vehiculosPendientes,
  empleados,
  sectoresAlmacen,
  elegibles,
  historialResponsables,
}: {
  periodoActual: string
  tipoInicial?: S5Tipo
  currentRole: UserRole
  auditoriasFlota: S5AuditoriaConMeta[]
  auditoriasAlmacen: S5AuditoriaConMeta[]
  responsables: S5SectorResponsableFull[]
  vehiculosActivos: { id: string; dominio: string; descripcion: string | null }[]
  vehiculosPendientes: S5VehiculoPendiente[]
  empleados: { id: string; legajo: number; nombre: string; sector: string | null }[]
  sectoresAlmacen: S5SectorAlmacen[]
  elegibles: S5Elegible[]
  historialResponsables: S5SectorResponsableFull[]
}) {
  const router = useRouter()
  const [openNuevaFlota, setOpenNuevaFlota] = useState(false)
  const [openNuevaAlmacen, setOpenNuevaAlmacen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tipo, setTipo] = useState<S5Tipo>(tipoInicial)

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
    const delMes = auditoriasAlmacen.filter((a) => a.periodo === periodoActual)
    const completadas = delMes.filter((a) => a.estado === "completada")
    const prom =
      completadas.length > 0
        ? completadas.reduce((acc, a) => acc + (a.nota_total ?? 0), 0) /
          completadas.length
        : 0
    return {
      total: delMes.length,
      completadas: completadas.length,
      promedio: prom,
    }
  }, [auditoriasAlmacen, periodoActual])

  const respBySector = useMemo(() => {
    const m = new Map<number, S5SectorResponsableFull>()
    for (const r of responsables) m.set(r.sector_numero, r)
    return m
  }, [responsables])

  const empleadosDeposito = useMemo(
    () => empleados.filter((e) => e.sector === "Depósito"),
    [empleados]
  )

  const elegiblesActivos = useMemo(
    () => elegibles.filter((e) => e.elegible),
    [elegibles]
  )

  /** Un renglón por mes: los 4 sectores con su responsable, más los meses
   *  que tienen auditorías pero a los que nunca se les cargó nadie. */
  const historialPorMes = useMemo(() => {
    const meses = new Set<string>()
    for (const r of historialResponsables) meses.add(r.periodo)
    for (const a of auditoriasAlmacen) meses.add(a.periodo)
    meses.add(periodoActual)

    const respByKey = new Map<string, S5SectorResponsableFull>()
    for (const r of historialResponsables) {
      respByKey.set(`${r.periodo}:${r.sector_numero}`, r)
    }
    const auditoriasPorMes = new Map<string, number>()
    for (const a of auditoriasAlmacen) {
      auditoriasPorMes.set(a.periodo, (auditoriasPorMes.get(a.periodo) ?? 0) + 1)
    }

    return [...meses]
      .sort((a, b) => b.localeCompare(a))
      .map((periodo) => ({
        periodo,
        auditorias: auditoriasPorMes.get(periodo) ?? 0,
        sectores: [1, 2, 3, 4].map(
          (sector) => respByKey.get(`${periodo}:${sector}`) ?? null
        ),
      }))
  }, [historialResponsables, auditoriasAlmacen, periodoActual])

  const empleadosItems = useMemo(() => {
    const o: Record<string, string> = {}
    for (const e of empleadosDeposito) o[e.id] = e.nombre
    return o
  }, [empleadosDeposito])

  const nombreBySector = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of sectoresAlmacen) m.set(s.numero, s.nombre)
    return m
  }, [sectoresAlmacen])

  function labelSector(numero: number) {
    const nom = nombreBySector.get(numero)
    return nom ? `Sector ${numero} — ${nom}` : `Sector ${numero}`
  }

  function handleAsignarNombreSector(sector: number, nombre: string) {
    if (!nombre.trim()) {
      toast.error("El nombre no puede estar vacío")
      return
    }
    startTransition(async () => {
      const res = await actualizarNombreSectorAlmacen(sector, nombre)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Sector ${sector} → ${res.data.nombre}`)
      router.refresh()
    })
  }

  function handleAsignarResponsable(
    sector: number,
    empleadoId: string,
    periodo: string = periodoActual
  ) {
    if (!canEdit) return
    startTransition(async () => {
      const res = await upsertSectorResponsable(periodo, sector, empleadoId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        `${formatMes(periodo)} · sector ${sector} → ${res.data.empleado_nombre}`
      )
      router.refresh()
    })
  }

  function handleToggleElegible(e: S5Elegible) {
    if (!canEdit) return
    if (
      e.elegible &&
      elegiblesActivos.length <= 4 &&
      !confirm(
        `Quedarían ${elegiblesActivos.length - 1} elegibles y el sorteo necesita 4. ¿Sacar igual a ${e.nombre}?`
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await setElegible5S(e.id, !e.elegible)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        e.elegible
          ? `${e.nombre} sale del sorteo`
          : `${e.nombre} entra al sorteo`
      )
      router.refresh()
    })
  }

  function handleSortear() {
    if (!canEdit) return
    const yaHay = responsables.length > 0
    if (
      yaHay &&
      !confirm(
        `${formatMes(periodoActual)} ya tiene responsables asignados. ¿Volver a sortear? Se reemplazan los 4 y las auditorías del mes pasan al nuevo responsable de su sector.`
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await sortearResponsablesMes(periodoActual)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        `Sorteo listo: ${res.data
          .map((a) => `S${a.sector} → ${a.nombre}`)
          .join(" · ")}`
      )
      router.refresh()
    })
  }

  function handleEliminarAuditoria(id: string, etiqueta: string) {
    if (!confirm(`¿Eliminar la auditoría ${etiqueta}? Se borran también sus ítems.`)) {
      return
    }
    startTransition(async () => {
      const res = await eliminarAuditoria(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Auditoría eliminada")
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
        <div className="flex flex-wrap gap-2">
          <Link href={`/5s/acciones/${tipo}`}>
            <Button variant="outline" size="sm">
              <ClipboardList className="mr-1.5 size-4" />
              Acciones
            </Button>
          </Link>
          <Link href="/5s/ayudantes">
            <Button variant="outline" size="sm">
              <Users className="mr-1.5 size-4" />
              Ranking ayudantes
            </Button>
          </Link>
          <Link href={`/5s/indicadores?tipo=${tipo}`}>
            <Button variant="outline" size="sm">
              <BarChart3 className="mr-1.5 size-4" />
              Indicadores
            </Button>
          </Link>
        </div>
      </div>

      <Tabs
        value={tipo}
        onValueChange={(v) => {
          if (v === "flota" || v === "almacen") setTipo(v)
        }}
        className="space-y-4"
      >
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
                            <div className="flex items-center justify-end gap-1">
                              <Link href={`/5s/auditoria/${a.id}`}>
                                <Button size="sm" variant="ghost" title="Editar">
                                  <Pencil className="size-4" />
                                </Button>
                              </Link>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleEliminarAuditoria(
                                      a.id,
                                      `${formatFecha(a.fecha)} — ${a.vehiculo_dominio ?? "sin patente"}`
                                    )
                                  }
                                  disabled={isPending}
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  title="Eliminar"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
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
              <div>
                <CardTitle className="text-base">
                  Responsables del mes por sector
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  El sorteo reparte los 4 sectores entre los elegibles: primero
                  entran los que menos veces les tocó, el azar sólo desempata.
                </p>
              </div>
              {canEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSortear}
                  disabled={isPending}
                >
                  <Shuffle className="mr-1.5 size-4" />
                  Sortear {formatMes(periodoActual)}
                </Button>
              ) : (
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
                      className="rounded-lg border bg-muted/20 p-3 space-y-2"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {labelSector(sector)}
                      </p>
                      {canEdit ? (
                        <>
                          <Select
                            value={actual?.empleado_id ?? ""}
                            onValueChange={(v) =>
                              v && handleAsignarResponsable(sector, v)
                            }
                            disabled={isPending}
                            items={empleadosItems}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Seleccionar empleado" />
                            </SelectTrigger>
                            <SelectContent>
                              {empleadosDeposito.map((e) => (
                                <SelectItem
                                  key={e.id}
                                  value={e.id}
                                  label={e.nombre}
                                >
                                  {e.nombre}
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    · #{e.legajo}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Nombre del sector"
                            defaultValue={nombreBySector.get(sector) ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              const current = (nombreBySector.get(sector) ?? "").trim()
                              if (v && v !== current) {
                                handleAsignarNombreSector(sector, v)
                              }
                            }}
                            disabled={isPending}
                          />
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {actual?.empleado_nombre ?? "Sin asignar"}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Elegibles del sorteo + historial */}
              <div className="mt-4 rounded-lg border p-3">
                <p className="text-sm font-semibold text-slate-800">
                  Elegibles del sorteo
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {elegiblesActivos.length} de {elegibles.length} operarios de
                    depósito · el número es cuántas veces le tocó
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {elegibles.map((e) => {
                    const historia = e.ultimo_periodo
                      ? `Última vez: ${formatMes(e.ultimo_periodo)}`
                      : "Nunca fue designado"
                    const clase = e.elegible
                      ? "rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                      : "rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground line-through"
                    const contenido = (
                      <>
                        {e.nombre}
                        <span className="ml-1.5 opacity-70">
                          · {e.veces_designado}
                        </span>
                      </>
                    )

                    if (!canEdit) {
                      return (
                        <span key={e.id} title={historia} className={clase}>
                          {contenido}
                        </span>
                      )
                    }

                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => handleToggleElegible(e)}
                        disabled={isPending}
                        title={`${historia} · click para ${
                          e.elegible ? "sacarlo del" : "sumarlo al"
                        } sorteo`}
                        className={`${clase} transition hover:opacity-80 disabled:opacity-50`}
                      >
                        {contenido}
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historial de responsables por mes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de responsables por mes
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Los meses viejos se cargan a mano. Al elegir a alguien, las
                auditorías de ese mes y sector quedan asociadas a esa persona.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      {[1, 2, 3, 4].map((s) => (
                        <TableHead key={s}>{labelSector(s)}</TableHead>
                      ))}
                      <TableHead className="text-right">Auditorías</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historialPorMes.map((fila) => (
                      <TableRow key={fila.periodo}>
                        <TableCell className="font-medium capitalize">
                          {formatMes(fila.periodo)}
                        </TableCell>
                        {fila.sectores.map((resp, i) => {
                          const sector = i + 1
                          return (
                            <TableCell key={sector}>
                              {canEdit ? (
                                <Select
                                  value={resp?.empleado_id ?? ""}
                                  onValueChange={(v) =>
                                    v &&
                                    handleAsignarResponsable(
                                      sector,
                                      v,
                                      fila.periodo
                                    )
                                  }
                                  disabled={isPending}
                                  items={empleadosItems}
                                >
                                  <SelectTrigger className="w-full min-w-40">
                                    <SelectValue placeholder="Sin asignar" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {empleadosDeposito.map((e) => (
                                      <SelectItem
                                        key={e.id}
                                        value={e.id}
                                        label={e.nombre}
                                      >
                                        {e.nombre}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm">
                                  {resp?.empleado_nombre ?? (
                                    <span className="text-muted-foreground">
                                      Sin asignar
                                    </span>
                                  )}
                                </span>
                              )}
                            </TableCell>
                          )
                        })}
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {fila.auditorias}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                Listado de auditorías
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditoriasAlmacen.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aún no hay auditorías cargadas.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Responsable</TableHead>
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
                            {labelSector(a.sector_numero ?? 0)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.responsable_nombre ?? (
                              <span className="text-muted-foreground">
                                Sin asignar
                              </span>
                            )}
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
                            <div className="flex items-center justify-end gap-1">
                              <Link href={`/5s/auditoria/${a.id}`}>
                                <Button size="sm" variant="ghost" title="Editar">
                                  <Pencil className="size-4" />
                                </Button>
                              </Link>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleEliminarAuditoria(
                                      a.id,
                                      `${formatFecha(a.fecha)} — ${labelSector(a.sector_numero ?? 0)}`
                                    )
                                  }
                                  disabled={isPending}
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  title="Eliminar"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
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
        empleados={empleados}
      />
      <NuevaAlmacenDialog
        open={openNuevaAlmacen}
        onOpenChange={setOpenNuevaAlmacen}
        responsables={responsables}
        sectoresAlmacen={sectoresAlmacen}
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
