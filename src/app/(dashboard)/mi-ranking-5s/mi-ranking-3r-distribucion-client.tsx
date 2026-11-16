"use client"

// Vista del CHOFER / AYUDANTE de Distribución — mobile-first, mismo molde que
// el Ranking 3R de Depósito. Arriba "cómo voy" (puesto, puntos, de dónde
// salen y qué le falta para poder ganar), abajo la tabla de todos con nombre y
// puntos. Los raspones, el ausentismo y los motivos de los demás no se
// muestran, y por eso tampoco se marca el podio en curso.

import {
  AlertTriangle,
  CalendarCheck,
  PackageX,
  ShieldAlert,
  Sparkles,
  Star,
  Timer,
  Trophy,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MiRanking3RDist } from "@/lib/tres-r/distribucion-types"

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function etiquetaBimestre(meses: string[]): string {
  const [y, m1] = meses[0].split("-").map(Number)
  const m2 = Number(meses[meses.length - 1].split("-")[1])
  return meses.length > 1
    ? `${NOMBRES_MES[m1 - 1]}–${NOMBRES_MES[m2 - 1]} ${y}`
    : `${NOMBRES_MES[m1 - 1]} ${y}`
}

const fmt = (n: number, dec = 0) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec })

function colorPuntos(p: number): string {
  if (p >= 85) return "text-emerald-600"
  if (p >= 70) return "text-amber-600"
  return "text-red-600"
}

