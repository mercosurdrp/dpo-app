"use client"

/**
 * Historial de checklists de salida (liberación) y retorno.
 *
 * 🚨 Vive en los DOS lados a propósito: `/vehiculos` (solapa "Historial
 * Checklists", donde se edita) y `/vehiculos/mantenimiento` (solapa "Checklist
 * salida / retorno"). No es una copia: es el mismo componente con los mismos
 * datos de `getChecklists`, así que no hay forma de que las dos pantallas
 * muestren números distintos.
 *
 * Por qué también en Mantenimiento: ahí se mira el checklist todos los días
 * para saber qué defecto atacar, y había que salir del módulo —perdiendo la
 * solapa y los filtros— sólo para ver si el chofer lo hizo y con qué odómetro.
 *
 * Las acciones son opcionales. En Mantenimiento entra sin `onEditar` ni
 * `onBorrar`: es la vista de consulta, y el checklist se corrige donde está el
 * formulario de edición. Borrar NO se ofrece acá ni se va a ofrecer: el
 * checklist es la evidencia de que el chofer hizo el control, y los duplicados
 * se reportan, no se eliminan.
 */

import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { ClipboardCheck, Eye, Pencil, Trash2 } from "lucide-react"
import type {
  ChecklistVehiculo,
  DocumentacionChecklist,
  MotivoRechazo,
} from "@/types/database"

