"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Trophy, Medal, Award, Pencil, Sparkles, Settings2, Info, Truck, Loader2, Check } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  setRaspones,
  updateConfigDistribucion,
  confirmarSugeridosDistribucion,
} from "@/actions/tres-r-distribucion"
import {
  MOTIVOS_AUSENTISMO_LABEL,
  TIPOS_REPORTE_LABEL,
  type RankingDistribucionData,
  type TresRDistConfig,
  type TresRDistRow,
} from "@/lib/tres-r/distribucion-types"

const MEDAL = [
  { icon: Trophy, color: "text-amber-500", bg: "border-amber-200 bg-amber-50/60", label: "1° puesto" },
  { icon: Medal, color: "text-slate-400", bg: "border-slate-200 bg-slate-50", label: "2° puesto" },
  { icon: Award, color: "text-orange-500", bg: "border-orange-200 bg-orange-50/60", label: "3° puesto" },
]

const fmt = (n: number | null | undefined, dec = 1) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })

function Aporte({ v }: { v: number | undefined }) {
  if (v == null) return null
  return <div className="text-[11px] text-emerald-600">+{v.toFixed(1)}</div>
}

/** Raspones de una persona en el bimestre: número + nota, se guarda con el botón. */
function RasponesCell({
  row,
  periodoDesde,
  editable,
}: {
  row: TresRDistRow
  periodoDesde: string
  editable: boolean
}) {
  const router = useRouter()
  const [cant, setCant] = useState(String(row.raspones))
  const [nota, setNota] = useState(row.raspones_nota ?? "")
  const [pending, start] = useTransition()
  const n = Math.max(0, Math.round(Number(cant) || 0))
  const cambio = n !== row.raspones || (n > 0 && nota.trim() !== (row.raspones_nota ?? ""))

  if (!editable) {
    return (
      <span className={row.raspones > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}>
        {row.raspones}
      </span>
    )
  }

  function guardar() {
    start(async () => {
      const res = await setRaspones({
        periodo_desde: periodoDesde,
        empleado_id: row.empleado_id,
        cantidad: n,
        nota: nota.trim() || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(n > 0 ? `${row.nombre}: ${n} raspón${n > 1 ? "es" : ""}, queda fuera del premio` : "Raspones en 0")
      router.refresh()
    })
  }

  return (
    <div className="flex min-w-[7rem] flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          aria-label={`Raspones de ${row.nombre}`}
          className={`h-8 w-14 text-right ${n > 0 ? "border-red-300 text-red-700" : ""}`}
          value={cant}
          onChange={(e) => setCant(e.target.value)}
        />
        {cambio && (
          <Button size="icon" className="size-8" onClick={guardar} disabled={pending} aria-label="Guardar raspones">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </Button>
        )}
      </div>
      {n > 0 && (
        <Input
          className="h-7 w-40 text-xs"
          placeholder="Qué pasó (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      )}
    </div>
  )
}

type CfgNumKey = Exclude<keyof TresRDistConfig, "tipos_reporte" | "motivos_descalifican">

const CAMPOS_CFG: Array<[CfgNumKey, string, string?]> = [
  ["peso_rechazo", "Peso rechazo"],
  ["peso_rmd", "Peso RMD"],
  ["peso_reportes", "Peso reportes de seguridad"],
  ["peso_presentismo", "Peso presentismo"],
  ["peso_5s", "Peso 5S del camión"],
  ["peso_tml", "Peso TML"],
  ["tope_rechazo", "Rechazo imputable % que vale 0 pts", "0.1"],
  ["rmd_piso", "RMD que vale 0 pts (★)", "0.05"],
  ["rmd_techo", "RMD que vale 100 pts (★)", "0.05"],
  ["tope_reportes", "Reportes en el período que valen 100 pts", "1"],
  ["min_reportes", "Reportes mínimos para el podio", "1"],
  ["tope_dias_licencia", "Días de licencia que dejan presentismo en 0", "1"],
  ["tml_meta", "TML meta (min, = 100 pts)", "1"],
  ["tml_tope", "TML tope (min, = 0 pts)", "1"],
  ["min_pct_dias", "% mínimo de días hábiles en la calle", "5"],
  ["meses_ventana", "Meses de ventana", "1"],
]

export function DistribucionSection({
  data,
  canEdit,
  canRaspones,
  onEditar,
  onQuitar,
  foto,
}: {
  data: RankingDistribucionData
  canEdit: boolean
  canRaspones: boolean
  onEditar: (pos: number) => void
  onQuitar: (pos: number) => void
  foto: ReactNode
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const c = data.config
  const [cfg, setCfg] = useState<Record<CfgNumKey, string>>(
    () => Object.fromEntries(CAMPOS_CFG.map(([k]) => [k, String(c[k])])) as Record<CfgNumKey, string>,
  )
  const [tipos, setTipos] = useState<string[]>(c.tipos_reporte)
  const [motivos, setMotivos] = useState<string[]>(c.motivos_descalifican)

  const premio = (pos: number) => data.premios.find((p) => p.posicion === pos)
  const sugerido = (pos: number) => data.ranking.find((r) => r.posicion_sugerida === pos)
  const haySugeridos = data.ranking.some((r) => r.posicion_sugerida != null)
  const fuera = data.ranking.filter((r) => !r.elegible).length

  function confirmar() {
    start(async () => {
      const res = await confirmarSugeridosDistribucion(data.periodo_desde)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Top 3 de Distribución confirmado")
      router.refresh()
    })
  }

  function guardarConfig() {
    const nums = Object.fromEntries(CAMPOS_CFG.map(([k]) => [k, Number(cfg[k])])) as Record<CfgNumKey, number>
    if (Object.values(nums).some((n) => !Number.isFinite(n))) {
      toast.error("Revisá los valores de la fórmula")
      return
    }
    if (tipos.length === 0) {
      toast.error("Elegí al menos un tipo de reporte que cuente")
      return
    }
    start(async () => {
      const res = await updateConfigDistribucion({ ...nums, tipos_reporte: tipos, motivos_descalifican: motivos })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Fórmula de Distribución actualizada")
      router.refresh()
    })
  }

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <div className="space-y-5">
      {!data.tablas_ok && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Falta aplicar la migración del 3R de Distribución: rige la fórmula por defecto y no se pueden cargar
          raspones.
        </p>
      )}

      {/* Podio */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4 text-emerald-600" /> Ganadores de distribución
          </CardTitle>
          {canEdit && data.premios.length === 0 && haySugeridos && (
            <Button size="sm" onClick={confirmar} disabled={pending}>
              <Sparkles className="mr-1 size-4" /> Confirmar top 3 sugerido
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((pos) => {
              const m = MEDAL[pos - 1]
              const Icon = m.icon
              const saved = premio(pos)
              const sug = sugerido(pos)
              const nombre = saved?.nombre ?? sug?.nombre ?? null
              const score = saved?.score ?? sug?.score ?? null
              return (
                <div key={pos} className={`rounded-lg border p-4 ${m.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      <Icon className={`size-4 ${m.color}`} /> {m.label}
                    </span>
                    {!saved && sug && <Badge variant="outline" className="text-[10px]">sugerido</Badge>}
                    {saved && <Badge variant="secondary" className="text-[10px]">confirmado</Badge>}
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900">
                    {nombre ?? <span className="text-muted-foreground">—</span>}
                  </div>
                  {score != null && <div className="text-sm text-muted-foreground">{Number(score).toFixed(1)} pts</div>}
                  {canEdit && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEditar(pos)} disabled={pending}>
                        <Pencil className="mr-1 size-3.5" /> Editar
                      </Button>
                      {saved && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onQuitar(pos)} disabled={pending}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {foto}
        </CardContent>
      </Card>

      {/* Detalle */}
      <Accordion defaultValue={canRaspones ? ["detalle-dist"] : []}>
        <AccordionItem value="detalle-dist" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base font-semibold">
            <span>
              Detalle del 3R de distribución
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {data.ranking.length} personas · {fuera} fuera del podio
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {data.ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie salió a la calle en este período todavía.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Choferes y ayudantes compiten juntos. Rechazo, RMD, 5S y TML se miden sobre los{" "}
                  <strong>camión-días</strong> de cada uno (la formación los comparte). Cada componente muestra su
                  valor, entre paréntesis su puntaje 0–100 y en <span className="text-emerald-600">verde</span> lo que
                  aporta al Score. <strong>Fuera del podio</strong> (siguen en la tabla): 1 raspón con el camión,
                  ausencia injustificada o suspensión, menos de {c.min_reportes} reporte
                  {c.min_reportes === 1 ? "" : "s"} de seguridad, o menos de {data.min_dias} días en la calle (
                  {fmt(c.min_pct_dias, 0)} % de {data.dias_habiles} días hábiles
                  {data.periodo_hasta > new Date().toISOString().slice(0, 10) ? " transcurridos" : ""}).
                  {canRaspones && " Los raspones se cargan acá: poné la cantidad y tocá el tilde."}
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Persona</TableHead>
                        <TableHead className="text-right">Rechazo</TableHead>
                        <TableHead className="text-right">RMD</TableHead>
                        <TableHead className="text-right">Reportes</TableHead>
                        <TableHead className="text-right">Presentismo</TableHead>
                        <TableHead className="text-right">5S camión</TableHead>
                        <TableHead className="text-right">TML</TableHead>
                        <TableHead className="text-right">Raspones</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ranking.map((r, i) => (
                        <TableRow
                          key={r.empleado_id}
                          className={r.posicion_sugerida ? "bg-amber-50/40" : !r.elegible ? "bg-red-50/40" : ""}
                        >
                          <TableCell className="align-top text-muted-foreground">
                            {r.posicion_sugerida ? (
                              <Badge className="bg-amber-500 hover:bg-amber-500">{r.posicion_sugerida}°</Badge>
                            ) : (
                              i + 1
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium">{r.nombre}</div>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              <Badge variant="outline" className="text-[10px]">
                                {r.rol}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {r.dias_con_ruta} días
                              </Badge>
                              {r.cd && (
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {r.cd}
                                </Badge>
                              )}
                            </div>
                            {r.motivos.length > 0 && (
                              <div className="pt-1 text-[11px] font-medium text-red-600">
                                Fuera del podio · {r.motivos.join(" · ")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div>
                              {r.rechazo_pct != null ? `${fmt(r.rechazo_pct, 2)} %` : "—"}
                              {r.rechazo_score != null && (
                                <span className="ml-1 text-xs text-muted-foreground">({r.rechazo_score.toFixed(0)})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{r.bultos.toLocaleString("es-AR")} bultos</div>
                            <Aporte v={r.aportes.rechazo} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div>
                              {r.rmd != null ? `${fmt(r.rmd, 2)} ★` : "—"}
                              {r.rmd_score != null && (
                                <span className="ml-1 text-xs text-muted-foreground">({r.rmd_score.toFixed(0)})</span>
                              )}
                            </div>
                            {r.rmd_n > 0 && <div className="text-[11px] text-muted-foreground">{r.rmd_n} calif.</div>}
                            <Aporte v={r.aportes.rmd} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div className={r.reportes_cant < c.min_reportes ? "font-semibold text-red-600" : ""}>
                              {r.reportes_cant}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                ({r.reportes_score.toFixed(0)})
                              </span>
                            </div>
                            <Aporte v={r.aportes.reportes} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div>
                              {r.dias_licencia > 0 ? `${r.dias_licencia} d lic.` : "OK"}
                              <span className="ml-1 text-xs text-muted-foreground">({r.presentismo_score.toFixed(0)})</span>
                            </div>
                            {r.ausentismo_detalle && (
                              <div className="max-w-[12rem] text-[11px] text-muted-foreground">{r.ausentismo_detalle}</div>
                            )}
                            <Aporte v={r.aportes.presentismo} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div>
                              {r.nota_5s != null ? `${fmt(r.nota_5s)} %` : "—"}
                            </div>
                            <Aporte v={r.aportes.s5} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div>
                              {r.tml != null ? `${r.tml} min` : "—"}
                              {r.tml_score != null && (
                                <span className="ml-1 text-xs text-muted-foreground">({r.tml_score.toFixed(0)})</span>
                              )}
                            </div>
                            <Aporte v={r.aportes.tml} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <RasponesCell
                              key={`${data.periodo_desde}-${r.empleado_id}-${r.raspones}`}
                              row={r}
                              periodoDesde={data.periodo_desde}
                              editable={canRaspones && data.tablas_ok}
                            />
                            {r.raspones_nota && !canRaspones && (
                              <div className="text-[11px] text-muted-foreground">{r.raspones_nota}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-top font-bold">{r.score.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Fórmula */}
      {canEdit && (
        <Accordion>
          <AccordionItem value="cfg-dist" className="rounded-lg border px-4">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <Settings2 className="size-4" /> Fórmula del 3R de distribución (editable)
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CAMPOS_CFG.map(([key, label, step]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      step={step ?? "1"}
                      value={cfg[key]}
                      onChange={(e) => setCfg((x) => ({ ...x, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Reportes de seguridad que cuentan</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries(TIPOS_REPORTE_LABEL).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={tipos.includes(k)} onChange={() => toggle(tipos, setTipos, k)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Ausentismo que deja fuera del podio</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries(MOTIVOS_AUSENTISMO_LABEL).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={motivos.includes(k)} onChange={() => toggle(motivos, setMotivos, k)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Quien no tiene dato de un componente (por ejemplo TML de Pergamino, que no pasa por portería) lo
                saca y se reponderan los demás. Reportes y presentismo cuentan siempre. Los días de licencia de los
                motivos que no descalifican restan presentismo. Desempate: más días en la calle, después menos
                rechazo.
              </p>
              <div className="mt-3">
                <Button size="sm" onClick={guardarConfig} disabled={pending || !data.tablas_ok}>
                  Guardar fórmula
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
