"use server"

/**
 * GOPs y Toolkits (DPO Gestión 4.5).
 *
 * El Excel consolidado se sigue completando y subiendo al Campus una vez por mes; acá
 * se importa para agregarle lo que el Excel no tiene: qué se hace con cada "No".
 *
 * La regla del módulo es esa — no forzar un plan por cada "No" (en agosto 2026 eran 41),
 * pero tampoco dejar ninguno sin decisión, porque R4.5.3 pide acciones para las
 * respuestas y notas para las N/A. Cada "No" termina en plan, en largo plazo con motivo,
 * o en no-aplica con nota; y la decisión se hereda de un mes al otro para que el triage
 * mensual sea sobre lo nuevo, no sobre la lista entera.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { hoyAR } from "@/lib/herramientas-gestion"
import {
  parsearConsolidadoGops,
  puntajeDeRespuestas,
  type ValorGop,
} from "@/lib/gops-excel"

const GOPS_PATH = "/planeamiento/gops"

type Result<T> = { data: T } | { error: string }

export type DestinoDecision = "plan" | "largo_plazo" | "no_aplica"

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

// ---------------------------------------------------------------------------
// Tipos de lectura
// ---------------------------------------------------------------------------

export interface GopTemaResumen {
  id: string
  hoja: string
  nombre: string
  area: string | null
  tipo: "GOP" | "Toolkit"
  frecuencia: string
  target: number
  dueno: string | null
  orden: number
  /** Puntaje del mes consultado (Si sobre Si+No). null si el mes no tiene carga. */
  puntaje: number | null
  /** Puntaje del mes anterior con carga, para ver si sube o baja. */
  puntaje_previo: number | null
  si: number
  no: number
  na: number
  /** Cuántos "No" hay que dar vuelta para alcanzar el target. */
  no_para_target: number
  /** "No" del mes que todavía no tienen decisión tomada. */
  sin_decidir: number
  /** Cuánto suma al puntaje cerrar un solo "No" (1 / preguntas que puntúan). */
  impacto_por_no: number | null
  /** Puntaje mes a mes del año, para la tendencia. */
  serie: Array<{ mes: number; puntaje: number }>
}

export interface GopPreguntaDetalle {
  id: string
  tema_id: string
  codigo: string
  seccion: string | null
  texto: string
  comentario: string | null
  orden: number
  valor: ValorGop | null
  /** Meses consecutivos en "No" hasta el mes consultado. */
  meses_en_no: number
  decision: {
    destino: DestinoDecision
    motivo: string | null
    fecha_revision: string | null
    plan_id: string | null
    plan_titulo: string | null
    plan_estado: string | null
    decidido_en: string
    decidido_por_nombre: string | null
    /** La revisión ya venció: vuelve a la superficie. */
    vencida: boolean
  } | null
}

export interface GopPendiente extends GopPreguntaDetalle {
  tema_nombre: string
  tema_hoja: string
  tema_area: string | null
  impacto: number | null
  /** 'sin_decidir' = nunca se resolvió qué hacer; 'revision' = venció el diferimiento. */
  motivo_pendiente: "sin_decidir" | "revision"
}

export interface GopPeriodo {
  anio: number
  mes: number
  respuestas: number
}

// ---------------------------------------------------------------------------
// Carga base
// ---------------------------------------------------------------------------

interface TemaRow {
  id: string
  hoja: string
  nombre: string
  area: string | null
  tipo: "GOP" | "Toolkit"
  frecuencia: string
  target: number | string
  dueno: string | null
  orden: number
  activo: boolean
}

interface PreguntaRow {
  id: string
  tema_id: string
  codigo: string
  seccion: string | null
  texto: string
  comentario: string | null
  orden: number
  activo: boolean
}

interface RespuestaRow {
  pregunta_id: string
  anio: number
  mes: number
  valor: ValorGop
}

interface DecisionRow {
  pregunta_id: string
  destino: DestinoDecision
  motivo: string | null
  fecha_revision: string | null
  plan_id: string | null
  decidido_en: string
  decidido_por: string | null
  profiles: { nombre: string | null } | null
  gops_planes: { titulo: string; estado: string } | null
}