export function MiRanking3RDistribucionClient({ data }: { data: MiRanking3RDist }) {
  const { mio, tabla, pesos, config: c } = data

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Trophy className="size-5 text-amber-500" />
          Ranking 3R · Distribución
        </h1>
        <p className="text-sm text-muted-foreground">
          Bimestre {etiquetaBimestre(data.meses)} · en curso, faltan {data.dias_restantes}{" "}
          {data.dias_restantes === 1 ? "día" : "días"}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Qué se mide:</span> el rechazo y la
          calificación de los clientes (RMD) de los camiones en los que saliste, los reportes de
          seguridad que cargues, tu presentismo, el 5S del camión y el TML. Choferes y ayudantes
          compiten juntos, de 0 a 100.
        </p>
        <p className="mt-1.5">
          <span className="font-semibold text-slate-800">Para ser ganador:</span> ningún raspón con
          el camión, ninguna falta sin aviso, al menos {c.min_reportes} reporte
          {c.min_reportes === 1 ? "" : "s"} de seguridad cargado{c.min_reportes === 1 ? "" : "s"} y
          salir a la calle al menos el {fmt(c.min_pct_dias)} % de los días.
        </p>
      </div>

      {mio ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tu puesto</p>
                <p className="text-4xl font-bold text-slate-900">
                  {mio.posicion}
                  <span className="text-base font-medium text-muted-foreground"> de {tabla.length}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tus puntos</p>
                <p className={`text-4xl font-bold ${colorPuntos(mio.score)}`}>
                  {Math.round(mio.score)}
                  <span className="text-base font-medium text-muted-foreground"> / 100</span>
                </p>
              </div>
            </div>

            {mio.motivos.length > 0 && (
              <div className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                <AlertTriangle className="size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Hoy no entrás al podio:</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {mio.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <p className="mt-1">Seguís sumando puntos igual.</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {pesos.rechazo > 0 && (
                <Componente
                  icono={PackageX}
                  titulo="Rechazo"
                  peso={pesos.rechazo}
                  puntos={mio.rechazo_score}
                  detalle={
                    mio.rechazo_pct == null
                      ? "Sin ventas registradas en tus camiones: no cuenta"
                      : `${fmt(mio.rechazo_pct, 2)} % de los bultos de tus camiones (sin errores de preventa ni falta de stock). Con ${fmt(c.tope_rechazo, 1)} % quedás en 0.`
                  }
                />
              )}
              {pesos.rmd > 0 && (
                <Componente
                  icono={Star}
                  titulo="Calificación de clientes (RMD)"
                  peso={pesos.rmd}
                  puntos={mio.rmd_score}
                  detalle={
                    mio.rmd == null
                      ? "Sin calificaciones todavía: no cuenta"
                      : `${fmt(mio.rmd, 2)} ★ en ${mio.rmd_n} calificaciones. ${fmt(c.rmd_techo, 1)} ★ = 100 pts, ${fmt(c.rmd_piso, 1)} ★ = 0.`
                  }
                />
              )}
              {pesos.reportes > 0 && (
                <Componente
                  icono={ShieldAlert}
                  titulo="Reportes de seguridad"
                  peso={pesos.reportes}
                  puntos={mio.reportes_score}
                  detalle={
                    mio.reportes_faltan > 0
                      ? `${mio.reportes_cant} ${mio.reportes_cant === 1 ? "reporte cargado" : "reportes cargados"}. Te ${mio.reportes_faltan === 1 ? "falta 1" : `faltan ${mio.reportes_faltan}`} para el máximo. Cargalos en «Reportar seguridad».`
                      : `${mio.reportes_cant} reportes cargados: tenés el máximo.`
                  }
                />
              )}
              {pesos.presentismo > 0 && (
                <Componente
                  icono={CalendarCheck}
                  titulo="Presentismo"
                  peso={pesos.presentismo}
                  puntos={mio.presentismo_score}
                  detalle={
                    mio.dias_licencia > 0
                      ? `${mio.dias_licencia} ${mio.dias_licencia === 1 ? "día" : "días"} de licencia en el bimestre.`
                      : `Sin licencias en el bimestre. Saliste ${mio.dias_con_ruta} ${mio.dias_con_ruta === 1 ? "día" : "días"} a la calle.`
                  }
                />
              )}
              {pesos.s5 > 0 && (
                <Componente
                  icono={Sparkles}
                  titulo="5S del camión"
                  peso={pesos.s5}
                  puntos={mio.nota_5s}
                  detalle={
                    mio.nota_5s != null
                      ? "Auditoría 5S de los camiones en los que saliste."
                      : "Tus camiones no tienen auditoría 5S todavía: no cuenta"
                  }
                />
              )}
              {pesos.tml > 0 && (
                <Componente
                  icono={Timer}
                  titulo="TML (salida a ruta)"
                  peso={pesos.tml}
                  puntos={mio.tml_score}
                  detalle={
                    mio.tml == null
                      ? "Sin egresos de portería registrados: no cuenta"
                      : `${mio.tml} min promedio. Hasta ${fmt(c.tml_meta)} min = 100 pts, ${fmt(c.tml_tope)} min = 0.`
                  }
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lo que no tiene dato todavía no te resta: se reparte el peso entre lo demás.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Todavía no aparecés en el ranking de este bimestre. Entrás cuando salgas a la calle en
            un camión (egreso de portería, salida programada o checklist). Si te parece un error,
            avisale a tu supervisor.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cómo vamos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ol className="divide-y divide-slate-100">
            {tabla.map((f) => (
              <li
                key={`${f.posicion}-${f.nombre}`}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${f.soy_yo ? "bg-cyan-50 font-semibold" : ""}`}
              >
                <span className="w-6 text-right tabular-nums text-muted-foreground">{f.posicion}</span>
                <span className="flex-1 truncate text-slate-800">
                  {f.nombre}
                  {f.soy_yo && <span className="ml-1 text-xs font-medium text-cyan-700">(vos)</span>}
                </span>
                <span className={`tabular-nums font-semibold ${colorPuntos(f.puntos)}`}>{f.puntos}</span>
              </li>
            ))}
          </ol>
          {tabla.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Todavía no hay datos en este bimestre.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-[11px] text-muted-foreground">
        Es el parcial del bimestre: se actualiza todos los días. El podio se confirma cuando cierra.
      </p>
    </div>
  )
}

function Componente({
  icono: Icono,
  titulo,
  peso,
  puntos,
  detalle,
}: {
  icono: typeof Trophy
  titulo: string
  peso: number
  puntos: number | null
  detalle: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <Icono className="size-4 text-slate-500" />
          {titulo}
          <span className="text-xs font-normal text-muted-foreground">· vale {peso}%</span>
        </span>
        <span className={`text-sm font-bold tabular-nums ${puntos != null ? colorPuntos(puntos) : "text-slate-400"}`}>
          {puntos != null ? `${fmt(puntos)} pts` : "—"}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>
    </div>
  )
}
