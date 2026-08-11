"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { getAsistenciaDiaYam, getResumenAsistenciaYam } from "@/actions/yam"
import { ultimoDiaDelMes } from "@/lib/herramientas-gestion"
import type {
  YamAsistenciaDia,
  YamAusentismo,
  YamPersona,
  YamResumenAsistencia,
} from "@/lib/yam"

interface Props {
  hoy: string
  nomina: YamPersona[]
  asistenciaInicial: YamAsistenciaDia[]
  ausentismos: YamAusentismo[]
  errores: string[]
}

type Tab = "asistencia" | "ausencias" | "nomina" | "resumen"

// ── Helpers de presentación ─────────────────────────────────────────────────

function badgeEstadoDia(estado: string): string {
  switch (estado) {
    case "PRESENTE":
      return "bg-emerald-100 text-emerald-800"
    case "AUSENTE":
      return "bg-red-100 text-red-700"
    case "VACACIONES":
      return "bg-sky-100 text-sky-800"
    case "LICENCIA":
      return "bg-amber-100 text-amber-800"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

function badgeCategoria(codigo: string): string {
  switch (codigo) {
    case "VACACIONES":
      return "bg-sky-100 text-sky-800"
    case "LICENCIA":
      return "bg-amber-100 text-amber-800"
    case "SANCION":
      return "bg-red-100 text-red-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function antiguedad(ingreso: string | null, hoy: string): string {
  if (!ingreso) return "—"
  const ms = new Date(hoy).getTime() - new Date(ingreso).getTime()
  const anios = ms / (365.25 * 24 * 3600 * 1000)
  if (anios < 1) return `${Math.max(0, Math.floor(anios * 12))} meses`
  return `${Math.floor(anios)} años`
}

// ── Componente ──────────────────────────────────────────────────────────────

export function YamClient({ hoy, nomina, asistenciaInicial, ausentismos, errores }: Props) {
  const [tab, setTab] = useState<Tab>("asistencia")
  const [pending, startTransition] = useTransition()

  // ── Asistencia del día ──
  const [fecha, setFecha] = useState(hoy)
  const [asistencia, setAsistencia] = useState(asistenciaInicial)
  const [buscarDia, setBuscarDia] = useState("")

  function cambiarFecha(nueva: string) {
    setFecha(nueva)
    if (!nueva) return
    startTransition(async () => {
      const res = await getAsistenciaDiaYam(nueva)
      if ("error" in res) toast.error(res.error)
      else setAsistencia(res.data)
    })
  }

  // ── Nómina ──
  const [buscarNomina, setBuscarNomina] = useState("")
  const activos = useMemo(() => nomina.filter((p) => !p.fecha_baja), [nomina])

  // ── Resumen individual ──
  const [legajoSel, setLegajoSel] = useState("")
  const [mesSel, setMesSel] = useState(hoy.slice(0, 7))
  const [resumen, setResumen] = useState<YamResumenAsistencia | null>(null)

  function pedirResumen() {
    if (!legajoSel || !mesSel) return
    startTransition(async () => {
      const res = await getResumenAsistenciaYam(
        legajoSel,
        `${mesSel}-01`,
        ultimoDiaDelMes(mesSel)
      )
      if ("error" in res) toast.error(res.error)
      else setResumen(res.data)
    })
  }

  // ── KPIs del día ──
  const kpis = useMemo(() => {
    const por = (estado: string) => asistencia.filter((a) => a.estado === estado).length
    const presentes = por("PRESENTE")
    const ausentes = por("AUSENTE")
    const conJornada = asistencia.filter(
      (a) => a.estado === "PRESENTE" || (a.estado === "AUSENTE" && !a.descripcion.includes("Sin Jornada"))
    ).length
    return {
      presentes,
      ausentes,
      vacaciones: por("VACACIONES"),
      licencias: por("LICENCIA"),
      presentismo: conJornada ? Math.round((presentes / conJornada) * 100) : null,
    }
  }, [asistencia])

  const asistenciaFiltrada = useMemo(() => {
    const q = buscarDia.trim().toLowerCase()
    const rows = q
      ? asistencia.filter(
          (a) => a.nombre.toLowerCase().includes(q) || a.legajo.includes(q)
        )
      : asistencia
    // Presentes primero, después el resto alfabético.
    return [...rows].sort((a, b) =>
      a.estado === b.estado
        ? a.nombre.localeCompare(b.nombre)
        : a.estado === "PRESENTE"
          ? -1
          : b.estado === "PRESENTE"
            ? 1
            : a.estado.localeCompare(b.estado)
    )
  }, [asistencia, buscarDia])

  const nominaFiltrada = useMemo(() => {
    const q = buscarNomina.trim().toLowerCase()
    if (!q) return activos
    return activos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.legajo ?? "").includes(q) ||
        (p.dni ?? "").includes(q) ||
        (p.nombre_sector ?? "").toLowerCase().includes(q)
    )
  }, [activos, buscarNomina])

  const ausenciasOrdenadas = useMemo(
    () =>
      [...ausentismos].sort((a, b) =>
        b.periodo.fecha_desde.localeCompare(a.periodo.fecha_desde)
      ),
    [ausentismos]
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: "asistencia", label: "Asistencia del día" },
    { id: "ausencias", label: "Ausencias y licencias" },
    { id: "nomina", label: `Nómina (${activos.length})` },
    { id: "resumen", label: "Resumen individual" },
  ]

  return (
    <div className="p-4 md:p-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">RRHH · YAM</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" />
          Datos en vivo
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Integración directa con YAM Capital Humano: nómina, fichadas del reloj,
        vacaciones y licencias, sin carga manual.
      </p>

      {errores.map((e) => (
        <div key={e} className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {e}
        </div>
      ))}

      {/* KPIs del día seleccionado */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Dotación activa" valor={String(activos.length)} />
        <Kpi label="Presentes" valor={String(kpis.presentes)} color="text-emerald-600" />
        <Kpi label="Ausentes" valor={String(kpis.ausentes)} color="text-red-600" />
        <Kpi
          label="Vacaciones / Lic."
          valor={String(kpis.vacaciones + kpis.licencias)}
          color="text-sky-600"
        />
        <Kpi
          label="Presentismo"
          valor={kpis.presentismo === null ? "—" : `${kpis.presentismo}%`}
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "border-b-2 border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700"
                : "px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Asistencia del día ── */}
      {tab === "asistencia" && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => cambiarFecha(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              value={buscarDia}
              onChange={(e) => setBuscarDia(e.target.value)}
              placeholder="Buscar por nombre o legajo…"
              className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            {pending && <span className="text-sm text-slate-400">Consultando YAM…</span>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Leg.</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Entrada</th>
                  <th className="px-3 py-2">Salida</th>
                  <th className="px-3 py-2">Horas</th>
                  <th className="px-3 py-2">Origen</th>
                </tr>
              </thead>
              <tbody>
                {asistenciaFiltrada.map((a) => (
                  <tr key={a.legajo} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{a.legajo}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{a.nombre}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeEstadoDia(a.estado)}`}
                        title={a.descripcion}
                      >
                        {a.descripcion}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{a.entrada ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{a.salida ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{a.horas !== "00:00" ? a.horas : "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{a.origen_entrada ?? "—"}</td>
                  </tr>
                ))}
                {!asistenciaFiltrada.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                      Sin datos para esta fecha.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ausencias y licencias ── */}
      {tab === "ausencias" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Desde</th>
                <th className="px-3 py-2">Hasta</th>
                <th className="px-3 py-2">Días</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Situación</th>
              </tr>
            </thead>
            <tbody>
              {ausenciasOrdenadas.map((a) => (
                <tr key={a.id_periodo} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {a.persona.nombre}
                    <span className="ml-1 text-xs text-slate-400">#{a.persona.legajo}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeCategoria(a.categoria.codigo)}`}>
                      {a.categoria.descripcion}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{a.motivo?.descripcion ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtFecha(a.periodo.fecha_desde)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtFecha(a.periodo.fecha_hasta)}</td>
                  <td className="px-3 py-2 tabular-nums">{a.periodo.cantidad}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        a.estado.codigo === "APROBADO"
                          ? "inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                          : "inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      }
                    >
                      {a.estado.descripcion}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{a.situacion.descripcion}</td>
                </tr>
              ))}
              {!ausenciasOrdenadas.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    Sin ausencias en la ventana consultada (últimos 30 días y próximos 60).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Nómina ── */}
      {tab === "nomina" && (
        <div>
          <input
            type="text"
            value={buscarNomina}
            onChange={(e) => setBuscarNomina(e.target.value)}
            placeholder="Buscar por nombre, legajo, DNI o sector…"
            className="mb-3 w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Leg.</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">DNI</th>
                  <th className="px-3 py-2">CUIL</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Ingreso</th>
                  <th className="px-3 py-2">Antig.</th>
                  <th className="px-3 py-2">Móvil</th>
                </tr>
              </thead>
              <tbody>
                {nominaFiltrada.map((p) => (
                  <tr key={p.id_personal} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{p.legajo ?? "—"}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{p.nombre}</td>
                    <td className="px-3 py-2 tabular-nums">{p.dni ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{p.cuil ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {p.nombre_sector ?? p.nombre_area ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fmtFecha(p.fecha_ingreso)}</td>
                    <td className="px-3 py-2 text-slate-500">{antiguedad(p.fecha_ingreso, hoy)}</td>
                    <td className="px-3 py-2 tabular-nums">{p.movil ?? "—"}</td>
                  </tr>
                ))}
                {!nominaFiltrada.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Resumen individual ── */}
      {tab === "resumen" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={legajoSel}
              onChange={(e) => setLegajoSel(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">Elegir persona…</option>
              {activos
                .filter((p) => p.legajo)
                .map((p) => (
                  <option key={p.id_personal} value={p.legajo!}>
                    {p.nombre} (#{p.legajo})
                  </option>
                ))}
            </select>
            <input
              type="month"
              value={mesSel}
              max={hoy.slice(0, 7)}
              onChange={(e) => setMesSel(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={pedirResumen}
              disabled={!legajoSel || pending}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Consultando…" : "Ver resumen"}
            </button>
          </div>

          {resumen && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Horas trabajadas" valor={resumen.horas.totales} />
                <Kpi label="Horas requeridas" valor={resumen.horas.requeridas} />
                <Kpi
                  label="Horas descontadas"
                  valor={resumen.horas.descontadas}
                  color={resumen.horas.descontadas !== "00:00" ? "text-red-600" : undefined}
                />
                <Kpi label="Promedio diario" valor={resumen.horas.promedio} />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Días laborables" valor={String(resumen.contadores.laborables)} />
                <Kpi label="Presentes" valor={String(resumen.contadores.presentes)} color="text-emerald-600" />
                <Kpi
                  label="Ausencias injustif."
                  valor={String(resumen.contadores.ausentes_injustificados)}
                  color={resumen.contadores.ausentes_injustificados ? "text-red-600" : undefined}
                />
                <Kpi
                  label="Vacaciones + licencias"
                  valor={String(resumen.contadores.vacaciones + resumen.contadores.licencias)}
                  color="text-sky-600"
                />
              </div>
              {resumen.horas.extras.some((e) => e.horas !== "00:00") && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-sm font-semibold text-slate-700">Horas extras</p>
                  <div className="flex flex-wrap gap-4">
                    {resumen.horas.extras
                      .filter((e) => e.horas !== "00:00")
                      .map((e) => (
                        <div key={e.codigo} className="text-sm">
                          <span className="text-slate-500">{e.nombre}: </span>
                          <span className="font-semibold tabular-nums">{e.horas}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {resumen.motivos.some((m) => m.cantidad > 0) && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-sm font-semibold text-slate-700">Motivos del período</p>
                  <div className="flex flex-wrap gap-4">
                    {resumen.motivos
                      .filter((m) => m.cantidad > 0)
                      .map((m) => (
                        <div key={m.codigo} className="text-sm">
                          <span className="text-slate-500">{m.nombre}: </span>
                          <span className="font-semibold tabular-nums">{m.cantidad}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!resumen && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              Elegí una persona y un mes para traer su resumen de asistencia desde YAM.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color ?? "text-slate-900"}`}>
        {valor}
      </p>
    </div>
  )
}
