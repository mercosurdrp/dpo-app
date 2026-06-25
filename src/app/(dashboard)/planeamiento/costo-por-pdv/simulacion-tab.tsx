"use client"

import { useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FlaskConical, Play, ArrowRight } from "lucide-react"
import { getCostoPorPdvSim, type CostoPorPdvRow } from "@/actions/costo-pdv"

const fmtMoney = (n: number) =>
  "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0))
const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)

// Distancias precargadas del escenario "CD San Nicolás" (km de ruta desde el CD).
// San Nicolás 8 = reparto local (es el CD en esta simulación); el resto, km de ruta.
const KM_DEFAULT: Record<string, number> = {
  "San Nicolás": 8,
  Ramallo: 32,
  Pergamino: 76,
  Arrecifes: 94,
  Colón: 131,
}

interface FilaCiudad {
  ciudad: string
  km: number | null
  pdv: number
  viajes: number
  hl: number
  almacen: number
  distancia: number
  distribucion: number
  total: number
  costo_x_hl: number
}

interface Props {
  /** Mes seleccionado en la pantalla (compartido con la solapa Detalle). */
  sel: { anio: number; mes: number } | null
  /** Filas REALES del mes (modelo vigente, CD Ramallo) para comparar $/HL por ciudad. */
  filasReales: CostoPorPdvRow[]
}

/** Agrega filas por PDV a un resumen por ciudad. */
function agregarPorCiudad(filas: CostoPorPdvRow[], km: Record<string, number>): FilaCiudad[] {
  const m = new Map<string, Omit<FilaCiudad, "km" | "costo_x_hl">>()
  // viajes reales por ciudad: (fecha+patente) no viene por PDV, pero el costo de
  // distancia de la ciudad ya está repartido; acá solo agregamos los totales por PDV.
  for (const f of filas) {
    const acc =
      m.get(f.ciudad) ??
      { ciudad: f.ciudad, pdv: 0, viajes: 0, hl: 0, almacen: 0, distancia: 0, distribucion: 0, total: 0 }
    acc.pdv++
    acc.hl += f.hl
    acc.almacen += f.costo_almacen
    acc.distancia += f.costo_distancia
    acc.distribucion += f.costo_distrib
    acc.total += f.costo_total
    m.set(f.ciudad, acc)
  }
  return [...m.values()]
    .map((a) => ({
      ...a,
      km: f_km(km, a.ciudad),
      costo_x_hl: a.hl ? a.total / a.hl : 0,
    }))
    .sort((x, y) => y.total - x.total)
}

function f_km(km: Record<string, number>, ciudad: string): number | null {
  return ciudad in km ? km[ciudad] : null
}

