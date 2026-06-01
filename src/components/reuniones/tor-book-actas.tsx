"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { puedeEditarReuniones } from "@/actions/reuniones"

type Seccion = "participante" | "regla" | "entrada" | "salida" | "kpi" | "temario"

type TorItem = {
  id?: string
  seccion: Seccion
  orden: number
  texto: string
  responsable?: string | null
}

type TorCabecera = {
  objetivos: string
  dueno: string
  ubicacion: string
  dia_horario: string
  frecuencia: string
}

const SECCIONES: { key: Seccion; titulo: string; conResponsable?: boolean }[] = [
  { key: "participante", titulo: "Participantes" },
  { key: "regla", titulo: "Reglas" },
  { key: "entrada", titulo: "Entradas" },
  { key: "salida", titulo: "Salidas" },
  { key: "kpi", titulo: "KPIs" },
  { key: "temario", titulo: "Temario del día", conResponsable: true },
]

const CABECERA_VACIA: TorCabecera = {
  objetivos: "",
  dueno: "",
  ubicacion: "",
  dia_horario: "",
  frecuencia: "",
}

export function TorBookActas({
  tipo = "logistica-ventas",
  titulo = "TOR · Book de Actas (Reunión Ventas-Logística-Compras)",
}: {
  tipo?: string
  titulo?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cab, setCab] = useState<TorCabecera>(CABECERA_VACIA)
  const [items, setItems] = useState<TorItem[]>([])

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch(
        `/api/planeamiento/periodos-criticos/tor?tipo=${encodeURIComponent(tipo)}`,
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setCab({
        objetivos: j.tor?.objetivos ?? "",
        dueno: j.tor?.dueno ?? "",
        ubicacion: j.tor?.ubicacion ?? "",
        dia_horario: j.tor?.dia_horario ?? "",
        frecuencia: j.tor?.frecuencia ?? "",
      })
      setItems(
        (j.items ?? []).map((it: TorItem) => ({
          id: it.id,
          seccion: it.seccion,
          orden: it.orden,
          texto: it.texto,
          responsable: it.responsable ?? null,
        })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando el TOR")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    void puedeEditarReuniones().then(setPuedeEditar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  function itemsDe(seccion: Seccion) {
    return items
      .filter((it) => it.seccion === seccion)
      .sort((a, b) => a.orden - b.orden)
  }

  function setTexto(seccion: Seccion, idx: number, texto: string) {
    const dela = itemsDe(seccion)
    const target = dela[idx]
    setItems((prev) =>
      prev.map((it) => (it === target ? { ...it, texto } : it)),
    )
  }

  function setResponsable(seccion: Seccion, idx: number, responsable: string) {
    const dela = itemsDe(seccion)
    const target = dela[idx]
    setItems((prev) =>
      prev.map((it) => (it === target ? { ...it, responsable } : it)),
    )
  }

  function agregar(seccion: Seccion) {
    const dela = itemsDe(seccion)
    setItems((prev) => [
      ...prev,
      { seccion, orden: dela.length + 1, texto: "", responsable: null },
    ])
  }

  function quitar(seccion: Seccion, idx: number) {
    const dela = itemsDe(seccion)
    const target = dela[idx]
    setItems((prev) => prev.filter((it) => it !== target))
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const limpios = items
        .filter((it) => it.texto.trim() !== "")
        .map((it) => ({
          seccion: it.seccion,
          orden: it.orden,
          texto: it.texto.trim(),
          responsable: it.responsable?.trim() || null,
        }))
      const res = await fetch("/api/planeamiento/periodos-criticos/tor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, ...cab, items: limpios }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setEditando(false)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  function cancelar() {
    setEditando(false)
    setError(null)
    void cargar()
  }

  return (
    <Card className="mb-4 border-slate-300">
      <CardHeader className="cursor-pointer py-3" onClick={() => setAbierto((v) => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {abierto ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            {titulo}
          </CardTitle>
          {abierto && puedeEditar && !editando && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1"
              onClick={(e) => {
                e.stopPropagation()
                setEditando(true)
              }}
            >
              <Pencil className="size-3.5" /> Editar
            </Button>
          )}
          {abierto && editando && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1"
                disabled={guardando}
                onClick={guardar}
              >
                <Save className="size-3.5" /> {guardando ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1"
                disabled={guardando}
                onClick={cancelar}
              >
                <X className="size-3.5" /> Cancelar
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {abierto && (
        <CardContent className="space-y-4 text-sm">
          {error && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
          )}
          {cargando ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : (
            <>
              {/* Objetivos */}
              <Campo
                label="1. Objetivos"
                editando={editando}
                valor={cab.objetivos}
                multilinea
                onChange={(v) => setCab((c) => ({ ...c, objetivos: v }))}
              />

              {/* Dueño / Ubicación / Día-horario / Frecuencia */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  label="2. Dueño"
                  editando={editando}
                  valor={cab.dueno}
                  onChange={(v) => setCab((c) => ({ ...c, dueno: v }))}
                />
                <Campo
                  label="3. Ubicación"
                  editando={editando}
                  valor={cab.ubicacion}
                  onChange={(v) => setCab((c) => ({ ...c, ubicacion: v }))}
                />
                <Campo
                  label="4. Día, horario y duración"
                  editando={editando}
                  valor={cab.dia_horario}
                  onChange={(v) => setCab((c) => ({ ...c, dia_horario: v }))}
                />
                <Campo
                  label="5. Frecuencia"
                  editando={editando}
                  valor={cab.frecuencia}
                  onChange={(v) => setCab((c) => ({ ...c, frecuencia: v }))}
                />
              </div>

              {/* Listas */}
              {SECCIONES.map((s) => (
                <ListaSeccion
                  key={s.key}
                  titulo={s.titulo}
                  conResponsable={!!s.conResponsable}
                  items={itemsDe(s.key)}
                  editando={editando}
                  onTexto={(idx, v) => setTexto(s.key, idx, v)}
                  onResponsable={(idx, v) => setResponsable(s.key, idx, v)}
                  onQuitar={(idx) => quitar(s.key, idx)}
                  onAgregar={() => agregar(s.key)}
                />
              ))}
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function Campo({
  label,
  valor,
  editando,
  multilinea,
  onChange,
}: {
  label: string
  valor: string
  editando: boolean
  multilinea?: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      {editando ? (
        multilinea ? (
          <Textarea
            value={valor}
            rows={2}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input value={valor} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <p className="whitespace-pre-wrap text-slate-800">{valor || "—"}</p>
      )}
    </div>
  )
}

function ListaSeccion({
  titulo,
  conResponsable,
  items,
  editando,
  onTexto,
  onResponsable,
  onQuitar,
  onAgregar,
}: {
  titulo: string
  conResponsable: boolean
  items: TorItem[]
  editando: boolean
  onTexto: (idx: number, v: string) => void
  onResponsable: (idx: number, v: string) => void
  onQuitar: (idx: number) => void
  onAgregar: () => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600">{titulo}</Label>
      {items.length === 0 && !editando && (
        <p className="text-xs text-muted-foreground">—</p>
      )}
      <ol className="space-y-1.5">
        {items.map((it, idx) => (
          <li key={it.id ?? `nuevo-${idx}`} className="flex items-start gap-2">
            <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-slate-400">
              {idx + 1}.
            </span>
            {editando ? (
              <>
                <Input
                  className="h-8"
                  value={it.texto}
                  onChange={(e) => onTexto(idx, e.target.value)}
                />
                {conResponsable && (
                  <Input
                    className="h-8 w-40 shrink-0"
                    placeholder="Responsable"
                    value={it.responsable ?? ""}
                    onChange={(e) => onResponsable(idx, e.target.value)}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-red-600"
                  onClick={() => onQuitar(idx)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            ) : (
              <span className="text-slate-800">
                {it.texto}
                {conResponsable && it.responsable && (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    · {it.responsable}
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {editando && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1"
          onClick={onAgregar}
        >
          <Plus className="size-3.5" /> Agregar
        </Button>
      )}
    </div>
  )
}
