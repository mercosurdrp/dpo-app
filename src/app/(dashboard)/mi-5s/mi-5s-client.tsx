"use client"

import { useMemo, useState, useTransition } from "react"
import Image from "next/image"
import { toast } from "sonner"
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  ImageIcon,
  Loader2,
  MapPin,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient as createBrowserSupabase } from "@/lib/supabase/client"
import {
  borrarEvidencia5S,
  cargarEvidencia5S,
  getEvidenciaSectorUrl,
  type MiSector5S,
} from "@/actions/s5-mi-sector"
import {
  S5_CATEGORIA_COLORS,
  S5_CATEGORIA_ORDEN,
  S5_CATEGORIA_S_LABELS,
  type S5Categoria,
} from "@/types/database"

const BUCKET = "s5-auditorias"
const MAX_BYTES = 15 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

function formatFechaHora(iso: string) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}/${mm} ${hh}:${mi}`
}

function nombreDelMes(periodo: string) {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]
  const [y, m] = periodo.split("-")
  return `${MESES[Number(m) - 1]} ${y}`
}

export function Mi5SClient({ data }: { data: MiSector5S }) {
  const [evidencias, setEvidencias] = useState(data.evidencias)
  const [comentario, setComentario] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [tareaSel, setTareaSel] = useState<string>("")
  const [subiendo, startSubir] = useTransition()
  const [verFoto, setVerFoto] = useState<string | null>(null)

  const esResponsable = data.sector_numero !== null

  /** Cuántas evidencias hay por cada tarea/ítem, para el tilde verde. */
  const hechoPorClave = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of evidencias) {
      const clave = e.tarea_id ?? e.item_id
      if (clave) m.set(clave, (m.get(clave) ?? 0) + 1)
    }
    return m
  }, [evidencias])

  const checklistPorS = useMemo(() => {
    const grupos = new Map<S5Categoria, typeof data.checklist>()
    for (const item of data.checklist) {
      const arr = grupos.get(item.categoria) ?? []
      arr.push(item)
      grupos.set(item.categoria, arr)
    }
    return grupos
  }, [data.checklist])

  async function abrirFoto(path: string) {
    const res = await getEvidenciaSectorUrl(path)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setVerFoto(res.data.url)
  }

  function handleGuardar() {
    if (!comentario.trim()) {
      toast.error("Contá en una línea qué hiciste")
      return
    }
    if (archivo && archivo.size > MAX_BYTES) {
      toast.error("La foto supera los 15 MB")
      return
    }

    startSubir(async () => {
      let storagePath: string | null = null

      if (archivo) {
        const supabase = createBrowserSupabase()
        const safe = sanitizeFileName(archivo.name || "foto.jpg")
        const path = `sector/${data.periodo}/${data.sector_numero}/${crypto.randomUUID()}-${safe}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, archivo, {
          contentType: archivo.type || "image/jpeg",
          upsert: false,
        })
        if (upErr) {
          toast.error(`No se pudo subir la foto: ${upErr.message}`)
          return
        }
        storagePath = path
      }

      // La tarea puede ser una del mes (tarea:{id}) o un ítem del checklist (item:{id}).
      const [tipo, id] = tareaSel ? tareaSel.split(":") : ["", ""]
      const itemSel = tipo === "item" ? data.checklist.find((i) => i.id === id) : null

      const res = await cargarEvidencia5S({
        comentario,
        tareaId: tipo === "tarea" ? id : null,
        itemId: tipo === "item" ? id : null,
        categoria:
          itemSel?.categoria ??
          (tipo === "tarea" ? data.tareas.find((t) => t.id === id)?.categoria ?? null : null),
        storagePath,
        mimeType: archivo?.type ?? null,
        tamanoBytes: archivo?.size ?? null,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success("¡Listo! Quedó registrado 💪")
      setEvidencias((prev) => [
        {
          id: crypto.randomUUID(),
          periodo: data.periodo,
          sector_numero: data.sector_numero!,
          item_id: tipo === "item" ? id : null,
          tarea_id: tipo === "tarea" ? id : null,
          categoria: itemSel?.categoria ?? null,
          comentario: comentario.trim(),
          storage_path: storagePath,
          created_at: new Date().toISOString(),
          autor_nombre: "Vos",
          es_mia: true,
        },
        ...prev,
      ])
      setComentario("")
      setArchivo(null)
      setTareaSel("")
    })
  }

  async function handleBorrar(id: string) {
    const res = await borrarEvidencia5S(id)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setEvidencias((prev) => prev.filter((e) => e.id !== id))
    toast.success("Evidencia borrada")
  }

  // ── Mes sin sorteo para este usuario ──
  if (!esResponsable) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Mi sector 5S</h1>
        <Card className="border-slate-200">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Sparkles className="size-10 text-slate-300" />
            <p className="text-base font-medium text-slate-700">
              Este mes no te tocó ningún sector
            </p>
            <p className="max-w-md text-sm text-slate-500">
              El sorteo de responsables de 5S se hace al principio de cada mes. Igual podés
              sumar puntos: mantené tu puesto ordenado y cargá tus ideas de mejora en Buenas
              Prácticas.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-10">
      {/* ── Encabezado verde: sos el responsable ── */}
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {nombreDelMes(data.periodo)} · 5S
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-emerald-900">
              <MapPin className="size-6" />
              Responsable de 5S en {data.sector_nombre}
            </h1>
            <p className="mt-1 text-sm text-emerald-800">
              Este mes el orden y la limpieza de este sector están en tus manos.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="rounded-lg bg-white/70 px-4 py-2 text-center">
              <p className="text-2xl font-bold text-emerald-700">{evidencias.length}</p>
              <p className="text-[11px] font-medium text-emerald-800">tareas cargadas</p>
            </div>
            <div className="rounded-lg bg-white/70 px-4 py-2 text-center">
              <p className="text-2xl font-bold text-emerald-700">{data.dias_restantes}</p>
              <p className="text-[11px] font-medium text-emerald-800">días para la auditoría</p>
            </div>
            {data.ultima_nota !== null && (
              <div className="rounded-lg bg-white/70 px-4 py-2 text-center">
                <p className="text-2xl font-bold text-emerald-700">{data.ultima_nota}</p>
                <p className="text-[11px] font-medium text-emerald-800">última nota</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cargar evidencia ── */}
      <Card className="border-emerald-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-5 text-emerald-600" />
            Cargar una tarea hecha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ¿A qué corresponde? <span className="text-slate-400">(opcional)</span>
            </label>
            <select
              value={tareaSel}
              onChange={(e) => setTareaSel(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Sin asociar —</option>
              {data.tareas.length > 0 && (
                <optgroup label="Tareas del mes">
                  {data.tareas.map((t) => (
                    <option key={t.id} value={`tarea:${t.id}`}>
                      {t.titulo}
                    </option>
                  ))}
                </optgroup>
              )}
              {S5_CATEGORIA_ORDEN.map((cat) => {
                const items = checklistPorS.get(cat) ?? []
                if (items.length === 0) return null
                return (
                  <optgroup key={cat} label={S5_CATEGORIA_S_LABELS[cat]}>
                    {items.map((i) => (
                      <option key={i.id} value={`item:${i.id}`}>
                        {i.numero}. {i.titulo}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ¿Qué hiciste?
            </label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej: Ordené los pallets del pasillo 3 y señalicé el sector de devoluciones"
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
              <Camera className="size-5" />
              {archivo ? "Cambiar foto" : "Sacar / elegir foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </label>
            {archivo && (
              <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                <ImageIcon className="size-4" />
                {archivo.name}
                <button type="button" onClick={() => setArchivo(null)} aria-label="Quitar foto">
                  <X className="size-3.5" />
                </button>
              </span>
            )}
            <Button
              onClick={handleGuardar}
              disabled={subiendo}
              className="ml-auto bg-emerald-600 hover:bg-emerald-700"
            >
              {subiendo ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Tareas del mes ── */}
      {data.tareas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-5 text-blue-600" />
              Tareas asignadas a tu sector este mes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.tareas.map((t) => {
              const hecho = hechoPorClave.get(t.id) ?? 0
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    hecho > 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-200"
                  }`}
                >
                  <CheckCircle2
                    className={`mt-0.5 size-5 shrink-0 ${
                      hecho > 0 ? "text-emerald-600" : "text-slate-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{t.titulo}</p>
                    {t.descripcion && (
                      <p className="mt-0.5 text-xs text-slate-600">{t.descripcion}</p>
                    )}
                  </div>
                  {t.categoria && (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: S5_CATEGORIA_COLORS[t.categoria],
                        color: S5_CATEGORIA_COLORS[t.categoria],
                      }}
                    >
                      {S5_CATEGORIA_S_LABELS[t.categoria].split(" - ")[0]}
                    </Badge>
                  )}
                  {hecho > 0 && (
                    <Badge className="bg-emerald-600">{hecho} 📸</Badge>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Checklist con el que te auditan ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Con esto te van a auditar</CardTitle>
          <p className="text-xs text-slate-500">
            Son los mismos puntos que mira el auditor a fin de mes. Si vas cargando fotos de
            cada uno, llegás con la tarea hecha y con la evidencia lista.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {S5_CATEGORIA_ORDEN.map((cat) => {
            const items = checklistPorS.get(cat) ?? []
            if (items.length === 0) return null
            return (
              <div key={cat}>
                <p
                  className="mb-2 text-xs font-bold uppercase tracking-wide"
                  style={{ color: S5_CATEGORIA_COLORS[cat] }}
                >
                  {S5_CATEGORIA_S_LABELS[cat]}
                </p>
                <div className="space-y-1.5">
                  {items.map((i) => {
                    const hecho = hechoPorClave.get(i.id) ?? 0
                    return (
                      <div
                        key={i.id}
                        className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <CheckCircle2
                          className={`mt-0.5 size-4 shrink-0 ${
                            hecho > 0 ? "text-emerald-600" : "text-slate-300"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800">
                            <span className="font-medium">{i.numero}.</span> {i.titulo}
                          </p>
                          <p className="text-xs text-slate-500">{i.descripcion}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ── Lo cargado este mes ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Lo que se hizo en {data.sector_nombre} este mes ({evidencias.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {evidencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Todavía no hay nada cargado. Sacá la primera foto 👆
            </p>
          ) : (
            <div className="space-y-3">
              {evidencias.map((e) => (
                <div key={e.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                  {e.storage_path ? (
                    <button
                      type="button"
                      onClick={() => abrirFoto(e.storage_path!)}
                      className="flex size-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200"
                      aria-label="Ver foto"
                    >
                      <ImageIcon className="size-6" />
                    </button>
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-300">
                      <ClipboardList className="size-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900">{e.comentario}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.autor_nombre} · {formatFechaHora(e.created_at)}
                    </p>
                  </div>
                  {e.es_mia && (
                    <button
                      type="button"
                      onClick={() => handleBorrar(e.id)}
                      className="self-start text-slate-400 hover:text-red-600"
                      aria-label="Borrar"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Visor de foto ── */}
      {verFoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVerFoto(null)}
        >
          <Image
            src={verFoto}
            alt="Evidencia 5S"
            width={1200}
            height={900}
            unoptimized
            className="max-h-full w-auto max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}
