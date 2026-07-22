"use client"

/**
 * Sección de Dimensionamiento de la reunión de Logística (DPO Planeamiento 2.3, R2.3.4).
 *
 * El manual pide que el dimensionamiento se COMUNIQUE a los equipos de almacén y
 * entrega dentro del mes de la ejecución. Esta sección aparece sólo en la reunión
 * del último día hábil del mes y muestra el cuadro resumen partido por sector, de
 * modo que cada responsable se lleve su parte sin tener que entrar al módulo:
 *
 *   · ALMACÉN — dotación vs necesarios por rol, y las horas extra que vienen.
 *   · FLOTA / ENTREGA — camiones, choferes y ayudantes, días de refuerzo y 2ª vuelta.
 *   · Impacto en el costo por HL.
 *
 * Los números se congelan en un snapshot (`reunion_dimensionamiento_snapshots`)
 * porque el módulo siempre calcula contra el mes en curso: sin congelar, la
 * reunión de julio mostraría números de octubre y no serviría como evidencia.
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
  type ResumenDimensionamiento, type ResumenRolAlmacen, type ResumenRecursoFlota,
} from "@/actions/reuniones-dimensionamiento"
import type { ReunionActividadConResponsable } from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/** Slug de `reuniones_actividades.seccion` y `reunion_seccion_fotos.seccion`. */
export const SECCION_DIMENSIONAMIENTO = "dimensionamiento"

const MES_ABBR = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const mesLargo = (s: string) => MES_ABBR[Number(s.split("-")[1])] ?? s
const fmt = (v: number) => v.toLocaleString("es-AR")
const money = (v: number) => `$${Math.round(v).toLocaleString("es-AR")}`

const ESTADO_BADGE = {
  cubre: { txt: "Cubre", cls: "bg-emerald-500 hover:bg-emerald-500" },
  extras_pico: { txt: "Extras en pico", cls: "bg-amber-500 hover:bg-amber-500" },
  faltan: { txt: "Faltan", cls: "bg-red-500 hover:bg-red-500" },
} as const

