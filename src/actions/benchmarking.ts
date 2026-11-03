"use server"

// Benchmarking (punto DPO Entrega 5.2). Un bench interno o externo se carga
// con su minuta, se le cuelgan evidencias (fotos, actas) cada vez que se hace
// uno, y se registra qué aplicamos a raíz del bench midiendo la mejora sobre
// un indicador (R5.2.4): o bien un indicador del Cuadro mensual (serie
// automática) o bien uno con carga mensual a mano (TLP, RMD, NPS...).

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import { archivosDelForm, subirArchivosAvance } from "@/lib/adjuntos-avance"
import { registerActivity } from "@/lib/dpo-activity"
import { CLAVE_CUADRO_MENSUAL, leerFoto } from "@/lib/fotos"
import { INDICADORES, type CuadroMensual } from "@/lib/indicadores/cuadro-mensual"
import type {
  AplicacionEstado,
  AplicacionValor,
  Bench,
  BenchAplicacion,
  BenchEvidencia,
  BenchModalidad,
  BenchTipo,
  MejorSi,
} from "@/types/benchmarking"

const BUCKET = "benchmarking"
const REVALIDATE_PATH = "/benchmarking"
const EDITORES = ["admin", "supervisor", "admin_rrhh"]
const TIPOS: BenchTipo[] = ["interno", "externo"]
const MODALIDADES: BenchModalidad[] = ["visita", "virtual", "intercambio_datos", "analisis_interno"]
const ESTADOS: AplicacionEstado[] = ["propuesta", "en_curso", "aplicada", "descartada"]
const SIGNED_SECONDS = 60 * 10
const EXT_IMAGEN = /\.(jpe?g|png|gif|webp|bmp)$/i

type Result<T> = { data: T } | { error: string }

function msg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) {
    throw new Error("No tenés permiso para editar benchmarking")
  }
  return profile
}

export async function puedeEditarBenchmarking(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && EDITORES.includes(profile.role)
}

