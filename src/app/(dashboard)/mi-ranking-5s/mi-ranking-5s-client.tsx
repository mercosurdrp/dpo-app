"use client"

// Vista del OPERARIO — mobile-first. Arriba "cómo voy" (puesto, puntos y de
// dónde salen), abajo la tabla de todos con nombre y puntos. El ausentismo de
// los demás no se muestra, y por eso tampoco se marca el podio en curso.

import { AlertTriangle, ShieldAlert, Sparkles, Trophy, PackageCheck, Gauge } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MiRanking5S } from "@/actions/s5-deposito"

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

export function MiRanking5SClient({ data }: { data: MiRanking5S }) {
  const { mio, tabla, pesos } = data

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Trophy className="size-5 text-amber-500" />
          Ranking 3R
        </h1>
        <p className="text-sm text-muted-foreground">
          Bimestre {etiquetaBimestre(data.meses)} · en curso, faltan {data.dias_restantes}{" "}
          {data.dias_restantes === 1 ? "día" : "días"}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Qué se mide:</span> la auditoría 5S de tu
          sector, los errores de picking (cada 1.000 bultos), tu productividad y los reportes de
          actos inseguros que cargues. Todo suma a un puntaje de 0 a 100.
        </p>
        <p className="mt-1.5">
          <span className="font-semibold text-slate-800">Para ser ganador</span> no tenés que tener
          ninguna ausencia en el período.
        </p>
      </div>

      {!data.hay_auditoria_5s && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Todavía no hay auditoría 5S cargada en este bimestre: por ahora los puntos salen de
          errores, productividad y reportes. Cuando se audite tu sector, la nota entra al cálculo
          y los puntos se mueven.
        </p>
      )}

      {/* Cómo voy */}
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
                <p className={`text-4xl font-bold ${colorPuntos(mio.puntos)}`}>
                  {mio.puntos}
                  <span className="text-base font-medium text-muted-foreground"> / 100</span>
                </p>
              </div>
            </div>

            {!mio.elegible && (
              <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  Tenés ausentismo registrado en el bimestre
                  {mio.no_elegible_motivo ? ` (${mio.no_elegible_motivo})` : ""}: seguís sumando
                  puntos, pero no entrás al podio.
                </span>
              </p>
            )}

            <div className="space-y-2">
              {pesos.s5 > 0 && (
                <Componente
                  icono={Sparkles}
                  titulo="Auditoría 5S"
                  peso={pesos.s5}
                  puntos={mio.nota_5s}
                  detalle={
                    mio.nota_5s != null
                      ? `Nota de ${mio.sectores.join(", ") || "tu sector"}`
                      : mio.sectores.length
                        ? `${mio.sectores.join(", ")}: sin auditoría todavía`
                        : "No tenés sector asignado este bimestre: no cuenta"
                  }
                />
              )}
              {pesos.errores > 0 && (
                <Componente
                  icono={PackageCheck}
                  titulo="Errores de picking"
                  peso={pesos.errores}
                  puntos={mio.errores_score}
                  detalle={
                    mio.errores_score == null
                      ? "No pickeaste este bimestre: no cuenta"
                      : mio.errores_x1000 != null
                        ? `${mio.errores_cant ?? 0} ${mio.errores_cant === 1 ? "error" : "errores"} en ${fmt(mio.bultos_cant ?? 0)} bultos (${fmt(mio.errores_x1000, 2)} cada 1.000). Con ${fmt(data.tope_errores_x1000, 1)} cada 1.000 quedás en 0.`
                        : `${mio.errores_cant ?? 0} ${mio.errores_cant === 1 ? "error" : "errores"}. Con ${data.tope_errores_bimestre} en el bimestre quedás en 0.`
                  }
                />
              )}
              {pesos.productividad > 0 && (
                <Componente
                  icono={Gauge}
                  titulo="Productividad"
                  peso={pesos.productividad}
                  puntos={mio.productividad_score}
                  detalle={
                    mio.productividad_score == null
                      ? "Sin registros de picking ni despacho: no cuenta"
                      : [
                          mio.productividad != null
                            ? `Picking ${fmt(mio.productividad)} bul/HH (meta ${data.prod_target})`
                            : null,
                          mio.productividad_maq != null
                            ? `Despacho ${fmt(mio.productividad_maq, 1)} pal/HH (meta ${data.prod_target_maq})`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
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
                      ? `${mio.reportes_cant} ${mio.reportes_cant === 1 ? "acto inseguro reportado" : "actos inseguros reportados"}. Te ${mio.reportes_faltan === 1 ? "falta 1" : `faltan ${mio.reportes_faltan}`} para el máximo.`
                      : `${mio.reportes_cant} actos inseguros reportados: tenés el máximo.`
                  }
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lo que no te corresponde (por ejemplo, si no pickeaste) no te resta: se reparte el
              peso entre lo demás.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Todavía no aparecés en el ranking de este bimestre. Entrás cuando tengas un sector 5S
            asignado o registros de picking o despacho. Si te parece un error, avisale a tu
            supervisor.
          </CardContent>
        </Card>
      )}

      {/* Tabla de todos */}
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
        Es el parcial del bimestre: se actualiza con cada auditoría, error cargado y reporte. El
        podio se confirma cuando cierra.
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
