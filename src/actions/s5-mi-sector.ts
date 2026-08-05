"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { archivosDeFila, columnasArchivos, type ArchivoAvance } from "@/lib/adjuntos-avance"
import { calcularBonus, type ResumenDocumentacion } from "@/lib/s5-bonus"
import type { S5ItemCatalogo } from "@/types/database"

const MI_PATH = "/mi-5s"
const DASHBOARD_PATH = "/5s"

/**
 * Este módulo NO tiene tablas propias a propósito: se apoya en `s5_acciones` y
 * `s5_acciones_evidencias`, que ya existen y ya tienen las políticas que
 * necesitábamos (el responsable puede cargar evidencia y subir al bucket bajo
 * `acciones/{id}/`). Así el módulo se publica sin DDL.
 *
 * - Tarea del mes  = fila de `s5_acciones` (tipo 'almacen', sector_numero).
 * - Evidencia      = fila de `s5_acciones_evidencias` con hasta dos fotos en la
 *                    columna jsonb `archivos`, marcadas con `momento`.
 */

/** Foto de evidencia: el `momento` es una clave extra del jsonb `archivos`. */
export type MomentoFoto = "antes" | "despues"

export interface FotoEvidencia extends ArchivoAvance {
  momento: MomentoFoto | null
}

export interface TareaSector {
  id: string
  descripcion: string
  estado: "no_comenzada" | "en_curso" | "cerrada"
  fecha_compromiso: string | null
  /** Es el contenedor de las fotos sueltas del mes, no una tarea real. */
  es_libre: boolean
  /** La cargó el propio operario (no el auditor): puede editarla y borrarla. */
  es_mia: boolean
  /** Cuántas evidencias tiene cargadas este mes. */
  evidencias: number
  /** Cuántas de esas tienen antes Y después. */
  completas: number
}

export interface EvidenciaSector {
  id: string
  accion_id: string
  comentario: string | null
  fotos: FotoEvidencia[]
  autor_id: string
  autor_nombre: string
  created_at: string
  es_mia: boolean
}

export interface MiSector5S {
  periodo: string
  sector_numero: number | null
  sector_nombre: string | null
  checklist: S5ItemCatalogo[]
  tareas: TareaSector[]
  evidencias: EvidenciaSector[]
  documentacion: ResumenDocumentacion
  ultima_nota: number | null
  dias_restantes: number
}

// ===================================================
// Helpers
// ===================================================

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`
}

function finDeMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`
}

function diasRestantesDelMes(): number {
  const hoy = new Date()
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  return ultimo - hoy.getDate()
}

/** Descripción de la acción que junta las fotos sueltas de un sector y mes. */
function descripcionLibre(periodo: string, sector: number): string {
  return `Tareas 5S del mes — sector ${sector} — ${periodo.slice(0, 7)}`
}

function fotosDeFila(row: {
  archivos?: unknown
  archivo_path?: string | null
  archivo_nombre?: string | null
  archivo_mime?: string | null
  archivo_bytes?: number | null
}): FotoEvidencia[] {
  const base = archivosDeFila(row)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crudos = Array.isArray(row.archivos) ? (row.archivos as any[]) : []
  return base.map((a) => ({
    ...a,
    momento: (crudos.find((c) => c?.path === a.path)?.momento ?? null) as MomentoFoto | null,
  }))
}

function esCompleta(fotos: FotoEvidencia[]): boolean {
  return fotos.some((f) => f.momento === "antes") && fotos.some((f) => f.momento === "despues")
}

/**
 * Evidencias de un sector en un mes, con sus fotos ya normalizadas.
 * Es la base de la pantalla del operario, del panel del auditor y del bonus.
 */
