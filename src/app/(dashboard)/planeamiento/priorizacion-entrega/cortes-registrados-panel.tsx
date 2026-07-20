"use client"

/**
 * LA FOTO DEL CORTE, mes por mes.
 *
 * El ranking de la pantalla se arma con los pedidos PENDIENTES de Chess, que para
 * una fecha pasada ya no existen: el día después del corte no quedaba forma de ver
 * a quién se dejó abajo. Acá se lee `entrega_cortes`, que sí guarda esa foto.
 *
 * Navega por mes (no por la fecha de la pantalla) justamente para poder mirar
 * meses cerrados: en agosto se consulta julio sin tener que adivinar qué día tuvo
 * corte — la lista de días la arma la vista `v_vrl_diario`.
 */

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft, ChevronRight, Camera, Download, Loader2, AlertTriangle, User, Clock,
} from "lucide-react"
import { toast } from "sonner"
import {
  getCortesDiarios,
  getCorteDelDia,
  type CorteDia,
  type CorteRegistrado,
} from "@/actions/priorizacion-entrega"
import { ciudadDeLocalidad } from "@/lib/priorizacion/score"

const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/** "2026-07" → "julio 2026" */
function nombreMes(anioMes: string): string {
  const [y, m] = anioMes.split("-").map((s) => parseInt(s, 10))
  return `${MESES[m - 1]} ${y}`
}

