"use client"

import { useMemo, useState } from "react"
import { Plus, ShieldAlert, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { NuevoReporteDialog } from "@/components/reportes-seguridad/nuevo-reporte-dialog"
import { ReporteDetalleDialog } from "@/components/reportes-seguridad/reporte-detalle-dialog"
import { PlanesTablero } from "@/components/reportes-seguridad/planes-tablero"
import {
  PiramideSeguridad,
  type PiramideConteos,
} from "@/components/reportes-seguridad/piramide-seguridad"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_TIPO_COLORS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_TIPO_SIF_LABELS,
  REPORTE_SEGURIDAD_TIPO_ACCIDENTE_LABELS,
  type ReporteSeguridadConAutor,
  type ReporteSeguridadTipo,
  type ReporteSeguridadLocalidad,
  type UserRole,
} from "@/types/database"

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const TIPOS: ReporteSeguridadTipo[] = [
  "accidente",
  "incidente",
  "acto_inseguro",
  "ruta_riesgo",
  "acto_seguro",
]

const LOCALIDADES: ReporteSeguridadLocalidad[] = [
  "san_nicolas",
  "ramallo",
  "pergamino",
  "colon",
  "otro",
]

function formatDate(iso: string): string {
  // fecha es DATE (YYYY-MM-DD); evitamos corrimiento por timezone.
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function ReportesSeguridadClient({
  reportes,
  currentProfileId,
  currentRole,
}: {
  reportes: ReporteSeguridadConAutor[]
  currentProfileId: string
  currentRole: UserRole
}) {
  const [openNuevo, setOpenNuevo] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<ReporteSeguridadTipo | "all">("all")
  const [filtroLocalidad, setFiltroLocalidad] = useState<
    ReporteSeguridadLocalidad | "all"
  >("all")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")

  const anioActual = new Date().getFullYear()
  const mesActual = new Date().getMonth() + 1
  const [piramideAnio, setPiramideAnio] = useState<number>(anioActual)
  const [piramideMes, setPiramideMes] = useState<number | "all">("all")

  // Selectores propios para la tabla LTI/TRI (independientes de la pirámide).
  const [indAnio, setIndAnio] = useState<number>(anioActual)
  const [indMes, setIndMes] = useState<number>(mesActual)

  // Días sin accidente: tomamos el reporte tipo "accidente" más reciente (global,
  // sin importar filtros) y calculamos la diferencia en días calendario hasta hoy.
  const { diasSinAccidente, ultimoAccidente } = useMemo(() => {
    let max: string | null = null
    for (const r of reportes) {
      if (r.tipo !== "accidente") continue
      if (max === null || r.fecha > max) max = r.fecha
    }
    if (!max) return { diasSinAccidente: null as number | null, ultimoAccidente: null as string | null }
    const [y, m, d] = max.split("-").map(Number)
    if (!y || !m || !d) return { diasSinAccidente: null, ultimoAccidente: null }
    const lastUTC = Date.UTC(y, m - 1, d)
    const now = new Date()
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const dias = Math.max(0, Math.floor((todayUTC - lastUTC) / 86_400_000))
    return { diasSinAccidente: dias, ultimoAccidente: max }
  }, [reportes])

  // Lista de años con datos + año actual (siempre presente, aunque no haya reportes)
  const aniosDisponibles = useMemo(() => {
    const set = new Set<number>([anioActual])
    for (const r of reportes) {
      const y = Number(r.fecha.slice(0, 4))
      if (Number.isFinite(y)) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [reportes, anioActual])

  // Conteos de la pirámide según año + mes elegidos
  const piramideConteos = useMemo<PiramideConteos>(() => {
    const base: PiramideConteos = {
      fat: 0,
      lti: 0,
      mdi: 0,
      mti: 0,
      fai: 0,
      sio: 0,
      sho: 0,
    }
    for (const r of reportes) {
      if (!r.tipo_accidente) continue
      const y = Number(r.fecha.slice(0, 4))
      const m = Number(r.fecha.slice(5, 7))
      if (y !== piramideAnio) continue
      if (piramideMes !== "all" && m !== piramideMes) continue
      base[r.tipo_accidente] += 1
    }
    return base
  }, [reportes, piramideAnio, piramideMes])

  // Indicadores LTI / TRI por día del mes seleccionado, con MTD y YTD.
  // LTI = tipo_accidente === 'lti'
  // TRI = tipo_accidente ∈ {'lti', 'mdi', 'mti'}
  const indicadoresLtiTri = useMemo(() => {
    const diasEnMes = new Date(indAnio, indMes, 0).getDate()
    const lti = Array(diasEnMes).fill(0) as number[]
    const tri = Array(diasEnMes).fill(0) as number[]
    let ltiYtd = 0
    let triYtd = 0
    const triSet = new Set(["lti", "mdi", "mti"])
    for (const r of reportes) {
      if (!r.tipo_accidente) continue
      const y = Number(r.fecha.slice(0, 4))
      if (y !== indAnio) continue
      const isLti = r.tipo_accidente === "lti"
      const isTri = triSet.has(r.tipo_accidente)
      if (isLti) ltiYtd += 1
      if (isTri) triYtd += 1
      const m = Number(r.fecha.slice(5, 7))
      if (m !== indMes) continue
      const d = Number(r.fecha.slice(8, 10))
      if (!Number.isFinite(d) || d < 1 || d > diasEnMes) continue
      if (isLti) lti[d - 1] += 1
      if (isTri) tri[d - 1] += 1
    }
    const ltiMtd = lti.reduce((a, b) => a + b, 0)
    const triMtd = tri.reduce((a, b) => a + b, 0)
    return { diasEnMes, lti, tri, ltiMtd, triMtd, ltiYtd, triYtd }
  }, [reportes, indAnio, indMes])

  // KPIs por tipo según el período seleccionado (mismo filtro que la pirámide)
  const kpisPeriodo = useMemo(() => {
    const base: Record<ReporteSeguridadTipo, number> = {
      accidente: 0,
      incidente: 0,
      acto_inseguro: 0,
      ruta_riesgo: 0,
      acto_seguro: 0,
    }
    for (const r of reportes) {
      const y = Number(r.fecha.slice(0, 4))
      const m = Number(r.fecha.slice(5, 7))
      if (y !== piramideAnio) continue
      if (piramideMes !== "all" && m !== piramideMes) continue
      base[r.tipo] += 1
    }
    return base
  }, [reportes, piramideAnio, piramideMes])

  const periodoLabel =
    piramideMes === "all"
      ? `año ${piramideAnio}`
      : `${MESES[piramideMes - 1]} ${piramideAnio}`

  const filtrados = useMemo(() => {
    return reportes.filter((r) => {
      if (filtroTipo !== "all" && r.tipo !== filtroTipo) return false
      if (filtroLocalidad !== "all" && r.localidad !== filtroLocalidad) return false
      if (fechaDesde && r.fecha < fechaDesde) return false
      if (fechaHasta && r.fecha > fechaHasta) return false
      return true
    })
  }, [reportes, filtroTipo, filtroLocalidad, fechaDesde, fechaHasta])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="size-6 text-red-500" />
            Reportes de Seguridad
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accidentes, incidentes, actos/condiciones inseguras, rutas de riesgo y
            reconocimientos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-sm"
            style={{ borderLeft: "4px solid #16a34a" }}
          >
            <ShieldCheck className="size-7 text-green-600" />
            <div className="leading-tight">
              {diasSinAccidente === null ? (
                <>
                  <p className="text-lg font-bold text-slate-900">Sin accidentes</p>
                  <p className="text-[11px] text-muted-foreground">registrados</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-900">
                    {diasSinAccidente}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      {diasSinAccidente === 1 ? "día" : "días"}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    sin accidentes · último {formatDate(ultimoAccidente!)}
                  </p>
                </>
              )}
            </div>
          </div>
          <Button onClick={() => setOpenNuevo(true)}>
            <Plus className="mr-2 size-4" />
            Nuevo reporte
          </Button>
        </div>
      </div>

      {/* Tabs: Reportes / Planes de acción */}
      <Tabs defaultValue="reportes" className="gap-4">
        <TabsList>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
          <TabsTrigger value="planes">Planes de acción</TabsTrigger>
        </TabsList>

        <TabsContent value="reportes" className="space-y-5">

      {/* Pirámide de Seguridad */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Año</Label>
            <Select
              value={String(piramideAnio)}
              onValueChange={(v) => setPiramideAnio(Number(v))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aniosDisponibles.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mes</Label>
            <Select
              value={piramideMes === "all" ? "all" : String(piramideMes)}
              onValueChange={(v) =>
                setPiramideMes(v === "all" ? "all" : Number(v))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el año</SelectItem>
                {MESES.map((nombre, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <PiramideSeguridad conteos={piramideConteos} />
      </div>

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TIPOS.map((t) => (
          <div
            key={t}
            className="rounded-lg border bg-card p-3"
            style={{ borderLeft: `4px solid ${REPORTE_SEGURIDAD_TIPO_COLORS[t]}` }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {REPORTE_SEGURIDAD_TIPO_LABELS[t]}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{kpisPeriodo[t]}</p>
            <p className="text-[11px] text-muted-foreground">{periodoLabel}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select
            value={filtroTipo}
            onValueChange={(v) =>
              setFiltroTipo((v ?? "all") as ReporteSeguridadTipo | "all")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {REPORTE_SEGURIDAD_TIPO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Localidad</Label>
          <Select
            value={filtroLocalidad}
            onValueChange={(v) =>
              setFiltroLocalidad((v ?? "all") as ReporteSeguridadLocalidad | "all")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {LOCALIDADES.map((l) => (
                <SelectItem key={l} value={l}>
                  {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Desde</Label>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead className="w-20">Hora</TableHead>
              <TableHead className="w-44">Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-36">Tipo SIF</TableHead>
              <TableHead className="w-44">Tipo Accidente</TableHead>
              <TableHead className="w-36">Localidad</TableHead>
              <TableHead className="w-32">Área</TableHead>
              <TableHead className="w-40">Autor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                  No hay reportes para estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetalleId(r.id)}
                >
                  <TableCell className="text-sm">{formatDate(r.fecha)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.hora ? r.hora.slice(0, 5) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor:
                          REPORTE_SEGURIDAD_TIPO_COLORS[r.tipo] + "20",
                        color: REPORTE_SEGURIDAD_TIPO_COLORS[r.tipo],
                      }}
                    >
                      {REPORTE_SEGURIDAD_TIPO_LABELS[r.tipo]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm">
                    {r.descripcion}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.tipo_sif ? (
                      <Badge
                        variant="secondary"
                        className="bg-red-100 text-red-700"
                      >
                        {REPORTE_SEGURIDAD_TIPO_SIF_LABELS[r.tipo_sif]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.tipo_accidente ? (
                      <Badge
                        variant="secondary"
                        className="bg-orange-100 text-orange-700"
                      >
                        {REPORTE_SEGURIDAD_TIPO_ACCIDENTE_LABELS[r.tipo_accidente]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.localidad ? REPORTE_SEGURIDAD_LOCALIDAD_LABELS[r.localidad] : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.area ? REPORTE_SEGURIDAD_AREA_LABELS[r.area] : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.autor_nombre}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Indicadores LTI / TRI por día */}
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Indicadores LTI / TRI por día
            </h2>
            <p className="text-xs text-muted-foreground">
              LTI = accidentes tipo LTI · TRI = LTI + MDI + MTI
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Año</Label>
              <Select
                value={String(indAnio)}
                onValueChange={(v) => setIndAnio(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aniosDisponibles.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mes</Label>
              <Select
                value={String(indMes)}
                onValueChange={(v) => setIndMes(Number(v))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((nombre, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="sticky left-0 z-10 border-r bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-700">
                  Indicador
                </th>
                <th className="border-r px-2 py-1.5 font-semibold text-slate-700">
                  YTD
                </th>
                <th className="border-r px-2 py-1.5 font-semibold text-slate-700">
                  MTD
                </th>
                {Array.from({ length: indicadoresLtiTri.diasEnMes }, (_, i) => (
                  <th
                    key={i}
                    className="border-r px-1.5 py-1.5 text-center font-medium text-slate-600"
                  >
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    nombre: "LTI",
                    serie: indicadoresLtiTri.lti,
                    mtd: indicadoresLtiTri.ltiMtd,
                    ytd: indicadoresLtiTri.ltiYtd,
                  },
                  {
                    nombre: "TRI",
                    serie: indicadoresLtiTri.tri,
                    mtd: indicadoresLtiTri.triMtd,
                    ytd: indicadoresLtiTri.triYtd,
                  },
                ] as const
              ).map((row) => (
                <tr key={row.nombre} className="border-t">
                  <td className="sticky left-0 z-10 border-r bg-white px-2 py-1.5 font-semibold text-slate-900">
                    {row.nombre}
                  </td>
                  <td className="border-r px-2 py-1.5 text-center font-semibold text-slate-900">
                    {row.ytd}
                  </td>
                  <td className="border-r px-2 py-1.5 text-center font-semibold text-slate-900">
                    {row.mtd}
                  </td>
                  {row.serie.map((v, i) => (
                    <td
                      key={i}
                      className={
                        "border-r px-1.5 py-1.5 text-center " +
                        (v > 0
                          ? "bg-red-50 font-semibold text-red-700"
                          : "text-slate-300")
                      }
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="planes" className="space-y-5">
          <PlanesTablero
            currentProfileId={currentProfileId}
            currentRole={currentRole}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NuevoReporteDialog open={openNuevo} onOpenChange={setOpenNuevo} />
      {detalleId && (
        <ReporteDetalleDialog
          key={detalleId}
          reporteId={detalleId}
          open={true}
          onOpenChange={(v) => {
            if (!v) setDetalleId(null)
          }}
          currentProfileId={currentProfileId}
          currentRole={currentRole}
        />
      )}
    </div>
  )
}