function str(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null
}
function fecha(formData: FormData, key: string): string | null {
  const v = str(formData, key)
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
function num(formData: FormData, key: string): number | null {
  const s = String(formData.get(key) ?? "").trim().replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
function lista(formData: FormData, key: string): string[] {
  // Viene como campo repetido (append) o como una sola cadena separada por coma.
  const todos = formData.getAll(key).flatMap((v) => String(v).split(","))
  return Array.from(new Set(todos.map((s) => s.trim()).filter(Boolean)))
}

// ---------- Lectura ----------

async function serieDelCuadro(
  cuadro: CuadroMensual | null,
  indicadorId: string,
): Promise<AplicacionValor[]> {
  if (!cuadro) return []
  const fila = cuadro.filas.find((f) => f.def.id === indicadorId)
  if (!fila) return []
  return cuadro.meses.map((mes) => {
    const c = fila.celdas[mes]
    return { mes, valor: c?.valor ?? null, nota: c?.parcial ? "Mes en curso (parcial)" : null }
  })
}

export async function listBenchs(): Promise<Result<Bench[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [benchsRes, evidRes, aplRes, valRes, foto] = await Promise.all([
      supabase
        .from("benchmarking_benchs")
        .select("*, creador:profiles!benchmarking_benchs_created_by_fkey(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("benchmarking_evidencias").select("*").order("created_at", { ascending: false }),
      supabase.from("benchmarking_aplicaciones").select("*").order("created_at", { ascending: true }),
      supabase.from("benchmarking_aplicaciones_valores").select("*").order("mes", { ascending: true }),
      leerFoto<CuadroMensual>(CLAVE_CUADRO_MENSUAL),
    ])
    if (benchsRes.error) {
      // Tabla inexistente: el módulo no está habilitado en esta base.
      if (/benchmarking_benchs/.test(benchsRes.error.message)) return { data: [] }
      return { error: benchsRes.error.message }
    }
    if (evidRes.error) return { error: evidRes.error.message }
    if (aplRes.error) return { error: aplRes.error.message }
    if (valRes.error) return { error: valRes.error.message }

    // Firmar las evidencias en una sola llamada.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidRows = (evidRes.data ?? []) as any[]
    const urls = new Map<string, string>()
    if (evidRows.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          evidRows.map((e) => e.path as string),
          SIGNED_SECONDS,
        )
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
      }
    }
    const evidPorBench = new Map<string, BenchEvidencia[]>()
    for (const e of evidRows) {
      const item: BenchEvidencia = {
        id: e.id,
        bench_id: e.bench_id,
        path: e.path,
        nombre: e.nombre,
        mime: e.mime ?? null,
        bytes: e.bytes ?? null,
        descripcion: e.descripcion ?? null,
        created_by: e.created_by ?? null,
        created_at: e.created_at,
        url: urls.get(e.path) ?? null,
        es_imagen: (e.mime ?? "").startsWith("image/") || EXT_IMAGEN.test(e.nombre ?? ""),
      }
      const arr = evidPorBench.get(e.bench_id) ?? []
      arr.push(item)
      evidPorBench.set(e.bench_id, arr)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valRows = (valRes.data ?? []) as any[]
    const valPorApl = new Map<string, AplicacionValor[]>()
    for (const v of valRows) {
      const arr = valPorApl.get(v.aplicacion_id) ?? []
      arr.push({ mes: v.mes, valor: v.valor === null ? null : Number(v.valor), nota: v.nota ?? null })
      valPorApl.set(v.aplicacion_id, arr)
    }

    const cuadro = foto?.datos ?? null
    const aplPorBench = new Map<string, BenchAplicacion[]>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (aplRes.data ?? []) as any[]) {
      const fuente: "cuadro" | "manual" = a.indicador_id ? "cuadro" : "manual"
      const def = a.indicador_id ? INDICADORES.find((d) => d.id === a.indicador_id) : undefined
      const serie =
        fuente === "cuadro"
          ? await serieDelCuadro(cuadro, a.indicador_id)
          : (valPorApl.get(a.id) ?? [])
      const item: BenchAplicacion = {
        id: a.id,
        bench_id: a.bench_id,
        titulo: a.titulo,
        descripcion: a.descripcion ?? null,
        proceso: a.proceso ?? null,
        responsable: a.responsable ?? null,
        estado: a.estado,
        fecha_aplicacion: a.fecha_aplicacion ?? null,
        indicador_id: a.indicador_id ?? null,
        indicador_nombre: a.indicador_nombre ?? def?.nombre ?? null,
        unidad: a.unidad ?? def?.unidad ?? null,
        mejor_si: (a.mejor_si ?? "menor") as MejorSi,
        meta: a.meta === null || a.meta === undefined ? (def?.meta ?? null) : Number(a.meta),
        resultado: a.resultado ?? null,
        created_at: a.created_at,
        updated_at: a.updated_at,
        serie,
        fuente,
      }
      const arr = aplPorBench.get(a.bench_id) ?? []
      arr.push(item)
      aplPorBench.set(a.bench_id, arr)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benchs = ((benchsRes.data ?? []) as any[]).map<Bench>((b) => ({
      id: b.id,
      tipo: b.tipo,
      titulo: b.titulo,
      fecha: b.fecha,
      contraparte: b.contraparte ?? null,
      modalidad: b.modalidad,
      lugar: b.lugar ?? null,
      participantes: b.participantes ?? null,
      objetivo: b.objetivo ?? null,
      temas: b.temas ?? null,
      conclusiones: b.conclusiones ?? null,
      indicadores: Array.isArray(b.indicadores) ? b.indicadores : [],
      created_by: b.created_by ?? null,
      created_at: b.created_at,
      updated_at: b.updated_at,
      creador_nombre: b.creador?.nombre ?? null,
      evidencias: evidPorBench.get(b.id) ?? [],
      aplicaciones: aplPorBench.get(b.id) ?? [],
    }))
    return { data: benchs }
  } catch (err) {
    return { error: msg(err, "Error al leer los benchs") }
  }
}

export async function getSignedUrlBenchmarking(path: string): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS)
    if (error || !data) return { error: error?.message ?? "No se pudo firmar la URL" }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return { error: msg(err, "Error al abrir el archivo") }
  }
}

