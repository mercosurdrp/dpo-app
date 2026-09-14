"use client"

/**
 * Popup «¿de dónde sale?» de los umbrales del calendario.
 *
 * Los umbrales están guardados como números sueltos y en una auditoría hay que
 * poder explicar por qué 648 HL y no 720, o por qué 2% de rechazo. Este diálogo
 * recalcula sobre el año base en qué percentil cae cada uno, cuántos días dan
 * esa P y cuántos juntan PPP / PP.
 *
 * No propone valores: describe los cargados. Si alguien movió un umbral a mano,
 * acá se ve en qué percentil quedó — que es justamente lo que hay que poder
 * responder cuando preguntan por el criterio.
 */

import { useEffect, useState } from "react"
import { HelpCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface Percentiles {
  p50: number
  p75: number
  p90: number
  p95: number
  max: number
}

interface Explicacion {
  anioBase: number
  diasBase: number
  volumen: {
    umbralPico: number
    percentiles: Percentiles
    percentilDelPico: number
    diasSuperanPico: number
    capacidad: { camiones: number; hlPorCamion: number; pctOcupacion: number }
  }
  rechazo: {
    umbral: number
    metaOficial: number
    percentiles: Percentiles
    percentilDelUmbral: number
    promedioBase: number | null
    diasSuperan: number
  }
  ausentismo: {
    umbral: number
    distribucion: { valor: number; dias: number }[]
    diasSuperan: number
  }
  cruce: {
    ppp: number
    pp: number
    p: number
    fechasPPP: string[]
  }
}

const hl = (n: number) => `${Math.round(n).toLocaleString("es-AR")} HL`
const pct = (n: number) => `${(n * 100).toFixed(2)}%`
const fmtFecha = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{valor}</span>
    </div>
  )
}

