"use client"

// Análisis de incidencias de mantenimiento correctivo (DPO Flota 2.4).
//
// H1 puntuó 1: «análisis de incidencias aperturado y tomar acciones». El
// auditor verifica que «los datos de las órdenes correctivas puedan
// estratificarse». Esta solapa hace exactamente eso con las OT que ya están
// cargadas (externas e internas):
//  · cuatro cortes conmutables —sistema, unidad, mes, taller— con OT, unidades,
//    costo, días parado, roturas y el Pareto (% acumulado);
//  · la matriz unidad × sistema, que es donde se ve que OJA403 concentra motor
//    y eléctrico y AF664NY carrocería;
//  · por sistema, la CONCLUSIÓN escrita y la ACCIÓN de fondo con su estado, con
//    el enlace a lo que ya fue al plan preventivo (2.2) y el 5 Porqués sobre la
//    OT más cara del sistema (herramientas del pilar Gestión, R2.4.4).

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileText, Pencil, Stethoscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { fmtMoneyOt } from "./_components/ot-formato"
import {
  analizarCorrectivos,
  type AnalisisCorrectivos as Analisis,
  type EjeEstratificacion,
  type FilaEstrato,
  type OtCorrectiva,
} from "@/lib/flota/correctivo-analisis"
import { labelSistema, sistemaDeTareaPlan } from "@/lib/flota/sistemas-ot"
import {
  getAnalisisCorrectivos,
  setAnalisisSistema,
  type AnalisisSistema,
} from "@/actions/correctivo-analisis"
import type { MantenimientoPlanTarea, MantenimientoRealizado, MantenimientoSistema } from "@/types/database"

const EJES: Array<{ id: EjeEstratificacion; label: string }> = [
  { id: "sistema", label: "Por sistema" },
  { id: "unidad", label: "Por unidad" },
  { id: "mes", label: "Por mes" },
  { id: "taller", label: "Por taller (interno / externo)" },
]

const fmtFecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")

