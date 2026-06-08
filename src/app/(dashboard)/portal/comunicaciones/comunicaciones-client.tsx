"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Plus, Search, Megaphone, Paperclip } from "lucide-react"
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
import { NuevaComunicacionDialog } from "@/components/portal/nueva-comunicacion-dialog"
import {
  COMUNICACION_CATEGORIA_LABELS,
  COMUNICACION_CATEGORIA_ORDEN,
  COMUNICACION_PRIORIDAD_LABELS,
  COMUNICACION_PRIORIDAD_COLORS,
  COMUNICACION_ESTADO_LABELS,
  COMUNICACION_ESTADO_COLORS,
  COMUNICACION_ESTADO_ORDEN,
  type ComunicacionConAutor,
} from "@/types/database"

interface Props {
  comunicaciones: ComunicacionConAutor[]
  canManage: boolean
}

export function ComunicacionesClient({ comunicaciones: initial, canManage }: Props) {
  const [search, setSearch] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const [filterCat, setFilterCat] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    let list = initial
    if (filterEstado !== "all") list = list.filter((c) => c.estado === filterEstado)
    if (filterCat !== "all") list = list.filter((c) => c.categoria === filterCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.titulo.toLowerCase().includes(q) ||
          c.cuerpo.toLowerCase().includes(q) ||
          String(c.numero).includes(q)
      )
    }
    return list
  }, [initial, search, filterEstado, filterCat])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buzón de Comunicaciones</h1>
          <p className="text-sm text-slate-500">
            {canManage
              ? "Comunicaciones internas enviadas por el personal"
              : "Enviá comunicaciones a la administración y seguí su gestión"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva comunicación
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-10"
            placeholder="Buscar por asunto, contenido o N°..."
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
            {COMUNICACION_CATEGORIA_ORDEN.map((c) => (
              <SelectItem key={c} value={c}>
                {COMUNICACION_CATEGORIA_LABELS[c]}
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
            {COMUNICACION_ESTADO_ORDEN.map((e) => (
              <SelectItem key={e} value={e}>
                {COMUNICACION_ESTADO_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-slate-400">
          <Megaphone className="mb-3 size-10" />
          <p className="font-medium">No hay comunicaciones</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/portal/comunicaciones/${c.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">#{c.numero}</span>
                      <span className="truncate text-base font-medium text-slate-800">{c.titulo}</span>
                      <Badge variant="secondary">{COMUNICACION_CATEGORIA_LABELS[c.categoria]}</Badge>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: COMUNICACION_PRIORIDAD_COLORS[c.prioridad] + "20",
                          color: COMUNICACION_PRIORIDAD_COLORS[c.prioridad],
                        }}
                      >
                        {COMUNICACION_PRIORIDAD_LABELS[c.prioridad]}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">{c.cuerpo}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>{new Date(c.created_at).toLocaleDateString("es-AR")}</span>
                      {canManage && <span>· {c.autor_nombre}</span>}
                      {c.asignado_nombre && <span>· Resp: {c.asignado_nombre}</span>}
                      {c.adjuntos_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Paperclip className="size-3" />
                          {c.adjuntos_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0"
                    style={{
                      backgroundColor: COMUNICACION_ESTADO_COLORS[c.estado] + "20",
                      color: COMUNICACION_ESTADO_COLORS[c.estado],
                    }}
                  >
                    {COMUNICACION_ESTADO_LABELS[c.estado]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NuevaComunicacionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
