"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Shield, Filter, FileWarning, Eye, Calendar, MapPin } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  LINEA_ETICA_ESTADO_COLORS,
  LINEA_ETICA_ESTADO_LABELS,
  LINEA_ETICA_TIPO_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  type DenunciaLineaEtica,
  type LineaEticaEstado,
  type LineaEticaTipo,
} from "@/types/database"

const ESTADOS: LineaEticaEstado[] = [
  "nueva",
  "en_revision",
  "en_tratamiento",
  "cerrada",
]

const TIPOS: LineaEticaTipo[] = [
  "conducta_indebida",
  "acoso",
  "discriminacion",
  "corrupcion",
  "fraude",
  "conflicto_interes",
  "represalia",
  "otro",
]

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return "hace minutos"
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `hace ${diffD}d`
  const diffM = Math.floor(diffD / 30)
  return `hace ${diffM} mes${diffM > 1 ? "es" : ""}`
}

export function LineaEticaListClient({
  denuncias,
}: {
  denuncias: DenunciaLineaEtica[]
}) {
  const [filtroEstado, setFiltroEstado] = useState<LineaEticaEstado | "todos">(
    "todos"
  )
  const [filtroTipo, setFiltroTipo] = useState<LineaEticaTipo | "todos">("todos")

  const filtradas = useMemo(() => {
    return denuncias.filter((d) => {
      if (filtroEstado !== "todos" && d.estado !== filtroEstado) return false
      if (filtroTipo !== "todos" && d.tipo !== filtroTipo) return false
      return true
    })
  }, [denuncias, filtroEstado, filtroTipo])

  const totales = useMemo(() => {
    const abiertas = denuncias.filter((d) => d.estado !== "cerrada").length
    const nuevas = denuncias.filter((d) => d.estado === "nueva").length
    const cerradas = denuncias.filter((d) => d.estado === "cerrada").length
    return { total: denuncias.length, abiertas, nuevas, cerradas }
  }, [denuncias])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-6 text-slate-900" />
            <h1 className="text-2xl font-bold text-slate-900">Línea Ética</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Denuncias anónimas del canal de compliance. Revisá y dales tratamiento.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {totales.total}
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="py-4">
            <p className="text-xs text-red-600">Nuevas</p>
            <p className="mt-1 text-2xl font-bold text-red-700">
              {totales.nuevas}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="py-4">
            <p className="text-xs text-amber-600">Abiertas</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {totales.abiertas}
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="py-4">
            <p className="text-xs text-green-600">Cerradas</p>
            <p className="mt-1 text-2xl font-bold text-green-700">
              {totales.cerradas}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <Filter className="size-4 text-muted-foreground" />
          <div className="w-44">
            <Select
              value={filtroEstado}
              onValueChange={(v) =>
                setFiltroEstado((v ?? "todos") as LineaEticaEstado | "todos")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {LINEA_ETICA_ESTADO_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Select
              value={filtroTipo}
              onValueChange={(v) =>
                setFiltroTipo((v ?? "todos") as LineaEticaTipo | "todos")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LINEA_ETICA_TIPO_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
          </span>
        </CardContent>
      </Card>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <FileWarning className="mx-auto mb-2 size-8 text-slate-300" />
            Sin denuncias para los filtros seleccionados.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtradas.map((d) => (
            <Card key={d.id} className="transition-shadow hover:shadow-md">
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        style={{
                          backgroundColor: LINEA_ETICA_ESTADO_COLORS[d.estado],
                          color: "white",
                        }}
                      >
                        {LINEA_ETICA_ESTADO_LABELS[d.estado]}
                      </Badge>
                      <Badge variant="outline">
                        {LINEA_ETICA_TIPO_LABELS[d.tipo]}
                      </Badge>
                      {d.identificarse && (
                        <Badge variant="secondary">
                          Identificado: {d.denunciante_nombre}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(d.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                      {d.descripcion}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDateTime(d.created_at)}
                      </span>
                      {d.lugar && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {d.lugar}
                        </span>
                      )}
                      {d.localidad && (
                        <span>
                          {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[d.localidad]}
                        </span>
                      )}
                      {d.area && (
                        <span>{REPORTE_SEGURIDAD_AREA_LABELS[d.area]}</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/compliance/linea-etica/${d.id}`}
                    className="shrink-0"
                  >
                    <Button size="sm" variant="outline">
                      <Eye className="mr-1 size-4" /> Ver
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
