"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Trophy,
  Medal,
  Award,
  Pencil,
  Loader2,
  Package,
  Truck,
  Sparkles,
  Settings2,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  savePremio,
  deletePremio,
  updateAyudantesConfig,
  confirmarSugeridosDeposito,
} from "@/actions/s5-deposito"
import type {
  S5RankingDepositoData,
  S5PremioArea,
} from "@/types/database"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

function mesLabel(periodo: string): { mes: string; y: string } {
  const [y, m] = periodo.split("-")
  return { mes: MESES[Number(m) - 1] ?? m, y }
}

function bimestreLabel(meses: string[]): string {
  if (meses.length === 0) return "—"
  const a = mesLabel(meses[0])
  const b = mesLabel(meses[meses.length - 1])
  if (meses.length === 1) return `${a.mes} ${a.y}`
  return a.y === b.y
    ? `${a.mes} – ${b.mes} ${b.y}`
    : `${a.mes} ${a.y} – ${b.mes} ${b.y}`
}

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

const MEDAL = [
  { icon: Trophy, color: "text-amber-500", bg: "border-amber-200 bg-amber-50/60", label: "1° puesto" },
  { icon: Medal, color: "text-slate-400", bg: "border-slate-200 bg-slate-50", label: "2° puesto" },
  { icon: Award, color: "text-orange-500", bg: "border-orange-200 bg-orange-50/60", label: "3° puesto" },
]

interface Props {
  data: S5RankingDepositoData
  empleados: { id: string; legajo: number; nombre: string; sector: string | null }[]
  canEdit: boolean
}

interface EditState {
  area: S5PremioArea
  posicion: number
}

