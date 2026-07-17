"use client"

import { useMemo, useRef, useState, useTransition, type ChangeEvent } from "react"
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
  ImagePlus,
  Trash2,
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
  uploadFotoGanadores,
  deleteFotoGanadores,
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

// Comprime la imagen en el navegador antes de mandarla al server action
// (evita el límite de payload de las Server Actions).
function comprimirImagen(file: File, maxLado = 1600, calidad = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxLado || height > maxLado) {
        const r = Math.min(maxLado / width, maxLado / height)
        width = Math.round(width * r)
        height = Math.round(height * r)
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("No se pudo procesar la imagen"))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))),
        "image/jpeg",
        calidad,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Archivo de imagen inválido"))
    }
    img.src = url
  })
}

// Bloque para subir/ver/quitar la foto grupal de ganadores de un área.
function FotoGanadores({
  area,
  periodoDesde,
  url,
  canEdit,
  onChanged,
}: {
  area: S5PremioArea
  periodoDesde: string
  url: string | null
  canEdit: boolean
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      const blob = await comprimirImagen(file)
      const fd = new FormData()
      fd.append("file", new File([blob], `${area}.jpg`, { type: "image/jpeg" }))
      fd.append("periodo_desde", periodoDesde)
      fd.append("area", area)
      const res = await uploadFotoGanadores(fd)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Foto de ganadores actualizada")
        onChanged()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la foto")
    } finally {
      setBusy(false)
    }
  }

  async function quitar() {
    setBusy(true)
    try {
      const res = await deleteFotoGanadores({ periodo_desde: periodoDesde, area })
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Foto quitada")
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit && !url) return null

  return (
    <div className="mt-4 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Foto de los ganadores (sale en la cartelera del Depósito)
        </span>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <ImagePlus className="mr-1 size-3.5" />
              )}
              {url ? "Cambiar foto" : "Subir foto"}
            </Button>
            {url && (
              <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={quitar}>
                <Trash2 className="mr-1 size-3.5" /> Quitar
              </Button>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </div>
        )}
      </div>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Ganadores" className="mt-2 max-h-56 rounded-lg border object-contain" />
      )}
    </div>
  )
}

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
    prod_target_maq: String(data.config.prod_target_maq),
    meses_ventana: String(data.config.meses_ventana),
  })

  const ventana = data.meses.length || 2

  function navegar(delta: number) {
    const next = addMonths(data.periodo_desde, delta * ventana)
    startTransition(() => router.push(`/5s/ayudantes?periodo=${next}`))
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
      prod_target_maq: Number(cfg.prod_target_maq),
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

  // Aporte de cada componente al score final = (peso × valor) / Σ pesos
  // presentes. Los tres aportes suman exactamente el Score. Refleja la misma
  // reponderación que hace el server.
  function aportes(r: S5RankingDepositoData["ranking"][number]) {
    const c = data.config
    const parts: Array<{ k: "e" | "s" | "p"; w: number; v: number }> = []
    if (r.errores_score != null && c.peso_errores > 0)
      parts.push({ k: "e", w: c.peso_errores, v: r.errores_score })
    if (r.nota_5s != null && c.peso_5s > 0)
      parts.push({ k: "s", w: c.peso_5s, v: r.nota_5s })
    if (r.productividad_score != null && c.peso_productividad > 0)
      parts.push({ k: "p", w: c.peso_productividad, v: r.productividad_score })
    const tw = parts.reduce((a, p) => a + p.w, 0)
    const get = (k: "e" | "s" | "p") => {
      const p = parts.find((x) => x.k === k)
      return p && tw > 0 ? (p.w * p.v) / tw : null
    }
    return { e: get("e"), s: get("s"), p: get("p") }
  }

  return (
    <div className="space-y-5">
      {/* Header + selector bimestre */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Package className="size-6 text-blue-600" /> Ranking de ayudantes
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
          <FotoGanadores
            area="deposito"
            periodoDesde={data.periodo_desde}
            url={data.fotos_ganadores?.deposito ?? null}
            canEdit={canEdit}
            onChanged={refrescar}
          />
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
          <FotoGanadores
            area="distribucion"
            periodoDesde={data.periodo_desde}
            url={data.fotos_ganadores?.distribucion ?? null}
            canEdit={canEdit}
            onChanged={refrescar}
          />
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
              <p className="mb-2 text-xs text-muted-foreground">
                Cada componente muestra su valor, entre paréntesis su puntaje
                0–100, y abajo en <span className="text-emerald-600">verde</span> lo
                que <strong>aporta al Score</strong>. Los tres aportes suman el Score.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ayudante</TableHead>
                    <TableHead className="text-right">5S</TableHead>
                    <TableHead className="text-right">Errores (cant.)</TableHead>
                    <TableHead className="text-right">Productividad</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ranking.map((r, i) => {
                    const ap = aportes(r)
                    return (
                    <TableRow key={r.empleado_id ?? r.nombre} className={r.posicion_sugerida ? "bg-amber-50/40" : ""}>
                      <TableCell className="text-muted-foreground align-top">
                        {r.posicion_sugerida ? (
                          <Badge className="bg-amber-500 hover:bg-amber-500">{r.posicion_sugerida}°</Badge>
                        ) : (
                          i + 1
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium">{r.nombre}</div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {r.es_picker && (
                            <Badge variant="outline" className="text-[10px]">picker</Badge>
                          )}
                          {r.es_maquinista && (
                            <Badge variant="outline" className="text-[10px]">maquinista</Badge>
                          )}
                          {r.es_responsable && r.sectores.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {r.nota_5s != null ? (
                          <>
                            <div>{r.nota_5s.toFixed(1)}%</div>
                            {ap.s != null && (
                              <div className="text-[11px] text-emerald-600">+{ap.s.toFixed(1)}</div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {r.errores_cant != null ? (
                          <>
                            <div>
                              {r.errores_cant}
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({r.errores_score?.toFixed(0)})
                              </span>
                            </div>
                            {ap.e != null && (
                              <div className="text-[11px] text-emerald-600">+{ap.e.toFixed(1)}</div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {r.productividad != null || r.productividad_maq != null ? (
                          <>
                            <div className="text-muted-foreground">
                              {[
                                r.productividad != null
                                  ? `${r.productividad.toFixed(0)} bul`
                                  : null,
                                r.productividad_maq != null
                                  ? `${r.productividad_maq.toFixed(1)} pal`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              <span className="ml-1 text-xs">
                                ({r.productividad_score?.toFixed(0)})
                              </span>
                            </div>
                            {ap.p != null && (
                              <div className="text-[11px] text-emerald-600">+{ap.p.toFixed(1)}</div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top font-bold">{r.score.toFixed(1)}</TableCell>
                    </TableRow>
                    )
                  })}
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
                  ["tope_errores", "Tope errores (cant. = 0 pts)"],
                  ["prod_target", "Target picking (bul/HH = 100)"],
                  ["prod_target_maq", "Target maquinista (Pal/HH = 100)"],
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
