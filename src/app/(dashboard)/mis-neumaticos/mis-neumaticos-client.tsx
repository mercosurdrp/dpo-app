"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, CircleAlert, Gauge, Loader2 } from "lucide-react"
import {
  guardarMedicionesNeumaticos,
  type MisNeumaticosData,
} from "@/actions/mis-neumaticos"
import {
  motivoDesvio,
  validarProfundidad,
  TOLERANCIA_SUBIDA_MM,
} from "@/lib/flota/neumaticos-control"
import { cn } from "@/lib/utils"
import { etiquetaCubierta } from "@/lib/vehiculos/numeracion-fuego"
import {
  POSICION_AUXILIO,
  ejeNumero,
  layoutDeTipo,
  posicionEnPalabras,
  type PosicionNeumatico,
} from "@/lib/vehiculos/neumaticos-layout"
import { SiluetaUnidad } from "@/components/flota/silueta-unidad"
import type { VehiculoTipo } from "@/types/database"

const TIPO_LABEL: Record<string, string> = {
  camion: "Camión",
  autoelevador: "Autoelevador",
}

/** Lo que el chofer tipeó, sin convertir todavía. */
type Valores = Record<string, { mm: string; psi: string }>

function aNumero(txt: string): number | null {
  const limpio = txt.replace(",", ".").trim()
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

export function MisNeumaticosClient({ data }: { data: MisNeumaticosData }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [dominio, setDominio] = useState("")
  const [valores, setValores] = useState<Valores>({})
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const unidad = data.unidades.find((u) => u.dominio === dominio) ?? null
  const pendientes = data.unidades.filter((u) => !u.completa)

  // Lo cargado en pantalla, ya convertido a número.
  const cargadas = useMemo(() => {
    if (!unidad) return []
    return unidad.cubiertas
      .map((c) => ({
        neumatico_id: c.id,
        posicion: c.posicion,
        profundidad_mm: aNumero(valores[c.id]?.mm ?? ""),
        presion_psi: aNumero(valores[c.id]?.psi ?? ""),
      }))
      .filter((m) => m.profundidad_mm != null || m.presion_psi != null)
  }, [unidad, valores])

  function setValor(id: string, campo: "mm" | "psi", txt: string) {
    setValores((prev) => {
      const actual = prev[id] ?? { mm: "", psi: "" }
      return { ...prev, [id]: { ...actual, [campo]: txt } }
    })
  }

  function elegirUnidad(dom: string) {
    setDominio(dom)
    setError(null)
    setOk(null)
    // Si ya se midió este mes, se muestran los valores cargados para que el
    // chofer vea qué puso y pueda corregirlo sin tener que acordarse.
    const u = data.unidades.find((x) => x.dominio === dom)
    const inicial: Valores = {}
    for (const c of u?.cubiertas ?? []) {
      inicial[c.id] = {
        mm: c.medidaEsteMes?.profundidad_mm?.toString() ?? "",
        psi: c.medidaEsteMes?.presion_psi?.toString() ?? "",
      }
    }
    setValores(inicial)
  }

  function guardar() {
    if (!unidad) return
    setError(null)
    iniciar(async () => {
      const res = await guardarMedicionesNeumaticos(
        unidad.dominio,
        cargadas.map(({ neumatico_id, profundidad_mm, presion_psi }) => ({
          neumatico_id,
          profundidad_mm,
          presion_psi,
        })),
      )
      if ("error" in res) {
        setError(res.error)
        return
      }
      setOk(
        res.desvios > 0
          ? `Guardadas ${res.guardadas} cubiertas. ${res.desvios} quedaron fuera de norma: avisale al Supervisor de Flota.`
          : `Guardadas ${res.guardadas} cubiertas. Todas dentro de norma.`,
      )
      router.refresh()
    })
  }

  // 🚨 Con una sola profundidad mal escrita no se guarda NADA: si dejáramos
  // pasar el resto, el chofer cree que cargó todo y la cubierta del error queda
  // sin medir y sin que nadie lo note.
  const erroresProf = unidad
    ? unidad.cubiertas
        .map((c) => ({
          posicion: c.posicion,
          error: validarProfundidad(valores[c.id]?.mm ?? ""),
        }))
        .filter((e) => e.error)
    : []

  /**
   * La goma no crece: una medición más alta que la anterior es tipeo o rueda
   * equivocada. La regla ya vivía en el servidor, pero recién saltaba al apretar
   * Guardar y con toda la ronda cargada; acá se marca la cubierta en rojo en el
   * momento y no se deja guardar. Se compara contra la medición anterior, que no
   * cruza el último montaje (una cubierta recapada sí vuelve con más dibujo).
   */
  const subeDe = (c: MisNeumaticosData["unidades"][number]["cubiertas"][number]) => {
    const ref = c.referencia
    const mm = aNumero(valores[c.id]?.mm ?? "")
    if (!ref || mm == null || validarProfundidad(valores[c.id]?.mm ?? "")) return null
    if (mm <= ref.profundidad_mm + TOLERANCIA_SUBIDA_MM) return null
    return ref
  }

  const queSuben = unidad ? unidad.cubiertas.filter((c) => subeDe(c) != null) : []

  /** Último dibujo conocido de una cubierta: la referencia, o la profundidad de la ficha. */
  const ultimoDibujo = (
    c: MisNeumaticosData["unidades"][number]["cubiertas"][number],
  ): number | null => c.referencia?.profundidad_mm ?? c.profundidadActual

  const listo =
    cargadas.length > 0 && erroresProf.length === 0 && queSuben.length === 0 && !pendiente

  // Esquema de la unidad: tocar una posición lleva al campo de esa cubierta. Es
  // el mismo dibujo del módulo del supervisor, con los costados rotulados.
  const layout = unidad ? layoutDeTipo((unidad.tipo as VehiculoTipo | null) ?? null) : []
  const cubiertaDePos = new Map(
    (unidad?.cubiertas ?? []).map((c) => [c.posicion ?? "", c])
  )

  function irACubierta(id: string) {
    const el = document.getElementById(`mm-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.focus({ preventScroll: true })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-24">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Gauge className="size-6 text-primary" /> Neumáticos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Una vez por mes: medí el dibujo y la presión de todas las cubiertas de
          tu unidad.
        </p>
      </header>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Unidades medidas este mes
          </span>
          <span className="text-sm font-semibold text-foreground">
            {data.completas} / {data.totalUnidades}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              data.completas >= data.totalUnidades ? "bg-emerald-500" : "bg-primary",
            )}
            style={{
              width: `${
                data.totalUnidades
                  ? Math.min(100, (data.completas / data.totalUnidades) * 100)
                  : 0
              }%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Dentro de norma: dibujo de {data.limites.profMin} mm o más, presión
          entre {data.limites.psiMin} y {data.limites.psiMax} psi.
        </p>
      </div>

      {/* Qué unidades quedan sin cerrar el mes: mismo aviso que en Mi CIL, para
          que el chofer no tenga que preguntar y no caiga todo sobre las mismas. */}
      {pendientes.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
            <CircleAlert className="size-4 shrink-0" />
            Faltan {pendientes.length} unidad
            {pendientes.length === 1 ? "" : "es"} este mes
          </p>
          <ul className="mt-2 space-y-1">
            {pendientes.map((u) => (
              <li key={u.dominio} className="text-sm text-amber-900 dark:text-amber-200">
                <span className="font-medium">{u.dominio}</span>
                {u.numero && <span className="text-xs"> (N° {u.numero})</span>}
                <span className="text-xs">
                  {" — "}
                  {u.total === 0
                    ? "sin cubiertas cargadas"
                    : `${u.total - u.medidas} de ${u.total} sin medir`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span className="text-sm font-medium">
            Todas las unidades tienen sus cubiertas medidas este mes.
          </span>
        </div>
      )}

      {ok && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <span className="text-sm font-medium">{ok}</span>
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <label className="text-sm font-medium text-foreground">
            1 · ¿Qué unidad?
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.unidades.map((u) => (
              <button
                key={u.dominio}
                type="button"
                onClick={() => elegirUnidad(u.dominio)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  dominio === u.dominio
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-accent",
                )}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {u.numero ? `${u.numero} · ` : ""}
                  {u.dominio}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {TIPO_LABEL[u.tipo ?? ""] ?? u.tipo ?? ""}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-xs font-medium",
                    u.completa
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {u.completa ? "Mes cerrado" : `${u.medidas}/${u.total} medidas`}
                </span>
              </button>
            ))}
          </div>
        </div>

        {unidad && (
          <div>
            <label className="text-sm font-medium text-foreground">
              2 · Cubiertas de {unidad.dominio}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Cargá lo que midas. Lo que dejes vacío no se guarda.
            </p>

            {/* Qué cubierta es cuál: el código (1I, 2DE) no se deduce parado al
                lado de la rueda.
                🚨 La referencia es el LADO DE LA CABINA, no izquierda/derecha.
                El 19/10/2026 se comprobó que las direccionales del AF028YB se
                venían cargando con los lados cambiados, y la causa era ésta:
                "izquierda" cambia según hacia dónde mire el que está midiendo. */}
            {unidad.cubiertas.length > 0 && (
              <BuscadorDeRueda
                layout={layout}
                tipo={(unidad.tipo as VehiculoTipo | null) ?? null}
                cubiertaDePos={cubiertaDePos}
                onElegir={irACubierta}
              />
            )}

            {unidad.cubiertas.length > 0 && (
              <div className="mt-3 rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground">
                  …o tocá la rueda en el esquema
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  El frente del camión va arriba.{" "}
                  <strong className="text-foreground">
                    Guiate por el lado de la cabina, no por izquierda y derecha:
                  </strong>{" "}
                  el lado del conductor es el del volante, mires para donde mires.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  En los ejes de rueda doble, <strong className="text-foreground">la de
                  afuera</strong> es la que ves desde el costado del camión y{" "}
                  <strong className="text-foreground">la de adentro</strong> es la que
                  queda pegada a ella, del lado del chasis.
                </p>
                <div className="relative mx-auto mt-2 aspect-[3/4] w-full max-w-[17rem]">
                  <SiluetaUnidad layout={layout} tipo={(unidad.tipo as VehiculoTipo | null) ?? null} conLados />
                  {layout.map((p) => {
                    const c = cubiertaDePos.get(p.code)
                    const v = c ? (valores[c.id] ?? { mm: "", psi: "" }) : null
                    const mal = c ? validarProfundidad(v?.mm ?? "") || subeDe(c) != null : false
                    const cargada = !!v?.mm.trim() && !mal
                    return (
                      <button
                        key={p.code}
                        type="button"
                        disabled={!c}
                        onClick={() => c && irACubierta(c.id)}
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        className={cn(
                          "absolute flex size-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-[11px] font-semibold",
                          mal
                            ? "border-red-400 bg-red-500/15 text-red-700 dark:text-red-400"
                            : cargada
                              ? "border-emerald-400 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : c
                                ? "border-border bg-background text-foreground"
                                : "border-dashed border-border bg-muted/40 text-muted-foreground/60"
                        )}
                        title={
                          c
                            ? `${p.label} · ${posicionEnPalabras((unidad.tipo as VehiculoTipo | null) ?? null, p.code).texto}`
                            : `${p.label} · sin cubierta cargada`
                        }
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {unidad.cubiertas.length === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Esta unidad no tiene cubiertas cargadas en el maestro. Avisale al
                Supervisor de Flota: sin eso no hay dónde anotar la medición.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {/* 🚨 Dónde apoyar el calibre, no cómo usarlo. Dos rondas
                    enteras se descartaron por leer BAJO —la del 14/09 en cuatro
                    unidades y la del 13/08 en el AE908DH, ésta hasta 3 mm— y el
                    instrumento no tuvo nada que ver: un calibre digital se
                    equivoca en centésimas, no en milímetros. Lo que mueve
                    milímetros es apoyar la varilla sobre el testigo de desgaste
                    o cambiar de canal entre rondas. El criterio existía sólo en
                    un comentario del código; el que mide nunca lo vio. */}
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-foreground">
                    Antes de medir: dónde apoyar el calibre
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    <li>
                      <strong className="text-foreground">Siempre el mismo canal</strong>, el
                      del centro de la banda. El canal del hombro tiene otra profundidad y
                      cambiar de canal entre rondas se lee después como desgaste.
                    </li>
                    <li>
                      <strong className="text-foreground">Nunca sobre el testigo de
                      desgaste</strong> — el resaltito que aparece cada tanto dentro del
                      canal. Está a 1,6 mm del fondo, así que apoyar ahí te hace leer unos
                      2 mm de menos en toda la unidad.
                    </li>
                    <li>
                      Con el calibre <strong className="text-foreground">cerrado tiene que
                      marcar 0,00</strong>. Si marca otra cosa, ponelo en cero antes de
                      arrancar.
                    </li>
                  </ul>
                </div>
                {unidad.cubiertas.map((c) => {
                  const v = valores[c.id] ?? { mm: "", psi: "" }
                  const errorMm = validarProfundidad(v.mm)
                  const sube = subeDe(c)
                  const desvio = errorMm
                    ? null
                    : motivoDesvio(aNumero(v.mm), aNumero(v.psi))
                  const palabras = posicionEnPalabras(
                    (unidad.tipo as VehiculoTipo | null) ?? null,
                    c.posicion,
                  )
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-lg border p-3",
                        sube || desvio
                          ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                          : "",
                      )}
                    >
                      {/* 🚨 Adelante va la posición EN PALABRAS y el código
                          queda atrás, chico. Al revés —que es como estaba— el
                          que mide lee "2DE" y tiene que traducirlo solo: ahí se
                          cargaron los lados cambiados en el YB. */}
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {palabras.texto ? (
                            <>
                              {palabras.eje}
                              {palabras.ladoFisico ? (
                                <>
                                  {" · "}
                                  <span className="text-primary">
                                    {palabras.ladoFisico.replace("Lado del ", "")}
                                  </span>
                                </>
                              ) : null}
                              {palabras.rueda ? ` · ${palabras.rueda}` : ""}
                            </>
                          ) : (
                            (c.posicion ?? "—")
                          )}
                          {palabras.texto && c.posicion ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              ({c.posicion})
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.numero ? `N° ${etiquetaCubierta(c)}` : ""}
                          {c.referencia
                            ? ` · medía ${c.referencia.profundidad_mm} mm el ${c.referencia.fecha.slice(8, 10)}/${c.referencia.fecha.slice(5, 7)}`
                            : c.profundidadActual != null
                              ? ` · último ${c.profundidadActual} mm`
                              : ""}
                        </span>
                      </div>

                      {/* 🚨 El auxilio viaja EN la unidad pero no apoya: la
                          mayoría de los meses vuelve con el mismo dibujo con el
                          que salió. Al chofer eso lo dejaba trabado —no tiene
                          qué medir, y sin el campo cargado la ronda no cierra—,
                          así que lo llenaba a ojo o salteaba la cubierta. Con
                          esto repite el último dibujo conocido de un toque.

                          Va SÓLO en el AUX a propósito: en las que apoyan, un
                          botón de "repetir" sería una forma de cerrar la ronda
                          sin bajarse a medir, que es justo lo que el control
                          mensual tiene que evitar. La presión sigue a mano: el
                          auxilio se desinfla igual aunque no ruede. */}
                      {c.posicion === POSICION_AUXILIO && ultimoDibujo(c) != null && (
                        <button
                          type="button"
                          onClick={() => setValor(c.id, "mm", String(ultimoDibujo(c)))}
                          className="mt-2 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                        >
                          No rodó este mes — repetir {ultimoDibujo(c)} mm
                        </button>
                      )}

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-xs text-muted-foreground">
                            Dibujo (mm)
                          </span>
                          {/* 🚨 `text` y no `number`: hace falta ver lo que el
                              chofer tipeó tal cual para exigirle el decimal. Un
                              input `number` se come la coma y deja pasar "115"
                              como si fuera un valor válido. */}
                          <input
                            id={`mm-${c.id}`}
                            type="text"
                            inputMode="decimal"
                            placeholder="11.5"
                            value={v.mm}
                            onChange={(e) => setValor(c.id, "mm", e.target.value)}
                            className={cn(
                              "mt-1 w-full rounded-lg border bg-background p-3 text-sm",
                              errorMm || sube ? "border-red-400 ring-1 ring-red-300" : "",
                            )}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted-foreground">
                            Presión (psi)
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            step="1"
                            min="0"
                            value={v.psi}
                            onChange={(e) => setValor(c.id, "psi", e.target.value)}
                            className="mt-1 w-full rounded-lg border bg-background p-3 text-sm"
                          />
                        </label>
                      </div>

                      {errorMm && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                          {errorMm}
                        </p>
                      )}

                      {sube && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            Esta cubierta medía <strong>{sube.profundidad_mm} mm</strong> el{" "}
                            {sube.fecha.slice(8, 10)}/{sube.fecha.slice(5, 7)}/
                            {sube.fecha.slice(0, 4)} y estás cargando{" "}
                            <strong>{v.mm} mm</strong>: la goma no puede tener más dibujo que
                            antes. Fijate si te sobró un dígito o si es otra rueda. Si volvió
                            del recapador, avisale al Supervisor de Flota.
                          </span>
                        </p>
                      )}

                      {desvio && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                          {desvio}
                        </p>
                      )}

                      {c.medidaEsteMes && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Ya medida este mes el{" "}
                          {c.medidaEsteMes.fecha.slice(8, 10)}/
                          {c.medidaEsteMes.fecha.slice(5, 7)}. Si volvés a
                          guardar, queda la medición nueva.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {queSuben.length > 0 && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {queSuben.length === 1 ? "La cubierta " : "Las cubiertas "}
            {queSuben.map((c) => c.posicion ?? "—").join(", ")}{" "}
            {queSuben.length === 1 ? "quedó" : "quedaron"} con más dibujo que la medición
            anterior. Corregí ese número: hasta que no esté bien no se guarda ninguna.
          </p>
        )}

        {erroresProf.length > 0 && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            Revisá la profundidad de{" "}
            {erroresProf.map((e) => e.posicion ?? "—").join(", ")}: va con punto y
            un decimal (11.5, y si son 12 justos, 12.0). Hasta que no esté bien no
            se guarda ninguna, para que no quede media carga.
          </p>
        )}

        {unidad && unidad.cubiertas.length > 0 && (
          <button
            type="button"
            disabled={!listo}
            onClick={guardar}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary p-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            {pendiente
              ? "Guardando…"
              : `Guardar ${cargadas.length} cubierta${cargadas.length === 1 ? "" : "s"}`}
          </button>
        )}
      </section>
    </div>
  )
}

/**
 * Buscador guiado de rueda.
 *
 * 🚨 Nace del AF028YB: el 19/10/2026 se comprobó que las direccionales se
 * venían cargando con los lados cambiados, y la causa no fue distracción. El
 * esquema de arriba es un mapa visto desde ARRIBA, y el que mide está parado
 * AL LADO de la rueda, muchas veces mirando de frente al camión: ahí izquierda
 * y derecha se dan vuelta. Pedirle que se ubique en el mapa es pedirle que haga
 * una rotación mental, y la mitad de las veces sale mal.
 *
 * Acá se invierte: en vez de buscar la rueda en un dibujo, contesta dónde está
 * parado y la app resuelve el código. El lado se pregunta por la CABINA, que no
 * depende de hacia dónde mire. El esquema sigue abajo para el que prefiere
 * tocarlo — las dos formas llevan al mismo casillero.
 */
/* 🚨 `Opcion` y `Paso` viven ACÁ y no dentro de `BuscadorDeRueda`. Declarar un
   componente dentro del render lo vuelve a crear en cada pasada, así que React
   lo trata como otro componente y le descarta el estado. Hoy ninguno de los dos
   tiene estado propio, pero el día que alguien le agregue uno el bug no se iba
   a entender. Lo marca `react-hooks/static-components`. */
function Opcion({
  activo,
  onClick,
  titulo,
  ayuda,
}: {
  activo: boolean
  onClick: () => void
  titulo: string
  ayuda?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border p-3 text-left transition-colors",
        activo
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:bg-muted/50"
      )}
    >
      <span className="block text-sm font-semibold text-foreground">{titulo}</span>
      {ayuda && (
        <span className="mt-0.5 block text-xs text-muted-foreground">{ayuda}</span>
      )}
    </button>
  )
}

function Paso({ n, texto }: { n: number; texto: string }) {
  return (
    <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-xs font-semibold text-foreground first:mt-0">
      <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
        {n}
      </span>
      {texto}
    </p>
  )
}

function BuscadorDeRueda({
  layout,
  tipo,
  cubiertaDePos,
  onElegir,
}: {
  layout: PosicionNeumatico[]
  tipo: VehiculoTipo | null
  cubiertaDePos: Map<string, MisNeumaticosData["unidades"][number]["cubiertas"][number]>
  onElegir: (id: string) => void
}) {
  const [lado, setLado] = useState<string | null>(null)
  const [eje, setEje] = useState<number | null>(null)

  const ruedas = layout.filter((p) => p.code !== POSICION_AUXILIO)
  const lados = [...new Set(ruedas.map((p) => p.code[1]))].filter(
    (l) => l === "I" || l === "D"
  )
  const ejesDelLado = [
    ...new Set(
      ruedas.filter((p) => p.code[1] === lado).map((p) => ejeNumero(p.code))
    ),
  ].filter((n): n is number => n != null)
  const candidatas = ruedas.filter(
    (p) => p.code[1] === lado && ejeNumero(p.code) === eje
  )
  // Una sola candidata = el eje no es de rueda doble: ya está resuelto.
  const resuelta = candidatas.length === 1 ? candidatas[0] : null

  const nombreEje = (n: number) =>
    posicionEnPalabras(tipo, `${n}${lado ?? "I"}`).eje ?? `Eje ${n}`

  const irA = (code: string) => {
    const c = cubiertaDePos.get(code)
    if (c) onElegir(c.id)
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          ¿Cuál es cuál? Contestá y te llevo al casillero
        </p>
        {(lado || eje) && (
          <button
            type="button"
            onClick={() => {
              setLado(null)
              setEje(null)
            }}
            className="text-xs text-muted-foreground underline"
          >
            Empezar de nuevo
          </button>
        )}
      </div>

      <Paso n={1} texto="¿De qué lado del camión estás parado?" />
      <div className="flex gap-2">
        {lados.map((l) => (
          <Opcion
            key={l}
            activo={lado === l}
            onClick={() => {
              setLado(l)
              setEje(null)
            }}
            titulo={l === "I" ? "Lado del CONDUCTOR" : "Lado del ACOMPAÑANTE"}
            ayuda={l === "I" ? "El del volante" : "El otro"}
          />
        ))}
      </div>

      {lado && (
        <>
          <Paso n={2} texto="¿Qué eje?" />
          <div className="flex gap-2">
            {ejesDelLado.map((n) => {
              const dobles =
                ruedas.filter((p) => p.code[1] === lado && ejeNumero(p.code) === n)
                  .length > 1
              return (
                <Opcion
                  key={n}
                  activo={eje === n}
                  onClick={() => setEje(n)}
                  titulo={nombreEje(n)}
                  ayuda={dobles ? "Rueda doble" : "Una rueda por lado"}
                />
              )
            })}
          </div>
        </>
      )}

      {lado && eje != null && candidatas.length > 1 && (
        <>
          <Paso n={3} texto="¿Cuál de las dos?" />
          <div className="flex gap-2">
            {candidatas
              .slice()
              .sort((a) => (a.code[2] === "E" ? -1 : 1))
              .map((p) => (
                <Opcion
                  key={p.code}
                  activo={false}
                  onClick={() => irA(p.code)}
                  titulo={p.code[2] === "E" ? "La de AFUERA" : "La de ADENTRO"}
                  ayuda={
                    p.code[2] === "E"
                      ? "La que ves parado al costado"
                      : "La que queda pegada a la de afuera"
                  }
                />
              ))}
          </div>
        </>
      )}

      {resuelta && (
        <div className="mt-3">
          <Opcion
            activo={false}
            onClick={() => irA(resuelta.code)}
            titulo={`Ir a ${posicionEnPalabras(tipo, resuelta.code).texto}`}
            ayuda={
              cubiertaDePos.get(resuelta.code)
                ? `Cubierta ${etiquetaCubierta(cubiertaDePos.get(resuelta.code)!)}`
                : "Sin cubierta cargada en esta posición"
            }
          />
        </div>
      )}

      {cubiertaDePos.get(POSICION_AUXILIO) && (
        <button
          type="button"
          onClick={() => irA(POSICION_AUXILIO)}
          className="mt-3 w-full rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground hover:bg-muted/50"
        >
          Estoy en la rueda de auxilio
        </button>
      )}
    </div>
  )
}
