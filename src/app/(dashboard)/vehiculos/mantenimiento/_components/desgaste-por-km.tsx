"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Gauge, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  DESVIO_ALERTA_PCT,
  MIN_KM_TRAMO,
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
//
// 🚨 La forma de la pantalla sale de un problema concreto: al 14/09/2026 sólo 2
// de 108 cubiertas instaladas tienen tasa propia. Con cinco solapas, cuatro
// números y dos selectores, la pantalla prometía mucho más de lo que el dato
// daba y no se entendía. Ahora hay UN corte a la vez, un gráfico de barras
// transversales y la tabla del mismo corte debajo; la evolución mensual —que es
// el único dato firme hoy— queda siempre a la vista al pie.

const fmt = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtFecha = (f: string | null) =>
  f ? new Date(f + "T12:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" }) : "—"

const fmtDia = (f: string | null | undefined) =>
  f ? new Date(f + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—"

const EJE_LABEL: Record<string, string> = {
  direccional: "Direccional",
  traccion: "Tracción",
}
const TIPO_LABEL: Record<string, string> = {
  nuevo: "Nuevas",
  recapado: "Recapadas",
}

type Vista = "cubiertas" | "unidades" | "ejes" | "tipos" | "marcas"

const VISTAS: Array<{ v: Vista; label: string; cap: string }> = [
  { v: "cubiertas", label: "Cubierta", cap: "La que más rápido se gasta arriba" },
  { v: "unidades", label: "Unidad", cap: "Una recta por camión, con todos sus puntos" },
  { v: "ejes", label: "Eje", cap: "Direccional contra tracción" },
  { v: "tipos", label: "Nueva o recapada", cap: "Lo que rinde una recapada contra una nueva" },
  { v: "marcas", label: "Marca", cap: "Una recta por marca, con todas sus cubiertas" },
]

/**
 * Cada cuántos km se expresa el desgaste. El cálculo es siempre el mismo
 * (mm cada 1.000 km, que es como sale de la regresión): esto cambia sólo cómo
 * se muestra. A 1.000 km el número es legible de una; cada 100 km es la unidad
 * con la que se habla en el taller; por km hace falta para comparar dos gomas
 * que se gastan casi igual.
 */
const ESCALAS = [
  { km: 1, label: "por km", corto: "mm/km", dec: 5 },
  { km: 100, label: "cada 100 km", corto: "mm/100 km", dec: 3 },
  { km: 1000, label: "cada 1.000 km", corto: "mm/1.000 km", dec: 2 },
] as const

type Escala = (typeof ESCALAS)[number]

/** Pasa una tasa (mm/1.000 km) a la escala elegida. */
const enEscala = (mmPorMilKm: number | null | undefined, e: Escala) =>
  mmPorMilKm == null ? null : (mmPorMilKm * e.km) / 1000

/**
 * Debajo de esta cantidad de cubiertas con tasa, el promedio de la flota no es
 * un promedio de la flota y el tablero lo dice. No es un número fino: es el
 * orden de "más de dos unidades completas", que es lo mínimo para que una
 * cubierta rara no arrastre el total.
 */
const COBERTURA_MINIMA = 12

/** Valor del filtro de unidad cuando no se acota a ninguna. */
const TODAS = "__todas__"

/**
 * Cuánta confianza merece una barra. Se dibuja en la FORMA de la barra además
 * del texto, porque la columna "confianza" es justamente la que no se lee: una
 * cubierta medida sobre 752 km y otra sobre 22.895 se veían igual de firmes.
 */
type Confianza = "firme" | "orientativo" | "imposible"

const CONFIANZA_CHIP: Record<Confianza, string> = {
  firme: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  orientativo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  imposible: "border-destructive/40 bg-destructive/10 text-destructive",
}

/** Una fila del gráfico, venga de una cubierta o de un grupo. */
interface Barra {
  id: string
  titulo: string
  sub: string
  /** mm/1.000 km. Cuando `confianza` no es "firme" es un valor orientativo. */
  valor: number | null
  confianza: Confianza
  etiqueta: string
  dominio?: string | null
}

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
  /** Acota la tabla por cubierta a una unidad. No toca los promedios de arriba:
   *  esos son de la flota y tienen que seguir siendo comparables. */
  const [filtroUnidad, setFiltroUnidad] = useState<string>(TODAS)
  const [periodo, setPeriodo] = useState<PeriodoDesgaste>("todo")
  const [escalaKm, setEscalaKm] = useState<number>(100)
  /** Fila resaltada: se pinta a la vez en la barra y en la tabla. */
  const [sel, setSel] = useState<string | null>(null)
  const escala = ESCALAS.find((e) => e.km === escalaKm) ?? ESCALAS[1]

  const filas = useMemo(() => data.periodos[periodo] ?? [], [data.periodos, periodo])
  const conTasa = useMemo(() => filas.filter((f) => f.mmPorMilKm != null), [filas])
  /** Las que tienen dos puntos de ronda con km: las únicas que se pueden dibujar. */
  const medibles = useMemo(() => filas.filter((f) => f.tramoPuntos.length >= 2), [filas])
  // 🚨 Los agrupados van sobre TODAS las filas, no sobre `conTasa`: la tasa de
  // un grupo se ajusta juntando los puntos de sus cubiertas, y las que no
  // llegan al piso individual son justamente las que el agregado rescata. Con
  // `conTasa` el eje mostraba el promedio de las 1 o 2 cubiertas que zafaban.
  const promedios = useMemo(() => porUnidad(filas), [filas])
  // Referencia para el desvío: los pares de la misma unidad Y el mismo eje.
  const pares = useMemo(() => paresPorUnidadEje(filas), [filas])

  const promFlota = useMemo(() => promedioPonderado(filas), [filas])
  const kmPorMmFlota =
    promFlota != null && promFlota > 0 ? Math.round(1_000 / promFlota) : null

  /** Todas las unidades con cubiertas instaladas, tengan tasa o no. */
  const unidades = useMemo(
    () =>
      [...new Set(filas.map((f) => f.cubierta.dominio).filter((d): d is string => !!d))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [filas]
  )

  /** Las cubiertas que se dibujan, ya ordenadas y filtradas por unidad. */
  const cubiertasVisibles = useMemo(() => {
    const base =
      filtroUnidad === TODAS
        ? medibles
        : medibles.filter((f) => f.cubierta.dominio === filtroUnidad)
    return [...base].sort((a, b) => (tasaVisible(b) ?? -1) - (tasaVisible(a) ?? -1))
  }, [medibles, filtroUnidad])

  /** Con la unidad elegida se listan también sus cubiertas sin tramo, con el motivo. */
  const sinTramoDeUnidad = useMemo(
    () =>
      filtroUnidad === TODAS
        ? []
        : filas.filter(
            (f) => f.cubierta.dominio === filtroUnidad && f.tramoPuntos.length < 2
          ),
    [filas, filtroUnidad]
  )

  const grupos: PromedioDesgaste[] = useMemo(() => {
    if (vista === "unidades") return promedios
    if (vista === "ejes")
      return porEje(filas).map((g) => ({ ...g, clave: EJE_LABEL[g.clave] ?? g.clave }))
    if (vista === "tipos")
      return porTipo(filas).map((g) => ({ ...g, clave: TIPO_LABEL[g.clave] ?? g.clave }))
    if (vista === "marcas") return porMarca(filas)
    return []
  }, [vista, promedios, filas])

  /** El modelo único que come el gráfico, venga de cubiertas o de grupos. */
  const barras: Barra[] = useMemo(() => {
    if (vista === "cubiertas") return cubiertasVisibles.map(barraDeCubierta)
    return grupos.map(barraDeGrupo)
  }, [vista, cubiertasVisibles, grupos])

  // Las que se gastan mucho más rápido que sus pares del mismo camión: el
  // síntoma no es la goma, es alineación, presión o falta de rotación.
  const desviadas = useMemo(
    () =>
      conTasa
        .map((f) => ({ fila: f, desvio: desvioContraPares(f, pares) }))
        .filter((r) => r.desvio != null && r.desvio >= DESVIO_ALERTA_PCT)
        .sort((a, b) => (b.desvio ?? 0) - (a.desvio ?? 0)),
    [conTasa, pares]
  )

  // Por qué las demás no tienen tasa. Se muestra: un tablero que dice "2
  // cubiertas" sin decir qué pasa con las otras 106 se lee como si esas 106
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

  const capVista = VISTAS.find((v) => v.v === vista)?.cap ?? ""

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-muted-foreground" /> Desgaste por km
            <Badge variant="outline" className="text-[10px] font-normal">
              DPO 3.4
            </Badge>
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Milímetros de dibujo que se consumen {escala.label}, calculados con las
            mediciones de la ronda mensual. Cada cubierta se mide dentro de su tramo de
            vida: un recapado reinicia la cuenta, y el auxilio no entra porque no rueda.
            Sólo cuentan las rondas con calibre (desde julio/2026): el dibujo que se
            carga al dar de alta una cubierta es un valor nominal, no una medición.
          </p>
        </div>
        {/* Con una sola ventana el selector ofrecería tres veces el mismo
            número (ver `PeriodoDesgaste`): se muestra recién cuando haya más de
            una, y cada opción dice cuántas cubiertas quedan con dato. */}
        {PERIODOS_DESGASTE.length > 1 ? (
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
        ) : (
          <Badge variant="outline" className="shrink-0 self-start text-[10px] font-normal">
            {PERIODO_DESGASTE_LABEL[periodo]}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---------------------------------------------------- cabecera */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato
            label="Promedio de la flota"
            valor={`${fmt(enEscala(promFlota, escala), escala.dec)} mm`}
            sub={escala.label}
          />
          <Dato
            label="Rendimiento"
            valor={kmPorMmFlota != null ? `${fmt(kmPorMmFlota)} km` : "—"}
            sub="por cada mm de goma"
          />
          <Dato
            label="Cubiertas con ritmo"
            valor={`${conTasa.length}/${filas.length}`}
            sub={`medidas dos veces y con ${fmt(MIN_KM_TRAMO)} km o más`}
            alerta={conTasa.length < COBERTURA_MINIMA}
          />
          <Dato
            label="Desgaste desparejo"
            valor={String(desviadas.length)}
            sub={`+${DESVIO_ALERTA_PCT}% sobre sus pares de eje`}
            alerta={desviadas.length > 0}
          />
        </div>

        {/* 🚨 El promedio de la flota es ponderado por km: con pocas cubiertas
            medidas lo dictan una o dos, y se lee como si fuera de la flota
            entera. Pasó al revés y por eso está este aviso: hasta el
            25/08/2026 el tablero mostraba un promedio armado sobre 33
            cubiertas que arrancaban de un valor nominal de alta. */}
        {conTasa.length < COBERTURA_MINIMA && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Este promedio sale de{" "}
            <span className="font-medium text-foreground">
              {conTasa.length} de {filas.length} cubiertas
            </span>
            : todavía no es el desgaste de la flota. Hacen falta varias rondas seguidas
            con la flota completa —entre dos rondas un camión hace ~2.000 km y el dibujo
            se gasta menos de lo que dispersa el calibre—. Mientras tanto la lectura
            firme es la profundidad ronda por ronda, al pie.
          </p>
        )}

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

        {/* --------------------------------------------------- controles */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Control label="Ver por">
            <Segmented
              opciones={VISTAS.map((v) => ({ valor: v.v, label: v.label }))}
              valor={vista}
              onChange={(v) => {
                setVista(v as Vista)
                setSel(null)
              }}
            />
          </Control>
          <Control label="Escala">
            <Segmented
              opciones={ESCALAS.map((e) => ({ valor: String(e.km), label: e.label }))}
              valor={String(escalaKm)}
              onChange={(v) => setEscalaKm(Number(v))}
            />
          </Control>
          {vista === "cubiertas" && unidades.length > 1 && (
            <Control label="Unidad">
              <Select
                value={filtroUnidad}
                onValueChange={(v) => {
                  if (!v) return
                  setFiltroUnidad(v)
                  setSel(null)
                }}
              >
                <SelectTrigger className="h-8 w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>
                    Todas ({medibles.length} medibles)
                  </SelectItem>
                  {unidades.map((u) => {
                    const medible = medibles.filter((f) => f.cubierta.dominio === u).length
                    const total = filas.filter((f) => f.cubierta.dominio === u).length
                    return (
                      <SelectItem key={u} value={u}>
                        {u} ({medible}/{total} medibles)
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Control>
          )}
        </div>

        {/* ----------------------------------------------------- gráfico */}
        {barras.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay dos rondas medidas con km en este corte. La lectura que sí
            sirve hoy es la profundidad ronda por ronda, acá abajo.
          </p>
        ) : (
          <>
            <Barras
              barras={barras}
              promFlota={promFlota}
              escala={escala}
              cap={capVista}
              sel={sel}
              dominioSel={dominioSel}
              onSel={(id) => setSel((prev) => (prev === id ? null : id))}
            />

            {/* ------------------------------------------------- tabla */}
            {vista === "cubiertas" ? (
              <TablaCubiertas
                filas={cubiertasVisibles}
                sinTramo={sinTramoDeUnidad}
                pares={pares}
                escala={escala}
                sel={sel}
                dominioSel={dominioSel}
                onSel={(id) => setSel((prev) => (prev === id ? null : id))}
                onIrAUnidad={onIrAUnidad}
              />
            ) : (
              <TablaGrupo
                titulo={VISTAS.find((v) => v.v === vista)?.label ?? ""}
                filas={grupos}
                escala={escala}
                sel={sel}
                dominioSel={dominioSel}
                onSel={(id) => setSel((prev) => (prev === id ? null : id))}
                onClickClave={vista === "unidades" ? onIrAUnidad : undefined}
              />
            )}
          </>
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

        {/* Por qué las demás no tienen ritmo: contadas y explicadas, no escondidas */}
        {sinTasa.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Las otras {sinTasa.reduce((a, [, n]) => a + n, 0)} · por qué no tienen ritmo
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {sinTasa.map(([motivo, n]) => (
                <div key={motivo} className="rounded-md border border-border p-2.5">
                  <p className="text-lg font-semibold tabular-nums">{n}</p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {MOTIVO_SIN_TASA_LABEL[motivo]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* La evolución no depende de la tasa: son profundidades medidas. Es lo
            único firme hoy, así que queda siempre a la vista y sin cambios. */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Evolución mensual
          </p>
          <EvolucionProfundidad
            puntos={data.evolucion}
            dominioSel={dominioSel}
            onIrAUnidad={onIrAUnidad}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------ modelo de barra

/**
 * La tasa que se muestra de una cubierta. Cuando el cálculo no la da —tramo
 * corto, desgaste por debajo del piso— se cae al observado (mm medidos sobre km
 * medidos), que es orientativo y se dibuja rayado. Sin esto la pantalla no
 * mostraba NADA de nueve de las once cubiertas que sí se midieron dos veces.
 */
function tasaVisible(f: FilaDesgaste): number | null {
  if (f.mmPorMilKm != null) return f.mmPorMilKm
  if (f.kmMedidos != null && f.kmMedidos > 0 && f.mmObservados != null && f.mmObservados > 0)
    return Math.round((f.mmObservados / f.kmMedidos) * 1_000 * 1000) / 1000
  return null
}

function confianzaDe(f: FilaDesgaste): { c: Confianza; etiqueta: string } {
  if (f.mmPorMilKm != null) return { c: "firme", etiqueta: "Confirmado" }
  if (f.mmObservados != null && f.mmObservados < 0)
    return { c: "imposible", etiqueta: "Midió más" }
  if (f.motivo === "tramo_corto") return { c: "orientativo", etiqueta: "Tramo corto" }
  if (f.motivo === "sin_desgaste") return { c: "orientativo", etiqueta: "Bajo el mínimo" }
  return { c: "orientativo", etiqueta: f.motivo ? MOTIVO_SIN_TASA_LABEL[f.motivo] : "Sin dato" }
}

function barraDeCubierta(f: FilaDesgaste): Barra {
  const { c, etiqueta } = confianzaDe(f)
  return {
    id: f.neumatico_id,
    titulo: `${f.cubierta.dominio ?? "—"} ${f.cubierta.posicion ?? ""}`.trim(),
    sub: `${f.cubierta.marca || "sin marca"}${f.cubierta.numero ? ` · N° ${f.cubierta.numero}` : ""}`,
    valor: tasaVisible(f),
    confianza: c,
    etiqueta,
    dominio: f.cubierta.dominio,
  }
}

function barraDeGrupo(g: PromedioDesgaste): Barra {
  // R² dice qué tan bien la recta explica las mediciones del grupo. Con menos
  // de tres puntos no existe, y ahí lo que manda son los km del ajuste.
  const firme = g.kmMedidos >= MIN_KM_TRAMO && (g.r2 == null || g.r2 >= 0.5)
  return {
    id: g.clave,
    titulo: g.clave,
    sub: `${g.cubiertas} cubierta${g.cubiertas === 1 ? "" : "s"} · ${fmt(g.kmMedidos)} km`,
    valor: g.mmPorMilKm,
    confianza: firme ? "firme" : "orientativo",
    etiqueta: firme ? "Confirmado" : "Ajuste flojo",
    dominio: g.clave,
  }
}

// ------------------------------------------------------------------ piezas

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

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

function Segmented({
  opciones,
  valor,
  onChange,
}: {
  opciones: Array<{ valor: string; label: string }>
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap overflow-hidden rounded-md border border-border">
      {opciones.map((o, i) => (
        <Button
          key={o.valor}
          type="button"
          size="sm"
          variant={valor === o.valor ? "default" : "ghost"}
          aria-pressed={valor === o.valor}
          className={cn(
            "h-8 rounded-none px-3 text-xs",
            i > 0 && "border-l border-border"
          )}
          onClick={() => onChange(o.valor)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

/** Chip de confianza: el mismo vocabulario en la barra y en la tabla. */
function ChipConfianza({ c, texto }: { c: Confianza; texto: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide",
        CONFIANZA_CHIP[c]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {texto}
    </span>
  )
}

/**
 * El gráfico: barras transversales, la más rápida arriba, con la línea del
 * promedio de la flota cruzando todo.
 *
 * 🚨 La confianza va en la FORMA de la barra, no sólo en una columna de texto:
 * llena = ritmo confirmado, rayada = tramo demasiado corto (orientativo),
 * rayada en rojo = la cubierta midió MÁS goma que la ronda anterior, que es
 * imposible y hay que corregir. Antes una cubierta medida sobre 752 km se veía
 * igual de firme que una medida sobre 22.895.
 */
function Barras({
  barras,
  promFlota,
  escala,
  cap,
  sel,
  dominioSel,
  onSel,
}: {
  barras: Barra[]
  promFlota: number | null
  escala: Escala
  cap: string
  sel: string | null
  dominioSel?: string
  onSel: (id: string) => void
}) {
  const max = Math.max(
    promFlota ?? 0,
    ...barras.map((b) => b.valor ?? 0),
    Number.EPSILON
  )
  const ratio = promFlota != null && max > 0 ? promFlota / max : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{cap}</span>
        <span>{escala.corto}</span>
      </div>

      <div className="relative [--lbl:7.5rem] [--val:4.5rem] sm:[--lbl:12rem] sm:[--val:5.5rem]">
        {barras.map((b) => {
          const pct = b.valor == null ? 4 : Math.max(1.5, (b.valor / max) * 100)
          return (
            <div
              key={b.id}
              role="button"
              tabIndex={0}
              aria-label={`${b.titulo}: ${fmt(enEscala(b.valor, escala), escala.dec)} ${escala.corto}`}
              onClick={() => onSel(b.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSel(b.id)
                }
              }}
              className={cn(
                "grid cursor-pointer items-center gap-3 rounded-md px-1.5 py-1",
                "grid-cols-[var(--lbl)_1fr_var(--val)]",
                "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                sel === b.id && "bg-muted",
                sel !== b.id && dominioSel && b.dominio === dominioSel && "bg-primary/5"
              )}
            >
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-xs font-medium text-foreground">
                  {b.titulo}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {b.sub}
                </span>
              </span>
              <span className="relative block h-4 rounded-sm bg-muted">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-sm",
                    b.confianza === "imposible"
                      ? "text-destructive"
                      : "text-sky-600 dark:text-sky-400",
                    b.confianza === "firme" && "bg-current"
                  )}
                  style={{
                    width: `${pct}%`,
                    ...(b.confianza === "firme"
                      ? {}
                      : {
                          backgroundImage:
                            "repeating-linear-gradient(135deg, currentColor 0 4px, transparent 4px 8px)",
                          boxShadow: "inset 0 0 0 1px currentColor",
                        }),
                  }}
                />
              </span>
              <span
                className={cn(
                  "text-right text-xs tabular-nums",
                  b.valor == null ? "text-muted-foreground" : "font-medium text-foreground"
                )}
              >
                {fmt(enEscala(b.valor, escala), escala.dec)}
              </span>
            </div>
          )
        })}

        {/* Promedio de la flota cruzando el gráfico: cada barra se lee contra
            esta línea. El cálculo del left replica el grid de arriba. */}
        {ratio != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-amber-500"
            style={{
              left: `calc(0.375rem + var(--lbl) + 0.75rem + (100% - var(--lbl) - var(--val) - 2.25rem) * ${ratio})`,
            }}
          >
            <span className="absolute -top-0.5 left-1 whitespace-nowrap bg-card px-1 text-[10px] tabular-nums text-amber-600 dark:text-amber-400">
              flota {fmt(enEscala(promFlota, escala), escala.dec)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-muted-foreground">
        <Leyenda clase="bg-sky-600 dark:bg-sky-400">Ritmo confirmado</Leyenda>
        <Leyenda clase="text-sky-600 dark:text-sky-400" rayado>
          Tramo corto · orientativo
        </Leyenda>
        <Leyenda clase="text-destructive" rayado>
          Midió igual o más que antes
        </Leyenda>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-0 border-l-2 border-dashed border-amber-500" />
          Promedio de la flota
        </span>
      </div>
    </div>
  )
}

function Leyenda({
  clase,
  rayado,
  children,
}: {
  clase: string
  rayado?: boolean
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn("inline-block h-2.5 w-5 rounded-sm", clase)}
        style={
          rayado
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, currentColor 0 4px, transparent 4px 8px)",
                boxShadow: "inset 0 0 0 1px currentColor",
              }
            : undefined
        }
      />
      {children}
    </span>
  )
}

/**
 * La tabla por cubierta muestra LAS DOS MEDICIONES y los km entre ellas, no
 * sólo el resultado. Sin eso el ritmo es un número que aparece de la nada y no
 * hay forma de discutirlo contra el papel de la ronda.
 */
function TablaCubiertas({
  filas,
  sinTramo,
  pares,
  escala,
  sel,
  dominioSel,
  onSel,
  onIrAUnidad,
}: {
  filas: FilaDesgaste[]
  sinTramo: FilaDesgaste[]
  pares: PromedioDesgaste[]
  escala: Escala
  sel: string | null
  dominioSel?: string
  onSel: (id: string) => void
  onIrAUnidad?: (dominio: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2">Cubierta</th>
            <th className="px-2">Marca</th>
            <th className="px-2">Eje</th>
            <th className="px-2 text-right">1ª medición</th>
            <th className="px-2 text-right">2ª medición</th>
            <th className="px-2 text-right">Gastó</th>
            <th className="px-2 text-right">Rodó</th>
            <th className="px-2 text-right">{escala.corto}</th>
            <th
              className="px-2 text-right"
              title="Contra el promedio de las cubiertas de la misma unidad y el mismo eje"
            >
              vs. pares
            </th>
            <th className="px-2 text-right">Km a {PROF_OBJETIVO_MM} mm</th>
            <th className="px-2">Confianza</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const p0 = f.tramoPuntos[0]
            const p1 = f.tramoPuntos[f.tramoPuntos.length - 1]
            const desvio = desvioContraPares(f, pares)
            const critico = desvio != null && desvio >= DESVIO_ALERTA_PCT
            const { c, etiqueta } = confianzaDe(f)
            const mm = f.mmObservados ?? null
            return (
              <tr
                key={f.neumatico_id}
                onClick={() => onSel(f.neumatico_id)}
                className={cn(
                  "cursor-pointer border-b last:border-0 hover:bg-muted/60",
                  sel === f.neumatico_id && "bg-muted",
                  sel !== f.neumatico_id &&
                    dominioSel &&
                    f.cubierta.dominio === dominioSel &&
                    "bg-primary/5"
                )}
              >
                <td className="px-2 py-2">
                  {f.cubierta.dominio && onIrAUnidad ? (
                    <button
                      className="font-medium text-foreground hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onIrAUnidad(f.cubierta.dominio!)
                      }}
                      title="Abrir el diagrama de la unidad"
                    >
                      {f.cubierta.dominio}
                    </button>
                  ) : (
                    <span className="font-medium">{f.cubierta.dominio ?? "—"}</span>
                  )}{" "}
                  <span className="font-medium">{f.cubierta.posicion || ""}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    N° {f.cubierta.numero || "s/n"}
                  </span>
                </td>
                <td className="max-w-[12rem] truncate px-2 text-muted-foreground">
                  {f.cubierta.marca || "—"}
                </td>
                <td className="px-2 text-muted-foreground">
                  {f.cubierta.eje ? EJE_LABEL[f.cubierta.eje] ?? f.cubierta.eje : "—"}
                </td>
                <td className="px-2 text-right tabular-nums">
                  {fmt(p0?.prof, 2)} mm
                  <span className="block text-[11px] text-muted-foreground">
                    {fmtDia(p0?.fecha)} · {fmt(p0?.km)} km
                  </span>
                </td>
                <td className="px-2 text-right tabular-nums">
                  {fmt(p1?.prof, 2)} mm
                  <span className="block text-[11px] text-muted-foreground">
                    {fmtDia(p1?.fecha)} · {fmt(p1?.km)} km
                  </span>
                </td>
                <td
                  className={cn(
                    "px-2 text-right tabular-nums",
                    mm != null && mm < 0 && "font-medium text-destructive"
                  )}
                >
                  {mm == null ? "—" : `${mm < 0 ? "+" : ""}${fmt(Math.abs(mm), 2)} mm`}
                </td>
                <td className="px-2 text-right tabular-nums text-muted-foreground">
                  {fmt(f.kmMedidos)} km
                </td>
                <td className="px-2 text-right font-medium tabular-nums">
                  {fmt(enEscala(tasaVisible(f), escala), escala.dec)}
                </td>
                <td
                  className={cn(
                    "px-2 text-right tabular-nums",
                    critico
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  )}
                >
                  {desvio == null ? "—" : `${desvio > 0 ? "+" : ""}${desvio}%`}
                </td>
                <td className="px-2 text-right tabular-nums">{fmt(f.kmHastaCambio)}</td>
                <td className="px-2">
                  <ChipConfianza c={c} texto={etiqueta} />
                </td>
              </tr>
            )
          })}

          {/* Con una unidad elegida, sus cubiertas que todavía no se pueden
              medir van acá con el motivo: es la información que falta saber. */}
          {sinTramo.map((f) => (
            <tr key={f.neumatico_id} className="border-b last:border-0 text-muted-foreground">
              <td className="px-2 py-2">
                <span className="font-medium">
                  {f.cubierta.dominio} {f.cubierta.posicion || ""}
                </span>
                <span className="block text-[11px]">N° {f.cubierta.numero || "s/n"}</span>
              </td>
              <td className="max-w-[12rem] truncate px-2">{f.cubierta.marca || "—"}</td>
              <td className="px-2">
                {f.cubierta.eje ? EJE_LABEL[f.cubierta.eje] ?? f.cubierta.eje : "—"}
              </td>
              <td className="px-2 text-center text-[11px]" colSpan={7}>
                {f.motivo ? MOTIVO_SIN_TASA_LABEL[f.motivo] : "Sin dato"}
              </td>
              <td className="px-2">
                <ChipConfianza c="orientativo" texto="Sin medir" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaGrupo({
  titulo,
  filas,
  escala,
  sel,
  dominioSel,
  onSel,
  onClickClave,
}: {
  titulo: string
  filas: PromedioDesgaste[]
  escala: Escala
  sel: string | null
  dominioSel?: string
  onSel: (id: string) => void
  onClickClave?: (clave: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2">{titulo}</th>
            <th className="px-2 text-right">Cubiertas</th>
            <th className="px-2 text-right">Km medidos</th>
            <th className="px-2 text-right">Mediciones</th>
            <th className="px-2 text-right">{escala.corto}</th>
            <th className="px-2 text-right">Km por mm</th>
            <th
              className="px-2 text-right"
              title="Qué tan bien la recta explica las mediciones. Con menos de tres puntos no existe."
            >
              R²
            </th>
            <th className="px-2">Confianza</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((g) => {
            const b = barraDeGrupo(g)
            return (
              <tr
                key={g.clave}
                onClick={() => onSel(g.clave)}
                className={cn(
                  "cursor-pointer border-b last:border-0 hover:bg-muted/60",
                  sel === g.clave && "bg-muted",
                  sel !== g.clave && dominioSel === g.clave && "bg-primary/5"
                )}
              >
                <td className="px-2 py-2 font-medium">
                  {onClickClave ? (
                    <button
                      className="hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onClickClave(g.clave)
                      }}
                      title="Abrir el diagrama de la unidad"
                    >
                      {g.clave}
                    </button>
                  ) : (
                    g.clave
                  )}
                </td>
                <td className="px-2 text-right tabular-nums text-muted-foreground">
                  {g.cubiertas}
                </td>
                <td className="px-2 text-right tabular-nums text-muted-foreground">
                  {fmt(g.kmMedidos)}
                </td>
                <td className="px-2 text-right tabular-nums text-muted-foreground">
                  {g.puntos}
                </td>
                <td className="px-2 text-right font-medium tabular-nums">
                  {fmt(enEscala(g.mmPorMilKm, escala), escala.dec)}
                </td>
                <td className="px-2 text-right tabular-nums text-muted-foreground">
                  {g.mmPorMilKm > 0 ? fmt(Math.round(1_000 / g.mmPorMilKm)) : "—"}
                </td>
                <td className="px-2 text-right tabular-nums text-muted-foreground">
                  {g.r2 == null ? "—" : g.r2.toFixed(2)}
                </td>
                <td className="px-2">
                  <ChipConfianza c={b.confianza} texto={b.etiqueta} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
