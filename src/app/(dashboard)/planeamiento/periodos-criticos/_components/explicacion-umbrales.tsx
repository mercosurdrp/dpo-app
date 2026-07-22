"use client"

/**
 * Popup «¿de dónde sale?» de los umbrales del calendario.
 *
 * Los umbrales están guardados como números sueltos y en una auditoría hay que
 * poder explicar por qué 792 HL y no 800. Este diálogo recalcula sobre el año
 * base en qué percentil cae cada uno y cuántos días lo superan.
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
    umbralAlto: number
    umbralMedio: number
    percentiles: Percentiles
    percentilDelPico: number
    diasSuperanPico: number
    derivados: { altoPctDelPico: number; medioPctDelPico: number }
  }
  clientes: {
    umbral: number
    percentiles: Percentiles
    percentilDelUmbral: number
    diasSuperan: number
    capacidadFlota: {
      camionesActivos: number
      clientesPorCamionP90: number
      clientesPorCamionMax: number
      capacidadClientes: number | null
    }
  }
  rechazo: {
    umbral: number
    metaOficial: number
    promedioBase: number | null
    diasSuperan: number
  }
  minTriggers: number
}

const hl = (n: number) => `${Math.round(n).toLocaleString("es-AR")} HL`
const pct = (n: number) => `${(n * 100).toFixed(2)}%`

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
        ¿de dónde salen estos umbrales?
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>De dónde sale cada umbral</DialogTitle>
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

            {/* ── Volumen ── */}
            <section>
              <h3 className="mb-1.5 font-semibold text-slate-800">
                Volumen — {hl(data.volumen.umbralPico)}
              </h3>
              <p className="mb-2 text-xs text-slate-600">
                Es un <b>percentil del año anterior</b>: el umbral cae en el{" "}
                <b>percentil {data.volumen.percentilDelPico}</b> de los días
                hábiles. Lo superaron{" "}
                <b>{data.volumen.diasSuperanPico} días</b> de {data.diasBase}.
              </p>
              <Fila label="p50 (día típico)" valor={hl(data.volumen.percentiles.p50)} />
              <Fila label="p75" valor={hl(data.volumen.percentiles.p75)} />
              <Fila label="p90" valor={hl(data.volumen.percentiles.p90)} />
              <Fila label="p95" valor={hl(data.volumen.percentiles.p95)} />
              <Fila label="Máximo del año" valor={hl(data.volumen.percentiles.max)} />
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                <b>Ojo:</b> los umbrales ALTO ({hl(data.volumen.umbralAlto)}) y
                MEDIO ({hl(data.volumen.umbralMedio)}) <b>no son percentiles
                propios</b>: se derivaron del PICO ({data.volumen.derivados.altoPctDelPico}%
                y {data.volumen.derivados.medioPctDelPico}% de su valor). Sólo el
                PICO define días críticos, así que los otros dos son de
                clasificación visual.
              </p>
            </section>

            {/* ── Clientes ── */}
            <section>
              <h3 className="mb-1.5 font-semibold text-slate-800">
                Clientes — {data.clientes.umbral.toLocaleString("es-AR")}
              </h3>
              <p className="mb-2 text-xs text-slate-600">
                Este umbral es <b>operativo, no estadístico</b>: es el punto donde
                se acaban los camiones.
              </p>
              {data.clientes.capacidadFlota.capacidadClientes !== null && (
                <div className="mb-2 rounded-md bg-sky-50 p-2 text-xs text-sky-900">
                  <b>{data.clientes.capacidadFlota.camionesActivos} camiones activos</b>{" "}
                  ×{" "}
                  <b>{data.clientes.capacidadFlota.clientesPorCamionP90} clientes
                  por camión</b>{" "}
                  (p90 del año, o sea a ritmo de día exigido) ={" "}
                  <b>{data.clientes.capacidadFlota.capacidadClientes} clientes</b> de
                  capacidad de flota. Máximo registrado por camión:{" "}
                  {data.clientes.capacidadFlota.clientesPorCamionMax}.
                </div>
              )}
              <Fila label="p50 (día típico)" valor={String(data.clientes.percentiles.p50)} />
              <Fila label="p90" valor={String(data.clientes.percentiles.p90)} />
              <Fila label="Máximo del año" valor={String(data.clientes.percentiles.max)} />
              <Fila
                label="Días que superaron el umbral"
                valor={`${data.clientes.diasSuperan} de ${data.diasBase}`}
              />
              {data.clientes.diasSuperan === 0 && (
                <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                  Ningún día alcanzó el umbral en {data.anioBase}. No significa que
                  esté mal calibrado: significa que <b>no hubo ningún día que
                  exigiera la flota completa</b>.
                </p>
              )}
            </section>

            {/* ── Rechazo ── */}
            <section>
              <h3 className="mb-1.5 font-semibold text-slate-800">
                Rechazo — {pct(data.rechazo.umbral)}
              </h3>
              <p className="mb-2 text-xs text-slate-600">
                Se compara contra la <b>meta oficial del indicador</b> (
                {pct(data.rechazo.metaOficial)}, nodo <code>rechazo</code> del
                Árbol del Sueño). El umbral del calendario es más alto a
                propósito: la meta marca cuándo un día está fuera de objetivo, no
                cuándo es crítico.
              </p>
              {data.rechazo.promedioBase !== null && (
                <Fila
                  label={`Promedio ${data.anioBase}`}
                  valor={pct(data.rechazo.promedioBase)}
                />
              )}
              <Fila
                label="Días que superaron el umbral"
                valor={`${data.rechazo.diasSuperan} de ${data.diasBase}`}
              />
            </section>

            <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
              Un día es <b>crítico</b> cuando{" "}
              <b>{data.minTriggers} o más</b> condicionantes están en alerta a la
              vez. Con {data.minTriggers} se exige que la exigencia y el deterioro
              del servicio coincidan, que es lo que define un período crítico
              según el manual — no un día de mucha venta.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