// ---------- Benchs ----------

function cuerpoBench(formData: FormData) {
  const tipo = str(formData, "tipo") as BenchTipo | null
  const modalidad = (str(formData, "modalidad") ?? "visita") as BenchModalidad
  if (!tipo || !TIPOS.includes(tipo)) throw new Error("Tipo de bench inválido")
  if (!MODALIDADES.includes(modalidad)) throw new Error("Modalidad inválida")
  const titulo = str(formData, "titulo")
  if (!titulo) throw new Error("El título es obligatorio")
  const f = fecha(formData, "fecha")
  if (!f) throw new Error("La fecha es obligatoria")
  return {
    tipo,
    titulo,
    fecha: f,
    contraparte: str(formData, "contraparte"),
    modalidad,
    lugar: str(formData, "lugar"),
    participantes: str(formData, "participantes"),
    objetivo: str(formData, "objetivo"),
    temas: str(formData, "temas"),
    conclusiones: str(formData, "conclusiones"),
    indicadores: lista(formData, "indicadores"),
  }
}

export async function crearBench(formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const body = cuerpoBench(formData)
    const { data, error } = await supabase
      .from("benchmarking_benchs")
      .insert({ ...body, created_by: profile.id })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo crear el bench" }
    const id = (data as { id: string }).id

    // Las fotos/archivos que vienen en el mismo form se cuelgan como evidencias.
    const files = archivosDelForm(formData, "archivo")
    if (files.length > 0) {
      const r = await subirArchivosAvance(supabase, BUCKET, `benchs/${id}`, files)
      if ("error" in r) return { error: r.error }
      const { error: errEv } = await supabase.from("benchmarking_evidencias").insert(
        r.archivos.map((a) => ({
          bench_id: id,
          path: a.path,
          nombre: a.nombre,
          mime: a.mime,
          bytes: a.bytes,
          created_by: profile.id,
        })),
      )
      if (errEv) return { error: errEv.message }
    }

    await registerActivity(supabase, {
      tipo: "otro",
      titulo: `Bench ${body.tipo}: ${body.titulo}`,
      descripcion: body.contraparte ? `Con ${body.contraparte} · ${body.fecha}` : body.fecha,
      pilar_codigo: "entrega",
      punto_codigo: "5.2",
      requisito_codigo: body.tipo === "interno" ? "R5.2.1" : "R5.2.3",
      referencia_id: id,
      referencia_tipo: "benchmarking",
      user_id: profile.id,
      user_nombre: profile.nombre,
    })

    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return { error: msg(err, "Error al crear el bench") }
  }
}

export async function actualizarBench(id: string, formData: FormData): Promise<Result<{ id: string }>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const body = cuerpoBench(formData)
    const { error } = await supabase
      .from("benchmarking_benchs")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return { error: msg(err, "Error al guardar el bench") }
  }
}

export async function eliminarBench(id: string): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data: evid } = await supabase
      .from("benchmarking_evidencias")
      .select("path")
      .eq("bench_id", id)
    const { error } = await supabase.from("benchmarking_benchs").delete().eq("id", id)
    if (error) return { error: error.message }
    const paths = ((evid ?? []) as { path: string }[]).map((e) => e.path)
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: msg(err, "Error al eliminar el bench") }
  }
}

// ---------- Evidencias ----------

export async function subirEvidencias(benchId: string, formData: FormData): Promise<Result<{ n: number }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const files = archivosDelForm(formData, "archivo")
    if (files.length === 0) return { error: "Elegí al menos una foto o archivo" }
    const descripcion = str(formData, "descripcion")

    const r = await subirArchivosAvance(supabase, BUCKET, `benchs/${benchId}`, files)
    if ("error" in r) return { error: r.error }
    const { error } = await supabase.from("benchmarking_evidencias").insert(
      r.archivos.map((a) => ({
        bench_id: benchId,
        path: a.path,
        nombre: a.nombre,
        mime: a.mime,
        bytes: a.bytes,
        descripcion,
        created_by: profile.id,
      })),
    )
    if (error) {
      await supabase.storage.from(BUCKET).remove(r.archivos.map((a) => a.path))
      return { error: error.message }
    }
    revalidatePath(REVALIDATE_PATH)
    return { data: { n: files.length } }
  } catch (err) {
    return { error: msg(err, "Error al subir la evidencia") }
  }
}

