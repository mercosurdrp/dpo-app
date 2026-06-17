"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
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
import { AlertTriangle, MessageSquareText, ShieldAlert, ClipboardCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ChecklistComentario,
  ChecklistItemNoOk,
} from "@/actions/mantenimiento-vehiculos"

function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}

function tipoLabel(t: string): string {
  return t === "liberacion" ? "Salida" : t === "retorno" ? "Retorno" : t
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tipo === "liberacion"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-violet-200 bg-violet-50 text-violet-700"
      )}
    >
      {tipoLabel(tipo)}
    </Badge>
  )
}

const VALOR_BADGE: Record<string, string> = {
  nook: "border-red-200 bg-red-50 text-red-700",
  malo: "border-red-200 bg-red-50 text-red-700",
  regular: "border-amber-200 bg-amber-50 text-amber-700",
}

function ValorBadge({ valor }: { valor: string }) {
  const label = valor === "nook" ? "No OK" : valor === "regular" ? "Regular" : valor
  return (
    <Badge variant="outline" className={VALOR_BADGE[valor] ?? "border-slate-200 bg-slate-50"}>
      {label}
    </Badge>
  )
}

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  comentarios: ChecklistComentario[]
}

export function ChecklistsMtto({ itemsNoOk, comentarios }: Props) {
  const [fDominio, setFDominio] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")

  const dominios = useMemo(() => {
    const s = new Set<string>()
    itemsNoOk.forEach((i) => s.add(i.dominio))
    comentarios.forEach((c) => s.add(c.dominio))
    return Array.from(s).sort()
  }, [itemsNoOk, comentarios])

  const items = useMemo(
    () =>
      itemsNoOk.filter(
        (i) =>
          (fDominio === "todos" || i.dominio === fDominio) &&
          (fTipo === "todos" || i.tipo === fTipo)
      ),
    [itemsNoOk, fDominio, fTipo]
  )

  const coments = useMemo(
    () =>
      comentarios.filter(
        (c) =>
          (fDominio === "todos" || c.dominio === fDominio) &&
          (fTipo === "todos" || c.tipo === fTipo)
      ),
    [comentarios, fDominio, fTipo]
  )

  const criticos = items.filter((i) => i.critico).length

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <AlertTriangle className="size-4 text-red-500" /> Ítems no OK
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", items.length > 0 ? "text-red-600" : "text-slate-900")}>
              {items.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ShieldAlert className="size-4 text-red-600" /> Críticos no OK
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", criticos > 0 ? "text-red-600" : "text-slate-900")}>
              {criticos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <MessageSquareText className="size-4 text-slate-400" /> Con comentarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{coments.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-slate-500">Unidad</Label>
          <Select value={fDominio} onValueChange={(v: string | null) => setFDominio(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {dominios.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Tipo</Label>
          <Select value={fTipo} onValueChange={(v: string | null) => setFTipo(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="liberacion">Salida</SelectItem>
              <SelectItem value="retorno">Retorno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ítems observados (no OK) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-slate-500" /> Ítems observados (no OK)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <ClipboardCheck className="size-8 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-500">
                Sin ítems observados en los checklists. Todo OK.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Comentario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
                    <TableCell className="font-medium">{i.dominio}</TableCell>
                    <TableCell>
                      <TipoBadge tipo={i.tipo} />
                    </TableCell>
                    <TableCell className="text-slate-600">{i.categoria}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {i.item}
                        {i.critico && (
                          <span title="Ítem crítico">
                            <ShieldAlert className="size-3.5 text-red-500" />
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ValorBadge valor={i.valor} />
                    </TableCell>
                    <TableCell className="text-slate-600">{i.chofer || "—"}</TableCell>
                    <TableCell className="max-w-72 text-slate-600">
                      {i.comentario || <span className="text-slate-300">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Comentarios y observaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="size-4 text-slate-500" /> Comentarios y observaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {coments.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              Sin comentarios cargados en los checklists del período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                    <TableCell className="font-medium">{c.dominio}</TableCell>
                    <TableCell>
                      <TipoBadge tipo={c.tipo} />
                    </TableCell>
                    <TableCell className="text-slate-600">{c.chofer || "—"}</TableCell>
                    <TableCell className="max-w-md text-slate-700">{c.observaciones}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
