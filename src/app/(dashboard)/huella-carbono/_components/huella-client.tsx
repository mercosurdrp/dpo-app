"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Factory, Fuel, Leaf, Printer, Truck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { guardarHuellaManualMes, guardarHuellaParams } from "@/actions/huella"
import {
  MES_LABEL,
  REFERENCIAS,
  type HuellaAnual,
  type HuellaManualMes,
  type HuellaMes,
  type HuellaParams,
} from "@/lib/huella/definiciones"
import type { UserRole } from "@/types/database"

const nf0 = (v: number) => Math.round(v).toLocaleString("es-AR")
const nf1 = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const COLOR_S1 = "#059669" // emerald-600
const COLOR_S2 = "#f59e0b" // amber-500
const COLOR_S3 = "#0284c7" // sky-600

const mesCorto = (mes: string) => MES_LABEL[mes.slice(5)]?.slice(0, 3) ?? mes

function FuenteChip({ fuente }: { fuente: string }) {
  const estilos: Record<string, string> = {
    registrado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    factura: "bg-emerald-50 text-emerald-700 border-emerald-200",
    estimado: "bg-amber-50 text-amber-700 border-amber-200",
    "sin dato": "bg-red-50 text-red-700 border-red-200",
  }
  return (
    <span className={`inline-block rounded-full border px-1.5 py-0 text-[10px] leading-4 ${estilos[fuente] ?? ""}`}>
      {fuente}
    </span>
  )
}

