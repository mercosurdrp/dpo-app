"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2, Siren } from "lucide-react"
import { cn } from "@/lib/utils"

// Árbol de KPI del almacén (deposito-esteban, portada). El dashboard evalúa cada
// nodo contra la meta y el gatillo que se cargan en su popover y sirve los que
// no llegan al gatillo: acá sólo se muestran, para que el desvío entre solo al
// temario de la reunión Warehouse (checklist DPO Gestión 2.3 / 3.7).
const DEPOSITO_API_BASE = "https://deposito-regionpampeana.vercel.app"
const DEPOSITO_INICIO = "https://deposito-esteban.vercel.app/"

type Semaforo = "ok" | "alerta" | "mal" | null

type NodoFuera = {
  key: string
  label: string
  unidad: string
  mejor_si: "mayor" | "menor"
  decimales: number
  ytd: number | null
  mtd: number | null
  mes: number | null
  meta: number | null
  gatillo: number | null
  responsable: string | null
  foro: string | null
  foro_label: string | null
  estado_ytd: Semaforo
  estado_mtd: Semaforo
  /** Últimos 3 meses con dato (suma en los que suman, promedio en los ratios):
   *  es lo que decide si entra a la lista. */
  ult3?: number | null
  meses_3m?: number[]
  estado_3m?: Semaforo
}

type Respuesta = {
  anio: number
  generado_en: string | null
  nodos: NodoFuera[]
  fuera: NodoFuera[]
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function fmt(v: number | null, dec: number): string {
  if (v == null || Number.isNaN(v)) return "—"
  return v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const COLOR: Record<string, string> = {
  ok: "text-emerald-600",
  alerta: "text-amber-600",
  mal: "text-red-600",
}

export function ArbolFueraDeGatilloBloque() {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    fetch(`${DEPOSITO_API_BASE}/api/arbol-almacen/fuera-de-gatillo`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as Respuesta
      })
      .then((j) => {
        if (activo) setDatos(j)
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No se pudo leer el árbol")
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [])

  const fuera = datos?.fuera ?? []
  // En la reunión diaria van los del foro "diaria" primero; el resto también se
  // muestra (un desvío es un desvío), pero después y marcado con su foro.
  const ordenados = [...fuera].sort((a, b) => {
    const pa = a.foro === "diaria" ? 0 : a.foro ? 1 : 2
    const pb = b.foro === "diaria" ? 0 : b.foro ? 1 : 2
    return pa - pb
  })

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-red-900">
            <Siren className="size-4 text-red-600" />
            Árbol de KPI: fuera de gatillo
            {cargando && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            {!cargando && !error && (
              <span
                className={cn(
                  "inline-flex min-w-[1.4rem] items-center justify-center rounded-full px-1.5 py-px text-[11px] text-white",
                  fuera.length ? "bg-red-600" : "bg-emerald-600",
                )}
              >
                {fuera.length}
              </span>
            )}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Indicadores del almacén peor que su gatillo en los últimos 3 meses (no en el acumulado del año, que arrastra lo ya corregido).
            Se leen del árbol del dashboard del depósito; la meta y el gatillo se editan allá.
          </p>
        </div>
        <a
          href={DEPOSITO_INICIO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          Abrir el árbol <ExternalLink className="size-3" />
        </a>
      </div>

      {error && (
        <p className="mt-2 px-4 text-[12px] text-muted-foreground">
          No se pudo leer el árbol del depósito ({error}).
        </p>
      )}

      {!cargando && !error && fuera.length === 0 && (
        <p className="mt-2 px-4 text-[12px] text-muted-foreground">
          Ningún indicador con meta está fuera de gatillo.
        </p>
      )}

      {ordenados.length > 0 && (
        <div className="mt-2 overflow-x-auto px-4">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 text-left font-semibold">Indicador</th>
                <th className="px-2 py-1.5 text-right font-semibold">Último mes</th>
                <th className="px-2 py-1.5 text-right font-semibold">Últ. 3 meses</th>
                <th className="px-2 py-1.5 text-right font-semibold">Acumulado</th>
                <th className="px-2 py-1.5 text-right font-semibold">Meta</th>
                <th className="px-2 py-1.5 text-right font-semibold">Gatillo</th>
                <th className="px-2 py-1.5 text-left font-semibold">Se revisa en</th>
                <th className="py-1.5 pl-2 text-left font-semibold">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ordenados.map((n) => (
                <tr key={n.key}>
                  <td className="py-1.5 pr-2 font-semibold">
                    {n.label}
                    <span className="ml-1 font-mono text-[9.5px] font-normal text-muted-foreground">{n.unidad}</span>
                  </td>
                  <td className={cn("px-2 py-1.5 text-right font-bold tabular-nums", n.estado_mtd ? COLOR[n.estado_mtd] : "")}>
                    {fmt(n.mtd, n.decimales)}
                    {n.mes != null && (
                      <span className="ml-1 text-[9px] font-normal uppercase text-muted-foreground">{MESES[n.mes - 1]}</span>
                    )}
                  </td>
                  <td className={cn("px-2 py-1.5 text-right font-bold tabular-nums", n.estado_3m ? COLOR[n.estado_3m] : "")}>
                    {fmt(n.ult3 ?? null, n.decimales)}
                    {n.meses_3m && n.meses_3m.length > 0 && (
                      <span className="ml-1 text-[9px] font-normal uppercase text-muted-foreground">
                        {MESES[n.meses_3m[0] - 1]}–{MESES[n.meses_3m[n.meses_3m.length - 1] - 1]}
                      </span>
                    )}
                  </td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", n.estado_ytd ? COLOR[n.estado_ytd] : "")}>
                    {fmt(n.ytd, n.decimales)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(n.meta, n.decimales)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(n.gatillo, n.decimales)}</td>
                  <td className="px-2 py-1.5">
                    {n.foro_label ? (
                      <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                        {n.foro_label}
                      </span>
                    ) : (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        sin reunión asignada
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2">{n.responsable || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
