"use client"

import { useEffect, useState, useTransition } from "react"
import { CalendarClock, Loader2, RefreshCw, Save, ClipboardPaste } from "lucide-react"
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
  getFrescuraData,
  guardarFrescuraManual,
  setFrescuraAccion,
  actualizarDesdeFrescuraApp,
  type FrescuraData,
  type FrescuraItem,
} from "@/actions/reuniones-frescura"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

export const SECCION_FRESCURA = "frescura"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

function addUnMes(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCMonth(dt.getUTCMonth() + 1)
  return dt.toISOString().slice(0, 10)
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}
function formatMoney(n: number): string {
  if (!n) return "$0"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

// Normaliza una fecha pegada (YYYY-MM-DD o DD/MM/YYYY) a ISO.
function parseFecha(s: string): string | null {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const d = m[1].padStart(2, "0")
    const mo = m[2].padStart(2, "0")
    let y = m[3]
    if (y.length === 2) y = "20" + y
    return `${y}-${mo}-${d}`
  }
  return null
}

// Parser del pegado: columnas nro art / descripción / vence / bultos / valorizado
// separadas por TAB, ; o coma. Una línea por artículo.
function parsearPegado(texto: string): FrescuraItem[] {
  const out: FrescuraItem[] = []
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim()
    if (!l) continue
    const cols = l.split(/\t|;|,(?=\s*\S)/).map((c) => c.trim())
    if (cols.length < 2) continue
    // Saltar encabezado típico
    if (/art[ií]culo|descrip|vence|bulto|valor/i.test(l) && out.length === 0 && !/\d/.test(cols[0])) {
      continue
    }
    const [nro, desc, vence, bultos, valor] = cols
    out.push({
      nro_articulo: nro || null,
      descripcion: desc || null,
      vence: vence ? parseFecha(vence) : null,
      bultos: Number(String(bultos ?? "").replace(/\./g, "").replace(",", ".")) || 0,
      valorizado:
        Number(String(valor ?? "").replace(/\./g, "").replace(",", ".")) || 0,
    })
  }
  return out
}

export function SeccionFrescura({
  fechaReunion,
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [desde, setDesde] = useState(fechaReunion)
  const [hasta, setHasta] = useState(addUnMes(fechaReunion))
  const [data, setData] = useState<FrescuraData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendiente, startPend] = useTransition()
  const [mostrarImport, setMostrarImport] = useState(false)
  const [pegado, setPegado] = useState("")
  const [accion, setAccion] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    void getFrescuraData(reunionId).then((res) => {
      if (cancel) return
      if ("error" in res) {
        toast.error(res.error)
        setData(null)
      } else {
        setData(res.data)
        setAccion(res.data.snapshot?.accion_tomada ?? "")
        if (res.data.snapshot?.desde) setDesde(res.data.snapshot.desde)
        if (res.data.snapshot?.hasta) setHasta(res.data.snapshot.hasta)
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
      const res = await actualizarDesdeFrescuraApp(reunionId, desde, hasta)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Actualizado desde frescura · ${res.data.lineas} líneas`)
      setReload((k) => k + 1)
    })
  }

  function guardarManual() {
    const items = parsearPegado(pegado)
    if (items.length === 0) {
      toast.error("No se reconocieron filas. Formato: nro art / descripción / vence / bultos / valorizado")
      return
    }
    startPend(async () => {
      const res = await guardarFrescuraManual(reunionId, desde, hasta, items)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Snapshot guardado · ${items.length} líneas`)
      setPegado("")
      setMostrarImport(false)
      setReload((k) => k + 1)
    })
  }

  function guardarAccion() {
    startPend(async () => {
      const res = await setFrescuraAccion(reunionId, accion)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Acción guardada")
    })
  }

  return (
    <Card className="border-cyan-200 bg-cyan-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-cyan-900">
          <CalendarClock className="size-5 text-cyan-600" />
          Frescura – Vencimiento
          {snap && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {snap.origen === "auto" ? "auto" : "manual"} ·{" "}
              {formatFecha(snap.updated_at.slice(0, 10))}
            </Badge>
          )}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value || fechaReunion)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
          />
          <label className="text-xs text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value || addUnMes(fechaReunion))}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
          />
          {puedeEditar && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={actualizarDesdeApp}
                disabled={pendiente}
                title="Trae las líneas próximas a vencer desde la app de frescura y las congela"
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
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando frescura…
          </div>
        ) : (
          <>
            {/* Import manual */}
            {mostrarImport && puedeEditar && (
              <div className="rounded-lg border border-cyan-200 bg-white p-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  Pegá las filas (una por línea):{" "}
                  <span className="font-medium">
                    nro artículo · descripción · vence (DD/MM/AAAA) · bultos · valorizado
                  </span>{" "}
                  separadas por TAB o ; (podés pegar directo desde Excel).
                </p>
                <Textarea
                  value={pegado}
                  onChange={(e) => setPegado(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder={"12345\tCerveza X 1L\t20/06/2026\t120\t350000"}
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

            {/* KPIs + comparación */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Líneas por vencer"
                value={snap ? formatInt(snap.total_lineas) : "—"}
                sub={comp ? `antes ${formatInt(comp.anterior_total_lineas)}` : "período"}
              />
              <KpiCard
                label="Bultos por vencer"
                value={snap ? formatInt(snap.total_bultos) : "—"}
                sub={comp ? `antes ${formatInt(comp.anterior_total_bultos)}` : undefined}
              />
              <KpiCard
                label="Valorizado"
                value={snap ? formatMoney(snap.total_valorizado) : "—"}
                sub={comp ? `antes ${formatMoney(comp.anterior_total_valorizado)}` : undefined}
              />
              <KpiCard
                label="vs. reunión anterior"
                value={comp ? `−${formatInt(comp.resueltos)} / +${formatInt(comp.nuevos)}` : "—"}
                sub={comp ? `resueltos / nuevos (${formatFecha(comp.anterior_fecha)})` : "sin comparación"}
              />
            </div>

            {/* Tabla de líneas */}
            <div className="rounded-md border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Nro art.</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-28">Vence</TableHead>
                    <TableHead className="w-24 text-right">Bultos</TableHead>
                    <TableHead className="w-32 text-right">Valorizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!snap || snap.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                        Sin snapshot cargado. Usá &ldquo;Actualizar desde frescura&rdquo; o
                        &ldquo;Cargar manual&rdquo;.
                      </TableCell>
                    </TableRow>
                  ) : (
                    snap.items.map((it, i) => (
                      <TableRow key={`${it.nro_articulo}-${i}`}>
                        <TableCell className="tabular-nums">{it.nro_articulo ?? "—"}</TableCell>
                        <TableCell className="font-medium">{it.descripcion ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{formatFecha(it.vence)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(it.bultos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(it.valorizado)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Acción tomada */}
            {puedeEditar && (
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Acción tomada
                </label>
                <Textarea
                  value={accion}
                  onChange={(e) => setAccion(e.target.value)}
                  rows={2}
                  className="mt-1 text-sm"
                  placeholder="Qué se decidió para reducir el vencimiento…"
                />
                <div className="mt-1 flex justify-end">
                  <Button size="sm" variant="outline" onClick={guardarAccion} disabled={pendiente}>
                    <Save className="mr-1 size-3.5" />
                    Guardar acción
                  </Button>
                </div>
              </div>
            )}

            {/* Action Log de la sección */}
            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo="logistica-ventas"
              seccion={SECCION_FRESCURA}
              titulo="Frescura"
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
