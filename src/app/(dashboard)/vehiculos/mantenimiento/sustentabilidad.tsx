"use client"

// Sustentabilidad de flota — punto 4.3 "Sustainability Goals".
//
// El punto NO pide medir el CO2 de cada unidad, que es lo que suena: pide
// (R4.3.2) ELEGIR un KPI/PI por su impacto ecológico y seguirlo, y la guía
// agrega que el PI elegido tiene que mostrar tendencia positiva sobre los
// últimos 3 meses. Los dos elegidos son:
//
//  PI 1 · kg de CO2 cada 100 km — se calcula desde el gasoil que ya se carga por
//         unidad (litros × 2,68 kg/L). Es el que tiene volumen y continuidad
//         mensual, y se puede abrir por camión y por autoelevador.
//  PI 2 · % de cubiertas recuperadas por recapado — economía circular con
//         evidencia dura: remitos de recapado contra retiros a la recicladora.
//
// Por qué estos dos y no "focos" o "soldaduras de carrocería", que es lo que más
// se repite en las OT: esos son indicadores de confiabilidad y seguridad, no
// ecológicos, y los puntúan el 2.2 y el 3.4. El 4.3 exige impacto ambiental.

import { useMemo } from "react"
import { FileDown, Leaf, Recycle, TrendingDown, TrendingUp, Minus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Neumatico, Recapado } from "@/lib/vehiculos/neumaticos-tipos"
import {
  META_CO2_100KM,
  META_RECUPERACION,
  recuperacionDelAnio,
  recuperacionPorMes,
  tendencia3Meses,
  type SustentabilidadFlota,
  type Tendencia,
} from "@/lib/vehiculos/sustentabilidad"

import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"

const fmtNum = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(n)

const fmtMes = (ym: string) =>
  new Date(`${ym}-01T12:00:00`).toLocaleDateString("es-AR", { month: "short", year: "2-digit" })

function ChipTendencia({ t, unidad }: { t: Tendencia; unidad: string }) {
  if (t.estado === "sin_datos")
    return <Badge variant="outline">Sin datos para la tendencia</Badge>
  const Icono = t.estado === "mejora" ? TrendingDown : t.estado === "empeora" ? TrendingUp : Minus
  const texto =
    t.estado === "igual"
      ? "Estable"
      : `${t.delta! > 0 ? "+" : ""}${fmtNum(t.delta, 1)} ${unidad}`
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        t.estado === "mejora" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        t.estado === "empeora" && "border-destructive/30 bg-destructive/10 text-destructive",
        t.estado === "igual" && "text-muted-foreground"
      )}
    >
      <Icono className="size-3.5" aria-hidden />
      {texto} en {t.meses.length} meses ({t.meses.map(fmtMes).join(" → ")})
    </Badge>
  )
}