export function DepositoClient({ data, empleados, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Diálogo de edición de premio
  const [edit, setEdit] = useState<EditState | null>(null)
  const [empSel, setEmpSel] = useState<string>("")
  const [freeName, setFreeName] = useState<string>("")
  const [scoreInput, setScoreInput] = useState<string>("")

  // Config (panel fórmula)
  const [cfg, setCfg] = useState({
    peso_errores: String(data.config.peso_errores),
    peso_5s: String(data.config.peso_5s),
    peso_productividad: String(data.config.peso_productividad),
    tope_errores: String(data.config.tope_errores),
    prod_target: String(data.config.prod_target),
    meses_ventana: String(data.config.meses_ventana),
  })

  const ventana = data.meses.length || 2

  function navegar(delta: number) {
    const next = addMonths(data.periodo_desde, delta * ventana)
    startTransition(() => router.push(`/5s/ayudantes/deposito?periodo=${next}`))
  }

  function refrescar() {
    startTransition(() => router.refresh())
  }

  const premioDe = (area: S5PremioArea, pos: number) =>
    (area === "deposito" ? data.premios_deposito : data.premios_distribucion).find(
      (p) => p.posicion === pos,
    )
  const sugeridoDe = (pos: number) =>
    data.ranking.find((r) => r.posicion_sugerida === pos)

  const haySugeridos = data.ranking.some((r) => r.posicion_sugerida != null)
  const sinPremiosDeposito = data.premios_deposito.length === 0

  function abrirEdit(area: S5PremioArea, posicion: number) {
    const actual = premioDe(area, posicion)
    const sug = area === "deposito" ? sugeridoDe(posicion) : undefined
    setEmpSel(actual?.empleado_id ?? sug?.empleado_id ?? "")
    setFreeName(actual?.empleado_id ? "" : actual?.nombre ?? "")
    setScoreInput(
      actual?.score != null
        ? String(actual.score)
        : sug?.score != null
          ? String(sug.score)
          : "",
    )
    setEdit({ area, posicion })
  }

  function guardarPremio() {
    if (!edit) return
    const nombre = freeName.trim()
      ? freeName.trim()
      : empleados.find((e) => e.id === empSel)?.nombre ?? ""
    if (!nombre) {
      toast.error("Elegí un empleado o escribí un nombre")
      return
    }
    const score = scoreInput.trim() ? Number(scoreInput) : null
    startTransition(async () => {
      const res = await savePremio({
        periodo_desde: data.periodo_desde,
        area: edit.area,
        posicion: edit.posicion,
        empleado_id: freeName.trim() ? null : empSel || null,
        nombre,
        score: score != null && Number.isFinite(score) ? score : null,
        origen: "manual",
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Ganador guardado")
      setEdit(null)
      router.refresh()
    })
  }

  function quitarPremio(area: S5PremioArea, posicion: number) {
    startTransition(async () => {
      const res = await deletePremio({
        periodo_desde: data.periodo_desde,
        area,
        posicion,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Ganador quitado")
      setEdit(null)
      router.refresh()
    })
  }

  function confirmarSugeridos() {
    startTransition(async () => {
      const res = await confirmarSugeridosDeposito(data.periodo_desde)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Top 3 sugerido confirmado")
      router.refresh()
    })
  }

  function guardarConfig() {
    const nums = {
      peso_errores: Number(cfg.peso_errores),
      peso_5s: Number(cfg.peso_5s),
      peso_productividad: Number(cfg.peso_productividad),
      tope_errores: Number(cfg.tope_errores),
      prod_target: Number(cfg.prod_target),
      meses_ventana: Number(cfg.meses_ventana),
    }
    if (Object.values(nums).some((n) => !Number.isFinite(n))) {
      toast.error("Revisá los valores de la fórmula")
      return
    }
    startTransition(async () => {
      const res = await updateAyudantesConfig(nums)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Fórmula actualizada")
      router.refresh()
    })
  }

  const empleadosOrden = useMemo(
    () => [...empleados].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [empleados],
  )

  return (
    <div className="space-y-5">
      {/* Header + selector bimestre */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Package className="size-6 text-blue-600" /> Ranking de ayudantes — Depósito
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ganadores cada 2 meses · 5S del sector + errores de picking
            {data.config.peso_productividad > 0 ? " + productividad" : " (productividad próximamente)"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={pending} onClick={() => navegar(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Badge variant="secondary" className="text-sm">
            {bimestreLabel(data.meses)}
          </Badge>
          <Button variant="outline" size="icon" disabled={pending} onClick={() => navegar(1)}>
            <ChevronRight className="size-4" />
          </Button>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Podio Depósito */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-amber-500" /> Ganadores de depósito
          </CardTitle>
          {canEdit && sinPremiosDeposito && haySugeridos && (
            <Button size="sm" onClick={confirmarSugeridos} disabled={pending}>
              <Sparkles className="mr-1 size-4" /> Confirmar top 3 sugerido
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((pos) => {
              const m = MEDAL[pos - 1]
              const Icon = m.icon
              const saved = premioDe("deposito", pos)
              const sug = sugeridoDe(pos)
              const nombre = saved?.nombre ?? sug?.nombre ?? null
              const score = saved?.score ?? sug?.score ?? null
              const esSugerido = !saved && !!sug
              return (
                <div key={pos} className={`rounded-lg border p-4 ${m.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      <Icon className={`size-4 ${m.color}`} /> {m.label}
                    </span>
                    {esSugerido && (
                      <Badge variant="outline" className="text-[10px]">sugerido</Badge>
                    )}
                    {saved && (
                      <Badge variant="secondary" className="text-[10px]">confirmado</Badge>
                    )}
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900">
                    {nombre ?? <span className="text-muted-foreground">—</span>}
                  </div>
                  {score != null && (
                    <div className="text-sm text-muted-foreground">{score.toFixed(1)} pts</div>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => abrirEdit("deposito", pos)} disabled={pending}>
                        <Pencil className="mr-1 size-3.5" /> Editar
                      </Button>
                      {saved && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => quitarPremio("deposito", pos)} disabled={pending}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Distribución (manual) — debajo de depósito */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4 text-emerald-600" /> Ganadores de distribución (manual)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((pos) => {
              const m = MEDAL[pos - 1]
              const Icon = m.icon
              const saved = premioDe("distribucion", pos)
              return (
                <div key={pos} className={`rounded-lg border p-4 ${m.bg}`}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Icon className={`size-4 ${m.color}`} /> {m.label}
                  </span>
                  <div className="mt-2 text-lg font-bold text-slate-900">
                    {saved?.nombre ?? <span className="text-muted-foreground">—</span>}
                  </div>
                  {canEdit && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => abrirEdit("distribucion", pos)} disabled={pending}>
                        <Pencil className="mr-1 size-3.5" /> Editar
                      </Button>
                      {saved && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => quitarPremio("distribucion", pos)} disabled={pending}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detalle del ranking (desplegable, cerrado por defecto) */}
      <Accordion>
        <AccordionItem value="detalle" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base font-semibold">
            Detalle del ranking
          </AccordionTrigger>
          <AccordionContent>
          {data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay datos de 5S ni errores en este bimestre.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ayudante</TableHead>
                    <TableHead className="text-right">5S</TableHead>
                    <TableHead className="text-right">Errores (bultos)</TableHead>
                    <TableHead className="text-right">Productividad</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ranking.map((r, i) => (
                    <TableRow key={r.empleado_id ?? r.nombre} className={r.posicion_sugerida ? "bg-amber-50/40" : ""}>
                      <TableCell className="text-muted-foreground">
                        {r.posicion_sugerida ? (
                          <Badge className="bg-amber-500 hover:bg-amber-500">{r.posicion_sugerida}°</Badge>
                        ) : (
                          i + 1
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.nombre}</div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {r.es_picker && (
                            <Badge variant="outline" className="text-[10px]">picker</Badge>
                          )}
                          {r.es_responsable && r.sectores.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.nota_5s != null ? `${r.nota_5s.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.errores_bultos != null ? (
                          <span>
                            {r.errores_bultos.toFixed(1)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({r.errores_score?.toFixed(0)} pts)
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.productividad != null ? r.productividad.toFixed(0) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold">{r.score.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Panel fórmula */}
      {canEdit && (
        <Accordion>
          <AccordionItem value="cfg" className="rounded-lg border px-4">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <Settings2 className="size-4" /> Fórmula del ranking (editable)
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["peso_errores", "Peso errores"],
                  ["peso_5s", "Peso 5S"],
                  ["peso_productividad", "Peso productividad"],
                  ["tope_errores", "Tope errores (bultos = 0 pts)"],
                  ["prod_target", "Target prod. (bul/HH = 100)"],
                  ["meses_ventana", "Meses de ventana"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      step="0.05"
                      value={cfg[key as keyof typeof cfg]}
                      onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Los pesos se reponderan automáticamente para quien no tenga alguna
                métrica. El podio sugerido son los 3 mejores por score (sin reservar
                puestos): subí el peso de errores/productividad si querés que pesen
                más que la auditoría.
              </p>
              <div className="mt-3">
                <Button size="sm" onClick={guardarConfig} disabled={pending}>
                  Guardar fórmula
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Diálogo editar premio */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar {edit?.posicion}° puesto —{" "}
              {edit?.area === "deposito" ? "Depósito" : "Distribución"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Empleado</Label>
              <Select
                value={empSel}
                onValueChange={(v) => {
                  setEmpSel(v ?? "")
                  setFreeName("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir empleado..." />
                </SelectTrigger>
                <SelectContent>
                  {empleadosOrden.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">…o escribí un nombre</Label>
              <Input
                value={freeName}
                placeholder="Nombre libre (si no está en la lista)"
                onChange={(e) => setFreeName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Score (opcional)</Label>
              <Input
                type="number"
                step="0.1"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {edit && premioDe(edit.area, edit.posicion) && (
              <Button
                variant="ghost"
                className="mr-auto text-red-600"
                onClick={() => edit && quitarPremio(edit.area, edit.posicion)}
                disabled={pending}
              >
                Quitar ganador
              </Button>
            )}
            <Button variant="outline" onClick={() => setEdit(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={guardarPremio} disabled={pending}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
