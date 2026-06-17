"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { registerActivity } from "@/lib/dpo-activity"

const OWD_FOTOS_BUCKET = "owd-evidencias"

// Normaliza el nombre de archivo para usarlo como key de Storage
function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80)
}
import type {
  OwdItem,
  OwdObservacion,
  OwdRespuesta,
  OwdRespuestaFoto,
  OwdResultado,
  OwdMensual,
  OwdItemStats,
  OwdTemplate,
  OwdTemplateResumen,
} from "@/types/database"

// pilar_codigo usado en el feed de actividad / evidencias: nombre en minúsculas sin acentos
function pilarCodigo(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

interface OwdKpis {
  totalObservaciones: number
  promedioCumplimiento: number
  obsMesActual: number
  metaMensual: number
  metaCumplimiento: number
  mensual: OwdMensual[]
  porEtapa: Array<{ etapa: string; pct: number; total: number }>
  itemsMasFallados: OwdItemStats[]
}

// =============================================
// PLANTILLAS
// =============================================

// Landing /owd: todas las plantillas activas con contexto del punto + KPIs del mes
export async function getOwdTemplates(): Promise<
  { data: OwdTemplateResumen[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: templates, error: errT } = await supabase
      .from("owd_templates")
      .select("*")
      .eq("activo", true)
    if (errT) return { error: errT.message }
    if (!templates || templates.length === 0) return { data: [] }

    const preguntaIds = templates.map((t) => t.pregunta_id)
    const templateIds = templates.map((t) => t.id)

    const [pregRes, itemsRes, obsRes] = await Promise.all([
      supabase.from("preguntas").select("id, numero, texto, bloque_id").in("id", preguntaIds),
      supabase.from("owd_items").select("id, template_id, active").in("template_id", templateIds),
      supabase
        .from("owd_observaciones")
        .select("template_id, fecha, pct_cumplimiento")
        .in("template_id", templateIds),
    ])
    if (pregRes.error) return { error: pregRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }
    if (obsRes.error) return { error: obsRes.error.message }

    const bloqueIds = [...new Set((pregRes.data ?? []).map((p) => p.bloque_id))]
    const { data: bloques, error: errB } = await supabase
      .from("bloques")
      .select("id, nombre, pilar_id")
      .in("id", bloqueIds)
    if (errB) return { error: errB.message }

    const pilarIds = [...new Set((bloques ?? []).map((b) => b.pilar_id))]
    const { data: pilares, error: errP } = await supabase
      .from("pilares")
      .select("id, nombre, color")
      .in("id", pilarIds)
    if (errP) return { error: errP.message }

    const pregById = new Map((pregRes.data ?? []).map((p) => [p.id, p]))
    const bloqueById = new Map((bloques ?? []).map((b) => [b.id, b]))
    const pilarById = new Map((pilares ?? []).map((p) => [p.id, p]))

    const itemsCount = new Map<string, number>()
    for (const it of itemsRes.data ?? []) {
      if (it.active) itemsCount.set(it.template_id, (itemsCount.get(it.template_id) ?? 0) + 1)
    }

    const now = new Date()
    const mesActual = now.getMonth() + 1
    const yearActual = now.getFullYear()
    const obsByTemplate = new Map<
      string,
      { totalPct: number; total: number; mesPct: number; mes: number }
    >()
    for (const o of obsRes.data ?? []) {
      const g = obsByTemplate.get(o.template_id) ?? { totalPct: 0, total: 0, mesPct: 0, mes: 0 }
      g.totalPct += Number(o.pct_cumplimiento)
      g.total += 1
      const d = new Date(o.fecha + "T12:00:00")
      if (d.getMonth() + 1 === mesActual && d.getFullYear() === yearActual) {
        g.mesPct += Number(o.pct_cumplimiento)
        g.mes += 1
      }
      obsByTemplate.set(o.template_id, g)
    }

    const resumenes: OwdTemplateResumen[] = templates.map((t) => {
      const preg = pregById.get(t.pregunta_id)
      const bloque = preg ? bloqueById.get(preg.bloque_id) : undefined
      const pilar = bloque ? pilarById.get(bloque.pilar_id) : undefined
      const g = obsByTemplate.get(t.id)
      return {
        template: t as OwdTemplate,
        pregunta_numero: preg?.numero ?? "—",
        pregunta_texto: preg?.texto ?? "",
        bloque_nombre: bloque?.nombre ?? "",
        pilar_id: pilar?.id ?? "",
        pilar_nombre: pilar?.nombre ?? "",
        pilar_color: pilar?.color ?? "#64748b",
        total_items: itemsCount.get(t.id) ?? 0,
        obs_mes: g?.mes ?? 0,
        pct_cumplimiento_mes: g && g.mes > 0 ? Math.round((g.mesPct / g.mes) * 100) / 100 : 0,
        pct_cumplimiento_global:
          g && g.total > 0 ? Math.round((g.totalPct / g.total) * 100) / 100 : 0,
      }
    })

    // ordenar por pilar/numero para una landing prolija
    resumenes.sort(
      (a, b) =>
        a.pilar_nombre.localeCompare(b.pilar_nombre) ||
        a.pregunta_numero.localeCompare(b.pregunta_numero, undefined, { numeric: true }),
    )

    return { data: resumenes }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface OwdTemplateConContexto {
  template: OwdTemplate
  pregunta_numero: string
  pregunta_texto: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
}

async function templateConContexto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  template: OwdTemplate,
): Promise<OwdTemplateConContexto> {
  const { data: preg } = await supabase
    .from("preguntas")
    .select("numero, texto, bloque_id")
    .eq("id", template.pregunta_id)
    .single()
  let bloque_nombre = ""
  let pilar_id = ""
  let pilar_nombre = ""
  let pilar_color = "#64748b"
  if (preg) {
    const { data: bloque } = await supabase
      .from("bloques")
      .select("nombre, pilar_id")
      .eq("id", preg.bloque_id)
      .single()
    if (bloque) {
      bloque_nombre = bloque.nombre
      const { data: pilar } = await supabase
        .from("pilares")
        .select("id, nombre, color")
        .eq("id", bloque.pilar_id)
        .single()
      if (pilar) {
        pilar_id = pilar.id
        pilar_nombre = pilar.nombre
        pilar_color = pilar.color
      }
    }
  }
  return {
    template,
    pregunta_numero: preg?.numero ?? "—",
    pregunta_texto: preg?.texto ?? "",
    bloque_nombre,
    pilar_id,
    pilar_nombre,
    pilar_color,
  }
}

export async function getOwdTemplateById(
  templateId: string,
): Promise<{ data: OwdTemplateConContexto } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_templates")
      .select("*")
      .eq("id", templateId)
      .single()
    if (error) return { error: error.message }
    return { data: await templateConContexto(supabase, data as OwdTemplate) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Para el tab OWD de un punto: devuelve la plantilla del punto o null si no existe
export async function getOwdTemplateByPregunta(
  preguntaId: string,
): Promise<{ data: OwdTemplate | null } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_templates")
      .select("*")
      .eq("pregunta_id", preguntaId)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data as OwdTemplate) ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface CreateTemplateInput {
  preguntaId: string
  nombre?: string
  descripcion?: string
  metaMensual?: number
  metaCumplimiento?: number
}

export async function createOwdTemplate(
  input: CreateTemplateInput,
): Promise<{ data: OwdTemplate } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    // Nombre por defecto derivado del punto si no se especifica
    let nombre = input.nombre?.trim()
    if (!nombre) {
      const { data: preg } = await supabase
        .from("preguntas")
        .select("numero, texto")
        .eq("id", input.preguntaId)
        .single()
      nombre = preg ? `OWD ${preg.numero} — ${preg.texto}`.slice(0, 120) : "OWD"
    }

    const { data, error } = await supabase
      .from("owd_templates")
      .insert({
        pregunta_id: input.preguntaId,
        nombre,
        descripcion: input.descripcion?.trim() || null,
        meta_mensual: input.metaMensual ?? 8,
        meta_cumplimiento_pct: input.metaCumplimiento ?? 90,
      })
      .select("*")
      .single()
    if (error) {
      if (error.code === "23505") return { error: "Este punto ya tiene una plantilla OWD." }
      return { error: error.message }
    }
    return { data: data as OwdTemplate }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateOwdTemplate(
  templateId: string,
  patch: Partial<{
    nombre: string
    descripcion: string | null
    meta_mensual: number
    meta_cumplimiento_pct: number
    activo: boolean
  }>,
): Promise<{ data: OwdTemplate } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_templates")
      .update(patch)
      .eq("id", templateId)
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OwdTemplate }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteOwdTemplate(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { count, error: errC } = await supabase
      .from("owd_observaciones")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId)
    if (errC) return { error: errC.message }
    if ((count ?? 0) > 0) {
      return {
        error: `La plantilla tiene ${count} observación(es) cargadas. Desactivala en lugar de borrarla.`,
      }
    }
    const { error } = await supabase.from("owd_templates").delete().eq("id", templateId)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// =============================================