export function ExplicacionUmbrales() {
  const [data, setData] = useState<Explicacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!abierto || data) return
    fetch("/api/planeamiento/periodos-criticos/umbrales/explicacion")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => setError("No se pudo calcular la explicación"))
  }, [abierto, data])

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className="flex items-center gap-1 text-xs text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-800">
        <HelpCircle className="size-3.5" />
        ¿de dónde salen estos umbrales y qué dan?
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>De dónde sale cada umbral y qué da el cruce</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {!data && !error && (
          <p className="text-sm text-muted-foreground">Calculando…</p>
        )}

        {data && (
          <div className="space-y-5 text-sm">
            <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
              Calculado sobre <b>{data.diasBase} días hábiles de {data.anioBase}</b>{" "}
              (el año anterior al vigente, como pide R3.4.1). Se excluyen domingos
              y días sin operación: incluirlos correría los percentiles hacia abajo
              y haría parecer excepcional un día normal.
            </p>

            {/* ── Cruce ── */}
            <section className="rounded-md border border-slate-200 p-3">
              <h3 className="mb-1.5 font-semibold text-slate-800">
                El cruce en {data.anioBase}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-red-600 py-2 text-white">
                  <div className="text-lg font-bold">{data.cruce.ppp}</div>
                  <div className="text-[11px]">días PPP · críticos</div>
                </div>
                <div className="rounded bg-amber-300 py-2 text-amber-950">
                  <div className="text-lg font-bold">{data.cruce.pp}</div>
                  <div className="text-[11px]">días PP · atención</div>
                </div>
                <div className="rounded bg-emerald-500/80 py-2 text-white">
                  <div className="text-lg font-bold">{data.cruce.p}</div>
                  <div className="text-[11px]">días con una sola P</div>
                </div>
              </div>
              {data.cruce.fechasPPP.length > 0 ? (
                <p className="mt-2 text-xs text-slate-600">
                  PPP: {data.cruce.fechasPPP.map(fmtFecha).join(" · ")}
                </p>
              ) : (
                <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                  Ningún día de {data.anioBase} juntó las tres P con estos umbrales. Para que
                  aparezcan días críticos hay que bajar alguno de los tres (mirá abajo cuántos
                  días da cada uno).
                </p>
              )}
            </section>

            {/* ── Volumen ── */}
            <section>
              <h3 className="mb-1.5 font-semibold text-slate-800">
                P de volumen — {hl(data.volumen.umbralPico)}
              </h3>
              <p className="mb-2 text-xs text-slate-600">
                No es un percentil: es la <b>capacidad de la flota</b> —{" "}
                {data.volumen.capacidad.camiones} camiones ×{" "}
                {data.volumen.capacidad.hlPorCamion} HL ×{" "}
                {(data.volumen.capacidad.pctOcupacion * 100).toFixed(0)}% de ocupación de bodega.
                Cae en el <b>percentil {data.volumen.percentilDelPico}</b> de los días hábiles de{" "}
                {data.anioBase}; llegaron a ese volumen{" "}
                <b>{data.volumen.diasSuperanPico} días</b> de {data.diasBase}.
              </p>
              <Fila label="p50 (día típico)" valor={hl(data.volumen.percentiles.p50)} />
              <Fila label="p75" valor={hl(data.volumen.percentiles.p75)} />
              <Fila label="p90" valor={hl(data.volumen.percentiles.p90)} />
              <Fila label="p95" valor={hl(data.volumen.percentiles.p95)} />
              <Fila label="Máximo del año" valor={hl(data.volumen.percentiles.max)} />
            </section>

            {/* ── Rechazo ── */}
            <section>
              <h3 className="mb-1.5 font-semibold text-slate-800">
                P de rechazo — más de {pct(data.rechazo.umbral)}
              </h3>
              <p className="mb-2 text-xs text-slate-600">
                Tasa de rechazo del día (HL rechazados sobre entregados). La meta oficial del
                indicador es {pct(data.rechazo.metaOficial)} (nodo <code>rechazo</code> del Árbol
                del Sueño); el umbral del calendario marca cuándo el día está claramente fuera,
                no cuándo está fuera de meta. Cae en el{" "}
                <b>percentil {data.rechazo.percentilDelUmbral}</b>; lo superaron{" "}
                <b>{data.rechazo.diasSuperan} días</b> de {data.diasBase}.
              </p>
              {data.rechazo.promedioBase !== null && (
                <Fila label={`Promedio ${data.anioBase}`} valor={pct(data.rechazo.promedioBase)} />
              )}
              <Fila label="p50 (día típico)" valor={pct(data.rechazo.percentiles.p50)} />
              <Fila label="p75" valor={pct(data.rechazo.percentiles.p75)} />
              <Fila label="p90" valor={pct(data.rechazo.percentiles.p90)} />
              <Fila label="Máximo del año" valor={pct(data.rechazo.percentiles.max)} />
            </section>

            {/* ── Ausentismo ── */}
            <section>
              <h3 className="mb-1.5 font-semibold text-slate-800">
                P de ausentismo — {pct(data.ausentismo.umbral)} o más
              </h3>
              <p className="mb-2 text-xs text-slate-600">
                % de ausentes del día sobre la dotación del sector. Viene en <b>escalones</b>{" "}
                (1 ausente de 30 = 3,33%, 2 = 6,67%, 3 = 10%), así que el umbral se lee en
                personas: con {pct(data.ausentismo.umbral)} hacen falta{" "}
                <b>{Math.ceil(data.ausentismo.umbral * 30 - 1e-9)} ausentes</b> el mismo día.
                Lo alcanzaron <b>{data.ausentismo.diasSuperan} días</b> de {data.diasBase}.
              </p>
              {data.ausentismo.distribucion.map((d) => (
                <Fila
                  key={d.valor}
                  label={`${pct(d.valor)} (${Math.round(d.valor * 30)} ausente${Math.round(d.valor * 30) === 1 ? "" : "s"})`}
                  valor={`${d.dias} días`}
                />
              ))}
            </section>

            <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
              Un día es <b>crítico</b> cuando junta las tres P el mismo día: volumen en la
              capacidad, rechazo y ausentismo por encima del umbral. Con dos P queda en{" "}
              <b>atención</b>. Una sola P no cambia el color.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
