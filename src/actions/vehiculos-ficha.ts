"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { fetchVehicles } from "@/lib/cloudfleet/client"
import type {
  VehiculoFicha,
  VehiculoDocumento,
  VehiculoDocumentoTipo,
  CampoFicha,
} from "@/types/database"

const BUCKET = "vehiculos-fichas"

type Result<T> = { data: T } | { error: string }

// Campos de la ficha que se pueden editar a mano y que el sync de Cloudfleet
// completa SOLO cuando están vacíos (nunca pisa lo cargado en la app).
// (La lista es local: "use server" no puede exportar const/type.)
const CAMPOS_FICHA: CampoFicha[] = [
  "marca",
  "modelo",
  "anio",
  "color",
  "tipo_unidad",
  "combustible",
  "combustible_aux",
  "chasis",
  "vin",
  "motor",
  "capacidad_carga",
  "carroceria",
  "ciudad",
  "centro_costo",
  "chofer_asignado",
  "notas",
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fichaConFotoUrl(supabase: any, ficha: VehiculoFicha): VehiculoFicha {
  if (!ficha.foto_path) return { ...ficha, foto_url: null }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ficha.foto_path)
  return { ...ficha, foto_url: pub.publicUrl as string }
}

// ==================== LEER FICHA + DOCUMENTOS ====================