async function evidenciasDelMes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodo: string,
  sector: number,
  miProfileId: string | null,
): Promise<{ acciones: string[]; evidencias: EvidenciaSector[] }> {
  const { data: acciones } = await supabase
    .from("s5_acciones")
    .select("id")
    .eq("tipo", "almacen")
    .eq("sector_numero", sector)

  const ids = (acciones ?? []).map((a: { id: string }) => a.id)
  if (ids.length === 0) return { acciones: [], evidencias: [] }

  const { data } = await supabase
    .from("s5_acciones_evidencias")
    .select("*, autor:profiles!s5_acciones_evidencias_autor_id_fkey(nombre)")
    .in("accion_id", ids)
    .gte("created_at", `${periodo}T00:00:00`)
    .lte("created_at", `${finDeMes(periodo)}T23:59:59`)
    .order("created_at", { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidencias: EvidenciaSector[] = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    accion_id: row.accion_id,
    comentario: row.comentario,
    fotos: fotosDeFila(row),
    autor_id: row.autor_id,
    autor_nombre: row.autor?.nombre ?? "—",
    created_at: row.created_at,
    es_mia: row.autor_id === miProfileId,
  }))

  return { acciones: ids, evidencias }
}

/**
 * El bonus premia al RESPONSABLE del sector: solo cuentan las evidencias que
 * cargó él. Las que sube el auditor al responder una acción no suman.
 */
function resumirDocumentacion(
  evidencias: EvidenciaSector[],
  responsableProfileId: string | null,
): ResumenDocumentacion {
  const suyas = responsableProfileId
    ? evidencias.filter((e) => e.autor_id === responsableProfileId)
    : []
  const total = suyas.length
  const conAntesDespues = suyas.filter((e) => esCompleta(e.fotos)).length
  return {
    total,
    con_antes_despues: conAntesDespues,
    bonus: calcularBonus(total, conAntesDespues),
  }
}

/**
 * Legajo del usuario logueado. Va por el cliente admin a propósito: la RLS de
 * `empleados` restringe al rol 'empleado' a "verse a sí mismo" vía
 * `profiles.empleado_id`, que en esta base está vacío — con el cliente normal
 * la consulta volvería sin filas y el operario nunca vería su sector. La
 * lectura está acotada al propio usuario autenticado.
 */
async function empleadoDelUsuario(profileId: string): Promise<{ id: string } | null> {
  const { data } = await createAdminClient()
    .from("empleados")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle()
  return data ?? null
}

/** Sector que le tocó por sorteo al empleado en ese mes, o null. */
async function sectorDelEmpleado(
  empleadoId: string,
  periodo: string
): Promise<number | null> {
  const { data } = await createAdminClient()
    .from("s5_sector_responsables")
    .select("sector_numero")
    .eq("periodo", periodo)
    .eq("empleado_id", empleadoId)
    .maybeSingle()
  return data?.sector_numero ?? null
}

/** profile_id del responsable sorteado de un sector en un mes. */
async function responsableDelSector(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodo: string,
  sector: number,
): Promise<{ profileId: string | null; nombre: string | null }> {
  const { data } = await supabase
    .from("s5_sector_responsables")
    .select("empleado:empleados!s5_sector_responsables_empleado_id_fkey(profile_id, nombre)")
    .eq("periodo", periodo)
    .eq("sector_numero", sector)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = (data as any)?.empleado
  return { profileId: emp?.profile_id ?? null, nombre: emp?.nombre ?? null }
}

// ===================================================
// Pantalla del operario
// ===================================================

