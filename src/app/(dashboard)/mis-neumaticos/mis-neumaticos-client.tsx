"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, CircleAlert, Gauge, Loader2 } from "lucide-react"
import {
  guardarMedicionesNeumaticos,
  type MisNeumaticosData,
} from "@/actions/mis-neumaticos"
import { motivoDesvio, validarProfundidad } from "@/lib/flota/neumaticos-control"
import { cn } from "@/lib/utils"

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

  const listo = cargadas.length > 0 && erroresProf.length === 0 && !pendiente

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

            {unidad.cubiertas.length === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Esta unidad no tiene cubiertas cargadas en el maestro. Avisale al
                Supervisor de Flota: sin eso no hay dónde anotar la medición.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {unidad.cubiertas.map((c) => {
                  const v = valores[c.id] ?? { mm: "", psi: "" }
                  const errorMm = validarProfundidad(v.mm)
                  const desvio = errorMm
                    ? null
                    : motivoDesvio(aNumero(v.mm), aNumero(v.psi))
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-lg border p-3",
                        desvio
                          ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                          : "",
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {c.posicion ?? "—"}
                          {c.eje ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {c.eje}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.numero ? `N° ${c.numero}` : ""}
                          {c.profundidadActual != null
                            ? ` · último ${c.profundidadActual} mm`
                            : ""}
                        </span>
                      </div>

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
                            type="text"
                            inputMode="decimal"
                            placeholder="11.5"
                            value={v.mm}
                            onChange={(e) => setValor(c.id, "mm", e.target.value)}
                            className={cn(
                              "mt-1 w-full rounded-lg border bg-background p-3 text-sm",
                              errorMm ? "border-red-400 ring-1 ring-red-300" : "",
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
