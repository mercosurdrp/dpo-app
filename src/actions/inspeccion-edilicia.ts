"use server"

// Integración de la reunión de Mantenimiento con la app externa "Plan de
// Mantenimiento Edilicio": la recorrida mensual del depósito se hace allá y
// acá se trae lo que dio mal para decidir qué hacer con cada punto.
//
// Todo va contra la URL PÚBLICA de la app (Vercel). No se usa
// MANTENIMIENTO_API_URL a propósito: esa variable apunta al servidor viejo con
// IP fija, que ya no responde, y era lo que dejaba la sección en "no se pudo
// consultar". Los endpoints que se usan acá no piden token.

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"

const URL_POR_DEFECTO = "https://plan-mantenimiento-edilicio.vercel.app"

const TIMEOUT_MS = 8000

export interface SeccionInspeccion {
  seccion_num: number
  seccion_titulo: string
  adherencia_pct: number
  items: number
}

export interface EstadoInspeccion {
  periodo: string
  existe: boolean
  /** no_generada | pendiente | en_curso | cerrada */
  estado: string
  revision_id?: number
  fecha?: string
  responsable?: string | null
  items_total?: number
  items_respondidos?: number
  anomalias?: number
  adherencia_pct?: number
  secciones?: SeccionInspeccion[]
  url: string
}

export type DestinoDecision = "plan" | "largo_plazo" | "no_aplica"

export interface DecisionInspeccion {
  pregunta_id: number
  destino: DestinoDecision
  motivo: string | null
  fecha_revision: string | null
  pda_id: number | null
  pda_codigo: string | null
  pda_titulo: string | null
  pda_estado: string | null
  decidido_por: string | null
  decidido_en: string | null
}

/** Un punto de la recorrida que se marcó "No". */
export interface AnomaliaInspeccion {
  pregunta_id: number
  codigo: string
  pregunta: string
  seccion_num: number
  seccion_titulo: string
  categoria: string | null
  comentario: string | null
  /** Meses seguidos que viene dando mal, contando éste. */
  revisiones_en_nok: number
  se_mantiene: boolean
  requiere_plan: boolean
  decision_vencida: boolean
  decision: DecisionInspeccion | null
}

export interface AnomaliasInspeccion {
  revision: { id: number; periodo: string; fecha: string } | null
  items: AnomaliaInspeccion[]
  resumen: {
    total: number
    sin_decidir: number
    plan: number
    largo_plazo: number
    no_aplica: number
  }
}

export interface RubroInspeccion {
  id: string
  nombre: string
}

function baseUrls(): string[] {
  const configurada = (process.env.MANTENIMIENTO_PUBLIC_URL ?? "").trim()
  const lista = [configurada, URL_POR_DEFECTO]
    .filter(Boolean)
    .map((u) => u.replace(/\/$/, ""))
  return Array.from(new Set(lista))
}

/**
 * GET a la app externa probando cada URL base hasta que una responda. Devuelve
 * null si ninguna contesta: la reunión no se rompe por una integración caída.
 */
async function getJson<T>(path: string): Promise<T | null> {
  for (const base of baseUrls()) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const r = await fetch(`${base}${path}`, {
        signal: controller.signal,
        cache: "no-store",
      })
      if (r.ok) return (await r.json()) as T
    } catch {
      // probar la siguiente
    } finally {
      clearTimeout(id)
    }
  }
  return null
}

/** "YYYY-MM" del mes de la reunión: la recorrida que le corresponde. */
export async function periodoDeReunion(fechaISO: string): Promise<string> {
  return fechaISO.slice(0, 7)
}

/** Estado de la inspección de un mes, o null si la app externa no responde. */
export async function obtenerEstadoInspeccion(
  periodo: string,
): Promise<EstadoInspeccion | null> {
  return getJson<EstadoInspeccion>(
    `/api/inspecciones/estado?periodo=${encodeURIComponent(periodo)}`,
  )
}

/**
 * Los puntos que dieron "No" en una recorrida, con la decisión vigente de cada
 * uno (o sin ella). Es el temario de la reunión de Mantenimiento.
 */
