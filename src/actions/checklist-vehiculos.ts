"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  addDays,
  fetchLecturas,
  kmActualPorDominio,
  today,
} from "@/lib/vehiculos/lecturas"
import { validarLectura, type LecturaPrevia } from "@/lib/vehiculos/validar-lectura"
import { fetchPlanesPorRespuesta } from "@/lib/vehiculos/planes-checklist"
import type { PlanResumen } from "@/lib/vehiculos/tiempo-resolucion"
import type {
  ChecklistItem,
  ChecklistVehiculo,
  ChecklistVehiculoConRespuestas,
  TipoChecklist,
  ResultadoChecklist,
  TiempoRutaSemanal,
  TiempoRutaMensual,
} from "@/types/database"

const TIEMPO_RUTA_META_MINUTOS = 480 // 8 horas

// Corte horario (hora local Argentina) que define el tipo de checklist:
// antes de las 09:00 → liberación (salida del depósito); 09:00 o después →
// retorno (entrada al depósito). El chofer ya no elige el tipo; se deriva de
// la hora para que los km (odómetro retorno − liberación), el tiempo en ruta y
// el estado de la flota se calculen siempre con la clasificación correcta.
const HORA_CORTE_LIBERACION = 9

// Hasta esta hora (AR) un checklist de una unidad que todavía no salió del
// depósito puede ser una salida hecha tarde, no una entrada. El chofer que
// cruza las 09:00 llenando el form quedaba registrado como retorno: el camión
// figuraba sin salida del día y sin tiempo en ruta. Pasada esta hora ya no se
// ofrece la opción (una salida a las 11 sería un caso raro y a mano).
const HORA_LIMITE_SALIDA_TARDIA = 11

/** Hora del día (0-23) en zona horaria de Argentina para una fecha dada. */
function horaArgentina(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "numeric",
    hour12: false,
    hourCycle: "h23",
  })
  return Number(fmt.format(d))
}

/** Tipo de checklist según la hora local AR del momento de registro. */
function tipoChecklistPorHora(d: Date): TipoChecklist {
  return horaArgentina(d) < HORA_CORTE_LIBERACION ? "liberacion" : "retorno"
}

/** "HH:MM" en hora argentina, para los avisos al chofer. */
function horaHHMM(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

/** Checklist ya cargado hoy para una unidad (para avisar antes de repetirlo). */
export interface ChecklistDelDia {
  id: string
  dominio: string
  tipo: TipoChecklist
  chofer: string
  hora: string
}

/**
 * Checklists ya registrados en una fecha. El form los usa para avisar apenas se
 * elige la unidad que el control ya está hecho, en vez de dejar que el chofer
 * complete los 30 ítems y recién ahí frenarlo al guardar.
 */
export async function getChecklistsDeFecha(
  fecha: string
): Promise<ChecklistDelDia[]> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("checklist_vehiculos")
      .select("id, dominio, tipo, chofer, hora")
      .eq("fecha", fecha)
      .order("hora", { ascending: false })
    if (error) return []
    return (data || []) as ChecklistDelDia[]
  } catch {
    // Query tolerante: si falla, el form se carga igual. La validación firme
    // corre en el servidor al registrar.
    return []
  }
}

// ==================== ITEMS ====================

