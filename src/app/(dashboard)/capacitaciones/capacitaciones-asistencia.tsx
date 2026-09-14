"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ChevronDown,
  Search,
  Target,
  UserCheck,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  META_ASISTENCIA_PCT,
  asistenciaPorEmpleado,
  calcularAsistencia,
  type EmpleadoRef,
  type FilaAsistenciaEmpleado,
  type ItemAsistencia,
} from "@/lib/capacitacion-asistencia"

interface Props {
  capacitaciones: ItemAsistencia[]
  /** YYYY-MM-DD. Se pasa desde el cliente para no depender del huso del server. */
  hoy: string
  /** Asistencia individual. Null para quien no puede verla (no es admin/auditor). */
  porEmpleado: { filas: FilaAsistenciaEmpleado[]; empleados: EmpleadoRef[] } | null
}

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const VERDE = "#10B981"
const AMARILLO = "#F59E0B"
const ROJO = "#EF4444"

/** Semáforo contra la meta: en meta / cerca (a menos de 20 pts) / lejos. */
function colorSemaforo(pct: number | null): string {
  if (pct === null) return "#94A3B8"
  if (pct >= META_ASISTENCIA_PCT) return VERDE
  if (pct >= META_ASISTENCIA_PCT - 20) return AMARILLO
  return ROJO
}

function fmtFecha(fecha: string): string {
  const d = new Date(fecha + "T12:00:00")
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR")
}

