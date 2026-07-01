"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  JuegoConfig,
  EstadoTrivia,
  PreguntaServida,
  SiguienteResultado,
  RespuestaResultado,
  RevisionItem,
  RankingFila,
} from "@/lib/types/trivia"

// ============================================================
// Trivia MERCOSUR — juego de conocimiento diario
//
// Reglas clave:
//  - 10 preguntas por día, IGUALES para todos (un sorteo por fecha).
//  - Toda escritura pasa por acá con el service-role client; las tablas son
//    solo-lectura vía RLS. El servidor sella served_at por pregunta y calcula
//    el tiempo transcurrido con SU reloj → anti-trampa del cronómetro.
//  - Puntaje = puntos_acierto + bonus por velocidad (proporcional al tiempo
//    que sobra del límite). Fuera de tiempo o error = 0.
// ============================================================

const GRACIA_MS = 1500 // margen por latencia de red al puntuar el tiempo

/** Fecha de hoy (YYYY-MM-DD) en horario de Argentina. */
function hoyAR(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

/** Primer día del mes actual (YYYY-MM-01) en horario de Argentina. */
function inicioMesAR(): string {
  return hoyAR().slice(0, 7) + "-01"
}

/** Las opciones vienen como array (jsonb) o string serializado. */
function parseOpciones(opciones: unknown): string[] {
  if (Array.isArray(opciones)) return opciones as string[]
  if (typeof opciones === "string") {
    try {
      const arr = JSON.parse(opciones)
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
  return []
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Admin = ReturnType<typeof createAdminClient>

async function getConfig(admin: Admin): Promise<JuegoConfig> {
  const { data } = await admin.from("juego_config").select("*").eq("id", 1).single()
  return data as JuegoConfig
}

/** Resuelve el empleado del usuario logueado (o null si no está vinculado). */
async function getMiEmpleado(
  admin: Admin
): Promise<{ id: string; nombre: string; sector: string | null } | null> {
  const profile = await requireAuth()
  const { data } = await admin
    .from("empleados")
    .select("id, nombre, sector")
    .eq("profile_id", profile.id)
    .maybeSingle()
  return (data as { id: string; nombre: string; sector: string | null } | null) ?? null
}

/**
 * Obtiene el desafío de hoy o lo crea sorteando N preguntas (mismo set para
 * todos). El upsert con ignoreDuplicates evita que dos usuarios simultáneos
 * generen sets distintos: gana el primero, el resto lee esa fila.
 */
async function getOrCreateDesafioHoy(
  admin: Admin,
  cfg: JuegoConfig
): Promise<{ id: string; fecha: string; pregunta_ids: string[] } | null> {
  const fecha = hoyAR()

  const existente = await admin
    .from("juego_desafios")
    .select("id, fecha, pregunta_ids")
    .eq("fecha", fecha)
    .maybeSingle()
  if (existente.data) return existente.data as { id: string; fecha: string; pregunta_ids: string[] }

  // --- Sorteo ---
  // Capacitaciones visibles y no excluidas.
  const { data: caps } = await admin
    .from("capacitaciones")
    .select("id, visible")
  const capIds = (caps ?? [])
    .filter((c) => c.visible !== false)
    .map((c) => c.id as string)
    .filter((id) => !cfg.capacitaciones_excluidas.includes(id))

  if (capIds.length === 0) return null

  const { data: pregs } = await admin
    .from("capacitacion_preguntas")
    .select("id, opciones, respuesta_correcta")
    .in("capacitacion_id", capIds)

  // Solo preguntas válidas (>=2 opciones y respuesta dentro de rango).
  const validas = (pregs ?? []).filter((p) => {
    const ops = parseOpciones(p.opciones)
    return ops.length >= 2 && p.respuesta_correcta >= 0 && p.respuesta_correcta < ops.length
  })
  if (validas.length === 0) return null

  // No repetir las que salieron en los últimos N días.
  const desdeFecha = new Date()
  desdeFecha.setDate(desdeFecha.getDate() - cfg.dias_sin_repetir)
  const { data: recientes } = await admin
    .from("juego_desafios")
    .select("pregunta_ids")
    .gte("fecha", desdeFecha.toLocaleDateString("en-CA"))
  const usados = new Set<string>(
    (recientes ?? []).flatMap((r) => (r.pregunta_ids as string[]) ?? [])
  )

  let pool = validas.map((p) => p.id as string).filter((id) => !usados.has(id))
  // Si no alcanza tras excluir recientes, se permite repetir para completar.
  if (pool.length < cfg.preguntas_por_dia) pool = validas.map((p) => p.id as string)

  const elegidas = shuffle(pool).slice(0, cfg.preguntas_por_dia)
  if (elegidas.length === 0) return null

  await admin
    .from("juego_desafios")
    .upsert({ fecha, pregunta_ids: elegidas }, { onConflict: "fecha", ignoreDuplicates: true })

  const { data: creado } = await admin
    .from("juego_desafios")
    .select("id, fecha, pregunta_ids")
    .eq("fecha", fecha)
    .single()
  return creado as { id: string; fecha: string; pregunta_ids: string[] }
}

/** Asegura la fila de participación del empleado para el desafío del día. */
async function getOrCreateParticipacion(
  admin: Admin,
  desafioId: string,
  fecha: string,
  empleadoId: string,
  total: number
) {
  await admin
    .from("juego_participaciones")
    .upsert(
      { desafio_id: desafioId, fecha, empleado_id: empleadoId, total },
      { onConflict: "desafio_id,empleado_id", ignoreDuplicates: true }
    )
  const { data } = await admin
    .from("juego_participaciones")
    .select("*")
    .eq("desafio_id", desafioId)
    .eq("empleado_id", empleadoId)
    .single()
  return data as {
    id: string
    puntos: number
    correctas: number
    respondidas: number
    total: number
    tiempo_total_ms: number
    completado_at: string | null
  }
}

/** Mapa pregunta_id → { texto, opciones, respuesta_correcta } para un set. */
async function cargarPreguntas(admin: Admin, ids: string[]) {
  const { data } = await admin
    .from("capacitacion_preguntas")
    .select("id, texto, opciones, respuesta_correcta")
    .in("id", ids)
  const map = new Map<
    string,
    { texto: string; opciones: string[]; respuesta_correcta: number }
  >()
  for (const p of data ?? []) {
    map.set(p.id as string, {
      texto: p.texto as string,
      opciones: parseOpciones(p.opciones),
      respuesta_correcta: p.respuesta_correcta as number,
    })
  }
  return map
}

/**
 * Determina y sirve la pregunta actual (primera sin responder, en orden).
 * Si ya estaba servida pero sin responder, la re-sirve con su served_at
 * original (el cronómetro no se reinicia). Devuelve null si están todas.
 */
async function servirPreguntaActual(
  admin: Admin,
  cfg: JuegoConfig,
  desafio: { id: string; pregunta_ids: string[] },
  participacionId: string,
  empleadoId: string,
  preguntasMap: Map<string, { texto: string; opciones: string[]; respuesta_correcta: number }>
): Promise<PreguntaServida | null> {
  const { data: respuestas } = await admin
    .from("juego_respuestas")
    .select("pregunta_id, orden, served_at, answered_at")
    .eq("participacion_id", participacionId)
  const porPregunta = new Map<string, { served_at: string; answered_at: string | null }>()
  for (const r of respuestas ?? []) {
    porPregunta.set(r.pregunta_id as string, {
      served_at: r.served_at as string,
      answered_at: (r.answered_at as string | null) ?? null,
    })
  }

  const total = desafio.pregunta_ids.length
  for (let orden = 0; orden < total; orden++) {
    const pid = desafio.pregunta_ids[orden]
    const meta = preguntasMap.get(pid)
    if (!meta) continue
    const existente = porPregunta.get(pid)
    if (existente && existente.answered_at) continue // ya respondida

    let servedAt = existente?.served_at
    if (!existente) {
      // Servir por primera vez: sella served_at con el reloj del server.
      await admin.from("juego_respuestas").upsert(
        {
          participacion_id: participacionId,
          desafio_id: desafio.id,
          empleado_id: empleadoId,
          pregunta_id: pid,
          orden,
        },
        { onConflict: "participacion_id,pregunta_id", ignoreDuplicates: true }
      )
      const { data: row } = await admin
        .from("juego_respuestas")
        .select("served_at")
        .eq("participacion_id", participacionId)
        .eq("pregunta_id", pid)
        .single()
      servedAt = row?.served_at as string
    }

    return {
      id: pid,
      orden,
      total,
      texto: meta.texto,
      opciones: meta.opciones,
      servedAtISO: servedAt!,
      serverNowISO: new Date().toISOString(),
      tiempoLimiteSeg: cfg.tiempo_limite_seg,
    }
  }
  return null
}

/** Recalcula el resumen de una participación a partir de sus respuestas. */
async function recomputarParticipacion(admin: Admin, participacionId: string, total: number) {
  const { data: rows } = await admin
    .from("juego_respuestas")
    .select("es_correcta, puntos, tiempo_ms, answered_at")
    .eq("participacion_id", participacionId)
  const respondidas = (rows ?? []).filter((r) => r.answered_at).length
  const correctas = (rows ?? []).filter((r) => r.es_correcta).length
  const puntos = (rows ?? []).reduce((s, r) => s + ((r.puntos as number) ?? 0), 0)
  const tiempo = (rows ?? []).reduce((s, r) => s + ((r.tiempo_ms as number) ?? 0), 0)
  const completado = respondidas >= total
  await admin
    .from("juego_participaciones")
    .update({
      puntos,
      correctas,
      respondidas,
      tiempo_total_ms: tiempo,
      completado_at: completado ? new Date().toISOString() : null,
    })
    .eq("id", participacionId)
  return { puntos, correctas, respondidas, tiempo_total_ms: tiempo, completado }
}

/** Posición del empleado en el ranking del mes (o null si no jugó). */
async function posicionMes(admin: Admin, empleadoId: string): Promise<number | null> {
  const filas = await calcularRanking(admin, "mes", empleadoId)
  const yo = filas.find((f) => f.empleadoId === empleadoId)
  return yo ? yo.posicion : null
}

/** Arma la revisión (para la pantalla de resultado del día). */
async function armarRevision(
  admin: Admin,
  desafio: { pregunta_ids: string[] },
  participacionId: string,
  preguntasMap: Map<string, { texto: string; opciones: string[]; respuesta_correcta: number }>
): Promise<RevisionItem[]> {
  const { data: rows } = await admin
    .from("juego_respuestas")
    .select("pregunta_id, respuesta_elegida, es_correcta, puntos")
    .eq("participacion_id", participacionId)
  const porPregunta = new Map(rows?.map((r) => [r.pregunta_id as string, r]) ?? [])
  return desafio.pregunta_ids
    .map((pid) => {
      const meta = preguntasMap.get(pid)
      if (!meta) return null
      const r = porPregunta.get(pid)
      return {
        texto: meta.texto,
        opciones: meta.opciones,
        respuestaCorrecta: meta.respuesta_correcta,
        respuestaElegida: (r?.respuesta_elegida as number | null) ?? null,
        esCorrecta: (r?.es_correcta as boolean) ?? false,
        puntos: (r?.puntos as number) ?? 0,
      } as RevisionItem
    })
    .filter((x): x is RevisionItem => x !== null)
}

// ============================================================
// Acciones públicas
// ============================================================

/**
 * Estado del desafío de hoy para el empleado logueado. NO sirve preguntas
 * (no arranca ningún cronómetro): eso lo hace servirSiguiente() cuando el
 * empleado pide ver la pregunta.
 */
export async function getEstadoHoy(): Promise<EstadoTrivia> {
  const admin = createAdminClient()
  const cfg = await getConfig(admin)
  if (!cfg.activo) return { estado: "sin_preguntas" }

  const empleado = await getMiEmpleado(admin)
  if (!empleado)
    return { estado: "error", mensaje: "Tu usuario no está vinculado a un empleado." }

  const desafio = await getOrCreateDesafioHoy(admin, cfg)
  if (!desafio || desafio.pregunta_ids.length === 0) return { estado: "sin_preguntas" }

  const part = await getOrCreateParticipacion(
    admin,
    desafio.id,
    desafio.fecha,
    empleado.id,
    desafio.pregunta_ids.length
  )

  const terminado = part.completado_at != null || part.respondidas >= part.total
  if (terminado) {
    if (!part.completado_at) await recomputarParticipacion(admin, part.id, part.total)
    const preguntasMap = await cargarPreguntas(admin, desafio.pregunta_ids)
    const revision = await armarRevision(admin, desafio, part.id, preguntasMap)
    return {
      estado: "completado",
      resumen: {
        puntos: part.puntos,
        correctas: part.correctas,
        total: part.total,
        tiempoTotalMs: part.tiempo_total_ms,
      },
      posicionMes: await posicionMes(admin, empleado.id),
      revision,
    }
  }

  return {
    estado: "jugando",
    respondidas: part.respondidas,
    total: part.total,
    puntosAcum: part.puntos,
  }
}

/**
 * Sirve la pregunta actual (la primera sin responder). Sella served_at con el
 * reloj del servidor la primera vez → el cronómetro arranca acá, no al cargar
 * la página. Devuelve { fin: true } cuando ya no quedan preguntas.
 */
export async function servirSiguiente(): Promise<SiguienteResultado> {
  const admin = createAdminClient()
  const cfg = await getConfig(admin)
  const empleado = await getMiEmpleado(admin)
  if (!empleado) return { error: "Tu usuario no está vinculado a un empleado." }

  const desafio = await getOrCreateDesafioHoy(admin, cfg)
  if (!desafio) return { error: "No hay desafío disponible." }

  const preguntasMap = await cargarPreguntas(admin, desafio.pregunta_ids)
  const part = await getOrCreateParticipacion(
    admin,
    desafio.id,
    desafio.fecha,
    empleado.id,
    desafio.pregunta_ids.length
  )

  const pregunta = await servirPreguntaActual(
    admin,
    cfg,
    desafio,
    part.id,
    empleado.id,
    preguntasMap
  )
  if (!pregunta) {
    await recomputarParticipacion(admin, part.id, part.total)
    return { fin: true }
  }
  return { ok: true, ...pregunta }
}

/**
 * Responde la pregunta servida. `opcionElegida` = null significa que se venció
 * el tiempo sin responder. El puntaje se calcula con el reloj del servidor.
 * NO sirve la siguiente pregunta (eso lo hace servirSiguiente): así el reloj
 * de la próxima no corre mientras el empleado mira el feedback.
 */
export async function responder(
  preguntaId: string,
  opcionElegida: number | null
): Promise<RespuestaResultado | { error: string }> {
  const admin = createAdminClient()
  const cfg = await getConfig(admin)
  const empleado = await getMiEmpleado(admin)
  if (!empleado) return { error: "Tu usuario no está vinculado a un empleado." }

  const desafio = await getOrCreateDesafioHoy(admin, cfg)
  if (!desafio) return { error: "No hay desafío disponible." }

  const { data: part } = await admin
    .from("juego_participaciones")
    .select("id, total, completado_at")
    .eq("desafio_id", desafio.id)
    .eq("empleado_id", empleado.id)
    .maybeSingle()
  if (!part) return { error: "No iniciaste el desafío de hoy." }

  const { data: row } = await admin
    .from("juego_respuestas")
    .select("id, served_at, answered_at, pregunta_id")
    .eq("participacion_id", part.id)
    .eq("pregunta_id", preguntaId)
    .maybeSingle()
  if (!row) return { error: "Esa pregunta no fue servida." }

  const preguntasMap = await cargarPreguntas(admin, desafio.pregunta_ids)
  const meta = preguntasMap.get(preguntaId)
  if (!meta) return { error: "Pregunta inválida." }

  // Si ya estaba respondida, no re-puntuamos (idempotente).
  if (!row.answered_at) {
    const elapsed = Date.now() - new Date(row.served_at as string).getTime()
    const limiteMs = cfg.tiempo_limite_seg * 1000
    const dentroDeTiempo = elapsed <= limiteMs + GRACIA_MS
    const efectivo = Math.min(Math.max(elapsed, 0), limiteMs)
    const fraccionRestante = Math.max(0, (limiteMs - efectivo) / limiteMs)

    let correcta = false
    let puntos = 0
    if (opcionElegida !== null && dentroDeTiempo) {
      correcta = opcionElegida === meta.respuesta_correcta
      if (correcta) {
        puntos = cfg.puntos_acierto + Math.round(cfg.bonus_velocidad_max * fraccionRestante)
      }
    }

    await admin
      .from("juego_respuestas")
      .update({
        respuesta_elegida: opcionElegida,
        es_correcta: correcta,
        tiempo_ms: Math.min(Math.max(elapsed, 0), limiteMs + GRACIA_MS),
        puntos,
        answered_at: new Date().toISOString(),
      })
      .eq("id", row.id as string)
      .is("answered_at", null) // guard anti doble-respuesta
  }

  const resumen = await recomputarParticipacion(admin, part.id as string, part.total as number)

  // Puntos/acierto tal como quedaron guardados para esta pregunta.
  const { data: rowFinal } = await admin
    .from("juego_respuestas")
    .select("puntos, es_correcta, respuesta_elegida")
    .eq("id", row.id as string)
    .single()

  const base: RespuestaResultado = {
    ok: true,
    correcta: (rowFinal?.es_correcta as boolean) ?? false,
    respuestaCorrecta: meta.respuesta_correcta,
    tuOpcion: (rowFinal?.respuesta_elegida as number | null) ?? null,
    puntos: (rowFinal?.puntos as number) ?? 0,
    esUltima: resumen.completado,
  }

  if (resumen.completado) {
    base.resumen = {
      puntos: resumen.puntos,
      correctas: resumen.correctas,
      total: part.total as number,
      tiempoTotalMs: resumen.tiempo_total_ms,
    }
    base.posicionMes = await posicionMes(admin, empleado.id)
    base.revision = await armarRevision(admin, desafio, part.id as string, preguntasMap)
  }

  return base
}

// ============================================================
// Ranking
// ============================================================

async function calcularRanking(
  admin: Admin,
  periodo: "mes" | "historico",
  miEmpleadoId: string | null
): Promise<RankingFila[]> {
  let q = admin
    .from("juego_participaciones")
    .select("empleado_id, puntos, correctas, empleados(nombre, sector, activo)")
  if (periodo === "mes") q = q.gte("fecha", inicioMesAR())

  const { data } = await q
  const acc = new Map<
    string,
    { nombre: string; sector: string | null; activo: boolean; puntos: number; correctas: number; dias: number }
  >()
  for (const r of data ?? []) {
    const emp = r.empleados as unknown as {
      nombre: string
      sector: string | null
      activo: boolean
    } | null
    if (!emp) continue
    const id = r.empleado_id as string
    const cur =
      acc.get(id) ??
      { nombre: emp.nombre, sector: emp.sector, activo: emp.activo, puntos: 0, correctas: 0, dias: 0 }
    cur.puntos += (r.puntos as number) ?? 0
    cur.correctas += (r.correctas as number) ?? 0
    cur.dias += 1
    acc.set(id, cur)
  }

  const filas = [...acc.entries()]
    .filter(([, v]) => v.activo !== false)
    .map(([empleadoId, v]) => ({
      empleadoId,
      nombre: v.nombre,
      sector: v.sector,
      puntos: v.puntos,
      correctas: v.correctas,
      dias: v.dias,
      posicion: 0,
      esYo: empleadoId === miEmpleadoId,
    }))
    .sort((a, b) => b.puntos - a.puntos || b.correctas - a.correctas)

  filas.forEach((f, i) => (f.posicion = i + 1))
  return filas
}

export async function getRanking(
  periodo: "mes" | "historico"
): Promise<{ filas: RankingFila[]; miEmpleadoId: string | null }> {
  const admin = createAdminClient()
  const empleado = await getMiEmpleado(admin)
  const filas = await calcularRanking(admin, periodo, empleado?.id ?? null)
  return { filas, miEmpleadoId: empleado?.id ?? null }
}

// ============================================================
// Admin: configuración y estadísticas
// ============================================================

export async function getConfigTrivia(): Promise<{
  config: JuegoConfig
  capacitaciones: { id: string; titulo: string }[]
  participacionHoy: { jugaron: number; empleadosActivos: number }
}> {
  await requireRole(["admin", "auditor", "admin_rrhh"])
  const admin = createAdminClient()
  const config = await getConfig(admin)

  const { data: caps } = await admin
    .from("capacitaciones")
    .select("id, titulo")
    .order("titulo")

  const { count: empleadosActivos } = await admin
    .from("empleados")
    .select("id", { count: "exact", head: true })
    .neq("activo", false)

  const { count: jugaron } = await admin
    .from("juego_participaciones")
    .select("id", { count: "exact", head: true })
    .eq("fecha", hoyAR())
    .not("completado_at", "is", null)

  return {
    config,
    capacitaciones: (caps ?? []) as { id: string; titulo: string }[],
    participacionHoy: {
      jugaron: jugaron ?? 0,
      empleadosActivos: empleadosActivos ?? 0,
    },
  }
}

export async function updateConfigTrivia(input: {
  tiempo_limite_seg: number
  puntos_acierto: number
  bonus_velocidad_max: number
  preguntas_por_dia: number
  dias_sin_repetir: number
  capacitaciones_excluidas: string[]
  activo: boolean
}): Promise<{ ok: true } | { error: string }> {
  await requireRole(["admin", "auditor", "admin_rrhh"])
  const admin = createAdminClient()

  // Saneamiento básico.
  const tiempo = Math.max(5, Math.min(120, Math.round(input.tiempo_limite_seg)))
  const porDia = Math.max(1, Math.min(20, Math.round(input.preguntas_por_dia)))

  const { error } = await admin
    .from("juego_config")
    .update({
      tiempo_limite_seg: tiempo,
      puntos_acierto: Math.max(0, Math.round(input.puntos_acierto)),
      bonus_velocidad_max: Math.max(0, Math.round(input.bonus_velocidad_max)),
      preguntas_por_dia: porDia,
      dias_sin_repetir: Math.max(0, Math.round(input.dias_sin_repetir)),
      capacitaciones_excluidas: input.capacitaciones_excluidas ?? [],
      activo: input.activo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)

  if (error) return { error: error.message }
  return { ok: true }
}
