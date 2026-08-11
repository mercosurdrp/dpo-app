"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, CircleDot, Gauge, Ruler } from "lucide-react"
import {
  guardarRevisionNeumaticos,
  type MisNeumaticosData,
} from "@/actions/mis-neumaticos"
import { cn } from "@/lib/utils"

const TIPO_LABEL: Record<string, string> = {
  camion: "Camión",
  camioneta: "Camioneta",
  autoelevador: "Autoelevador",
  utilitario: "Utilitario",
  acoplado: "Acoplado",
}

const EJE_LABEL: Record<string, string> = {
  direccional: "dirección",
  traccion: "tracción",
}

/** Mismo corte que el módulo de mantenimiento: ≤ 3 mm es cambio. */
const PROFUNDIDAD_CRITICA_MM = 3

function fmtMes(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1)
  )
}

export function MisNeumaticosClient({ data }: { data: MisNeumaticosData }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [dominio, setDominio] = useState("")
  const [km, setKm] = useState("")
  // Un valor por cubierta: { [id]: { prof, presion } } — se guarda todo junto.
  const [valores, setValores] = useState<
    Record<string, { prof: string; presion: string }>
  >({})
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<number | null>(null)

  const unidad = data.unidades.find((u) => u.dominio === dominio) ?? null

  const cargadas = useMemo(
    () =>
      Object.values(valores).filter((v) => v.prof.trim() !== "" || v.presion.trim() !== "")
        .length,
    [valores]
  )

  function setValor(id: string, campo: "prof" | "presion", valor: string) {
    setValores((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { prof: "", presion: "" }), [campo]: valor },
    }))
  }

  function elegirUnidad(d: string) {
    setDominio(d)
    setValores({})
    setKm("")
    setOk(null)
    setError(null)
  }

  function guardar() {
    if (!unidad) return
    setError(null)
    const mediciones = unidad.cubiertas
      .map((c) => {
        const v = valores[c.id]
        return {
          neumatico_id: c.id,
          profundidad_mm: v?.prof.trim() ? Number(v.prof.replace(",", ".")) : null,
          presion_psi: v?.presion.trim() ? Number(v.presion.replace(",", ".")) : null,
        }
      })
      .filter((m) => m.profundidad_mm != null || m.presion_psi != null)

    if (mediciones.length === 0) {
      setError("Cargá al menos una medición")
      return
    }
    if (mediciones.some((m) => Number.isNaN(m.profundidad_mm) || Number.isNaN(m.presion_psi))) {
      setError("Hay un número mal escrito")
      return
    }

    iniciar(async () => {
      const res = await guardarRevisionNeumaticos({
        dominio: unidad.dominio,
        km: km.trim() ? Number(km) : null,
        mediciones,
      })
      if ("error" in res) {
        setError(res.error)
        return
      }
      setOk(res.guardadas)
      setValores({})
      setKm("")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-24">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CircleDot className="size-6 text-primary" /> Neumáticos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Una vez por mes se mide la profundidad del dibujo y la presión de cada cubierta
          de la unidad. Cargá lo que mediste: van todas juntas en una sola carga.
        </p>
      </header>

      {ok !== null && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span className="text-sm font-medium">
            {ok === 1 ? "Medición guardada" : `${ok} mediciones guardadas`}. Gracias.
          </span>
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <label className="text-sm font-medium text-foreground">1 · ¿Qué unidad?</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.unidades.map((u) => {
              const medidas = u.cubiertas.filter((c) => c.medidaEsteMes).length
              return (
                <button
                  key={u.dominio}
                  type="button"
                  onClick={() => elegirUnidad(u.dominio)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    dominio === u.dominio
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "hover:bg-accent"
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
                      "mt-1 block text-[11px] font-medium",
                      medidas === u.cubiertas.length
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {medidas}/{u.cubiertas.length} medidas este mes
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {unidad && (
          <>
            <div>
              <label className="text-sm font-medium text-foreground">
                2 · Kilómetros del odómetro
                <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="Como figura en el tablero"
                className="mt-2 w-full rounded-lg border bg-background p-3 text-base"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">
                3 · Profundidad y presión de cada cubierta
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                La profundidad va en milímetros (con el calibre en la ranura del dibujo) y
                la presión en psi. Si una rueda no la mediste, dejala vacía.
              </p>
              <div className="mt-2 space-y-2">
                {unidad.cubiertas.map((c) => {
                  const v = valores[c.id] ?? { prof: "", presion: "" }
                  const critica =
                    c.profundidad_actual_mm != null &&
                    c.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM
                  return (
                    <div key={c.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-foreground">
                          {c.posicion}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.eje ? EJE_LABEL[c.eje] ?? c.eje : "auxilio"}
                          {c.numero ? ` · N° ${c.numero}` : ""}
                          {c.medida ? ` · ${c.medida}` : ""}
                        </span>
                        {c.profundidad_actual_mm != null && (
                          <span
                            className={cn(
                              "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
                              critica
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            última {c.profundidad_actual_mm} mm
                          </span>
                        )}
                      </div>
                      {c.medidaEsteMes && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Ya se cargó este mes ({c.medidaEsteMes.profundidad_mm ?? "—"} mm ·{" "}
                          {c.medidaEsteMes.presion_psi ?? "—"} psi). Si la volvés a medir,
                          se guarda la nueva.
                        </p>
                      )}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Ruler className="size-3" /> Profundidad (mm)
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            inputMode="decimal"
                            value={v.prof}
                            onChange={(e) => setValor(c.id, "prof", e.target.value)}
                            className="mt-1 w-full rounded-lg border bg-background p-3 text-base"
                          />
                        </label>
                        <label className="block">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Gauge className="size-3" /> Presión (psi)
                          </span>
                          <input
                            type="number"
                            step="1"
                            inputMode="decimal"
                            value={v.presion}
                            onChange={(e) => setValor(c.id, "presion", e.target.value)}
                            className="mt-1 w-full rounded-lg border bg-background p-3 text-base"
                          />
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={guardar}
              disabled={pendiente || cargadas === 0}
              className={cn(
                "w-full rounded-lg bg-primary p-4 text-base font-semibold text-primary-foreground transition-opacity",
                (pendiente || cargadas === 0) && "opacity-50"
              )}
            >
              {pendiente
                ? "Guardando…"
                : `Guardar revisión${cargadas > 0 ? ` (${cargadas})` : ""}`}
            </button>
          </>
        )}

        {data.unidades.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay cubiertas cargadas en ninguna unidad. Avisale a mantenimiento.
          </p>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Ronda de {fmtMes(data.mes)}
      </p>
    </div>
  )
}