export function HuellaClient({ huella, role }: { huella: HuellaAnual; role: UserRole }) {
  const [tab, setTab] = useState("resumen")
  const puedeEditar = role === "admin" || role === "supervisor"
  const { totales, meses, anio } = huella
  const mesActual = new Date().toISOString().slice(0, 7)

  const dataChart = useMemo(
    () =>
      meses.map((m) => ({
        mes: mesCorto(m.mes),
        "Scope 1": Number(m.s1.toFixed(1)),
        "Scope 2": m.s2 != null ? Number(m.s2.toFixed(1)) : 0,
        "Scope 3": Number(m.s3.toFixed(1)),
      })),
    [meses],
  )

  return (
    <div className="space-y-4">
      {/* Al imprimir, sólo se ve el informe */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .huella-informe, .huella-informe * { visibility: visible !important; }
          .huella-informe { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Leaf className="size-6 text-emerald-600" /> Huella de Carbono {anio}
          </h1>
          <p className="text-sm text-muted-foreground">
            Inventario de emisiones GHG Protocol (alcances 1, 2 y 3) armado desde los sistemas de la empresa.
          </p>
        </div>
        <Button variant="outline" onClick={() => { setTab("informe"); setTimeout(() => window.print(), 300) }}>
          <Printer className="size-4" /> Imprimir / PDF
        </Button>
      </div>

      {/* KPIs: cada tarjeta abre el detalle mensual */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 print:hidden">
        <button onClick={() => setTab("meses")} className="rounded-lg border bg-emerald-50 p-3 text-left transition hover:shadow">
          <p className="text-xs font-medium uppercase text-emerald-700">Total conocido</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-800">{nf1(totales.totalConocido)} t</p>
          <p className="text-xs text-emerald-700">CO₂e · ene–{mesCorto(meses[meses.length - 1]?.mes ?? "")}</p>
        </button>
        <button onClick={() => setTab("meses")} className="rounded-lg border p-3 text-left transition hover:shadow">
          <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"><Fuel className="size-3.5" /> Scope 1</p>
          <p className="text-2xl font-bold tabular-nums">{nf1(totales.s1)} t</p>
          <p className="text-xs text-muted-foreground">flota propia + autoelevadores</p>
        </button>
        <button onClick={() => setTab("datos")} className="rounded-lg border p-3 text-left transition hover:shadow">
          <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"><Zap className="size-3.5" /> Scope 2</p>
          {totales.s2 != null ? (
            <p className="text-2xl font-bold tabular-nums">{nf1(totales.s2)} t</p>
          ) : (
            <p className="text-2xl font-bold text-amber-600">pendiente</p>
          )}
          <p className="text-xs text-muted-foreground">
            {totales.mesesSinKwh > 0 ? `faltan kWh de ${totales.mesesSinKwh} ${totales.mesesSinKwh === 1 ? "mes" : "meses"}` : "electricidad comprada"}
          </p>
        </button>
        <button onClick={() => setTab("meses")} className="rounded-lg border p-3 text-left transition hover:shadow">
          <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"><Truck className="size-3.5" /> Scope 3</p>
          <p className="text-2xl font-bold tabular-nums">{nf1(totales.s3)} t</p>
          <p className="text-xs text-muted-foreground">{nf0(totales.fleteViajes)} fletes · {nf0(totales.fleteKm)} km</p>
        </button>
        <button onClick={() => setTab("meses")} className="rounded-lg border p-3 text-left transition hover:shadow">
          <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"><Factory className="size-3.5" /> Intensidad</p>
          <p className="text-2xl font-bold tabular-nums">{totales.intensidadKgHl != null ? nf2(totales.intensidadKgHl) : "—"}</p>
          <p className="text-xs text-muted-foreground">kg CO₂e por HL entregado</p>
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="print:hidden">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="meses">Mes a mes</TabsTrigger>
          <TabsTrigger value="informe">Informe</TabsTrigger>
          <TabsTrigger value="datos">Datos y factores</TabsTrigger>
        </TabsList>

        {/* ===== RESUMEN ===== */}
        <TabsContent value="resumen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Emisiones por mes y alcance (t CO₂e)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v) => `${nf1(Number(v) || 0)} t`} />
                    <Legend />
                    <Bar dataKey="Scope 1" stackId="a" fill={COLOR_S1} />
                    <Bar dataKey="Scope 2" stackId="a" fill={COLOR_S2} />
                    <Bar dataKey="Scope 3" stackId="a" fill={COLOR_S3} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Fuel className="size-4 text-emerald-600" /> Scope 1 — directas</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                El gasoil que quema la flota propia de reparto y los autoelevadores del depósito,
                más las recargas de gas refrigerante. Es lo que la empresa emite con sus propios equipos.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Zap className="size-4 text-amber-500" /> Scope 2 — energía comprada</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                La electricidad del depósito y las oficinas. Se calcula con los kWh de las facturas
                por el factor de emisión de la red eléctrica argentina.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Truck className="size-4 text-sky-600" /> Scope 3 — flete contratado</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Los viajes contratados para traer mercadería desde las plantas (Zárate, Pompeya,
                Campana…) hasta el depósito. Se toman los km de ida y vuelta del tarifario: el
                servicio pagado incluye el regreso del camión.
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== MES A MES ===== */}
        <TabsContent value="meses">
          <Card>
            <CardContent className="overflow-x-auto pt-4">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-2">Mes</th>
                    <th className="py-2 pr-2 text-right">HL</th>
                    <th className="py-2 pr-2 text-right">Gasoil flota (l)</th>
                    <th className="py-2 pr-2 text-right">Autoelev. (l)</th>
                    <th className="py-2 pr-2 text-right">kWh</th>
                    <th className="py-2 pr-2 text-right">S1 (t)</th>
                    <th className="py-2 pr-2 text-right">S2 (t)</th>
                    <th className="py-2 pr-2 text-right">Fletes</th>
                    <th className="py-2 pr-2 text-right">S3 (t)</th>
                    <th className="py-2 pr-2 text-right">Total (t)</th>
                    <th className="py-2 text-right">kg/HL</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {meses.map((m: HuellaMes) => (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium">
                        {MES_LABEL[m.mes.slice(5)]}
                        {m.mes === mesActual && <span className="ml-1 text-xs text-muted-foreground">(en curso)</span>}
                      </td>
                      <td className="py-2 pr-2 text-right">{nf0(m.hl)}</td>
                      <td className="py-2 pr-2 text-right">
                        {nf0(m.gasoilFlotaL)} <FuenteChip fuente={m.gasoilFuente} />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {nf0(m.autoL)} <FuenteChip fuente={m.autoFuente} />
                      </td>
                      <td className="py-2 pr-2 text-right">{m.kwh != null ? nf0(m.kwh) : <FuenteChip fuente="sin dato" />}</td>
                      <td className="py-2 pr-2 text-right font-medium">{nf1(m.s1)}</td>
                      <td className="py-2 pr-2 text-right font-medium">{m.s2 != null ? nf1(m.s2) : "—"}</td>
                      <td className="py-2 pr-2 text-right">{m.fleteViajes}</td>
                      <td className="py-2 pr-2 text-right font-medium">{nf1(m.s3)}</td>
                      <td className="py-2 pr-2 text-right font-semibold">{nf1(m.totalConocido)}</td>
                      <td className="py-2 text-right">{m.intensidadKgHl != null ? nf2(m.intensidadKgHl) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50 font-semibold">
                    <td className="py-2 pr-2">Total</td>
                    <td className="py-2 pr-2 text-right">{nf0(totales.hl)}</td>
                    <td className="py-2 pr-2 text-right" colSpan={2}></td>
                    <td className="py-2 pr-2"></td>
                    <td className="py-2 pr-2 text-right">{nf1(totales.s1)}</td>
                    <td className="py-2 pr-2 text-right">{totales.s2 != null ? nf1(totales.s2) : "—"}</td>
                    <td className="py-2 pr-2 text-right">{totales.fleteViajes}</td>
                    <td className="py-2 pr-2 text-right">{nf1(totales.s3)}</td>
                    <td className="py-2 pr-2 text-right">{nf1(totales.totalConocido)}</td>
                    <td className="py-2 text-right">{totales.intensidadKgHl != null ? nf2(totales.intensidadKgHl) : "—"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                <FuenteChip fuente="estimado" /> gasoil de flota estimado con {huella.params.ratioLitrosHl} l/HL
                (meses previos al registro digital) y autoelevadores con {huella.params.autoHorasDia} h/día ×{" "}
                {huella.params.autoLitrosHora} l/h. Se reemplazan cargando el dato de factura en «Datos y factores».
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== INFORME (imprimible) ===== */}
        <TabsContent value="informe">
          <InformeHuella huella={huella} />
        </TabsContent>

        {/* ===== DATOS Y FACTORES ===== */}
        <TabsContent value="datos" className="space-y-4">
          <DatosManuales huella={huella} puedeEditar={puedeEditar} />
          <FactoresForm params={huella.params} puedeEditar={puedeEditar} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ================= Informe imprimible ================= */

function InformeHuella({ huella }: { huella: HuellaAnual }) {
  const { totales, meses, anio, params } = huella
  const ultimo = meses[meses.length - 1]
  const periodo = `enero–${(MES_LABEL[ultimo?.mes.slice(5) ?? ""] ?? "").toLowerCase()} ${anio}`
  return (
    <div className="huella-informe mx-auto max-w-3xl rounded-lg border bg-white p-8 text-[15px] leading-relaxed">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Mercosur Región Pampeana · GHG Protocol · {periodo}
      </p>
      <h2 className="mt-1 text-2xl font-bold">Huella de carbono — inventario de emisiones</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Primera medición de gases de efecto invernadero de la operación, elaborada desde los
        registros propios (combustible de flota, ventas y fletes de abastecimiento). Línea de
        base para el plan de reducción y para el punto ESG 6.1.1 del programa Galaxia de Quilmes.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border bg-emerald-50 p-3">
          <p className="text-xs uppercase text-emerald-700">Total conocido</p>
          <p className="text-xl font-bold tabular-nums">{nf1(totales.totalConocido)} t CO₂e</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs uppercase text-muted-foreground">Scope 1</p>
          <p className="text-xl font-bold tabular-nums">{nf1(totales.s1)} t</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs uppercase text-muted-foreground">Scope 2</p>
          <p className="text-xl font-bold tabular-nums">{totales.s2 != null ? `${nf1(totales.s2)} t` : "pendiente"}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs uppercase text-muted-foreground">Scope 3 (flete)</p>
          <p className="text-xl font-bold tabular-nums">{nf1(totales.s3)} t</p>
        </div>
      </div>
      <p className="mt-2 text-sm">
        <strong>Intensidad: {totales.intensidadKgHl != null ? nf2(totales.intensidadKgHl) : "—"} kg CO₂e por HL entregado</strong>{" "}
        ({nf0(totales.hl)} HL en el período{totales.mesesSinKwh > 0 ? "; falta la electricidad de " + totales.mesesSinKwh + (totales.mesesSinKwh === 1 ? " mes" : " meses") : ""}).
      </p>

      <h3 className="mt-6 text-lg font-semibold">Qué mide cada alcance</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        <li><strong>Scope 1 (directas):</strong> gasoil de los camiones de reparto propios y de los autoelevadores del depósito, más recargas de gas refrigerante.</li>
        <li><strong>Scope 2 (energía comprada):</strong> electricidad de depósito y oficinas (kWh de facturas × factor de la red argentina, {params.feKwh} kg CO₂e/kWh).</li>
        <li><strong>Scope 3 (indirectas):</strong> el flete contratado que trae la mercadería desde las plantas al depósito. La huella de producción de la cerveza es de CMQ y no se suma acá (evita el doble conteo dentro de la cadena Quilmes).</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold">Mes a mes (t CO₂e)</h3>
      <table className="mt-2 w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-1">Mes</th>
            <th className="py-1 text-right">HL</th>
            <th className="py-1 text-right">Scope 1</th>
            <th className="py-1 text-right">Scope 2</th>
            <th className="py-1 text-right">Scope 3</th>
            <th className="py-1 text-right">Total</th>
            <th className="py-1 text-right">kg/HL</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes} className="border-b last:border-0">
              <td className="py-1">{MES_LABEL[m.mes.slice(5)]}</td>
              <td className="py-1 text-right">{nf0(m.hl)}</td>
              <td className="py-1 text-right">{nf1(m.s1)}</td>
              <td className="py-1 text-right">{m.s2 != null ? nf1(m.s2) : "—"}</td>
              <td className="py-1 text-right">{nf1(m.s3)}</td>
              <td className="py-1 text-right font-medium">{nf1(m.totalConocido)}</td>
              <td className="py-1 text-right">{m.intensidadKgHl != null ? nf2(m.intensidadKgHl) : "—"}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1">Total</td>
            <td className="py-1 text-right">{nf0(totales.hl)}</td>
            <td className="py-1 text-right">{nf1(totales.s1)}</td>
            <td className="py-1 text-right">{totales.s2 != null ? nf1(totales.s2) : "—"}</td>
            <td className="py-1 text-right">{nf1(totales.s3)}</td>
            <td className="py-1 text-right">{nf1(totales.totalConocido)}</td>
            <td className="py-1 text-right">{totales.intensidadKgHl != null ? nf2(totales.intensidadKgHl) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-6 text-lg font-semibold">Comparación con estándares</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        <li><strong>AB InBev global</strong> reporta {nf2(REFERENCIAS.abiS12KgHl)} kg CO₂e/hl de Scope 1+2 en producción (9M 2024). No es comparable directo con una distribuidora, pero da la escala del sector.</li>
        <li><strong>Quilmes / AB InBev</strong> tiene meta de <strong>carbono neutral en toda la cadena de valor para {REFERENCIAS.metaCarbonoNeutral}</strong>: las emisiones de sus distribuidoras son parte de esa meta.</li>
        <li><strong>Programa Galaxia (ESG 6.1.1):</strong> primera medición + plan de reducción con objetivos = Nivel 1. La medición se carga en la calculadora oficial (thecarbonsink) con facturas de respaldo.</li>
      </ul>

      <h3 className="mt-6 text-lg font-semibold">Metodología y supuestos</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        <li>Estándar GHG Protocol Corporate. Resultado en toneladas de CO₂ equivalente. Factor gasoil: {params.feGasoil} kg CO₂e/l.</li>
        <li>Gasoil de flota: registro digital de cargas desde {params.gasoilConfiableDesde}; meses anteriores estimados con {params.ratioLitrosHl} l por HL entregado (relación medida). El dato de factura, cuando se carga, pisa la estimación.</li>
        <li>Autoelevadores: medidos desde {params.autoMedidoDesde}; antes, estimados con {params.autoHorasDia} h/día × {params.autoLitrosHora} l/h (consumo medido en las cargas reales).</li>
        <li>Flete de abastecimiento: viajes registrados × km de <strong>ida y vuelta</strong> del tarifario por planta × {params.fleteConsumoL100} l/100 km. Se toma el circuito completo porque el servicio contratado incluye el regreso del camión (criterio GHG Protocol para transporte aguas arriba, que incorpora los tramos vacíos).</li>
        <li>Refrigerantes: kg recargados × GWP {nf0(params.gwpRefrigerante)} (R-404A).</li>
        <li>HL entregados: suma diaria de ventas por fletero.</li>
      </ul>
      <p className="mt-6 border-t pt-3 text-xs text-muted-foreground">
        Generado desde dpo-app · datos al {new Date().toLocaleDateString("es-AR")} · los valores estimados se
        reemplazan por facturas a medida que se cargan en «Datos y factores».
      </p>
    </div>
  )
}

/* ================= Datos manuales por mes ================= */

function DatosManuales({ huella, puedeEditar }: { huella: HuellaAnual; puedeEditar: boolean }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [borrador, setBorrador] = useState<Record<string, HuellaManualMes>>(() => ({ ...huella.manual }))

  const set = (mes: string, campo: keyof HuellaManualMes, valor: string) =>
    setBorrador((b) => ({
      ...b,
      [mes]: { ...b[mes], [campo]: valor === "" ? null : campo === "notas" ? valor : Number(valor) },
    }))

  const guardar = (mes: string) =>
    startTransition(async () => {
      const res = await guardarHuellaManualMes(huella.anio, mes, borrador[mes] ?? {})
      if ("error" in res) toast.error(res.error)
      else {
        toast.success(`${MES_LABEL[mes.slice(5)]} guardado`)
        router.refresh()
      }
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos que se cargan a mano (por mes)</CardTitle>
        <p className="text-sm text-muted-foreground">
          kWh de las facturas de luz (cierra el Scope 2), recargas de refrigerante y, si está la
          factura, los litros reales de gasoil (reemplazan la estimación del mes).
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-2">Mes</th>
              <th className="py-2 pr-2">kWh electricidad</th>
              <th className="py-2 pr-2">Refrigerante (kg)</th>
              <th className="py-2 pr-2">Gasoil factura (l)</th>
              <th className="py-2 pr-2">Notas</th>
              {puedeEditar && <th className="py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {huella.meses.map((m) => {
              const b = borrador[m.mes] ?? {}
              return (
                <tr key={m.mes} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{MES_LABEL[m.mes.slice(5)]}</td>
                  {puedeEditar ? (
                    <>
                      <td className="py-2 pr-2">
                        <Input type="number" className="h-8 w-28" value={b.kwh ?? ""} onChange={(e) => set(m.mes, "kwh", e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <Input type="number" className="h-8 w-24" value={b.refrigeranteKg ?? ""} onChange={(e) => set(m.mes, "refrigeranteKg", e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <Input type="number" className="h-8 w-28" value={b.gasoilFacturaL ?? ""} onChange={(e) => set(m.mes, "gasoilFacturaL", e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <Input className="h-8 w-40" value={b.notas ?? ""} onChange={(e) => set(m.mes, "notas", e.target.value)} />
                      </td>
                      <td className="py-2">
                        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => guardar(m.mes)}>
                          Guardar
                        </Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-2 tabular-nums">{b.kwh ?? "—"}</td>
                      <td className="py-2 pr-2 tabular-nums">{b.refrigeranteKg ?? "—"}</td>
                      <td className="py-2 pr-2 tabular-nums">{b.gasoilFacturaL ?? "—"}</td>
                      <td className="py-2 pr-2">{b.notas ?? ""}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

/* ================= Factores del cálculo ================= */

function FactoresForm({ params, puedeEditar }: { params: HuellaParams; puedeEditar: boolean }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [p, setP] = useState<HuellaParams>(params)

  const campos: Array<{ k: keyof HuellaParams; label: string }> = [
    { k: "feGasoil", label: "Factor gasoil (kg CO₂e/l)" },
    { k: "feKwh", label: "Factor electricidad (kg CO₂e/kWh)" },
    { k: "fleteConsumoL100", label: "Consumo flete (l/100 km)" },
    { k: "ratioLitrosHl", label: "Litros por HL (estimación)" },
    { k: "autoLitrosHora", label: "Autoelevador (l/h)" },
    { k: "autoHorasDia", label: "Autoelevador (h/día)" },
    { k: "gwpRefrigerante", label: "GWP refrigerante" },
    { k: "kmDefault", label: "km flete sin tarifa (ida y vuelta)" },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Factores del cálculo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cambiar un factor recalcula todo el año. Los km por planta salen del tarifario de fletes
          (ida y vuelta): Zárate {params.kmPlantas["ZARATE"]}, Campana {params.kmPlantas["CAMPANA"]},
          Pompeya {params.kmPlantas["POMPEYA"]}, Mercado Central {params.kmPlantas["MERCADO CENTRAL"]}.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {campos.map(({ k, label }) => (
            <label key={k} className="text-xs text-muted-foreground">
              {label}
              <Input
                type="number"
                step="any"
                className="mt-1 h-8"
                disabled={!puedeEditar}
                value={Number(p[k])}
                onChange={(e) => setP((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        {puedeEditar && (
          <Button
            className="mt-3"
            size="sm"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const res = await guardarHuellaParams(p)
                if ("error" in res) toast.error(res.error)
                else {
                  toast.success("Factores guardados")
                  router.refresh()
                }
              })
            }
          >
            Guardar factores
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