export function SimulacionTab({ sel, filasReales }: Props) {
  // Borrador editable de km por ciudad (precargado con el escenario CD San Nicolás).
  const [draft, setDraft] = useState<Record<string, number>>(KM_DEFAULT)
  const [filasSim, setFilasSim] = useState<CostoPorPdvRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // $/HL real por ciudad (modelo vigente, CD Ramallo) para la comparación lado a lado.
  const realPorCiudad = useMemo(() => {
    const m = new Map<string, { total: number; hl: number }>()
    for (const f of filasReales) {
      const acc = m.get(f.ciudad) ?? { total: 0, hl: 0 }
      acc.total += f.costo_total
      acc.hl += f.hl
      m.set(f.ciudad, acc)
    }
    const out = new Map<string, number>()
    for (const [c, d] of m) out.set(c, d.hl ? d.total / d.hl : 0)
    return out
  }, [filasReales])

  const ciudadesSim = useMemo(
    () => (filasSim ? agregarPorCiudad(filasSim, draft) : []),
    [filasSim, draft],
  )

  const totalSim = useMemo(
    () => (filasSim ? filasSim.reduce((s, f) => s + f.costo_total, 0) : 0),
    [filasSim],
  )
  const hlSim = useMemo(
    () => (filasSim ? filasSim.reduce((s, f) => s + f.hl, 0) : 0),
    [filasSim],
  )

  function recalcular() {
    if (!sel) return
    setError(null)
    // Snapshot de los km usados, para que la tabla refleje exactamente lo recalculado.
    const km = { ...draft }
    startTransition(async () => {
      const res = await getCostoPorPdvSim(sel.anio, sel.mes, km)
      if ("error" in res) {
        setError(res.error)
        setFilasSim(null)
        return
      }
      setFilasSim(res.data)
    })
  }

  return (
    <div className="space-y-6">
      {/* Aviso: es una simulación */}
      <Card className="border-l-4 border-l-violet-500 bg-violet-50/50">
        <CardContent className="flex items-start gap-3 pt-6">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-violet-900">
              Simulación — no afecta los datos reales
            </p>
            <p className="mt-1">
              Recalcula el modelo de costo logístico como si el centro de distribución fuera{" "}
              <strong>San Nicolás</strong> (u otro), con las distancias que cargues acá. Los viajes
              reales, el $/km de la flota y el reparto son los mismos del modelo vigente; lo único
              que cambia son los <strong>km por ciudad</strong>. <strong>No se guarda nada</strong>:
              la tabla <code>costo_km_ciudad</code> y la pantalla de Detalle siguen mostrando el
              modelo real (CD Ramallo).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inputs de distancia por ciudad */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distancias del escenario (km por ciudad)</CardTitle>
        </CardHeader>
        <CardContent>
          {!sel ? (
            <p className="py-6 text-center text-muted-foreground">
              Elegí un mes en la solapa Detalle para poder simular.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {Object.keys(KM_DEFAULT).map((ciudad) => (
                  <div key={ciudad} className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">
                      {ciudad}
                      {ciudad === "San Nicolás" ? " (CD)" : ""}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={draft[ciudad] ?? 0}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [ciudad]: Number(e.target.value) }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <strong>San Nicolás</strong> es el CD en este escenario: su valor (8) es el reparto
                local. El resto son km de ruta desde San Nicolás. El total del mes igual cierra en
                Distribución + Almacén; lo que cambia es <em>cómo</em> se reparte entre ciudades.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={recalcular} disabled={isPending}>
                  <Play className="h-4 w-4" />
                  {isPending ? "Recalculando…" : "Recalcular"}
                </Button>
                {error && <span className="text-sm text-red-600">{error}</span>}
                {filasSim && !isPending && (
                  <span className="text-xs text-muted-foreground">
                    {fmtNum(filasSim.length)} PDV · Total {fmtMoney(totalSim)} · $/HL global{" "}
                    {fmtMoney(hlSim ? totalSim / hlSim : 0)}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Resultado por ciudad */}
      {filasSim && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado simulado por ciudad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">km</TableHead>
                    <TableHead className="text-right">PDV</TableHead>
                    <TableHead className="text-right">HL</TableHead>
                    <TableHead className="text-right">Almacén</TableHead>
                    <TableHead className="text-right">Distancia</TableHead>
                    <TableHead className="text-right">Distribución</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">$/HL sim</TableHead>
                    <TableHead className="text-right">$/HL real (CD Ramallo)</TableHead>
                    <TableHead className="text-right">Δ $/HL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ciudadesSim.map((c) => {
                    const real = realPorCiudad.get(c.ciudad) ?? 0
                    const delta = c.costo_x_hl - real
                    return (
                      <TableRow key={c.ciudad}>
                        <TableCell className="font-medium">{c.ciudad}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {c.km !== null ? `${fmtNum(c.km)} km` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(c.pdv)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(c.hl, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(c.almacen)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(c.distancia)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(c.distribucion)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtMoney(c.total)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtMoney(c.costo_x_hl)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(real)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={
                              delta < -0.5
                                ? "font-medium text-green-600"
                                : delta > 0.5
                                  ? "font-medium text-red-600"
                                  : "text-muted-foreground"
                            }
                          >
                            {delta > 0 ? "+" : ""}
                            {fmtMoney(delta)}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Total */}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(ciudadesSim.reduce((s, c) => s + c.pdv, 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(hlSim, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(ciudadesSim.reduce((s, c) => s + c.almacen, 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(ciudadesSim.reduce((s, c) => s + c.distancia, 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(ciudadesSim.reduce((s, c) => s + c.distribucion, 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(totalSim)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(hlSim ? totalSim / hlSim : 0)}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              El <strong>Δ $/HL</strong> compara el costo por litro de cada ciudad en el escenario
              simulado contra el modelo real (CD Ramallo). Verde = más barato de servir con este CD;
              rojo = más caro.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
