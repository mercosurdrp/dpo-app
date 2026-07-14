"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Truck, Scissors, Clock, ShieldCheck, PackageX, Info } from "lucide-react"
import { toast } from "sonner"
import { registrarCorte, type PriorizacionData, type VrlMes } from "@/actions/priorizacion-entrega"
import { CLUSTER_LABELS } from "@/actions/clusterizacion-tipos"
import type { FilaPriorizada } from "@/lib/priorizacion/score"

const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })

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

  const setCupo = (ciudad: string, v: string) =>
    setCupos((p) => ({ ...p, [ciudad]: v }))

  /** Aplica el cupo de cada ciudad + los overrides manuales. */
  const ciudades = useMemo(() => {
    return data.ciudades.map((c) => {
      const cupo = Number(cupos[c.ciudad] ?? "")
      const hayCupo = Number.isFinite(cupo) && cupo > 0
      let acum = 0
      const filas = c.filas.map((f) => {
        const forzado = forzados[f.id_cliente]
        // Sin cupo cargado no se corta a nadie: la lista es sólo el orden.
        let entra = !hayCupo || f.intocable
        if (hayCupo && !f.intocable) entra = acum + f.bultos <= cupo
        if (forzado) entra = forzado === "entra"
        if (entra) acum += f.bultos
        // Score alto pero no entra SÓLO porque el pedido es grande: no es un juicio
        // sobre el cliente, es la mochila. Se marca aparte para que lo decida un humano.
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-6 w-6" /> Priorización de Entrega
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedidos a entregar el <strong>{data.fecha_entrega}</strong> — se rutea y prepara hoy.
            El orden es por ciudad: <strong>se corta desde abajo</strong> hasta donde alcance el camión.
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
            <Info className="h-3.5 w-3.5" /> Cómo se ordena
          </p>
          <p>
            <strong>Score = 50% comportamiento + 35% importancia del cliente + 15% valor del pedido</strong>,
            más {data.pesos.puntos_por_postergacion} puntos por cada vez que ya se le pospuso.
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
            A las <strong>{data.pesos.pospuesto_intocable} postergaciones</strong> el cliente pasa a
            INTOCABLE: entra sí o sí, no compite. Es lo que evita postergar siempre al mismo.
          </p>
        </CardContent>
      </Card>

      {/* Una tabla por ciudad */}
      {ciudades.map((c) => (
        <Card key={c.ciudad}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {c.ciudad}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {c.clientes} clientes · {c.bultos.toLocaleString("es-AR")} bultos · {c.hl.toFixed(1)} HL · {money(c.monto)}
                </span>
              </CardTitle>
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
          </CardHeader>
          <CardContent>
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
                  <TableHead>Por qué</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.filas.map((f, i) => {
                  const anterior = c.filas[i - 1]
                  const cruzaLinea = c.hayCupo && anterior?.entra && !f.entra
                  return (
                    <Fila
                      key={f.id_cliente}
                      f={f}
                      cruzaLinea={!!cruzaLinea}
                      cupo={c.cupo}
                      onForzar={(modo) =>
                        setForzados((p) => ({ ...p, [f.id_cliente]: modo }))
                      }
                    />
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Fila({
  f, cruzaLinea, cupo, onForzar,
}: {
  f: FilaPriorizada & { entra: boolean; cae_por_volumen: boolean }
  cruzaLinea: boolean
  cupo: number
  onForzar: (modo: "entra" | "sale") => void
}) {
  return (
    <>
      {cruzaLinea && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={10} className="p-0">
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
            {f.rmd_prom !== null && f.rmd_prom < 4.5 && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-700">RMD {f.rmd_prom.toFixed(1)}</Badge>
            )}
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
                ? `${f.rechazos} entregas rechazadas por su culpa sobre ${f.entregas} entregas (${(f.tasa_rechazo * 100).toFixed(0)}%)`
                : "Sin historia de entregas en la ventana"}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {f.motivos || (f.entregas > 0 ? `sin rechazos · ${f.entregas} entregas` : "cliente nuevo")}
        </TableCell>
        <TableCell className="text-right text-sm font-semibold tabular-nums">{f.score.toFixed(0)}</TableCell>
        <TableCell className="text-center">
          <div className="flex items-center justify-center gap-1">
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
