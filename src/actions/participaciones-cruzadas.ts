"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { CAMPOS_FOTO_CRUCE } from "@/lib/participacion-cruzada-fotos"
import type {
  ParticipacionCruzada,
  ParticipacionCruzadaSentido,
} from "@/types/database"

const BUCKET = "reuniones"
const REVALIDATE_PATH = "/reuniones"
/** Igual que el resto del módulo de reuniones (y que las policies de la tabla). */
const ROLES_EDITORES = ["admin", "supervisor", "admin_rrhh"]

type Result<T> = { data: T } | { error: string }

async function requireEditor() {
  const profile = await requireAuth()
  if (!ROLES_EDITORES.includes(profile.role)) {
    throw new Error("No tenés permiso para editar reuniones")
  }
  return profile
}

function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
}

/**
 * Fotos que vienen en el form, agrupadas por categoría. Cada input es
 * `multiple`, así que se pueden subir varias de cada tipo. `foto` (sin
 * categoría) se sigue aceptando por los formularios viejos.
 */
type FotosDelForm = { subcarpeta: string; archivos: File[] }[]

function fotosDelForm(formData: FormData): FotosDelForm {
  const grupos: FotosDelForm = CAMPOS_FOTO_CRUCE.map(({ campo, categoria }) => ({
    subcarpeta: `${categoria}/`,
    archivos: formData
      .getAll(campo)
      .filter((f): f is File => f instanceof File && f.size > 0),
  }))
  grupos.push({
    subcarpeta: "",
    archivos: formData
      .getAll("foto")
      .filter((f): f is File => f instanceof File && f.size > 0),
  })
  return grupos.filter((g) => g.archivos.length > 0)
}

function contarFotos(grupos: FotosDelForm): number {
  return grupos.reduce((n, g) => n + g.archivos.length, 0)
}

/**
 * Sube las fotos al bucket privado y devuelve sus paths. La categoría queda en
 * la ruta (`cruces/<id>/tema/...`) para poder etiquetarlas al mostrarlas.
 */
async function subirFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  grupos: FotosDelForm,
): Promise<{ paths: string[] } | { error: string }> {
  const paths: string[] = []
  for (const { subcarpeta, archivos } of grupos) {
    for (const file of archivos) {
      const path = `cruces/${id}/${subcarpeta}${Date.now()}-${cleanFileName(file.name)}`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, await file.arrayBuffer(), {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (error) {
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
        return { error: `Subiendo la foto: ${error.message}` }
      }
      paths.push(path)
    }
  }
  return { paths }
}

export async function listParticipacionesCruzadas(
  anio?: number,
): Promise<Result<ParticipacionCruzada[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const year = anio ?? new Date().getFullYear()

    // Son pocas filas por año (una por mes o quincena): se traen todas y se
    // filtra acá. Un `.or()` con dos rangos en PostgREST es más frágil que útil.
    const { data, error } = await supabase
      .from("participaciones_cruzadas")
      .select("*")
      .order("fecha_plan", { ascending: true, nullsFirst: false })

    if (error) return { error: error.message }

    const desde = `${year}-01-01`
    const hasta = `${year}-12-31`
    const filas = ((data ?? []) as ParticipacionCruzada[]).filter((c) => {
      const f = c.fecha_real ?? c.fecha_plan
      return !!f && f >= desde && f <= hasta
    })
    return { data: filas }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error listando cruces",
    }
  }
}

/** La participación cruzada de una reunión puntual (para el detalle). */
export async function getParticipacionCruzadaDeReunion(
  reunionId: string,
): Promise<Result<ParticipacionCruzada | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("participaciones_cruzadas")
      .select("*")
      .eq("reunion_id", reunionId)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data ?? null) as ParticipacionCruzada | null }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error leyendo el cruce",
    }
  }
}

/**
 * Marca una reunión de la app como participación cruzada. La foto es la
 * evidencia: sin foto no se marca.
 */