export async function getMiSector5S(): Promise<
  { data: MiSector5S } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const periodo = periodoActual()

    const vacio: MiSector5S = {
      periodo,
      sector_numero: null,
      sector_nombre: null,
      checklist: [],
      tareas: [],
      evidencias: [],
      documentacion: { total: 0, con_antes_despues: 0, bonus: 0 },
      ultima_nota: null,
      dias_restantes: diasRestantesDelMes(),
    }

    const empleado = await empleadoDelUsuario(profile.id)
    if (!empleado) return { data: vacio }

    const sector = await sectorDelEmpleado(empleado.id, periodo)
    if (sector === null) return { data: vacio }

    const [sectorRes, itemsRes, accionesRes, auditRes, evid] = await Promise.all([
      supabase.from("s5_sectores_almacen").select("nombre").eq("numero", sector).maybeSingle(),
      supabase
        .from("s5_items_catalogo")
        .select("*")
        .eq("tipo", "almacen")
        .eq("activo", true)
        .order("orden", { ascending: true }),
      supabase
        .from("s5_acciones")
        .select("id, descripcion, estado, fecha_compromiso, cerrada_at, creado_por")
        .eq("tipo", "almacen")
        .eq("sector_numero", sector)
        .order("fecha_compromiso", { ascending: true, nullsFirst: false }),
      supabase
        .from("s5_auditorias")
        .select("nota_total")
        .eq("tipo", "almacen")
        .eq("sector_numero", sector)
        .eq("estado", "completada")
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
      evidenciasDelMes(supabase, periodo, sector, profile.id),
    ])

    const porAccion = new Map<string, EvidenciaSector[]>()
    for (const e of evid.evidencias) {
      const arr = porAccion.get(e.accion_id) ?? []
      arr.push(e)
      porAccion.set(e.accion_id, arr)
    }

    const libre = descripcionLibre(periodo, sector)
    const finMes = finDeMes(periodo)

    // Tareas visibles: las abiertas del sector y las que se cerraron este mes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tareas: TareaSector[] = ((accionesRes.data ?? []) as any[])
      .filter(
        (a) =>
          a.estado !== "cerrada" ||
          (a.cerrada_at && a.cerrada_at >= `${periodo}T00:00:00` && a.cerrada_at <= `${finMes}T23:59:59`),
      )
      .map((a) => {
        const evs = porAccion.get(a.id) ?? []
        return {
          id: a.id,
          descripcion: a.descripcion,
          estado: a.estado,
          fecha_compromiso: a.fecha_compromiso,
          es_libre: a.descripcion === libre,
          es_mia: a.creado_por === profile.id,
          evidencias: evs.length,
          completas: evs.filter((e) => esCompleta(e.fotos)).length,
        }
      })

    return {
      data: {
        periodo,
        sector_numero: sector,
        sector_nombre: sectorRes.data?.nombre ?? `Sector ${sector}`,
        checklist: (itemsRes.data ?? []) as S5ItemCatalogo[],
        tareas,
        evidencias: evid.evidencias,
        // El responsable del sector soy yo: por eso llegué hasta acá.
        documentacion: resumirDocumentacion(evid.evidencias, profile.id),
        ultima_nota: auditRes.data?.nota_total !== undefined && auditRes.data?.nota_total !== null
          ? Number(auditRes.data.nota_total)
          : null,
        dias_restantes: diasRestantesDelMes(),
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tu sector 5S" }
  }
}

/**
 * Acción a la que colgar una foto suelta. Si no existe la del mes, se crea con
 * el cliente admin: `s5_acciones_insert` solo deja crear a admin/auditor, y acá
 * el que la necesita es el operario. La autorización la hace esta función:
 * solo la crea para el sector que le tocó a quien la pide.
 */
async function accionLibre(periodo: string, sector: number, profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const descripcion = descripcionLibre(periodo, sector)

  const { data: existente } = await admin
    .from("s5_acciones")
    .select("id")
    .eq("tipo", "almacen")
    .eq("sector_numero", sector)
    .eq("descripcion", descripcion)
    .maybeSingle()

  if (existente) return existente.id

  const { data, error } = await admin
    .from("s5_acciones")
    .insert({
      tipo: "almacen",
      sector_numero: sector,
      descripcion,
      responsable_id: profileId,
      fecha_compromiso: finDeMes(periodo),
      estado: "en_curso",
      creado_por: profileId,
    })
    .select("id")
    .single()

  if (error) return null
  return data.id
}

/**
 * Deja lista la acción a la que se van a colgar las fotos y devuelve su id.
 * Hay que llamarla ANTES de subir: la política de storage solo deja escribir
 * bajo `acciones/{id}/` de una acción donde el usuario es responsable o
 * creador, así que la carpeta tiene que existir como acción real.
 */
