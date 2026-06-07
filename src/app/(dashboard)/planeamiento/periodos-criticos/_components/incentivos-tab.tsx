"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Gift, FileText, Megaphone, Plus, Pencil, Trash2, CheckCircle2, Upload, Trophy, Camera } from "lucide-react"

const API = "/api/planeamiento/periodos-criticos/incentivos"
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const AMBITOS = ["Choferes", "Ayudantes", "Warehouse"] as const

type Programa = {
  nombre: string; periodo: string; descripcion: string
  archivo_url: string | null; archivo_nombre: string | null
  comunicado: boolean; comunicado_fecha: string | null
  comunicado_url: string | null; comunicado_nombre: string | null; comunicado_nota: string | null
  comunicado_link: string | null
}
type Registro = {
  id: string; anio: number; mes: number; ambito: string
  equipo: string | null; cumplio: boolean | null; posicion: string | null; premio: string | null; nota: string | null
  foto_url?: string | null; foto_nombre?: string | null
}

// Orden del podio para la galería de premiación
const ordenPos = (p: string | null) => {
  const s = (p || "").toLowerCase()
  if (s.includes("1")) return 1
  if (s.includes("2")) return 2
  if (s.includes("3")) return 3
  return 9
}
const MEDALLA: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export function IncentivosTab({ anioActivo }: { anioActivo: number }) {
  const [prog, setProg] = useState<Programa | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [anio, setAnio] = useState(anioActivo)
  const [editor, setEditor] = useState<Registro | "nuevo" | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        fetch(`${API}/programa`).then((x) => x.json()),
        fetch(`${API}/registro?anio=${anio}`).then((x) => x.json()),
      ])
      if (p.programa) setProg(p.programa)
      if (r.registros) setRegistros(r.registros)
    } catch { /* noop */ }
  }, [anio])
  useEffect(() => { cargar() }, [cargar])

  async function borrarReg(id: string) {
    setRegistros((p) => p.filter((x) => x.id !== id))
    try { await fetch(`${API}/registro/${id}`, { method: "DELETE" }) } catch { cargar() }
  }

  async function subirFoto(id: string, file: File) {
    const fd = new FormData()
    fd.set("foto", file)
    try {
      const res = await fetch(`${API}/registro/${id}/foto`, { method: "POST", body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success("Foto subida")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto")
    }
  }

  if (!prog) return <Card><CardContent className="p-6 text-sm text-slate-500">Cargando…</CardContent></Card>

  // Ganadores (registros con posición) agrupados por ámbito para la galería
  const ganadores = registros.filter((r) => r.posicion)
  const ambitosConGanadores = AMBITOS.filter((a) => ganadores.some((g) => g.ambito === a))

  return (
    <div className="space-y-4">
      <ProgramaCard prog={prog} onSaved={(p) => setProg(p)} />

      {/* 🏆 Premiación — galería de ganadores con foto (estilo PPT) */}
      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Premiación {anio}</CardTitle>
          <p className="text-xs text-slate-500">Los ganadores por ámbito (los que tengan posición cargada en «Participación»). Subí la foto de cada uno.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {ambitosConGanadores.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay ganadores cargados. En «Participación y ganadores» agregá registros con posición (1°/2°/3°) y acá aparecen para ponerles la foto.</p>
          ) : ambitosConGanadores.map((amb) => (
            <div key={amb}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">{amb}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ganadores.filter((g) => g.ambito === amb).sort((a, b) => ordenPos(a.posicion) - ordenPos(b.posicion)).map((g) => (
                  <GanadorCard key={g.id} g={g} onFoto={(file) => subirFoto(g.id, file)} />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Seguimiento mensual de participación */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2"><Gift className="w-4 h-4 text-violet-600" /> Participación y ganadores</span>
            <span className="flex items-center gap-2">
              <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 px-2 text-sm font-semibold">
                {[anioActivo, anioActivo - 1].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <Button size="sm" variant="outline" onClick={() => setEditor("nuevo")}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </span>
          </CardTitle>
          <p className="text-xs text-slate-500">Registrá por mes qué equipos cumplieron los KPIs habilitantes y los ganadores. Es la evidencia de participación que pide R3.4.4.</p>
        </CardHeader>
        <CardContent>
          {registros.length === 0 ? (
            <p className="text-sm text-slate-500">Sin registros para {anio}. Agregá la participación de cada mes (Dic/Ene/Feb).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-1 px-2">Mes</th><th className="px-2">Ámbito</th><th className="px-2">Equipo/Persona</th>
                    <th className="px-2 text-center">KPIs</th><th className="px-2">Posición</th><th className="px-2">Premio</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 font-medium">{MESES[r.mes]}</td>
                      <td className="px-2"><Badge variant="secondary" className="font-normal">{r.ambito}</Badge></td>
                      <td className="px-2">{r.equipo || "—"}</td>
                      <td className="px-2 text-center">{r.cumplio === true ? "✅" : r.cumplio === false ? "❌" : "—"}</td>
                      <td className="px-2">{r.posicion || "—"}</td>
                      <td className="px-2 text-slate-600">{r.premio || "—"}</td>
                      <td className="px-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditor(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600 hover:bg-red-50" onClick={() => borrarReg(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editor && (
        <RegistroEditor
          registro={editor === "nuevo" ? null : editor}
          anio={anio}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); cargar() }}
        />
      )}
    </div>
  )
}

function GanadorCard({ g, onFoto }: { g: Registro; onFoto: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const pos = ordenPos(g.posicion)
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="relative block w-full aspect-[4/3] bg-slate-100 group"
        title="Subir / cambiar foto"
      >
        {g.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.foto_url} alt={g.equipo || "ganador"} className="w-full h-full object-contain" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Camera className="w-7 h-7 mb-1" /><span className="text-[11px]">Subir foto</span>
          </span>
        )}
        <span className="absolute top-1.5 left-1.5 text-2xl drop-shadow">{MEDALLA[pos] ?? "🏅"}</span>
        <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 text-white text-xs">
          <Camera className="w-4 h-4 mr-1" /> cambiar
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFoto(f) }}
      />
      <div className="p-2 space-y-0.5">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-sm text-slate-900 truncate">{g.equipo || "—"}</span>
          {g.posicion && <Badge className="bg-amber-500 text-white text-[10px]">{g.posicion}</Badge>}
        </div>
        {g.premio && <p className="text-[11px] text-slate-600 leading-tight">{g.premio}</p>}
        <p className="text-[10px] text-slate-400">{MESES[g.mes]}</p>
      </div>
    </div>
  )
}

