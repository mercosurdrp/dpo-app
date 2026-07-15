"use client"

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertTriangle, Truck, Scissors, Clock, ShieldCheck, PackageX, Info, Eye, Printer } from "lucide-react"
import { toast } from "sonner"
import { registrarCorte, type PriorizacionData, type VrlMes } from "@/actions/priorizacion-entrega"
import { CLUSTER_LABELS } from "@/actions/clusterizacion-tipos"
import type { FilaPriorizada } from "@/lib/priorizacion/score"

const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })

/** Fila ya resuelta (entra/sale) que se muestra en la tabla. */
type FilaVista = FilaPriorizada & { entra: boolean; cae_por_volumen: boolean }

/** Criterios de orden dentro de cada ciudad. */
type Orden = "reprogramar" | "bultos_desc" | "bultos_asc" | "score" | "score_bultos"
const ORDENES: { id: Orden; label: string }[] = [
  { id: "reprogramar", label: "A reprogramar primero" },
  { id: "score", label: "Prioridad (score)" },
  { id: "score_bultos", label: "Score + bultos" },
  { id: "bultos_desc", label: "Bultos ↓" },
  { id: "bultos_asc", label: "Bultos ↑" },
]

/** Ordena una copia de las filas según el criterio elegido. NO altera el corte. */
function ordenarFilas(filas: FilaVista[], orden: Orden): FilaVista[] {
  const arr = [...filas]
  switch (orden) {
    case "bultos_desc":
      return arr.sort((a, b) => b.bultos - a.bultos)
    case "bultos_asc":
      return arr.sort((a, b) => a.bultos - b.bultos)
    case "score":
      return arr // ya viene en orden de prioridad (score desc)
    case "score_bultos":
      // Combinado: primero por score, y a igualdad de peso, el de más bultos.
      return arr.sort((a, b) => b.score - a.score || b.bultos - a.bultos)
    case "reprogramar":
    default:
      // Los que se caen ARRIBA, y entre ellos el de más bultos primero.
      return arr.sort((a, b) => {
        const af = a.entra ? 1 : 0
        const bf = b.entra ? 1 : 0
        if (af !== bf) return af - bf
        return b.bultos - a.bultos
      })
  }
}

/** Color del RMD (1-5): verde ok, rojo el que puntúa bajo. null = sin dato. */
function colorRmd(v: number | null): string {
  if (v === null) return "text-muted-foreground"
  if (v >= 4.5) return "text-emerald-700"
  if (v >= 4) return "text-amber-700"
  return "text-red-700 font-semibold"
}

/** Color del comportamiento: verde impecable → rojo el que hace perder el viaje. */
function colorComportamiento(c: number): string {
  if (c >= 95) return "bg-emerald-100 text-emerald-800"
  if (c >= 80) return "bg-lime-100 text-lime-800"
  if (c >= 60) return "bg-amber-100 text-amber-800"
  if (c >= 40) return "bg-orange-100 text-orange-800"
  return "bg-red-100 text-red-800"
}