export async function prepararCarga5S(
  accionId?: string | null
): Promise<{ data: { accionId: string } } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const periodo = periodoActual()

    const empleado = await empleadoDelUsuario(profile.id)
    if (!empleado) return { error: "Tu usuario no está vinculado a un legajo" }

    const sector = await sectorDelEmpleado(empleado.id, periodo)
    if (sector === null) return { error: "Este mes no sos responsable de ningún sector" }

    if (!accionId) {
      const id = await accionLibre(periodo, sector, profile.id)
      if (!id) return { error: "No se pudo preparar la carga" }
      return { data: { accionId: id } }
    }

    const { data: acc } = await supabase
      .from("s5_acciones")
      .select("id, sector_numero, responsable_id")
      .eq("id", accionId)
      .maybeSingle()
    if (!acc || acc.sector_numero !== sector) {
      return { error: "Esa tarea no es de tu sector" }
    }

    // Tarea creada antes del sorteo: sin responsable, el bucket le rechazaría
    // la foto. Se la asignamos al responsable del mes, que es quien la ejecuta.
    if (!acc.responsable_id) {
      await createAdminClient()
        .from("s5_acciones")
        .update({ responsable_id: profile.id })
        .eq("id", accionId)
    }

    return { data: { accionId } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error preparando la carga" }
  }
}

// ===================================================
// Tareas propias del operario
// ===================================================

/**
 * El operario define QUÉ tareas hace en su sector: el auditor le carga algunas
 * en /5s/sectores, pero el trabajo real del mes casi nunca entra en esa lista
 * (Troli, 2026-08-05: "solo me salen limpieza de stay y movimiento de pallets").
 * Puede agregar las suyas y editarlas o borrarlas; las que le puso el auditor
 * quedan fijas — no le puede sacar lo que le mandaron hacer.
 *
 * Va con el cliente admin por el mismo motivo que `accionLibre`: la política
 * `s5_acciones_insert` solo deja crear a admin/auditor. La autorización la hace
 * esta función — solo toca el sector que le tocó por sorteo a quien la llama.
 */
async function miSectorDelMes(
  profileId: string,
): Promise<{ sector: number; periodo: string } | { error: string }> {
  const periodo = periodoActual()
  const empleado = await empleadoDelUsuario(profileId)
  if (!empleado) return { error: "Tu usuario no está vinculado a un legajo" }
  const sector = await sectorDelEmpleado(empleado.id, periodo)
  if (sector === null) return { error: "Este mes no sos responsable de ningún sector" }
  return { sector, periodo }
}

/**
 * Tarea del operario, ya validada como suya y editable. Deja afuera la acción
 * contenedora de las fotos sueltas y las tareas que cargó el auditor.
 */
async function miTareaEditable(
  id: string,
  profileId: string,
  sector: number,
  periodo: string,
): Promise<{ ok: true } | { error: string }> {
  const { data: acc } = await createAdminClient()
    .from("s5_acciones")
    .select("id, tipo, sector_numero, descripcion, creado_por")
    .eq("id", id)
    .maybeSingle()

  if (!acc || acc.tipo !== "almacen" || acc.sector_numero !== sector) {
    return { error: "Esa tarea no es de tu sector" }
  }
  if (acc.descripcion === descripcionLibre(periodo, sector)) {
    return { error: "Esa no es una tarea: es donde se guardan las fotos sueltas del mes" }
  }
  if (acc.creado_por !== profileId) {
    return { error: "Esta tarea te la cargó el auditor, no la podés cambiar" }
  }
  return { ok: true }
}

