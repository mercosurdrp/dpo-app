"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CircleDot, Layers, Plus, Ruler, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  asignarNeumatico,
  crearNeumaticosMasivo,
  darDeBajaNeumatico,
  eliminarNeumatico,
  quitarNeumatico,
  registrarMedicionNeumatico,
} from "@/actions/neumaticos"
import {
  type Neumatico,
  PROFUNDIDAD_CRITICA_MM,
} from "@/lib/vehiculos/neumaticos-tipos"
import {
  layoutDeTipo,
  type PosicionNeumatico,
} from "@/lib/vehiculos/neumaticos-layout"
import type { VehiculoTipo } from "@/types/database"

interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
}

interface Props {
  neumaticos: Neumatico[]
  unidades: UnidadFlota[]
  puedeEditar: boolean
}

const TIPO_LABEL: Record<string, string> = { nuevo: "Nuevo", recapado: "Recapado" }

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

// Color del relleno de una posición según el desgaste (profundidad mm).
function colorDesgaste(prof: number | null): string {
  if (prof == null) return "bg-slate-400"
  if (prof <= PROFUNDIDAD_CRITICA_MM) return "bg-red-500"
  if (prof <= 5) return "bg-amber-400"
  return "bg-emerald-500"
}

export function NeumaticosModule({ neumaticos, unidades, puedeEditar }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [cargaOpen, setCargaOpen] = useState(false)
  const [unidadSel, setUnidadSel] = useState<string>(unidades[0]?.dominio ?? "")
  const [posDialog, setPosDialog] = useState<{
    pos: PosicionNeumatico
    actual: Neumatico | null
  } | null>(null)

  const stock = useMemo(
    () => neumaticos.filter((n) => n.estado === "stock"),
    [neumaticos]
  )
  const bajas = useMemo(
    () =>
      neumaticos
        .filter((n) => n.estado === "baja")
        .sort((a, b) => (b.fecha_baja ?? "").localeCompare(a.fecha_baja ?? "")),
    [neumaticos]
  )

  const unidad = unidades.find((u) => u.dominio === unidadSel) ?? null
  const layout = layoutDeTipo(unidad?.tipo ?? null)
  const instaladasEnUnidad = useMemo(
    () => neumaticos.filter((n) => n.estado === "instalado" && n.dominio === unidadSel),
    [neumaticos, unidadSel]
  )
  const porPosicion = useMemo(() => {
    const m = new Map<string, Neumatico>()
    for (const n of instaladasEnUnidad) if (n.posicion) m.set(n.posicion, n)
    return m
  }, [instaladasEnUnidad])

  const resumen = useMemo(() => {
    let instalados = 0
    let criticos = 0
    for (const n of neumaticos) {
      if (n.estado !== "instalado") continue
      instalados++
      if (n.profundidad_actual_mm != null && n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM)
        criticos++
    }
    return { stock: stock.length, instalados, criticos, bajas: bajas.length }
  }, [neumaticos, stock.length, bajas.length])

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ResumenCard label="En stock" value={resumen.stock} tono="info" />
        <ResumenCard label="Instaladas" value={resumen.instalados} tono="info" />
        <ResumenCard label="Desgaste crítico" value={resumen.criticos} tono="danger" />
        <ResumenCard label="Bajas (total)" value={resumen.bajas} tono="muted" />
      </div>

      {puedeEditar && (
        <div className="flex justify-end">
          <Button onClick={() => setCargaOpen(true)}>
            <Plus className="mr-1 size-4" /> Carga masiva
          </Button>
        </div>
      )}

      {/* Diagrama por unidad */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDot className="size-4 text-slate-500" /> Diagrama de la unidad
          </CardTitle>
          <Select value={unidadSel} onValueChange={(v) => setUnidadSel(v ?? "")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Unidad" />
            </SelectTrigger>
            <SelectContent>
              {unidades.map((u) => (
                <SelectItem key={u.dominio} value={u.dominio}>
                  {u.dominio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!unidad ? (
            <p className="text-sm text-slate-500">Elegí una unidad.</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Diagrama
                layout={layout}
                porPosicion={porPosicion}
                onPos={(pos) =>
                  puedeEditar &&
                  setPosDialog({ pos, actual: porPosicion.get(pos.code) ?? null })
                }
              />
              <div className="space-y-2 text-xs text-slate-500">
                <p className="font-medium text-slate-600">Referencias</p>
                <Leyenda color="bg-emerald-500" txt="Profundidad OK (> 5 mm)" />
                <Leyenda color="bg-amber-400" txt="A vigilar (≤ 5 mm)" />
                <Leyenda color="bg-red-500" txt={`Crítico (≤${PROFUNDIDAD_CRITICA_MM} mm)`} />
                <Leyenda color="bg-slate-400" txt="Sin medición" />
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-3 rounded-full ring-2 ring-blue-500" /> Direccional
                  </span>
                  <span className="ml-3 inline-flex items-center gap-1">
                    <span className="size-3 rounded-full ring-2 ring-slate-400" /> Tracción
                  </span>
                </div>
                <p className="pt-1 text-slate-400">
                  {puedeEditar
                    ? "Hacé clic en una posición para asignar / medir / dar de baja."
                    : "Vista de solo lectura."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-slate-500" /> Stock de cubiertas ({stock.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {stock.length === 0 ? (
            <p className="text-sm text-slate-500">No hay cubiertas en stock.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2">Número</th>
                  <th>Tipo</th>
                  <th>Marca</th>
                  <th>Medida</th>
                  <th className="text-right">Prof. (mm)</th>
                  <th>Ingreso</th>
                  {puedeEditar && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {stock.map((n) => (
                  <tr key={n.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{n.numero || "—"}</td>
                    <td>{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-slate-600">{n.marca || "—"}</td>
                    <td className="text-slate-600">{n.medida || "—"}</td>
                    <td className="text-right tabular-nums">
                      {n.profundidad_actual_mm ?? "—"}
                    </td>
                    <td className="text-slate-600">{fmtFecha(n.fecha_ingreso)}</td>
                    {puedeEditar && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-slate-400 hover:text-red-600"
                          onClick={async () => {
                            const res = await eliminarNeumatico({ id: n.id })
                            if ("error" in res) toast.error(res.error)
                            else {
                              toast.success("Cubierta eliminada")
                              refresh()
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Bajas */}
      {bajas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cubiertas dadas de baja ({bajas.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2">Número</th>
                  <th>Tipo</th>
                  <th>Medida</th>
                  <th>Fecha baja</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {bajas.map((n) => (
                  <tr key={n.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{n.numero || "—"}</td>
                    <td>{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-slate-600">{n.medida || "—"}</td>
                    <td className="text-slate-600">{fmtFecha(n.fecha_baja)}</td>
                    <td className="text-slate-600">{n.motivo_baja || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {cargaOpen && (
        <CargaMasivaDialog onClose={() => setCargaOpen(false)} onDone={refresh} />
      )}
      {posDialog && unidad && (
        <PosicionDialog
          unidad={unidad}
          pos={posDialog.pos}
          actual={posDialog.actual}
          stock={stock}
          onClose={() => setPosDialog(null)}
          onDone={() => {
            setPosDialog(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ==================== Subcomponentes ====================

function ResumenCard({
  label,
  value,
  tono,
}: {
  label: string
  value: number
  tono: "info" | "danger" | "muted"
}) {
  const color =
    tono === "danger" && value > 0
      ? "text-red-600"
      : tono === "muted"
        ? "text-slate-500"
        : "text-slate-900"
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold", color)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function Leyenda({ color, txt }: { color: string; txt: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-full", color)} />
      <span>{txt}</span>
    </span>
  )
}

function Diagrama({
  layout,
  porPosicion,
  onPos,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  onPos: (pos: PosicionNeumatico) => void
}) {
  return (
    <div className="relative aspect-[3/4] w-52 shrink-0">
      {/* Silueta de la unidad */}
      <div className="absolute inset-x-6 inset-y-2 rounded-2xl border-2 border-slate-300 bg-slate-50" />
      {/* Cabina (frente) */}
      <div className="absolute inset-x-12 top-3 h-8 rounded-lg border-2 border-slate-300 bg-white" />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        const ring = p.eje === "direccional" ? "ring-blue-500" : "ring-slate-400"
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onPos(p)}
            title={`${p.label} · ${p.eje ?? "libre"}${n ? ` · ${n.numero || "s/n"} (${n.profundidad_actual_mm ?? "?"} mm)` : " · vacía"}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className={cn(
              "absolute flex size-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md text-[10px] font-semibold text-white ring-2 transition-transform hover:scale-110",
              ring,
              n ? colorDesgaste(n.profundidad_actual_mm) : "border-2 border-dashed border-slate-300 bg-white text-slate-400 ring-transparent"
            )}
          >
            <span>{p.label}</span>
            {n && (
              <span className="text-[8px] font-normal opacity-90">
                {n.profundidad_actual_mm ?? "?"}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CargaMasivaDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [tipo, setTipo] = useState<"nuevo" | "recapado">("nuevo")
  const [marca, setMarca] = useState("")
  const [medida, setMedida] = useState("")
  const [prof, setProf] = useState("")
  const [modo, setModo] = useState<"cantidad" | "numeros">("cantidad")
  const [cantidad, setCantidad] = useState("4")
  const [numeros, setNumeros] = useState("")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const res = await crearNeumaticosMasivo({
      tipo,
      marca,
      medida,
      profundidad_inicial_mm: prof ? Number(prof) : null,
      cantidad: modo === "cantidad" ? Number(cantidad) : undefined,
      numeros: modo === "numeros" ? numeros.split(/[\n,]+/) : undefined,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(`${res.creados} cubierta(s) cargada(s) al stock`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carga masiva de cubiertas</DialogTitle>
          <DialogDescription>
            Ingresan al stock. Después las asignás a una unidad desde el diagrama.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "nuevo" | "recapado")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nuevo">Nuevo</SelectItem>
                  <SelectItem value="recapado">Recapado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Profundidad inicial (mm)</Label>
              <Input
                type="number"
                step="0.1"
                value={prof}
                onChange={(e) => setProf(e.target.value)}
                placeholder="ej. 14"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Marca</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="ej. Firestone" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Medida</Label>
              <Input value={medida} onChange={(e) => setMedida(e.target.value)} placeholder="ej. 295/80 R22.5" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant={modo === "cantidad" ? "default" : "outline"}
              onClick={() => setModo("cantidad")}
            >
              Por cantidad
            </Button>
            <Button
              type="button"
              size="sm"
              variant={modo === "numeros" ? "default" : "outline"}
              onClick={() => setModo("numeros")}
            >
              Por números
            </Button>
          </div>

          {modo === "cantidad" ? (
            <div>
              <Label className="text-xs text-slate-500">Cantidad de cubiertas</Label>
              <Input
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs text-slate-500">
                Numeración (una por línea o separadas por coma)
              </Label>
              <Textarea
                rows={4}
                value={numeros}
                onChange={(e) => setNumeros(e.target.value)}
                placeholder={"AB123\nAB124\nAB125"}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Cargar al stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PosicionDialog({
  unidad,
  pos,
  actual,
  stock,
  onClose,
  onDone,
}: {
  unidad: UnidadFlota
  pos: PosicionNeumatico
  actual: Neumatico | null
  stock: Neumatico[]
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  // Asignación (posición vacía)
  const [stockSel, setStockSel] = useState("")
  const [kmInst, setKmInst] = useState("")
  // Medición (posición ocupada)
  const [profMed, setProfMed] = useState("")
  const [kmMed, setKmMed] = useState("")
  const [presion, setPresion] = useState("")
  // Baja
  const [motivoBaja, setMotivoBaja] = useState("")

  const wrap = async (fn: () => Promise<{ success: true } | { error: string }>, ok: string) => {
    setSaving(true)
    const res = await fn()
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(ok)
      onDone()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {unidad.dominio} · posición {pos.label}{" "}
            <Badge variant="outline" className="ml-1 align-middle text-[10px]">
              {pos.eje ?? "libre"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {actual
              ? `Cubierta ${actual.numero || "s/n"} (${TIPO_LABEL[actual.tipo]})`
              : "Posición vacía — asigná una cubierta del stock."}
          </DialogDescription>
        </DialogHeader>

        {!actual ? (
          // ----- Asignar desde stock -----
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500">Cubierta del stock</Label>
              <Select value={stockSel} onValueChange={(v) => setStockSel(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder={stock.length ? "Elegí una cubierta" : "Sin stock"} />
                </SelectTrigger>
                <SelectContent>
                  {stock.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {(n.numero || "s/n") +
                        ` · ${TIPO_LABEL[n.tipo]}` +
                        (n.medida ? ` · ${n.medida}` : "") +
                        (n.profundidad_actual_mm != null ? ` · ${n.profundidad_actual_mm}mm` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Km de instalación (opcional)</Label>
              <Input type="number" value={kmInst} onChange={(e) => setKmInst(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={saving || !stockSel}
                onClick={() =>
                  wrap(
                    () =>
                      asignarNeumatico({
                        id: stockSel,
                        dominio: unidad.dominio,
                        posicion: pos.code,
                        eje: pos.eje,
                        km_instalacion: kmInst ? Number(kmInst) : null,
                      }),
                    "Cubierta instalada"
                  )
                }
              >
                Instalar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // ----- Cubierta instalada: medir / quitar / baja -----
          <div className="space-y-4">
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Ruler className="size-4 text-slate-400" />
                Profundidad actual: <span className="font-semibold">{actual.profundidad_actual_mm ?? "—"} mm</span>
              </div>
              {actual.mediciones && actual.mediciones.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Últimas mediciones:{" "}
                  {actual.mediciones
                    .slice(0, 4)
                    .map((m) => `${m.profundidad_mm ?? "?"}mm (${fmtFecha(m.fecha)})`)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium text-slate-600">Registrar desgaste</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-500">Prof. (mm)</Label>
                  <Input type="number" step="0.1" value={profMed} onChange={(e) => setProfMed(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-500">Km</Label>
                  <Input type="number" value={kmMed} onChange={(e) => setKmMed(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-500">Presión</Label>
                  <Input type="number" value={presion} onChange={(e) => setPresion(e.target.value)} />
                </div>
              </div>
              <Button
                size="sm"
                disabled={saving || (!profMed && !kmMed && !presion)}
                onClick={() =>
                  wrap(
                    () =>
                      registrarMedicionNeumatico({
                        neumatico_id: actual.id,
                        profundidad_mm: profMed ? Number(profMed) : null,
                        km: kmMed ? Number(kmMed) : null,
                        presion_psi: presion ? Number(presion) : null,
                      }),
                    "Medición registrada"
                  )
                }
              >
                Guardar medición
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-red-100 p-3">
              <p className="text-xs font-medium text-slate-600">Dar de baja</p>
              <Input
                placeholder="Motivo (desgaste, pinchadura, etc.)"
                value={motivoBaja}
                onChange={(e) => setMotivoBaja(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={saving || !motivoBaja.trim()}
                onClick={() =>
                  wrap(
                    () => darDeBajaNeumatico({ id: actual.id, motivo: motivoBaja }),
                    "Cubierta dada de baja"
                  )
                }
              >
                Dar de baja
              </Button>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => wrap(() => quitarNeumatico({ id: actual.id }), "Cubierta enviada al stock")}
              >
                Quitar (al stock)
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