export function CapacitacionesAsistencia({ capacitaciones, hoy, porEmpleado }: Props) {
  const a = useMemo(() => calcularAsistencia(capacitaciones, hoy), [capacitaciones, hoy])

  const empleados = useMemo(
    () =>
      porEmpleado
        ? asistenciaPorEmpleado(porEmpleado.filas, porEmpleado.empleados, capacitaciones, hoy)
        : [],
    [porEmpleado, capacitaciones, hoy]
  )

  const [abierto, setAbierto] = useState(true)
  const [verBajoMeta, setVerBajoMeta] = useState(false)
  const [verDetalle, setVerDetalle] = useState(false)
  const [verPilares, setVerPilares] = useState(false)
  const [verEmpleados, setVerEmpleados] = useState(false)
  const [buscaEmpleado, setBuscaEmpleado] = useState("")
  const [empleadoAbierto, setEmpleadoAbierto] = useState<string | null>(null)

  const empleadosFiltrados = useMemo(() => {
    const q = buscaEmpleado.trim().toLowerCase()
    if (!q) return empleados
    return empleados.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) ||
        (e.sector ?? "").toLowerCase().includes(q) ||
        String(e.legajo ?? "").includes(q)
    )
  }, [empleados, buscaEmpleado])

  if (a.dictadas === 0) return null

  const colorYtd = colorSemaforo(a.pctYtd)
  const enMeta = (a.pctYtd ?? 0) >= META_ASISTENCIA_PCT
  const empleadosBajoMeta = empleados.filter((e) => !e.enMeta).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-2 text-left outline-none"
            title={abierto ? "Ocultar asistencia" : "Ver asistencia"}
          >
            <ChevronDown
              className={`size-4 text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`}
            />
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="size-4 text-slate-400" />
              Asistencia a las Capacitaciones {a.anio}
            </CardTitle>
          </button>
          <Badge
            variant="secondary"
            className="gap-1.5"
            style={{
              backgroundColor: (enMeta ? VERDE : AMARILLO) + "1A",
              color: enMeta ? VERDE : AMARILLO,
            }}
          >
            <Target className="size-3.5" />
            Meta {META_ASISTENCIA_PCT} % de presentismo
          </Badge>
        </div>
      </CardHeader>

      {abierto && (
        <CardContent className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setVerDetalle((v) => !v)}
              className="text-left outline-none"
              title="Ver el % de cada capacitación"
            >
              <Kpi
                valor={a.pctYtd === null ? "—" : `${a.pctYtd} %`}
                label="Asistencia YTD"
                detalle={`${a.presentes} presentes de ${a.convocados} convocados · ver detalle`}
                color={colorYtd}
                destacado
              />
            </button>
            <button
              type="button"
              onClick={() => setVerBajoMeta((v) => !v)}
              className="text-left outline-none"
              title="Ver las capacitaciones que no llegan a la meta"
            >
              <Kpi
                valor={String(a.ausentes)}
                label="Ausencias"
                detalle={
                  a.bajoMeta.length > 0
                    ? `${a.bajoMeta.length} capacitaciones bajo meta · ver listado`
                    : "Todas las capacitaciones en meta"
                }
                color={a.ausentes > 0 ? ROJO : VERDE}
                icono={a.ausentes > 0 ? <AlertTriangle className="size-3.5" /> : undefined}
              />
            </button>
            <Kpi
              valor={a.pctEnMeta === null ? "—" : `${a.pctEnMeta} %`}
              label={`Capacitaciones al ${META_ASISTENCIA_PCT} %`}
              detalle={`${a.enMeta} de ${a.dictadas} dictadas`}
              color={colorSemaforo(a.pctEnMeta)}
            />
            <Kpi
              valor={a.faltanParaMeta === 0 ? "✓" : String(a.faltanParaMeta)}
              label={`Faltan para el ${META_ASISTENCIA_PCT} %`}
              detalle={
                a.faltanParaMeta === 0
                  ? "Meta alcanzada"
                  : `Presencias que faltaron sobre ${a.convocados} convocados`
              }
              color={a.faltanParaMeta === 0 ? VERDE : "#0EA5E9"}
              icono={<Users className="size-3.5" />}
            />
          </div>

          {/* Barra: presentes sobre convocados, con la marca de la meta */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">
                {a.presentes} presentes sobre {a.convocados} convocados en {a.dictadas}{" "}
                {a.dictadas === 1 ? "capacitación dictada" : "capacitaciones dictadas"}
              </span>
              <span className="text-xs text-slate-500">
                {a.faltanParaMeta === 0 ? (
                  <span className="font-semibold text-emerald-600">
                    Presentismo en meta
                  </span>
                ) : (
                  <>
                    Para el {META_ASISTENCIA_PCT} % faltaron{" "}
                    <span className="font-semibold text-slate-900">{a.faltanParaMeta}</span>{" "}
                    presencias
                  </>
                )}
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${a.pctYtd ?? 0}%`, backgroundColor: colorYtd }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-slate-900"
                style={{ left: `${META_ASISTENCIA_PCT}%` }}
                title={`Meta ${META_ASISTENCIA_PCT} %`}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>0</span>
              <span>{a.convocados} convocados</span>
            </div>
          </div>

          {/* Capacitaciones bajo meta */}
          {verBajoMeta && a.bajoMeta.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                Bajo la meta del {META_ASISTENCIA_PCT} % ({a.bajoMeta.length})
              </p>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {a.bajoMeta.map((c) => (
                  <Link
                    key={c.id}
                    href={`/capacitaciones/${c.id}`}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-white"
                  >
                    <span className="truncate font-medium text-slate-700">{c.titulo}</span>
                    <span className="flex shrink-0 items-center gap-2 text-slate-500">
                      {c.pilar && <span className="text-slate-400">{c.pilar}</span>}
                      <span>{fmtFecha(c.fecha)}</span>
                      <span className="text-slate-400">
                        {c.presentes}/{c.convocados}
                      </span>
                      <span className="w-10 text-right font-semibold" style={{ color: colorSemaforo(c.pct) }}>
                        {c.pct === null ? "—" : `${c.pct} %`}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Detalle: todas las dictadas */}
          {verDetalle && (
            <div className="rounded-lg border bg-slate-50/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Asistencia por capacitación ({a.detalle.length} dictadas)
              </p>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="sticky top-0 bg-slate-50/95">
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2">Capacitación</th>
                      <th className="py-1.5 pr-2">Fecha</th>
                      <th className="py-1.5 pr-2 text-right">Convoc.</th>
                      <th className="py-1.5 pr-2 text-right">Present.</th>
                      <th className="py-1.5 text-right">Asistencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.detalle.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          <Link href={`/capacitaciones/${c.id}`} className="hover:text-blue-600">
                            {c.titulo}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-500">{fmtFecha(c.fecha)}</td>
                        <td className="py-1.5 pr-2 text-right text-slate-600">{c.convocados}</td>
                        <td className="py-1.5 pr-2 text-right text-slate-600">{c.presentes}</td>
                        <td
                          className="py-1.5 text-right font-semibold"
                          style={{ color: colorSemaforo(c.pct) }}
                        >
                          {c.pct === null ? "—" : `${c.pct} %`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mes a mes */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Asistencia mes a mes
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-2">Mes</th>
                    <th className="py-1.5 pr-2 text-right">Dictadas</th>
                    <th className="py-1.5 pr-2 text-right">Convocados</th>
                    <th className="py-1.5 pr-2 text-right">Presentes</th>
                    <th className="py-1.5 pr-2 text-right">Ausentes</th>
                    <th className="py-1.5 pl-2">Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {a.porMes.map((m) => {
                    const color = colorSemaforo(m.pct)
                    return (
                      <tr key={m.mes} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          {MESES_CORTOS[m.mes]}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-slate-600">
                          {m.dictadas}
                          {m.enMeta > 0 && (
                            <span
                              className="ml-1 text-xs font-normal text-emerald-600"
                              title={`${m.enMeta} llegaron al ${META_ASISTENCIA_PCT} %`}
                            >
                              ✓{m.enMeta}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-slate-600">{m.convocados}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                          {m.presentes}
                        </td>
                        <td
                          className={`py-1.5 pr-2 text-right ${m.ausentes > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}
                        >
                          {m.ausentes || "—"}
                        </td>
                        <td className="py-1.5 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${m.pct ?? 0}%`, backgroundColor: color }}
                              />
                            </div>
                            <span
                              className="w-10 shrink-0 text-right text-xs font-semibold"
                              style={{ color }}
                            >
                              {m.pct === null ? "—" : `${m.pct} %`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Convocados = asistentes cargados en la capacitación · Presentes = los marcados
              presentes (a mano o al rendir el examen en la app). Se miden sólo las capacitaciones
              ya dictadas (fecha ≤ hoy) con al menos un convocado: las futuras y las dadas de baja
              quedan afuera. La asistencia YTD pondera por tamaño, así que una capacitación de 40
              personas pesa más que una de 4.
            </p>
          </div>

          {/* Por pilar */}
          {a.porPilar.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setVerPilares((v) => !v)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 outline-none hover:text-slate-700"
              >
                <ChevronDown
                  className={`size-3.5 transition-transform ${verPilares ? "" : "-rotate-90"}`}
                />
                Asistencia por pilar
              </button>
              {verPilares && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2">Pilar</th>
                        <th className="py-1.5 pr-2 text-right">Dictadas</th>
                        <th className="py-1.5 pr-2 text-right">Convocados</th>
                        <th className="py-1.5 pr-2 text-right">Presentes</th>
                        <th className="py-1.5 pr-2 text-right">Ausentes</th>
                        <th className="py-1.5 text-right">Asistencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.porPilar.map((p) => (
                        <tr key={p.pilar} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{p.pilar}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-600">{p.dictadas}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-600">{p.convocados}</td>
                          <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                            {p.presentes}
                          </td>
                          <td
                            className={`py-1.5 pr-2 text-right ${p.ausentes > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}
                          >
                            {p.ausentes || "—"}
                          </td>
                          <td
                            className="py-1.5 text-right font-semibold"
                            style={{ color: colorSemaforo(p.pct) }}
                          >
                            {p.pct === null ? "—" : `${p.pct} %`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Por empleado */}
          {empleados.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setVerEmpleados((v) => !v)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 outline-none hover:text-slate-700"
              >
                <ChevronDown
                  className={`size-3.5 transition-transform ${verEmpleados ? "" : "-rotate-90"}`}
                />
                Asistencia por empleado ({empleadosBajoMeta} bajo la meta de {empleados.length})
              </button>
              {verEmpleados && (
                <div className="mt-2 space-y-2">
                  <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="h-8 pl-9 text-sm"
                      placeholder="Buscar por nombre, legajo o sector..."
                      value={buscaEmpleado}
                      onChange={(e) => setBuscaEmpleado(e.target.value)}
                    />
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full min-w-[32rem] text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <th className="py-1.5 pr-2">Empleado</th>
                          <th className="py-1.5 pr-2">Sector</th>
                          <th className="py-1.5 pr-2 text-right">Convoc.</th>
                          <th className="py-1.5 pr-2 text-right">Asistió</th>
                          <th className="py-1.5 pr-2 text-right">Faltó</th>
                          <th className="py-1.5 text-right">Asistencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empleadosFiltrados.map((e) => {
                          const abiertoEmp = empleadoAbierto === e.empleadoId
                          return (
                            <Fragment key={e.empleadoId}>
                              <tr
                                className="cursor-pointer border-b last:border-0 hover:bg-slate-50"
                                onClick={() =>
                                  setEmpleadoAbierto(abiertoEmp ? null : e.empleadoId)
                                }
                                title={
                                  e.ausente > 0
                                    ? "Ver a qué capacitaciones faltó"
                                    : "No faltó a ninguna"
                                }
                              >
                                <td className="py-1.5 pr-2 font-medium text-slate-700">
                                  <span className="flex items-center gap-1.5">
                                    {e.ausente > 0 && (
                                      <ChevronDown
                                        className={`size-3.5 shrink-0 text-slate-400 transition-transform ${abiertoEmp ? "" : "-rotate-90"}`}
                                      />
                                    )}
                                    <span className={e.ausente > 0 ? "" : "pl-5"}>{e.nombre}</span>
                                  </span>
                                </td>
                                <td className="py-1.5 pr-2 text-xs text-slate-500">
                                  {e.sector ?? "—"}
                                </td>
                                <td className="py-1.5 pr-2 text-right text-slate-600">
                                  {e.convocado}
                                </td>
                                <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                                  {e.presente}
                                </td>
                                <td
                                  className={`py-1.5 pr-2 text-right ${e.ausente > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}
                                >
                                  {e.ausente || "—"}
                                </td>
                                <td
                                  className="py-1.5 text-right font-semibold"
                                  style={{ color: colorSemaforo(e.pct) }}
                                >
                                  {e.pct === null ? "—" : `${e.pct} %`}
                                </td>
                              </tr>
                              {abiertoEmp && e.ausencias.length > 0 && (
                                <tr className="border-b last:border-0">
                                  <td colSpan={6} className="bg-red-50/40 px-2 py-2">
                                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-700">
                                      Faltó a {e.ausencias.length}
                                    </p>
                                    <div className="space-y-0.5">
                                      {e.ausencias.map((c) => (
                                        <Link
                                          key={c.id}
                                          href={`/capacitaciones/${c.id}`}
                                          className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-white"
                                        >
                                          <span className="truncate font-medium text-slate-700">
                                            {c.titulo}
                                          </span>
                                          <span className="shrink-0 text-slate-500">
                                            {fmtFecha(c.fecha)}
                                          </span>
                                        </Link>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                    {empleadosFiltrados.length === 0 && (
                      <p className="py-6 text-center text-sm text-slate-400">
                        Ningún empleado coincide con la búsqueda.
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    De las capacitaciones dictadas a las que se convocó a cada empleado, a cuántas
                    asistió. Mismo universo que el KPI general, así que los totales cierran.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function Kpi({
  valor,
  label,
  detalle,
  color,
  icono,
  destacado,
}: {
  valor: string
  label: string
  detalle: string
  color: string
  icono?: React.ReactNode
  destacado?: boolean
}) {
  return (
    <div
      className="h-full rounded-lg border p-3"
      style={{
        borderColor: color + "40",
        backgroundColor: destacado ? color + "0D" : undefined,
      }}
    >
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icono}
        <span className={`font-bold ${destacado ? "text-3xl" : "text-2xl"}`}>{valor}</span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{detalle}</p>
    </div>
  )
}