export function Sustentabilidad({
  datos,
  neumaticos,
  recapados,
}: {
  datos: SustentabilidadFlota
  neumaticos: Neumatico[]
  recapados: Recapado[]
}) {
  const mesActual = new Date().toISOString().slice(0, 7)

  const meses = useMemo(() => datos.porMes.slice(-13), [datos.porMes])
  const mesCerrado = useMemo(
    () => [...meses].reverse().find((m) => m.mes < mesActual) ?? null,
    [meses, mesActual]
  )

  const tCo2 = useMemo(
    () =>
      tendencia3Meses(
        meses.map((m) => ({ mes: m.mes, valor: m.co2Por100Km })),
        mesActual,
        true
      ),
    [meses, mesActual]
  )

  const recup = useMemo(() => recuperacionPorMes(neumaticos, recapados), [neumaticos, recapados])
  const recupAnio = useMemo(
    () => recuperacionDelAnio(recup, mesActual.slice(0, 4)),
    [recup, mesActual]
  )

  const tRecup = useMemo(
    () => tendencia3Meses(recup.map((r) => ({ mes: r.mes, valor: r.pct })), mesActual, false),
    [recup, mesActual]
  )

  const maxCo2 = Math.max(...meses.map((m) => m.co2Por100Km ?? 0), META_CO2_100KM, 1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DpoSeccionCinta seccionId="sustentabilidad" />
        {/* La hoja que se adjunta en /evidencia/flota/4-3 como respaldo del
            R4.3.2, y que sirve impresa para la cartelera del R4.3.1. Sale del
            mismo cálculo que esta pantalla, así que no pueden decir distinto. */}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => window.open("/api/vehiculos/sustentabilidad/pdf", "_blank", "noopener")}
        >
          <FileDown className="mr-1 size-4" /> Hoja de evidencia (PDF)
        </Button>
      </div>

      {/* ============ PI 1 · emisiones ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Leaf className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            PI 1 — kg de CO<sub>2</sub> cada 100 km
            <ChipTendencia t={tCo2} unidad="kg/100 km" />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Emisiones de alcance 1 calculadas desde el gasoil cargado por unidad:{" "}
            <span className="font-medium text-foreground">
              litros × {fmtNum(datos.factor, 2)} kg CO₂/L
            </span>{" "}
            (factor de combustión de diésel, DEFRA/IPCC). No hace falta medir nada: el dato sale de
            los remitos de combustible que ya se cargan. Meta: {META_CO2_100KM} kg/100 km.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="CO₂ del año"
              valor={`${fmtNum(datos.anio.co2Kg / 1000, 1)} t`}
              sub={`${fmtNum(datos.anio.litros)} litros · ${fmtNum(datos.anio.km)} km`}
              dpo="4.3"
            />
            <KpiCard
              label="PI del año"
              valor={
                datos.anio.co2Por100Km != null ? `${fmtNum(datos.anio.co2Por100Km, 1)} kg/100 km` : "—"
              }
              estado={
                datos.anio.co2Por100Km == null
                  ? "neutro"
                  : datos.anio.co2Por100Km <= META_CO2_100KM
                    ? "ok"
                    : "alerta"
              }
              sub={`Meta ${META_CO2_100KM} kg/100 km`}
            />
            <KpiCard
              label={`Último mes cerrado${mesCerrado ? ` · ${fmtMes(mesCerrado.mes)}` : ""}`}
              valor={
                mesCerrado?.co2Por100Km != null
                  ? `${fmtNum(mesCerrado.co2Por100Km, 1)} kg/100 km`
                  : "—"
              }
              estado={
                mesCerrado?.co2Por100Km == null
                  ? "neutro"
                  : mesCerrado.co2Por100Km <= META_CO2_100KM
                    ? "ok"
                    : "alerta"
              }
              sub={
                mesCerrado
                  ? `${fmtNum(mesCerrado.co2Kg / 1000, 1)} t de CO₂ en el mes`
                  : "Sin mes cerrado"
              }
            />
            <KpiCard
              label="Tendencia 3 meses"
              valor={
                tCo2.estado === "mejora"
                  ? "Mejora"
                  : tCo2.estado === "empeora"
                    ? "Empeora"
                    : tCo2.estado === "igual"
                      ? "Estable"
                      : "—"
              }
              estado={
                tCo2.estado === "mejora" ? "ok" : tCo2.estado === "empeora" ? "critico" : "neutro"
              }
              sub="Lo que mira la guía del punto 4.3"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-2">Mes</th>
                  <th className="text-right">Litros</th>
                  <th className="text-right">Km</th>
                  <th className="text-right">L/100 km</th>
                  <th className="text-right">kg CO₂</th>
                  <th className="pr-2 text-right">kg CO₂/100 km</th>
                  <th className="w-40" />
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => {
                  const l100 = m.km > 0 ? (m.litros / m.km) * 100 : null
                  const enCurso = m.mes === mesActual
                  return (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-2 pl-2 font-medium capitalize">
                        {fmtMes(m.mes)}
                        {enCurso && (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            (en curso)
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{fmtNum(m.litros)}</td>
                      <td className="text-right tabular-nums">{fmtNum(m.km)}</td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {fmtNum(l100, 1)}
                      </td>
                      <td className="text-right tabular-nums">{fmtNum(m.co2Kg)}</td>
                      <td
                        className={cn(
                          "pr-2 text-right font-semibold tabular-nums",
                          m.co2Por100Km != null &&
                            (m.co2Por100Km <= META_CO2_100KM
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400")
                        )}
                      >
                        {fmtNum(m.co2Por100Km, 1)}
                      </td>
                      <td className="pr-2">
                        {/* Barra contra el peor mes de la serie: el tamaño es lo
                            que se lee de un saque, el número ya está al lado. */}
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-2 rounded-full",
                              m.co2Por100Km != null && m.co2Por100Km <= META_CO2_100KM
                                ? "bg-emerald-500"
                                : "bg-amber-500"
                            )}
                            style={{
                              width: `${Math.round(((m.co2Por100Km ?? 0) / maxCo2) * 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              CO₂ por unidad ({datos.porUnidad.length})
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pl-2">Unidad</th>
                    <th className="text-right">Litros</th>
                    <th className="text-right">Km</th>
                    <th className="text-right">kg CO₂</th>
                    <th className="pr-2 text-right">kg CO₂/100 km</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.porUnidad.map((u) => (
                    <tr key={u.dominio} className="border-b last:border-0">
                      <td className="py-1.5 pl-2 font-medium">{u.dominio}</td>
                      <td className="text-right tabular-nums">{fmtNum(u.litros)}</td>
                      <td className="text-right tabular-nums">{fmtNum(u.km)}</td>
                      <td className="text-right tabular-nums">{fmtNum(u.co2Kg)}</td>
                      <td className="pr-2 text-right font-semibold tabular-nums">
                        {fmtNum(u.co2Por100Km, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Los autoelevadores no tienen km: su consumo se sigue por hora de uso, así que el
                kg/100 km no les aplica y el CO₂ de ellos se mira en valor absoluto.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* ============ PI 2 · economía circular ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Recycle className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            PI 2 — % de cubiertas recuperadas por recapado
            <ChipTendencia t={tRecup} unidad="pp" />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            De las cubiertas que salieron de servicio, cuántas volvieron a rodar recapadas en vez de
            irse a la recicladora. Evidencia: remitos de recapado y certificados de disposición.
            Meta: {META_RECUPERACION} %. No cuenta como desecho la cubierta transferida a otro
            centro: salió del parque, pero no se tiró.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Recuperación del año"
              valor={recupAnio.pct != null ? `${fmtNum(recupAnio.pct, 1)} %` : "—"}
              estado={
                recupAnio.pct == null
                  ? "neutro"
                  : recupAnio.pct >= META_RECUPERACION
                    ? "ok"
                    : "alerta"
              }
              sub={`Meta ${META_RECUPERACION} %`}
              dpo="4.3"
            />
            <KpiCard
              label="Recapadas"
              valor={recupAnio.recapadas}
              sub="Volvieron a rodar"
              estado="ok"
            />
            <KpiCard
              label="A la recicladora"
              valor={recupAnio.desechadas}
              sub="Con certificado de disposición"
            />
            <KpiCard
              label="Parque con recapado"
              valor={`${neumaticos.filter((n) => n.vueltas_recapado > 0).length} de ${neumaticos.length}`}
              sub="Cubiertas con al menos una vuelta"
            />
          </div>

          {recup.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no hay cubiertas recapadas ni desechadas cargadas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pl-2">Mes</th>
                    <th className="text-right">Recapadas</th>
                    <th className="text-right">A recicladora</th>
                    <th className="pr-2 text-right">Recuperación</th>
                  </tr>
                </thead>
                <tbody>
                  {recup.map((r) => (
                    <tr key={r.mes} className="border-b last:border-0">
                      <td className="py-2 pl-2 font-medium capitalize">{fmtMes(r.mes)}</td>
                      <td className="text-right tabular-nums">{r.recapadas || "—"}</td>
                      <td className="text-right tabular-nums">{r.desechadas || "—"}</td>
                      <td
                        className={cn(
                          "pr-2 text-right font-semibold tabular-nums",
                          r.pct != null &&
                            (r.pct >= META_RECUPERACION
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400")
                        )}
                      >
                        {r.pct != null ? `${fmtNum(r.pct, 0)} %` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="py-2 pl-2">Año</td>
                    <td className="text-right tabular-nums">{recupAnio.recapadas}</td>
                    <td className="text-right tabular-nums">{recupAnio.desechadas}</td>
                    <td className="pr-2 text-right tabular-nums">
                      {recupAnio.pct != null ? `${fmtNum(recupAnio.pct, 0)} %` : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ Cómo se sostiene el punto ante la auditoría ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qué responde cada requisito</CardTitle>
          <p className="text-xs text-muted-foreground">
            El 4.3 puntúa por cantidad de requisitos cumplidos: 1 requisito = 1, dos = 3, los tres =
            5. No es mandatorio.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border border-border p-3">
            <p className="font-medium">R4.3.1 — Los empleados conocen los objetivos</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No se resuelve con datos: es charla y cartelera. Lo que pide el auditor es entrevistar
              a un chofer y que sepa qué hace AB InBev en sostenibilidad y qué hace el distribuidor.
              Evidencia: la charla registrada en campus y los dos PI de esta pantalla publicados
              donde los choferes los vean.
            </p>
          </div>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">
              R4.3.2 — KPI/PI elegidos por su impacto
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Los dos de arriba: emisiones por kilómetro y recuperación de cubiertas. El primero
              cubre el ejemplo de CO₂ del manual; el segundo, el de residuos. Los dos salen de datos
              propios y trazables: remitos de combustible, remitos de recapado y certificados de
              disposición.
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="font-medium">R4.3.3 — Acciones locales definidas y ejecutadas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Las que ya están corriendo: el recapado en lugar de comprar goma nueva, el control de
              presión y la rotación —que bajan consumo y alargan la vida de la cubierta—, la
              disposición certificada de las cubiertas que no se pueden recuperar, y la reparación
              de pérdidas de fluidos detectadas por el checklist (el caso del HELI1 en julio:
              detectado, reparado, cerrado). Cargarlas como plan de acción de flota las deja con
              responsable y fecha.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