function ProgramaCard({ prog, onSaved }: { prog: Programa; onSaved: (p: Programa) => void }) {
  const [descripcion, setDescripcion] = useState(prog.descripcion)
  const [periodo, setPeriodo] = useState(prog.periodo)
  const [comunicado, setComunicado] = useState(prog.comunicado)
  const [comFecha, setComFecha] = useState(prog.comunicado_fecha ?? "")
  const [comNota, setComNota] = useState(prog.comunicado_nota ?? "")
  const [comLink, setComLink] = useState(prog.comunicado_link ?? "")
  const [guardando, setGuardando] = useState(false)
  const pptRef = useRef<HTMLInputElement>(null)
  const comRef = useRef<HTMLInputElement>(null)

  async function guardar() {
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.set("descripcion", descripcion)
      fd.set("periodo", periodo)
      fd.set("comunicado", String(comunicado))
      fd.set("comunicado_fecha", comFecha)
      fd.set("comunicado_nota", comNota)
      fd.set("comunicado_link", comLink)
      if (pptRef.current?.files?.[0]) fd.set("archivo_programa", pptRef.current.files[0])
      if (comRef.current?.files?.[0]) fd.set("archivo_comunicado", comRef.current.files[0])
      const res = await fetch(`${API}/programa`, { method: "PUT", body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      onSaved(j.programa)
      toast.success("Programa guardado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="border-l-4 border-l-violet-600">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Gift className="w-4 h-4 text-violet-600" /> {prog.nombre}</CardTitle>
        <p className="text-xs text-slate-500">R3.4.4 — programa de incentivos de temporada alta, su comunicación al equipo y la participación.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-[160px_1fr] gap-3 items-start">
          <div>
            <Label className="text-xs">Período</Label>
            <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Descripción del programa</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={8} className="font-sans text-xs" />
          </div>
        </div>

        {/* PPT del programa */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">Presentación del programa:</span>
          {prog.archivo_url
            ? <a href={prog.archivo_url} target="_blank" rel="noopener" className="text-xs text-violet-700 underline">{prog.archivo_nombre || "ver PPT"}</a>
            : <span className="text-xs text-slate-400">sin archivo</span>}
          <label className="text-xs flex items-center gap-1 cursor-pointer text-slate-600">
            <Upload className="w-3.5 h-3.5" /> <input ref={pptRef} type="file" accept=".ppt,.pptx,.pdf" className="text-xs" />
          </label>
        </div>

        {/* Comunicación al equipo */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-slate-700">Comunicación al equipo</span>
            {comunicado && <Badge className="bg-emerald-600 text-white text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> comunicado</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs flex items-center gap-1.5">
              <input type="checkbox" checked={comunicado} onChange={(e) => setComunicado(e.target.checked)} /> Comunicado al equipo
            </label>
            <label className="text-xs flex items-center gap-1.5">Fecha
              <Input type="date" value={comFecha} onChange={(e) => setComFecha(e.target.value)} className="h-8 w-auto" />
            </label>
            <label className="text-xs flex items-center gap-1 cursor-pointer text-slate-600">
              Archivo <Upload className="w-3.5 h-3.5" /> <input ref={comRef} type="file" className="text-xs" />
            </label>
            {prog.comunicado_url && <a href={prog.comunicado_url} target="_blank" rel="noopener" className="text-xs text-violet-700 underline">{prog.comunicado_nombre || "ver archivo"}</a>}
          </div>
          <p className="text-[10px] text-slate-400 -mt-1">Se acepta cualquier formato: foto, PDF, Word/Excel, PPT, etc.</p>
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Link</Label>
            <Input value={comLink} onChange={(e) => setComLink(e.target.value)} placeholder="https://… (mail, video de YouTube/Drive, etc.)" className="h-8 text-xs" />
            {prog.comunicado_link && <a href={prog.comunicado_link} target="_blank" rel="noopener" className="text-xs text-violet-700 underline shrink-0">abrir</a>}
          </div>
          <Textarea value={comNota} onChange={(e) => setComNota(e.target.value)} rows={2} placeholder="Nota: cómo/cuándo se comunicó (reunión, grupo, cartelera…)" className="text-xs" />
        </div>

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar programa"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RegistroEditor({ registro, anio, onClose, onSaved }: {
  registro: Registro | null; anio: number; onClose: () => void; onSaved: () => void
}) {
  const [mes, setMes] = useState(registro?.mes ?? 12)
  const [ambito, setAmbito] = useState(registro?.ambito ?? "Choferes")
  const [equipo, setEquipo] = useState(registro?.equipo ?? "")
  const [cumplio, setCumplio] = useState<boolean | null>(registro?.cumplio ?? null)
  const [posicion, setPosicion] = useState(registro?.posicion ?? "")
  const [premio, setPremio] = useState(registro?.premio ?? "")
  const [nota, setNota] = useState(registro?.nota ?? "")
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      const payload = { anio, mes, ambito, equipo, cumplio, posicion, premio, nota }
      const res = await fetch(registro ? `${API}/registro/${registro.id}` : `${API}/registro`, {
        method: registro ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(registro ? "Registro actualizado" : "Registro agregado")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{registro ? "Editar" : "Agregar"} participación</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Mes</Label>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm">
                {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => <option key={m} value={m}>{MESES[m]}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Ámbito</Label>
              <select value={ambito} onChange={(e) => setAmbito(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm">
                {AMBITOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div><Label className="text-xs">Equipo / Persona</Label><Input value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="Ej.: Equipo AB386KU / Juan Pérez" /></div>
          <div>
            <Label className="text-xs">¿Cumplió los KPIs habilitantes?</Label>
            <div className="flex gap-2 mt-1">
              {([["Sí", true], ["No", false], ["—", null]] as const).map(([lbl, val]) => (
                <Button key={lbl} type="button" size="sm" variant={cumplio === val ? "default" : "outline"} onClick={() => setCumplio(val)}>{lbl}</Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Posición</Label><Input value={posicion} onChange={(e) => setPosicion(e.target.value)} placeholder="1° / 2° / 3°" /></div>
            <div><Label className="text-xs">Premio</Label><Input value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ej.: caja Patagonia + merch" /></div>
          </div>
          <div><Label className="text-xs">Nota</Label><Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
