"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Award, Info, TrendingUp, TriangleAlert } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PADRINO, SUCESION } from "@/lib/skap/talento"
import type { TalentoData, TalentoPersona, TalentoSucesor } from "@/lib/skap/talento"
import type { SkapRol } from "@/types/database"

interface Props {
  data: TalentoData
  roles: { rol: SkapRol; label: string; sector: string }[]
}

type Filtro = SkapRol | "todos"

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`)
const idx = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","))

/** Barra horizontal simple: un solo tono, el valor lo dice el texto al lado. */
function Barra({ valor, max = 100, tono = "bg-indigo-500" }: { valor: number | null; max?: number; tono?: string }) {
  const w = valor === null ? 0 : Math.max(2, Math.min(100, (valor / max) * 100))
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className={`h-1.5 rounded-full ${tono}`} style={{ width: `${w}%` }} />
    </div>
  )
}

function Chip({ children, tono = "slate" }: { children: React.ReactNode; tono?: "slate" | "indigo" | "amber" | "red" }) {
  const c = {
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  }[tono]
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>
}

export function TalentoClient({ data, roles }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [verCriterios, setVerCriterios] = useState(false)
  const label = (r: SkapRol) => roles.find((x) => x.rol === r)?.label ?? r
  // Los temporales van aparte: no compiten en padrinos/sucesores/ranking con el personal fijo.
  const enFiltro = (r: SkapRol) => r !== "temporal" && (filtro === "todos" || filtro === r)
  const rolesFijos = roles.filter((r) => r.rol !== "temporal")
  const temporales = data.personas
    .filter((p) => p.rol === "temporal")
    .sort((a, b) => (b.indice ?? 0) - (a.indice ?? 0))
  const sucesionTemporal = new Map(
    data.sucesores.filter((s) => s.rol === "temporal").map((s) => [s.empleado_id, s]),
  )

  const padrinos = data.padrinos.filter((p) => enFiltro(p.rol))
  const sucesores = data.sucesores.filter((s) => enFiltro(s.rol))
  const debiles = data.debiles.filter((p) => enFiltro(p.rol))
  const temas = data.habilidadesDebiles.filter((h) => enFiltro(h.rol))
  const ranking = useMemo(
    () =>
      data.personas
        .filter((p) => enFiltro(p.rol))
        .sort((a, b) => (b.indice ?? 0) - (a.indice ?? 0) || (b.pct_criticas ?? 0) - (a.pct_criticas ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.personas, filtro],
  )

  const listos = sucesores.filter((s) => (s.preparacion ?? 0) >= 90)
  const conCriticos = debiles.filter((p) => (p.pct_criticas ?? 100) < 80)
  const idsPadrino = new Set(data.padrinos.map((p) => `${p.rol}|${p.empleado_id}`))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/gente/matriz-skap" className="mb-1 inline-flex items-center text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft className="mr-1 size-3.5" /> Matriz de habilidades
          </Link>
          <h1 className="text-2xl font-bold">Talento · padrinos, sucesores y debilidades</h1>
          <p className="text-sm text-slate-500">Sale de la Matriz SKAP: última nota de cada persona en cada habilidad.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setVerCriterios((v) => !v)}>
          <Info className="mr-1 size-4" /> Cómo se calcula
        </Button>
      </div>

      {verCriterios && (
        <Card>
          <CardContent className="space-y-1.5 py-4 text-sm text-slate-600">
            <p>
              <b>Puntaje (índice)</b>: suma de sus notas ÷ suma de los estándares de su rol — la misma cuenta del Excel.
              1,00 = justo en estándar; más de 1 = por encima. Las habilidades con estándar 0 o NA no cuentan.
            </p>
            <p>
              <b>Padrinos</b>: los {PADRINO.porRol} mejores puntajes de cada rol, con índice ≥ {PADRINO.indiceMin} y al
              menos {PADRINO.criticasMin} % de las habilidades críticas (A) en estándar. «Puede instruir» = nivel 4.
            </p>
            <p>
              <b>Posibles sucesores</b>: se lo mide con la vara del puesto siguiente (
              {Object.entries(SUCESION)
                .map(([o, d]) => `${label(o as SkapRol)} → ${label(d!)}`)
                .join(" · ")}
              ): qué parte de las críticas de ese puesto ya cumple. Las que no figuran en su matriz van como «a formar» y no
              cuentan en contra.
            </p>
            <p>
              <b>Mayor debilidad</b>: menor % de críticas en estándar y menor índice. En cada gap se sugiere un padrino que
              domina esa misma habilidad, de cualquier rol: primero quien la supera (nivel 4 o arriba del estándar); si nadie la supera, quien la cumple con nivel 3 o más y mejor puntaje general.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["todos", ...rolesFijos.map((r) => r.rol)] as Filtro[]).map((r) => (
          <button
            key={r}
            onClick={() => setFiltro(r)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              filtro === r ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {r === "todos" ? "Todos" : label(r)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Award className="size-4" />} label="Padrinos" valor={padrinos.length} hint="Referentes para acompañar a otros" />
        <Tile icon={<TrendingUp className="size-4" />} label="Sucesores listos" valor={listos.length} hint="≥ 90 % de las críticas del puesto siguiente" />
        <Tile icon={<TriangleAlert className="size-4" />} label="Con debilidad fuerte" valor={conCriticos.length} hint="Menos de 80 % de críticas en estándar" alerta={conCriticos.length > 0} />
        <Tile icon={<Info className="size-4" />} label="Tema más flojo" valor={temas[0] ? `${temas[0].con_gap}/${temas[0].evaluadas}` : "—"} hint={temas[0]?.habilidad ?? "Sin gaps"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="size-4 text-indigo-600" /> Padrinos
            </CardTitle>
            <p className="text-xs text-slate-500">Los de mayor puntaje: pueden acompañar y formar a los que tienen gaps.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {padrinos.length === 0 && <Vacio>Nadie cumple el criterio en este filtro.</Vacio>}
            {padrinos.map((p, i) => (
              <div key={`${p.rol}-${p.empleado_id}`} className="space-y-1 rounded-lg border p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    <span className="mr-1 text-slate-400">{i + 1}.</span>
                    {p.nombre}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-800">{idx(p.indice)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{label(p.rol)}</span>·<span>críticas {pct(p.pct_criticas)}</span>
                </div>
                <Barra valor={p.indice} max={1.2} />
                {p.instruye.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-[11px] text-slate-500">Puede instruir en:</span>
                    {p.instruye.map((h) => (
                      <Chip key={h} tono="indigo">{h.toLowerCase()}</Chip>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-indigo-600" /> Posibles sucesores
            </CardTitle>
            <p className="text-xs text-slate-500">Qué tan preparados están para el puesto siguiente.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {sucesores.length === 0 && <Vacio>Sin candidatos en este filtro.</Vacio>}
            {Object.entries(SUCESION)
              .filter(([o]) => enFiltro(o as SkapRol))
              .map(([origen, destino]) => {
                const lista = sucesores.filter((s) => s.rol === origen)
                if (!lista.length) return null
                return (
                  <div key={origen} className="space-y-2">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label(origen as SkapRol)} <ArrowRight className="size-3" /> {label(destino!)}
                    </p>
                    {lista.slice(0, 5).map((s) => (
                      <Sucesor key={s.empleado_id} s={s} />
                    ))}
                  </div>
                )
              })}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-red-600" /> Mayor debilidad
            </CardTitle>
            <p className="text-xs text-slate-500">Con quién reforzar cada tema.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {debiles.length === 0 && <Vacio>Nadie tiene gaps en este filtro.</Vacio>}
            {debiles.slice(0, 8).map((p) => (
              <Debil key={`${p.rol}-${p.empleado_id}`} p={p} label={label} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">Temas flojos del equipo</CardTitle>
          <p className="text-xs text-slate-500">Habilidades con más personas por debajo del estándar: candidatas a capacitación grupal.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {temas.length === 0 && <Vacio>Sin gaps.</Vacio>}
          {temas.slice(0, 10).map((h) => (
            <div key={`${h.rol}-${h.habilidad}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              <span className="truncate text-sm text-slate-700" title={h.habilidad}>
                <Chip tono={h.criticidad === "A" ? "red" : "slate"}>{h.criticidad}</Chip> {h.habilidad.toLowerCase()}
                <span className="ml-1 text-xs text-slate-400">· {label(h.rol)}</span>
              </span>
              <div className="order-last col-span-2 md:order-none md:col-span-1">
                <Barra valor={h.con_gap} max={h.evaluadas} tono="bg-amber-400" />
              </div>
              <span className="text-right text-sm tabular-nums text-slate-600">
                {h.con_gap} de {h.evaluadas}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">Ranking completo</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Persona</th>
                <th className="p-2">Rol</th>
                <th className="p-2 text-right">Índice</th>
                <th className="p-2 text-right">Críticas</th>
                <th className="p-2 text-right">En 4</th>
                <th className="p-2 text-right">Gaps</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {ranking.map((p, i) => (
                <tr key={`${p.rol}-${p.empleado_id}`} className="border-t">
                  <td className="p-2 text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="p-2 font-medium text-slate-800">
                    {p.nombre} <span className="text-xs font-normal text-slate-400">#{p.legajo}</span>
                  </td>
                  <td className="p-2 text-slate-600">{label(p.rol)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{idx(p.indice)}</td>
                  <td className={`p-2 text-right tabular-nums ${(p.pct_criticas ?? 100) < 80 ? "font-semibold text-red-600" : ""}`}>
                    {pct(p.pct_criticas)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{p.instruye.length}</td>
                  <td className="p-2 text-right tabular-nums">{p.gaps.length}</td>
                  <td className="p-2">{idsPadrino.has(`${p.rol}|${p.empleado_id}`) && <Chip tono="indigo">Padrino</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {temporales.length > 0 && (
        <Card className="gap-3 border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Temporales ({temporales.length})</CardTitle>
            <p className="text-xs text-slate-500">
              Aparte del personal fijo: no entran en padrinos, sucesores, debilidades ni ranking de arriba. Se mide cuánto
              les falta para ayudante y quién puede acompañarlos en cada gap.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {temporales.map((p) => {
              const s = sucesionTemporal.get(p.empleado_id)
              return (
                <div key={p.empleado_id} className="space-y-1.5 rounded-lg border p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {p.nombre} <span className="text-xs font-normal text-slate-400">#{p.legajo}</span>
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${(p.pct_criticas ?? 100) < 80 ? "text-red-600" : "text-slate-800"}`}>
                      {pct(p.pct_criticas)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    índice {idx(p.indice)} · críticas en estándar {pct(p.pct_criticas)} · {p.gaps.length} gap
                    {p.gaps.length === 1 ? "" : "s"}
                  </div>
                  {s && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Preparación para ayudante</span>
                        <span className="font-semibold tabular-nums text-slate-700">{pct(s.preparacion)}</span>
                      </div>
                      <Barra valor={s.preparacion} />
                    </div>
                  )}
                  <ul className="space-y-1 pt-1">
                    {p.gaps.map((g) => (
                      <li key={g.habilidad} className="text-xs">
                        <div className="flex items-start gap-1.5">
                          <Chip tono={g.estandar - g.nivel >= 2 ? "red" : "amber"}>
                            {g.nivel}/{g.estandar}
                          </Chip>
                          <span className="text-slate-700">{g.habilidad.toLowerCase()}</span>
                        </div>
                        {g.padrino && (
                          <div className="ml-9 text-[11px] text-slate-500">
                            Padrino sugerido: <b className="text-slate-700">{g.padrino.nombre}</b> ({label(g.padrino.rol)}, nivel{" "}
                            {g.padrino.nivel})
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Tile({ icon, label, valor, hint, alerta }: { icon: React.ReactNode; label: string; valor: number | string; hint: string; alerta?: boolean }) {
  return (
    <Card className="py-3">
      <CardContent className="space-y-0.5 px-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums ${alerta ? "text-red-600" : "text-slate-900"}`}>{valor}</div>
        <div className="truncate text-xs text-slate-400" title={hint}>
          {hint}
        </div>
      </CardContent>
    </Card>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-400">{children}</p>
}

function Sucesor({ s }: { s: TalentoSucesor }) {
  return (
    <div className="space-y-1 rounded-lg border p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-800">{s.nombre}</span>
        <span className="text-sm font-bold tabular-nums text-slate-800">{pct(s.preparacion)}</span>
      </div>
      <Barra valor={s.preparacion} />
      <p className="text-xs text-slate-500">
        Cumple {s.cubiertas} de {s.medibles} críticas del puesto
      </p>
      {s.faltan.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[11px] text-slate-500">Le falta:</span>
          {s.faltan.map((h) => (
            <Chip key={h} tono="amber">{h.toLowerCase()}</Chip>
          ))}
        </div>
      )}
      {s.a_formar.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[11px] text-slate-500">A formar (propias del puesto):</span>
          {s.a_formar.map((h) => (
            <Chip key={h}>{h.toLowerCase()}</Chip>
          ))}
        </div>
      )}
    </div>
  )
}

function Debil({ p, label }: { p: TalentoPersona; label: (r: SkapRol) => string }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-800">{p.nombre}</span>
        <span className={`text-sm font-bold tabular-nums ${(p.pct_criticas ?? 100) < 80 ? "text-red-600" : "text-slate-800"}`}>
          {pct(p.pct_criticas)}
        </span>
      </div>
      <div className="text-xs text-slate-500">
        {label(p.rol)} · índice {idx(p.indice)} · {p.gaps.length} gap{p.gaps.length === 1 ? "" : "s"}
      </div>
      <ul className="space-y-1">
        {p.gaps.slice(0, 4).map((g) => (
          <li key={g.habilidad} className="text-xs">
            <div className="flex items-start gap-1.5">
              <Chip tono={g.estandar - g.nivel >= 2 ? "red" : "amber"}>
                {g.nivel}/{g.estandar}
              </Chip>
              <span className="text-slate-700">{g.habilidad.toLowerCase()}</span>
            </div>
            {g.padrino && (
              <div className="ml-9 text-[11px] text-slate-500">
                Padrino sugerido: <b className="text-slate-700">{g.padrino.nombre}</b> ({label(g.padrino.rol)}, nivel {g.padrino.nivel})
              </div>
            )}
          </li>
        ))}
        {p.gaps.length > 4 && <li className="text-[11px] text-slate-400">+{p.gaps.length - 4} más en la matriz</li>}
      </ul>
    </div>
  )
}