// ÍTEMS DEL CHECKLIST
// =============================================

export async function getOwdItems(
  templateId: string,
): Promise<{ data: OwdItem[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_items")
      .select("*")
      .eq("template_id", templateId)
      .eq("active", true)
      .order("orden", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data || []) as OwdItem[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Incluye inactivos: para el editor de plantillas (admin)
export async function getOwdItemsAdmin(
  templateId: string,
): Promise<{ data: OwdItem[] } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_items")
      .select("*")
      .eq("template_id", templateId)
      .order("orden", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data || []) as OwdItem[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface CreateItemInput {
  templateId: string
  etapa: string
  texto: string
  descripcion?: string
  critico?: boolean
  orden?: number
}

export async function createOwdItem(
  input: CreateItemInput,
): Promise<{ data: OwdItem } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    let orden = input.orden
    if (orden == null) {
      const { data: last } = await supabase
        .from("owd_items")
        .select("orden")
        .eq("template_id", input.templateId)
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle()
      orden = (last?.orden ?? 0) + 1
    }

    const { data, error } = await supabase
      .from("owd_items")
      .insert({
        template_id: input.templateId,
        etapa: input.etapa.trim(),
        texto: input.texto.trim(),
        descripcion: input.descripcion?.trim() || null,
        critico: input.critico ?? false,
        orden,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OwdItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateOwdItem(
  itemId: string,
  patch: Partial<{
    etapa: string
    texto: string
    descripcion: string | null
    critico: boolean
    orden: number
    active: boolean
  }>,
): Promise<{ data: OwdItem } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_items")
      .update(patch)
      .eq("id", itemId)
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OwdItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Borra el ítem si nunca se usó; si ya tiene respuestas, lo desactiva (soft delete)
export async function deleteOwdItem(
  itemId: string,
): Promise<{ success: true; softDeleted: boolean } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { count, error: errC } = await supabase
      .from("owd_respuestas")
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId)
    if (errC) return { error: errC.message }
    if ((count ?? 0) > 0) {
      const { error } = await supabase.from("owd_items").update({ active: false }).eq("id", itemId)
      if (error) return { error: error.message }
      return { success: true, softDeleted: true }
    }
    const { error } = await supabase.from("owd_items").delete().eq("id", itemId)
    if (error) return { error: error.message }
    return { success: true, softDeleted: false }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// =============================================
// EMPLEADOS (universo de observados)
// =============================================

// Cualquier empleado activo puede ser observado (decisión de producto: OWD genérico)
export async function getEmpleadosActivos(): Promise<
  { data: { nombre: string; sector: string | null }[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .select("nombre, sector")
      .eq("activo", true)
      .order("nombre", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data || []) as { nombre: string; sector: string | null }[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// =============================================
// OBSERVACIONES
// =============================================

interface RespuestaInput {
  item_id: string
  resultado: OwdResultado
  comentario?: string
}

// createObservacion recibe FormData para poder adjuntar fotos de evidencia
// por ítem. Campos:
//   templateId, fecha, supervisor, empleadoObservado, rolEmpleado, dominio,
//   accionCorrectiva, observaciones  -> strings
//   respuestas  -> JSON.stringify(RespuestaInput[])
//   foto__<item_id>  -> 0..n File (una entrada por foto de ese ítem)
export async function createObservacion(
  formData: FormData,
): Promise<{ data: OwdObservacion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const str = (k: string) => String(formData.get(k) ?? "").trim()
    const templateId = str("templateId")
    if (!templateId) return { error: "Plantilla inválida" }

    let respuestas: RespuestaInput[]
    try {
      respuestas = JSON.parse(String(formData.get("respuestas") ?? "[]"))
    } catch {
      return { error: "Respuestas con formato inválido" }
    }
    if (!Array.isArray(respuestas) || respuestas.length === 0) {
      return { error: "No hay respuestas para guardar" }
    }

    const totalItems = respuestas.length
    const totalOk = respuestas.filter((r) => r.resultado === "ok").length
    const totalNook = respuestas.filter((r) => r.resultado === "nook").length
    const totalNa = respuestas.filter((r) => r.resultado === "na").length
    const evaluables = totalOk + totalNook
    const pct = evaluables === 0 ? 0 : Math.round((totalOk / evaluables) * 10000) / 100

    const { data: obs, error: errObs } = await supabase
      .from("owd_observaciones")
      .insert({
        template_id: templateId,
        fecha: str("fecha"),
        supervisor: str("supervisor"),
        empleado_observado: str("empleadoObservado"),
        rol_empleado: str("rolEmpleado") || null,
        dominio: str("dominio").toUpperCase() || null,
        total_items: totalItems,
        total_ok: totalOk,
        total_nook: totalNook,
        total_na: totalNa,
        pct_cumplimiento: pct,
        accion_correctiva: str("accionCorrectiva") || null,
        observaciones: str("observaciones") || null,
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (errObs) return { error: errObs.message }

    const respuestasPayload = respuestas.map((r) => ({
      observacion_id: obs.id,
      item_id: r.item_id,
      resultado: r.resultado,
      comentario: r.comentario?.trim() || null,
    }))
    const { data: respRows, error: errResp } = await supabase
      .from("owd_respuestas")
      .insert(respuestasPayload)
      .select("id, item_id")
    if (errResp) {
      await supabase.from("owd_observaciones").delete().eq("id", obs.id)
      return { error: errResp.message }
    }

    // Subir fotos de evidencia por ítem (las que hayan venido en el FormData)
    const fotosPayload: Array<{
      respuesta_id: string
      path: string
      nombre: string
      mime: string | null
      bytes: number
      orden: number
    }> = []
    for (const resp of respRows as { id: string; item_id: string }[]) {
      const files = formData
        .getAll(`foto__${resp.item_id}`)
        .filter((f): f is File => f instanceof File && f.size > 0)
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = `${obs.id}/${resp.item_id}/${Date.now()}-${i}-${cleanFileName(file.name)}`
        const arrayBuffer = await file.arrayBuffer()
        const { error: upErr } = await supabase.storage
          .from(OWD_FOTOS_BUCKET)
          .upload(path, arrayBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          })
        if (upErr) {
          // Limpiar observación + respuestas (CASCADE) y abortar
          await supabase.from("owd_observaciones").delete().eq("id", obs.id)
          return { error: `Subiendo foto: ${upErr.message}` }
        }
        fotosPayload.push({
          respuesta_id: resp.id,
          path,
          nombre: file.name,
          mime: file.type || null,
          bytes: file.size,
          orden: i,
        })
      }
    }
    if (fotosPayload.length > 0) {
      const { error: errFotos } = await supabase
        .from("owd_respuesta_fotos")
        .insert(fotosPayload)
      if (errFotos) {
        await supabase.from("owd_observaciones").delete().eq("id", obs.id)
        return { error: errFotos.message }
      }
    }

    const input = {
      templateId,
      supervisor: str("supervisor"),
      empleadoObservado: str("empleadoObservado"),
    }

    // Derivar pilar/punto de la pregunta asociada para el feed de actividad
    const { data: tpl } = await supabase
      .from("owd_templates")
      .select("nombre, pregunta_id")
      .eq("id", input.templateId)
      .single()
    let pilar_codigo: string | undefined
    let punto_codigo: string | undefined
    if (tpl) {
      const { data: preg } = await supabase
        .from("preguntas")
        .select("numero, bloque_id")
        .eq("id", tpl.pregunta_id)
        .single()
      if (preg) {
        punto_codigo = preg.numero
        const { data: bloque } = await supabase
          .from("bloques")
          .select("pilar_id")
          .eq("id", preg.bloque_id)
          .single()
        if (bloque) {
          const { data: pilar } = await supabase
            .from("pilares")
            .select("nombre")
            .eq("id", bloque.pilar_id)
            .single()
          if (pilar) pilar_codigo = pilarCodigo(pilar.nombre)
        }
      }
    }

    await registerActivity(supabase, {
      tipo: "owd_creada",
      titulo: `${tpl?.nombre ?? "OWD"} — ${input.empleadoObservado}`,
      descripcion: `${totalOk} OK, ${totalNook} NO OK (${pct.toFixed(0)}%)`,
      pilar_codigo,
      punto_codigo,
      referencia_id: obs.id,
      referencia_tipo: "owd_observacion",
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { supervisor: input.supervisor, pct_cumplimiento: pct, template_id: input.templateId },
    })

    return { data: obs as OwdObservacion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getObservaciones(
  templateId: string,
  filters?: { limit?: number; supervisor?: string; empleado?: string },
): Promise<{ data: OwdObservacion[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let query = supabase
      .from("owd_observaciones")
      .select("*")
      .eq("template_id", templateId)
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false })

    if (filters?.supervisor) query = query.eq("supervisor", filters.supervisor)
    if (filters?.empleado) query = query.eq("empleado_observado", filters.empleado)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as OwdObservacion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getObservacionById(
  id: string,
): Promise<
  | {
      data: {
        observacion: OwdObservacion
        respuestas: OwdRespuesta[]
        items: OwdItem[]
        fotos: OwdRespuestaFoto[]
      }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: observacion, error: errObs } = await supabase
      .from("owd_observaciones")
      .select("*")
      .eq("id", id)
      .single()
    if (errObs) return { error: errObs.message }

    // Ítems del template de ESTA observación (no globales)
    const itemsQuery = supabase.from("owd_items").select("*").order("orden", { ascending: true })
    if (observacion.template_id) itemsQuery.eq("template_id", observacion.template_id)

    const [respRes, itemsRes] = await Promise.all([
      supabase.from("owd_respuestas").select("*").eq("observacion_id", id),
      itemsQuery,
    ])
    if (respRes.error) return { error: respRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }

    const respuestas = (respRes.data || []) as OwdRespuesta[]

    // Fotos de evidencia de todas las respuestas de esta observación
    let fotos: OwdRespuestaFoto[] = []
    if (respuestas.length > 0) {
      const { data: fotosData, error: errFotos } = await supabase
        .from("owd_respuesta_fotos")
        .select("*")
        .in(
          "respuesta_id",
          respuestas.map((r) => r.id),
        )
        .order("orden", { ascending: true })
      if (errFotos) return { error: errFotos.message }
      fotos = (fotosData || []) as OwdRespuestaFoto[]
    }

    return {
      data: {
        observacion: observacion as OwdObservacion,
        respuestas,
        items: (itemsRes.data || []) as OwdItem[],
        fotos,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// URL firmada para abrir/visualizar una foto de evidencia del OWD
export async function getOwdFotoSignedUrl(
  path: string,
): Promise<{ data: { url: string } } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!path) return { error: "Ruta de archivo inválida" }
    const { data, error } = await supabase.storage
      .from(OWD_FOTOS_BUCKET)
      .createSignedUrl(path, 60 * 10)
    if (error || !data) return { error: error?.message ?? "No se pudo generar URL" }
    return { data: { url: data.signedUrl } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Agrega fotos de evidencia a una observación YA GUARDADA.
// FormData: observacionId + entradas `foto__<item_id>` (0..n File por ítem).
// Las imágenes ya vienen comprimidas desde el cliente.
export async function addOwdFotos(
  formData: FormData,
): Promise<{ data: { agregadas: number } } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const observacionId = String(formData.get("observacionId") || "")
    if (!observacionId) return { error: "Falta la observación" }

    // Respuestas de la observación: necesito item_id -> respuesta.id
    const { data: resp, error: errResp } = await supabase
      .from("owd_respuestas")
      .select("id, item_id")
      .eq("observacion_id", observacionId)
    if (errResp) return { error: errResp.message }
    if (!resp || resp.length === 0) return { error: "La observación no tiene respuestas" }
    const respByItem = new Map((resp as { id: string; item_id: string }[]).map((r) => [r.item_id, r.id]))
    const respIds = resp.map((r) => r.id)

    // Orden de arranque por respuesta = cantidad de fotos ya existentes
    const { data: existentes } = await supabase
      .from("owd_respuesta_fotos")
      .select("respuesta_id")
      .in("respuesta_id", respIds)
    const ordenBase = new Map<string, number>()
    for (const f of (existentes || []) as { respuesta_id: string }[]) {
      ordenBase.set(f.respuesta_id, (ordenBase.get(f.respuesta_id) ?? 0) + 1)
    }

    const fotosPayload: Array<{
      respuesta_id: string
      path: string
      nombre: string
      mime: string | null
      bytes: number
      orden: number
    }> = []
    const subidas: string[] = []

    for (const [itemId, respuestaId] of respByItem) {
      const files = formData
        .getAll(`foto__${itemId}`)
        .filter((f): f is File => f instanceof File && f.size > 0)
      let orden = ordenBase.get(respuestaId) ?? 0
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = `${observacionId}/${itemId}/${Date.now()}-${i}-${cleanFileName(file.name)}`
        const arrayBuffer = await file.arrayBuffer()
        const { error: upErr } = await supabase.storage
          .from(OWD_FOTOS_BUCKET)
          .upload(path, arrayBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          })
        if (upErr) {
          // Limpiar lo ya subido en esta tanda y abortar
          if (subidas.length > 0) await supabase.storage.from(OWD_FOTOS_BUCKET).remove(subidas)
          return { error: `Subiendo foto: ${upErr.message}` }
        }
        subidas.push(path)
        fotosPayload.push({
          respuesta_id: respuestaId,
          path,
          nombre: file.name,
          mime: file.type || null,
          bytes: file.size,
          orden: orden++,
        })
      }
    }

    if (fotosPayload.length === 0) return { error: "No se recibieron fotos" }

    const { error: errFotos } = await supabase
      .from("owd_respuesta_fotos")
      .insert(fotosPayload)
    if (errFotos) {
      await supabase.storage.from(OWD_FOTOS_BUCKET).remove(subidas)
      return { error: errFotos.message }
    }

    return { data: { agregadas: fotosPayload.length } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteObservacion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Borrar fotos de evidencia del Storage (las filas se van por CASCADE)
    const { data: resp } = await supabase
      .from("owd_respuestas")
      .select("id")
      .eq("observacion_id", id)
    const respIds = (resp || []).map((r) => r.id)
    if (respIds.length > 0) {
      const { data: fotos } = await supabase
        .from("owd_respuesta_fotos")
        .select("path")
        .in("respuesta_id", respIds)
      const paths = (fotos || []).map((f) => f.path).filter(Boolean)
      if (paths.length > 0) {
        await supabase.storage.from(OWD_FOTOS_BUCKET).remove(paths)
      }
    }

    const { error } = await supabase.from("owd_observaciones").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// =============================================
// KPIs (filtrados por plantilla)
// =============================================

export async function getOwdKpis(
  templateId: string,
): Promise<{ data: OwdKpis } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [tplRes, obsRes, itemsRes] = await Promise.all([
      supabase
        .from("owd_templates")
        .select("meta_mensual, meta_cumplimiento_pct")
        .eq("id", templateId)
        .maybeSingle(),
      supabase
        .from("owd_observaciones")
        .select("*")
        .eq("template_id", templateId)
        .order("fecha", { ascending: true }),
      supabase.from("owd_items").select("*").eq("template_id", templateId).eq("active", true),
    ])
    if (obsRes.error) return { error: obsRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }

    const metaMensual = tplRes.data?.meta_mensual ?? 8
    const metaCumplimiento = Number(tplRes.data?.meta_cumplimiento_pct ?? 90)

    const observaciones = (obsRes.data || []) as OwdObservacion[]
    const items = (itemsRes.data || []) as OwdItem[]

    const emptyKpis: OwdKpis = {
      totalObservaciones: 0,
      promedioCumplimiento: 0,
      obsMesActual: 0,
      metaMensual,
      metaCumplimiento,
      mensual: [],
      porEtapa: [],
      itemsMasFallados: [],
    }
    if (observaciones.length === 0) return { data: emptyKpis }

    // Respuestas de los ítems de este template
    const itemIds = items.map((i) => i.id)
    let respuestas: OwdRespuesta[] = []
    if (itemIds.length > 0) {
      const { data: respData, error: errR } = await supabase
        .from("owd_respuestas")
        .select("*")
        .in("item_id", itemIds)
      if (errR) return { error: errR.message }
      respuestas = (respData || []) as OwdRespuesta[]
    }

    const totalObservaciones = observaciones.length
    const promedioCumplimiento =
      Math.round(
        (observaciones.reduce((a, b) => a + Number(b.pct_cumplimiento), 0) / totalObservaciones) *
          100,
      ) / 100

    const now = new Date()
    const mesActual = now.getMonth() + 1
    const yearActual = now.getFullYear()
    const obsMesActual = observaciones.filter((o) => {
      const d = new Date(o.fecha + "T12:00:00")
      return d.getMonth() + 1 === mesActual && d.getFullYear() === yearActual
    }).length

    const mensualMap = new Map<
      string,
      { total: number; sumaPct: number; year: number; mes: number }
    >()
    for (const o of observaciones) {
      const d = new Date(o.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key)) mensualMap.set(key, { total: 0, sumaPct: 0, year, mes })
      const g = mensualMap.get(key)!
      g.total += 1
      g.sumaPct += Number(o.pct_cumplimiento)
    }
    const mensual: OwdMensual[] = Array.from(mensualMap.values()).map((g) => ({
      mes: g.mes,
      year: g.year,
      total_observaciones: g.total,
      promedio_cumplimiento: Math.round((g.sumaPct / g.total) * 100) / 100,
    }))

    const itemsById = new Map(items.map((i) => [i.id, i]))
    const etapaMap = new Map<string, { ok: number; nook: number }>()
    const itemMap = new Map<string, { ok: number; nook: number; na: number }>()

    for (const r of respuestas) {
      const it = itemsById.get(r.item_id)
      if (!it) continue
      if (!etapaMap.has(it.etapa)) etapaMap.set(it.etapa, { ok: 0, nook: 0 })
      if (!itemMap.has(r.item_id)) itemMap.set(r.item_id, { ok: 0, nook: 0, na: 0 })
      const eg = etapaMap.get(it.etapa)!
      const ig = itemMap.get(r.item_id)!
      if (r.resultado === "ok") {
        eg.ok += 1
        ig.ok += 1
      } else if (r.resultado === "nook") {
        eg.nook += 1
        ig.nook += 1
      } else {
        ig.na += 1
      }
    }

    const porEtapa = Array.from(etapaMap.entries()).map(([etapa, g]) => {
      const total = g.ok + g.nook
      return { etapa, total, pct: total === 0 ? 0 : Math.round((g.ok / total) * 10000) / 100 }
    })

    const itemsMasFallados: OwdItemStats[] = Array.from(itemMap.entries())
      .map(([item_id, g]) => {
        const it = itemsById.get(item_id)!
        const total = g.ok + g.nook
        return {
          item_id,
          etapa: it.etapa,
          texto: it.texto,
          total_ok: g.ok,
          total_nook: g.nook,
          total_na: g.na,
          pct_cumplimiento: total === 0 ? 0 : Math.round((g.ok / total) * 10000) / 100,
        }
      })
      .filter((i) => i.total_nook > 0)
      .sort((a, b) => b.total_nook - a.total_nook)
      .slice(0, 5)

    return {
      data: {
        totalObservaciones,
        promedioCumplimiento,
        obsMesActual,
        metaMensual,
        metaCumplimiento,
        mensual,
        porEtapa,
        itemsMasFallados,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