function formatHora(isoStr: string) {
  const d = new Date(isoStr)
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

function formatTiempoRuta(minutos: number) {
  const hh = Math.floor(minutos / 60)
  const mm = minutos % 60
  return `${hh}h ${mm.toString().padStart(2, "0")}m`
}

/** Duración de llenado del checklist (segundos) → texto corto legible. */
function formatDuracion(seg: number | null) {
  if (seg == null) return "—"
  if (seg < 60) return `${seg}s`
  const m = Math.floor(seg / 60)
  const s = seg % 60
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h ${mm.toString().padStart(2, "0")}m`
}

export function TiempoRutaBadge({ minutos }: { minutos: number }) {
  const text = formatTiempoRuta(minutos)
  if (minutos <= 480)
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{text}</Badge>
  if (minutos <= 540)
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{text}</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{text}</Badge>
}

export function ResultadoBadge({ resultado }: { resultado: string }) {
  if (resultado === "aprobado")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Aprobado</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rechazado</Badge>
}

/**
 * Cómo quedó la documentación de la unidad en ese checklist. Se muestra en la
 * vista de desaprobados: ahí importa distinguir el rechazo por papeles —que se
 * resuelve en /requisitos-legales— del foco mecánico, que va al taller.
 */
export function DocumentacionBadge({
  estado,
}: {
  estado: DocumentacionChecklist | null | undefined
}) {
  if (estado == null)
    return <span className="text-xs text-muted-foreground">no se preguntó</span>
  if (estado === "aprobada")
    return (
      <Badge variant="outline" className="border-green-200 text-green-700">
        Aprobada
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-red-200 font-semibold text-red-700">
      Desaprobada
    </Badge>
  )
}

/**
 * Por qué se desaprobó: los ítems en NO OK con lo que escribió el chofer.
 *
 * Sin esto había que entrar con el ojito a cada checklist para enterarse de si
 * fue una luz, el matafuegos o los papeles. Si no hay ningún ítem en NO OK se
 * dice: un desaprobado sin ítem malo es un dato raro que hay que mirar, no un
 * hueco que convenga dejar en blanco.
 */
function MotivoRechazoCell({ checklist }: { checklist: ChecklistVehiculo }) {
  const motivos = checklist.motivos ?? []
  if (motivos.length === 0) {
    const obs = checklist.observaciones?.trim()
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-xs text-amber-600 dark:text-amber-400">
          sin ítem en NO OK
        </span>
        {obs && <span className="text-xs text-muted-foreground">{obs}</span>}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-0.5">
      {motivos.map((m, idx) => (
        <span key={`${m.item}-${idx}`} className="flex flex-col text-xs">
          <span>
            <span className={m.critico ? "font-semibold text-red-700 dark:text-red-400" : ""}>
              {m.item}
              {m.critico ? " (crítico)" : ""}
            </span>
            {m.comentario && (
              <span className="text-muted-foreground"> — “{m.comentario}”</span>
            )}
          </span>
          {/* El checklist queda desaprobado igual: lo que cuenta que el foco ya
              se arregló es el plan de acción, así que va en la misma fila. */}
          <EstadoPlanFoco plan={m.plan} />
        </span>
      ))}
    </span>
  )
}

/** Qué se hizo con el foco que desaprobó el checklist. */
function EstadoPlanFoco({ plan }: { plan: MotivoRechazo["plan"] }) {
  if (!plan)
    return (
      <span className="text-[11px] text-amber-600 dark:text-amber-400">
        sin plan de acción cargado
      </span>
    )
  // La OT cierra la cadena: el defecto más grave que un foco no se arregla en el
  // momento, se repara en una orden, y ese N° es la constancia.
  const ot = plan.otNumero ? (
    <span className="text-sky-700 dark:text-sky-400"> · OT {plan.otNumero}</span>
  ) : null
  if (plan.estado === "resuelto")
    return (
      <span className="text-[11px] text-green-700 dark:text-green-400">
        resuelto{plan.horas != null ? ` en ${formatDuracionHoras(plan.horas)}` : ""}
        {ot}
      </span>
    )
  return (
    <span className="text-[11px] text-amber-600 dark:text-amber-400">
      plan {plan.estado === "en_proceso" ? "en proceso" : "pendiente"}
      {ot}
    </span>
  )
}

/** "40 min", "5 h", "2 d 4 h" — mismo formato que el tablero de mantenimiento. */
function formatDuracionHoras(horas: number): string {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`
  if (horas < 24) return `${Math.round(horas)} h`
  const d = Math.floor(horas / 24)
  const h = Math.round(horas - d * 24)
  return h > 0 ? `${d} d ${h} h` : `${d} d`
}

interface Props {
  checklists: ChecklistVehiculo[]
  /** Tipo de cada unidad: en autoelevadores el valor cargado es horómetro (hs). */
  tipoPorDominio: Record<string, string | null>
  titulo?: string
  /** Sin esto la fila no muestra el lápiz: la edición vive en /vehiculos. */
  onEditar?: (c: ChecklistVehiculo) => void
  /** Sin esto la fila no muestra el tacho. Ver el comentario del encabezado. */
  onBorrar?: (id: string) => void
  acciones?: boolean
}

export function HistorialChecklists({
  checklists,
  tipoPorDominio,
  titulo = "Últimos Checklists",
  onEditar,
  onBorrar,
  acciones = true,
}: Props) {
  const [dominio, setDominio] = useState("todos")
  // El tipo se filtra acá y no sólo se rotula: "¿salió el camión?" y "¿volvió?"
  // son dos preguntas distintas, y mezcladas en una lista de 50 filas hay que
  // ir leyendo badge por badge.
  const [tipo, setTipo] = useState("todos")
  /**
   * Aprobado / desaprobado. Los desaprobados son 11 sobre 2.479: buscarlos a ojo
   * en una lista de 50 filas no se puede, y son los únicos que exigen una
   * acción. Al filtrar por desaprobados se agrega la columna de documentación.
   */
  const [resultado, setResultado] = useState("todos")

  const esAutoelevador = (d: string) => tipoPorDominio[d] === "autoelevador"

  const filtrados = checklists.filter(
    (c) =>
      (dominio === "todos" || c.dominio === dominio) &&
      (tipo === "todos" || c.tipo === tipo) &&
      (resultado === "todos" || c.resultado === resultado),
  )
  const verDocumentacion = resultado === "rechazado"
  const desaprobados = checklists.filter((c) => c.resultado === "rechazado").length
  const dominios = Array.from(new Set(checklists.map((c) => c.dominio))).sort()

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap text-muted-foreground">Tipo</Label>
            <Select value={tipo} onValueChange={(v: string | null) => setTipo(v ?? "todos")}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Salida y retorno</SelectItem>
                <SelectItem value="liberacion">Salida (liberación)</SelectItem>
                <SelectItem value="retorno">Retorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap text-muted-foreground">Resultado</Label>
            <Select
              value={resultado}
              onValueChange={(v: string | null) => setResultado(v ?? "todos")}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              {/* La cuenta va en la opción: un "no hay filas" después de
                  filtrar no distingue "no hay ninguno" de "no entró en la
                  ventana que se trajo". */}
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="todos">Aprobados y desaprobados</SelectItem>
                <SelectItem value="aprobado">Sólo aprobados</SelectItem>
                <SelectItem value="rechazado">
                  Sólo desaprobados{desaprobados > 0 ? ` (${desaprobados})` : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap text-muted-foreground">Vehículo</Label>
            <Select value={dominio} onValueChange={(v: string | null) => setDominio(v ?? "todos")}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {dominios.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                    {esAutoelevador(d) ? " (autoelev.)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Link href="/vehiculos/checklist">
            <Button variant="outline" size="sm">
              <ClipboardCheck className="mr-1 h-4 w-4" /> Nuevo
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {filtrados.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {checklists.length === 0
              ? "No hay checklists registrados."
              : "No hay checklists para el filtro elegido."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead className="text-right">Odóm./Horóm.</TableHead>
                  <TableHead>Resultado</TableHead>
                  {verDocumentacion && <TableHead>Documentación</TableHead>}
                  {verDocumentacion && <TableHead>Por qué se desaprobó</TableHead>}
                  <TableHead className="text-right">T. Ruta</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  {acciones && <TableHead className="w-28 text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{c.fecha}</TableCell>
                    <TableCell className="font-mono text-sm">{formatHora(c.hora)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          c.tipo === "liberacion"
                            ? "border-blue-200 text-blue-700"
                            : "border-green-200 text-green-700"
                        }
                      >
                        {c.tipo === "liberacion" ? "Liberación" : "Retorno"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/vehiculos/${encodeURIComponent(c.dominio)}`}
                        className="font-mono font-semibold text-blue-600 hover:underline"
                      >
                        {c.dominio}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{c.chofer}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {c.odometro != null
                        ? `${c.odometro.toLocaleString("es-AR")} ${
                            esAutoelevador(c.dominio) ? "hs" : "km"
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ResultadoBadge resultado={c.resultado} />
                    </TableCell>
                    {verDocumentacion && (
                      <TableCell>
                        <DocumentacionBadge estado={c.documentacion} />
                      </TableCell>
                    )}
                    {verDocumentacion && (
                      <TableCell className="max-w-80">
                        <MotivoRechazoCell checklist={c} />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {c.tiempo_ruta_minutos != null ? (
                        <TiempoRutaBadge minutos={c.tiempo_ruta_minutos} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatDuracion(c.duracion_segundos)}
                    </TableCell>
                    {acciones && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/vehiculos/checklist/${c.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          {onEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => onEditar(c)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {onBorrar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                              onClick={() => onBorrar(c.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
