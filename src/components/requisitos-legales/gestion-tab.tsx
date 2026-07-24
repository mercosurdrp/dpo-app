"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ClipboardList, RefreshCw, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  formatFechaCorta,
  GestionBadge,
} from "./gestion-badge"
import type {
  RequisitoLegalCategoria,
  RequisitoLegalConResponsable,
  RequisitoLegalGestion,
} from "@/types/database"

interface Props {
  requisitos: RequisitoLegalConResponsable[]
  categorias: RequisitoLegalCategoria[]
  /** requisito_id → gestión abierta */
  gestiones: Map<string, RequisitoLegalGestion>
  puedeEditar: boolean
  usuarioId: string | null
  onGestionar: (r: RequisitoLegalConResponsable) => void
  onRenovar: (r: RequisitoLegalConResponsable) => void
}

export function GestionTab({
  requisitos,
  categorias,
  gestiones,
  puedeEditar,
  usuarioId,
  onGestionar,
  onRenovar,
}: Props) {
  const [filtro, setFiltro] = useState<string>("todos")
  const [busqueda, setBusqueda] = useState("")
  const [soloMios, setSoloMios] = useState(false)

  const categoriasMap = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nombre])),
    [categorias],
  )

  // La bandeja muestra lo accionable: vencido, por vencer, o cualquier
  // requisito con un trámite abierto (aunque todavía esté vigente porque se
  // empezó a gestionar con anticipación).
  const pendientes = useMemo(() => {
    return requisitos
      .filter(
        (r) =>
          r.estado !== "vigente" || gestiones.has(r.id),
      )
      .sort((a, b) => a.dias_para_vencer - b.dias_para_vencer)
  }, [requisitos, gestiones])

  const stats = useMemo(() => {
    let sinGestion = 0
    let conGestion = 0
    let vencidos = 0
    for (const r of pendientes) {
      if (gestiones.has(r.id)) conGestion += 1
      else sinGestion += 1
      if (r.estado === "vencido") vencidos += 1
    }
    return { sinGestion, conGestion, vencidos }
  }, [pendientes, gestiones])

  const items = useMemo(() => {
    return pendientes.filter((r) => {
      if (filtro === "sin_gestion" && gestiones.has(r.id)) return false
      if (filtro === "con_gestion" && !gestiones.has(r.id)) return false
      if (filtro === "vencidos" && r.estado !== "vencido") return false
      if (soloMios && r.responsable_id !== usuarioId) return false
      if (busqueda) {
        const texto = `${r.nombre} ${categoriasMap.get(r.categoria_id) ?? ""}`
        if (!texto.toLowerCase().includes(busqueda.toLowerCase())) return false
      }
      return true
    })
  }, [
    pendientes,
    filtro,
    gestiones,
    soloMios,
    usuarioId,
    busqueda,
    categoriasMap,
  ])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="size-3.5" />
            Sin gestión declarada
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-900">
            {stats.sinGestion}
          </p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-blue-800">
            <Wrench className="size-3.5" />
            Con trámite en curso
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-900">
            {stats.conGestion}
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-medium text-red-800">Vencidos</p>
          <p className="mt-1 text-2xl font-bold text-red-900">
            {stats.vencidos}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar requisito o categoría…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={filtro}
          onValueChange={(v: string | null) => setFiltro(v ?? "todos")}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo lo accionable</SelectItem>
            <SelectItem value="sin_gestion">Sin gestión</SelectItem>
            <SelectItem value="con_gestion">Con trámite en curso</SelectItem>
            <SelectItem value="vencidos">Vencidos</SelectItem>
          </SelectContent>
        </Select>
        {usuarioId && (
          <Button
            type="button"
            variant={soloMios ? "default" : "outline"}
            size="sm"
            onClick={() => setSoloMios((v) => !v)}
          >
            Solo los míos
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requisito</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Gestión</TableHead>
              <TableHead>Último movimiento</TableHead>
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
                  Nada por gestionar con estos filtros.
                </TableCell>
              </TableRow>
            )}
            {items.map((r) => {
              const gestion = gestiones.get(r.id) ?? null
              const ultimo = gestion?.eventos[0] ?? null
              const vencido = r.estado === "vencido"
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium text-slate-900">{r.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {categoriasMap.get(r.categoria_id) ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span
                      className={`font-medium ${vencido ? "text-red-600" : "text-slate-800"}`}
                    >
                      {formatFechaCorta(r.fecha_vencimiento)}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {vencido
                        ? `(hace ${Math.abs(r.dias_para_vencer)} d)`
                        : `(${r.dias_para_vencer} d)`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <GestionBadge gestion={gestion} />
                  </TableCell>
                  <TableCell className="max-w-[16rem]">
                    {ultimo ? (
                      <p className="line-clamp-2 text-xs text-slate-600">
                        {ultimo.comentario ??
                          (ultimo.fecha_turno
                            ? `Turno ${formatFechaCorta(ultimo.fecha_turno)}`
                            : "—")}
                      </p>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        Sin movimientos
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.responsable_nombre ? (
                      <span className="text-sm">
                        {r.responsable_nombre}
                        {r.responsable_id === usuarioId && (
                          <Badge className="ml-1.5 border-slate-200 bg-slate-100 text-[10px] text-slate-600">
                            vos
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm italic text-muted-foreground">
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
                        onClick={() => onGestionar(r)}
                      >
                        <ClipboardList className="mr-1.5 size-3.5" />
                        Gestionar
                      </Button>
                      {puedeEditar && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onRenovar(r)}
                          title="Renovar (subir el documento nuevo)"
                        >
                          <RefreshCw className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
