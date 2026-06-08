"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Plus, Search, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NuevaSolicitudDialog } from "@/components/portal/nueva-solicitud-dialog"
import {
  SG_CATEGORIA_LABELS,
  SG_CATEGORIA_ORDEN,
  SG_ESTADO_LABELS,
  SG_ESTADO_COLORS,
  SG_ESTADO_ORDEN,
  type SgTicketConAutor,
} from "@/types/database"

interface Props {
  tickets: SgTicketConAutor[]
  canManage: boolean
}

export function ServiciosClient({ tickets: initial, canManage }: Props) {
  const [search, setSearch] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const [filterCat, setFilterCat] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    let list = initial
    if (filterEstado !== "all") list = list.filter((t) => t.estado === filterEstado)
    if (filterCat !== "all") list = list.filter((t) => t.categoria === filterCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.titulo.toLowerCase().includes(q) ||
          t.descripcion.toLowerCase().includes(q) ||
          String(t.numero).includes(q)
      )
    }
    return list
  }, [initial, search, filterEstado, filterCat])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Servicios Generales</h1>
          <p className="text-sm text-slate-500">
            {canManage
              ? "Solicitudes de infraestructura y mantenimiento"
              : "Reportá necesidades edilicias y seguí tus solicitudes"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva solicitud
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-10"
            placeholder="Buscar por asunto, descripción o N°..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCat} onValueChange={(v) => setFilterCat(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {SG_CATEGORIA_ORDEN.map((c) => (
              <SelectItem key={c} value={c}>
                {SG_CATEGORIA_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {SG_ESTADO_ORDEN.map((e) => (
              <SelectItem key={e} value={e}>
                {SG_ESTADO_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-slate-400">
          <Wrench className="mb-3 size-10" />
          <p className="font-medium">No hay solicitudes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Link key={t.id} href={`/portal/servicios/${t.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">#{t.numero}</span>
                      <span className="truncate text-base font-medium text-slate-800">{t.titulo}</span>
                      <Badge variant="secondary">{SG_CATEGORIA_LABELS[t.categoria]}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">{t.descripcion}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>{new Date(t.created_at).toLocaleDateString("es-AR")}</span>
                      {t.sector && <span>· {t.sector}</span>}
                      {canManage && <span>· {t.autor_nombre}</span>}
                      {t.asignado_nombre && <span>· Resp: {t.asignado_nombre}</span>}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0"
                    style={{
                      backgroundColor: SG_ESTADO_COLORS[t.estado] + "20",
                      color: SG_ESTADO_COLORS[t.estado],
                    }}
                  >
                    {SG_ESTADO_LABELS[t.estado]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NuevaSolicitudDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