/** Corre un YYYY-MM N meses (sin Date, para no pelear con zonas horarias). */
function correrMes(anioMes: string, delta: number): string {
  const [y, m] = anioMes.split("-").map((s) => parseInt(s, 10))
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

/** "2026-07-20" → "lun 20/07" */
function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  const dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()]
  const [, m, dd] = fecha.split("-")
  return `${dia} ${dd}/${m}`
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function CortesRegistradosPanel({ mesInicial }: { mesInicial: string }) {
  const [mes, setMes] = useState(mesInicial)
  const [dias, setDias] = useState<CorteDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [detalle, setDetalle] = useState<CorteRegistrado | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [bajandoPdf, setBajandoPdf] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError(null)
    getCortesDiarios(mes).then((res) => {
      if (!vigente) return
      if ("error" in res) {
        setError(res.error)
        setDias([])
      } else {
        setDias(res.data)
      }
      setCargando(false)
    })
    return () => {
      vigente = false
    }
  }, [mes])

  const abrirDia = useCallback((fecha: string) => {
    setCargandoDetalle(true)
    getCorteDelDia(fecha).then((res) => {
      setCargandoDetalle(false)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setDetalle(res.data)
    })
  }, [])

  /** Regenera el PDF desde la foto guardada, con el mismo endpoint del corte del día. */
  const bajarPdf = useCallback(async (corte: CorteRegistrado) => {
    setBajandoPdf(true)
    try {
      // El PDF agrupa por CIUDAD, no por localidad: la foto guarda la localidad de
      // cada cliente y hay que reagruparla con el mismo alias de la pantalla, o
      // Ramallo y Villa Ramallo (que viajan en el mismo camión) salen separadas.
      const porLocalidad = new Map<string, typeof corte.filas>()
      for (const f of corte.filas) {
        const k = ciudadDeLocalidad(f.localidad)
        const prev = porLocalidad.get(k)
        if (prev) prev.push(f)
        else porLocalidad.set(k, [f])
      }
      const grupos = [...porLocalidad.entries()].map(([ciudad, filas]) => ({
        ciudad,
        filas: filas.map((f) => ({
          id_cliente: f.id_cliente,
          nombre: f.nombre_cliente,
          localidad: f.localidad,
          bultos: f.bultos,
          hl: f.hl,
          monto: f.monto,
          score: f.score,
          comportamiento: f.comportamiento,
          // La foto no guarda RMD ni rechazos recientes: son señales del día del
          // corte que no se snapshotearon. Van vacías en vez de inventadas.
          rmd_prom: null,
          rechazos_45d: 0,
          veces_pospuesto: f.veces_previas,
          posicion: f.posicion,
          motivo: f.motivo,
        })),
        bultos: filas.reduce((s, f) => s + f.bultos, 0),
        hl: filas.reduce((s, f) => s + f.hl, 0),
        monto: filas.reduce((s, f) => s + f.monto, 0),
      }))

      const res = await fetch("/api/planeamiento/priorizacion-entrega/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: corte.fecha,
          nota: corte.nota ?? "",
          total: {
            clientes: corte.total_clientes,
            bultos: corte.total_bultos,
            hl: corte.total_hl,
            monto: corte.total_monto,
          },
          grupos,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "No se pudo generar el PDF.")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `reprogramados-${corte.fecha}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF.")
    } finally {
      setBajandoPdf(false)
    }
  }, [])

  const totalMes = dias.reduce(
    (acc, d) => ({
      pedidos: acc.pedidos + d.pedidos,
      bultos: acc.bultos + d.bultos,
      hl: acc.hl + d.hl,
      monto: acc.monto + d.monto,
    }),
    { pedidos: 0, bultos: 0, hl: 0, monto: 0 },
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setMes(correrMes(mes, -1))}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Mes anterior</span>
          </Button>
          <span className="min-w-40 text-center text-sm font-medium capitalize">
            {nombreMes(mes)}
          </span>
          <Button variant="outline" size="icon" onClick={() => setMes(correrMes(mes, 1))}>
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Mes siguiente</span>
          </Button>
        </div>
        {dias.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {dias.length} día{dias.length === 1 ? "" : "s"} con corte ·{" "}
            {totalMes.pedidos.toLocaleString("es-AR")} pedidos ·{" "}
            {totalMes.bultos.toLocaleString("es-AR")} bultos · {totalMes.hl.toFixed(1)} HL ·{" "}
            {money(totalMes.monto)}
          </p>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {cargando ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando cortes de{" "}
          {nombreMes(mes)}…
        </p>
      ) : dias.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No hay cortes registrados en {nombreMes(mes)}.
          <br />
          <span className="text-xs">
            El registro del VRL arrancó el 20/07/2026: antes de esa fecha los cortes
            no se guardaban, así que un mes vacío no significa que no se haya cortado.
          </span>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Día de entrega</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">Bultos</TableHead>
                <TableHead className="text-right">HL</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dias.map((d) => (
                <TableRow
                  key={d.fecha}
                  className="cursor-pointer"
                  onClick={() => abrirDia(d.fecha)}
                >
                  <TableCell className="font-medium">{fechaCorta(d.fecha)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.clientes}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.bultos.toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.hl.toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(d.monto)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled={cargandoDetalle}>
                      <Camera className="mr-1 h-3.5 w-3.5" /> Ver el corte
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={detalle != null} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent
          showExpandButton
          className="max-h-[92vh] w-[96vw] max-w-[min(1600px,96vw)] overflow-y-auto sm:max-w-[min(1600px,96vw)]"
        >
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Clientes reprogramados — entrega del {fechaCorta(detalle.fecha)}
                </DialogTitle>
                <DialogDescription>
                  {detalle.total_clientes} clientes ·{" "}
                  {detalle.total_bultos.toLocaleString("es-AR")} bultos ·{" "}
                  {detalle.total_hl.toFixed(1)} HL · {money(detalle.total_monto)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {detalle.cortado_por && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {detalle.cortado_por}
                  </span>
                )}
                {detalle.registrado_en && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> registrado el{" "}
                    {fechaHora(detalle.registrado_en)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={bajandoPdf}
                  onClick={() => bajarPdf(detalle)}
                >
                  {bajandoPdf ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5" />
                  )}
                  Descargar PDF
                </Button>
              </div>

              {detalle.nota && (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium">Nota del corte: </span>
                  {detalle.nota}
                </p>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localidad</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Bultos</TableHead>
                      <TableHead className="text-right">HL</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalle.filas.map((f) => (
                      <TableRow key={f.id_cliente}>
                        <TableCell className="font-medium">
                          {f.nombre_cliente ?? `Cliente ${f.id_cliente}`}
                          {f.veces_previas > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 border-red-300 bg-red-50 text-red-700"
                            >
                              ya pospuesto ×{f.veces_previas}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {f.localidad ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{f.motivo}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.bultos.toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.hl.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(f.monto)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.score.toFixed(0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