/**
 * Trae una tabla completa paginando. Un año son 154 preguntas × 12 meses = 1848
 * respuestas, y PostgREST corta en 1000: sin esto la app leía el año a medias y los
 * meses que quedaban afuera se veían como "sin carga".
 */
interface QueryPaginable {
  range: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>
}

async function traerTodo<T>(armarQuery: () => QueryPaginable): Promise<T[]> {
  const PAGE = 1000
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await armarQuery().range(desde, desde + PAGE - 1)
    if (error || !data) break
    filas.push(...(data as unknown as T[]))
    if (data.length < PAGE) break
  }
  return filas
}

async function cargarAnio(anio: number) {
  const supabase = await createClient()

  const [temas, preguntas, respuestas, decisiones] = await Promise.all([
    traerTodo<TemaRow>(() =>
      supabase.from("gops_temas").select("*").eq("activo", true).order("orden"),
    ),
    traerTodo<PreguntaRow>(() =>
      supabase.from("gops_preguntas").select("*").eq("activo", true).order("orden"),
    ),
    traerTodo<RespuestaRow>(() =>
      supabase
        .from("gops_respuestas")
        .select("pregunta_id, anio, mes, valor")
        .eq("anio", anio)
        .order("pregunta_id"),
    ),
    traerTodo<DecisionRow>(() =>
      supabase
        .from("gops_decisiones")
        .select(
          "pregunta_id, destino, motivo, fecha_revision, plan_id, decidido_en, decidido_por, profiles:decidido_por(nombre), gops_planes:plan_id(titulo, estado)",
        )
        .order("pregunta_id"),
    ),
  ])

  // pregunta → mes → valor
  const porPregunta = new Map<string, Map<number, ValorGop>>()
  for (const r of respuestas) {
    let m = porPregunta.get(r.pregunta_id)
    if (!m) porPregunta.set(r.pregunta_id, (m = new Map()))
    m.set(r.mes, r.valor)
  }

  const porTema = new Map<string, PreguntaRow[]>()
  for (const p of preguntas) {
    const arr = porTema.get(p.tema_id)
    if (arr) arr.push(p)
    else porTema.set(p.tema_id, [p])
  }

  const decisionPorPregunta = new Map(decisiones.map((d) => [d.pregunta_id, d]))

  return { temas, preguntas, porPregunta, porTema, decisionPorPregunta }
}

function mesesEnNo(valores: Map<number, ValorGop> | undefined, hastaMes: number): number {
  if (!valores) return 0
  let n = 0
  for (let m = hastaMes; m >= 1; m--) {
    const v = valores.get(m)
    if (v === undefined) continue // mes sin carga: no corta la racha (hay bimestrales)
    if (v !== "no") break
    n++
  }
  return n
}

