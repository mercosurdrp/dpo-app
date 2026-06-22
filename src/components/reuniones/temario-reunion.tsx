"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ListChecks, ExternalLink, Link2, Plus, Trash2, Check, X } from "lucide-react"

const API = "/api/planeamiento/periodos-criticos/temario"

type Item = { id: string; bloque: string; titulo: string; url: string | null; orden: number }

export function TemarioReunion({
  embebido = false,
  editando = false,
}: {
  embebido?: boolean
  editando?: boolean
}) {
  const [items, setItems] = useState<Item[]>([])
  const [cargado, setCargado] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState("")
  const [nuevoEn, setNuevoEn] = useState<string | null>(null) // bloque donde se agrega
  const [nuevoTitulo, setNuevoTitulo] = useState("")

  async function cargar() {
    try {
      const r = await fetch(API)
      const j = await r.json()
      if (j.items) setItems(j.items)
    } catch { /* noop */ } finally { setCargado(true) }
  }
  useEffect(() => { cargar() }, [])

  // Agrupar por bloque preservando el orden de aparición
  const bloques: { nombre: string; items: Item[] }[] = []
  for (const it of items) {
    let b = bloques.find((x) => x.nombre === it.bloque)
    if (!b) { b = { nombre: it.bloque, items: [] }; bloques.push(b) }
    b.items.push(it)
  }

  async function guardarUrl(id: string) {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: editUrl }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setItems((p) => p.map((x) => (x.id === id ? j.item : x)))
      setEditId(null); setEditUrl("")
      toast.success("Link guardado")
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar") }
  }

  async function borrar(id: string) {
    setItems((p) => p.filter((x) => x.id !== id))
    try { await fetch(`${API}/${id}`, { method: "DELETE" }) } catch { cargar() }
  }

  async function agregar(bloque: string) {
    const titulo = nuevoTitulo.trim()
    if (!titulo) return
    try {
      const res = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bloque, titulo, orden: 900 }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setItems((p) => [...p, j.item])
      setNuevoEn(null); setNuevoTitulo("")
      toast.success("Tema agregado")
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo agregar") }
  }

  if (!cargado || items.length === 0) return null

  // Embebido en la TOR: los controles (editar link, agregar tema) se habilitan
  // solo cuando la TOR está en modo edición; eliminar queda deshabilitado.
  // Standalone (sin embeber): controles siempre visibles, como antes.
  const controles = embebido ? editando : true
  const permitirEliminar = !embebido

  const cuerpo = (
    <div className="space-y-4">
        {bloques.map((b) => (
          <div key={b.nombre}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">{b.nombre}</p>
            <ul className="space-y-1">
              {b.items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-slate-50 py-1">
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-800">{it.titulo}</span>
                  {it.url && (
                    <a href={it.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline">
                      <ExternalLink className="w-3 h-3" /> abrir
                    </a>
                  )}
                  {controles && (
                    <span className="ml-auto flex items-center gap-1">
                      {editId === it.id ? (
                        <span className="flex items-center gap-1">
                          <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://…" className="h-7 w-56 text-xs" autoFocus />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-700" onClick={() => guardarUrl(it.id)}><Check className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" onClick={() => { setEditId(null); setEditUrl("") }}><X className="w-4 h-4" /></Button>
                        </span>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs text-slate-500" title={it.url ? "Editar link" : "Agregar link"} onClick={() => { setEditId(it.id); setEditUrl(it.url ?? "") }}>
                            <Link2 className="w-3.5 h-3.5" />
                          </Button>
                          {permitirEliminar && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" title="Quitar tema" onClick={() => borrar(it.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          )}
                        </>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {controles &&
              (nuevoEn === b.nombre ? (
                <div className="flex items-center gap-1 mt-1.5">
                  <Input value={nuevoTitulo} onChange={(e) => setNuevoTitulo(e.target.value)} placeholder="Nuevo tema…" className="h-7 text-xs" autoFocus />
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-700" onClick={() => agregar(b.nombre)}>Agregar</Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" onClick={() => { setNuevoEn(null); setNuevoTitulo("") }}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="h-6 px-1 mt-1 text-xs text-slate-400 hover:text-slate-700" onClick={() => { setNuevoEn(b.nombre); setNuevoTitulo("") }}>
                  <Plus className="w-3 h-3 mr-1" /> tema
                </Button>
              ))}
          </div>
        ))}
    </div>
  )

  // Embebido dentro de la caja "Temario del día" de la TOR: solo el cuerpo
  // (los bloques con links), sin caja ni título propios — el encabezado lo
  // pone la sección que lo contiene.
  if (embebido) return cuerpo

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-violet-600" /> Temario de la reunión</CardTitle>
        <p className="text-xs text-slate-500">Temas a tocar, con acceso directo a la herramienta de cada uno. Editá el link con el ícono 🔗 (admin/supervisor).</p>
      </CardHeader>
      <CardContent>{cuerpo}</CardContent>
    </Card>
  )
}