export async function getChecklistItems(): Promise<
  { data: ChecklistItem[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("active", true)
      .order("orden")
    if (error) return { error: error.message }
    return { data: (data || []) as ChecklistItem[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Última lectura conocida de una unidad (checklist + registros + combustible),
 * ya filtrada de outliers por `kmActualPorDominio`. Ventana de 120 días: si la
 * unidad estuvo parada más que eso, se valida como si fuera la primera lectura.
 */
export async function getUltimaLectura(
  dominio: string
): Promise<{ data: LecturaPrevia | null } | { error: string }> {
  try {
    await requireAuth()
    const dom = dominio.trim().toUpperCase()
    const lecturas = await fetchLecturas({
      dominio: dom,
      fechaDesde: addDays(today(), -120),
    })
    const previa = kmActualPorDominio(lecturas).get(dom) ?? null
    return { data: previa }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Todas las últimas lecturas de la flota, para validar en el form sin ida y vuelta. */
export async function getUltimasLecturasFlota(): Promise<
  Record<string, LecturaPrevia>
> {
  try {
    await requireAuth()
    const lecturas = await fetchLecturas({ fechaDesde: addDays(today(), -120) })
    const map = kmActualPorDominio(lecturas)
    const out: Record<string, LecturaPrevia> = {}
    for (const [dom, v] of map) out[dom] = v
    return out
  } catch {
    // Query tolerante: si falla, el checklist se sigue pudiendo cargar (la
    // validación firme corre igual en el servidor al guardar).
    return {}
  }
}

// ==================== CREAR CHECKLIST ====================

interface CreateChecklistInput {
  fecha: string
  dominio: string
  chofer: string
  odometro?: number
  observaciones?: string
  iniciadoEn?: string // ISO del momento en que se abrió el form
  duracionSegundos?: number // duración de llenado medida en el cliente
  fotoPath?: string // storage path en el bucket checklist-vehiculos (la sube el cliente)
  /** El chofer confirmó que el control repetido es legítimo (segunda vuelta / cambio de turno). */
  confirmarDuplicado?: boolean
  /**
   * El chofer eligió en el form que esto es la salida, aunque la hora ya diga
   * retorno (salida hecha tarde). Sólo se respeta si es plausible: antes de las
   * 11 y con la unidad sin liberación registrada ese día.
   */
  tipoForzado?: TipoChecklist
  respuestas: { item_id: string; valor: string; comentario?: string }[]
}

/**
 * Por qué se frenó el registro:
 * - `retorno_repetido`: la unidad ya volvió al depósito hoy (puede ser 2ª vuelta).
 * - `otro_turno`: control único (autoelevador/camioneta) que ya cargó otra
 *   persona — el cambio de turno del autoelevador es un caso real.
 */
export type MotivoDuplicado = "retorno_repetido" | "otro_turno"

/** Checklist previo del día que choca con el que se está por registrar. */
export interface ChecklistDuplicado {
  id: string
  dominio: string
  tipo: TipoChecklist
  chofer: string
  hora: string
  motivo: MotivoDuplicado
}

export async function createChecklist(
  input: CreateChecklistInput
): Promise<
  | { data: ChecklistVehiculo }
  | { error: string }
  | { duplicado: ChecklistDuplicado }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const now = new Date()
    const dominioNorm = input.dominio.trim().toUpperCase()

    // Los autoelevadores se chequean una sola vez, al inicio de la jornada (no
    // tienen checklist de retorno), así que su registro es SIEMPRE liberación sin
    // importar la hora. Las camionetas también son un control único del día
    // (registro de km + estado general, sin salida/entrada). Para el resto, el
    // tipo se deriva de la hora del registro (mismo instante que se guarda en
    // `hora`): antes de las 09:00 AR es salida (liberación), después es entrada
    // (retorno).
    const { data: veh } = await supabase
      .from("catalogo_vehiculos")
      .select("tipo")
      .eq("dominio", dominioNorm)
      .maybeSingle()
    const esControlUnico = veh?.tipo === "autoelevador" || veh?.tipo === "camioneta"
    let tipo: TipoChecklist = esControlUnico
      ? "liberacion"
      : tipoChecklistPorHora(now)

    // Salida hecha tarde: el chofer arrancó el checklist antes de las 09:00 (o
    // llegó tarde a hacerlo) y el corte horario se lo guardaba como entrada, con
    // lo cual el camión quedaba sin salida del día y sin tiempo en ruta. El form
    // le pregunta qué está registrando; acá se acepta la respuesta sólo si es
    // plausible — todavía temprano y sin liberación cargada para esa unidad.
    if (
      !esControlUnico &&
      tipo === "retorno" &&
      input.tipoForzado === "liberacion" &&
      horaArgentina(now) < HORA_LIMITE_SALIDA_TARDIA
    ) {
      const { count } = await supabase
        .from("checklist_vehiculos")
        .select("id", { count: "exact", head: true })
        .eq("dominio", dominioNorm)
        .eq("fecha", input.fecha)
        .eq("tipo", "liberacion")
      if (!count) tipo = "liberacion"
      else {
        // Alguien cargó la salida mientras este chofer llenaba el form. No se
        // guarda como entrada porque los ítems contestados son los de la
        // salida (la llave, por ejemplo, no se pregunta en el retorno).
        return {
          error: `${dominioNorm} ya tiene el checklist de salida de hoy, lo cargaron mientras completabas este. Si además volvió al depósito, entrá de nuevo y registrá la entrada.`,
        }
      }
    }

    // 🚨 Una unidad no puede tener dos veces el mismo checklist en el día. Pasó
    // que un chofer volvió a entrar al form y lo cargó de nuevo: el duplicado
    // infla la adherencia, mete km repetidos y descoloca el tiempo en ruta (que
    // se mide contra la ÚLTIMA liberación del día). La salida se rechaza sin
    // más — es imposible que un camión salga dos veces del depósito antes de
    // las 09:00. El retorno puede ser una segunda vuelta real, así que se avisa
    // y el chofer decide.
    const { data: previos } = await supabase
      .from("checklist_vehiculos")
      .select("id, dominio, tipo, chofer, hora")
      .eq("dominio", dominioNorm)
      .eq("fecha", input.fecha)
      .eq("tipo", tipo)
      .order("hora", { ascending: false })
      .limit(1)

    const previo = (previos || [])[0] as Omit<ChecklistDuplicado, "motivo"> | undefined
    if (previo) {
      const quien = previo.chofer?.trim() || "otro chofer"
      const choferNorm = input.chofer.trim().toUpperCase()
      // En el autoelevador el control se repite de verdad: cada maquinista
      // chequea la máquina al entrar de turno. Si el que carga es OTRO, se le
      // pide confirmar; si es el mismo dos veces, es error y se rechaza.
      const esOtroTurno =
        esControlUnico && previo.chofer?.trim().toUpperCase() !== choferNorm

      if (tipo === "liberacion" && !esOtroTurno) {
        return {
          error: esControlUnico
            ? `${dominioNorm} ya tiene tu control de hoy: lo cargaste a las ${horaHHMM(previo.hora)}. Si hay algo mal, pedile a un supervisor que lo corrija.`
            : `${dominioNorm} ya tiene el checklist de salida de hoy: lo cargó ${quien} a las ${horaHHMM(previo.hora)}. No hace falta hacerlo de nuevo.`,
        }
      }
      if (!input.confirmarDuplicado) {
        return {
          duplicado: {
            ...previo,
            motivo: esOtroTurno ? "otro_turno" : "retorno_repetido",
          },
        }
      }
    }

    // El control único existe para registrar la lectura (horómetro en el
    // autoelevador, km en la camioneta): sin ella el vehículo figura "sin
    // movimiento" y las horas/km del período no se pueden calcular.
    if (esControlUnico && !input.odometro) {
      return {
        error:
          veh?.tipo === "autoelevador"
            ? "Falta el horómetro: cargá las horas que marca el autoelevador."
            : "Faltan los km: cargá el odómetro de la camioneta.",
      }
    }

    // 🚨 Lectura mal tipeada: se rechaza ANTES de guardar. Un dígito de más
    // queda pegado como "km actual" de la unidad y desde ahí el módulo de
    // Neumáticos calcula km rodados absurdos y marca las cubiertas en rojo.
    if (input.odometro != null) {
      const lecturas = await fetchLecturas({
        dominio: dominioNorm,
        fechaDesde: addDays(input.fecha, -120),
        fechaHasta: input.fecha,
      })
      const previa = kmActualPorDominio(lecturas).get(dominioNorm) ?? null
      const errorLectura = validarLectura({
        valor: input.odometro,
        previa,
        fecha: input.fecha,
        esHorometro: veh?.tipo === "autoelevador",
      })
      if (errorLectura) return { error: errorLectura }
    }

    // Fetch items to determine criticality
    const { data: items } = await supabase
      .from("checklist_items")
      .select("id, critico, tipo_check")
      .eq("active", true)

    type ItemMeta = { id: string; critico: boolean; tipo_check: TipoChecklist | null }
    const criticosMap = new Map(
      (items || []).map((i: ItemMeta) => [i.id, i.critico])
    )
    const tipoCheckMap = new Map(
      (items || []).map((i: ItemMeta) => [i.id, i.tipo_check ?? null])
    )

    // El cliente arma la lista de ítems con la hora de cuando abrió el form, y
    // acá el tipo se recalcula en firme con la hora del envío. Si cruzó las
    // 09:00 con el form abierto puede llegar una respuesta de un ítem que solo
    // corresponde al otro momento del día (la llave, por ejemplo): se descarta
    // para no guardarla contra un checklist donde nunca se pregunta.
    const respuestas = input.respuestas.filter((r) => {
      const tc = tipoCheckMap.get(r.item_id)
      return tc == null || tc === tipo
    })

    // Determine resultado: if any critical item is "nook" or "malo" → rechazado
    let resultado: ResultadoChecklist = "aprobado"
    for (const r of respuestas) {
      const esCritico = criticosMap.get(r.item_id)
      if (esCritico && (r.valor === "nook" || r.valor === "malo")) {
        resultado = "rechazado"
        break
      }
    }

    // Calculate tiempo_ruta_minutos for retorno
    let tiempoRutaMinutos: number | null = null
    if (tipo === "retorno") {
      // Find the liberacion checklist for same vehicle + same day
      const { data: liberacion } = await supabase
        .from("checklist_vehiculos")
        .select("hora")
        .eq("tipo", "liberacion")
        .eq("dominio", dominioNorm)
        .eq("fecha", input.fecha)
        .order("hora", { ascending: false })
        .limit(1)
        .single()

      if (liberacion) {
        const horaLib = new Date(liberacion.hora).getTime()
        const horaRet = now.getTime()
        tiempoRutaMinutos = Math.round((horaRet - horaLib) / 60000)
      }
    }

    // Insert checklist header
    const { data: checklist, error: chkError } = await supabase
      .from("checklist_vehiculos")
      .insert({
        tipo,
        fecha: input.fecha,
        dominio: dominioNorm,
        chofer: input.chofer.trim().toUpperCase(),
        hora: now.toISOString(),
        resultado,
        observaciones: input.observaciones?.trim() || null,
        tiempo_ruta_minutos: tiempoRutaMinutos,
        odometro: input.odometro || null,
        iniciado_en: input.iniciadoEn || null,
        duracion_segundos: input.duracionSegundos ?? null,
        // Solo incluir la key si hay foto: el tenant Misiones no tiene la
        // columna foto_path y el insert fallaría con la key presente.
        ...(input.fotoPath ? { foto_path: input.fotoPath } : {}),
        created_by: profile.id,
      })
      .select()
      .single()

    if (chkError) return { error: chkError.message }

    // Insert responses
    const respuestasToInsert = respuestas.map((r) => ({
      checklist_id: checklist.id,
      item_id: r.item_id,
      valor: r.valor,
      comentario: r.comentario?.trim() || null,
    }))

    const { error: respError } = await supabase
      .from("checklist_respuestas")
      .insert(respuestasToInsert)

    if (respError) return { error: respError.message }

    return { data: checklist as ChecklistVehiculo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== LISTAR CHECKLISTS ====================

interface ChecklistFilter {
  tipo?: TipoChecklist
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
  chofer?: string
  resultado?: ResultadoChecklist
  limit?: number
}

export async function getChecklists(
  filters?: ChecklistFilter
): Promise<{ data: ChecklistVehiculo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("checklist_vehiculos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false })

    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.chofer) query = query.eq("chofer", filters.chofer)
    if (filters?.resultado) query = query.eq("resultado", filters.resultado)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as ChecklistVehiculo[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DETALLE CHECKLIST ====================

export async function getChecklistDetalle(
  id: string
): Promise<{ data: ChecklistVehiculoConRespuestas } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: checklist, error: chkError } = await supabase
      .from("checklist_vehiculos")
      .select("*")
      .eq("id", id)
      .single()

    if (chkError) return { error: chkError.message }

    const { data: respuestas, error: respError } = await supabase
      .from("checklist_respuestas")
      .select("*, item:checklist_items(*)")
      .eq("checklist_id", id)
      .order("created_at")

    if (respError) return { error: respError.message }

    // Plan de acción de cada ítem observado: es lo que le muestra al chofer que
    // el foco se resolvió, y con qué tiempo de respuesta.
    const respIds = (respuestas || []).map((r: { id: string }) => r.id)
    const horaPorRespuesta = new Map(
      respIds.map((id) => [id, checklist.hora as string]),
    )
    const planes = await fetchPlanesPorRespuesta(supabase, respIds, horaPorRespuesta)

    // URL pública de la foto adjunta (bucket público, igual que roturas-calle)
    const fotoUrl = checklist.foto_path
      ? supabase.storage
          .from("checklist-vehiculos")
          .getPublicUrl(checklist.foto_path).data.publicUrl
      : null

    return {
      data: {
        ...checklist,
        foto_url: fotoUrl,
        respuestas: (respuestas || []).map((r: { id: string }) => ({
          ...r,
          plan: planes.get(r.id) ?? null,
        })),
      } as ChecklistVehiculoConRespuestas,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DELETE CHECKLIST ====================

interface UpdateChecklistInput {
  id: string
  fecha: string
  dominio: string
  chofer: string
  hora: string // HH:MM local → se combina con fecha
  resultado: ResultadoChecklist
  odometro?: number | null
  observaciones?: string | null
  tipo?: TipoChecklist // corrección manual (superv/admin) del tipo salida/entrada
}

export async function updateChecklist(
  input: UpdateChecklistInput,
): Promise<{ data: ChecklistVehiculo } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const horaIso = new Date(`${input.fecha}T${input.hora}:00`).toISOString()
    const dominio = input.dominio.trim().toUpperCase()

    const updateFields: Record<string, unknown> = {
      fecha: input.fecha,
      dominio,
      chofer: input.chofer.trim().toUpperCase(),
      hora: horaIso,
      resultado: input.resultado,
      odometro: input.odometro ?? null,
      observaciones: input.observaciones?.trim() || null,
    }

    // Si se corrige el tipo, recalcular el tiempo en ruta para que no quede
    // incoherente: una liberación no tiene tiempo en ruta; un retorno se mide
    // contra la liberación del mismo vehículo y día.
    if (input.tipo) {
      updateFields.tipo = input.tipo
      if (input.tipo === "liberacion") {
        updateFields.tiempo_ruta_minutos = null
      } else {
        const { data: liberacion } = await supabase
          .from("checklist_vehiculos")
          .select("hora")
          .eq("tipo", "liberacion")
          .eq("dominio", dominio)
          .eq("fecha", input.fecha)
          .neq("id", input.id)
          .order("hora", { ascending: false })
          .limit(1)
          .single()
        updateFields.tiempo_ruta_minutos = liberacion
          ? Math.round(
              (new Date(horaIso).getTime() -
                new Date(liberacion.hora).getTime()) /
                60000,
            )
          : null
      }
    }

    const { data, error } = await supabase
      .from("checklist_vehiculos")
      .update(updateFields)
      .eq("id", input.id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as ChecklistVehiculo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteChecklist(
  id: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("checklist_vehiculos")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ESTADO VEHÍCULOS HOY ====================

export async function getEstadoVehiculosHoy(): Promise<
  {
    data: {
      dominio: string
      descripcion: string | null
      estado: "en_base" | "en_ruta" | "retornado"
      ultimoChecklist: ChecklistVehiculo | null
    }[]
  } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Get all active vehicles
    const { data: vehiculos, error: vehError } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio, descripcion")
      .eq("active", true)
      .order("dominio")

    if (vehError) return { error: vehError.message }

    // Get today's checklists
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: checklistsHoy, error: chkError } = await supabase
      .from("checklist_vehiculos")
      .select("*")
      .eq("fecha", hoy)
      .order("hora", { ascending: false })

    if (chkError) return { error: chkError.message }

    const checklists = (checklistsHoy || []) as ChecklistVehiculo[]

    const result = (vehiculos || []).map((v: { dominio: string; descripcion: string | null }) => {
      const vehiculoChecklists = checklists.filter(
        (c) => c.dominio === v.dominio
      )
      const tieneRetorno = vehiculoChecklists.some((c) => c.tipo === "retorno")
      const tieneLiberacion = vehiculoChecklists.some(
        (c) => c.tipo === "liberacion"
      )

      let estado: "en_base" | "en_ruta" | "retornado" = "en_base"
      if (tieneRetorno) estado = "retornado"
      else if (tieneLiberacion) estado = "en_ruta"

      return {
        dominio: v.dominio,
        descripcion: v.descripcion,
        estado,
        ultimoChecklist: vehiculoChecklists[0] || null,
      }
    })

    return { data: result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== KPIs TIEMPO EN RUTA ====================

export async function getTiempoRutaKpis(filters?: {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
}): Promise<{
  data: {
    totalRetornos: number
    promedioMinutos: number
    promedioHoras: string
    dentroMeta: number
    pctDentroMeta: number
    metaMinutos: number
    semanal: TiempoRutaSemanal[]
    mensual: TiempoRutaMensual[]
  }
} | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("checklist_vehiculos")
      .select("*")
      .eq("tipo", "retorno")
      .not("tiempo_ruta_minutos", "is", null)
      .order("fecha", { ascending: true })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)

    const { data, error } = await query
    if (error) return { error: error.message }

    const registros = (data || []) as ChecklistVehiculo[]

    if (registros.length === 0) {
      return {
        data: {
          totalRetornos: 0,
          promedioMinutos: 0,
          promedioHoras: "0:00",
          dentroMeta: 0,
          pctDentroMeta: 0,
          metaMinutos: TIEMPO_RUTA_META_MINUTOS,
          semanal: [],
          mensual: [],
        },
      }
    }

    const tiempos = registros.map((r) => r.tiempo_ruta_minutos!)
    const totalRetornos = tiempos.length
    const promedioMinutos = Math.round(
      tiempos.reduce((a, b) => a + b, 0) / totalRetornos
    )
    const hh = Math.floor(promedioMinutos / 60)
    const mm = promedioMinutos % 60
    const promedioHoras = `${hh}:${mm.toString().padStart(2, "0")}`
    const dentroMeta = tiempos.filter(
      (t) => t <= TIEMPO_RUTA_META_MINUTOS
    ).length
    const pctDentroMeta = Math.round((dentroMeta / totalRetornos) * 100)

    // Group by week
    const semanalMap = new Map<
      string,
      { tiempos: number[]; year: number; semana: number }
    >()
    for (const r of registros) {
      const date = new Date(r.fecha + "T12:00:00")
      const startOfYear = new Date(date.getFullYear(), 0, 1)
      const diff = date.getTime() - startOfYear.getTime()
      const semana = Math.ceil(
        (diff / 86400000 + startOfYear.getDay() + 1) / 7
      )
      const year = date.getFullYear()
      const key = `${year}-${semana}`
      if (!semanalMap.has(key))
        semanalMap.set(key, { tiempos: [], year, semana })
      semanalMap.get(key)!.tiempos.push(r.tiempo_ruta_minutos!)
    }
    const semanal: TiempoRutaSemanal[] = Array.from(
      semanalMap.values()
    ).map((g) => {
      const dm = g.tiempos.filter(
        (t) => t <= TIEMPO_RUTA_META_MINUTOS
      ).length
      return {
        semana: g.semana,
        year: g.year,
        promedio_minutos: Math.round(
          g.tiempos.reduce((a, b) => a + b, 0) / g.tiempos.length
        ),
        total_retornos: g.tiempos.length,
        dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tiempos.length) * 100),
      }
    })

    // Group by month
    const mensualMap = new Map<
      string,
      { tiempos: number[]; year: number; mes: number }
    >()
    for (const r of registros) {
      const d = new Date(r.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key))
        mensualMap.set(key, { tiempos: [], year, mes })
      mensualMap.get(key)!.tiempos.push(r.tiempo_ruta_minutos!)
    }
    const mensual: TiempoRutaMensual[] = Array.from(
      mensualMap.values()
    ).map((g) => {
      const dm = g.tiempos.filter(
        (t) => t <= TIEMPO_RUTA_META_MINUTOS
      ).length
      return {
        mes: g.mes,
        year: g.year,
        promedio_minutos: Math.round(
          g.tiempos.reduce((a, b) => a + b, 0) / g.tiempos.length
        ),
        total_retornos: g.tiempos.length,
        dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tiempos.length) * 100),
      }
    })

    return {
      data: {
        totalRetornos,
        promedioMinutos,
        promedioHoras,
        dentroMeta,
        pctDentroMeta,
        metaMinutos: TIEMPO_RUTA_META_MINUTOS,
        semanal,
        mensual,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== NOVEDADES DE LA UNIDAD (vista del chofer) ============

/** Un ítem observado por el chofer y en qué quedó (lo que ve al abrir el checklist). */
export interface NovedadUnidad {
  respuestaId: string
  checklistId: string
  fecha: string
  /** Timestamp de carga del checklist: arranque del tiempo de respuesta. */
  hora: string
  dominio: string
  chofer: string | null
  categoria: string
  item: string
  valor: string
  critico: boolean
  comentario: string | null
  plan: PlanResumen | null
}

const VALORES_OBSERVADOS = new Set(["nook", "malo", "regular"])

/**
 * Últimas observaciones no-OK de una unidad, con el estado del plan de acción.
 * Es lo que el chofer ve arriba del checklist: si lo que reportó ya se reparó,
 * qué se hizo y cuánto tardó la respuesta. Sin esto el foco desaparecía de su
 * vista y nunca se enteraba de que se había trabajado.
 */
export async function getNovedadesUnidad(
  dominio: string,
  dias = 30,
): Promise<{ data: NovedadUnidad[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const dom = (dominio || "").trim()
    if (!dom) return { data: [] }

    const desde = addDays(today(), -Math.abs(dias))
    const { data: checks, error: chkErr } = await supabase
      .from("checklist_vehiculos")
      .select("id, fecha, hora, dominio, chofer")
      .eq("dominio", dom)
      .gte("fecha", desde)
      .order("hora", { ascending: false })
      .limit(120)
    if (chkErr) return { error: chkErr.message }
    const cabeceras = (checks || []) as Array<{
      id: string
      fecha: string
      hora: string
      dominio: string
      chofer: string | null
    }>
    if (cabeceras.length === 0) return { data: [] }

    const porId = new Map(cabeceras.map((c) => [c.id, c]))
    const { data: resp, error: respErr } = await supabase
      .from("checklist_respuestas")
      .select("id, checklist_id, valor, comentario, item:checklist_items(nombre, categoria, critico)")
      .in("checklist_id", [...porId.keys()])
    if (respErr) return { error: respErr.message }

    const observadas = ((resp || []) as unknown as Array<{
      id: string
      checklist_id: string
      valor: string
      comentario: string | null
      item: { nombre: string; categoria: string; critico: boolean } | null
    }>).filter(
      (r) => r.item && VALORES_OBSERVADOS.has((r.valor || "").toLowerCase()),
    )
    if (observadas.length === 0) return { data: [] }

    const horaPorRespuesta = new Map(
      observadas.map((r) => [r.id, porId.get(r.checklist_id)!.hora]),
    )
    const planes = await fetchPlanesPorRespuesta(
      supabase,
      observadas.map((r) => r.id),
      horaPorRespuesta,
    )

    const data: NovedadUnidad[] = observadas
      .map((r) => {
        const cab = porId.get(r.checklist_id)!
        return {
          respuestaId: r.id,
          checklistId: r.checklist_id,
          fecha: cab.fecha,
          hora: cab.hora,
          dominio: cab.dominio,
          chofer: cab.chofer,
          categoria: r.item!.categoria,
          item: r.item!.nombre,
          valor: r.valor,
          critico: r.item!.critico,
          comentario: r.comentario,
          plan: planes.get(r.id) ?? null,
        }
      })
      .sort((a, b) => (a.hora < b.hora ? 1 : a.hora > b.hora ? -1 : 0))

    return { data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
