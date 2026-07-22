"use client"

/**
 * Sección de Dimensionamiento de la reunión de Logística (DPO Planeamiento 2.3, R2.3.4).
 *
 * El manual pide que el dimensionamiento se COMUNIQUE a los equipos de almacén y
 * entrega dentro del mes de la ejecución. Esta sección aparece sólo en la reunión
 * del último día hábil del mes y responde una sola pregunta: **cómo vamos a
 * afrontar el mes que entra**. No es el cierre del mes que termina —eso ya se ve
 * en el resto de la reunión— sino la demanda que viene contra la dotación que hay.
 *
 *   · ALMACÉN — por rol: qué va a pedir el mes, qué cubre el equipo, cuántas horas
 *     extra y si falta gente en el día pico.
 *   · FLOTA / ENTREGA — camiones, choferes y ayudantes: días con refuerzo, horas
 *     extra y aviso de 2ª vuelta obligada.
 *   · Cuánto cuesta todo eso, y cuánto suma al costo por HL.
 *
 * Los números se congelan en un snapshot (`reunion_dimensionamiento_snapshots`)
 * porque el módulo proyecta siempre desde el mes en curso: sin congelar, la
 * reunión de julio mostraría meses de octubre y no serviría como evidencia.
 *
 * En pantalla se muestra la fecha de la REUNIÓN, no la de carga: el resumen
 * pertenece a esa reunión aunque se haya volcado después (el módulo puede no
 * haber existido ese día). La fecha real de carga queda igual en `updated_at`.
 *
 * La evidencia y los compromisos reusan `SeccionGaleriaFotos`, igual que el resto
 * de las secciones de la reunión.
 */

import { useCallback, useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Boxes, RefreshCw, Truck, Warehouse } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SeccionGaleriaFotos } from "./seccion-galeria-fotos"
import {
  getResumenDimReunion, actualizarResumenDimReunion,
  type ResumenDimensionamiento, type ResumenAlmacenRol, type ResumenFlotaRecurso,
} from "@/actions/reuniones-dimensionamiento"
import type { ReunionActividadConResponsable } from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/** Slug de `reuniones_actividades.seccion` y `reunion_seccion_fotos.seccion`. */
export const SECCION_DIMENSIONAMIENTO = "dimensionamiento"

const MES_LARGO = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const mesLargo = (s: string) => MES_LARGO[Number(s.split("-")[1])] ?? s
const fmt = (v: number) => v.toLocaleString("es-AR")
const money = (v: number) => `$${Math.round(v).toLocaleString("es-AR")}`
/** HL por paleta de cerveza retornable (156 HL/camión ÷ 26 paletas). */
const HL_POR_PALETA = 6
/** Clasificadores trabaja en paletas: el volumen va en HL con las paletas al lado. */
const paletas = (v: number) => `${fmt(Math.round(v / HL_POR_PALETA))} pal`

const ESTADO_BADGE = {
  cubre: { txt: "Cubre", cls: "bg-emerald-500 hover:bg-emerald-500" },
  extras_pico: { txt: "Horas extra", cls: "bg-amber-500 hover:bg-amber-500" },
  faltan: { txt: "Falta gente", cls: "bg-red-500 hover:bg-red-500" },
} as const

