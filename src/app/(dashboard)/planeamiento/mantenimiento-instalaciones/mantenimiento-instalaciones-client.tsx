"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"

// ----------------------------- API helper -----------------------------
const BASE = "/api/mantenimiento-instalaciones"
async function api(path: string, opts: RequestInit = {}) {
  const isForm = opts.body instanceof FormData
  const res = await fetch(BASE + path, {
    ...opts,
    headers: opts.body && !isForm ? { "Content-Type": "application/json", ...(opts.headers ?? {}) } : opts.headers,
  })
  if (!res.ok) {
    let msg = `Error ${res.status}`
    try { const jr = await res.json(); msg = jr.error || jr.detail || msg } catch {}
    throw new Error(msg)
  }
  if (res.status === 204) return null
  const ct = res.headers.get("content-type") ?? ""
  return ct.includes("json") ? res.json() : res.text()
}
const j = (path: string, method: string, body: any) => api(path, { method, body: JSON.stringify(body) })

// ----------------------------- format helpers -----------------------------
const fmtPct = (v: number | null | undefined) => `${(v ?? 0).toFixed(1)}%`
const fmtMoney = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v)
const hoyISO = () => new Date().toISOString().slice(0, 10)
const adhText = (v: number) => (v >= 64 ? "text-green-700" : v >= 33 ? "text-yellow-700" : "text-red-700")
const adhBar = (v: number) => (v >= 64 ? "#10b981" : v >= 33 ? "#f59e0b" : "#ef4444")
const labelEstado = (e: string) => (({ planificado: "Planificado", en_curso: "En curso", ejecutado: "Ejecutado", cerrado: "Cerrado" } as any)[e] ?? e)

// ----------------------------- Modal -----------------------------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const inputCls = "block w-full rounded border px-3 py-2 text-sm"
const labelCls = "text-xs uppercase text-gray-500"
const btnPrimary = "rounded bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-500"
const btnGhost = "rounded border px-4 py-2 text-sm"

// ======================================================================
//  Root
// ======================================================================
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "checklist", label: "Checklist" },
  { key: "pdas", label: "Planes de Acción" },
  { key: "proveedores", label: "Proveedores" },
  { key: "raci", label: "RACI" },
] as const
type TabKey = (typeof TABS)[number]["key"]

