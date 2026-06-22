"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, ClipboardList, FileDown, ArrowUpDown } from "lucide-react"
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlanFormDialog } from "@/app/(dashboard)/indicadores/rechazos/_components/planes/plan-form-dialog"
import { getSuenoDetalle, type SuenoDetalle } from "@/actions/sueno"
import {
  getSuenoRechazoPct,
  getSuenoRechazoClientes,
  getRechazoPlanOpciones,
} from "@/actions/sueno-rechazo"
import {
  KPI_MOTIVO,
  MES_LABEL_CORTO,
  type RechazoClienteRow,
  type RechazoKpiKey,
  type RechazoPctData,
  type RechazoPlanOpciones,
} from "@/lib/sueno/rechazo-tipos"
import { RAMA_COLOR, type SuenoNodo } from "@/lib/sueno/arbol-config"
import { SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/sueno/semaforo"
import { formatValor } from "./sueno-kpi-card"

const nfAR = new Intl.NumberFormat("es-AR")
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 })

type OrdenRanking = "entregas" | "bultos"
type FocoPlan = {
  foco_motivo_id?: number
  foco_motivo_ds?: string
  foco_cliente_id?: number
  foco_cliente_nombre?: string
} | null

export function SuenoRechazoDetalle({ nodo }: { nodo: SuenoNodo }) {
  const kpiKey = nodo.key as RechazoKpiKey
  const motivo = KPI_MOTIVO[kpiKey]
  const color = RAMA_COLOR[nodo.rama]

  const [mesSel, setMesSel] = useState<number | "all">("all")
  const [orden, setOrden] = useState<OrdenRanking>("entregas")

  const [mensual, setMensual] = useState<SuenoDetalle | null>(null)
  const [pctData, setPctData] = useState<RechazoPctData | null>(null)
  const [clientes, setClientes] = useState<RechazoClienteRow[]>([])
  const [opciones, setOpciones] = useState<RechazoPlanOpciones | null>(null)

  const [cargando, startCarga] = useTransition()
  const [cargandoCli, startCli] = useTransition()
  const [descargando, setDescargando] = useState(false)

  // Plan de acción
  const [planOpen, setPlanOpen] = useState(false)
  const [foco, setFoco] = useState<FocoPlan>(null)
  const [planClientes, setPlanClientes] = useState<
    { id_cliente: number; nombre_cliente: string }[]
  >([])

  // Carga base (mensual + % + opciones del plan).
  useEffect(() => {
    startCarga(async () => {
      const [det, pctRes, opcRes] = await Promise.all([
        getSuenoDetalle(kpiKey, nodo.anio),
        getSuenoRechazoPct(kpiKey, nodo.anio),
        getRechazoPlanOpciones(),
      ])
      if ("data" in det) setMensual(det.data)
      if ("data" in pctRes) setPctData(pctRes.data)
      if ("data" in opcRes) setOpciones(opcRes.data)
    })
  }, [kpiKey, nodo.anio])

  // Ranking de clientes (depende del mes).
  useEffect(() => {
    startCli(async () => {
      const res = await getSuenoRechazoClientes(
        kpiKey,
        nodo.anio,
        mesSel === "all" ? null : mesSel,
      )
      setClientes("data" in res ? res.data : [])
    })
  }, [kpiKey, nodo.anio, mesSel])

  const clientesOrdenados = useMemo(() => {
    const arr = [...clientes]
    arr.sort((a, b) =>
      orden === "entregas" ? b.entregas - a.entregas || b.bultos - a.bultos
        : b.bultos - a.bultos || b.entregas - a.entregas,
    )
    return arr
  }, [clientes, orden])

  const maxRank = useMemo(() => {
    const v = clientesOrdenados.map((c) => (orden === "entregas" ? c.entregas : c.bultos))
    return Math.max(...v, 1)
  }, [clientesOrdenados, orden])

  const maxMensual = useMemo(() => {
    if (!mensual || mensual.meses.length === 0) return 1
    return Math.max(...mensual.meses.map((m) => Math.abs(m.valor)), 1)
  }, [mensual])

  function abrirPlanMotivo() {
    setFoco({ foco_motivo_id: motivo.id, foco_motivo_ds: motivo.ds })
    setPlanClientes([])
    setPlanOpen(true)
  }
  function abrirPlanCliente(c: RechazoClienteRow) {
    setFoco({
      foco_motivo_id: motivo.id,
      foco_motivo_ds: motivo.ds,
      foco_cliente_id: c.idCliente > 0 ? c.idCliente : undefined,
      foco_cliente_nombre: c.idCliente > 0 ? c.nombreCliente : undefined,
    })
    setPlanClientes(
      c.idCliente > 0
        ? [{ id_cliente: c.idCliente, nombre_cliente: c.nombreCliente }]
        : [],
    )
    setPlanOpen(true)
  }

  async function descargarPdf() {
    setDescargando(true)
    try {
      const mesQ = mesSel === "all" ? "" : `&mes=${mesSel}`
      const resp = await fetch(
        `/api/sueno/rechazo-pdf?kpi=${kpiKey}&anio=${nodo.anio}${mesQ}`,
      )
      if (!resp.ok) {
        toast.error("No se pudo generar el PDF")
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rechazos_${kpiKey}_${nodo.anio}${
        mesSel === "all" ? "" : `_${String(mesSel).padStart(2, "0")}`
      }.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Error al descargar el PDF")
    } finally {
      setDescargando(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full" style={{ backgroundColor: color }} />
          Rechazos · {nodo.label} · {nodo.anio}
        </DialogTitle>
        <DialogDescription>
          Detalle mensual, peso sobre el total y clientes que más rechazan.
        </DialogDescription>
      </DialogHeader>

      {/* Resumen + acciones */}
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 px-3 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">YTD</p>
          <p
            className="text-2xl font-bold tabular-nums"
            style={{ color: nodo.valorYtd == null ? "#94A3B8" : SEMAFORO_COLOR[nodo.estado] }}
          >
            {formatValor(nodo.valorYtd, nodo.unidad)}
          </p>
        </div>
        <div className="text-sm text-slate-500">
          <p>
            Meta:{" "}
            <span className="font-medium text-slate-700">
              {nodo.meta == null ? "—" : formatValor(nodo.meta, nodo.unidad)}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: SEMAFORO_COLOR[nodo.estado] }} />
            {SEMAFORO_LABEL[nodo.estado]}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[11px]">Mes</Label>
            <Select
              value={mesSel === "all" ? "all" : String(mesSel)}
              onValueChange={(v) => setMesSel(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el año</SelectItem>
                {MES_LABEL_CORTO.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={abrirPlanMotivo}>
            <ClipboardList className="size-4" /> Plan de acción
          </Button>
          <Button size="sm" className="gap-1.5" onClick={descargarPdf} disabled={descargando}>
            {descargando ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            PDF
          </Button>
        </div>
      </div>

      {cargando && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Cargando detalle…
        </div>
      )}

      {!cargando && (
        <Tabs defaultValue="mensual" className="mt-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="mensual">Mensual</TabsTrigger>
            <TabsTrigger value="pct">% del total</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
          </TabsList>

          {/* ── Mensual ── */}
          <TabsContent value="mensual" className="pt-3">
            {mensual && mensual.meses.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 font-medium">Mes</th>
                    <th className="py-1.5 text-right font-medium">Rechazos</th>
                    <th className="w-1/3 py-1.5 font-medium" />
                    <th className="py-1.5 text-right font-medium">Bultos rech.</th>
                  </tr>
                </thead>
                <tbody>
                  {mensual.meses.map((m) => {
                    const activo = mesSel !== "all" && m.mes === mesSel
                    return (
                      <tr
                        key={m.mes}
                        className={`border-b border-slate-100 ${activo ? "bg-slate-50" : ""}`}
                      >
                        <td className="py-1.5 font-medium text-slate-700">{m.etiqueta}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">
                          {nfAR.format(m.valor)}
                        </td>
                        <td className="py-1.5 pl-3">
                          <span className="block h-2 rounded-full bg-slate-100">
                            <span
                              className="block h-2 rounded-full"
                              style={{
                                width: `${Math.max(4, (Math.abs(m.valor) / maxMensual) * 100)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          {m.detalle == null ? "" : nf1.format(m.detalle)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">Sin datos para este año.</p>
            )}
          </TabsContent>

          {/* ── % del total ── */}
          <TabsContent value="pct" className="pt-3">
            {pctData && pctData.meses.length > 0 ? (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  Qué porción del total de rechazos corresponde a «{nodo.label}» cada mes.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-1.5 font-medium">Mes</th>
                      <th className="py-1.5 text-right font-medium">% veces</th>
                      <th className="w-1/4 py-1.5 font-medium" />
                      <th className="py-1.5 text-right font-medium">% bultos</th>
                      <th className="w-1/4 py-1.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {pctData.meses.map((m) => (
                      <tr key={m.mes} className="border-b border-slate-100">
                        <td className="py-1.5 font-medium text-slate-700">{m.etiqueta}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">
                          {m.pctCant == null ? "—" : `${nf1.format(m.pctCant)}%`}
                          <span className="ml-1 text-[11px] font-normal text-slate-400">
                            ({nfAR.format(m.cantTipo)}/{nfAR.format(m.cantTotal)})
                          </span>
                        </td>
                        <td className="py-1.5 pl-3">
                          <BarPct value={m.pctCant} color={color} />
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">
                          {m.pctBultos == null ? "—" : `${nf1.format(m.pctBultos)}%`}
                        </td>
                        <td className="py-1.5 pl-3">
                          <BarPct value={m.pctBultos} color="#0ea5e9" />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td className="py-1.5 text-slate-700">YTD</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-900">
                        {pctData.ytd.pctCant == null ? "—" : `${nf1.format(pctData.ytd.pctCant)}%`}
                      </td>
                      <td />
                      <td className="py-1.5 text-right tabular-nums text-slate-900">
                        {pctData.ytd.pctBultos == null ? "—" : `${nf1.format(pctData.ytd.pctBultos)}%`}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">Sin datos para este año.</p>
            )}
          </TabsContent>

          {/* ── Clientes ── */}
          <TabsContent value="clientes" className="pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Clientes que más rechazan {mesSel === "all" ? "en el año" : `en ${MES_LABEL_CORTO[(mesSel as number) - 1]}`}.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => setOrden((o) => (o === "entregas" ? "bultos" : "entregas"))}
              >
                <ArrowUpDown className="size-3.5" />
                Orden: {orden === "entregas" ? "entregas" : "bultos"}
              </Button>
            </div>
            {cargandoCli ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
                <Loader2 className="size-4 animate-spin" /> Cargando clientes…
              </div>
            ) : clientesOrdenados.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Sin rechazos de este tipo en el período.</p>
            ) : (
              <div className="max-h-[44vh] overflow-y-auto pr-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-1.5 font-medium">#</th>
                      <th className="py-1.5 font-medium">Cliente</th>
                      <th className="py-1.5 text-right font-medium" title="Comprobantes de rechazo distintos">Entregas</th>
                      <th className="py-1.5 text-right font-medium">Bultos</th>
                      <th className="w-1/4 py-1.5 font-medium" />
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {clientesOrdenados.map((c, i) => {
                      const val = orden === "entregas" ? c.entregas : c.bultos
                      return (
                        <tr key={`${c.idCliente}-${i}`} className="border-b border-slate-100">
                          <td className="py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="max-w-[180px] truncate py-1.5 text-slate-700">{c.nombreCliente}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">{nfAR.format(c.entregas)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-600">{nf1.format(c.bultos)}</td>
                          <td className="py-1.5 pl-3">
                            <span className="block h-2 rounded-full bg-slate-100">
                              <span
                                className="block h-2 rounded-full"
                                style={{ width: `${Math.max(4, (val / maxRank) * 100)}%`, backgroundColor: color }}
                              />
                            </span>
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => abrirPlanCliente(c)}
                            >
                              Plan
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {opciones && (
        <PlanFormDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          motivos={opciones.motivos}
          clientes={planClientes}
          responsables={opciones.responsables}
          focoInicial={foco}
          onSaved={() => toast.success("Plan de acción guardado")}
        />
      )}
    </>
  )
}

function BarPct({ value, color }: { value: number | null; color: string }) {
  return (
    <span className="block h-2 rounded-full bg-slate-100">
      <span
        className="block h-2 rounded-full"
        style={{ width: `${Math.max(2, Math.min(100, value ?? 0))}%`, backgroundColor: color }}
      />
    </span>
  )
}
