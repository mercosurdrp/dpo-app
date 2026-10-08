"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"

/**
 * Biblioteca de SOPs del portal del empleado: todos los SOPs vigentes de la
 * app, de cualquier pilar, para que cualquiera los pueda leer.
 *
 * Los SOPs viven en dos lados y se juntan acá:
 *  - `dpo_archivos` (Documentos DPO por pilar/punto): categoría "SOP", más los
 *    que se subieron como "Otro"/"Reporte"/"Informe" pero son un SOP, una
 *    política o un procedimiento (se reconocen por el título).
 *  - `sops` (pestaña SOPs de cada pilar, bucket público `sops`).
 * Si el mismo documento está en los dos, gana el de `dpo_archivos` (tiene
 * versionado y PDF generado).
 *
 * Se lee con el cliente admin: el empleado no tiene RLS sobre esas tablas y
 * lo único que se expone es el listado; el archivo se abre por
 * /api/sops-empleado, que firma un link corto.
 */

export type SopOrigen = "a" | "s"

export interface SopEmpleado {
  origen: SopOrigen
  id: string
  pilar: string
  punto: string | null
  titulo: string
  ext: string
  version: number | null
  actualizado: string | null
}

export interface PilarSops {
  codigo: string
  nombre: string
  color: string
  sops: SopEmpleado[]
}

const CATEGORIAS_EXTRA = new Set(["Otro", "Reporte", "Informe"])
const TITULO_SOP = /^\s*(sop|pol[ií]tica|procedimiento)\b/i

function codigoPilar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/** Clave para detectar el mismo SOP cargado en las dos tablas. */
function claveTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(docx?|pdf|pptx?|xlsx?)$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function extDe(nombre: string | null | undefined): string {
  const m = (nombre ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

/** "1.10" va después de "1.9". */
function compararPunto(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export async function getSopsEmpleado(): Promise<{ data: PilarSops[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = createAdminClient()

    const [pilaresRes, archivosRes, sopsRes] = await Promise.all([
      supabase.from("pilares").select("id, nombre, color, orden").order("orden"),
      supabase
        .from("dpo_archivos")
        .select("id, pilar_codigo, punto_codigo, titulo, categoria, file_ext, file_name, current_version, updated_at")
        .eq("archivado", false)
        .is("deleted_at", null),
      supabase.from("sops").select("id, pilar_id, nombre, file_name, version, updated_at"),
    ])

    if (pilaresRes.error) return { error: pilaresRes.error.message }
    if (archivosRes.error) return { error: archivosRes.error.message }
    if (sopsRes.error) return { error: sopsRes.error.message }

    type PilarRow = { id: string; nombre: string; color: string | null; orden: number }
    const pilares = (pilaresRes.data ?? []) as PilarRow[]
    const codigoPorId = new Map(pilares.map((p) => [p.id, codigoPilar(p.nombre)]))

    const lista: SopEmpleado[] = []
    const vistos = new Set<string>()

    type ArchivoRow = {
      id: string
      pilar_codigo: string
      punto_codigo: string | null
      titulo: string
      categoria: string
      file_ext: string | null
      file_name: string | null
      current_version: number | null
      updated_at: string | null
    }
    for (const a of (archivosRes.data ?? []) as ArchivoRow[]) {
      const esSop = a.categoria === "SOP" || (CATEGORIAS_EXTRA.has(a.categoria) && TITULO_SOP.test(a.titulo))
      if (!esSop) continue
      const titulo = a.titulo.trim()
      vistos.add(`${a.pilar_codigo}|${claveTitulo(titulo)}`)
      lista.push({
        origen: "a",
        id: a.id,
        pilar: a.pilar_codigo,
        punto: a.punto_codigo,
        titulo,
        ext: (a.file_ext ?? extDe(a.file_name)).toLowerCase(),
        version: a.current_version,
        actualizado: a.updated_at,
      })
    }

    type SopRow = {
      id: string
      pilar_id: string
      nombre: string
      file_name: string | null
      version: number | null
      updated_at: string | null
    }
    for (const s of (sopsRes.data ?? []) as SopRow[]) {
      const pilar = codigoPorId.get(s.pilar_id)
      if (!pilar) continue
      const titulo = s.nombre.trim()
      if (vistos.has(`${pilar}|${claveTitulo(titulo)}`)) continue
      lista.push({
        origen: "s",
        id: s.id,
        pilar,
        punto: null,
        titulo,
        ext: extDe(s.file_name),
        version: s.version,
        actualizado: s.updated_at,
      })
    }

    const data: PilarSops[] = pilares.map((p) => {
      const codigo = codigoPilar(p.nombre)
      return {
        codigo,
        nombre: p.nombre,
        color: p.color ?? "#64748b",
        sops: lista
          .filter((s) => s.pilar === codigo)
          .sort((x, y) => compararPunto(x.punto, y.punto) || x.titulo.localeCompare(y.titulo, "es")),
      }
    })

    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los SOPs" }
  }
}