export async function obtenerAnomaliasInspeccion(
  revisionId: number,
): Promise<AnomaliasInspeccion | null> {
  return getJson<AnomaliasInspeccion>(
    `/api/pendientes?tipo=inspeccion&revision_id=${revisionId}`,
  )
}

/** Rubros con los que la app externa clasifica un plan. Lista pública. */
export async function listarRubrosInspeccion(): Promise<RubroInspeccion[]> {
  return (await getJson<RubroInspeccion[]>("/api/rubros")) ?? []
}

export interface DecidirAnomaliaInput {
  reunionId: string
  periodo: string
  revisionId: number
  preguntaId: number
  codigo: string
  pregunta: string
  destino: DestinoDecision
  /** Obligatorio para largo_plazo y no_aplica. */
  motivo?: string
  /** Sólo largo_plazo: cuándo se vuelve a mirar. */
  fechaRevision?: string | null
  /** Sólo plan. */
  plan?: {
    titulo: string
    descripcion: string
    responsableId: string | null
    responsableNombre: string
    fechaProbable: string | null
    rubro: string
  }
}

export interface DecidirAnomaliaResult {
  decision: DecisionInspeccion
  /** Si se creó un compromiso en el Action Log de la reunión. */
  compromisoCreado: boolean
  aviso?: string
}

/**
 * Registra la decisión sobre un punto de la recorrida en la app de
 * mantenimiento. Son los mismos tres caminos que usa esa app: plan de acción
 * (crea el PDA allá), largo plazo (con motivo y fecha de revisión) o no aplica
 * (con motivo). Si es un plan, además deja el compromiso en el Action Log de
 * la reunión, así se sigue acá sin volver a cargarlo.
 */
