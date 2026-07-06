"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { Loader2, Pencil, Plus, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getTorReunion, guardarTorReunion } from "@/actions/reuniones-tor"
import type {
  TipoReunion,
  TorContenido,
  TorFrecuencia,
} from "@/types/database"

interface Props {
  tipo: TipoReunion
  tipoLabel: string
  puedeEditar: boolean
}

const FRECUENCIAS: { value: TorFrecuencia; label: string }[] = [
  { value: "diaria", label: "Diaria" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
]

function contenidoVacio(nombre: string): TorContenido {
  return {
    nombre,
    objetivos: "",
    dueno: [],
    participantes: [],
    ubicacion: [],
    duracion: "",
    frecuencia_texto: "",
    reglas: [],
    entradas: [],
    salidas: [],
    kpis: [],
    temario: [],
  }
}

function clonar(c: TorContenido): TorContenido {
  return JSON.parse(JSON.stringify(c)) as TorContenido
}

// ---------- bloques de presentación ----------

function SeccionBox({
  titulo,
  className,
  children,
}: {
  titulo: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <div className="border-b bg-slate-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {titulo}
      </div>
      <div className="bg-white p-3">{children}</div>
    </div>
  )
}

function ListaNumerada({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>
  }
  return (
    <ol className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-800">
          <span className="w-5 shrink-0 text-right font-semibold text-slate-400">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

function ListaEditable({
  items,
  onChange,
  placeholder,
}: {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 shrink-0 text-right text-sm font-semibold text-slate-400">
            {i + 1}
          </span>
          <Input
            className="h-8 text-sm"
            value={item}
            placeholder={placeholder}
            onChange={(e) => {
              const next = items.slice()
              next[i] = e.target.value
              onChange(next)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-slate-400 hover:text-red-600"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onChange([...items, ""])}
      >
        <Plus className="mr-1 size-3" />
        Agregar
      </Button>
    </div>
  )
}

// ---------- componente principal ----------

export function TorReunion({ tipo, tipoLabel, puedeEditar }: Props) {
  const [frecuencia, setFrecuencia] = useState<TorFrecuencia>(
    tipo === "logistica-ventas" ? "semanal" : "diaria",
  )
  const [contenido, setContenido] = useState<TorContenido | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState<TorContenido | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setEditando(false)
    setDraft(null)
    setSaveError(null)
    const res = await getTorReunion(tipo, frecuencia)
    if ("data" in res) {
      setContenido(res.data?.contenido ?? null)
      setUpdatedAt(res.data?.updated_at ?? null)
    } else {
      setContenido(null)
      setUpdatedAt(null)
      setLoadError(res.error)
    }
    setLoading(false)
  }, [tipo, frecuencia])

  useEffect(() => {
    void cargar()
  }, [cargar])

  function empezarEdicion() {
    setDraft(clonar(contenido ?? contenidoVacio(tipoLabel)))
    setSaveError(null)
    setEditando(true)
  }

  async function guardar() {
    if (!draft) return
    setGuardando(true)
    setSaveError(null)
    const res = await guardarTorReunion(tipo, frecuencia, draft)
    if ("data" in res) {
      setContenido(res.data.contenido)
      setUpdatedAt(res.data.updated_at)
      setEditando(false)
      setDraft(null)
    } else {
      setSaveError(res.error)
    }
    setGuardando(false)
  }

  const c = editando ? draft : contenido

  function upd(patch: Partial<TorContenido>) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
  }

  return (
    <div className="space-y-4">
      {/* Encabezado estilo Book de Actas con logo Mercosur */}
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between gap-4 bg-slate-900 px-4 py-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-white">
              TOR — Book de Actas
            </p>
            <p className="text-xs text-slate-300">
              Términos de Referencia · {tipoLabel}
            </p>
          </div>
          <Image
            src="/logo-mercosur-blanco.png"
            alt="Mercosur"
            width={140}
            height={24}
            className="h-5 w-auto"
          />
        </div>

        {/* Selector de frecuencia + acciones */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 bg-white px-4 py-2.5">
          <div className="flex rounded-md border p-0.5">
            {FRECUENCIAS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  frecuencia === f.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
                onClick={() => setFrecuencia(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {updatedAt && !editando && (
              <span className="text-[11px] text-muted-foreground">
                Actualizada:{" "}
                {new Date(updatedAt).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  timeZone: "America/Argentina/Buenos_Aires",
                })}
              </span>
            )}
            {puedeEditar && !editando && !loading && (
              <Button type="button" variant="outline" size="sm" onClick={empezarEdicion}>
                <Pencil className="mr-2 size-3.5" />
                {contenido ? "Editar" : "Crear TOR"}
              </Button>
            )}
            {editando && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={guardando}
                  onClick={() => {
                    setEditando(false)
                    setDraft(null)
                    setSaveError(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" size="sm" onClick={guardar} disabled={guardando}>
                  {guardando ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-3.5" />
                  )}
                  Guardar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </p>
      )}
      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center rounded-lg border bg-white py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Cargando TOR…
        </div>
      )}

      {!loading && !c && !loadError && (
        <div className="rounded-lg border bg-white py-12 text-center text-sm text-muted-foreground">
          Sin TOR cargada para la frecuencia{" "}
          <span className="font-medium">
            {FRECUENCIAS.find((f) => f.value === frecuencia)?.label}
          </span>
          .
          {puedeEditar && (
            <>
              {" "}
              <button
                className="font-medium text-blue-600 hover:underline"
                onClick={empezarEdicion}
              >
                Crear TOR
              </button>
            </>
          )}
        </div>
      )}

      {!loading && c && (
        <div className="space-y-3">
          {/* Nombre de la reunión */}
          <SeccionBox titulo="Nombre de la reunión">
            {editando ? (
              <Input
                className="h-9 text-base font-semibold"
                value={c.nombre}
                onChange={(e) => upd({ nombre: e.target.value })}
              />
            ) : (
              <p className="text-lg font-bold text-slate-900">{c.nombre}</p>
            )}
          </SeccionBox>

          {/* 1. Objetivos */}
          <SeccionBox titulo="1. Objetivos">
            {editando ? (
              <Textarea
                className="min-h-[70px] text-sm"
                value={c.objetivos}
                onChange={(e) => upd({ objetivos: e.target.value })}
              />
            ) : (
              <p className="text-sm text-slate-800">{c.objetivos || "—"}</p>
            )}
          </SeccionBox>

          {/* 2-4: Dueño / Participantes / Ubicación */}
          <div className="grid gap-3 md:grid-cols-3">
            <SeccionBox titulo="2. Dueño">
              {editando ? (
                <ListaEditable
                  items={c.dueno}
                  onChange={(v) => upd({ dueno: v })}
                  placeholder="Dueño"
                />
              ) : (
                <ListaNumerada items={c.dueno} />
              )}
            </SeccionBox>
            <SeccionBox titulo="3. Participantes">
              {editando ? (
                <ListaEditable
                  items={c.participantes}
                  onChange={(v) => upd({ participantes: v })}
                  placeholder="Participante"
                />
              ) : (
                <ListaNumerada items={c.participantes} />
              )}
            </SeccionBox>
            <SeccionBox titulo="4. Ubicación">
              {editando ? (
                <ListaEditable
                  items={c.ubicacion}
                  onChange={(v) => upd({ ubicacion: v })}
                  placeholder="Ubicación"
                />
              ) : (
                <ListaNumerada items={c.ubicacion} />
              )}
            </SeccionBox>
          </div>

          {/* 5-6: Duración / Frecuencia */}
          <div className="grid gap-3 md:grid-cols-2">
            <SeccionBox titulo="5. Duración y horario">
              {editando ? (
                <Input
                  className="h-8 text-sm"
                  value={c.duracion}
                  onChange={(e) => upd({ duracion: e.target.value })}
                  placeholder="Ej.: Viernes, 8:30 hs — 30 min"
                />
              ) : (
                <p className="text-sm font-medium text-slate-800">
                  {c.duracion || "—"}
                </p>
              )}
            </SeccionBox>
            <SeccionBox titulo="6. Frecuencia">
              {editando ? (
                <Input
                  className="h-8 text-sm"
                  value={c.frecuencia_texto}
                  onChange={(e) => upd({ frecuencia_texto: e.target.value })}
                  placeholder="Ej.: Semanal / 1er martes de cada mes"
                />
              ) : (
                <p className="text-sm font-medium text-slate-800">
                  {c.frecuencia_texto || "—"}
                </p>
              )}
            </SeccionBox>
          </div>

          {/* 7. Reglas */}
          <SeccionBox titulo="7. Reglas">
            {editando ? (
              <ListaEditable
                items={c.reglas}
                onChange={(v) => upd({ reglas: v })}
                placeholder="Regla"
              />
            ) : (
              <ListaNumerada items={c.reglas} />
            )}
          </SeccionBox>

          {/* 8-10: Entradas / Salidas / KPIs */}
          <div className="grid gap-3 md:grid-cols-3">
            <SeccionBox titulo="8. Entradas">
              {editando ? (
                <ListaEditable
                  items={c.entradas}
                  onChange={(v) => upd({ entradas: v })}
                  placeholder="Entrada"
                />
              ) : (
                <ListaNumerada items={c.entradas} />
              )}
            </SeccionBox>
            <SeccionBox titulo="9. Salidas">
              {editando ? (
                <ListaEditable
                  items={c.salidas}
                  onChange={(v) => upd({ salidas: v })}
                  placeholder="Salida"
                />
              ) : (
                <ListaNumerada items={c.salidas} />
              )}
            </SeccionBox>
            <SeccionBox titulo="10. KPIs">
              {editando ? (
                <ListaEditable
                  items={c.kpis}
                  onChange={(v) => upd({ kpis: v })}
                  placeholder="KPI"
                />
              ) : (
                <ListaNumerada items={c.kpis} />
              )}
            </SeccionBox>
          </div>

          {/* 11-12: Temario (temas a tratar) + Quién */}
          <SeccionBox titulo="11. Temario — Temas a tratar · 12. Quién">
            {editando && c ? (
              <div className="space-y-1.5">
                {c.temario.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-right text-sm font-semibold text-slate-400">
                      {i + 1}
                    </span>
                    <Input
                      className="h-8 flex-[3] text-sm"
                      value={t.tema}
                      placeholder="Tema a tratar"
                      onChange={(e) => {
                        const next = c.temario.slice()
                        next[i] = { ...next[i], tema: e.target.value }
                        upd({ temario: next })
                      }}
                    />
                    <Input
                      className="h-8 flex-1 text-sm"
                      value={t.quien}
                      placeholder="Quién"
                      onChange={(e) => {
                        const next = c.temario.slice()
                        next[i] = { ...next[i], quien: e.target.value }
                        upd({ temario: next })
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-slate-400 hover:text-red-600"
                      onClick={() =>
                        upd({ temario: c.temario.filter((_, j) => j !== i) })
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    upd({ temario: [...c.temario, { tema: "", quien: "" }] })
                  }
                >
                  <Plus className="mr-1 size-3" />
                  Agregar tema
                </Button>
              </div>
            ) : c.temario.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 pb-1.5 pr-2 text-right font-semibold">
                      #
                    </th>
                    <th className="pb-1.5 pl-2 font-semibold">Tema</th>
                    <th className="w-[30%] pb-1.5 pl-2 font-semibold">Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {c.temario.map((t, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 text-right font-semibold text-slate-400">
                        {i + 1}
                      </td>
                      <td className="py-1.5 pl-2 text-slate-800">{t.tema}</td>
                      <td className="py-1.5 pl-2 text-slate-600">
                        {t.quien || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SeccionBox>
        </div>
      )}
    </div>
  )
}
