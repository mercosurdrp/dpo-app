"use client"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { RAMA_COLOR } from "@/lib/sueno/arbol-config"
import { estadoSemaforo, SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/sueno/semaforo"
import { TLP_META_GLOBAL, tlpMetaDe, type TlpMeta } from "@/lib/tlp/metas"
import type { TlpArbol, TlpArbolNodo } from "@/lib/tlp/calc"
import "@/components/sueno/arbol-tree.css"

// Árbol del TLP: raíz (total) → ciudades → los dos insumos de cada ciudad.
// Mismo org-chart que el Árbol del Sueño (arbol-tree.css) y el mismo color de
// la rama Productividad, que es de donde cuelga el TLP allá.
//
// La raíz NO es el promedio de las ciudades: es Σ CEq ÷ Σ horas-hombre, el
// mismo número que la card TLP del Sueño (ver `arbolDesdeViajes` en calc.ts).

const LINEA = RAMA_COLOR.productividad

const fmt = (n: number, dec = 0) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)

export type ModoArbol = "mes" | "ytd"

export function ArbolTlp({
  arbol,
  modo,
  onModo,
  periodoLabel,
  onCiudad,
}: {
  arbol: TlpArbol
  modo: ModoArbol
  onModo: (modo: ModoArbol) => void
  /** Período que se está mostrando, ya escrito ("Julio 2026" / "2026 acumulado"). */
  periodoLabel: string
  onCiudad?: (ciudad: string) => void
}) {
  const hastaLabel = new Date(`${arbol.hasta}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Árbol del TLP · {periodoLabel}</h3>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {modo === "ytd"
              ? `YTD al ${hastaLabel} — mismo cálculo que la card TLP del Árbol del Sueño`
              : "TLP del mes elegido arriba"}
          </span>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(["mes", "ytd"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModo(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  modo === m
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {m === "mes" ? "Mes" : "YTD"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto p-4">
          <div
            className="sueno-tree min-w-max"
            style={{ "--sueno-line": LINEA } as React.CSSProperties}
          >
            <ul>
              <li>
                <div className="sueno-node">
                  <div className="w-40">
                    <KpiCard
                      label="TLP Total"
                      valor={arbol.total.tlp}
                      meta={TLP_META_GLOBAL}
                      sub={`${fmt(arbol.total.viajes)} viajes · Mercosur`}
                      destacado
                    />
                  </div>
                </div>

                <ul>
                  {arbol.ciudades.map((c) => (
                    <li key={c.ciudad}>
                      <div className="sueno-node">
                        <span className="sueno-arrow" aria-hidden />
                        <div className="w-36">
                          <KpiCard
                            label={c.ciudad}
                            valor={c.tlp}
                            meta={tlpMetaDe(c.ciudad)}
                            sub={`${fmt(c.viajes)} viajes`}
                            onClick={onCiudad ? () => onCiudad(c.ciudad) : undefined}
                          />
                        </div>
                      </div>

                      <ul>
                        <li>
                          <div className="sueno-node">
                            <span className="sueno-arrow" aria-hidden />
                            <div className="w-32">
                              <InsumoCard
                                label="Cajas Equivalentes"
                                valor={fmt(c.ceq)}
                                unidad="CEq"
                                sub="entregadas"
                              />
                            </div>
                          </div>
                        </li>
                        <li>
                          <div className="sueno-node">
                            <span className="sueno-arrow" aria-hidden />
                            <div className="w-32">
                              <InsumoCard
                                label="Tiempo en Ruta"
                                valor={fmt(c.horasHombre, 1)}
                                unidad="hs-hombre"
                                sub={`${fmt(c.horasRuta, 1)} hs × ${c.fte == null ? "—" : fmt(c.fte, 2)} FTE`}
                              />
                            </div>
                          </div>

                          {/* Tiempo en PDV: se despeja del tiempo en ruta (Foxtrot no lo mide). */}
                          <ul>
                            <li>
                              <div className="sueno-node">
                                <span className="sueno-arrow" aria-hidden />
                                <div className="w-32">
                                  <InsumoCard
                                    label="Tiempo en PDV"
                                    valor={c.tiempoPdv ? fmt(c.tiempoPdv.minPorPdv, 1) : "—"}
                                    unidad="min/cliente"
                                    sub={
                                      c.tiempoPdv
                                        ? `${fmt(c.tiempoPdv.clientes)} clientes · ${fmt(c.tiempoPdv.rutas)} rutas`
                                        : "sin rutas de Foxtrot"
                                    }
                                  />
                                </div>
                              </div>
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        TLP = CEq ÷ hs-hombre (hs en ruta × dotación del camión). El TLP Total no promedia las
        ciudades: es la suma de CEq dividida por la suma de hs-hombre, así cada ciudad pesa por su
        volumen y sus horas. Cada ciudad mide contra su propia meta.
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <strong>Tiempo en PDV</strong>: Foxtrot no mide la permanencia en el cliente (las columnas de
        paradas salen del GPS del camión y llegan vacías), así que se despeja del tiempo en ruta:
        (hs en ruta − manejo planificado − tramos depósito↔ruta) ÷ clientes visitados. El manejo es el{" "}
        <strong>planificado</strong> por Foxtrot, no el real: si el camión tardó más en la calle o
        esperó, ese exceso queda imputado al PDV. Solo entran las rutas de Foxtrot que se pueden
        cruzar a un viaje del TLP (por chofer → patente → ciudad).
      </p>
    </div>
  )
}

/** Card de un TLP (raíz o ciudad): valor con semáforo contra su meta. */
function KpiCard({
  label,
  valor,
  meta,
  sub,
  destacado = false,
  onClick,
}: {
  label: string
  valor: number | null
  meta: TlpMeta
  sub: string
  destacado?: boolean
  onClick?: () => void
}) {
  const estado = estadoSemaforo(valor, meta.meta, meta.gatillo, "mayor")
  const color = SEMAFORO_COLOR[estado]

  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={onClick ? "Ver las horas en ruta de esta ciudad" : undefined}
      className={cn(
        "relative overflow-hidden rounded-none border-slate-200 p-0 gap-0 shadow-md transition",
        onClick && "cursor-pointer hover:shadow-xl hover:ring-2 hover:ring-slate-300",
      )}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: LINEA }} />
      <div className={cn("flex flex-col gap-1.5", destacado ? "p-3" : "p-2.5")}>
        <div className="flex items-start justify-between gap-1.5">
          <span
            className={cn(
              "font-semibold leading-tight text-slate-800",
              destacado ? "text-sm" : "text-[13px]",
            )}
          >
            {label}
          </span>
          <span
            className="mt-0.5 inline-block size-3 shrink-0 rounded-full ring-2 ring-white"
            style={{ backgroundColor: color }}
            title={SEMAFORO_LABEL[estado]}
          />
        </div>

        <div className="flex items-baseline gap-1">
          <span
            className={cn("font-bold tabular-nums", destacado ? "text-2xl" : "text-xl")}
            style={{ color: valor == null ? SEMAFORO_COLOR.sin_dato : color }}
          >
            {valor == null ? "—" : fmt(valor, 2)}
          </span>
          <span className="text-xs text-slate-400">CEq/HH</span>
        </div>

        <div className="flex items-center justify-between gap-1 text-xs text-slate-500">
          <span>
            Meta: <span className="font-medium text-slate-700">{meta.meta}</span>
          </span>
          <span className="text-[10px] text-slate-400">gatillo {meta.gatillo}</span>
        </div>
        <span className="text-[10px] text-slate-400">{sub}</span>
      </div>
    </Card>
  )
}

/** Card de un insumo del TLP (CEq / hs-hombre): sin meta ni semáforo. */
function InsumoCard({
  label,
  valor,
  unidad,
  sub,
}: {
  label: string
  valor: string
  unidad: string
  sub: string
}) {
  return (
    <Card className="relative overflow-hidden rounded-none border-slate-200 border-dashed bg-slate-50 p-0 gap-0 shadow-sm">
      <div className="flex flex-col gap-1 p-2.5">
        <span className="text-[11px] font-semibold leading-tight text-slate-600">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold tabular-nums text-slate-800">{valor}</span>
          <span className="text-[10px] text-slate-400">{unidad}</span>
        </div>
        <span className="text-[10px] text-slate-400">{sub}</span>
      </div>
    </Card>
  )
}