export async function decidirAnomaliaInspeccion(
  input: DecidirAnomaliaInput,
): Promise<{ data: DecidirAnomaliaResult } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
      return { error: "No tenés permiso para decidir sobre la inspección" }
    }

    const motivo = (input.motivo ?? "").trim()
    if (input.destino !== "plan" && !motivo) {
      return { error: "Diferir o descartar un punto exige explicar por qué" }
    }
    if (input.destino === "plan" && !input.plan?.titulo.trim()) {
      return { error: "El plan necesita un título" }
    }

    const body: Record<string, unknown> = {
      destino: input.destino,
      motivo: input.destino === "plan" ? null : motivo,
      fecha_revision:
        input.destino === "largo_plazo" ? input.fechaRevision || null : null,
      decidido_por: profile.nombre,
    }
    if (input.destino === "plan" && input.plan) {
      body.plan = {
        titulo: input.plan.titulo.trim().slice(0, 120),
        descripcion: input.plan.descripcion.trim() || null,
        tipo: "reparacion",
        responsable: input.plan.responsableNombre || null,
        fecha_probable: input.plan.fechaProbable || null,
        revision_id: input.revisionId,
        rubro: input.plan.rubro || null,
      }
    }

    let decision: DecisionInspeccion | null = null
    let ultimoError = "La app de mantenimiento no respondió"
    for (const base of baseUrls()) {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const r = await fetch(`${base}/api/decisiones/${input.preguntaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        })
        if (r.ok) {
          decision = (await r.json()) as DecisionInspeccion
          break
        }
        const texto = await r.text()
        ultimoError = `La app de mantenimiento respondió ${r.status}: ${texto.slice(0, 200)}`
        // Un 4xx es un problema del pedido, no de la URL: no insistir.
        if (r.status >= 400 && r.status < 500) break
      } catch {
        // probar la siguiente
      } finally {
        clearTimeout(id)
      }
    }
    if (!decision) return { error: ultimoError }

    // El plan queda como compromiso de la reunión: es lo que se va a seguir en
    // el Action Log. Largo plazo y no aplica no generan tarea.
    let compromisoCreado = false
    let aviso: string | undefined
    if (input.destino === "plan" && input.plan) {
      const supabase = await createClient()
      const etiqueta = decision.pda_codigo ? `${decision.pda_codigo} · ` : ""
      const { error } = await supabase.from("reuniones_actividades").insert({
        reunion_id: input.reunionId,
        descripcion: `${etiqueta}${input.plan.titulo.trim()}`,
        motivo: `Inspección edilicia ${input.periodo} · punto ${input.codigo}: ${input.pregunta}`,
        responsable_id: input.plan.responsableId,
        fecha_compromiso: input.plan.fechaProbable || null,
        observaciones: input.plan.descripcion.trim() || null,
        seccion: null,
        estado: "no_comenzada",
        created_by: profile.id,
        destino: "simple",
      })
      if (error) {
        aviso = `La decisión quedó registrada en mantenimiento, pero no se pudo crear el compromiso: ${error.message}`
      } else {
        compromisoCreado = true
        revalidatePath("/reuniones")
      }
    }

    return { data: { decision, compromisoCreado, aviso } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error inesperado" }
  }
}

// =============================================================================
// Sincronización de los planes de la recorrida con el Action Log
// =============================================================================
//
// Los "No" de la recorrida se pueden decidir desde esta reunión o directo en
// la app de mantenimiento. Si se deciden allá, la reunión no se entera y el
// Action Log queda vacío aunque el plan exista. Esta sincronización mira el
// resultado, no el camino: por cada plan (PDA) que cubre un punto "No" de la
// recorrida del mes, deja el compromiso en el Action Log de la reunión si no
// existe todavía, y lo cierra cuando el PDA pasa a ejecutado. La marca para no
// duplicar es el código PDA al principio de la descripción ("PDA-057 · …"),
// que es lo mismo que escribe decidirAnomaliaInspeccion.

interface PdaExterno {
  id: number
  codigo: string | null
  titulo: string
  descripcion: string | null
  responsable: string | null
  fecha_probable: string | null
  estado: string | null
  fecha_ejecucion: string | null
  creado_en: string
}

export interface SincronizacionCompromisos {
  creados: string[]
  cerrados: string[]
  aviso?: string
}

const ESTADOS_PDA_HECHO = new Set(["ejecutado", "cerrado"])

function normalizarNombre(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
}

function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return ""
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

/** Planes de la app externa que cubren una pregunta (origen o decisión). */
async function pdasDePregunta(preguntaId: number): Promise<PdaExterno[]> {
  return (await getJson<PdaExterno[]>(`/api/pdas?pregunta_id=${preguntaId}`)) ?? []
}

/**
 * Deja en el Action Log de la reunión los compromisos que faltan para los
 * planes de la recorrida del mes, y cierra los que ya se ejecutaron. Es
 * idempotente: se puede llamar cada vez que se abre la reunión.
 */
export async function sincronizarCompromisosInspeccion(input: {
  reunionId: string
  periodo: string
  anomalias: AnomaliasInspeccion
}): Promise<{ data: SincronizacionCompromisos } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
      return { data: { creados: [], cerrados: [] } }
    }
    const revision = input.anomalias.revision
    if (!revision) return { data: { creados: [], cerrados: [] } }

    // 1) Planes que cubren cada punto "No" de esta recorrida. Si el punto
    //    tiene decisión, es ese PDA. Si no, cualquier plan creado desde la
    //    recorrida que cubra la pregunta (un plan cargado a mano en la app de
    //    mantenimiento no deja decisión).
    const desde = revision.fecha.slice(0, 10)
    const planes = new Map<number, { pda: PdaExterno; item: AnomaliaInspeccion }>()
    for (const item of input.anomalias.items) {
      const candidatos = await pdasDePregunta(item.pregunta_id)
      for (const pda of candidatos) {
        const esDecision = item.decision?.pda_id === pda.id
        const nacioEnLaRecorrida = pda.creado_en.slice(0, 10) >= desde
        if ((esDecision || nacioEnLaRecorrida) && !planes.has(pda.id)) {
          planes.set(pda.id, { pda, item })
        }
      }
    }
    if (planes.size === 0) return { data: { creados: [], cerrados: [] } }

    const admin = createAdminClient()

    // 2) Compromisos ya existentes en cualquier reunión de Mantenimiento
    //    (un plan abierto se arrastra de mes a mes: no va dos veces).
    const { data: reunionesMant, error: errReu } = await admin
      .from("reuniones")
      .select("id")
      .eq("tipo", "mantenimiento")
    if (errReu) return { error: errReu.message }
    const idsReu = (reunionesMant ?? []).map((r) => r.id as string)
    const { data: existentes, error: errAct } = await admin
      .from("reuniones_actividades")
      .select("id, descripcion, estado")
      .in("reunion_id", idsReu)
      .ilike("descripcion", "PDA-%")
    if (errAct) return { error: errAct.message }
    const porCodigo = new Map<string, { id: string; estado: string }>()
    for (const a of existentes ?? []) {
      const codigo = String(a.descripcion ?? "").split("·")[0].trim()
      if (codigo) porCodigo.set(codigo, { id: a.id as string, estado: a.estado as string })
    }

    // 3) Responsable: el nombre libre de la app externa contra los perfiles.
    const { data: perfiles } = await admin
      .from("profiles")
      .select("id, nombre")
      .eq("active", true)
    const perfilPorNombre = new Map<string, string>()
    for (const p of perfiles ?? []) {
      perfilPorNombre.set(normalizarNombre(p.nombre as string), p.id as string)
    }

    const creados: string[] = []
    const cerrados: string[] = []
    const avisos: string[] = []

    for (const { pda, item } of planes.values()) {
      const codigo = pda.codigo ?? `PDA-${String(pda.id).padStart(3, "0")}`
      let existente = porCodigo.get(codigo) ?? null

      if (!existente) {
        const { data: fila, error } = await admin
          .from("reuniones_actividades")
          .insert({
            reunion_id: input.reunionId,
            descripcion: `${codigo} · ${pda.titulo.trim()}`.slice(0, 500),
            motivo: `Inspección edilicia ${input.periodo} · punto ${item.codigo}: ${item.pregunta}`,
            responsable_id:
              perfilPorNombre.get(normalizarNombre(pda.responsable)) ?? null,
            fecha_compromiso: pda.fecha_probable || null,
            observaciones: pda.descripcion?.trim() || null,
            seccion: null,
            estado: "no_comenzada",
            created_by: profile.id,
            destino: "simple",
          })
          .select("id")
          .single()
        if (error || !fila) {
          avisos.push(`${codigo}: ${error?.message ?? "no se pudo crear"}`)
          continue
        }
        existente = { id: fila.id as string, estado: "no_comenzada" }
        porCodigo.set(codigo, existente)
        creados.push(codigo)
      }

      // 4) Cierre automático cuando el plan ya está ejecutado allá.
      if (ESTADOS_PDA_HECHO.has(pda.estado ?? "") && existente.estado !== "cerrada") {
        const cuando = pda.fecha_ejecucion ? ` el ${fechaLarga(pda.fecha_ejecucion)}` : ""
        const comentario = `Ejecutado en mantenimiento edilicio${cuando} (${codigo}).`
        const { error: errEvid } = await admin
          .from("reuniones_actividades_evidencias")
          .insert({
            actividad_id: existente.id,
            comentario,
            estado_resultante: "cerrada",
            autor_id: profile.id,
          })
        if (errEvid) {
          avisos.push(`${codigo}: ${errEvid.message}`)
          continue
        }
        const completado = pda.fecha_ejecucion
          ? new Date(`${pda.fecha_ejecucion.slice(0, 10)}T12:00:00-03:00`).toISOString()
          : new Date().toISOString()
        const { error: errUpd } = await admin
          .from("reuniones_actividades")
          .update({ estado: "cerrada", completado_at: completado, observaciones: comentario })
          .eq("id", existente.id)
        if (errUpd) {
          avisos.push(`${codigo}: ${errUpd.message}`)
          continue
        }
        existente.estado = "cerrada"
        cerrados.push(codigo)
      }
    }

    if (creados.length || cerrados.length) revalidatePath("/reuniones")
    return {
      data: {
        creados,
        cerrados,
        aviso: avisos.length ? avisos.join(" · ") : undefined,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error inesperado" }
  }
}
