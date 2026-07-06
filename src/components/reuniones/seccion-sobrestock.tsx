"use client"

import { useEffect, useState, useTransition } from "react"
import { Boxes, Loader2, RefreshCw, Save, ClipboardPaste } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  getSobrestockData,
  guardarSobrestockManual,
  actualizarDesdeSobrestockApp,
  type SobrestockData,
  type SobrestockItem,
} from "@/actions/reuniones-sobrestock"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

export const SECCION_SOBRESTOCK = "sobrestock"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}
function formatNum(n: number, dec = 0): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(n)
}
function formatMoney(n: number): string {
  if (!n) return "$0"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}
// Monto compacto en pesos: $1,3 M / $850 mil / $420.
function formatMoneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${formatNum(abs / 1_000_000, 1)} M`
  if (abs >= 1_000) return `$${formatNum(abs / 1_000, 0)} mil`
  return `$${formatNum(abs, 0)}`
}
// Variación con signo explícito para el KPI vs. semana anterior.
function formatDeltaMoney(n: number): string {
  if (!n) return "$0"
  return `${n < 0 ? "−" : "+"}${formatMoneyCompact(n)}`
}

// Pegado: nro art · descripción · bultos · días cobertura · vpd · valorizado
function parsearPegado(texto: string): SobrestockItem[] {
  const out: SobrestockItem[] = []
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim()
    if (!l) continue
    const cols = l.split(/\t|;|,(?=\s*\S)/).map((c) => c.trim())
    if (cols.length < 2) continue
    if (/art[ií]culo|descrip|bulto|cobertura|vpd|valor/i.test(l) && out.length === 0 && !/\d/.test(cols[0])) {
      continue
    }
    const n = (s: string) => Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0
    const [nro, desc, bultos, cob, vpd, valor] = cols
    out.push({
      nro_articulo: nro || null,
      descripcion: desc || null,
      bultos: n(bultos),
      dias_cobertura: cob ? n(cob) : null,
      vpd: vpd ? n(vpd) : null,
      valorizado: n(valor),
    })
  }
  return out
}

export function SeccionSobrestock({
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [data, setData] = useState<SobrestockData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendiente, startPend] = useTransition()
  const [mostrarImport, setMostrarImport] = useState(false)
  const [pegado, setPegado] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancel = false
    void getSobrestockData(reunionId).then((res) => {
      if (cancel) return
      if ("error" in res) {
        toast.error(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [reunionId, reload])

  const snap = data?.snapshot ?? null
  const comp = data?.comparacion ?? null

  function actualizarDesdeApp() {
    startPend(async () => {
      const res = await actualizarDesdeSobrestockApp(reunionId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Actualizado desde frescura · ${res.data.lineas} artículos`)
      setReload((k) => k + 1)
    })
  }

  function guardarManual() {
    const items = parsearPegado(pegado)
    if (items.length === 0) {
      toast.error("No se reconocieron filas. Formato: nro art / descripción / bultos / días cobertura / vpd / valorizado")
      return
    }
    startPend(async () => {
      const res = await guardarSobrestockManual(reunionId, items)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Snapshot guardado · ${items.length} artículos`)
      setPegado("")
      setMostrarImport(false)
      setReload((k) => k + 1)
    })
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-indigo-900">
          <Boxes className="size-5 text-indigo-600" />
          Sobrestock
          {snap && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {snap.origen === "auto" ? "auto" : "manual"} ·{" "}
              {formatFecha(snap.updated_at.slice(0, 10))}
              {snap.dias_cobertura_umbral ? ` · >${snap.dias_cobertura_umbral}d cob.` : ""}
            </Badge>
          )}
        </CardTitle>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={actualizarDesdeApp}
              disabled={pendiente}
              title="Trae el sobrestock (>30 días de cobertura, VPD 15 días) y lo congela"
            >
              {pendiente ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-3.5" />
              )}
              Actualizar desde frescura
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setMostrarImport((v) => !v)}
            >
              <ClipboardPaste className="mr-1 size-3.5" />
              Cargar manual
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando sobrestock…
          </div>
        ) : (
          <>
            {mostrarImport && puedeEditar && (
              <div className="rounded-lg border border-indigo-200 bg-white p-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  Pegá las filas (una por línea):{" "}
                  <span className="font-medium">
                    nro artículo · descripción · bultos · días cobertura · vpd · valorizado
                  </span>{" "}
                  (TAB o ; — podés pegar desde Excel).
                </p>
                <Textarea
                  value={pegado}
                  onChange={(e) => setPegado(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder={"31354\tANDES ORO 473\t1650\t82\t20\t6684626"}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMostrarImport(false)
                      setPegado("")
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={guardarManual} disabled={pendiente}>
                    <Save className="mr-1 size-3.5" />
                    Guardar snapshot
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Artículos con sobrestock"
                value={snap ? formatNum(snap.total_lineas) : "—"}
                sub={comp ? `antes ${formatNum(comp.anterior_total_lineas)}` : "período"}
              />
              <KpiCard
                label="Bultos en sobrestock"
                value={snap ? formatNum(snap.total_bultos) : "—"}
                sub={comp ? `antes ${formatNum(comp.anterior_total_bultos)}` : undefined}
              />
              <KpiCard
                label="Valorizado"
                value={snap ? formatMoney(snap.total_valorizado) : "—"}
                sub={comp ? `antes ${formatMoney(comp.anterior_total_valorizado)}` : undefined}
              />
              <KpiCard
                label="vs. reunión anterior"
                value={
                  comp && snap
                    ? formatDeltaMoney(snap.total_valorizado - comp.anterior_total_valorizado)
                    : "—"
                }
                valueClassName={
                  comp && snap
                    ? snap.total_valorizado - comp.anterior_total_valorizado < 0
                      ? "text-emerald-700"
                      : snap.total_valorizado - comp.anterior_total_valorizado > 0
                        ? "text-rose-700"
                        : "text-slate-900"
                    : undefined
                }
                sub={
                  comp && snap
                    ? `antes ${formatMoneyCompact(comp.anterior_total_valorizado)} → hoy ${formatMoneyCompact(snap.total_valorizado)} (${formatFecha(comp.anterior_fecha)})`
                    : "sin comparación"
                }
              />
            </div>

            <div className="rounded-md border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Nro art.</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24 text-right">Bultos</TableHead>
                    <TableHead className="w-28 text-right">Días cob.</TableHead>
                    <TableHead className="w-20 text-right">VPD</TableHead>
                    <TableHead className="w-32 text-right">Valorizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!snap || snap.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        Sin snapshot cargado. Usá &ldquo;Actualizar desde frescura&rdquo; o
                        &ldquo;Cargar manual&rdquo;.
                      </TableCell>
                    </TableRow>
                  ) : (
                    snap.items.map((it, i) => (
                      <TableRow key={`${it.nro_articulo}-${i}`}>
                        <TableCell className="tabular-nums">{it.nro_articulo ?? "—"}</TableCell>
                        <TableCell className="font-medium">{it.descripcion ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNum(it.bultos)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-indigo-700">
                          {it.dias_cobertura != null ? formatNum(it.dias_cobertura, 1) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {it.vpd != null ? formatNum(it.vpd, 1) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(it.valorizado)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* La acción tomada se registra en el Action Log de la sección. */}
            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo="logistica-ventas"
              seccion={SECCION_SOBRESTOCK}
              titulo="Sobrestock"
              actividades={actividades}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onActividadesChanged}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", valueClassName ?? "text-slate-900")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