export async function marcarReunionComoCruzada(
  formData: FormData,
): Promise<Result<ParticipacionCruzada>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const sentido = String(formData.get("sentido") ?? "").trim()
    const participantes = String(formData.get("participantes") ?? "").trim()
    const minuta = String(formData.get("minuta") ?? "").trim() || null
    const destino = String(formData.get("destino") ?? "").trim() || null
    const tema = String(formData.get("tema") ?? "").trim() || null
    const fecha_real = String(formData.get("fecha_real") ?? "").trim()
    const plan_id = String(formData.get("plan_id") ?? "").trim() || null

    if (!reunion_id) return { error: "Falta la reunión" }
    if (!["ventas_a_operaciones", "operaciones_a_ventas"].includes(sentido)) {
      return { error: "Elegí quién participó de la reunión del otro área" }
    }
    if (!participantes) {
      return { error: "Anotá quién participó" }
    }
    if (!fecha_real) return { error: "Falta la fecha de la reunión" }

    const fotos = fotosDelForm(formData)
    if (contarFotos(fotos) === 0) {
      return { error: "Subí al menos una foto: es la evidencia" }
    }

    // 1) Fila primero (necesitamos el id para la carpeta), 2) fotos, 3) update.
    const { data: creado, error: errIns } = await supabase
      .from("participaciones_cruzadas")
      .upsert(
        {
          ...(plan_id ? { id: plan_id } : {}),
          reunion_id,
          sentido: sentido as ParticipacionCruzadaSentido,
          destino,
          tema,
          estado: "realizada",
          fecha_real,
          participantes,
          minuta,
          created_by: profile.id,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single()

    if (errIns || !creado) {
      if (errIns?.code === "23505") {
        return { error: "Esta reunión ya está marcada como participación cruzada" }
      }
      return { error: errIns?.message ?? "No se pudo marcar la reunión" }
    }

    const fila = creado as ParticipacionCruzada
    const subida = await subirFotos(supabase, fila.id, fotos)
    if ("error" in subida) {
      if (!plan_id) {
        await supabase.from("participaciones_cruzadas").delete().eq("id", fila.id)
      }
      return { error: subida.error }
    }

    const { data, error } = await supabase
      .from("participaciones_cruzadas")
      .update({ fotos: [...fila.fotos, ...subida.paths] })
      .eq("id", fila.id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ParticipacionCruzada }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error marcando el cruce",
    }
  }
}

/** Deshace la marca (borra también las fotos). */
export async function desmarcarParticipacionCruzada(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("participaciones_cruzadas")
      .select("fotos, fecha_plan, estado")
      .eq("id", id)
      .maybeSingle()

    const fila = actual as
      | { fotos: string[]; fecha_plan: string | null; estado: string }
      | null

    // Si venía de un plan, no se borra: vuelve a quedar pendiente. El tema y los
    // participantes previstos son parte del plan, así que NO se limpian.
    if (fila?.fecha_plan) {
      const { error } = await supabase
        .from("participaciones_cruzadas")
        .update({
          estado: "programada",
          fecha_real: null,
          reunion_id: null,
          participantes: null,
          minuta: null,
          fotos: [],
        })
        .eq("id", id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase
        .from("participaciones_cruzadas")
        .delete()
        .eq("id", id)
      if (error) return { error: error.message }
    }

    if (fila?.fotos?.length) {
      await supabase.storage.from(BUCKET).remove(fila.fotos)
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error deshaciendo el cruce",
    }
  }
}

/** Alta de una fecha del plan (todavía sin cumplir). */
export async function programarParticipacionCruzada(input: {
  fecha_plan: string
  sentido: ParticipacionCruzadaSentido
  destino?: string | null
  /** Qué se va a tratar en esa reunión. */
  tema?: string | null
  /** Quiénes deberían participar. */
  participantes_previstos?: string | null
  responsable_id?: string | null
}): Promise<Result<ParticipacionCruzada>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    if (!input.fecha_plan) return { error: "La fecha es obligatoria" }

    const { data, error } = await supabase
      .from("participaciones_cruzadas")
      .insert({
        fecha_plan: input.fecha_plan,
        sentido: input.sentido,
        destino: input.destino?.trim() || null,
        tema: input.tema?.trim() || null,
        participantes_previstos: input.participantes_previstos?.trim() || null,
        responsable_id: input.responsable_id || null,
        estado: "programada",
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as ParticipacionCruzada }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error programando el cruce",
    }
  }
}

/**
 * Edita lo planificado de una fecha que todavía no se cumplió. «Generar plan»
 * crea las fechas en blanco, así que el tema y quiénes deberían ir se cargan
 * después, desde el listado.
 */
export async function actualizarPlanParticipacionCruzada(input: {
  id: string
  fecha_plan: string
  sentido: ParticipacionCruzadaSentido
  destino?: string | null
  tema?: string | null
  participantes_previstos?: string | null
}): Promise<Result<ParticipacionCruzada>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!input.fecha_plan) return { error: "La fecha es obligatoria" }

    const { data, error } = await supabase
      .from("participaciones_cruzadas")
      .update({
        fecha_plan: input.fecha_plan,
        sentido: input.sentido,
        destino: input.destino?.trim() || null,
        tema: input.tema?.trim() || null,
        participantes_previstos: input.participantes_previstos?.trim() || null,
      })
      .eq("id", input.id)
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as ParticipacionCruzada }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error editando el plan",
    }
  }
}

/**
 * Genera el plan del período: una fecha por mes o cada 15 días, ALTERNANDO el
 * sentido (una vez va Ventas a Operaciones, la siguiente al revés) para que el
 * cruce quede cubierto en los dos sentidos. No pisa lo ya cargado.
 */
