"use client"

import { useMemo, useState } from "react"
import { Gauge, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  DESVIO_ALERTA_PCT,
  MOTIVO_SIN_TASA_LABEL,
  PERIODOS_DESGASTE,
  PERIODO_DESGASTE_LABEL,
  PROF_OBJETIVO_MM,
  desvioContraPares,
  paresPorUnidadEje,
  porEje,
  porMarca,
  porTipo,
  porUnidad,
  promedioPonderado,
  type FilaDesgaste,
  type MotivoSinTasa,
  type PeriodoDesgaste,
  type PromedioDesgaste,
} from "@/lib/vehiculos/desgaste-neumaticos"
import type { DesgasteFlota } from "@/actions/neumaticos"
import { EvolucionProfundidad } from "./evolucion-profundidad"

// Tablero de desgaste real de cubiertas: cuántos mm de dibujo se come la flota
// cada 1.000 km. Sale del historial de la ronda mensual (DPO 3.4), así que la
// calidad de lo que muestra depende de que la ronda se cargue completa.
//
// Vive fuera de `neumaticos-module.tsx` a propósito: ese archivo ya pasa las
// 4.700 líneas.

const fmt = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtFecha = (f: string | null) =>
  f ? new Date(f + "T12:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" }) : "—"

const EJE_LABEL: Record<string, string> = {
  direccional: "Direccional",
  traccion: "Tracción",
}
const TIPO_LABEL: Record<string, string> = {
  nuevo: "Nuevas",
  recapado: "Recapadas",
}

type Vista = "cubiertas" | "unidades" | "ejes" | "marcas" | "evolucion"