function armarDecision(
  d: DecisionRow | undefined,
  hoy: string,
): GopPreguntaDetalle["decision"] {
  if (!d) return null
  return {
    destino: d.destino,
    motivo: d.motivo,
    fecha_revision: d.fecha_revision,
    plan_id: d.plan_id,
    plan_titulo: d.gops_planes?.titulo ?? null,
    plan_estado: d.gops_planes?.estado ?? null,
    decidido_en: d.decidido_en,
    decidido_por_nombre: d.profiles?.nombre ?? null,
    vencida: !!d.fecha_revision && d.fecha_revision <= hoy,
  }
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

/** Meses que ya tienen carga, del más nuevo al más viejo. */
export async function getGopsPeriodos(): Promise<GopPeriodo[]> {
  const supabase = await createClient()
  // Paginado por lo mismo que cargarAnio: son más de 1000 filas por año.
  const filas = await traerTodo<{ anio: number; mes: number }>(() =>
    supabase.from("gops_respuestas").select("anio, mes").order("anio").order("mes"),
  )
  const cuenta = new Map<string, number>()
  for (const r of filas) {
    const k = `${r.anio}-${r.mes}`
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .map(([k, respuestas]) => {
      const [anio, mes] = k.split("-").map(Number)
      return { anio, mes, respuestas }
    })
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
}

export async function getGopsResumen(anio: number, mes: number): Promise<GopTemaResumen[]> {
  const hoy = hoyAR()
  const { temas, porTema, porPregunta, decisionPorPregunta } = await cargarAnio(anio)

  return temas.map((t) => {
    const preguntas = porTema.get(t.id) ?? []
    const target = Number(t.target)

    const valores = preguntas
      .map((p) => porPregunta.get(p.id)?.get(mes))
      .filter((v): v is ValorGop => !!v)

    const si = valores.filter((v) => v === "si").length
    const no = valores.filter((v) => v === "no").length
    const na = valores.filter((v) => v === "na").length
    const puntuan = si + no

    // Los "No" del mes que nadie decidió qué hacer con ellos.
    const sinDecidir = preguntas.filter((p) => {
      if (porPregunta.get(p.id)?.get(mes) !== "no") return false
      const d = decisionPorPregunta.get(p.id)
      if (!d) return true
      return !!d.fecha_revision && d.fecha_revision <= hoy
    }).length

    const serie: Array<{ mes: number; puntaje: number }> = []
    for (let m = 1; m <= 12; m++) {
      const vs = preguntas
        .map((p) => porPregunta.get(p.id)?.get(m))
        .filter((v): v is ValorGop => !!v)
      const p = puntajeDeRespuestas(vs)
      if (p !== null) serie.push({ mes: m, puntaje: p })
    }

    const puntaje = puntajeDeRespuestas(valores)
    const previo = serie.filter((s) => s.mes < mes).at(-1)?.puntaje ?? null

    return {
      id: t.id,
      hoja: t.hoja,
      nombre: t.nombre,
      area: t.area,
      tipo: t.tipo,
      frecuencia: t.frecuencia,
      target,
      dueno: t.dueno,
      orden: t.orden,
      puntaje,
      puntaje_previo: previo,
      si,
      no,
      na,
      no_para_target: puntuan === 0 ? 0 : Math.max(0, Math.ceil(target * puntuan - si)),
      sin_decidir: sinDecidir,
      impacto_por_no: puntuan === 0 ? null : 1 / puntuan,
      serie,
    }
  })
}

export async function getGopTemaDetalle(
  temaId: string,
  anio: number,
  mes: number,
): Promise<GopPreguntaDetalle[]> {
  const hoy = hoyAR()
  const { porTema, porPregunta, decisionPorPregunta } = await cargarAnio(anio)

  return (porTema.get(temaId) ?? []).map((p) => ({
    id: p.id,
    tema_id: p.tema_id,
    codigo: p.codigo,
    seccion: p.seccion,
    texto: p.texto,
    comentario: p.comentario,
    orden: p.orden,
    valor: porPregunta.get(p.id)?.get(mes) ?? null,
    meses_en_no: mesesEnNo(porPregunta.get(p.id), mes),
    decision: armarDecision(decisionPorPregunta.get(p.id), hoy),
  }))
}

/**
 * Lo que hay que mirar este mes: los "No" sin decisión y los diferimientos vencidos.
 * Ordenado por impacto — cuánto sube el puntaje del tema cerrar ese punto — para que
 * primero aparezca lo que mueve la aguja contra el target y no lo que ya está arriba.
 */
export async function getGopsPendientes(anio: number, mes: number): Promise<GopPendiente[]> {
  const hoy = hoyAR()
  const { temas, porTema, porPregunta, decisionPorPregunta } = await cargarAnio(anio)
  const temaPorId = new Map(temas.map((t) => [t.id, t]))

  const out: GopPendiente[] = []

  for (const t of temas) {
    const preguntas = porTema.get(t.id) ?? []
    const puntuan = preguntas.filter((p) => {
      const v = porPregunta.get(p.id)?.get(mes)
      return v === "si" || v === "no"
    }).length

    for (const p of preguntas) {
      if (porPregunta.get(p.id)?.get(mes) !== "no") continue
      const d = decisionPorPregunta.get(p.id)
      const vencida = !!d?.fecha_revision && d.fecha_revision <= hoy
      if (d && !vencida) continue

      const tema = temaPorId.get(p.tema_id)!
      out.push({
        id: p.id,
        tema_id: p.tema_id,
        tema_nombre: tema.nombre,
        tema_hoja: tema.hoja,
        tema_area: tema.area,
        codigo: p.codigo,
        seccion: p.seccion,
        texto: p.texto,
        comentario: p.comentario,
        orden: p.orden,
        valor: "no",
        meses_en_no: mesesEnNo(porPregunta.get(p.id), mes),
        decision: armarDecision(d, hoy),
        impacto: puntuan === 0 ? null : 1 / puntuan,
        motivo_pendiente: d ? "revision" : "sin_decidir",
      })
    }
  }

  return out.sort((a, b) => (b.impacto ?? 0) - (a.impacto ?? 0) || b.meses_en_no - a.meses_en_no)
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/**
 * Registra qué se hace con un "No". `plan_id` solo para destino 'plan' (el plan se crea
 * antes, con crearPlanGop). Para 'largo_plazo' y 'no_aplica' el motivo es obligatorio:
 * es la nota que el auditor busca al lado de la respuesta.
 */
export async function decidirPregunta(input: {
  preguntaId: string
  destino: DestinoDecision
  motivo?: string | null
  fechaRevision?: string | null
  planId?: string | null
}): Promise<Result<{ ok: true }>> {
  const profile = await requireAuth()
  if (!isEditorRole(profile.role)) return { error: "No tenés permiso para decidir sobre los GOPs." }

  const motivo = (input.motivo ?? "").trim()
  if (input.destino !== "plan" && !motivo) {
    return { error: "Diferir o marcar como no aplica necesita un motivo escrito." }
  }
  if (input.destino === "plan" && !input.planId) {
    return { error: "Falta el plan de acción." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("gops_decisiones").upsert(
    {
      pregunta_id: input.preguntaId,
      destino: input.destino,
      motivo: motivo || null,
      fecha_revision: input.fechaRevision || null,
      plan_id: input.destino === "plan" ? input.planId : null,
      decidido_por: profile.id,
      decidido_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pregunta_id" },
  )
  if (error) return { error: error.message }

  revalidatePath(GOPS_PATH)
  return { data: { ok: true } }
}

/** Vuelve a dejar el punto sin decisión (reaparece en la lista de pendientes). */
export async function borrarDecision(preguntaId: string): Promise<Result<{ ok: true }>> {
  const profile = await requireAuth()
  if (!isEditorRole(profile.role)) return { error: "No tenés permiso para decidir sobre los GOPs." }

  const supabase = await createClient()
  const { error } = await supabase.from("gops_decisiones").delete().eq("pregunta_id", preguntaId)
  if (error) return { error: error.message }

  revalidatePath(GOPS_PATH)
  return { data: { ok: true } }
}

// ---------------------------------------------------------------------------
// Importación del Excel
// ---------------------------------------------------------------------------

export interface ResumenImportacion {
  anio: number
  meses: number[]
  temas: number
  preguntasNuevas: number
  preguntasTotal: number
  respuestas: number
  avisos: string[]
}

/**
 * Importa el consolidado. Es idempotente: reimportar el mismo archivo actualiza en vez
 * de duplicar (las preguntas se reconocen por tema + código, las respuestas por
 * pregunta + período), así que se puede subir el archivo corregido las veces que haga
 * falta. Nunca borra decisiones ni planes.
 */
export async function importarConsolidadoGops(
  formData: FormData,
): Promise<Result<ResumenImportacion>> {
  const profile = await requireAuth()
  if (!isEditorRole(profile.role)) return { error: "No tenés permiso para importar los GOPs." }

  const file = formData.get("archivo")
  if (!(file instanceof File) || file.size === 0) return { error: "Subí el archivo .xlsx." }

  const anioForm = Number(formData.get("anio"))
  const hastaMesForm = Number(formData.get("hasta_mes"))
  const hoy = hoyAR()
  const [anioHoy, mesHoy] = hoy.split("-").map(Number)

  const anio = Number.isFinite(anioForm) && anioForm > 2000 ? anioForm : anioHoy
  // Sin corte, los meses que el Excel trae precargados con "No" entrarían como
  // respuestas negativas reales y hundirían el puntaje del año entero.
  const hastaMes =
    Number.isFinite(hastaMesForm) && hastaMesForm >= 1 && hastaMesForm <= 12
      ? hastaMesForm
      : anio < anioHoy
        ? 12
        : mesHoy

  let parseo
  try {
    parseo = parsearConsolidadoGops(await file.arrayBuffer(), file.name, { anio, hastaMes })
  } catch (e) {
    return { error: `No se pudo leer el Excel: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (parseo.temas.length === 0) {
    return { error: parseo.avisos.join(" ") || "El archivo no tiene hojas de GOPs reconocibles." }
  }

  const supabase = await createClient()
  const mesesTocados = new Set<number>()
  let preguntasNuevas = 0
  let preguntasTotal = 0
  let respuestasTotal = 0

  for (const tema of parseo.temas) {
    const { data: temaRow, error: temaErr } = await supabase
      .from("gops_temas")
      .upsert(
        {
          hoja: tema.hoja,
          nombre: tema.nombre,
          area: tema.area,
          tipo: tema.tipo,
          frecuencia: tema.frecuencia,
          dueno: tema.dueno,
          orden: tema.orden,
          activo: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "hoja" },
      )
      .select("id")
      .single()
    if (temaErr || !temaRow) return { error: `Tema "${tema.hoja}": ${temaErr?.message}` }

    const temaId = (temaRow as { id: string }).id

    const { data: existentes } = await supabase
      .from("gops_preguntas")
      .select("id, codigo")
      .eq("tema_id", temaId)
    const yaEstaban = new Set(
      ((existentes ?? []) as Array<{ codigo: string }>).map((p) => p.codigo),
    )

    const { data: preguntasRows, error: pregErr } = await supabase
      .from("gops_preguntas")
      .upsert(
        tema.preguntas.map((p) => ({
          tema_id: temaId,
          codigo: p.codigo,
          seccion: p.seccion,
          texto: p.texto,
          comentario: p.comentario,
          orden: p.orden,
          activo: true,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "tema_id,codigo" },
      )
      .select("id, codigo")
    if (pregErr || !preguntasRows) return { error: `Preguntas de "${tema.hoja}": ${pregErr?.message}` }

    const idPorCodigo = new Map(
      (preguntasRows as Array<{ id: string; codigo: string }>).map((p) => [p.codigo, p.id]),
    )
    preguntasTotal += tema.preguntas.length
    preguntasNuevas += tema.preguntas.filter((p) => !yaEstaban.has(p.codigo)).length

    const filas = tema.preguntas.flatMap((p) =>
      Object.entries(p.respuestas).map(([mes, valor]) => {
        mesesTocados.add(Number(mes))
        return {
          pregunta_id: idPorCodigo.get(p.codigo)!,
          anio: parseo.anio,
          mes: Number(mes),
          valor,
          comentario: p.comentario,
          importado_en: new Date().toISOString(),
          importado_por: profile.id,
        }
      }),
    )

    if (filas.length > 0) {
      const { error: respErr } = await supabase
        .from("gops_respuestas")
        .upsert(filas, { onConflict: "pregunta_id,anio,mes" })
      if (respErr) return { error: `Respuestas de "${tema.hoja}": ${respErr.message}` }
      respuestasTotal += filas.length
    }
  }

  const meses = [...mesesTocados].sort((a, b) => a - b)
  const resumen: ResumenImportacion = {
    anio: parseo.anio,
    meses,
    temas: parseo.temas.length,
    preguntasNuevas,
    preguntasTotal,
    respuestas: respuestasTotal,
    avisos: parseo.avisos,
  }

  await supabase.from("gops_importaciones").insert({
    archivo_nombre: file.name,
    anio: parseo.anio,
    meses,
    resumen,
    importado_por: profile.id,
  })

  revalidatePath(GOPS_PATH)
  return { data: resumen }
}

export interface ImportacionLog {
  id: string
  archivo_nombre: string
  anio: number
  meses: number[]
  resumen: ResumenImportacion
  created_at: string
  importado_por_nombre: string | null
}

export async function getUltimasImportaciones(limite = 5): Promise<ImportacionLog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("gops_importaciones")
    .select("id, archivo_nombre, anio, meses, resumen, created_at, profiles:importado_por(nombre)")
    .order("created_at", { ascending: false })
    .limit(limite)

  return ((data ?? []) as unknown as Array<
    Omit<ImportacionLog, "importado_por_nombre"> & { profiles: { nombre: string | null } | null }
  >).map((r) => ({
    id: r.id,
    archivo_nombre: r.archivo_nombre,
    anio: r.anio,
    meses: r.meses,
    resumen: r.resumen,
    created_at: r.created_at,
    importado_por_nombre: r.profiles?.nombre ?? null,
  }))
}