function EstadoBadge({ estado, brecha }: { estado: ResumenRolAlmacen["estado"]; brecha: number }) {
  const b = ESTADO_BADGE[estado]
  return <Badge className={b.cls}>{b.txt}{estado === "faltan" && brecha > 0 ? ` ${fmt(brecha)}` : ""}</Badge>
}

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
      const res = await actualizarResumenDimReunion(reunionId)
      if ("error" in res) { toast.error(res.error); return }
      setSnap(res.data)
      toast.success("Dimensionamiento actualizado")
    })
  }, [reunionId])

  const d = snap?.datos ?? null
  const px = d?.proximoMes ?? null

  return (
    <div className="space-y-4">
      <Card className="border-slate-300">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4" /> Dimensionamiento del mes
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Cierre de {mesLargo(fechaReunion)} — qué recursos hicieron falta y qué se viene, para comunicar a cada sector.
              {snap ? ` · Congelado el ${new Date(snap.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}` : ""}
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
              Todavía no se generó el resumen. {puedeEditar ? "Tocá «Generar resumen» para traer los números del dimensionamiento y dejarlos congelados en esta reunión." : "Pedile a un supervisor que lo genere."}
            </p>
          )}

          {d && (
            <>
              {/* ── ALMACÉN ── */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Warehouse className="h-4 w-4" /> Almacén
                </h4>
                {d.almacen.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos de almacén este mes.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-right">Dotación</TableHead>
                      <TableHead className="text-right">Necesarios</TableHead>
                      <TableHead className="text-right">Demanda/día</TableHead>
                      <TableHead className="text-right">Capacidad/día</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {d.almacen.map((r: ResumenRolAlmacen) => (
                        <TableRow key={r.rol}>
                          <TableCell className="font-medium">{r.rol}</TableCell>
                          <TableCell className="text-right">
                            {fmt(r.dotacion)}
                            {r.dotacionEfectiva < r.dotacion ? <span className="block text-[10px] text-muted-foreground">ef. {fmt(r.dotacionEfectiva)}</span> : null}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {r.necesariosProm}{r.necesariosPico > r.necesariosProm ? ` (pico ${r.necesariosPico})` : ""}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmt(r.volumenProm)} {r.unidad}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmt(r.capacidadEquipo)} {r.unidad}</TableCell>
                          <TableCell><EstadoBadge estado={r.estado} brecha={r.brecha} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {px && (
                  <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                    <b>Para {mesLargo(px.mes)}:</b>{" "}
                    {px.hhAlmacen > 0
                      ? <>se estiman <b className="text-amber-700">{fmt(px.hhAlmacen)} hora-hombre extra</b> ({money(px.costoAlmacen)}).{px.rolesConFalta.length > 0 ? <> Roles que no llegan ni en el día promedio: <b>{px.rolesConFalta.join(", ")}</b>.</> : null}</>
                      : <>la dotación actual <b className="text-emerald-700">cubre sin horas extra</b>.</>}
                  </p>
                )}
              </div>

              {/* ── FLOTA / ENTREGA ── */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Truck className="h-4 w-4" /> Flota / Entrega
                </h4>
                {d.flota.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos de ruteo este mes.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Recurso</TableHead>
                      <TableHead className="text-right">Disponible</TableHead>
                      <TableHead className="text-right">Necesarios</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {d.flota.map((r: ResumenRecursoFlota) => (
                        <TableRow key={r.recurso}>
                          <TableCell className="font-medium">{r.recurso}</TableCell>
                          <TableCell className="text-right">{fmt(r.dotacion)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {r.necesariosProm}{r.necesariosPico > r.necesariosProm ? ` (pico ${r.necesariosPico})` : ""}
                          </TableCell>
                          <TableCell><EstadoBadge estado={r.estado} brecha={r.brecha} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {fmt(d.camiones.operativos)} camiones operativos · {fmt(d.camiones.capacidadCeqDia)} CEq/día de capacidad · volumen {fmt(d.camiones.volumenCeqProm)} CEq/día (pico {fmt(d.camiones.volumenCeqPico)}).
                </p>
                {px && (
                  <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                    <b>Para {mesLargo(px.mes)}:</b>{" "}
                    {px.diasRefuerzoFlota > 0
                      ? <><b className="text-amber-700">{px.diasRefuerzoFlota} días con refuerzo</b> y <b>{fmt(px.hhDistribucion)} hora-hombre extra</b> ({money(px.costoDistribucion)}).{px.segundaVueltaObligada ? <b className="text-red-700"> Hay días que superan la flota: 2ª vuelta obligada.</b> : null}</>
                      : <>la flota y la dotación <b className="text-emerald-700">cubren sin refuerzo</b>.</>}
                  </p>
                )}
              </div>

              {/* ── COSTO ── */}
              {px && (
                <div className="rounded-md border-l-4 border-sky-400 bg-sky-50 p-3 text-sm">
                  <p className="mb-1 font-semibold">Impacto en el costo</p>
                  {px.costoTotal > 0 ? (
                    <p>
                      Las horas extra de {mesLargo(px.mes)} suman <b>{money(px.costoTotal)}</b> ({money(px.costoAlmacen)} almacén + {money(px.costoDistribucion)} distribución)
                      sobre {fmt(px.hlProyectados)} HL proyectados → <b className="text-amber-700">{money(px.costoPorHl)}/HL</b> por encima del costo actual
                      {d.vlc.valorMes != null ? <> de <b>{money(d.vlc.valorMes)}/HL</b></> : null}.
                      {d.vlc.meta != null && d.vlc.meta > 0 && d.vlc.valorMes != null && (
                        <> Costo/HL proyectado <b>{money(d.vlc.valorMes + px.costoPorHl)}</b> contra una meta de {money(d.vlc.meta)}.</>
                      )}
                    </p>
                  ) : (
                    <p>El mes que viene <b className="text-emerald-700">no requiere horas extra</b>, así que no hay impacto adicional en el costo por HL.</p>
                  )}
                </div>
              )}
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