export function DesgastePorKmCard({
  data,
  dominioSel,
  onIrAUnidad,
}: {
  data: DesgasteFlota
  /** Unidad abierta en el diagrama, para resaltarla en los rankings. */
  dominioSel?: string
  onIrAUnidad?: (dominio: string) => void
}) {
  const [vista, setVista] = useState<Vista>("cubiertas")
  const [periodo, setPeriodo] = useState<PeriodoDesgaste>("todo")

  const filas = useMemo(() => data.periodos[periodo] ?? [], [data.periodos, periodo])
  const conTasa = useMemo(() => filas.filter((f) => f.mmPorMilKm != null), [filas])
  const promedios = useMemo(() => porUnidad(conTasa), [conTasa])
  // Referencia para el desvío: los pares de la misma unidad Y el mismo eje.
  const pares = useMemo(() => paresPorUnidadEje(conTasa), [conTasa])

  const promFlota = useMemo(() => promedioPonderado(conTasa), [conTasa])
  const kmPorMmFlota =
    promFlota != null && promFlota > 0 ? Math.round(1_000 / promFlota) : null

  // Ranking de cubiertas, la que más rápido se gasta primero.
  const ranking = useMemo(
    () =>
      [...conTasa].sort((a, b) => (b.mmPorMilKm ?? 0) - (a.mmPorMilKm ?? 0)),
    [conTasa]
  )

  // Las que se gastan mucho más rápido que sus pares del mismo camión: el
  // síntoma no es la goma, es alineación, presión o falta de rotación.
  const desviadas = useMemo(
    () =>
      ranking
        .map((f) => ({ fila: f, desvio: desvioContraPares(f, pares) }))
        .filter((r) => r.desvio != null && r.desvio >= DESVIO_ALERTA_PCT),
    [ranking, pares]
  )

  // Por qué las demás no tienen tasa. Se muestra: un tablero que dice "66
  // cubiertas" sin decir qué pasa con las otras 42 se lee como si esas 42
  // estuvieran bien.
  const sinTasa = useMemo(() => {
    const m = new Map<MotivoSinTasa, number>()
    for (const f of filas) {
      if (f.mmPorMilKm != null || !f.motivo) continue
      m.set(f.motivo, (m.get(f.motivo) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [filas])

  const proximas = useMemo(
    () =>
      conTasa
        .filter((f) => f.kmHastaCambio != null)
        .sort((a, b) => (a.kmHastaCambio ?? 0) - (b.kmHastaCambio ?? 0))
        .slice(0, 5),
    [conTasa]
  )

  if (filas.length === 0 && data.evolucion.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-muted-foreground" /> Desgaste por km
            <Badge variant="outline" className="text-[10px] font-normal">
              DPO 3.4
            </Badge>
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Milímetros de dibujo que se consumen cada 1.000 km, calculados con las
            mediciones de la ronda mensual. Cada cubierta se mide dentro de su tramo de
            vida: un recapado reinicia la cuenta, y el auxilio no entra porque no rueda.
          </p>
        </div>
        {/* Acotar la ventana pierde cubiertas: cada opción dice cuántas quedan
            con dato, para que achicar el período sea una decisión informada y no
            una sorpresa. */}
        <Select value={periodo} onValueChange={(v) => v && setPeriodo(v as PeriodoDesgaste)}>
          <SelectTrigger className="w-56 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_DESGASTE.map((pp) => {
              const n = (data.periodos[pp] ?? []).filter((f) => f.mmPorMilKm != null).length
              return (
                <SelectItem key={pp} value={pp}>
                  {PERIODO_DESGASTE_LABEL[pp]} ({n})
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="space-y-4">
        {conTasa.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {periodo === "todo"
                ? "Todavía no hay dos mediciones separadas por suficientes km como para calcular el desgaste. Cargá la ronda mensual dos meses seguidos y el tablero se llena solo."
                : "En esta ventana ninguna cubierta acumula km suficientes como para medir el desgaste. Ampliá el período: la goma se gasta más despacio de lo que un mes de rodaje puede mostrar."}
            </p>
            {/* La evolución no depende de la tasa: son profundidades medidas. */}
            <EvolucionProfundidad
              puntos={data.evolucion}
              dominioSel={dominioSel}
              onIrAUnidad={onIrAUnidad}
            />
          </div>
        ) : (
          <>
            {/* Cabecera de números */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato
                label="Promedio de la flota"
                valor={`${fmt(promFlota, 2)} mm`}
                sub="cada 1.000 km"
              />
              <Dato
                label="Rendimiento"
                valor={kmPorMmFlota != null ? `${fmt(kmPorMmFlota)} km` : "—"}
                sub="por cada mm de goma"
              />
              <Dato
                label="Cubiertas con dato"
                valor={`${conTasa.length}/${filas.length}`}
                sub="instaladas medidas dos veces"
              />
              <Dato
                label="Desgaste desparejo"
                valor={String(desviadas.length)}
                sub={`+${DESVIO_ALERTA_PCT}% sobre sus pares de eje`}
                alerta={desviadas.length > 0}
              />
            </div>

            {/* Aviso accionable: estas no son un problema de goma */}
            {desviadas.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-foreground">
                    {desviadas.length} cubierta{desviadas.length > 1 ? "s se gastan" : " se gasta"}{" "}
                    mucho más rápido que sus pares del mismo eje
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Se compara cada cubierta contra las de su misma unidad y su mismo eje.
                    Cuando dos gomas que comparten camión y eje se gastan a ritmos distintos,
                    el problema no suele ser la goma: mirá alineación, presión y si la
                    rotación está al día.
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums text-muted-foreground">
                    {desviadas.slice(0, 6).map(({ fila, desvio }) => (
                      <span key={fila.neumatico_id}>
                        <span className="font-medium text-foreground">
                          {fila.cubierta.dominio} {fila.cubierta.posicion}
                        </span>{" "}
                        +{desvio}%
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            )}

            <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
              <TabsList className="h-9">
                <TabsTrigger value="cubiertas" className="text-xs">
                  Por cubierta
                </TabsTrigger>
                <TabsTrigger value="unidades" className="text-xs">
                  Por unidad
                </TabsTrigger>
                <TabsTrigger value="ejes" className="text-xs">
                  Por eje
                </TabsTrigger>
                <TabsTrigger value="marcas" className="text-xs">
                  Por marca
                </TabsTrigger>
                <TabsTrigger value="evolucion" className="text-xs">
                  Evolución mensual
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {vista === "cubiertas" && (
              <TablaCubiertas
                filas={ranking}
                pares={pares}
                dominioSel={dominioSel}
                onIrAUnidad={onIrAUnidad}
              />
            )}

            {vista === "unidades" && (
              <TablaGrupo
                titulo="Unidad"
                filas={promedios}
                promFlota={promFlota}
                dominioSel={dominioSel}
                onClickClave={onIrAUnidad}
              />
            )}

            {vista === "ejes" && (
              <TablaGrupo
                titulo="Eje"
                filas={porEje(conTasa).map((g) => ({ ...g, clave: EJE_LABEL[g.clave] ?? g.clave }))}
                promFlota={promFlota}
                extra={porTipo(conTasa).map((g) => ({
                  ...g,
                  clave: TIPO_LABEL[g.clave] ?? g.clave,
                }))}
                extraTitulo="Nuevas vs recapadas"
              />
            )}

            {vista === "evolucion" && (
              <EvolucionProfundidad
                puntos={data.evolucion}
                dominioSel={dominioSel}
                onIrAUnidad={onIrAUnidad}
              />
            )}

            {vista === "marcas" && (
              <TablaGrupo titulo="Marca" filas={porMarca(conTasa)} promFlota={promFlota} />
            )}

            {/* Próximos cambios según el ritmo medido, no según el km teórico */}
            {proximas.length > 0 && (
              <div className="rounded-md border border-border p-3">
                <p className="text-xs font-medium text-foreground">
                  Próximas a llegar a {PROF_OBJETIVO_MM} mm (al ritmo medido)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
                  {proximas.map((f) => (
                    <span key={f.neumatico_id}>
                      <span className="font-medium text-foreground">
                        {f.cubierta.dominio} {f.cubierta.posicion}
                      </span>{" "}
                      {fmt(f.kmHastaCambio)} km
                      {f.fechaCambio ? ` · ${fmtFecha(f.fechaCambio)}` : " · sin ritmo de km/día"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {sinTasa.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Sin tasa:{" "}
            {sinTasa.map(([motivo, n], i) => (
              <span key={motivo}>
                {i > 0 && " · "}
                {n} {MOTIVO_SIN_TASA_LABEL[motivo].toLowerCase()}
              </span>
            ))}
            .
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Dato({
  label,
  valor,
  sub,
  alerta,
}: {
  label: string
  valor: string
  sub: string
  alerta?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          alerta ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        )}
      >
        {valor}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function TablaCubiertas({
  filas,
  pares,
  dominioSel,
  onIrAUnidad,
}: {
  filas: FilaDesgaste[]
  pares: PromedioDesgaste[]
  dominioSel?: string
  onIrAUnidad?: (dominio: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2">Unidad</th>
            <th>Pos.</th>
            <th>Cubierta</th>
            <th>Marca</th>
            <th className="text-right">mm/1.000 km</th>
            <th className="text-right" title="Contra el promedio de las cubiertas de la misma unidad y el mismo eje">
              vs. pares
            </th>
            <th className="text-right">Km/mm</th>
            <th className="text-right">Prof. act.</th>
            <th className="text-right">Km a {PROF_OBJETIVO_MM} mm</th>
            <th className="text-right">Cambio est.</th>
            <th className="text-right pr-1">Medido sobre</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const desvio = desvioContraPares(f, pares)
            const critico = desvio != null && desvio >= DESVIO_ALERTA_PCT
            return (
              <tr
                key={f.neumatico_id}
                className={cn(
                  "border-b last:border-0",
                  i % 2 === 1 && "bg-muted/40",
                  dominioSel && f.cubierta.dominio === dominioSel && "bg-primary/5"
                )}
              >
                <td className="py-2">
                  {f.cubierta.dominio && onIrAUnidad ? (
                    <button
                      className="font-medium text-foreground hover:underline"
                      onClick={() => onIrAUnidad(f.cubierta.dominio!)}
                      title="Abrir el diagrama de la unidad"
                    >
                      {f.cubierta.dominio}
                    </button>
                  ) : (
                    <span className="font-medium">{f.cubierta.dominio ?? "—"}</span>
                  )}
                </td>
                <td className="font-medium">{f.cubierta.posicion || "—"}</td>
                <td className="text-muted-foreground">{f.cubierta.numero || "—"}</td>
                <td className="max-w-[14rem] truncate text-muted-foreground">
                  {f.cubierta.marca || "—"}
                </td>
                <td className="text-right font-medium tabular-nums">{fmt(f.mmPorMilKm, 2)}</td>
                <td
                  className={cn(
                    "text-right tabular-nums",
                    critico
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  )}
                >
                  {desvio == null ? "—" : `${desvio > 0 ? "+" : ""}${desvio}%`}
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {fmt(f.kmPorMm)}
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {fmt(f.cubierta.profundidad_actual_mm, 1)}
                </td>
                <td
                  className={cn(
                    "text-right tabular-nums",
                    f.kmHastaCambio != null && f.kmHastaCambio <= 5_000
                      ? "font-medium text-destructive"
                      : "text-foreground"
                  )}
                >
                  {fmt(f.kmHastaCambio)}
                </td>
                <td className="text-right capitalize tabular-nums text-muted-foreground">
                  {fmtFecha(f.fechaCambio)}
                </td>
                <td
                  className="text-right tabular-nums text-muted-foreground pr-1"
                  title={`${f.puntos} mediciones · ${f.desde} → ${f.hasta}`}
                >
                  {fmt(f.kmMedidos)} km
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TablaGrupo({
  titulo,
  filas,
  promFlota,
  dominioSel,
  onClickClave,
  extra,
  extraTitulo,
}: {
  titulo: string
  filas: PromedioDesgaste[]
  promFlota: number | null
  dominioSel?: string
  onClickClave?: (clave: string) => void
  extra?: PromedioDesgaste[]
  extraTitulo?: string
}) {
  const max = filas.reduce((m, f) => Math.max(m, f.mmPorMilKm), 0)
  return (
    <div className="space-y-4">
      <Barras
        titulo={titulo}
        filas={filas}
        max={max}
        promFlota={promFlota}
        dominioSel={dominioSel}
        onClickClave={onClickClave}
      />
      {extra && extra.length > 0 && (
        <Barras titulo={extraTitulo ?? ""} filas={extra} max={max} promFlota={promFlota} />
      )}
    </div>
  )
}

function Barras({
  titulo,
  filas,
  max,
  promFlota,
  dominioSel,
  onClickClave,
}: {
  titulo: string
  filas: PromedioDesgaste[]
  max: number
  promFlota: number | null
  dominioSel?: string
  onClickClave?: (clave: string) => void
}) {
  if (filas.length === 0)
    return <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {filas.map((f) => {
        // Peor que el promedio de la flota = ámbar. No es una falla, es dónde
        // mirar primero.
        const peor = promFlota != null && f.mmPorMilKm > promFlota
        return (
          <div
            key={f.clave}
            className={cn(
              "flex items-center gap-2 rounded-md px-1.5 py-1",
              dominioSel === f.clave && "bg-primary/5",
              onClickClave && "cursor-pointer hover:bg-muted"
            )}
            onClick={onClickClave ? () => onClickClave(f.clave) : undefined}
          >
            <span className="w-32 shrink-0 truncate text-sm font-medium text-foreground">
              {f.clave}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", peor ? "bg-amber-500" : "bg-sky-500")}
                style={{ width: `${max > 0 ? (f.mmPorMilKm / max) * 100 : 0}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {fmt(f.mmPorMilKm, 2)}
            </span>
            <span
              className="w-28 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
              title="Cubiertas que entraron en el promedio y km medidos sumados"
            >
              {f.cubiertas} cub. · {fmt(f.kmMedidos)} km
            </span>
          </div>
        )
      })}
    </div>
  )
}