export function PriorizacionClient({ data, vrl }: { data: PriorizacionData; vrl: VrlMes[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  /** Cupo de bultos por ciudad. Vacío = no hay corte: entran todos. */
  const [cupos, setCupos] = useState<Record<string, string>>({})
  /** Clientes que el usuario sacó/rescató a mano (override de la línea). */
  const [forzados, setForzados] = useState<Record<number, "entra" | "sale">>({})
  /** Orden de la tabla dentro de cada ciudad. */
  const [orden, setOrden] = useState<Orden>("reprogramar")
  /** Vista previa de los reprogramados (modal) antes de imprimir. */
  const [preview, setPreview] = useState(false)
  /** Para portalizar el PDF sólo en cliente. */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const setCupo = (ciudad: string, v: string) =>
    setCupos((p) => ({ ...p, [ciudad]: v }))

  /** Aplica el cupo de cada ciudad + los overrides manuales. */
  const ciudades = useMemo(() => {
    return data.ciudades.map((c) => {
      const cupo = Number(cupos[c.ciudad] ?? "")
      const hayCupo = Number.isFinite(cupo) && cupo > 0
      let acum = 0
      // 🚨 El corte (entra/sale) se resuelve SIEMPRE en orden de prioridad (score),
      //    sin importar cómo después se ordene la tabla en pantalla.
      const filas: FilaVista[] = c.filas.map((f) => {
        const forzado = forzados[f.id_cliente]
        let entra = !hayCupo || f.intocable
        if (hayCupo && !f.intocable) entra = acum + f.bultos <= cupo
        if (forzado) entra = forzado === "entra"
        if (entra) acum += f.bultos
        const cae_por_volumen =
          hayCupo && !entra && !forzado && f.comportamiento >= 80 && f.bultos > cupo * 0.1
        return { ...f, entra, cae_por_volumen }
      })
      const dentro = filas.filter((f) => f.entra)
      const fuera = filas.filter((f) => !f.entra)
      return {
        ...c, filas, hayCupo, cupo,
        bultos_dentro: dentro.reduce((a, f) => a + f.bultos, 0),
        cortados: fuera.length,
        bultos_cortados: fuera.reduce((a, f) => a + f.bultos, 0),
        hl_cortados: fuera.reduce((a, f) => a + f.hl, 0),
        monto_cortado: fuera.reduce((a, f) => a + f.monto, 0),
      }
    })
  }, [data.ciudades, cupos, forzados])

  const totalCortados = ciudades.reduce((a, c) => a + c.cortados, 0)
  const hayAlgunCupo = ciudades.some((c) => c.hayCupo)

  /** Reprogramados agrupados por ciudad, para el PDF (más bultos arriba). */
  const grupos = useMemo(
    () =>
      ciudades
        .map((c) => ({
          ciudad: c.ciudad,
          filas: c.filas.filter((f) => !f.entra).sort((a, b) => b.bultos - a.bultos),
          bultos: c.bultos_cortados,
          hl: c.hl_cortados,
          monto: c.monto_cortado,
        }))
        .filter((g) => g.filas.length),
    [ciudades],
  )

  /** VRL que se generaría con el corte actual (todavía sin registrar). */
  const vrlHoy = useMemo(() => ({
    bultos: ciudades.reduce((a, c) => a + c.bultos_cortados, 0),
    hl: ciudades.reduce((a, c) => a + c.hl_cortados, 0),
    monto: ciudades.reduce((a, c) => a + c.monto_cortado, 0),
  }), [ciudades])

  /** VRL ya registrado del mes de la fecha de entrega (acumulado). */
  const mesActual = data.fecha_entrega.slice(0, 7)
  const vrlMes = vrl.find((v) => v.anio_mes === mesActual) ??
    { anio_mes: mesActual, pedidos_reprogramados: 0, clientes: 0, bultos: 0, hl: 0, monto: 0 }

  const guardar = () => {
    const cortados = ciudades.flatMap((c) =>
      c.filas.filter((f) => !f.entra).map((f) => ({
        id_cliente: f.id_cliente,
        nombre_cliente: f.nombre,
        localidad: f.localidad,
        bultos: f.bultos,
        hl: f.hl,
        monto: f.monto,
        score: f.score,
        posicion: f.posicion,
        comportamiento: f.comportamiento,
        cluster: f.cluster,
        veces_previas: f.veces_pospuesto,
        motivo: forzados[f.id_cliente] === "sale" ? "manual" : f.cae_por_volumen ? "volumen" : "cupo",
      })),
    )
    if (cortados.length === 0) {
      toast.error("No hay clientes cortados para registrar.")
      return
    }
    startTransition(async () => {
      const r = await registrarCorte(data.fecha_entrega, cortados)
      if ("error" in r) toast.error(r.error)
      else {
        toast.success(
          `Corte registrado: ${r.data.registrados} clientes reprogramados. Mañana suben en el ranking.`,
        )
        router.refresh()
      }
    })
  }

  const ciudadInicial = ciudades[0]?.ciudad ?? ""

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-6 w-6" /> Priorización de Entrega
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedidos a entregar el <strong>{data.fecha_entrega}</strong> — se rutea y prepara hoy.
            Cargá los bultos del camión de cada ciudad: <strong>se reprograma lo de menor prioridad</strong>.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Fecha de entrega</label>
            <Input
              type="date"
              defaultValue={data.fecha_entrega}
              className="w-40"
              onChange={(e) => e.target.value && router.push(`?fecha=${e.target.value}`)}
            />
          </div>
          <Button onClick={guardar} disabled={pending || totalCortados === 0}>
            <Scissors className="mr-1 h-4 w-4" />
            {pending ? "Guardando…" : `Registrar corte (${totalCortados})`}
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Pedidos del día</p>
          <p className="text-2xl font-bold">{data.total_clientes}</p>
          <p className="text-xs text-muted-foreground">{data.total_bultos.toLocaleString("es-AR")} bultos · {money(data.total_monto)}</p>
        </CardContent></Card>
        <Card className={totalCortados ? "border-red-200" : ""}><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">VRL a reprogramar hoy</p>
          <p className={`text-2xl font-bold ${totalCortados ? "text-red-600" : ""}`}>
            {vrlHoy.bultos.toLocaleString("es-AR")} <span className="text-sm font-normal">bultos</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {hayAlgunCupo
              ? `${vrlHoy.hl.toFixed(1)} HL · ${totalCortados} clientes · ${money(vrlHoy.monto)}`
              : "cargá el cupo de cada ciudad"}
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Ya venían pospuestos</p>
          <p className="text-2xl font-bold text-amber-600">{data.pospuestos}</p>
          <p className="text-xs text-muted-foreground">suben en el ranking</p>
        </CardContent></Card>
        <Card className="border-slate-300 bg-slate-50"><CardContent className="pt-4">
          <p className="text-xs font-medium text-slate-700">VRL acumulado {mesActual}</p>
          <p className="text-2xl font-bold text-slate-900">
            {vrlMes.bultos.toLocaleString("es-AR")} <span className="text-sm font-normal">bultos</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {vrlMes.hl.toFixed(1)} HL · {vrlMes.pedidos_reprogramados} pedidos · {money(vrlMes.monto)}
          </p>
        </CardContent></Card>
      </div>

      {/* Metodología */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="pt-4 text-xs text-slate-600 space-y-1">
          <p className="flex items-center gap-1 font-medium text-slate-800">
            <Info className="h-3.5 w-3.5" /> Cómo se decide el corte
          </p>
          <p>
            <strong>Score = 50% comportamiento + 35% importancia del cliente + 15% valor del pedido</strong>,
            más {data.pesos.puntos_por_postergacion} puntos por cada vez que ya se le pospuso. El corte se
            decide con el score; el orden de la tabla es sólo para leerla más cómodo.
          </p>
          <p>
            <strong>Comportamiento</strong> = entregas rechazadas <em>por causa del cliente</em> (sin dinero,
            cerrado, sin envases) sobre sus entregas reales de {data.desde} a {data.hasta}. Los rechazos por
            falla nuestra (error de preventa, distribución, sin stock) <strong>no cuentan</strong>.
          </p>
          <p>
            <strong>RMD y NPS no suman puntos</strong> —se midieron y no discriminan: el RMD promedia 4,97
            (0,2% de notas bajas) y el NPS cubre el 17% de los clientes. Se muestran como bandera en la fila.
          </p>
          <p>
            La bandera <strong>“Rechazó hace poco”</strong> marca al cliente que rechazó por su culpa en los
            <strong> últimos 45 días</strong> (señal reciente). No cambia el score: el comportamiento se mide
            sobre la ventana larga de <strong>180 días</strong>, porque a 45 casi no hay señal.
          </p>
          <p>
            A las <strong>{data.pesos.pospuesto_intocable} postergaciones</strong> el cliente pasa a
            INTOCABLE: entra sí o sí, no compite. Es lo que evita postergar siempre al mismo.
          </p>
        </CardContent>
      </Card>

      {/* Barra de orden + PDF */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ordenar por</span>
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            {ORDENES.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrden(o.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  orden === o.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={totalCortados === 0}
          onClick={() => setPreview(true)}
        >
          <Eye className="mr-1 h-4 w-4" />
          Ver reprogramados ({totalCortados})
        </Button>
      </div>

      {/* Solapas por ciudad */}
      {ciudadInicial && (
        <Tabs defaultValue={ciudadInicial} className="w-full">
          <TabsList className="h-auto flex-wrap justify-start">
            {ciudades.map((c) => (
              <TabsTrigger key={c.ciudad} value={c.ciudad} className="flex-none gap-1.5">
                {c.ciudad}
                {c.hayCupo && c.cortados > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-100 px-1 text-[10px] font-bold text-red-700">
                    {c.cortados}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {ciudades.map((c) => {
            const filasVista = ordenarFilas(c.filas, orden)
            return (
              <TabsContent key={c.ciudad} value={c.ciudad} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-slate-900">{c.ciudad}</strong> · {c.clientes} clientes ·{" "}
                    {c.bultos.toLocaleString("es-AR")} bultos · {c.hl.toFixed(1)} HL · {money(c.monto)}
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Bultos del camión</label>
                    <Input
                      type="number" min={0} placeholder="sin límite" className="w-32"
                      value={cupos[c.ciudad] ?? ""}
                      onChange={(e) => setCupo(c.ciudad, e.target.value)}
                    />
                    {c.hayCupo && (
                      <Badge variant={c.cortados ? "destructive" : "secondary"}>
                        {c.cortados
                          ? `${c.cortados} se caen · VRL ${c.bultos_cortados} bultos / ${c.hl_cortados.toFixed(1)} HL`
                          : "entran todos"}
                      </Badge>
                    )}
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Clase</TableHead>
                      <TableHead className="text-right">Bultos</TableHead>
                      <TableHead className="text-right">HL</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-center">Comportamiento</TableHead>
                      <TableHead className="text-center">RMD</TableHead>
                      <TableHead>Por qué</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filasVista.map((f, i) => {
                      const anterior = filasVista[i - 1]
                      // La línea de corte sólo tiene sentido cuando la tabla va en
                      // orden de prioridad: ahí el corte es contiguo.
                      const cruzaLinea =
                        orden === "score" && c.hayCupo && anterior?.entra && !f.entra
                      return (
                        <Fila
                          key={f.id_cliente}
                          f={f}
                          hayCupo={c.hayCupo}
                          cruzaLinea={cruzaLinea}
                          cupo={c.cupo}
                          onForzar={(modo) =>
                            setForzados((p) => ({ ...p, [f.id_cliente]: modo }))
                          }
                        />
                      )
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            )
          })}
        </Tabs>
      )}

      {/* Vista previa en pantalla de los reprogramados (con opción de imprimir) */}
      <ReprogramadosPreview
        open={preview}
        onOpenChange={setPreview}
        fecha={data.fecha_entrega}
        grupos={grupos}
        total={{ ...vrlHoy, clientes: totalCortados }}
      />

      {/* PDF imprimible de reprogramados (oculto en pantalla) */}
      {mounted && totalCortados > 0 &&
        createPortal(
          <ReprogramadosPrint
            fecha={data.fecha_entrega}
            grupos={grupos}
            total={{ ...vrlHoy, clientes: totalCortados }}
          />,
          document.body,
        )}
    </div>
  )
}

/** Modal de vista previa de los clientes reprogramados, legible en pantalla. */
function ReprogramadosPreview({
  open, onOpenChange, fecha, grupos, total,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fecha: string
  grupos: { ciudad: string; filas: FilaVista[]; bultos: number; hl: number; monto: number }[]
  total: { bultos: number; hl: number; monto: number; clientes: number }
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[95vw] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-red-600" />
            Clientes a reprogramar — {fecha}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm">
          <span className="font-semibold text-red-700">{total.clientes} clientes</span>
          <span className="text-muted-foreground">
            {" · "}{total.bultos.toLocaleString("es-AR")} bultos · {total.hl.toFixed(1)} HL · {money(total.monto)}
          </span>
        </div>

        {grupos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay clientes reprogramados. Cargá el cupo de cada ciudad para ver el corte.
          </p>
        ) : (
          <div className="space-y-5">
            {grupos.map((g) => (
              <div key={g.ciudad}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1 border-b pb-1">
                  <h3 className="text-base font-semibold text-slate-900">{g.ciudad}</h3>
                  <span className="text-xs text-muted-foreground">
                    {g.filas.length} clientes · {g.bultos.toLocaleString("es-AR")} bultos ·{" "}
                    {g.hl.toFixed(1)} HL · {money(g.monto)}
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localidad</TableHead>
                      <TableHead className="text-right">Bultos</TableHead>
                      <TableHead className="text-right">HL</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.filas.map((f) => (
                      <TableRow key={f.id_cliente}>
                        <TableCell className="text-xs text-muted-foreground">{f.posicion}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {f.nombre ?? `Cliente ${f.id_cliente}`}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">#{f.id_cliente}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.localidad ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{f.bultos}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{f.hl.toFixed(1)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{money(f.monto)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold">{f.score.toFixed(0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {f.cae_por_volumen
                            ? "Por volumen"
                            : f.rechazos_45d > 0
                              ? `Rechazó hace poco ×${f.rechazos_45d}`
                              : f.motivos || "menor prioridad"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            El corte se decide por score. “Imprimir” abre el diálogo para guardarlo como PDF.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={() => window.print()} disabled={grupos.length === 0}>
              <Printer className="mr-1 h-4 w-4" /> Imprimir / Guardar PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Fila({
  f, hayCupo, cruzaLinea, cupo, onForzar,
}: {
  f: FilaVista
  hayCupo: boolean
  cruzaLinea: boolean
  cupo: number
  onForzar: (modo: "entra" | "sale") => void
}) {
  return (
    <>
      {cruzaLinea && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={11} className="p-0">
            <div className="flex items-center gap-2 border-t-2 border-dashed border-red-400 py-1.5 text-xs font-semibold text-red-600">
              <Scissors className="h-3.5 w-3.5" />
              LÍNEA DE CORTE — de acá para abajo se reprograma ({cupo} bultos de camión)
            </div>
          </TableCell>
        </TableRow>
      )}
      <TableRow className={f.entra ? "" : "bg-red-50/60 opacity-90"}>
        <TableCell className="text-xs text-muted-foreground">{f.posicion}</TableCell>
        <TableCell>
          <div className="font-medium text-sm">{f.nombre ?? `Cliente ${f.id_cliente}`}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            #{f.id_cliente}
            {f.nps_categoria === "Detractor" && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] text-red-700">Detractor</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs">{f.cluster ? CLUSTER_LABELS[f.cluster] : "—"}</TableCell>
        <TableCell className="text-right text-sm tabular-nums">{f.bultos}</TableCell>
        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{f.hl.toFixed(1)}</TableCell>
        <TableCell className="text-right text-sm tabular-nums">{money(f.monto)}</TableCell>
        <TableCell className="text-center">
          <Tooltip>
            <TooltipTrigger
              render={
              <Badge className={`${colorComportamiento(f.comportamiento)} border-0 tabular-nums`}>
                {f.comportamiento.toFixed(0)}
              </Badge>
              }
            />
            <TooltipContent>
              {f.entregas > 0
                ? `${f.rechazos} entregas rechazadas por su culpa sobre ${f.entregas} entregas (${(f.tasa_rechazo * 100).toFixed(0)}%) — ventana de 180 días`
                : "Sin historia de entregas en la ventana"}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="text-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className={`text-sm tabular-nums ${colorRmd(f.rmd_prom)}`}>
                  {f.rmd_prom !== null ? f.rmd_prom.toFixed(1) : "—"}
                </span>
              }
            />
            <TooltipContent>
              {f.rmd_prom !== null
                ? `RMD promedio ${f.rmd_prom.toFixed(2)} (bandera, no suma al score)`
                : "Sin RMD cargado"}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          <div className="flex flex-col gap-0.5">
            {f.rechazos_45d > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge className="w-fit border-0 bg-red-100 text-red-800">
                      <Clock className="mr-0.5 h-3 w-3" /> Rechazó hace poco ×{f.rechazos_45d}
                    </Badge>
                  }
                />
                <TooltipContent>
                  Rechazó por su culpa {f.rechazos_45d} vez/veces en los últimos 45 días.
                </TooltipContent>
              </Tooltip>
            )}
            <span>{f.motivos || (f.entregas > 0 ? `sin rechazos · ${f.entregas} entregas` : "cliente nuevo")}</span>
          </div>
        </TableCell>
        <TableCell className="text-right text-sm font-semibold tabular-nums">{f.score.toFixed(0)}</TableCell>
        <TableCell className="text-center">
          <div className="flex items-center justify-center gap-1">
            {hayCupo && !f.entra && (
              <Badge className="border-0 bg-red-600 text-white">Fuera</Badge>
            )}
            {f.intocable && (
              <Tooltip>
                <TooltipTrigger
                  render={
                  <Badge className="border-0 bg-blue-100 text-blue-800">
                    <ShieldCheck className="mr-0.5 h-3 w-3" /> Intocable
                  </Badge>
                  }
                />
                <TooltipContent>Ya se le pospuso {f.veces_pospuesto} veces: entra sí o sí.</TooltipContent>
              </Tooltip>
            )}
            {!f.intocable && f.veces_pospuesto > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                  <Badge variant="outline" className="text-amber-700">
                    <Clock className="mr-0.5 h-3 w-3" /> +{f.veces_pospuesto}
                  </Badge>
                  }
                />
                <TooltipContent>Ya se le pospuso {f.veces_pospuesto} vez/veces: sube en el ranking.</TooltipContent>
              </Tooltip>
            )}
            {f.cae_por_volumen && (
              <Tooltip>
                <TooltipTrigger
                  render={
                  <Badge className="border-0 bg-purple-100 text-purple-800">
                    <AlertTriangle className="mr-0.5 h-3 w-3" /> Por volumen
                  </Badge>
                  }
                />
                <TooltipContent>
                  Se porta bien y tiene score alto: cae sólo porque el pedido ({f.bultos} bultos) no
                  entra en lo que queda del camión. No es un juicio sobre el cliente.
                </TooltipContent>
              </Tooltip>
            )}
            {f.reincidente && !f.entra && (
              <Tooltip>
                <TooltipTrigger
                  render={
                  <Badge className="border-0 bg-red-100 text-red-800">
                    <PackageX className="mr-0.5 h-3 w-3" /> Reincidente
                  </Badge>
                  }
                />
                <TooltipContent>Rechazó {f.rechazos} entregas por su culpa en la ventana.</TooltipContent>
              </Tooltip>
            )}
            <Button
              size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]"
              onClick={() => onForzar(f.entra ? "sale" : "entra")}
            >
              {f.entra ? "sacar" : "subir"}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </>
  )
}

/** Listado imprimible de los clientes que se reprograman (VRL del día). */
function ReprogramadosPrint({
  fecha, grupos, total,
}: {
  fecha: string
  grupos: { ciudad: string; filas: FilaVista[]; bultos: number; hl: number; monto: number }[]
  total: { bultos: number; hl: number; monto: number; clientes: number }
}) {
  return (
    <>
      <style>{`
        @media print {
          body > *:not(#print-reprogramados) { display: none !important; }
          #print-reprogramados { display: block !important; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
      <div
        id="print-reprogramados"
        className="hidden"
        style={{ color: "#111", fontFamily: "system-ui, sans-serif", fontSize: 11 }}
      >
        <div style={{ borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Volumen Reprogramado Logístico (VRL)</div>
          <div style={{ fontSize: 12 }}>
            Clientes reprogramados para la entrega del <strong>{fecha}</strong>
          </div>
          <div style={{ fontSize: 12, marginTop: 2 }}>
            Total: <strong>{total.clientes}</strong> clientes ·{" "}
            <strong>{total.bultos.toLocaleString("es-AR")}</strong> bultos ·{" "}
            <strong>{total.hl.toFixed(1)}</strong> HL · {money(total.monto)}
          </div>
        </div>

        {grupos.map((g) => (
          <div key={g.ciudad} style={{ marginBottom: 14, breakInside: "avoid" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {g.ciudad}
              <span style={{ fontWeight: 400, fontSize: 11 }}>
                {" "}— {g.filas.length} clientes · {g.bultos.toLocaleString("es-AR")} bultos ·{" "}
                {g.hl.toFixed(1)} HL · {money(g.monto)}
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: "#eee" }}>
                  {["#", "Cliente", "Localidad", "Bultos", "HL", "Monto", "Score", "Comp.", "RMD", "45d", "Posp.", "Motivo"].map(
                    (h, i) => (
                      <th
                        key={h}
                        style={{
                          border: "1px solid #bbb",
                          padding: "3px 5px",
                          textAlign: i >= 3 && i <= 10 ? "right" : "left",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr key={f.id_cliente}>
                    <td style={cell()}>{f.posicion}</td>
                    <td style={cell()}>
                      {f.nombre ?? `Cliente ${f.id_cliente}`}{" "}
                      <span style={{ color: "#666" }}>#{f.id_cliente}</span>
                    </td>
                    <td style={cell()}>{f.localidad ?? "—"}</td>
                    <td style={cell("right")}>{f.bultos}</td>
                    <td style={cell("right")}>{f.hl.toFixed(1)}</td>
                    <td style={cell("right")}>{money(f.monto)}</td>
                    <td style={cell("right")}>{f.score.toFixed(0)}</td>
                    <td style={cell("right")}>{f.comportamiento.toFixed(0)}</td>
                    <td style={cell("right")}>{f.rmd_prom !== null ? f.rmd_prom.toFixed(1) : "—"}</td>
                    <td style={cell("right")}>{f.rechazos_45d || "—"}</td>
                    <td style={cell("right")}>{f.veces_pospuesto || "—"}</td>
                    <td style={cell()}>
                      {f.cae_por_volumen ? "Por volumen" : f.motivos || "menor prioridad"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ marginTop: 10, fontSize: 9, color: "#666" }}>
          Generado desde Priorización de Entrega · dpo-app · El corte se decide por score (50%
          comportamiento + 35% importancia + 15% valor). Los rechazos por falla interna no cuentan.
          <br />
          <strong>Comp.</strong> = comportamiento (rechazos por su culpa en 180 días). <strong>45d</strong> =
          rechazos por su culpa en los últimos 45 días. <strong>RMD</strong> y NPS son banderas: no suman al score.
        </div>
      </div>
    </>
  )
}

function cell(align: "left" | "right" = "left"): CSSProperties {
  return { border: "1px solid #ccc", padding: "3px 5px", textAlign: align }
}