export function AnalisisCorrectivos({
  mantenimientos,
  tareasPlan,
  puedeEditar,
  onVerOt,
}: {
  mantenimientos: MantenimientoRealizado[]
  tareasPlan: MantenimientoPlanTarea[]
  puedeEditar: boolean
  onVerOt: (m: MantenimientoRealizado) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [meses, setMeses] = useState<"3" | "6" | "12" | "24">("12")
  const [eje, setEje] = useState<EjeEstratificacion>("sistema")
  const [abierta, setAbierta] = useState<string | null>(null)
  const [conclusiones, setConclusiones] = useState<AnalisisSistema[]>([])
  const [sqlPendiente, setSqlPendiente] = useState(false)
  const [editar, setEditar] = useState<MantenimientoSistema | null>(null)
  const [hoy] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    getAnalisisCorrectivos().then((r) => {
      if ("data" in r) {
        setConclusiones(r.data.items)
        setSqlPendiente(r.data.sqlPendiente)
      }
    })
  }, [])

  const analisis: Analisis = useMemo(
    () => analizarCorrectivos({ mantenimientos, hoy, meses: Number(meses) }),
    [mantenimientos, hoy, meses]
  )
  const filas: FilaEstrato[] =
    eje === "sistema" ? analisis.porSistema : eje === "unidad" ? analisis.porUnidad : eje === "mes" ? analisis.porMes : analisis.porTaller
  const otById = useMemo(() => new Map(mantenimientos.map((m) => [m.id, m])), [mantenimientos])
  const conclusionPor = useMemo(() => new Map(conclusiones.map((c) => [c.sistema, c])), [conclusiones])
  // Tareas del plan preventivo que ya cubren cada sistema (enlace con el 2.2).
  const planPorSistema = useMemo(() => {
    const m = new Map<MantenimientoSistema, string[]>()
    for (const t of tareasPlan) {
      if (!t.activo) continue
      const s = sistemaDeTareaPlan(t)
      m.set(s, [...(m.get(s) ?? []), t.nombre])
    }
    return m
  }, [tareasPlan])
  const maxN = Math.max(1, ...filas.map((f) => f.n))
  const t = analisis.totales

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="analisis-correctivos" />

      {sqlPendiente && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Falta aplicar <code className="font-mono text-xs">APLICAR_EN_PAMPEANA_CORRECTIVO_2_4.sql</code>: el análisis se
          ve igual, pero las conclusiones y acciones por sistema todavía no se pueden guardar.
        </p>
      )}

      {/* Resumen del período */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="OT correctivas" valor={String(t.n)} sub={`${t.externas} externas · ${t.internas} internas`} />
          <Kpi label="Unidades" valor={String(t.unidades)} sub="con al menos una OT" />
          <Kpi label="Costo" valor={fmtMoneyOt(t.costo)} sub="cabecera o desglose, el mayor" />
          <Kpi label="Días parado" valor={String(t.diasParado)} sub="fuera de servicio por correctivo" tono={t.diasParado > 10 ? "critico" : "ok"} />
          <Kpi label="Roturas" valor={String(t.roturas)} sub={`${t.auxilios} auxilio${t.auxilios === 1 ? "" : "s"} en ruta`} tono={t.roturas > 0 ? "alerta" : "ok"} />
          <Kpi
            label="Tiempo en taller"
            valor={t.horasTallerPromedio != null ? `${t.horasTallerPromedio.toFixed(0)} h` : "—"}
            sub="promedio entrada→salida"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={meses} onValueChange={(v) => setMeses((v as typeof meses) ?? "12")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="24">24 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/vehiculos/analisis-correctivos-pdf?meses=${meses}`, "_blank")}
          >
            <FileText className="mr-1 size-4" /> PDF para la carpeta
          </Button>
        </div>
      </div>

      {/* Estratificación */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="size-4 text-orange-600" /> Estratificación de las OT correctivas
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {EJES.map((e) => (
                <Button key={e.id} size="sm" variant={eje === e.id ? "default" : "outline"} className="h-7 text-xs" onClick={() => { setEje(e.id); setAbierta(null) }}>
                  {e.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {fmtFecha(analisis.desde)} → {fmtFecha(analisis.hasta)}. La barra es la cantidad de OT relativa al mayor; el
            % acumulado es el Pareto. Hacé clic en una fila para ver sus OT.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin OT correctivas en el período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{EJES.find((e) => e.id === eje)?.label.replace("Por ", "")}</TableHead>
                  <TableHead className="w-40" />
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">% acum.</TableHead>
                  <TableHead className="text-right">Unid.</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">% costo</TableHead>
                  <TableHead className="text-right">Días parado</TableHead>
                  <TableHead className="text-right">Roturas</TableHead>
                  <TableHead className="text-right">Internas</TableHead>
                  {eje === "sistema" && <TableHead>Conclusión / acción</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => {
                  const exp = abierta === f.clave
                  const conc = eje === "sistema" ? conclusionPor.get(f.clave as MantenimientoSistema) : undefined
                  return (
                    <FilaEstratoRow
                      key={f.clave}
                      f={f}
                      maxN={maxN}
                      expandida={exp}
                      onToggle={() => setAbierta(exp ? null : f.clave)}
                      conclusion={conc}
                      mostrarConclusion={eje === "sistema"}
                      planCubre={eje === "sistema" ? planPorSistema.get(f.clave as MantenimientoSistema) ?? [] : []}
                      puedeEditar={puedeEditar}
                      onEditar={() => setEditar(f.clave as MantenimientoSistema)}
                      onVerOt={(id) => {
                        const m = otById.get(id)
                        if (m) onVerOt(m)
                      }}
                    />
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Matriz unidad × sistema */}
      {analisis.dominios.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Matriz unidad × sistema</CardTitle>
            <p className="text-sm text-muted-foreground">
              OT correctivas por celda (color = cantidad). Es la foto que responde «qué se le rompe a cada camión».
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  {analisis.sistemas.map((s) => (
                    <TableHead key={s} className="text-center text-xs">{labelSistema(s)}</TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analisis.dominios.map((d) => {
                  const celdas = analisis.matriz.filter((c) => c.dominio === d)
                  const total = celdas.reduce((a, c) => a + c.n, 0)
                  const costo = celdas.reduce((a, c) => a + c.costo, 0)
                  return (
                    <TableRow key={d}>
                      <TableCell className="font-medium">{d}</TableCell>
                      {analisis.sistemas.map((s) => {
                        const c = celdas.find((x) => x.sistema === s)
                        return (
                          <TableCell
                            key={s}
                            className={cn(
                              "text-center tabular-nums",
                              !c && "text-muted-foreground/30",
                              c && c.n >= 3 && "bg-orange-200/70 font-semibold text-orange-950 dark:bg-orange-500/40 dark:text-orange-50",
                              c && c.n === 2 && "bg-orange-100 dark:bg-orange-500/20",
                              c && c.n === 1 && "bg-orange-50 dark:bg-orange-500/10"
                            )}
                            title={c ? `${c.n} OT · ${fmtMoneyOt(c.costo)} · ${c.diasParado} d parado` : ""}
                          >
                            {c ? c.n : "·"}
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-right tabular-nums font-medium">{total}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoneyOt(costo)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editar && (
        <ConclusionDialog
          sistema={editar}
          actual={conclusionPor.get(editar) ?? null}
          fila={analisis.porSistema.find((f) => f.clave === editar) ?? null}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null)
            getAnalisisCorrectivos().then((r) => {
              if ("data" in r) setConclusiones(r.data.items)
            })
            startTransition(() => router.refresh())
          }}
        />
      )}
    </div>
  )
}

function Kpi({ label, valor, sub, tono = "neutro" }: { label: string; valor: string; sub: string; tono?: "neutro" | "ok" | "alerta" | "critico" }) {
  const color =
    tono === "critico" ? "text-destructive" : tono === "alerta" ? "text-amber-700 dark:text-amber-400" : tono === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", color)}>{valor}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

function FilaEstratoRow({
  f,
  maxN,
  expandida,
  onToggle,
  conclusion,
  mostrarConclusion,
  planCubre,
  puedeEditar,
  onEditar,
  onVerOt,
}: {
  f: FilaEstrato
  maxN: number
  expandida: boolean
  onToggle: () => void
  conclusion?: AnalisisSistema
  mostrarConclusion: boolean
  planCubre: string[]
  puedeEditar: boolean
  onEditar: () => void
  onVerOt: (id: string) => void
}) {
  const cols = mostrarConclusion ? 11 : 10
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="font-medium">{f.label}</TableCell>
        <TableCell>
          <div className="h-2 w-full rounded bg-muted">
            <div className="h-2 rounded bg-orange-500/70" style={{ width: `${(f.n / maxN) * 100}%` }} />
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">{f.n}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{f.pctAcumN.toFixed(0)} %</TableCell>
        <TableCell className="text-right tabular-nums">{f.unidades}</TableCell>
        <TableCell className="text-right tabular-nums">{fmtMoneyOt(f.costo)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{f.pctCosto.toFixed(0)} %</TableCell>
        <TableCell className={cn("text-right tabular-nums", f.diasParado > 0 && "text-destructive")}>{f.diasParado}</TableCell>
        <TableCell className="text-right tabular-nums">{f.roturas}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{f.internas}</TableCell>
        {mostrarConclusion && (
          <TableCell className="max-w-72 text-xs" onClick={(e) => e.stopPropagation()}>
            {conclusion?.observacion || conclusion?.planAccion ? (
              <div className="space-y-0.5">
                {conclusion.observacion && <p className="text-muted-foreground">{conclusion.observacion}</p>}
                {conclusion.planAccion && (
                  <p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mr-1 text-[10px]",
                        conclusion.planEstado === "cerrado"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                      )}
                    >
                      {conclusion.planEstado === "cerrado" ? "Acción cerrada" : "Acción en curso"}
                    </Badge>
                    {conclusion.planAccion}
                  </p>
                )}
                {puedeEditar && (
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={onEditar}>
                    <Pencil className="mr-1 size-3" /> Editar
                  </Button>
                )}
              </div>
            ) : puedeEditar ? (
              <Button variant="outline" size="sm" className={cn("h-7 text-xs", f.n >= 3 && "border-destructive/40 text-destructive")} onClick={onEditar}>
                <Pencil className="mr-1 size-3" /> {f.n >= 3 ? "Falta conclusión" : "Escribir conclusión"}
              </Button>
            ) : (
              <span className="text-muted-foreground/60">sin conclusión</span>
            )}
          </TableCell>
        )}
      </TableRow>
      {expandida && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={cols} className="p-0">
            <div className="space-y-2 px-6 py-3">
              {mostrarConclusion && (
                <p className="text-xs text-muted-foreground">
                  Lo cubre el plan preventivo:{" "}
                  {planCubre.length > 0 ? planCubre.join(" · ") : <span className="text-destructive">ninguna tarea</span>}
                  . Para llevarlo al plan: solapa Plan / Plantillas → Correctivos recurrentes → «Llevar al plan».
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Fecha</TableHead>
                    <TableHead className="w-16">OT</TableHead>
                    <TableHead className="w-24">Unidad</TableHead>
                    <TableHead>Trabajo</TableHead>
                    <TableHead>Sistema</TableHead>
                    <TableHead>Taller</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Parado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f.ots.map((o: OtCorrectiva) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => onVerOt(o.id)}>
                      <TableCell className="tabular-nums">{fmtFecha(o.fecha)}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{o.numeroOt ?? "—"}</TableCell>
                      <TableCell className="font-medium">{o.dominio}</TableCell>
                      <TableCell className="max-w-md text-xs">
                        {o.auxilio && <Badge variant="outline" className="mr-1 border-red-200 bg-red-50 text-[10px] text-red-700">auxilio</Badge>}
                        {o.descripcion}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {o.sistemaSugerido && <span title="deducido del texto">~ </span>}
                        {labelSistema(o.sistema)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{o.taller}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoneyOt(o.costo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.diasParado > 0 ? `${o.diasParado} d` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function ConclusionDialog({
  sistema,
  actual,
  fila,
  onClose,
  onSaved,
}: {
  sistema: MantenimientoSistema
  actual: AnalisisSistema | null
  fila: FilaEstrato | null
  onClose: () => void
  onSaved: () => void
}) {
  const [observacion, setObservacion] = useState(actual?.observacion ?? "")
  const [plan, setPlan] = useState(actual?.planAccion ?? "")
  const [estado, setEstado] = useState<"en_curso" | "cerrado">(actual?.planEstado ?? "en_curso")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await setAnalisisSistema({ sistema, observacion, planAccion: plan, planEstado: estado })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Análisis guardado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labelSistema(sistema)}: conclusión y acción</DialogTitle>
          <DialogDescription>
            {fila
              ? `${fila.n} OT en ${fila.unidades} unidad${fila.unidades === 1 ? "" : "es"} · ${fmtMoneyOt(fila.costo)} · ${fila.diasParado} días parado · ${fila.roturas} rotura${fila.roturas === 1 ? "" : "s"}`
              : "Sin OT en el período"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Conclusión del análisis</Label>
            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={3}
              placeholder="Qué dicen las OT de este sistema: dónde se repite, en qué unidad, por qué. Ej.: «13 soldaduras de carrocería en 7 camiones; AF664NY concentra 4: las guías de lona se vencen antes de los 20.000 km»."
            />
          </div>
          <div>
            <Label>Acción de fondo (la contramedida, no la reparación)</Label>
            <Textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={3}
              placeholder="Ej.: «Se agregó al plan preventivo la inspección de carrocería y lona cada 20.000 km (ver Evolución del plan, 04/11); ANS con Pagnanini para soldaduras con turno en 72 h»."
            />
          </div>
          {plan.trim() && (
            <div className="flex gap-2 text-sm">
              <Button type="button" size="sm" variant={estado === "en_curso" ? "default" : "outline"} onClick={() => setEstado("en_curso")}>
                En curso
              </Button>
              <Button type="button" size="sm" variant={estado === "cerrado" ? "default" : "outline"} onClick={() => setEstado("cerrado")}>
                Cerrada
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
