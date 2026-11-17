"use client"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Route, Scissors } from "lucide-react"
import type { VrlMes } from "@/actions/priorizacion-entrega"
import type { FueraRutaDia, FueraRutaRegistro, FueraRutaMes } from "@/actions/fuera-ruta"

const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })

/**
 * Registro de PEDIDOS FUERA DE RUTA del día: entregas fuera del recorrido
 * planificado. Hasta el 15/10/2026 las cargaba a mano logística en el sheet de
 * Novedades; desde el 16/10/2026 se detectan en Chess (entrega fuera del día
 * pactado del cliente). Ambas quedan en `fuera_ruta_registros`. No compiten por el cupo del camión:
 * son otro circuito, pero se controlan desde la misma pantalla del día.
 */
export function FueraRutaPanel({ fueraRuta }: { fueraRuta: FueraRutaDia }) {
  const { filas } = fueraRuta
  const esChess = fueraRuta.fuente === "chess"
  const entregadoFoto = fueraRuta.foto === "entregado"
  const nEntregados = filas.filter((f) => f.estado === "entregado" || f.estado === "entregado_sin_ruteo").length
  const nSinRuteo = filas.filter((f) => f.estado === "entregado_sin_ruteo").length
  const nNoSalio = fueraRuta.no_salieron
  const diasPactadosTxt = fueraRuta.dias_pactados_en
    ? ` · días pactados bajados el ${new Date(fueraRuta.dias_pactados_en).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}`
    : ""
  return (
    <div className="space-y-3">
      {!fueraRuta.fuente_ok && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {esChess
            ? (entregadoFoto
                ? "Chess no contestó al actualizar esta fecha: se muestra lo que dejó registrado el cierre diario de las 07:30."
                : "No se pudo consultar Chess: se muestra el último ruteo guardado, que puede estar desactualizado para esta fecha.")
            : "No se pudo leer el sheet de Novedades Logísticas: se muestra el último registro guardado, que puede estar incompleto."}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="text-slate-900">Fuera de ruta</strong>
          {esChess && entregadoFoto ? (
            <>
              {" "}· {nEntregados} {nEntregados === 1 ? "entregado" : "entregados"} fuera de ruta
              {nSinRuteo > 0 && <> ({nSinRuteo} sin figurar en el ruteo)</>}
              {nNoSalio > 0 && (
                <> · <span className="text-slate-500" title="Estaban en el ruteo fuera de su día pactado y al final no se entregaron fuera de ruta. No cuentan como fuera de ruta.">{nNoSalio} más {nNoSalio === 1 ? "estaba" : "estaban"} en el ruteo y no {nNoSalio === 1 ? "salió" : "salieron"} (no cuenta{nNoSalio === 1 ? "" : "n"})</span></>
              )}
            </>
          ) : (
            <>
              {" "}· {filas.length} {filas.length === 1 ? "pedido" : "pedidos"}
              {esChess && <> en el ruteo fuera de su día</>}
            </>
          )}
          {fueraRuta.total_bultos > 0 && (
            <> · {fueraRuta.total_bultos.toLocaleString("es-AR")} bultos · {fueraRuta.total_hl.toFixed(1)} HL</>
          )}
          {fueraRuta.total_monto > 0 && <> · {money(fueraRuta.total_monto)}</>}
        </p>
        <p className="text-xs text-muted-foreground">
          {esChess
            ? `Fuente: Chess · entrega fuera del día pactado del cliente${diasPactadosTxt}`
            : "Fuente: sheet Novedades Logísticas + medidas del pedido en Chess"}
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {esChess
            ? (entregadoFoto
                ? <>El {fueraRuta.fecha} no se entregó ningún pedido fuera del día pactado de su cliente.</>
                : <>Ningún pedido del {fueraRuta.fecha} está en el ruteo fuera del día pactado de su cliente.</>)
            : <>Sin pedidos fuera de ruta cargados para el {fueraRuta.fecha}.</>}
        </p>
      ) : (
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Entrega en</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Bultos</TableHead>
              <TableHead className="text-right">HL</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Patente</TableHead>
              <TableHead>{esChess ? "Día pactado" : "Autorización / obs."}</TableHead>
              {esChess && <TableHead>Estado</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => {
              const otroCliente =
                f.cod_cliente_entregado != null && f.cod_cliente_entregado !== f.cod_cliente
              return (
                <TableRow key={f.clave}>
                  <TableCell>
                    <div className="max-w-[200px] truncate font-medium" title={f.cliente ?? undefined}>
                      {f.cliente ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.cod_cliente != null && <>#{f.cod_cliente}</>}
                      {otroCliente && (
                        <span className="text-amber-700">
                          {" "}→ entrega a {f.cliente_entregado ?? `#${f.cod_cliente_entregado}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="max-w-[200px] truncate" title={f.direccion_entrega ?? undefined}>
                      {f.direccion_entrega ?? "—"}
                    </div>
                    <div className="text-muted-foreground">
                      {f.localidad_entrega ?? f.localidad ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="tabular-nums">{f.nro_pedido ?? "—"}</div>
                    <div className="text-muted-foreground">{f.tipo_comprobante ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{f.canal ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {f.bultos_pedido ?? f.bultos ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {f.hl_pedido != null ? f.hl_pedido.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {f.monto != null ? money(f.monto) : "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{f.patente ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="max-w-[220px] truncate" title={[f.descripcion, f.observaciones].filter(Boolean).join(" · ") || undefined}>
                      {esChess ? (f.descripcion ?? "—") : ([f.descripcion, f.observaciones].filter(Boolean).join(" · ") || "—")}
                    </div>
                  </TableCell>
                  {esChess && (
                    <TableCell className="text-xs">
                      <EstadoFueraRuta estado={f.estado} />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/**
 * Las dos fotos del fuera de ruta Chess: lo que está en el ruteo (antes de la
 * entrega) y lo que efectivamente salió (después). Un pedido puede estar en el
 * ruteo y sacarse o reprogramarse; o salir fuera de ruta sin haber figurado.
 */
function EstadoFueraRuta({ estado }: { estado: FueraRutaRegistro["estado"] }) {
  switch (estado) {
    case "ruteo":
      return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">En el ruteo</Badge>
    case "entregado":
      return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">Entregado fuera de ruta</Badge>
    case "entregado_sin_ruteo":
      return (
        <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800" title="Salió fuera de ruta sin haber figurado en el ruteo">
          Entregado · no estaba en el ruteo
        </Badge>
      )
    case "no_salio":
      return (
        <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600" title="Estaba en el ruteo y no se entregó fuera de ruta ese día (se sacó o se reprogramó)">
          No salió
        </Badge>
      )
    default:
      return <span className="text-muted-foreground">—</span>
  }
}

/**
 * Acumulado mensual de los dos volúmenes que no se entregaron como estaba
 * planificado: FUERA DE RUTA (se entregó, pero fuera del recorrido) y VRL
 * (se cortó y reprogramó por capacidad). Mismas unidades para comparar.
 */
export function AcumuladoMensualPanel({
  fueraRutaMensual, vrl,
}: {
  fueraRutaMensual: FueraRutaMes[]
  vrl: VrlMes[]
}) {
  const fdrMap = new Map(fueraRutaMensual.map((m) => [m.anio_mes, m]))
  const vrlMap = new Map(vrl.map((m) => [m.anio_mes, m]))
  const meses = [...new Set([...fdrMap.keys(), ...vrlMap.keys()])].sort().reverse().slice(0, 13)

  if (meses.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay meses con fuera de ruta ni cortes registrados.
      </p>
    )
  }

  const fmtMes = (ym: string) => {
    const [y, m] = ym.split("-").map(Number)
    const nombre = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", {
      month: "short", year: "2-digit", timeZone: "UTC",
    })
    return nombre.charAt(0).toUpperCase() + nombre.slice(1)
  }
  const num = (v: number, dec = 0) =>
    v > 0 ? v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—"

  return (
    <div className="space-y-3">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead />
            <TableHead colSpan={4} className="border-l text-center font-semibold text-amber-800">
              <span className="inline-flex items-center gap-1"><Route className="h-3.5 w-3.5" /> Fuera de ruta</span>
            </TableHead>
            <TableHead colSpan={4} className="border-l text-center font-semibold text-red-700">
              <span className="inline-flex items-center gap-1"><Scissors className="h-3.5 w-3.5" /> VRL (reprogramados)</span>
            </TableHead>
          </TableRow>
          <TableRow>
            <TableHead>Mes</TableHead>
            <TableHead className="border-l text-right">Pedidos</TableHead>
            <TableHead className="text-right">Bultos</TableHead>
            <TableHead className="text-right">HL</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="border-l text-right">Pedidos</TableHead>
            <TableHead className="text-right">Bultos</TableHead>
            <TableHead className="text-right">HL</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meses.map((ym) => {
            const f = fdrMap.get(ym)
            const v = vrlMap.get(ym)
            return (
              <TableRow key={ym}>
                <TableCell className="font-medium">{fmtMes(ym)}</TableCell>
                <TableCell className="border-l text-right tabular-nums">{num(f?.pedidos ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(f?.bultos ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(f?.hl ?? 0, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{f?.monto ? money(f.monto) : "—"}</TableCell>
                <TableCell className="border-l text-right tabular-nums">{num(v?.pedidos_reprogramados ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(v?.bultos ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(v?.hl ?? 0, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{v?.monto ? money(v.monto) : "—"}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Fuera de ruta: pedidos entregados fuera del recorrido planificado (sheet de Novedades, medidas
        del pedido en Chess). VRL: pedidos cortados por capacidad con «Registrar corte» — el registro
        arranca el 16/07/2026, no hay historia anterior. Para ver el detalle de un día, elegí la fecha
        arriba.
      </p>
    </div>
  )
}
