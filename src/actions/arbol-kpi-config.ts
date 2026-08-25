"use server"
/**
 * Configuración por nodo del Árbol de KPI: meta, gatillo y responsable.
 *
 * La topología vive en el código (`@/lib/arbol-kpi/rechazo`) y estos valores en
 * la base, por año. Así la operación ajusta un objetivo sin esperar un deploy —
 * que es lo que pide el punto 4.1 de la auditoría («Planificar performance
 * targets») y lo que hace el Árbol del Sueño con `sueno_kpi_valores`.
 *
 * La `metaDefault` del código queda como fallback: si nadie cargó nada, el nodo
 * sigue mostrando el objetivo con el que se diseñó.
 */

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"

const ARBOL = "rechazo"
const RUTA = "/arbol-kpi"
const ROLES_EDICION = ["admin", "supervisor", "admin_rrhh"]

export interface NodoConfig {
  nodoKey: string
  meta: number | null
  gatillo: number | null
  responsableId: string | null
  responsableNombre: string | null
  nota: string | null
  updatedAt: string | null
}

type Result<T> = { data: T } | { error: string }

/** Config de todos los nodos del año, indexada por key. */
export async function getArbolKpiConfig(
  anio?: number,
): Promise<Record<string, NodoConfig>> {
  try {
    await requireAuth()
    const sb = await createClient()
    const year = anio ?? new Date().getFullYear()
    const { data, error } = await sb
      .from("arbol_kpi_config")
      .select(
        "nodo_key, meta, gatillo, responsable_id, nota, updated_at, responsable:profiles!arbol_kpi_config_responsable_id_fkey(nombre)",
      )
      .eq("arbol", ARBOL)
      .eq("anio", year)
    if (error) return {}

    const out: Record<string, NodoConfig> = {}
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const resp = row.responsable as { nombre?: string } | null
      out[String(row.nodo_key)] = {
        nodoKey: String(row.nodo_key),
        meta: row.meta == null ? null : Number(row.meta),
        gatillo: row.gatillo == null ? null : Number(row.gatillo),
        responsableId: (row.responsable_id as string) ?? null,
        responsableNombre: resp?.nombre ?? null,
        nota: (row.nota as string) ?? null,
        updatedAt: (row.updated_at as string) ?? null,
      }
    }
    return out
  } catch {
    // Query tolerante: sin config el árbol se dibuja igual con las metas del
    // código. Si la tabla todavía no está aplicada, la pantalla no se cae.
    return {}
  }
}

/**
 * Guarda (o limpia) la configuración de un nodo. Un campo ausente en el
 * FormData no se toca; uno presente y vacío se guarda como NULL.
 */
export async function guardarNodoConfig(
  nodoKey: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!ROLES_EDICION.includes(profile.role)) {
      return { error: "No tenés permiso para cambiar los objetivos del árbol." }
    }
    const sb = await createClient()
    const anio = Number(formData.get("anio")) || new Date().getFullYear()

    const numeroOpcional = (campo: string): number | null | undefined => {
      if (!formData.has(campo)) return undefined
      const crudo = String(formData.get(campo) ?? "").trim()
      if (crudo === "") return null
      const n = Number(crudo.replace(",", "."))
      return Number.isFinite(n) ? n : null
    }
    const textoOpcional = (campo: string): string | null | undefined => {
      if (!formData.has(campo)) return undefined
      const crudo = String(formData.get(campo) ?? "").trim()
      return crudo === "" ? null : crudo
    }

    const fila: Record<string, unknown> = {
      arbol: ARBOL,
      nodo_key: nodoKey,
      anio,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    }
    const meta = numeroOpcional("meta")
    if (meta !== undefined) fila.meta = meta
    const gatillo = numeroOpcional("gatillo")
    if (gatillo !== undefined) fila.gatillo = gatillo
    const responsable = textoOpcional("responsable_id")
    if (responsable !== undefined) fila.responsable_id = responsable
    const nota = textoOpcional("nota")
    if (nota !== undefined) fila.nota = nota

    const { error } = await sb
      .from("arbol_kpi_config")
      .upsert(fila, { onConflict: "arbol,nodo_key,anio" })
    if (error) return { error: error.message }

    revalidatePath(RUTA)
    return { data: { ok: true } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
