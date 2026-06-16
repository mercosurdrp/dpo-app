"use client"

// Planes de acción (PDA) por sección del pilar Flota. Reusable: cada sección le
// pasa su `ambito` (checklist | estandar | combustible | mantenimiento |
// repuestos | fallas) y los planes se guardan/leen del MISMO Blob que
// herminio-web (vía proxy /api/flota-planes), así quedan unificados entre apps.
// Independiente de los filtros de fecha de la página: muestra siempre todos.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { ClipboardList, Loader2, Trash2 } from "lucide-react"

const ESTADOS = [
  { value: "no_iniciado", label: "No iniciado" },
  { value: "en_curso", label: "En curso" },
  { value: "cumplido", label: "Cumplido" },
]

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return arg.toISOString().slice(0, 10)
}
function fmtFecha(iso: string) {
  if (!iso) return "—"
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

interface Plan {
  id: string
  accion: string
  responsable: string
  vence: string
  estado: string
  comentario: string
  creado?: string
}

function BadgePda({ estado, vencido }: { estado: string; vencido: boolean }) {
  if (vencido) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Vencido</Badge>
  if (estado === "cumplido")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Cumplido</Badge>
  if (estado === "en_curso")
    return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">En curso</Badge>
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">No iniciado</Badge>
}

const VACIO = { accion: "", responsable: "", vence: "", estado: "no_iniciado", comentario: "" }

export function PlanesAccionFlota({
  ambito,
  descripcion,
}: {
  ambito: string
  descripcion?: string
}) {
  const hoy = hoyArg()
  const [planes, setPlanes] = useState<Plan[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState("")
  const [comentAbierto, setComentAbierto] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState(VACIO)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await fetch(`/api/flota-planes?ambito=${ambito}`, { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "Error al leer los planes")
      setPlanes(j.planes || [])
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setCargando(false)
    }
  }, [ambito])

  useEffect(() => {
    cargar()
  }, [cargar])

  const mutar = async (accion: string, plan: Partial<Plan>) => {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch("/api/flota-planes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, plan, ambito }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "No se pudo guardar")
      setPlanes(j.planes || [])
      return true
    } catch (e) {
      setError(String((e as Error).message || e))
      return false
    } finally {
      setGuardando(false)
    }
  }

  const agregar = async () => {
    if (!nuevo.accion.trim() || !nuevo.responsable.trim() || !nuevo.vence) {
      setError("Completá acción, responsable y fecha de vencimiento.")
      return
    }
    const ok = await mutar("crear", nuevo)
    if (ok) setNuevo(VACIO)
  }

  const borrar = async (p: Plan) => {
    if (!window.confirm(`¿Borrar el plan "${p.accion}"?`)) return
    await mutar("borrar", { id: p.id })
  }

  const estaVencido = useCallback(
    (p: Plan) => p.estado !== "cumplido" && !!p.vence && p.vence < hoy,
    [hoy]
  )

  const filtrados = useMemo(() => {
    let f = [...planes].sort((a, b) => (a.vence || "").localeCompare(b.vence || ""))
    if (filtroEstado === "vencidos") f = f.filter(estaVencido)
    else if (filtroEstado) f = f.filter((p) => p.estado === filtroEstado)
    return f
  }, [planes, filtroEstado, estaVencido])

  const cantVencidos = useMemo(() => planes.filter(estaVencido).length, [planes, estaVencido])

  const filtros = [
    { value: "", label: `Todos (${planes.length})` },
    ...ESTADOS.map((e) => ({
      value: e.value,
      label: `${e.label} (${planes.filter((p) => p.estado === e.value).length})`,
    })),
    { value: "vencidos", label: `Vencidos (${cantVencidos})` },
  ]

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Planes de acción</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {filtros.map((f) => (
              <Button
                key={f.value || "todos"}
                size="sm"
                variant={filtroEstado === f.value ? "default" : "outline"}
                className={
                  f.value === "vencidos" && cantVencidos > 0 && filtroEstado !== f.value
                    ? "border-red-300 text-red-600"
                    : ""
                }
                onClick={() => setFiltroEstado(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {descripcion ??
            "Acciones para los casos sin cumplimiento. No depende de los filtros de fecha: muestra siempre todos los planes."}
        </p>

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Form alta */}
        <div className="mb-4 grid gap-2 rounded-lg border bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="flex flex-col gap-1 lg:col-span-2">
            <label className="text-xs text-muted-foreground">Acción</label>
            <Input
              placeholder="Qué se va a hacer…"
              value={nuevo.accion}
              onChange={(e) => setNuevo({ ...nuevo, accion: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Responsable</label>
            <Input
              placeholder="Quién"
              value={nuevo.responsable}
              onChange={(e) => setNuevo({ ...nuevo, responsable: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Vence</label>
            <Input
              type="date"
              value={nuevo.vence}
              onChange={(e) => setNuevo({ ...nuevo, vence: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={nuevo.estado} onValueChange={(v) => setNuevo({ ...nuevo, estado: v ?? "no_iniciado" })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={agregar} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ Agregar"}
            </Button>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-6">
            <label className="text-xs text-muted-foreground">Comentario (opcional)</label>
            <Input
              placeholder="Detalle / observación"
              value={nuevo.comentario}
              onChange={(e) => setNuevo({ ...nuevo, comentario: e.target.value })}
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Acción</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="min-w-[200px]">Comentario</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Cargando planes de acción…
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {planes.length === 0
                      ? "Sin planes de acción todavía. Cargá el primero arriba."
                      : "Ningún plan con ese estado."}
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((p) => {
                  const vencido = estaVencido(p)
                  return (
                    <TableRow key={p.id} className={vencido ? "bg-red-50/50" : ""}>
                      <TableCell className="whitespace-normal font-medium">{p.accion}</TableCell>
                      <TableCell>{p.responsable}</TableCell>
                      <TableCell className={vencido ? "font-semibold text-red-600" : ""}>
                        {fmtFecha(p.vence)}{vencido && " ⚠️"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BadgePda estado={p.estado} vencido={vencido} />
                          <Select
                            value={p.estado}
                            onValueChange={(v) => mutar("editar", { id: p.id, estado: v ?? p.estado })}
                          >
                            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ESTADOS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        {comentAbierto === p.id ? (
                          <Textarea
                            autoFocus
                            rows={3}
                            defaultValue={p.comentario || ""}
                            disabled={guardando}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              setComentAbierto(null)
                              if (v !== (p.comentario || "")) mutar("editar", { id: p.id, comentario: v })
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="text-left text-sm hover:underline"
                            onClick={() => setComentAbierto(p.id)}
                          >
                            {p.comentario
                              ? <span className="text-slate-700">{p.comentario} ▾</span>
                              : <span className="text-muted-foreground">Agregar comentario…</span>}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-red-600"
                          disabled={guardando}
                          onClick={() => borrar(p)}
                          title="Borrar plan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