export async function eliminarEvidencia(id: string): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data: actual } = await supabase
      .from("benchmarking_evidencias")
      .select("path")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase.from("benchmarking_evidencias").delete().eq("id", id)
    if (error) return { error: error.message }
    const path = (actual as { path: string } | null)?.path
    if (path) await supabase.storage.from(BUCKET).remove([path])
    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: msg(err, "Error al eliminar la evidencia") }
  }
}

// ---------- Aplicaciones (qué aplicamos y cómo lo medimos) ----------

function cuerpoAplicacion(formData: FormData) {
  const titulo = str(formData, "titulo")
  if (!titulo) throw new Error("Contá qué aplicamos")
  const estado = (str(formData, "estado") ?? "en_curso") as AplicacionEstado
  if (!ESTADOS.includes(estado)) throw new Error("Estado inválido")
  const indicadorId = str(formData, "indicador_id")
  const def = indicadorId ? INDICADORES.find((d) => d.id === indicadorId) : undefined
  if (indicadorId && !def) throw new Error("Indicador del cuadro inválido")
  const mejorSiForm = str(formData, "mejor_si") as MejorSi | null
  const mejor_si: MejorSi = def
    ? def.mejor_si === "mayor"
      ? "mayor"
      : "menor"
    : mejorSiForm === "mayor"
      ? "mayor"
      : "menor"
  return {
    titulo,
    descripcion: str(formData, "descripcion"),
    proceso: str(formData, "proceso"),
    responsable: str(formData, "responsable"),
    estado,
    fecha_aplicacion: fecha(formData, "fecha_aplicacion"),
    indicador_id: def ? def.id : null,
    indicador_nombre: def ? def.nombre : str(formData, "indicador_nombre"),
    unidad: def ? def.unidad : str(formData, "unidad"),
    mejor_si,
    meta: def ? (num(formData, "meta") ?? def.meta) : num(formData, "meta"),
    resultado: str(formData, "resultado"),
  }
}

export async function crearAplicacion(benchId: string, formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const body = cuerpoAplicacion(formData)
    const { data, error } = await supabase
      .from("benchmarking_aplicaciones")
      .insert({ ...body, bench_id: benchId, created_by: profile.id })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo guardar" }
    revalidatePath(REVALIDATE_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return { error: msg(err, "Error al guardar la aplicación") }
  }
}

export async function actualizarAplicacion(id: string, formData: FormData): Promise<Result<{ id: string }>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const body = cuerpoAplicacion(formData)
    const { error } = await supabase
      .from("benchmarking_aplicaciones")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return { error: msg(err, "Error al guardar la aplicación") }
  }
}

export async function eliminarAplicacion(id: string): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("benchmarking_aplicaciones").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: msg(err, "Error al eliminar la aplicación") }
  }
}

/** Carga o pisa el valor de un mes de la serie manual. Valor vacío = borra el mes. */
export async function guardarValorMes(
  aplicacionId: string,
  mes: string,
  valor: number | null,
  nota: string | null,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireEditor()
    if (!/^\d{4}-\d{2}$/.test(mes)) return { error: "Mes inválido (AAAA-MM)" }
    const supabase = await createClient()
    if (valor === null) {
      const { error } = await supabase
        .from("benchmarking_aplicaciones_valores")
        .delete()
        .eq("aplicacion_id", aplicacionId)
        .eq("mes", mes)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase
        .from("benchmarking_aplicaciones_valores")
        .upsert(
          { aplicacion_id: aplicacionId, mes, valor, nota: nota?.trim() || null, created_by: profile.id },
          { onConflict: "aplicacion_id,mes" },
        )
      if (error) return { error: error.message }
    }
    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: msg(err, "Error al guardar el valor") }
  }
}