export async function crearMiTarea(
  titulo: string,
): Promise<{ data: { id: string } } | { error: string }> {
  try {
    const profile = await requireAuth()
    const desc = titulo.trim()
    if (!desc) return { error: "Escribí qué tarea hacés" }
    if (desc.length > 200) return { error: "La tarea es muy larga (máximo 200 caracteres)" }

    const mio = await miSectorDelMes(profile.id)
    if ("error" in mio) return mio

    const { data, error } = await createAdminClient()
      .from("s5_acciones")
      .insert({
        tipo: "almacen",
        sector_numero: mio.sector,
        descripcion: desc,
        responsable_id: profile.id,
        fecha_compromiso: finDeMes(mio.periodo),
        estado: "en_curso",
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { data: { id: data.id } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la tarea" }
  }
}

export async function editarMiTarea(
  id: string,
  titulo: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const desc = titulo.trim()
    if (!desc) return { error: "Escribí qué tarea hacés" }
    if (desc.length > 200) return { error: "La tarea es muy larga (máximo 200 caracteres)" }

    const mio = await miSectorDelMes(profile.id)
    if ("error" in mio) return mio

    const permiso = await miTareaEditable(id, profile.id, mio.sector, mio.periodo)
    if ("error" in permiso) return permiso

    const { error } = await createAdminClient()
      .from("s5_acciones")
      .update({ descripcion: desc })
      .eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error editando la tarea" }
  }
}

export async function borrarMiTarea(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()

    const mio = await miSectorDelMes(profile.id)
    if ("error" in mio) return mio

    const permiso = await miTareaEditable(id, profile.id, mio.sector, mio.periodo)
    if ("error" in permiso) return permiso

    const admin = createAdminClient()

    // Con fotos colgadas no se borra: se perdería la evidencia (y el bonus que
    // ya sumó). Que la deje ahí o pida al auditor.
    const { count } = await admin
      .from("s5_acciones_evidencias")
      .select("id", { count: "exact", head: true })
      .eq("accion_id", id)
    if ((count ?? 0) > 0) {
      return { error: "Esta tarea ya tiene fotos cargadas: no se puede borrar" }
    }

    const { error } = await admin.from("s5_acciones").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando la tarea" }
  }
}

export async function cargarEvidencia5S(input: {
  /** Tarea a la que corresponde; sin ella va a la carpeta del mes. */
  accionId?: string | null
  comentario: string
  antes?: ArchivoAvance | null
  despues?: ArchivoAvance | null
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const comentario = input.comentario.trim()
    if (!comentario) return { error: "Contá en una línea qué hiciste" }
    if (!input.antes && !input.despues) {
      return { error: "Subí al menos una foto" }
    }

    const periodo = periodoActual()

    const empleado = await empleadoDelUsuario(profile.id)
    if (!empleado) return { error: "Tu usuario no está vinculado a un legajo" }

    const sector = await sectorDelEmpleado(empleado.id, periodo)
    if (sector === null) return { error: "Este mes no sos responsable de ningún sector" }

    let accionId = input.accionId || null
    if (accionId) {
      // No dejar colgar evidencia de otro sector.
      const { data: acc } = await supabase
        .from("s5_acciones")
        .select("sector_numero")
        .eq("id", accionId)
        .maybeSingle()
      if (!acc || acc.sector_numero !== sector) {
        return { error: "Esa tarea no es de tu sector" }
      }
    } else {
      accionId = await accionLibre(periodo, sector, profile.id)
      if (!accionId) return { error: "No se pudo registrar la carga" }
    }

    const fotos: (ArchivoAvance & { momento: MomentoFoto })[] = []
    if (input.antes) fotos.push({ ...input.antes, momento: "antes" })
    if (input.despues) fotos.push({ ...input.despues, momento: "despues" })

    const { error } = await supabase.from("s5_acciones_evidencias").insert({
      accion_id: accionId,
      comentario,
      autor_id: profile.id,
      ...columnasArchivos(fotos),
    })
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la evidencia" }
  }
}

export async function borrarEvidencia5S(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.from("s5_acciones_evidencias").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando la evidencia" }
  }
}

export async function getEvidenciaSectorUrl(
  path: string
): Promise<{ data: { url: string } } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from("s5-auditorias")
      .createSignedUrl(path, 60 * 10)
    if (error) return { error: error.message }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando URL" }
  }
}

// ===================================================
// Panel del auditor
// ===================================================

export interface SectorConEvidencias {
  sector_numero: number
  sector_nombre: string
  responsable_nombre: string | null
  tareas: TareaSector[]
  evidencias: EvidenciaSector[]
  documentacion: ResumenDocumentacion
}

