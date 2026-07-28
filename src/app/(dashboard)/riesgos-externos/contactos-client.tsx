"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Building2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  Siren,
  Trash2,
  User,
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
import { eliminarContacto } from "@/actions/riesgos-externos-contactos"
import { ContactoFormDialog } from "@/components/riesgos-externos/contacto-form-dialog"
import {
  CATEGORIA_CONTACTO_RIESGO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  type CategoriaContactoRiesgo,
  type RiesgoExternoContacto,
  type TipoRiesgoExterno,
} from "@/types/database"

interface Props {
  contactos: RiesgoExternoContacto[]
  puedeEditar: boolean
}

function CategoriaBadge({ categoria }: { categoria: CategoriaContactoRiesgo }) {
  const label = CATEGORIA_CONTACTO_RIESGO_LABELS[categoria]
  if (categoria === "emergencia") {
    return (
      <Badge className="gap-1 border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
        <Siren className="size-3.5" />
        {label}
      </Badge>
    )
  }
  if (categoria === "externo") {
    return (
      <Badge className="gap-1 border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-100">
        <Building2 className="size-3.5" />
        {label}
      </Badge>
    )
  }
  return (
    <Badge className="gap-1 border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
      <User className="size-3.5" />
      {label}
    </Badge>
  )
}

export function ContactosClient({ contactos, puedeEditar }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<RiesgoExternoContacto | null>(null)
  const [tipoNuevo, setTipoNuevo] = useState<TipoRiesgoExterno | null>(null)

  const [filtroTipo, setFiltroTipo] = useState<string>("todos")
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todos")
  const [busqueda, setBusqueda] = useState("")

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return contactos.filter((c) => {
      if (filtroTipo !== "todos" && c.tipo_riesgo !== filtroTipo) return false
      if (filtroCategoria !== "todos" && c.categoria !== filtroCategoria) return false
      if (!q) return true
      return [c.nombre, c.empresa, c.referente, c.telefono, c.telefono_alt, c.notas]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [contactos, filtroTipo, filtroCategoria, busqueda])

  // Agrupado por riesgo, respetando el orden del enum de tipos.
  const grupos = useMemo(() => {
    const orden = Object.keys(TIPO_RIESGO_EXTERNO_LABELS) as TipoRiesgoExterno[]
    return orden
      .map((tipo) => ({
        tipo,
        items: filtrados.filter((c) => c.tipo_riesgo === tipo),
      }))
      .filter((g) => g.items.length > 0)
  }, [filtrados])

  const stats = useMemo(() => {
    const sinTelefono = contactos.filter((c) => !c.telefono).length
    const externos = contactos.filter((c) => c.categoria === "externo").length
    const riesgosCubiertos = new Set(
      contactos.filter((c) => c.telefono).map((c) => c.tipo_riesgo),
    ).size
    const totalRiesgos = Object.keys(TIPO_RIESGO_EXTERNO_LABELS).length
    return { sinTelefono, externos, riesgosCubiertos, totalRiesgos }
  }, [contactos])

  function refrescar() {
    router.refresh()
  }

  function handleEliminar(c: RiesgoExternoContacto) {
    if (
      !confirm(
        `¿Eliminar a "${c.nombre}" de ${TIPO_RIESGO_EXTERNO_LABELS[c.tipo_riesgo]}?`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarContacto(c.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function abrirNuevo(tipo: TipoRiesgoExterno | null) {
    setEditing(null)
    setTipoNuevo(tipo)
    setOpenForm(true)
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Contactos
          </p>
          <p className="text-xl font-bold">{contactos.length}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Proveedores externos
          </p>
          <p className="text-xl font-bold">{stats.externos}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Riesgos con contacto
          </p>
          <p className="text-xl font-bold">
            {stats.riesgosCubiertos}/{stats.totalRiesgos}
          </p>
        </div>
        <div
          className={`rounded-lg border px-3 py-2 ${
            stats.sinTelefono > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Falta teléfono
          </p>
          <p className="text-xl font-bold">{stats.sinTelefono}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar proveedor, referente o teléfono…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={filtroTipo}
          onValueChange={(v: string | null) => setFiltroTipo(v ?? "todos")}
        >
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los riesgos</SelectItem>
            {Object.entries(TIPO_RIESGO_EXTERNO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filtroCategoria}
          onValueChange={(v: string | null) => setFiltroCategoria(v ?? "todos")}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las categorías</SelectItem>
            {Object.entries(CATEGORIA_CONTACTO_RIESGO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            title="Hoja imprimible con todos los contactos"
            render={
              <a
                href="/api/riesgos-externos/contactos-pdf"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Printer className="mr-2 size-4" />
            Imprimir
          </Button>
          {puedeEditar && (
            <Button onClick={() => abrirNuevo(null)}>
              <Plus className="mr-2 size-4" />
              Nuevo contacto
            </Button>
          )}
        </div>
      </div>

      {/* Tarjetas por riesgo */}
      {grupos.length === 0 && (
        <p className="rounded-lg border bg-white py-10 text-center text-sm text-muted-foreground">
          No hay contactos con los filtros aplicados.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {grupos.map(({ tipo, items }) => {
          const faltantes = items.filter((c) => !c.telefono).length
          return (
            <div key={tipo} className="rounded-lg border bg-white">
              <div className="flex items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2.5">
                <h3 className="font-semibold text-slate-900">
                  {TIPO_RIESGO_EXTERNO_LABELS[tipo]}
                </h3>
                <div className="flex items-center gap-2">
                  {faltantes > 0 && (
                    <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
                      <AlertTriangle className="size-3.5" />
                      {faltantes} sin teléfono
                    </Badge>
                  )}
                  {puedeEditar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => abrirNuevo(tipo)}
                      title="Agregar contacto a este riesgo"
                    >
                      <Plus className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <ul className="divide-y">
                {items.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {c.nombre}
                        </span>
                        <CategoriaBadge categoria={c.categoria} />
                      </div>
                      {(c.empresa || c.referente) && (
                        <p className="text-xs text-muted-foreground">
                          {[c.empresa, c.referente].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {c.telefono ? (
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <a
                            href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                            className="inline-flex items-center gap-1 font-mono font-medium text-blue-700 hover:underline"
                          >
                            <Phone className="size-3.5" />
                            {c.telefono}
                          </a>
                          {c.telefono_alt && (
                            <span className="font-mono text-xs text-muted-foreground">
                              alt. {c.telefono_alt}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="inline-flex items-center gap-1 text-sm font-medium text-amber-700">
                          <AlertTriangle className="size-3.5" />
                          Falta el teléfono
                        </p>
                      )}
                      {c.email && (
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3.5" />
                          {c.email}
                        </p>
                      )}
                      {c.horario && (
                        <p className="text-xs text-muted-foreground">
                          Horario: {c.horario}
                        </p>
                      )}
                      {c.notas && (
                        <p className="max-w-prose text-xs text-muted-foreground">
                          {c.notas}
                        </p>
                      )}
                    </div>

                    {puedeEditar && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(c)
                            setTipoNuevo(null)
                            setOpenForm(true)
                          }}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEliminar(c)}
                          title="Eliminar"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {puedeEditar && (
        <ContactoFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          contacto={editing}
          tipoRiesgoInicial={tipoNuevo}
          onSaved={refrescar}
        />
      )}
    </div>
  )
}