export function SeccionDimensionamiento({
  reunionId, fechaReunion, actividades, responsables, puedeEditar, onActividadesChanged,
}: {
  reunionId: string
  fechaReunion: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [snap, setSnap] = useState<{ datos: ResumenDimensionamiento; updatedAt: string } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [pend, startPend] = useTransition()

  useEffect(() => {
    let cancel = false
    void getResumenDimReunion(reunionId).then((res) => {
      if (cancel) return
      if ("error" in res) toast.error(res.error)
      else setSnap(res.data)
      setCargando(false)
    })
    return () => { cancel = true }
  }, [reunionId])

  const actualizar = useCallback(() => {
    startPend(async () => {
      const res = await actualizarResumenDimReunion(reunionId, fechaReunion)
      if ("error" in res) { toast.error(res.error); return }
      setSnap(res.data)
      toast.success("Dimensionamiento actualizado")
    })
  }, [reunionId, fechaReunion])

  const d = snap?.datos ?? null
  const totalHhAlmacen = d ? d.almacen.reduce((s, r) => s + r.horasExtra, 0) : 0
  const totalHhFlota = d ? d.flota.reduce((s, r) => s + r.horasExtra, 0) : 0
  const costoAlmacen = d ? d.almacen.reduce((s, r) => s + r.costoHorasExtra, 0) : 0
  const costoFlota = d ? d.flota.reduce((s, r) => s + r.costoHorasExtra, 0) : 0

  return (
    <div className="space-y-4">
      <Card className="border-slate-300">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4" />
              {d ? `Cómo afrontamos ${mesLargo(d.mesEntrante)}` : "Dimensionamiento del mes que entra"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Recursos que va a pedir el mes que entra contra la dotación actual — para que almacén y distribución sepan con qué cuentan.
              {d ? ` · ${fmt(d.hlProyectados)} HL proyectados${d.ajustePct !== 0 ? ` (escenario ${d.ajustePct > 0 ? "+" : ""}${d.ajustePct}%)` : ""}` : ""}
              {snap ? ` · Fijado en la reunión del ${new Date(fechaReunion + "T12:00:00").toLocaleDateString("es-AR")}` : ""}
            </p>
          </div>
          {puedeEditar && (
            <Button size="sm" variant="outline" disabled={pend} onClick={actualizar}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${pend ? "animate-spin" : ""}`} />
              {snap ? "Recalcular" : "Generar resumen"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!cargando && !d && (
            <p className="text-sm text-muted-foreground">
              Todavía no se generó el resumen. {puedeEditar ? "Tocá «Generar resumen» para traer la proyección del mes que entra y dejarla congelada en esta reunión." : "Pedile a un supervisor que lo genere."}
            </p>
          )}

          {d?.desfasado && (
            <p className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-2 text-sm">
              Este resumen se generó fuera de fecha: el mes siguiente a la reunión ya pasó, así que muestra <b>{mesLargo(d.mesEntrante)}</b>, el primer mes que todavía se puede proyectar. Generalo el día de la reunión para que muestre el mes correcto.
            </p>
          )}

          {d && (
            <>
              {/* ── ALMACÉN ── */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Warehouse className="h-4 w-4" /> Almacén
                </h4>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Rol</TableHead>
                    <TableHead className="text-right">Dotación</TableHead>
                    <TableHead className="text-right">Cubre/día</TableHead>
                    <TableHead className="text-right">Demanda/día</TableHead>
                    <TableHead className="text-right">Día pico</TableHead>
                    <TableHead className="text-right">Horas extra</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.almacen.map((r: ResumenAlmacenRol) => {
                      const b = ESTADO_BADGE[r.estado]
                      const esHL = r.unidad === "HL"
                      return (
                        <TableRow key={r.rol}>
                          <TableCell className="font-medium">{r.rol}</TableCell>
                          <TableCell className="text-right">
                            {fmt(r.dotacion)}
                            {r.dotacionEfectiva < r.dotacion ? <span className="block text-[10px] text-muted-foreground">ef. {fmt(r.dotacionEfectiva)}</span> : null}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {fmt(r.capacidadDia)} {r.unidad}
                            {esHL ? <span className="block text-[10px]">({paletas(r.capacidadDia)})</span> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(r.volPromDia)} {r.unidad}
                            {esHL ? <span className="block text-[10px] text-muted-foreground">({paletas(r.volPromDia)})</span> : null}
                          </TableCell>
                          <TableCell className={`text-right ${r.volPicoDia > r.capacidadDia ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                            {fmt(r.volPicoDia)}
                            {esHL ? <span className="block text-[10px] font-normal text-muted-foreground">({paletas(r.volPicoDia)})</span> : null}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {r.horasExtra > 0 ? <>{fmt(r.horasExtra)} h<span className="block text-[10px] font-normal text-muted-foreground">{money(r.costoHorasExtra)}</span></> : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={b.cls}>{b.txt}{r.estado === "faltan" ? ` (${r.faltanPico})` : ""}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                  {totalHhAlmacen > 0
                    ? <><b>Almacén necesita {fmt(totalHhAlmacen)} hora-hombre extra</b> en {mesLargo(d.mesEntrante)} ({money(costoAlmacen)}).{d.almacen.some((r) => r.estado === "faltan") ? <> En el día pico no alcanza la gente en: <b>{d.almacen.filter((r) => r.estado === "faltan").map((r) => r.rol).join(", ")}</b>.</> : null}</>
                    : <>La dotación de almacén <b className="text-emerald-700">cubre el mes sin horas extra</b>.</>}
                </p>
              </div>

              {/* ── FLOTA / ENTREGA ── */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Truck className="h-4 w-4" /> Flota / Entrega
                </h4>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Recurso</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Necesarios en el pico</TableHead>
                    <TableHead className="text-right">Días con refuerzo</TableHead>
                    <TableHead className="text-right">Horas extra</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.flota.map((r: ResumenFlotaRecurso) => {
                      const b = ESTADO_BADGE[r.estado]
                      return (
                        <TableRow key={r.recurso}>
                          <TableCell className="font-medium">{r.recurso}</TableCell>
                          <TableCell className="text-right">{fmt(r.dotacion)}</TableCell>
                          <TableCell className={`text-right font-semibold ${r.picoNecesario > r.dotacion ? "text-amber-700" : ""}`}>{fmt(r.picoNecesario)}</TableCell>
                          <TableCell className="text-right">{r.diasRefuerzo > 0 ? `${r.diasRefuerzo} días` : "—"}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {r.horasExtra > 0 ? <>{fmt(r.horasExtra)} h<span className="block text-[10px] font-normal text-muted-foreground">{money(r.costoHorasExtra)}</span></> : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={b.cls}>{r.segundaVuelta ? "2ª vuelta" : b.txt}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                  {totalHhFlota > 0 || d.flota.some((r) => r.diasRefuerzo > 0)
                    ? <><b>Distribución necesita {fmt(totalHhFlota)} hora-hombre extra</b> ({money(costoFlota)}).{d.flota.some((r) => r.segundaVuelta) ? <b className="text-red-700"> Hay días que superan la flota: 2ª vuelta obligada.</b> : null}</>
                    : <>La flota y la dotación de reparto <b className="text-emerald-700">cubren el mes sin refuerzo</b>.</>}
                </p>
              </div>

              {/* ── COSTO ── */}
              <div className="rounded-md border-l-4 border-sky-400 bg-sky-50 p-3 text-sm">
                <p className="mb-1 font-semibold">Cuánto cuesta</p>
                {d.costoTotal > 0 ? (
                  <p>
                    Las horas extra de {mesLargo(d.mesEntrante)} suman <b>{money(d.costoTotal)}</b> ({money(costoAlmacen)} almacén + {money(costoFlota)} distribución)
                    sobre {fmt(d.hlProyectados)} HL → <b className="text-amber-700">{money(d.costoPorHl)}/HL</b> por encima del costo actual
                    {d.vlc.valorMes != null ? <> de <b>{money(d.vlc.valorMes)}/HL</b></> : null}.
                    {d.vlc.meta != null && d.vlc.meta > 0 && d.vlc.valorMes != null && (
                      <> Costo/HL proyectado <b>{money(d.vlc.valorMes + d.costoPorHl)}</b> contra una meta de {money(d.vlc.meta)}.</>
                    )}
                  </p>
                ) : (
                  <p>{mesLargo(d.mesEntrante)} <b className="text-emerald-700">se afronta con la estructura actual</b>: sin horas extra ni impacto adicional en el costo por HL.</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SeccionGaleriaFotos
        reunionId={reunionId}
        reunionTipo="logistica"
        seccion={SECCION_DIMENSIONAMIENTO}
        titulo="Dimensionamiento — evidencia y compromisos"
        icono={Boxes}
        tema="teal"
        emptyHint="Sin fotos cargadas. Subí la captura del cuadro comunicado a almacén y a distribución para dejar registro de la comunicación del mes."
        actividades={actividades}
        responsables={responsables}
        puedeEditar={puedeEditar}
        onActividadesChanged={onActividadesChanged}
        verMasHref="/planeamiento/dimensionamiento"
        verMasLabel="Ver dimensionamiento completo"
      />
    </div>
  )
}
