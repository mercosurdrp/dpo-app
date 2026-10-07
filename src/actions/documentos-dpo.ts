"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * SOPs y SLAs del pilar Flota, a mano en el módulo.
 *
 * Los documentos viven en dos lugares distintos y lejos del trabajo diario: los
 * SOP en `/pilares` → Flota → SOPs y los SLA en `/sla`. Cuando el auditor
 * pregunta "¿y el procedimiento de esto?" había que salir del módulo, acordarse
 * de en cuál de las dos pantallas estaba y buscarlo entre los de todos los
 * pilares. Esto los trae al lado de la evidencia que respaldan.
 *
 * El vínculo documento → punto del DPO ya existía en los datos, sólo que sin
 * leer: el SOP lo declara en su descripción ("Punto DPO 2.3 · Flota") y el SLA
 * en `requisito_manual` ("R2.3.x"). De ahí sale el número de punto, sin agregar
 * ninguna tabla nueva ni pedir que alguien lo cargue dos veces.
 */
export interface DocumentoDpo {
  id: string
  tipo: "sop" | "sla"
  nombre: string
  /** Puntos del pilar a los que responde, ej. ["2.3"]. */
  puntos: string[]
  /** Requisitos declarados, cuando el documento los nombra. */
  requisitos: string[]
  descripcion: string | null
  /** Dónde se abre: el archivo del SOP, o la pantalla de SLAs. */
  href: string
  /** Borrador / vigente para los SOP; el estado cargado para los SLA. */
  estado: string
  /** Última actualización (SOP) o fecha de firma (SLA). */
  fecha: string | null
}

/** "Punto DPO 2.3 · Flota" → ["2.3"] · "R2.3.x" / "R3.1.4 / R3.1.5" → ["2.3"] / ["3.1"]. */
function puntosDeTexto(...textos: (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const t of textos) {
    if (!t) continue
    for (const m of t.matchAll(/(?:Punto DPO|R)\s*(\d+)\.(\d+)/gi)) {
      out.add(`${m[1]}.${m[2]}`)
    }
  }
  return [...out].sort()
}

/** Los requisitos que el texto nombra tal cual ("R2.3.2"), sin los genéricos. */
function requisitosDeTexto(texto: string | null | undefined): string[] {
  if (!texto) return []
  return [...new Set([...texto.matchAll(/R\d+\.\d+\.[\dx]+/gi)].map((m) => m[0].toUpperCase()))]
}

export async function getDocumentosFlota(): Promise<
  { data: DocumentoDpo[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: pilar } = await supabase
      .from("pilares")
      .select("id")
      .ilike("nombre", "flota")
      .maybeSingle()

    const [sopRes, slaRes] = await Promise.all([
      pilar?.id
        ? supabase
            .from("sops")
            .select("id, nombre, descripcion, file_path, updated_at, created_at")
            .eq("pilar_id", pilar.id)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("slas")
        .select("id, codigo, nombre, descripcion, requisito_manual, estado, fecha_firma, orden")
        .eq("pilar", "flota"),
    ])
    if (sopRes.error) return { error: sopRes.error.message }
    if (slaRes.error) return { error: slaRes.error.message }

    type SopRow = {
      id: string
      nombre: string
      descripcion: string | null
      file_path: string | null
      updated_at: string | null
      created_at: string | null
    }
    const sops: DocumentoDpo[] = ((sopRes.data || []) as unknown as SopRow[]).map((s) => ({
      id: s.id,
      tipo: "sop" as const,
      nombre: s.nombre,
      puntos: puntosDeTexto(s.descripcion),
      requisitos: requisitosDeTexto(s.descripcion),
      descripcion: s.descripcion,
      href: s.file_path
        ? supabase.storage.from("sops").getPublicUrl(s.file_path).data.publicUrl
        : "/pilares",
      // El estado no es un campo: los SOP del pilar lo dicen en la descripción,
      // que es donde se viene anotando la revisión desde julio.
      estado: /borrador/i.test(s.descripcion ?? "") ? "borrador" : "vigente",
      fecha: (s.updated_at ?? s.created_at)?.slice(0, 10) ?? null,
    }))

    type SlaRow = {
      id: string
      nombre: string
      descripcion: string | null
      requisito_manual: string | null
      estado: string
      fecha_firma: string | null
      orden: number | null
    }
    const slas: DocumentoDpo[] = ((slaRes.data || []) as unknown as SlaRow[]).map((s) => ({
      id: s.id,
      tipo: "sla" as const,
      nombre: s.nombre,
      puntos: puntosDeTexto(s.requisito_manual),
      requisitos: requisitosDeTexto(s.requisito_manual),
      descripcion: s.descripcion?.replace(/\s+/g, " ").trim() ?? null,
      href: "/sla",
      estado: s.estado,
      fecha: s.fecha_firma,
    }))

    // Por punto, y dentro del punto el SOP antes que el SLA: primero el
    // procedimiento, después el acuerdo de servicio.
    const orden = (d: DocumentoDpo) => `${d.puntos[0] ?? "zz"}|${d.tipo === "sop" ? 0 : 1}`
    return { data: [...sops, ...slas].sort((a, b) => orden(a).localeCompare(orden(b))) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