export async function getPanelSectores5S(
  periodo: string
): Promise<{ data: SectorConEvidencias[] } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const [sectoresRes, respRes, accionesRes] = await Promise.all([
      supabase.from("s5_sectores_almacen").select("*").order("numero"),
      supabase
        .from("s5_sector_responsables")
        .select(
          "sector_numero, empleado:empleados!s5_sector_responsables_empleado_id_fkey(nombre, profile_id)"
        )
        .eq("periodo", periodo),
      supabase
        .from("s5_acciones")
        .select("id, sector_numero, descripcion, estado, fecha_compromiso, cerrada_at, creado_por")
        .eq("tipo", "almacen")
        .order("fecha_compromiso", { ascending: true, nullsFirst: false }),
    ])

    const respPorSector = new Map<number, { nombre: string | null; profileId: string | null }>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (respRes.data ?? []) as any[]) {
      respPorSector.set(r.sector_numero, {
        nombre: r.empleado?.nombre ?? null,
        profileId: r.empleado?.profile_id ?? null,
      })
    }

    const finMes = finDeMes(periodo)
    const data: SectorConEvidencias[] = []

    for (const s of sectoresRes.data ?? []) {
      const { evidencias } = await evidenciasDelMes(supabase, periodo, s.numero, profile.id)
      const porAccion = new Map<string, EvidenciaSector[]>()
      for (const e of evidencias) {
        const arr = porAccion.get(e.accion_id) ?? []
        arr.push(e)
        porAccion.set(e.accion_id, arr)
      }
      const libre = descripcionLibre(periodo, s.numero)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tareas: TareaSector[] = ((accionesRes.data ?? []) as any[])
        .filter((a) => a.sector_numero === s.numero)
        .filter(
          (a) =>
            a.estado !== "cerrada" ||
            (a.cerrada_at && a.cerrada_at >= `${periodo}T00:00:00` && a.cerrada_at <= `${finMes}T23:59:59`),
        )
        .map((a) => {
          const evs = porAccion.get(a.id) ?? []
          return {
            id: a.id,
            descripcion: a.descripcion,
            estado: a.estado,
            fecha_compromiso: a.fecha_compromiso,
            es_libre: a.descripcion === libre,
            es_mia: a.creado_por === profile.id,
            evidencias: evs.length,
            completas: evs.filter((e) => esCompleta(e.fotos)).length,
          }
        })

      const resp = respPorSector.get(s.numero)
      data.push({
        sector_numero: s.numero,
        sector_nombre: s.nombre,
        responsable_nombre: resp?.nombre ?? null,
        tareas,
        evidencias,
        documentacion: resumirDocumentacion(evidencias, resp?.profileId ?? null),
      })
    }

    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el panel" }
  }
}

/**
 * Documentación de un sector en un mes. La usa la pantalla de auditoría para
 * mostrar (y aplicar) el bonus antes de finalizar.
 */
export async function getDocumentacionSector(
  periodo: string,
  sector: number
): Promise<{ data: { resumen: ResumenDocumentacion; evidencias: EvidenciaSector[] } } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const [{ evidencias }, resp] = await Promise.all([
      evidenciasDelMes(supabase, periodo, sector, profile.id),
      responsableDelSector(supabase, periodo, sector),
    ])
    return {
      data: { resumen: resumirDocumentacion(evidencias, resp.profileId), evidencias },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando la documentación" }
  }
}

export async function crearTareaSector(input: {
  periodo: string
  sectorNumero: number
  titulo: string
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "auditor") {
      return { error: "No tenés permiso" }
    }
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Escribí la tarea" }

    const supabase = await createClient()

    // El responsable del mes queda como dueño de la tarea.
    const { data: resp } = await supabase
      .from("s5_sector_responsables")
      .select("empleado:empleados!s5_sector_responsables_empleado_id_fkey(profile_id)")
      .eq("periodo", input.periodo)
      .eq("sector_numero", input.sectorNumero)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responsableId = (resp as any)?.empleado?.profile_id ?? null

    const { error } = await supabase.from("s5_acciones").insert({
      tipo: "almacen",
      sector_numero: input.sectorNumero,
      descripcion: titulo,
      responsable_id: responsableId,
      fecha_compromiso: finDeMes(input.periodo),
      estado: "no_comenzada",
      creado_por: profile.id,
    })
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la tarea" }
  }
}

export async function borrarTareaSector(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "auditor") {
      return { error: "No tenés permiso" }
    }
    const supabase = await createClient()
    const { error } = await supabase.from("s5_acciones").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando la tarea" }
  }
}
