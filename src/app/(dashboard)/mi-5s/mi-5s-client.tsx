"use client"

import { useMemo, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  ImageIcon,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient as createBrowserSupabase } from "@/lib/supabase/client"
import type { ArchivoAvance } from "@/lib/adjuntos-avance"
import {
  borrarEvidencia5S,
  borrarMiTarea,
  cargarEvidencia5S,
  crearMiTarea,
  editarMiTarea,
  firmarSubida5S,
  getEvidenciaSectorUrl,
  prepararCarga5S,
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

/**
 * El bucket sólo acepta estos cuatro formatos. Cualquier otra cosa —un archivo
 * de la galería sin tipo, un HEIF de iPhone— volvía como "mime type ... is not
 * supported", que al operario no le dice nada. Cuando el celular no informa el
 * tipo, se deduce de la extensión.
 */
const MIMES_OK = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"])
const MIME_POR_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
}

function mimeDeFoto(file: File): string | null {
  if (MIMES_OK.has(file.type)) return file.type
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  return MIME_POR_EXT[ext] ?? null
}

function formatFechaHora(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function nombreDelMes(periodo: string) {
  const [y, m] = periodo.split("-")
  return `${MESES[Number(m) - 1]} ${y}`
}

/**
 * Botón de foto. SIN `capture`: así el celular ofrece cámara Y galería, que es
 * lo que hacía falta — antes solo dejaba sacarla en el momento y no se podía
 * subir una que ya tenías guardada (pedido de 2026-08-05).
 */
function BotonFoto({
  label,
  file,
  onChange,
  color,
}: {
  label: string
  file: File | null
  onChange: (f: File | null) => void
  color: "amber" | "emerald"
}) {
  const estilos =
    color === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
      : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"

  return (
    <div className="flex-1">
      <label
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-4 text-center text-sm font-medium ${estilos}`}
      >
        <Camera className="size-6" />
        {label}
        <span className="text-[11px] font-normal opacity-80">
          {file ? "Foto lista ✓" : "tocá para sacar o elegir la foto"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 flex w-full items-center justify-center gap-1 text-xs text-slate-500 hover:text-red-600"
        >
          <X className="size-3" />
          quitar
        </button>
      )}
    </div>
  )
}

/** Opción del desplegable que abre el campo para escribir una tarea nueva. */
const OPCION_NUEVA = "__nueva__"

export function Mi5SClient({ data }: { data: MiSector5S }) {
  const router = useRouter()
  const [comentario, setComentario] = useState("")
  const [antes, setAntes] = useState<File | null>(null)
  const [despues, setDespues] = useState<File | null>(null)
  const [tareaSel, setTareaSel] = useState<string>("")
  const [subiendo, startSubir] = useTransition()
  const [verFoto, setVerFoto] = useState<string | null>(null)
  // Alta y edición de las tareas propias del operario. Dos campos separados
  // (el del desplegable y el de la lista de abajo): con un state compartido,
  // escribir en uno llenaba el otro.
  const [nuevaTarea, setNuevaTarea] = useState("")
  const [nuevaTareaSelect, setNuevaTareaSelect] = useState("")
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState("")
  const [guardandoTarea, startTarea] = useTransition()

  const esResponsable = data.sector_numero !== null
  const tareasReales = useMemo(() => data.tareas.filter((t) => !t.es_libre), [data.tareas])

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

  /**
   * La foto va del celular al bucket directo, pero con un permiso que firma el
   * server: subiendo con la sesión del operario, el bucket rechazaba las fotos
   * de las tareas que había cargado el auditor ("new row violates row-level
   * security policy"). El server chequea que la tarea sea de su sector.
   */
  async function subirUna(
    file: File,
    accionRef: string,
  ): Promise<ArchivoAvance | { error: string }> {
    const permiso = await firmarSubida5S(accionRef, file.name || "foto.jpg")
    if ("error" in permiso) return { error: permiso.error }

    const supabase = createBrowserSupabase()
    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(permiso.data.path, permiso.data.token, file, {
        contentType: mimeDeFoto(file) ?? "image/jpeg",
      })
    if (error) return { error: error.message }
    return {
      path: permiso.data.path,
      nombre: file.name,
      mime: file.type || null,
      bytes: file.size,
    }
  }

  function handleGuardar() {
    if (!comentario.trim()) {
      toast.error("Contá en una línea qué hiciste")
      return
    }
    if (!antes && !despues) {
      toast.error("Sacá al menos una foto")
      return
    }
    const pesada = [antes, despues].find((f) => f && f.size > MAX_BYTES)
    if (pesada) {
      toast.error("La foto supera los 15 MB")
      return
    }
    const rara = [antes, despues].find((f) => f && !mimeDeFoto(f))
    if (rara) {
      toast.error("Ese archivo no es una foto que la app pueda guardar: subí una JPG o PNG")
      return
    }

    startSubir(async () => {
      // El bucket solo acepta escrituras bajo la carpeta de una acción real,
      // así que primero el server resuelve (o crea) a cuál van estas fotos.
      const prep = await prepararCarga5S(tareaSel || null)
      if ("error" in prep) {
        toast.error(prep.error)
        return
      }
      const accionRef = prep.data.accionId

      let archivoAntes: ArchivoAvance | null = null
      let archivoDespues: ArchivoAvance | null = null

      if (antes) {
        const r = await subirUna(antes, accionRef)
        if ("error" in r) {
          toast.error(`No se pudo subir la foto de antes: ${r.error}`)
          return
        }
        archivoAntes = r
      }
      if (despues) {
        const r = await subirUna(despues, accionRef)
        if ("error" in r) {
          toast.error(`No se pudo subir la foto de después: ${r.error}`)
          return
        }
        archivoDespues = r
      }

      const res = await cargarEvidencia5S({
        accionId: accionRef,
        comentario,
        antes: archivoAntes,
        despues: archivoDespues,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success(
        archivoAntes && archivoDespues
          ? "¡Antes y después cargado! Suma para la nota 💪"
          : "¡Listo! Quedó registrado",
      )
      setComentario("")
      setAntes(null)
      setDespues(null)
      setTareaSel("")
      window.location.reload()
    })
  }

  /** Crea la tarea y la deja seleccionada para cargarle la foto enseguida. */
  function handleCrearTarea(texto: string, limpiar: () => void) {
    const titulo = texto.trim()
    if (!titulo) {
      toast.error("Escribí qué tarea hacés")
      return
    }
    startTarea(async () => {
      const res = await crearMiTarea(titulo)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Tarea agregada a tu sector")
      limpiar()
      setTareaSel(res.data.id)
      // refresh y no reload: si ya eligió las fotos, no las pierde.
      router.refresh()
    })
  }

  function handleEditarTarea(id: string) {
    const titulo = textoEdit.trim()
    if (!titulo) {
      toast.error("Escribí qué tarea hacés")
      return
    }
    startTarea(async () => {
      const res = await editarMiTarea(id, titulo)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Tarea actualizada")
      setEditandoId(null)
      setTextoEdit("")
      router.refresh()
    })
  }

  function handleBorrarTarea(id: string, descripcion: string) {
    if (!confirm(`¿Borrar la tarea "${descripcion}"?`)) return
    startTarea(async () => {
      const res = await borrarMiTarea(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Tarea borrada")
      if (tareaSel === id) setTareaSel("")
      router.refresh()
    })
  }

  async function handleBorrar(id: string) {
    const res = await borrarEvidencia5S(id)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Evidencia borrada")
    window.location.reload()
  }

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
              sumar: mantené tu puesto ordenado y cargá tus ideas en Buenas Prácticas.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const doc = data.documentacion

  return (
    <div className="space-y-5 pb-10">
      {/* ── Encabezado verde ── */}
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
          <div className="flex gap-3">
            <div className="rounded-lg bg-white/70 px-4 py-2 text-center">
              <p className="text-2xl font-bold text-emerald-700">{doc.total}</p>
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

      {/* ── Bonus: qué te suma documentar ── */}
      <Card className={doc.bonus > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200"}>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <TrendingUp className={`size-8 ${doc.bonus > 0 ? "text-amber-600" : "text-slate-300"}`} />
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Documentar tu trabajo te suma nota en la auditoría
            </p>
            <p className="text-xs text-slate-600">
              {doc.con_antes_despues} de {doc.total} cargas tienen <b>antes y después</b>.
              {doc.bonus < 3 && (
                <>
                  {" "}
                  Con 5 cargas y 3 con antes y después llegás al máximo (+3).
                </>
              )}
            </p>
          </div>
          <div className="rounded-lg bg-white px-4 py-2 text-center">
            <p className={`text-2xl font-bold ${doc.bonus > 0 ? "text-amber-600" : "text-slate-400"}`}>
              +{doc.bonus}
            </p>
            <p className="text-[11px] text-slate-600">puntos ganados</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Cargar ── */}
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
              ¿A qué tarea corresponde? <span className="text-slate-400">(opcional)</span>
            </label>
            <select
              value={tareaSel}
              onChange={(e) => setTareaSel(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Otra tarea (la cuento abajo) —</option>
              {tareasReales.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.descripcion}
                </option>
              ))}
              <option value={OPCION_NUEVA}>➕ Agregar una tarea nueva…</option>
            </select>

            {tareaSel === OPCION_NUEVA && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="mb-2 text-xs text-emerald-900">
                  Escribí la tarea que hacés y queda sumada a tu sector para todo el mes.
                </p>
                <div className="flex gap-2">
                  <input
                    value={nuevaTareaSelect}
                    onChange={(e) => setNuevaTareaSelect(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleCrearTarea(nuevaTareaSelect, () => setNuevaTareaSelect(""))
                      }
                    }}
                    placeholder="Ej: Limpieza de la zona de carga"
                    maxLength={200}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    onClick={() =>
                      handleCrearTarea(nuevaTareaSelect, () => setNuevaTareaSelect(""))
                    }
                    disabled={guardandoTarea}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {guardandoTarea ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Agregar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <BotonFoto label="ANTES" file={antes} onChange={setAntes} color="amber" />
            <BotonFoto label="DESPUÉS" file={despues} onChange={setDespues} color="emerald" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">¿Qué hiciste?</label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej: Ordené los pallets del pasillo 3 y señalicé el sector de devoluciones"
              rows={3}
            />
          </div>

          <Button
            onClick={handleGuardar}
            disabled={subiendo}
            className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
          >
            {subiendo ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Guardar
          </Button>
        </CardContent>
      </Card>

      {/* ── Tareas del sector ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-5 text-blue-600" />
            Tareas de tu sector
          </CardTitle>
          <p className="text-xs text-slate-500">
            Las que agregues vos las podés editar o borrar. Las que te cargó el auditor
            quedan como están.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {tareasReales.length === 0 && (
            <p className="py-3 text-center text-sm text-slate-500">
              Todavía no hay tareas cargadas. Agregá las que hacés en tu sector 👇
            </p>
          )}

          {tareasReales.map((t) =>
            editandoId === t.id ? (
              <div
                key={t.id}
                className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3"
              >
                <input
                  value={textoEdit}
                  onChange={(e) => setTextoEdit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleEditarTarea(t.id)
                    }
                    if (e.key === "Escape") setEditandoId(null)
                  }}
                  maxLength={200}
                  autoFocus
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleEditarTarea(t.id)}
                  disabled={guardandoTarea}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {guardandoTarea ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditandoId(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div
                key={t.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  t.evidencias > 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <CheckCircle2
                  className={`mt-0.5 size-5 shrink-0 ${
                    t.evidencias > 0 ? "text-emerald-600" : "text-slate-300"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{t.descripcion}</p>
                  {t.fecha_compromiso && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Para el {t.fecha_compromiso.split("-").reverse().slice(0, 2).join("/")}
                    </p>
                  )}
                </div>
                {t.completas > 0 && (
                  <Badge className="bg-amber-600">{t.completas} antes/después</Badge>
                )}
                {t.evidencias > 0 && <Badge className="bg-emerald-600">{t.evidencias} 📸</Badge>}
                {t.es_mia && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(t.id)
                        setTextoEdit(t.descripcion)
                      }}
                      className="text-slate-400 hover:text-blue-600"
                      aria-label="Editar tarea"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBorrarTarea(t.id, t.descripcion)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Borrar tarea"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ),
          )}

          <div className="flex gap-2 pt-1">
            <input
              value={nuevaTarea}
              onChange={(e) => setNuevaTarea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleCrearTarea(nuevaTarea, () => setNuevaTarea(""))
                }
              }}
              placeholder="Agregar otra tarea que hacés en tu sector…"
              maxLength={200}
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <Button
              type="button"
              onClick={() => handleCrearTarea(nuevaTarea, () => setNuevaTarea(""))}
              disabled={guardandoTarea}
              variant="outline"
            >
              {guardandoTarea ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Agregar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Checklist ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Con esto te van a auditar</CardTitle>
          <p className="text-xs text-slate-500">
            Son los mismos puntos que mira el auditor a fin de mes.
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
                  {items.map((i) => (
                    <div
                      key={i.id}
                      className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm text-slate-800">
                        <span className="font-medium">{i.numero}.</span> {i.titulo}
                      </p>
                      <p className="text-xs text-slate-500">{i.descripcion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ── Lo cargado ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Lo que se hizo en {data.sector_nombre} este mes ({data.evidencias.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.evidencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Todavía no hay nada cargado. Sacá la primera foto 👆
            </p>
          ) : (
            <div className="space-y-3">
              {data.evidencias.map((e) => {
                const antesF = e.fotos.find((f) => f.momento === "antes")
                const despuesF = e.fotos.find((f) => f.momento === "despues")
                const sueltas = e.fotos.filter((f) => !f.momento)
                return (
                  <div key={e.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-900">{e.comentario}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {e.autor_nombre} · {formatFechaHora(e.created_at)}
                        </p>
                      </div>
                      {antesF && despuesF && (
                        <Badge className="bg-amber-600">antes / después</Badge>
                      )}
                      {e.es_mia && (
                        <button
                          type="button"
                          onClick={() => handleBorrar(e.id)}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Borrar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        ...(antesF ? [{ f: antesF, label: "ANTES" }] : []),
                        ...(despuesF ? [{ f: despuesF, label: "DESPUÉS" }] : []),
                        ...sueltas.map((f) => ({ f, label: "FOTO" })),
                      ].map(({ f, label }) => (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => abrirFoto(f.path)}
                          className="flex flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-slate-100"
                        >
                          <ImageIcon className="size-5 text-slate-500" />
                          <span className="text-[10px] font-semibold text-slate-600">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