export function MantenimientoInstalacionesClient() {
  const [tab, setTab] = useState<TabKey>("dashboard")
  const [preguntas, setPreguntas] = useState<any[]>([])

  useEffect(() => {
    api("/preguntas").then(setPreguntas).catch((e) => toast.error(e.message))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Plan de Mantenimiento de Instalaciones</h1>
            <p className="text-sm text-gray-300">DPO · Pilar Planeamiento 2.4 · Gestión de Riesgos</p>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-6 border-t border-gray-700 px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 py-3 ${tab === t.key ? "border-yellow-400 font-semibold text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "checklist" && <ChecklistTab preguntas={preguntas} />}
        {tab === "pdas" && <PdasTab preguntas={preguntas} />}
        {tab === "proveedores" && <ProveedoresTab />}
        {tab === "raci" && <RaciTab />}
      </main>
    </div>
  )
}

// ======================================================================
//  Dashboard
// ======================================================================
function Kpi({ label, value, sub, color }: any) {
  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${color ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{sub}</div>
    </div>
  )
}

function DashboardTab() {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api("/dashboard").then(setD).catch((e) => toast.error(e.message)) }, [])
  if (!d) return <p className="text-sm text-gray-500">Cargando…</p>
  const ult = d.ultima
  const abiertos = (d.pdas.planificado || 0) + (d.pdas.en_curso || 0)
  const serie = d.serie

  const kpiColor = (v: number | null, u: number) => (v == null ? "text-gray-400" : v >= u ? "text-green-700" : "text-red-700")

  return (
    <div>
      {d.alertas?.length > 0 && (
        <div className="mb-4 space-y-2">
          {d.alertas.map((a: string, i: number) => (
            <div key={i} className="rounded border-l-4 border-red-400 bg-red-50 px-4 py-2 text-sm text-red-800">⚠ {a}</div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="Adherencia total" value={ult ? fmtPct(ult.total_pct) : "—"} sub="Umbral DPO ≥ 64%" color={kpiColor(ult?.total_pct, 64)} />
        <Kpi label="Items críticos" value={ult ? fmtPct(ult.criticos_pct) : "—"} sub="Umbral DPO ≥ 89%" color={kpiColor(ult?.criticos_pct, 89)} />
        <Kpi label="PDAs abiertos" value={abiertos} sub={`${d.pdas.planificado || 0} planif · ${d.pdas.en_curso || 0} en curso · ${d.pdas.ejecutado || 0} ejec`} />
        <Kpi label="Costo planificado" value={fmtMoney(d.pdas.costo_estimado_total)} sub={`Ejecutado: ${fmtMoney(d.pdas.costo_ejecutado_total)}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-2 font-semibold">Evolución por trimestre</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip />
              <Legend />
              <Line dataKey="total_pct" name="Total" stroke="#f59e0b" strokeWidth={2} />
              <Line dataKey="criticos_pct" name="Críticos" stroke="#dc2626" strokeWidth={2} />
              <ReferenceLine y={64} stroke="#fbbf24" strokeDasharray="4 4" />
              <ReferenceLine y={89} stroke="#ef4444" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-2 font-semibold">Adherencia por sección (última revisión)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={(ult?.secciones ?? []).map((s: any) => ({ name: `${s.seccion_num}`, v: s.adherencia_pct }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip />
              <Bar dataKey="v" name="Adherencia">
                {(ult?.secciones ?? []).map((s: any, i: number) => <Cell key={i} fill={adhBar(s.adherencia_pct)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-white p-4 shadow">
        <h3 className="mb-2 font-semibold">Detalle por sección</h3>
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-gray-500">
            <tr><th className="py-2 text-left">#</th><th className="text-left">Sección</th><th className="text-right">Items</th><th className="text-right">Adherencia</th></tr>
          </thead>
          <tbody>
            {(ult?.secciones ?? []).map((s: any) => (
              <tr key={s.seccion_num} className="border-b hover:bg-gray-50">
                <td className="py-2">{s.seccion_num}</td>
                <td>{s.seccion_titulo}</td>
                <td className="text-right">{s.items}</td>
                <td className={`text-right font-medium ${adhText(s.adherencia_pct)}`}>{fmtPct(s.adherencia_pct)}</td>
              </tr>
            ))}
            {!ult && <tr><td colSpan={4} className="py-6 text-center text-gray-500">Sin revisiones cargadas todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ======================================================================
//  Checklist
// ======================================================================
const SCORE_MAP: Record<string, number> = { "5": 1, "3": 1, "1": 1 / 3, "0": 0 }
function adherenciaSeccion(items: any[], puntajes: Record<number, any>) {
  let w = 0, s = 0
  for (const p of items) {
    const v = puntajes[p.id]?.puntaje
    if (v == null || v === "" || v === "N/A") continue
    const norm = SCORE_MAP[v]
    if (norm == null) continue
    const pw = Number(p.peso_item) || 1
    w += pw; s += pw * norm
  }
  return w ? (s / w) * 100 : 0
}

function ChecklistTab({ preguntas }: { preguntas: any[] }) {
  const [revisiones, setRevisiones] = useState<any[]>([])
  const [revId, setRevId] = useState<number | null>(null)
  const [puntajes, setPuntajes] = useState<Record<number, any>>({})
  const [nuevaRev, setNuevaRev] = useState(false)

  const cargarRevisiones = useCallback(async () => {
    const revs = await api("/revisiones")
    setRevisiones(revs)
    setRevId((cur) => cur ?? revs.find((r: any) => !r.cerrada)?.id ?? revs[0]?.id ?? null)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarRevisiones().catch((e) => toast.error(e.message)) }, [cargarRevisiones])

  const cargarPuntajes = useCallback(async (id: number) => {
    const pts = await api(`/revisiones/${id}/puntajes`)
    const map: Record<number, any> = {}
    pts.forEach((p: any) => { map[p.pregunta_id] = p })
    setPuntajes(map)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (revId) cargarPuntajes(revId).catch((e) => toast.error(e.message)) }, [revId, cargarPuntajes])

  const rev = revisiones.find((r) => r.id === revId)
  const cerrada = !!rev?.cerrada

  const guardarPuntaje = async (preguntaId: number, puntaje?: string, comentario?: string) => {
    const actual = puntajes[preguntaId] ?? {}
    const body = {
      pregunta_id: preguntaId,
      puntaje: puntaje !== undefined ? puntaje || null : actual.puntaje ?? null,
      comentario: comentario !== undefined ? comentario || null : actual.comentario ?? null,
    }
    try {
      await j(`/revisiones/${revId}/puntajes`, "PUT", body)
      setPuntajes((m) => ({ ...m, [preguntaId]: body }))
    } catch (e: any) { toast.error(e.message) }
  }

  const accionRev = async (accion: "cerrar" | "reabrir") => {
    if (!revId) return
    if (!confirm(accion === "cerrar" ? "¿Cerrar la revisión? No se podrán modificar más puntajes." : "¿Reabrir la revisión para editar?")) return
    try { await j(`/revisiones/${revId}`, "PATCH", { accion }); await cargarRevisiones() } catch (e: any) { toast.error(e.message) }
  }
  const borrarRev = async () => {
    if (!revId) return
    if (!confirm(`¿Borrar la revisión "${rev?.periodo}"? Se pierden sus puntajes y los planes creados desde ella.`)) return
    try { await api(`/revisiones/${revId}`, { method: "DELETE" }); setRevId(null); await cargarRevisiones() } catch (e: any) { toast.error(e.message) }
  }

  const porSeccion = useMemo(() => {
    const map: Record<number, { titulo: string; bloque: string; items: any[] }> = {}
    for (const p of preguntas) {
      if (!map[p.seccion_num]) map[p.seccion_num] = { titulo: p.seccion_titulo, bloque: p.bloque, items: [] }
      map[p.seccion_num].items.push(p)
    }
    return map
  }, [preguntas])

  const opciones = ["", "0", "1", "3", "5", "N/A"]
  const scoreColor = (v: string) => (v === "0" ? "bg-red-100" : v === "1" ? "bg-yellow-100" : v === "3" || v === "5" ? "bg-green-100" : "bg-white")

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
        <div>
          <label className={labelCls}>Revisión</label>
          <select className={`${inputCls} min-w-[220px]`} value={revId ?? ""} onChange={(e) => setRevId(Number(e.target.value))}>
            {revisiones.map((r) => <option key={r.id} value={r.id}>{r.periodo} · {r.fecha}{r.cerrada ? " (cerrada)" : ""}</option>)}
            {!revisiones.length && <option value="">Sin revisiones</option>}
          </select>
        </div>
        <button className={btnPrimary} onClick={() => setNuevaRev(true)}>+ Nueva revisión</button>
        {rev && !cerrada && <button className={btnGhost} onClick={() => accionRev("cerrar")}>Cerrar</button>}
        {rev && cerrada && <button className={btnGhost} onClick={() => accionRev("reabrir")}>Reabrir</button>}
        {rev && <button className="rounded bg-red-100 px-4 py-2 text-sm text-red-700 hover:bg-red-200" onClick={borrarRev}>Borrar</button>}
        <div className="ml-auto text-sm text-gray-600"><span className="mr-1 inline-block h-3 w-3 rounded-full bg-red-200" /> Crítico DPO</div>
      </div>

      {!revId && <div className="rounded-lg bg-white p-8 text-center text-gray-500 shadow">Creá la primera revisión trimestral para empezar a puntuar.</div>}

      <div className="space-y-3">
        {revId && Object.entries(porSeccion).map(([num, sec]) => {
          const adh = adherenciaSeccion(sec.items, puntajes)
          return (
            <details key={num} open={Number(num) <= 2} className="rounded-lg bg-white shadow">
              <summary className="flex cursor-pointer items-center justify-between rounded-lg px-4 py-3 hover:bg-gray-50">
                <div>
                  <div className="text-xs uppercase text-gray-500">{sec.bloque}</div>
                  <div className="font-semibold">{num}. {sec.titulo}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${adhText(adh)}`}>{fmtPct(adh)}</div>
                  <div className="text-xs text-gray-500">{sec.items.length} ítems</div>
                </div>
              </summary>
              <div className="divide-y border-t">
                {sec.items.map((p) => {
                  const pt = puntajes[p.id] ?? {}
                  const valor = pt.puntaje ?? ""
                  return (
                    <div key={p.id} className="grid grid-cols-12 items-start gap-3 px-4 py-3">
                      <div className="col-span-1 text-center">
                        <div className="font-mono text-sm font-bold">{p.codigo}</div>
                        {p.es_critico && <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-800">CRÍT</span>}
                      </div>
                      <div className="col-span-7">
                        <div className="mb-1 text-sm font-medium">{p.pregunta}</div>
                        <details className="text-xs text-gray-600">
                          <summary className="cursor-pointer text-blue-600">Ver verificación / criterio</summary>
                          <div className="mt-1 whitespace-pre-line"><strong>Verificación:</strong> {p.verificacion || "—"}</div>
                          <div className="mt-1 whitespace-pre-line"><strong>Criterio de puntuación:</strong> {p.explicacion || "—"}</div>
                        </details>
                      </div>
                      <div className="col-span-2">
                        <select disabled={cerrada} value={valor} className={`${inputCls} ${scoreColor(valor)}`}
                          onChange={(e) => guardarPuntaje(p.id, e.target.value, undefined)}>
                          {opciones.map((v) => <option key={v} value={v}>{v || "—"}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <textarea disabled={cerrada} rows={2} defaultValue={pt.comentario ?? ""} placeholder="Comentario"
                          className={`${inputCls} text-xs`} onBlur={(e) => guardarPuntaje(p.id, undefined, e.target.value)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>

      {nuevaRev && <NuevaRevisionModal revisiones={revisiones} onClose={() => setNuevaRev(false)} onCreated={async (id) => { setNuevaRev(false); await cargarRevisiones(); setRevId(id) }} />}
    </div>
  )
}

function NuevaRevisionModal({ revisiones, onClose, onCreated }: { revisiones: any[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [periodo, setPeriodo] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [copiarDe, setCopiarDe] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await j("/revisiones", "POST", { periodo: periodo.trim(), fecha, copiar_de: copiarDe ? Number(copiarDe) : null })
      toast.success(`Revisión "${r.periodo}" creada`)
      onCreated(r.id)
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title="Nueva revisión trimestral" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-gray-600">Creá la recorrida del nuevo trimestre. Podés partir de cero o copiar los puntajes de una revisión anterior como base.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Período *</label><input required value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-Q3" className={inputCls} /></div>
          <div><label className={labelCls}>Fecha de la revisión *</label><input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></div>
        </div>
        <div>
          <label className={labelCls}>Copiar puntajes de (opcional)</label>
          <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className={inputCls}>
            <option value="">— Empezar en blanco —</option>
            {revisiones.map((r) => <option key={r.id} value={r.id}>{r.periodo} · {r.fecha}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 border-t pt-2">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Creando…" : "Crear revisión"}</button>
        </div>
      </form>
    </Modal>
  )
}

// ======================================================================
//  Planes de Acción (PDAs)
// ======================================================================
function PdasTab({ preguntas }: { preguntas: any[] }) {
  const [pdas, setPdas] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [seccion, setSeccion] = useState<number | null>(null)
  const [estado, setEstado] = useState("")
  const [editPda, setEditPda] = useState<any | undefined>(undefined)
  const [nuevoPda, setNuevoPda] = useState<{ open: boolean; preguntaId?: number }>({ open: false })
  const [evidPda, setEvidPda] = useState<any | null>(null)

  const secciones = useMemo(() => {
    const m = new Map<number, string>()
    preguntas.forEach((p) => { if (!m.has(p.seccion_num)) m.set(p.seccion_num, p.seccion_titulo) })
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [preguntas])

  const cargar = useCallback(async () => {
    const params = new URLSearchParams()
    if (estado) params.set("estado", estado)
    if (seccion != null) params.set("seccion_num", String(seccion))
    const qs = params.toString()
    setPdas(await api("/pdas" + (qs ? `?${qs}` : "")))
  }, [estado, seccion])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch((e) => toast.error(e.message)) }, [cargar])
  useEffect(() => { api("/proveedores").then(setProveedores).catch(() => {}) }, [])

  const borrar = async (id: number) => {
    if (!confirm("¿Borrar plan de acción y todas sus evidencias?")) return
    try { await api(`/pdas/${id}`, { method: "DELETE" }); await cargar() } catch (e: any) { toast.error(e.message) }
  }

  const abiertos = pdas.filter((p) => p.estado === "planificado" || p.estado === "en_curso").length
  const grupos = useMemo(() => {
    if (seccion != null) return null
    const g: Record<number, { titulo: string; items: any[] }> = {}
    pdas.forEach((p) => {
      const k = p.seccion_num ?? 0
      if (!g[k]) g[k] = { titulo: p.seccion_titulo || "(sin sección)", items: [] }
      g[k].items.push(p)
    })
    return Object.entries(g).sort(([a], [b]) => Number(a) - Number(b))
  }, [pdas, seccion])

  const PdaCard = ({ p }: { p: any }) => {
    const estCol = ({ planificado: "bg-yellow-100 text-yellow-800", en_curso: "bg-yellow-100 text-yellow-800", ejecutado: "bg-green-100 text-green-800", cerrado: "bg-gray-200 text-gray-700" } as any)[p.estado] ?? ""
    return (
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{p.pregunta_codigo || "?"}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${estCol}`}>{labelEstado(p.estado)}</span>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">{p.tipo}</span>
              {p.proveedor_nombre && <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">🛠 {p.proveedor_nombre}</span>}
              {p.cantidad_evidencias > 0 && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">📎 {p.cantidad_evidencias}</span>}
            </div>
            <div className="font-semibold">{p.titulo}</div>
            <div className="line-clamp-2 text-xs text-gray-500">{p.pregunta_texto || ""}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div><div className="text-xs text-gray-500">Responsable</div><div>{p.responsable || "—"}</div></div>
              <div><div className="text-xs text-gray-500">Fecha probable</div><div>{p.fecha_probable || "—"}</div></div>
              <div><div className="text-xs text-gray-500">Costo estimado</div><div>{fmtMoney(p.costo_estimado)}</div></div>
              <div><div className="text-xs text-gray-500">Costo ejecutado</div><div>{fmtMoney(p.costo_ejecutado)}</div></div>
            </div>
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-xs text-gray-500"><span>Avance</span><span>{p.avance_pct || 0}%</span></div>
              <div className="h-2 w-full rounded-full bg-gray-200"><div className="h-2 rounded-full bg-yellow-400" style={{ width: `${p.avance_pct || 0}%` }} /></div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button className="rounded border px-3 py-1 text-xs hover:bg-gray-50" onClick={() => setEditPda(p)}>Editar</button>
            <button className="rounded border px-3 py-1 text-xs hover:bg-gray-50" onClick={() => setEvidPda(p)}>Evidencias</button>
            <button className="rounded border px-3 py-1 text-xs text-red-600 hover:bg-red-50" onClick={() => borrar(p.id)}>Borrar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 rounded-lg bg-white p-4 shadow">
        <div className="mb-2 text-xs uppercase text-gray-500">Punto del check list</div>
        <div className="mb-4 flex flex-wrap gap-1">
          {[{ key: null as number | null, label: "Todos" }, ...secciones.map(([n, t]) => ({ key: n, label: `${n}. ${t}` }))].map((t) => (
            <button key={t.key ?? "all"} title={t.label}
              onClick={() => setSeccion(t.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${t.key === seccion ? "bg-gray-900 text-yellow-400" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t.label.length > 32 ? t.label.slice(0, 32) + "…" : t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <div>
            <label className={labelCls}>Filtrar por estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls}>
              <option value="">Todos</option><option value="planificado">Planificado</option><option value="en_curso">En curso</option><option value="ejecutado">Ejecutado</option><option value="cerrado">Cerrado</option>
            </select>
          </div>
          <div className="ml-2 text-sm text-gray-600"><strong>{pdas.length}</strong> plan{pdas.length === 1 ? "" : "es"} · <span className="text-yellow-700">{abiertos} abierto{abiertos === 1 ? "" : "s"}</span></div>
          <button className={`ml-auto ${btnPrimary}`} onClick={() => setNuevoPda({ open: true })}>+ Nuevo plan</button>
        </div>
      </div>

      {!pdas.length && <div className="rounded-lg bg-white p-8 text-center shadow"><div className="mb-3 text-gray-500">Sin planes de acción para este filtro.</div><button className={btnPrimary} onClick={() => setNuevoPda({ open: true })}>+ Crear el primero</button></div>}

      <div className="space-y-3">
        {grupos
          ? grupos.map(([num, g]) => (
            <div key={num} className="rounded-lg bg-white shadow">
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2">
                <div className="text-sm font-semibold"><span className="font-mono">{num}.</span> {g.titulo}</div>
                <div className="text-xs text-gray-500">{g.items.length} plan{g.items.length === 1 ? "" : "es"}</div>
              </div>
              <div className="divide-y">{g.items.map((p) => <PdaCard key={p.id} p={p} />)}</div>
            </div>
          ))
          : pdas.map((p) => <div key={p.id} className="rounded-lg bg-white shadow"><PdaCard p={p} /></div>)}
      </div>

      {(nuevoPda.open || editPda) && (
        <PdaModal pda={editPda} preguntaId={nuevoPda.preguntaId} preguntas={preguntas} proveedores={proveedores}
          onClose={() => { setEditPda(undefined); setNuevoPda({ open: false }) }}
          onSaved={async () => { setEditPda(undefined); setNuevoPda({ open: false }); await cargar() }} />
      )}
      {evidPda && <EvidenciasModal pda={evidPda} onClose={() => setEvidPda(null)} onChanged={cargar} />}
    </div>
  )
}

function PdaModal({ pda, preguntaId, preguntas, proveedores, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(() => ({
    pregunta_id: pda?.pregunta_id ?? preguntaId ?? "",
    titulo: pda?.titulo ?? "", descripcion: pda?.descripcion ?? "",
    tipo: pda?.tipo ?? "reparacion", estado: pda?.estado ?? "planificado",
    proveedor_id: pda?.proveedor_id ?? "", responsable: pda?.responsable ?? "",
    fecha_probable: pda?.fecha_probable ?? "", avance_pct: pda?.avance_pct ?? 0,
    costo_estimado: pda?.costo_estimado ?? "", costo_ejecutado: pda?.costo_ejecutado ?? "",
    fecha_ejecucion: pda?.fecha_ejecucion ?? "",
  }))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.pregunta_id || !f.titulo) { toast.error("Pregunta y título son obligatorios"); return }
    setSaving(true)
    const body = {
      pregunta_id: Number(f.pregunta_id),
      proveedor_id: f.proveedor_id === "" ? null : Number(f.proveedor_id),
      titulo: f.titulo, descripcion: f.descripcion || null, tipo: f.tipo, estado: f.estado,
      responsable: f.responsable || null, fecha_probable: f.fecha_probable || null,
      avance_pct: Number(f.avance_pct || 0),
      costo_estimado: f.costo_estimado === "" ? null : Number(f.costo_estimado),
      costo_ejecutado: f.costo_ejecutado === "" ? null : Number(f.costo_ejecutado),
      fecha_ejecucion: f.fecha_ejecucion || null,
      revision_id: pda?.revision_id ?? null,
    }
    try {
      if (pda) await j(`/pdas/${pda.id}`, "PUT", body)
      else await j("/pdas", "POST", body)
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title={pda ? `Editar plan: ${pda.titulo}` : "Nuevo plan de acción"} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className={labelCls}>Pregunta vinculada *</label>
          <select required value={f.pregunta_id} onChange={(e) => set("pregunta_id", e.target.value)} className={inputCls}>
            <option value="">— Elegir —</option>
            {preguntas.map((p: any) => <option key={p.id} value={p.id}>{p.codigo} · {p.pregunta.slice(0, 80)}{p.es_critico ? " [CRÍT]" : ""}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Título *</label><input required value={f.titulo} onChange={(e) => set("titulo", e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>Descripción</label><textarea rows={2} value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Tipo</label><select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>{["reparacion", "inversion", "preventivo"].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={labelCls}>Estado</label><select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={inputCls}>{["planificado", "en_curso", "ejecutado", "cerrado"].map((s) => <option key={s} value={s}>{labelEstado(s)}</option>)}</select></div>
        </div>
        <div>
          <label className={labelCls}>Proveedor asignado</label>
          <select value={f.proveedor_id} onChange={(e) => set("proveedor_id", e.target.value)} className={inputCls}>
            <option value="">— Sin asignar —</option>
            {proveedores.map((pv: any) => <option key={pv.id} value={pv.id}>{pv.nombre}{pv.tipo_servicio ? " · " + pv.tipo_servicio : ""}</option>)}
          </select>
          <div className="mt-1 text-xs text-gray-500">¿Falta un proveedor? Cargalo en la pestaña &quot;Proveedores → Base de datos&quot;.</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Responsable</label><input value={f.responsable} onChange={(e) => set("responsable", e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Fecha probable</label><input type="date" value={f.fecha_probable} onChange={(e) => set("fecha_probable", e.target.value)} className={inputCls} /></div>
        </div>
        <div>
          <label className={labelCls}>Avance: {f.avance_pct}%</label>
          <input type="range" min={0} max={100} step={5} value={f.avance_pct} onChange={(e) => set("avance_pct", e.target.value)} className="w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Costo estimado (ARS)</label><input type="number" step="0.01" value={f.costo_estimado} onChange={(e) => set("costo_estimado", e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Costo ejecutado (ARS)</label><input type="number" step="0.01" value={f.costo_ejecutado} onChange={(e) => set("costo_ejecutado", e.target.value)} className={inputCls} /></div>
        </div>
        <div><label className={labelCls}>Fecha de ejecución</label><input type="date" value={f.fecha_ejecucion} onChange={(e) => set("fecha_ejecucion", e.target.value)} className={inputCls} /></div>
        {!pda && <div className="text-xs text-gray-500">Para subir evidencias y marcar como ejecutado, primero guardá el plan.</div>}
        <div className="flex justify-end gap-2 border-t pt-2">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Guardando…" : pda ? "Guardar" : "Crear"}</button>
        </div>
      </form>
    </Modal>
  )
}

function EvidenciasModal({ pda, onClose, onChanged }: any) {
  const [evs, setEvs] = useState<any[]>([])
  const [descripcion, setDescripcion] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const cargar = useCallback(async () => { setEvs(await api(`/pdas/${pda.id}/evidencias`)) }, [pda.id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch((e) => toast.error(e.message)) }, [cargar])

  const subir = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!archivo) { toast.error("Elegí un archivo"); return }
    setSaving(true)
    const fd = new FormData()
    fd.append("archivo", archivo)
    fd.append("descripcion", descripcion)
    try {
      await api(`/pdas/${pda.id}/evidencias`, { method: "POST", body: fd })
      setDescripcion(""); setArchivo(null)
      await cargar(); await onChanged()
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const borrar = async (id: number) => {
    if (!confirm("¿Borrar evidencia?")) return
    try { await api(`/evidencias/${id}`, { method: "DELETE" }); await cargar(); await onChanged() } catch (e: any) { toast.error(e.message) }
  }
  return (
    <Modal title={`Evidencias — ${pda.titulo}`} onClose={onClose}>
      <form className="mb-4 space-y-2 border-b pb-4" onSubmit={subir}>
        <div><label className={labelCls}>Archivo (foto, PDF, doc)</label><input type="file" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></div>
        <div><label className={labelCls}>Descripción</label><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Foto del cambio de chapas - galpón 2" className={inputCls} /></div>
        <button disabled={saving} className={btnPrimary}>{saving ? "Subiendo…" : "Subir evidencia"}</button>
      </form>
      <div className="space-y-2">
        {evs.length ? evs.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded border p-2">
            <div className="min-w-0 flex-1">
              {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline">{e.nombre_original}</a> : <span className="text-sm">{e.nombre_original}</span>}
              <div className="text-xs text-gray-500">{new Date(e.subida_en).toLocaleString("es-AR")} · {e.descripcion || ""}</div>
            </div>
            <button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => borrar(e.id)}>Borrar</button>
          </div>
        )) : <div className="py-4 text-center text-sm text-gray-500">Sin evidencias todavía</div>}
      </div>
    </Modal>
  )
}

// ======================================================================
//  Proveedores (Base de datos + Evaluación)
// ======================================================================
function ProveedoresTab() {
  const [sub, setSub] = useState<"base" | "eval">("base")
  return (
    <div>
      <div className="mb-4 flex gap-1">
        <button onClick={() => setSub("base")} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${sub === "base" ? "bg-gray-900 text-yellow-400" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Base de datos</button>
        <button onClick={() => setSub("eval")} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${sub === "eval" ? "bg-gray-900 text-yellow-400" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Evaluación de proveedores</button>
      </div>
      {sub === "base" ? <ProveedoresBase /> : <ProveedoresEval />}
    </div>
  )
}

function ProveedoresBase() {
  const [provs, setProvs] = useState<any[]>([])
  const [resumen, setResumen] = useState<Record<number, any>>({})
  const [edit, setEdit] = useState<any | undefined>(undefined)
  const [nuevo, setNuevo] = useState(false)
  const cargar = useCallback(async () => {
    const [p, r] = await Promise.all([api("/proveedores"), api("/eval/resumen").catch(() => [])])
    setProvs(p)
    setResumen(Object.fromEntries((r as any[]).map((x) => [x.proveedor_id, x])))
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch((e) => toast.error(e.message)) }, [cargar])
  const borrar = async (id: number) => {
    if (!confirm("¿Borrar proveedor?")) return
    try { await api(`/proveedores/${id}`, { method: "DELETE" }); await cargar() } catch (e: any) { toast.error(e.message) }
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-white p-4 shadow">
        <div><h3 className="font-semibold">Base de datos de proveedores</h3><p className="text-sm text-gray-500">DPO R2.4.4 · Proveedores de mantenimiento disponibles para referenciar</p></div>
        <button className={btnPrimary} onClick={() => setNuevo(true)}>+ Nuevo proveedor</button>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Tipo de servicio</th><th className="px-3 py-2 text-left">Alcance</th><th className="px-3 py-2 text-left">Contacto</th><th className="px-3 py-2 text-left">Teléfono</th><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2 text-center">Eval. promedio</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {provs.length ? provs.map((p) => {
              const r = resumen[p.id]
              return (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{p.nombre}</td>
                  <td className="px-3 py-2">{p.tipo_servicio || "—"}</td>
                  <td className="px-3 py-2">{p.alcance || "—"}</td>
                  <td className="px-3 py-2">{p.contacto || "—"}</td>
                  <td className="px-3 py-2">{p.telefono || "—"}</td>
                  <td className="px-3 py-2">{p.email || "—"}</td>
                  <td className="px-3 py-2 text-center">{r && r.promedio != null ? <span className={`font-semibold ${r.promedio >= 4 ? "text-green-700" : r.promedio >= 3 ? "text-yellow-700" : "text-red-700"}`}>{r.promedio.toFixed(2)} <span className="text-xs text-gray-500">({r.evaluaciones})</span></span> : <span className="text-xs text-gray-400">sin evaluar</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setEdit(p)}>Editar</button>
                    <button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => borrar(p.id)}>Borrar</button>
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={8} className="py-6 text-center text-gray-500">Sin proveedores cargados</td></tr>}
          </tbody>
        </table>
      </div>
      {(nuevo || edit) && <ProveedorModal prov={edit} onClose={() => { setNuevo(false); setEdit(undefined) }} onSaved={async () => { setNuevo(false); setEdit(undefined); await cargar() }} />}
    </div>
  )
}

function ProveedorModal({ prov, onClose, onSaved }: any) {
  const campos: [string, string][] = [["nombre", "Nombre *"], ["tipo_servicio", "Tipo servicio"], ["contacto", "Contacto"], ["telefono", "Teléfono"], ["email", "Email"], ["direccion", "Dirección"]]
  const [f, setF] = useState<any>(() => ({ nombre: prov?.nombre ?? "", tipo_servicio: prov?.tipo_servicio ?? "", contacto: prov?.contacto ?? "", telefono: prov?.telefono ?? "", email: prov?.email ?? "", direccion: prov?.direccion ?? "", alcance: prov?.alcance ?? "", notas: prov?.notas ?? "" }))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.nombre) { toast.error("El nombre es obligatorio"); return }
    setSaving(true)
    const body: any = {}
    Object.keys(f).forEach((k) => { body[k] = f[k] === "" ? null : f[k] })
    try {
      if (prov) await j(`/proveedores/${prov.id}`, "PUT", body)
      else await j("/proveedores", "POST", body)
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title={prov ? "Editar proveedor" : "Nuevo proveedor"} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        {campos.map(([k, label]) => <div key={k}><label className={labelCls}>{label}</label><input value={f[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} /></div>)}
        <div><label className={labelCls}>Alcance</label><select value={f.alcance} onChange={(e) => set("alcance", e.target.value)} className={inputCls}>{["", "Local", "Provincial", "Nacional"].map((v) => <option key={v} value={v}>{v || "—"}</option>)}</select></div>
        <div><label className={labelCls}>Notas</label><textarea rows={2} value={f.notas} onChange={(e) => set("notas", e.target.value)} className={inputCls} /></div>
        <div className="flex justify-end gap-2 border-t pt-2"><button type="button" onClick={onClose} className={btnGhost}>Cancelar</button><button disabled={saving} className={btnPrimary}>{saving ? "Guardando…" : prov ? "Guardar" : "Crear"}</button></div>
      </form>
    </Modal>
  )
}

function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} onClick={onChange ? () => onChange(i) : undefined}
          className={`text-lg leading-none ${onChange ? "cursor-pointer" : ""} ${value != null && i <= value ? "text-amber-500" : "text-gray-300"}`}>★</span>
      ))}
      {onChange && <button type="button" onClick={() => onChange(null)} className="ml-1 text-xs text-gray-400 hover:text-gray-700">N/A</button>}
    </span>
  )
}

function ProveedoresEval() {
  const [criterios, setCriterios] = useState<any[]>([])
  const [resumen, setResumen] = useState<any[]>([])
  const [evals, setEvals] = useState<any[]>([])
  const [provs, setProvs] = useState<any[]>([])
  const [filtro, setFiltro] = useState("")
  const [editCrit, setEditCrit] = useState<any | undefined>(undefined)
  const [nuevoCrit, setNuevoCrit] = useState(false)
  const [editEval, setEditEval] = useState<any | undefined>(undefined)
  const [nuevaEval, setNuevaEval] = useState(false)

  const cargar = useCallback(async () => {
    const [c, r, p] = await Promise.all([api("/eval/criterios?incluir_inactivos=true"), api("/eval/resumen"), api("/proveedores")])
    setCriterios(c); setProvs(p)
    setResumen([...r].sort((a: any, b: any) => (a.promedio == null && b.promedio == null) ? a.proveedor_nombre.localeCompare(b.proveedor_nombre) : a.promedio == null ? 1 : b.promedio == null ? -1 : b.promedio - a.promedio))
  }, [])
  const cargarEvals = useCallback(async () => { setEvals(await api("/eval/evaluaciones" + (filtro ? `?proveedor_id=${filtro}` : ""))) }, [filtro])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch((e) => toast.error(e.message)) }, [cargar])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarEvals().catch((e) => toast.error(e.message)) }, [cargarEvals])

  const borrarCrit = async (c: any) => {
    if (!confirm(c.activo ? "¿Quitar criterio? Si tiene puntajes históricos queda inactivo." : "¿Borrar definitivamente?")) return
    try { await api(`/eval/criterios/${c.id}`, { method: "DELETE" }); await cargar() } catch (e: any) { toast.error(e.message) }
  }
  const borrarEval = async (id: number) => {
    if (!confirm("¿Borrar evaluación?")) return
    try { await api(`/eval/evaluaciones/${id}`, { method: "DELETE" }); await cargar(); await cargarEvals() } catch (e: any) { toast.error(e.message) }
  }
  const refrescarTodo = async () => { await cargar(); await cargarEvals() }

  return (
    <div>
      <div className="mb-4 rounded-lg bg-white p-4 shadow">
        <div className="mb-3 flex items-start justify-between">
          <div><h3 className="font-semibold">Criterios de evaluación</h3><p className="text-sm text-gray-500">Preguntas que se aplican a cada proveedor. Editables y ampliables.</p></div>
          <button className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-black" onClick={() => setNuevoCrit(true)}>+ Agregar pregunta</button>
        </div>
        <div className="divide-y rounded border">
          {criterios.length ? criterios.map((c, i) => (
            <div key={c.id} className={`flex items-start gap-3 px-3 py-2 ${c.activo ? "" : "opacity-50"}`}>
              <div className="mt-1 w-6 font-mono text-xs text-gray-500">{c.orden || i + 1}</div>
              <div className="flex-1"><div className="text-sm font-medium">{c.texto} {!c.activo && <span className="text-xs text-gray-500">(inactivo)</span>}</div>{c.descripcion && <div className="mt-0.5 text-xs text-gray-500">{c.descripcion}</div>}</div>
              <div className="flex gap-2"><button className="text-xs text-blue-600 hover:underline" onClick={() => setEditCrit(c)}>Editar</button><button className="text-xs text-red-600 hover:underline" onClick={() => borrarCrit(c)}>{c.activo ? "Quitar" : "Borrar"}</button></div>
            </div>
          )) : <div className="py-6 text-center text-sm text-gray-500">Sin criterios. Agregá la primera pregunta de evaluación.</div>}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
        <div><label className={labelCls}>Filtrar por proveedor</label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${inputCls} min-w-[200px]`}><option value="">Todos</option>{provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        </div>
        <button className={`ml-auto ${btnPrimary}`} onClick={() => setNuevaEval(true)}>+ Nueva evaluación</button>
      </div>

      <div className="mb-4 rounded-lg bg-white p-4 shadow">
        <h3 className="mb-2 font-semibold">Ranking general</h3>
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-gray-500"><tr><th className="py-2 text-left">Proveedor</th><th className="text-left">Tipo</th><th className="text-center"># evaluaciones</th><th className="text-center">Última fecha</th><th className="text-right">Promedio</th></tr></thead>
          <tbody>
            {resumen.length ? resumen.map((r) => (
              <tr key={r.proveedor_id} className="border-b hover:bg-gray-50">
                <td className="py-2"><button className="text-blue-600 hover:underline" onClick={() => setFiltro(String(r.proveedor_id))}>{r.proveedor_nombre}</button></td>
                <td>{r.tipo_servicio || "—"}</td><td className="text-center">{r.evaluaciones}</td><td className="text-center">{r.ultima_fecha || "—"}</td>
                <td className="text-right">{r.promedio == null ? <span className="text-xs text-gray-400">sin evaluar</span> : <span className={`font-semibold ${r.promedio >= 4 ? "text-green-700" : r.promedio >= 3 ? "text-yellow-700" : "text-red-700"}`}>{r.promedio.toFixed(2)} / 5</span>}</td>
              </tr>
            )) : <tr><td colSpan={5} className="py-4 text-center text-gray-500">Sin proveedores cargados</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        {evals.length ? evals.map((ev) => {
          const promCol = ev.promedio == null ? "text-gray-400" : ev.promedio >= 4 ? "text-green-700" : ev.promedio >= 3 ? "text-yellow-700" : "text-red-700"
          return (
            <div key={ev.id} className="rounded-lg bg-white p-4 shadow">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div><div className="text-xs uppercase text-gray-500">{ev.fecha}{ev.evaluador ? ` · ${ev.evaluador}` : ""}</div><div className="font-semibold">{ev.proveedor_nombre || "?"}</div></div>
                <div className="text-right"><div className={`text-2xl font-bold ${promCol}`}>{ev.promedio == null ? "—" : ev.promedio.toFixed(2)}</div><div className="text-xs text-gray-500">promedio / 5</div></div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                {ev.puntajes.map((pt: any) => (
                  <div key={pt.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1"><span className="truncate">{pt.criterio_texto || "?"}</span><span>{pt.puntaje != null ? <Stars value={pt.puntaje} /> : <span className="text-xs text-gray-400">N/A</span>}</span></div>
                ))}
              </div>
              {ev.observaciones && <div className="mt-2 rounded bg-gray-50 p-2 text-sm"><strong>Observaciones:</strong> {ev.observaciones}</div>}
              <div className="mt-3 flex justify-end gap-2"><button className="rounded border px-3 py-1 text-xs hover:bg-gray-50" onClick={() => setEditEval(ev)}>Editar</button><button className="rounded border px-3 py-1 text-xs text-red-600 hover:bg-red-50" onClick={() => borrarEval(ev.id)}>Borrar</button></div>
            </div>
          )
        }) : <div className="rounded-lg bg-white p-8 text-center text-gray-500 shadow">Sin evaluaciones para el filtro actual. Hacé clic en &quot;+ Nueva evaluación&quot;.</div>}
      </div>

      {(nuevoCrit || editCrit) && <CriterioModal crit={editCrit} onClose={() => { setNuevoCrit(false); setEditCrit(undefined) }} onSaved={async () => { setNuevoCrit(false); setEditCrit(undefined); await cargar() }} />}
      {(nuevaEval || editEval) && <EvaluacionModal evalId={editEval?.id} provs={provs} onClose={() => { setNuevaEval(false); setEditEval(undefined) }} onSaved={async () => { setNuevaEval(false); setEditEval(undefined); await refrescarTodo() }} />}
    </div>
  )
}

function CriterioModal({ crit, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(() => ({ texto: crit?.texto ?? "", descripcion: crit?.descripcion ?? "", orden: crit?.orden ?? 0, activo: crit?.activo !== false }))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.texto) { toast.error("La pregunta es obligatoria"); return }
    setSaving(true)
    const body = { texto: f.texto, descripcion: f.descripcion || null, orden: Number(f.orden || 0), activo: !!f.activo }
    try { if (crit) await j(`/eval/criterios/${crit.id}`, "PUT", body); else await j("/eval/criterios", "POST", body); onSaved() } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title={crit ? "Editar criterio" : "Nuevo criterio de evaluación"} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div><label className={labelCls}>Pregunta * <span className="text-gray-400">(qué se evalúa)</span></label><input required value={f.texto} onChange={(e) => set("texto", e.target.value)} placeholder="Ej: Cumplimiento de plazos" className={inputCls} /></div>
        <div><label className={labelCls}>Descripción / criterio</label><textarea rows={2} value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Orden</label><input type="number" value={f.orden} onChange={(e) => set("orden", e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Estado</label><select value={f.activo ? "true" : "false"} onChange={(e) => set("activo", e.target.value === "true")} className={inputCls}><option value="true">Activo</option><option value="false">Inactivo</option></select></div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-2"><button type="button" onClick={onClose} className={btnGhost}>Cancelar</button><button disabled={saving} className={btnPrimary}>{saving ? "Guardando…" : crit ? "Guardar" : "Crear"}</button></div>
      </form>
    </Modal>
  )
}

function EvaluacionModal({ evalId, provs, onClose, onSaved }: any) {
  const [criterios, setCriterios] = useState<any[]>([])
  const [f, setF] = useState<any>({ proveedor_id: "", fecha: hoyISO(), evaluador: "", observaciones: "" })
  const [pts, setPts] = useState<Record<number, { puntaje: number | null; comentario: string }>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const crits = await api(`/eval/criterios${evalId != null ? "?incluir_inactivos=true" : ""}`)
      setCriterios(crits)
      if (evalId != null) {
        const ev = await api(`/eval/evaluaciones/${evalId}`)
        setF({ proveedor_id: String(ev.proveedor_id), fecha: ev.fecha, evaluador: ev.evaluador ?? "", observaciones: ev.observaciones ?? "" })
        const map: Record<number, any> = {}
        ev.puntajes.forEach((p: any) => { map[p.criterio_id] = { puntaje: p.puntaje, comentario: p.comentario ?? "" } })
        setPts(map)
      }
    })().catch((e) => toast.error(e.message))
  }, [evalId])

  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))
  const setPt = (cid: number, patch: any) => setPts((m) => ({ ...m, [cid]: { puntaje: m[cid]?.puntaje ?? null, comentario: m[cid]?.comentario ?? "", ...patch } }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.proveedor_id) { toast.error("Elegí un proveedor"); return }
    setSaving(true)
    const body = {
      proveedor_id: Number(f.proveedor_id), fecha: f.fecha, evaluador: f.evaluador || null, observaciones: f.observaciones || null,
      puntajes: criterios.map((c) => ({ criterio_id: c.id, puntaje: pts[c.id]?.puntaje ?? null, comentario: pts[c.id]?.comentario || null })),
    }
    try { if (evalId != null) await j(`/eval/evaluaciones/${evalId}`, "PUT", body); else await j("/eval/evaluaciones", "POST", body); onSaved() } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title={evalId != null ? "Editar evaluación" : "Nueva evaluación de proveedor"} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Proveedor *</label><select required value={f.proveedor_id} onChange={(e) => set("proveedor_id", e.target.value)} className={inputCls}><option value="">— Elegir —</option>{provs.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div><label className={labelCls}>Fecha *</label><input required type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} className={inputCls} /></div>
        </div>
        <div><label className={labelCls}>Evaluador</label><input value={f.evaluador} onChange={(e) => set("evaluador", e.target.value)} placeholder="Quién está evaluando" className={inputCls} /></div>
        <div className="divide-y rounded border">
          <div className="bg-gray-50 px-3 py-2 text-xs uppercase text-gray-500">Calificación · 1 = malo · 5 = excelente</div>
          {criterios.map((c) => (
            <div key={c.id} className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.texto}</div>{c.descripcion && <div className="mt-0.5 text-xs text-gray-500">{c.descripcion}</div>}</div>
                <Stars value={pts[c.id]?.puntaje ?? null} onChange={(v) => setPt(c.id, { puntaje: v })} />
              </div>
              <input value={pts[c.id]?.comentario ?? ""} onChange={(e) => setPt(c.id, { comentario: e.target.value })} placeholder="Comentario (opcional)" className={`mt-2 ${inputCls} text-xs`} />
            </div>
          ))}
        </div>
        <div><label className={labelCls}>Observaciones generales</label><textarea rows={2} value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)} className={inputCls} /></div>
        <div className="flex justify-end gap-2 border-t pt-2"><button type="button" onClick={onClose} className={btnGhost}>Cancelar</button><button disabled={saving} className={btnPrimary}>{saving ? "Guardando…" : evalId != null ? "Guardar" : "Crear evaluación"}</button></div>
      </form>
    </Modal>
  )
}

// ======================================================================
//  RACI
// ======================================================================
const RACI_OPTS = ["", "R", "A", "C", "I"]
const RACI_GRUPOS = ["Solicitud", "Aprobación", "Ejecución", "Cierre", "mantenimiento"]
function RaciTab() {
  const [items, setItems] = useState<any[]>([])
  const [edit, setEdit] = useState<any | undefined>(undefined)
  const [nuevo, setNuevo] = useState(false)
  const cargar = useCallback(async () => { setItems(await api("/raci")) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar().catch((e) => toast.error(e.message)) }, [cargar])
  const borrar = async (id: number) => { if (!confirm("¿Borrar fila?")) return; try { await api(`/raci/${id}`, { method: "DELETE" }); await cargar() } catch (e: any) { toast.error(e.message) } }

  const grupos = useMemo(() => {
    const g: Record<string, any[]> = {}
    items.forEach((i) => { (g[i.grupo] ||= []).push(i) })
    return Object.entries(g)
  }, [items])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-white p-4 shadow">
        <div><h3 className="font-semibold">Matriz RACI de mantenimiento</h3><p className="text-sm text-gray-500">DPO R2.4.3 · R = Responsable · A = Aprobador · C = Consultado · I = Informado</p></div>
        <button className={btnPrimary} onClick={() => setNuevo(true)}>+ Nueva actividad</button>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Actividad</th><th className="px-3 py-2 text-center">Contratista</th><th className="px-3 py-2 text-center">Coord. HSMA</th><th className="px-3 py-2 text-center">Analista HSMA</th><th className="px-3 py-2 text-center">Analista Mant.</th><th className="px-3 py-2 text-center">Jefe CD</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {grupos.map(([grupo, lst]) => (
              <FragmentGrupo key={grupo} grupo={grupo} lst={lst} onEdit={setEdit} onDelete={borrar} />
            ))}
            {!items.length && <tr><td colSpan={7} className="py-6 text-center text-gray-500">Sin filas RACI.</td></tr>}
          </tbody>
        </table>
      </div>
      {(nuevo || edit) && <RaciModal item={edit} onClose={() => { setNuevo(false); setEdit(undefined) }} onSaved={async () => { setNuevo(false); setEdit(undefined); await cargar() }} />}
    </div>
  )
}

function FragmentGrupo({ grupo, lst, onEdit, onDelete }: any) {
  return (
    <>
      <tr className="bg-gray-100"><td colSpan={7} className="px-3 py-1 text-xs font-semibold uppercase">{grupo}</td></tr>
      {lst.map((r: any) => (
        <tr key={r.id} className="border-b">
          <td className="px-3 py-2">{r.actividad}</td>
          <td className="px-3 py-2 text-center font-mono">{r.contratista || ""}</td>
          <td className="px-3 py-2 text-center font-mono">{r.coord_hsma || ""}</td>
          <td className="px-3 py-2 text-center font-mono">{r.analista_hsma || ""}</td>
          <td className="px-3 py-2 text-center font-mono">{r.analista_mantenimiento || ""}</td>
          <td className="px-3 py-2 text-center font-mono">{r.jefe_cd || ""}</td>
          <td className="whitespace-nowrap px-3 py-2 text-right"><button className="text-xs text-blue-600 hover:underline" onClick={() => onEdit(r)}>Editar</button><button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => onDelete(r.id)}>Borrar</button></td>
        </tr>
      ))}
    </>
  )
}

function RaciModal({ item, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(() => ({
    actividad: item?.actividad ?? "", grupo: item?.grupo ?? "mantenimiento",
    contratista: item?.contratista ?? "", coord_hsma: item?.coord_hsma ?? "", analista_hsma: item?.analista_hsma ?? "",
    analista_mantenimiento: item?.analista_mantenimiento ?? "", jefe_cd: item?.jefe_cd ?? "",
  }))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))
  const roleFields: [string, string][] = [["contratista", "Contratista"], ["coord_hsma", "Coord. HSMA"], ["analista_hsma", "Analista HSMA"], ["analista_mantenimiento", "Analista Mant."], ["jefe_cd", "Jefe CD"]]
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.actividad) { toast.error("La actividad es obligatoria"); return }
    setSaving(true)
    const body: any = { ...f, orden: item?.orden ?? 0 }
    Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null })
    body.grupo = f.grupo
    try { if (item) await j(`/raci/${item.id}`, "PUT", body); else await j("/raci", "POST", body); onSaved() } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title={item ? "Editar fila RACI" : "Nueva actividad RACI"} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div><label className={labelCls}>Actividad *</label><input required value={f.actividad} onChange={(e) => set("actividad", e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>Grupo</label><select value={f.grupo} onChange={(e) => set("grupo", e.target.value)} className={inputCls}>{RACI_GRUPOS.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
        {roleFields.map(([k, label]) => (
          <div key={k}><label className={labelCls}>{label}</label><select value={f[k]} onChange={(e) => set(k, e.target.value)} className={inputCls}>{RACI_OPTS.map((v) => <option key={v} value={v}>{v || "—"}</option>)}</select></div>
        ))}
        <div className="flex justify-end gap-2 border-t pt-2"><button type="button" onClick={onClose} className={btnGhost}>Cancelar</button><button disabled={saving} className={btnPrimary}>{saving ? "Guardando…" : item ? "Guardar" : "Crear"}</button></div>
      </form>
    </Modal>
  )
}
