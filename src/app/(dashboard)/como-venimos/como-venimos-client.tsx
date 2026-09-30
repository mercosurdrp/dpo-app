"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Gift, GraduationCap, Search, Trophy, User } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import type { ComoVenimosData, ComoVenimosPi, PiId } from "@/actions/como-venimos"
import type { NumerosPersonaPampeana } from "@/lib/indicadores/como-venimos-pampeana"
import type { MiIncentivo } from "@/lib/indicadores/incentivo-pampeana"
import type { MiAvanceCapacitaciones } from "@/lib/indicadores/capacitaciones-personal"

// Tablero diario del equipo de entrega (DPO Entrega 2.1 · R2.1.1), portado del
// de Distribuciones. Pensado para leerse en el celular y proyectarse en la
// matinal: números grandes, semáforo contra la meta y la serie de la semana.

const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return `${DIA_CORTO[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`
}

function mesLargo(iso: string): string {
  return MESES[Number(iso.slice(5, 7)) - 1] ?? iso
}

function formatValor(v: number | null, dec: number): string {
  if (v == null) return "—"
  return v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function cumple(pi: ComoVenimosPi, valor: number | null): boolean | null {
  if (valor == null) return null
  return pi.sentido === "mayor" ? valor >= pi.meta : valor <= pi.meta
}

function colorValor(ok: boolean | null): string {
  return ok == null ? "text-slate-400" : ok ? "text-emerald-600" : "text-red-600"
}

/** Mini serie de la semana: verde cumple, rojo no, gris sin dato. */
function Sparkline({ pi }: { pi: ComoVenimosPi }) {
  const valores = pi.serie.map((p) => p.valor).filter((v): v is number => v != null)
  if (valores.length === 0) return null
  const max = Math.max(...valores, pi.meta)
  const min = Math.min(...valores, pi.meta, 0)
  const rango = max - min || 1

  return (
    <div className="flex items-end gap-1" aria-hidden>
      {pi.serie.map((p) => {
        const ok = cumple(pi, p.valor)
        const alto = p.valor == null ? 4 : 6 + (52 * (p.valor - min)) / rango
        return (
          <div key={p.fecha} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm ${
                p.valor == null ? "bg-slate-200" : ok ? "bg-emerald-500/80" : "bg-red-500/80"
              }`}
              style={{ height: `${alto}px` }}
              title={`${fechaCorta(p.fecha)}: ${formatValor(p.valor, pi.dec)} ${pi.unidad}`}
            />
            <span className="text-[10px] leading-none text-muted-foreground">{fechaCorta(p.fecha).slice(0, 3)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PiCard({ pi }: { pi: ComoVenimosPi }) {
  const ok = cumple(pi, pi.valor)
  const okHoy = cumple(pi, pi.valor_hoy)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{pi.titulo}</span>
          {pi.habilita_incentivo && (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
              <Gift className="size-3" /> Cuenta para el incentivo
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          <span className={`text-5xl font-bold tabular-nums leading-none ${colorValor(ok)}`}>
            {formatValor(pi.valor, pi.dec)}
          </span>
          <span className="pb-1 text-lg text-muted-foreground">{pi.unidad}</span>
          <span className="ml-auto pb-1 text-right text-sm text-muted-foreground">
            meta {pi.sentido === "mayor" ? "≥" : "≤"} {formatValor(pi.meta, pi.meta % 1 === 0 ? 0 : 1)} {pi.unidad}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {pi.fecha_valor ? (
            <>
              Último día cerrado: <strong>{fechaCorta(pi.fecha_valor)}</strong>
            </>
          ) : (
            "Todavía no hay un día cerrado con dato."
          )}
          {pi.valor_hoy != null && (
            <>
              {" · "}hoy en curso:{" "}
              <strong className={okHoy ? "text-emerald-700" : "text-red-700"}>
                {formatValor(pi.valor_hoy, pi.dec)} {pi.unidad}
              </strong>{" "}
              (provisorio)
            </>
          )}
        </p>

        <Sparkline pi={pi} />

        <p className="text-xs leading-relaxed text-muted-foreground">{pi.como_se_calcula}</p>
      </CardContent>
    </Card>
  )
}

/** Los 5 números de una persona, en el orden del tablero. */
function valoresDe(p: NumerosPersonaPampeana): { id: PiId; valor: number | null }[] {
  return [
    { id: "asistencia_preruta", valor: p.asistencia_preruta },
    { id: "tml", valor: p.tml },
    { id: "entregas_ok", valor: p.entregas_ok },
    { id: "rechazo", valor: p.rechazo },
    { id: "clickeo", valor: p.clickeo },
  ]
}

const POCAS_RUTAS = 3

/** Tus propios números (R2.1.4). El operario ve SOLO esta tarjeta. */
export function MisNumerosCard({
  persona,
  pis,
  mesDesde,
  esPropia = true,
}: {
  persona: NumerosPersonaPampeana
  pis: ComoVenimosPi[]
  mesDesde: string
  esPropia?: boolean
}) {
  const porId = new Map(pis.map((p) => [p.id, p]))
  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <User className="size-5 text-blue-600" />
          <span>
            {esPropia ? "Tus" : "Sus"} números de {mesLargo(mesDesde)}
          </span>
          <Badge variant="outline" className="border-blue-300 bg-white text-blue-800">
            {persona.rol === "chofer" ? "Chofer" : "Ayudante"}
          </Badge>
          <span className="text-sm font-normal text-muted-foreground">
            {esPropia ? "saliste" : "salió"} {persona.dias_con_ruta} {persona.dias_con_ruta === 1 ? "día" : "días"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {valoresDe(persona).map(({ id, valor }) => {
            const pi = porId.get(id)
            if (!pi) return null
            const ok = cumple(pi, valor)
            return (
              <div key={id} className="rounded-lg border bg-white p-3">
                <p className="text-xs font-medium text-slate-600">{pi.titulo}</p>
                <p className={`mt-1 text-3xl font-bold tabular-nums leading-none ${colorValor(ok)}`}>
                  {formatValor(valor, pi.dec)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    {valor == null ? "" : pi.unidad}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  meta {pi.sentido === "mayor" ? "≥" : "≤"} {formatValor(pi.meta, pi.meta % 1 === 0 ? 0 : 1)}{" "}
                  {pi.unidad}
                  {id === "asistencia_preruta" && valor == null && persona.cd === "pergamino" && " · no aplica"}
                </p>
              </div>
            )
          })}
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            Rechazo: {pis.find((p) => p.id === "rechazo")?.como_se_calcula_persona} Bultos de {esPropia ? "tus" : "sus"}{" "}
            camiones en el mes:{" "}
            <strong className="text-slate-700">{persona.bultos_entregados.toLocaleString("es-AR")}</strong>.
          </p>
          {persona.rutas_foxtrot < POCAS_RUTAS && (
            <p>
              Foxtrot {esPropia ? "te" : "le"} registra {persona.rutas_foxtrot}{" "}
              {persona.rutas_foxtrot === 1 ? "ruta" : "rutas"} este mes: entregas y clickeo salen de ahí, con tan pocas
              rutas dicen poco. Si manejás, cargá el viaje en el celular.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AnilloAvance({ pct, completo }: { pct: number; completo: boolean }) {
  const r = 42
  const largo = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-slate-200" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(largo * pct) / 100} ${largo}`}
        className={completo ? "stroke-emerald-500" : "stroke-amber-500"}
      />
    </svg>
  )
}

const MAX_PENDIENTES = 5

/** Avance en las capacitaciones asignadas (mismo criterio que «Mis capacitaciones»). */
export function MisCapacitacionesCard({ cap, esPropia = true }: { cap: MiAvanceCapacitaciones; esPropia?: boolean }) {
  if (cap.total === 0) return null
  const pct = Math.round((cap.aprobadas / cap.total) * 100)
  const completo = cap.pendientes.length === 0
  const n = cap.pendientes.length

  return (
    <Card className={completo ? "border-emerald-200" : "border-amber-300"}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-5 text-blue-600" />
          {esPropia ? "Tus" : "Sus"} capacitaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4" title={`${cap.aprobadas} aprobadas de ${cap.total} asignadas`}>
          <div className="relative">
            <AnilloAvance pct={pct} completo={completo} />
            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums text-slate-900">
              {pct}%
            </span>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums leading-none text-slate-900">
              {cap.aprobadas}
              <span className="text-lg font-normal text-muted-foreground"> de {cap.total}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">capacitaciones aprobadas</p>
          </div>
        </div>

        {completo ? (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4 shrink-0" />
            {esPropia ? "¡Tenés todas tus capacitaciones al día!" : "Tiene todas sus capacitaciones al día."}
          </p>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="size-4 shrink-0" />
              {esPropia ? "Tenés" : "Tiene"} {n} {n === 1 ? "capacitación pendiente" : "capacitaciones pendientes"}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {cap.pendientes.slice(0, MAX_PENDIENTES).map((p) => (
                <li key={p.id} className="flex gap-2">
                  <span className="text-amber-600">•</span>
                  <span>
                    {p.titulo}
                    {p.resultado === "desaprobado" && (
                      <span className="text-muted-foreground"> · desaprobada, se puede volver a rendir</span>
                    )}
                  </span>
                </li>
              ))}
              {n > MAX_PENDIENTES && <li className="text-muted-foreground">y {n - MAX_PENDIENTES} más</li>}
            </ul>
            {esPropia && (
              <Link
                href="/mis-capacitaciones"
                className="mt-3 inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                Ir a Mis capacitaciones
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const MEDALLA: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }
function medallaDe(posicion: string | null): string {
  const s = (posicion ?? "").toLowerCase()
  if (s.includes("1")) return MEDALLA[1]
  if (s.includes("2")) return MEDALLA[2]
  if (s.includes("3")) return MEDALLA[3]
  return "•"
}

/** Programa de incentivos: cómo viene contra lo que habilita el premio, su premio y el podio. */
export function IncentivoCard({ inc, esPropia = true }: { inc: MiIncentivo; esPropia?: boolean }) {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-5 text-amber-600" />
          Premios e incentivos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion className="gap-2">
          <AccordionItem value="incentivo" className="rounded-lg border border-amber-200 bg-white px-3">
            <AccordionTrigger className="items-center gap-3 py-3 hover:no-underline">
              <Gift className="size-5 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">
                  {inc.programa?.nombre ?? "Programa de incentivos"}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {inc.programa?.periodo ? `${inc.programa.periodo} · ` : ""}
                  {inc.ambito}
                  {inc.medidos > 0 && ` · ${esPropia ? "vas" : "va"} cumpliendo ${inc.cumplidos} de ${inc.medidos}`}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Así se habilita el premio
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {inc.kpis.map((k) => (
                    <div
                      key={k.titulo}
                      className={`rounded-lg border bg-white p-3 ${
                        k.cumple === true
                          ? "border-emerald-300"
                          : k.cumple === false
                            ? "border-red-300"
                            : "border-slate-200"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <span>{k.cumple === true ? "✓" : k.cumple === false ? "✗" : "·"}</span>
                        {k.titulo}
                      </p>
                      {k.medido && (
                        <p
                          className={`mt-1 text-2xl font-bold tabular-nums leading-none ${
                            k.cumple === true
                              ? "text-emerald-600"
                              : k.cumple === false
                                ? "text-red-600"
                                : "text-slate-400"
                          }`}
                        >
                          {formatValor(k.valor, k.dec)}
                          {k.valor != null && k.unidad && (
                            <span className="ml-0.5 text-sm font-normal text-muted-foreground">{k.unidad}</span>
                          )}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {k.meta}
                        {k.detalle && ` · ${k.detalle}`}
                        {!k.medido && " · todavía no se registra en la app"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {inc.mi_premio && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-white p-3">
                  <span className="text-3xl leading-none">{medallaDe(inc.mi_premio.posicion)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {esPropia ? "Ganaste" : "Ganó"} en {MESES[inc.mi_premio.mes - 1]} {inc.mi_premio.anio}
                      {inc.mi_premio.posicion && ` · ${inc.mi_premio.posicion}º puesto`}
                    </p>
                    {inc.mi_premio.premio && <p className="text-sm text-slate-600">{inc.mi_premio.premio}</p>}
                  </div>
                </div>
              )}

              {inc.podio.length > 0 && inc.podio_mes && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Trophy className="size-3.5 text-amber-500" />
                    Premiación de {MESES[inc.podio_mes.mes - 1]}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {inc.podio.map((g) => (
                      <div
                        key={`${g.nombre}-${g.posicion}`}
                        className={`overflow-hidden rounded-lg border bg-white ${
                          g.es_mio ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"
                        }`}
                      >
                        {g.foto_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.foto_url}
                            alt={`Premiación de ${g.nombre}`}
                            className="h-32 w-full object-cover"
                          />
                        )}
                        <div className="p-2.5">
                          <p className="text-sm font-semibold text-slate-900">
                            {medallaDe(g.posicion)} {g.nombre}
                          </p>
                          {g.premio && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{g.premio}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}

const CD_LABEL: Record<string, string> = { ramallo: "Ramallo", pergamino: "Pergamino" }

/** Tabla persona por persona. Solo la recibe supervisión. */
function TablaEquipo({
  personas,
  pis,
  mesDesde,
}: {
  personas: NumerosPersonaPampeana[]
  pis: ComoVenimosPi[]
  mesDesde: string
}) {
  const [q, setQ] = useState("")
  const porId = new Map(pis.map((p) => [p.id, p]))
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return personas
    return personas.filter((p) => p.nombre.toLowerCase().includes(t) || String(p.legajo ?? "").includes(t))
  }, [personas, q])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Persona por persona · {mesLargo(mesDesde)}</span>
          <span className="text-xs font-normal text-muted-foreground">
            Tocá un nombre para ver su pantalla · solo lo ve supervisión
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o legajo"
            className="pl-8"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium">Legajo</th>
                <th className="py-2 pr-3 font-medium">CD</th>
                <th className="py-2 pr-3 text-right font-medium">Días</th>
                {pis.map((pi) => (
                  <th key={pi.id} className="py-2 pr-3 text-right font-medium">
                    {pi.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((p) => (
                <tr key={p.empleado_id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    <Link
                      href={`/como-venimos/persona/${p.empleado_id}`}
                      className="underline-offset-2 hover:text-blue-700 hover:underline"
                    >
                      {p.nombre}
                    </Link>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{p.rol}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{p.legajo ?? "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.cd ? (CD_LABEL[p.cd] ?? p.cd) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.dias_con_ruta}</td>
                  {valoresDe(p).map(({ id, valor }) => {
                    const pi = porId.get(id)
                    const ok = pi ? cumple(pi, valor) : null
                    return (
                      <td
                        key={id}
                        className={`py-2 pr-3 text-right tabular-nums ${
                          ok == null ? "text-slate-400" : ok ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {formatValor(valor, pi?.dec ?? 1)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={4 + pis.length} className="py-6 text-center text-muted-foreground">
                    Nadie coincide con «{q}».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function ComoVenimosClient({ data }: { data: ComoVenimosData }) {
  return (
    <div className="space-y-4">
      {data.avisos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {data.avisos.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      )}

      {data.mis_numeros && <MisNumerosCard persona={data.mis_numeros} pis={data.pis} mesDesde={data.mes_desde} />}

      {data.mis_capacitaciones && <MisCapacitacionesCard cap={data.mis_capacitaciones} />}

      {data.mi_incentivo && <IncentivoCard inc={data.mi_incentivo} />}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">El equipo, día por día</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.pis.map((pi) => (
            <PiCard key={pi.id} pi={pi} />
          ))}
        </div>
      </div>

      {data.equipo && data.equipo.length > 0 && (
        <TablaEquipo personas={data.equipo} pis={data.pis} mesDesde={data.mes_desde} />
      )}

      <p className="text-xs text-muted-foreground">
        Los números del equipo se calculan igual que en la matinal de Distribución. Los días sin operación quedan sin
        barra.
      </p>
    </div>
  )
}