export async function getFichaVehiculo(
  dominio: string
): Promise<Result<{ ficha: VehiculoFicha | null; documentos: VehiculoDocumento[] }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const dom = dominio.trim().toUpperCase()

    const [{ data: ficha, error: fichaError }, { data: docs, error: docsError }] =
      await Promise.all([
        supabase.from("vehiculos_ficha").select("*").eq("dominio", dom).maybeSingle(),
        supabase
          .from("vehiculos_documentos")
          .select("*")
          .eq("dominio", dom)
          .order("created_at"),
      ])

    if (fichaError) return { error: fichaError.message }
    if (docsError) return { error: docsError.message }

    const documentos = ((docs || []) as VehiculoDocumento[]).map((d) => {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(d.storage_path)
      return { ...d, url: pub.publicUrl as string }
    })

    return {
      data: {
        ficha: ficha ? fichaConFotoUrl(supabase, ficha as VehiculoFicha) : null,
        documentos,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SYNC DESDE CLOUDFLEET ====================

function limpio(v: string | null | undefined): string | null {
  const s = (v ?? "").trim()
  return s ? s : null
}

/**
 * Trae la ficha técnica de la unidad desde Cloudfleet (match por `code` ==
 * dominio) y completa los campos VACÍOS de la ficha local — lo editado a mano
 * en la app nunca se pisa (para re-traer un campo: vaciarlo y sincronizar).
 * El odómetro de Cloudfleet y la fecha de sync se actualizan siempre.
 */
export async function syncFichaCloudfleet(
  dominio: string
): Promise<Result<{ ficha: VehiculoFicha; completados: string[]; sinDatoEnCf: string[] }>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const dom = dominio.trim().toUpperCase()

    const vehiculos = await fetchVehicles()
    const cf = vehiculos.find((v) => (v.code || "").trim().toUpperCase() === dom)
    if (!cf) {
      return { error: `La unidad ${dom} no existe en Cloudfleet (no hay vehículo con ese código).` }
    }

    // Valores que ofrece Cloudfleet, mapeados a los campos de la ficha
    const desdeCf: Record<CampoFicha, string | null> = {
      marca: limpio(cf.brandName),
      modelo: limpio(cf.lineName),
      anio: limpio(cf.year),
      color: limpio(cf.color),
      tipo_unidad: limpio(cf.typeName),
      combustible: limpio(cf.mainFuelType),
      combustible_aux: limpio(cf.auxFuelType),
      chasis: limpio(cf.chassisNumber),
      vin: limpio(cf.vin),
      motor: limpio(cf.engine),
      capacidad_carga:
        cf.weightCapacity?.value != null
          ? `${cf.weightCapacity.value} ${cf.weightCapacity.unit || ""}`.trim()
          : null,
      carroceria: limpio(cf.bodyType),
      ciudad: limpio(cf.city?.name),
      centro_costo: limpio(cf.costCenter?.name),
      chofer_asignado: limpio(cf.driver?.name),
      notas: limpio(cf.commentGroupingData),
    }

    const { data: existente } = await supabase
      .from("vehiculos_ficha")
      .select("*")
      .eq("dominio", dom)
      .maybeSingle()

    const fila: Record<string, unknown> = {
      dominio: dom,
      cloudfleet_id: cf.id,
      cf_odometro: cf.odometer?.lastMeter ?? cf.hourmeter?.lastMeter ?? null,
      cf_odometro_fecha: cf.odometer?.lastMeterAt ?? cf.hourmeter?.lastMeterAt ?? null,
      cf_synced_at: new Date().toISOString(),
    }

    const completados: string[] = []
    const sinDatoEnCf: string[] = []
    for (const campo of CAMPOS_FICHA) {
      const local = limpio((existente as Record<string, string | null> | null)?.[campo] ?? null)
      if (local) continue // editado/cargado en la app: no se pisa
      if (desdeCf[campo]) {
        fila[campo] = desdeCf[campo]
        completados.push(campo)
      } else {
        sinDatoEnCf.push(campo)
      }
    }

    const { data, error } = await supabase
      .from("vehiculos_ficha")
      .upsert(fila, { onConflict: "dominio" })
      .select()
      .single()

    if (error) return { error: error.message }
    revalidatePath(`/vehiculos/${dom}`)
    return {
      data: {
        ficha: fichaConFotoUrl(supabase, data as VehiculoFicha),
        completados,
        sinDatoEnCf,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== EDICIÓN MANUAL ====================

export async function actualizarFichaVehiculo(
  dominio: string,
  campos: Partial<Record<CampoFicha, string | null>>
): Promise<Result<VehiculoFicha>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const dom = dominio.trim().toUpperCase()

    const fila: Record<string, unknown> = {
      dominio: dom,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }
    for (const campo of CAMPOS_FICHA) {
      if (campo in campos) fila[campo] = limpio(campos[campo] ?? null)
    }

    const { data, error } = await supabase
      .from("vehiculos_ficha")
      .upsert(fila, { onConflict: "dominio" })
      .select()
      .single()

    if (error) return { error: error.message }
    revalidatePath(`/vehiculos/${dom}`)
    return { data: fichaConFotoUrl(supabase, data as VehiculoFicha) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Registra la foto de la unidad. El archivo ya fue subido por el cliente
 * directo al bucket (comprimido con canvas); acá solo llega el storage path.
 * Si había una foto anterior, se borra del bucket.
 */
export async function setFotoVehiculo(
  dominio: string,
  storagePath: string
): Promise<Result<VehiculoFicha>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const dom = dominio.trim().toUpperCase()

    const { data: existente } = await supabase
      .from("vehiculos_ficha")
      .select("foto_path")
      .eq("dominio", dom)
      .maybeSingle()

    const { data, error } = await supabase
      .from("vehiculos_ficha")
      .upsert(
        {
          dominio: dom,
          foto_path: storagePath,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "dominio" }
      )
      .select()
      .single()

    if (error) return { error: error.message }

    const fotoAnterior = (existente as { foto_path: string | null } | null)?.foto_path
    if (fotoAnterior && fotoAnterior !== storagePath) {
      await supabase.storage.from(BUCKET).remove([fotoAnterior])
    }

    revalidatePath(`/vehiculos/${dom}`)
    return { data: fichaConFotoUrl(supabase, data as VehiculoFicha) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DOCUMENTOS ====================

export async function crearDocumentoVehiculo(input: {
  dominio: string
  nombre: string
  tipo: VehiculoDocumentoTipo
  storagePath: string
  mimeType?: string
  vencimiento?: string | null
}): Promise<Result<VehiculoDocumento>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    if (!input.nombre.trim()) return { error: "El nombre del documento es obligatorio." }

    const { data, error } = await supabase
      .from("vehiculos_documentos")
      .insert({
        dominio: input.dominio.trim().toUpperCase(),
        nombre: input.nombre.trim(),
        tipo: input.tipo,
        storage_path: input.storagePath,
        mime_type: input.mimeType || null,
        vencimiento: input.vencimiento || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    revalidatePath(`/vehiculos/${input.dominio}`)
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.storage_path)
    return { data: { ...(data as VehiculoDocumento), url: pub.publicUrl as string } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarDocumentoVehiculo(
  id: string
): Promise<Result<{ success: true }>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: doc, error: getError } = await supabase
      .from("vehiculos_documentos")
      .delete()
      .eq("id", id)
      .select("dominio, storage_path")
      .single()

    if (getError) return { error: getError.message }
    if (doc?.storage_path) {
      await supabase.storage.from(BUCKET).remove([doc.storage_path])
    }
    if (doc?.dominio) revalidatePath(`/vehiculos/${doc.dominio}`)
    return { data: { success: true } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