export async function generarPlanCruces(input: {
  desde: string
  hasta: string
  frecuencia: "mensual" | "quincenal"
}): Promise<Result<{ creados: number }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const desde = new Date(`${input.desde}T00:00:00`)
    const hasta = new Date(`${input.hasta}T00:00:00`)
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return { error: "Fechas inválidas" }
    }
    if (hasta < desde) return { error: "La fecha final es anterior a la inicial" }

    const paso = input.frecuencia === "mensual" ? 1 : 0.5
    const fechas: string[] = []
    const cursor = new Date(desde)
    while (cursor <= hasta && fechas.length < 60) {
      fechas.push(cursor.toISOString().slice(0, 10))
      if (paso === 1) {
        cursor.setMonth(cursor.getMonth() + 1)
      } else {
        cursor.setDate(cursor.getDate() + 15)
      }
    }
    if (fechas.length === 0) return { error: "El período no genera fechas" }

    // No duplicar: si ya hay algo planificado ese día, se saltea.
    const { data: existentes } = await supabase
      .from("participaciones_cruzadas")
      .select("fecha_plan")
      .in("fecha_plan", fechas)
    const yaHay = new Set(
      ((existentes ?? []) as { fecha_plan: string | null }[])
        .map((e) => e.fecha_plan)
        .filter(Boolean) as string[],
    )

    const filas = fechas
      .filter((f) => !yaHay.has(f))
      .map((fecha, i) => ({
        fecha_plan: fecha,
        sentido: (i % 2 === 0
          ? "ventas_a_operaciones"
          : "operaciones_a_ventas") as ParticipacionCruzadaSentido,
        estado: "programada",
        created_by: profile.id,
      }))

    if (filas.length === 0) return { data: { creados: 0 } }

    const { error } = await supabase
      .from("participaciones_cruzadas")
      .insert(filas)
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { creados: filas.length } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error generando el plan",
    }
  }
}

/**
 * Cumple una fecha del plan que NO pasó en una reunión de la app (típico:
 * alguien de operaciones fue a la matinal de Ventas). Foto obligatoria.
 */
export async function registrarCruceExterno(
  formData: FormData,
): Promise<Result<ParticipacionCruzada>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const id = String(formData.get("id") ?? "").trim() || null
    const sentido = String(formData.get("sentido") ?? "").trim()
    const destino = String(formData.get("destino") ?? "").trim() || null
    const tema = String(formData.get("tema") ?? "").trim() || null
    const fecha_real = String(formData.get("fecha_real") ?? "").trim()
    const participantes = String(formData.get("participantes") ?? "").trim()
    const minuta = String(formData.get("minuta") ?? "").trim() || null

    if (!["ventas_a_operaciones", "operaciones_a_ventas"].includes(sentido)) {
      return { error: "Elegí el sentido de la participación" }
    }
    if (!fecha_real) return { error: "Falta la fecha en que se hizo" }
    if (!participantes) return { error: "Anotá quién participó" }

    const fotos = fotosDelForm(formData)
    if (contarFotos(fotos) === 0) {
      return { error: "Subí al menos una foto: es la evidencia" }
    }

    const { data: fila, error: errUp } = await supabase
      .from("participaciones_cruzadas")
      .upsert(
        {
          ...(id ? { id } : {}),
          sentido: sentido as ParticipacionCruzadaSentido,
          destino,
          tema,
          estado: "realizada",
          fecha_real,
          participantes,
          minuta,
          created_by: profile.id,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single()

    if (errUp || !fila) {
      return { error: errUp?.message ?? "No se pudo registrar" }
    }

    const actual = fila as ParticipacionCruzada
    const subida = await subirFotos(supabase, actual.id, fotos)
    if ("error" in subida) return { error: subida.error }

    const { data, error } = await supabase
      .from("participaciones_cruzadas")
      .update({ fotos: [...actual.fotos, ...subida.paths] })
      .eq("id", actual.id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ParticipacionCruzada }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando el cruce",
    }
  }
}

/** Marca una fecha del plan como no realizada, con el motivo. */
export async function marcarCruceNoRealizado(
  id: string,
  motivo: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    if (!motivo.trim()) return { error: "Escribí el motivo" }
    const supabase = await createClient()
    const { error } = await supabase
      .from("participaciones_cruzadas")
      .update({ estado: "no_realizada", motivo: motivo.trim() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando",
    }
  }
}

export async function eliminarParticipacionCruzada(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("participaciones_cruzadas")
      .select("fotos")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase
      .from("participaciones_cruzadas")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }

    const fotos = (actual as { fotos: string[] } | null)?.fotos ?? []
    if (fotos.length) await supabase.storage.from(BUCKET).remove(fotos)

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando",
    }
  }
}
