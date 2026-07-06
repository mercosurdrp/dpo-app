"use client"

import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ScrollText,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  LayoutGrid,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  eliminarCategoria,
  eliminarRequisito,
  getSignedUrl,
} from "@/actions/requisitos-legales"
import { RequisitoFormDialog } from "@/components/requisitos-legales/requisito-form-dialog"
import { RenovarDialog } from "@/components/requisitos-legales/renovar-dialog"
import { CategoriaFormDialog } from "@/components/requisitos-legales/categoria-form-dialog"
import { RaciTab } from "@/components/requisitos-legales/raci-tab"
import type {
  EstadoRequisitoLegal,
  Profile,
  RequisitoLegalCategoria,
  RequisitoLegalConResponsable,
  RequisitoLegalRaci,
  TipoIdentificadorRequisito,
} from "@/types/database"

interface Props {
  categorias: RequisitoLegalCategoria[]
  requisitos: RequisitoLegalConResponsable[]
  responsables: Pick<Profile, "id" | "nombre" | "email">[]
  puedeEditar: boolean
  raci: RequisitoLegalRaci | null
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function columnaPrincipalLabel(tipo: TipoIdentificadorRequisito): string {
  switch (tipo) {
    case "vehiculo":
      return "Vehículo"
    case "persona":
      return "Persona"
    case "ubicacion":
      return "Ubicación"
    default:
      return "Requisito"
  }
}

function EstadoBadge({
  estado,
  dias,
}: {
  estado: EstadoRequisitoLegal
  dias: number
}) {
  if (estado === "vencido") {
    return (
      <Badge className="gap-1 border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
        <XCircle className="size-3.5" />
        Vencido ({Math.abs(dias)}d)
      </Badge>
    )
  }
  if (estado === "por_vencer") {
    return (
      <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        <AlertTriangle className="size-3.5" />
        Por vencer ({dias}d)
      </Badge>
    )
  }
  return (
    <Badge className="gap-1 border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      <CheckCircle2 className="size-3.5" />
      Vigente ({dias}d)
    </Badge>
  )
}

interface CategoriaTablaProps {
  categoria: RequisitoLegalCategoria
  requisitos: RequisitoLegalConResponsable[]
  responsables: Pick<Profile, "id" | "nombre" | "email">[]
  responsablePrincipalNombre: string | null
  puedeEditar: boolean
  onCrear: () => void
  onEditar: (r: RequisitoLegalConResponsable) => void
  onRenovar: (r: RequisitoLegalConResponsable) => void
  onEliminar: (r: RequisitoLegalConResponsable) => void
  onAbrirArchivo: (archivoUrl: string) => void
}

function CategoriaTabla({
  categoria,
  requisitos,
  responsablePrincipalNombre,
  puedeEditar,
  onCrear,
  onEditar,
  onRenovar,
  onEliminar,
  onAbrirArchivo,
}: CategoriaTablaProps) {
  const [filtroEstado, setFiltroEstado] = useState<string>("todos")
  const [busqueda, setBusqueda] = useState("")

  const items = useMemo(() => {
    return requisitos
      .filter((r) => r.categoria_id === categoria.id)
      .filter((r) => {
        if (filtroEstado !== "todos" && r.estado !== filtroEstado) return false
        if (
          busqueda &&
          !r.nombre.toLowerCase().includes(busqueda.toLowerCase())
        )
          return false
        return true
      })
  }, [requisitos, categoria.id, filtroEstado, busqueda])

  const stats = useMemo(() => {
    const items = requisitos.filter((r) => r.categoria_id === categoria.id)
    return items.reduce(
      (acc, r) => {
        acc[r.estado] += 1
        return acc
      },
      { vigente: 0, por_vencer: 0, vencido: 0 } as Record<
        EstadoRequisitoLegal,
        number
      >,
    )
  }, [requisitos, categoria.id])

  const colLabel = columnaPrincipalLabel(categoria.tipo_identificador)

  return (
    <div className="space-y-4">
      {/* Header con stats + responsable + acción */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Vigentes: {stats.vigente}
          </Badge>
          <Badge className="border-amber-200 bg-amber-50 text-amber-800">
            Por vencer: {stats.por_vencer}
          </Badge>
          <Badge className="border-red-200 bg-red-50 text-red-700">
            Vencidos: {stats.vencido}
          </Badge>
          {responsablePrincipalNombre && (
            <span className="text-muted-foreground">
              · Responsable principal:{" "}
              <span className="font-medium text-slate-700">
                {responsablePrincipalNombre}
              </span>
            </span>
          )}
        </div>
        {puedeEditar && (
          <Button size="sm" onClick={onCrear}>
            <Plus className="mr-2 size-4" />
            Agregar a {categoria.nombre}
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder={`Buscar ${colLabel.toLowerCase()}…`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={filtroEstado}
          onValueChange={(v: string | null) => setFiltroEstado(v ?? "todos")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="vigente">Vigentes</SelectItem>
            <SelectItem value="por_vencer">Por vencer</SelectItem>
            <SelectItem value="vencido">Vencidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{colLabel}</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Sin items en esta categoría
                  {puedeEditar ? (
                    <>
                      .{" "}
                      <button
                        className="font-medium text-blue-600 hover:underline"
                        onClick={onCrear}
                      >
                        Agregar el primero
                      </button>
                    </>
                  ) : (
                    "."
                  )}
                </TableCell>
              </TableRow>
            )}
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.nombre}
                  {r.observaciones && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {r.observaciones}
                    </p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(r.fecha_emision)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {formatDate(r.fecha_vencimiento)}
                </TableCell>
                <TableCell>
                  <EstadoBadge estado={r.estado} dias={r.dias_para_vencer} />
                </TableCell>
                <TableCell>
                  {r.responsable_nombre ?? (
                    <span className="italic text-muted-foreground">
                      Sin asignar
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!r.archivo_url}
                      onClick={() => r.archivo_url && onAbrirArchivo(r.archivo_url)}
                      title={
                        r.archivo_url
                          ? `Ver frente (${r.archivo_nombre ?? "archivo"})`
                          : "Sin archivo (frente)"
                      }
                    >
                      <FileDown className="size-3.5" />
                    </Button>
                    {r.archivo_url_2 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrirArchivo(r.archivo_url_2!)}
                        title={`Ver dorso (${r.archivo_nombre_2 ?? "archivo"})`}
                      >
                        <FileDown className="size-3.5" />
                        <span className="ml-0.5 text-[10px] font-semibold">2</span>
                      </Button>
                    )}
                    {puedeEditar && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onRenovar(r)}
                          title="Renovar"
                        >
                          <RefreshCw className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onEditar(r)}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onEliminar(r)}
                          title="Eliminar"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function RequisitosLegalesClient({
  categorias,
  requisitos,
  responsables,
  puedeEditar,
  raci,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [tab, setTab] = useState<string>(categorias[0]?.id ?? "")

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<RequisitoLegalConResponsable | null>(null)
  const [openRenovar, setOpenRenovar] = useState(false)
  const [renovando, setRenovando] = useState<RequisitoLegalConResponsable | null>(
    null,
  )
  const [openCategoria, setOpenCategoria] = useState(false)
  const [editingCategoria, setEditingCategoria] =
    useState<RequisitoLegalCategoria | null>(null)

  const responsablesMap = useMemo(
    () => new Map(responsables.map((r) => [r.id, r.nombre])),
    [responsables],
  )

  const resumenPorCategoria = useMemo(() => {
    return categorias.map((c) => {
      const items = requisitos.filter((r) => r.categoria_id === c.id)
      const counts = items.reduce(
        (acc, r) => {
          acc[r.estado] += 1
          return acc
        },
        { vigente: 0, por_vencer: 0, vencido: 0 } as Record<
          EstadoRequisitoLegal,
          number
        >,
      )
      const total = items.length
      const aprobados = counts.vigente + counts.por_vencer
      const cumplimiento = total === 0 ? 0 : Math.round((aprobados / total) * 100)
      const estadoAgregado: "vacio" | "aprobado" | "vencido" =
        total === 0
          ? "vacio"
          : counts.vencido > 0
            ? "vencido"
            : "aprobado"
      return { categoria: c, total, counts, cumplimiento, estadoAgregado }
    })
  }, [categorias, requisitos])

  function refrescar() {
    router.refresh()
  }

  async function abrirArchivo(archivoUrl: string) {
    const result = await getSignedUrl(archivoUrl)
    if ("error" in result) {
      alert(`Error abriendo archivo: ${result.error}`)
      return
    }
    abrirArchivoEnVisor(result.data.url)
  }

  function handleEliminar(r: RequisitoLegalConResponsable) {
    if (!confirm(`¿Eliminar "${r.nombre}"? Esta acción no se puede deshacer.`)) {
      return
    }
    startTransition(async () => {
      const result = await eliminarRequisito(r.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function handleEliminarCategoria(c: RequisitoLegalCategoria) {
    if (
      !confirm(
        `¿Eliminar la tarjeta "${c.nombre}"? Solo se puede borrar si no tiene requisitos cargados.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarCategoria(c.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      if (tab === c.id) setTab(categorias[0]?.id ?? "")
      refrescar()
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ScrollText className="size-6 text-slate-700" />
          Requisitos Legales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Permisos y licencias para el derecho a operar (DPO Planeamiento 2.1).
        </p>
      </div>

      {/* Matriz general — resumen por categoría */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Matriz general</h2>
          {puedeEditar && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingCategoria(null)
                setOpenCategoria(true)
              }}
            >
              <LayoutGrid className="mr-2 size-4" />
              Agregar tarjeta
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resumenPorCategoria.map(({ categoria, total, counts, cumplimiento, estadoAgregado }) => {
            const colors =
              estadoAgregado === "aprobado"
                ? { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", iconBg: "bg-emerald-100", txt: "text-emerald-700", label: "Aprobado", Icon: CheckCircle2 }
                : estadoAgregado === "vencido"
                  ? { bg: "bg-red-50",   border: "border-red-200",     icon: "text-red-600",     iconBg: "bg-red-100",     txt: "text-red-700",     label: "Vencido",    Icon: XCircle }
                  : { bg: "bg-slate-50", border: "border-slate-200",   icon: "text-slate-500",   iconBg: "bg-slate-100",   txt: "text-slate-600",   label: "Sin items",  Icon: ScrollText }
            const Icon = colors.Icon
            return (
              <div
                key={categoria.id}
                role="button"
                tabIndex={0}
                onClick={() => setTab(categoria.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setTab(categoria.id)
                  }
                }}
                className={`group relative cursor-pointer rounded-lg border ${colors.border} ${colors.bg} p-3 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {categoria.nombre}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {total === 0 ? "Sin items" : `${total} item${total === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {counts.por_vencer > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-800"
                        title={`${counts.por_vencer} por vencer`}
                      >
                        <AlertTriangle className="size-3" />
                        {counts.por_vencer}
                      </span>
                    )}
                    <div className={`flex size-8 items-center justify-center rounded-full ${colors.iconBg}`}>
                      <Icon className={`size-4 ${colors.icon}`} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold ${colors.txt}`}>
                    {total === 0 ? "—" : `${cumplimiento}%`}
                  </span>
                  <span className={`text-[11px] font-medium uppercase tracking-wide ${colors.txt}`}>
                    {colors.label}
                  </span>
                </div>

                {total > 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-600">
                    {counts.vigente > 0 && <span>{counts.vigente} vig.</span>}
                    {counts.por_vencer > 0 && (
                      <>
                        {counts.vigente > 0 && " · "}
                        <span className="text-amber-700">{counts.por_vencer} p. vencer</span>
                      </>
                    )}
                    {counts.vencido > 0 && (
                      <>
                        {(counts.vigente > 0 || counts.por_vencer > 0) && " · "}
                        <span className="text-red-700">{counts.vencido} vencido{counts.vencido === 1 ? "" : "s"}</span>
                      </>
                    )}
                  </p>
                )}

                {puedeEditar && (
                  <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingCategoria(categoria)
                        setOpenCategoria(true)
                      }}
                      title="Editar tarjeta"
                      className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-700"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEliminarCategoria(categoria)
                      }}
                      title="Eliminar tarjeta"
                      className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabs por categoría */}
      <Tabs value={tab} onValueChange={(v: string | null) => setTab(v ?? categorias[0]?.id ?? "")}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {categorias.map((c) => {
            const count = requisitos.filter((r) => r.categoria_id === c.id).length
            return (
              <TabsTrigger key={c.id} value={c.id} className="flex-none">
                {c.nombre}
                <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {count}
                </span>
              </TabsTrigger>
            )
          })}
          {raci && (
            <TabsTrigger value="raci" className="flex-none font-semibold">
              RACI
            </TabsTrigger>
          )}
        </TabsList>

        {raci && (
          <TabsContent value="raci" className="mt-4">
            <RaciTab key={raci.filas.map((f) => f.updated_at).join("|")} raci={raci} puedeEditar={puedeEditar} />
          </TabsContent>
        )}

        {categorias.map((c) => (
          <TabsContent key={c.id} value={c.id} className="mt-4">
            <CategoriaTabla
              categoria={c}
              requisitos={requisitos}
              responsables={responsables}
              responsablePrincipalNombre={
                c.responsable_principal_id
                  ? responsablesMap.get(c.responsable_principal_id) ?? null
                  : null
              }
              puedeEditar={puedeEditar}
              onCrear={() => {
                setEditing(null)
                setTab(c.id)
                setOpenForm(true)
              }}
              onEditar={(r) => {
                setEditing(r)
                setOpenForm(true)
              }}
              onRenovar={(r) => {
                setRenovando(r)
                setOpenRenovar(true)
              }}
              onEliminar={handleEliminar}
              onAbrirArchivo={abrirArchivo}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialogs */}
      {puedeEditar && (
        <>
          <RequisitoFormDialog
            open={openForm}
            onOpenChange={setOpenForm}
            requisito={editing}
            categorias={categorias}
            defaultCategoriaId={tab}
            responsables={responsables}
            onSaved={refrescar}
          />
          <RenovarDialog
            open={openRenovar}
            onOpenChange={setOpenRenovar}
            requisito={renovando}
            onSaved={refrescar}
          />
          <CategoriaFormDialog
            open={openCategoria}
            onOpenChange={setOpenCategoria}
            categoria={editingCategoria}
            onSaved={refrescar}
          />
        </>
      )}
    </div>
  )
}
