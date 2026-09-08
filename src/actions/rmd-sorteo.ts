"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  RMD_SORTEO_CAMPANIA,
  normalizarNombre,
  type InscripcionSorteoInput,
} from "@/lib/rmd-sorteo"

type Result<T> = { data: T } | { error: string }

export interface InscripcionSorteoRmd {
  id: string
  campania: string
  nombre_pdv: string
  cod_cliente: number | null
  /** Cliente que sugiere el nombre cuando el PDV no cargó su número. */
  cod_sugerido: number | null
  nombre_sugerido: string | null
  direccion: string
  localidad: string
  nombre_contacto: string
  telefono: string
  declara_califico: boolean
  created_at: string
  /** Entregas calificadas en BEES desde el día de la inscripción. */
  votos_desde: number
  ultima_puntuacion: number | null
  ultima_puntuacion_fecha: string | null
  /** Inscripto + calificó al menos una entrega desde que se inscribió. */
  participa: boolean
}

function limpiar(s: unknown, max: number): string {
  return typeof s === "string"
    ? s.replace(/\s+/g, " ").trim().slice(0, max)
    : ""
}

// ------------------------------------------------------------------
// Alta pública (QR del folleto): sin login, escribe con service_role.
// ------------------------------------------------------------------
export async function inscribirSorteoRmd(
  input: InscripcionSorteoInput,
): Promise<{ ok: true; repetido: boolean } | { error: string }> {
  try {
    // Honeypot: si vino completo es un bot. Contestamos ok para no dar pistas.
    if (input.web && input.web.trim() !== "")
      return { ok: true, repetido: false }

    const nombre_pdv = limpiar(input.nombre_pdv, 120)
    const direccion = limpiar(input.direccion, 160)
    const localidad = limpiar(input.localidad, 80)
    const nombre_contacto = limpiar(input.nombre_contacto, 80)
    const telefono = limpiar(input.telefono, 30).replace(/[^\d+\s()-]/g, "")
    const codRaw = limpiar(input.cod_cliente, 12).replace(/\D/g, "")
    const cod_cliente = codRaw ? Number(codRaw) : null

    if (nombre_pdv.length < 2)
      return { error: "Escribí el nombre del negocio." }
    if (direccion.length < 3)
      return { error: "Escribí la dirección del negocio." }
    if (localidad.length < 2) return { error: "Escribí la localidad." }
    if (nombre_contacto.length < 2) return { error: "Escribí tu nombre." }
    if (telefono.replace(/\D/g, "").length < 6)
      return { error: "Escribí un teléfono o WhatsApp válido." }
    if (cod_cliente != null && (cod_cliente <= 0 || cod_cliente > 99_999_999))
      return { error: "El número de cliente no parece válido." }

    const supabase = createAdminClient()

    // Un PDV por campaña: mismo teléfono o mismo código → ya está inscripto.
    const telDigits = telefono.replace(/\D/g, "")
    const { data: previas } = await supabase
      .from("rmd_sorteo_inscripciones")
      .select("id, telefono, cod_cliente")
      .eq("campania", RMD_SORTEO_CAMPANIA)
    const repetida = (
      (previas ?? []) as Array<{ telefono: string; cod_cliente: number | null }>
    ).some(
      (p) =>
        (cod_cliente != null && p.cod_cliente === cod_cliente) ||
        p.telefono.replace(/\D/g, "") === telDigits,
    )
    if (repetida) return { ok: true, repetido: true }

    let user_agent: string | null = null
    try {
      user_agent = (await headers()).get("user-agent")?.slice(0, 300) ?? null
    } catch {
      user_agent = null
    }

    const { error } = await supabase.from("rmd_sorteo_inscripciones").insert({
      campania: RMD_SORTEO_CAMPANIA,
      nombre_pdv,
      cod_cliente,
      direccion,
      localidad,
      nombre_contacto,
      telefono,
      declara_califico: !!input.declara_califico,
      user_agent,
    })
    if (error)
      return { error: "No pudimos guardar la inscripción. Probá de nuevo." }
    return { ok: true, repetido: false }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

// ------------------------------------------------------------------
// Listado para la solapa Cobertura de RMD (con el cruce contra el RMD).
// ------------------------------------------------------------------
export async function listarInscripcionesSorteoRmd(): Promise<
  Result<InscripcionSorteoRmd[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("rmd_sorteo_inscripciones")
      .select(
        "id, campania, nombre_pdv, cod_cliente, direccion, localidad, nombre_contacto, telefono, declara_califico, created_at",
      )
      .eq("campania", RMD_SORTEO_CAMPANIA)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const filas = (data ?? []) as Array<{
      id: string
      campania: string
      nombre_pdv: string
      cod_cliente: number | null
      direccion: string
      localidad: string
      nombre_contacto: string
      telefono: string
      declara_califico: boolean
      created_at: string
    }>
    if (filas.length === 0) return { data: [] }

    // Sugerir el cliente por nombre para los que no cargaron el número.
    const sinCodigo = filas.filter((f) => f.cod_cliente == null)
    const sugerencias = new Map<string, { cod: number; nombre: string }>()
    if (sinCodigo.length > 0) {
      const { data: cats } = await supabase
        .from("v_rmd_cobertura_cliente")
        .select("cod_cliente, nombre_cliente, localidad")
      const catalogo = (
        (cats ?? []) as Array<{
          cod_cliente: number
          nombre_cliente: string | null
          localidad: string | null
        }>
      )
        .filter((c) => c.nombre_cliente)
        .map((c) => ({
          cod: c.cod_cliente,
          nombre: c.nombre_cliente as string,
          norm: normalizarNombre(c.nombre_cliente as string),
          loc: normalizarNombre(c.localidad ?? ""),
        }))
      for (const f of sinCodigo) {
        const n = normalizarNombre(f.nombre_pdv)
        if (n.length < 4) continue
        const loc = normalizarNombre(f.localidad)
        const candidatos = catalogo.filter(
          (c) => c.norm === n || c.norm.includes(n) || n.includes(c.norm),
        )
        // Si hay varios, preferir el de la misma localidad; si sigue ambiguo, no sugerir.
        const filtrados =
          candidatos.length > 1
            ? candidatos.filter((c) => loc && c.loc.includes(loc))
            : candidatos
        if (filtrados.length === 1)
          sugerencias.set(f.id, {
            cod: filtrados[0].cod,
            nombre: filtrados[0].nombre,
          })
      }
    }

    // Cruce con el RMD: puntuaciones desde el día de la inscripción.
    const codigos = [
      ...new Set(
        filas
          .map((f) => f.cod_cliente ?? sugerencias.get(f.id)?.cod ?? null)
          .filter((x): x is number => x != null),
      ),
    ]
    const votos = new Map<number, Array<{ fecha: string; punt: number }>>()
    if (codigos.length > 0) {
      const desde = filas[filas.length - 1].created_at.slice(0, 10)
      const { data: rmd } = await supabase
        .from("nps_rmd_cliente")
        .select("cod_cliente, fecha_puntuacion, puntuacion")
        .in("cod_cliente", codigos)
        .gte("fecha_puntuacion", desde)
        .order("fecha_puntuacion", { ascending: true })
      for (const r of (rmd ?? []) as Array<{
        cod_cliente: number
        fecha_puntuacion: string
        puntuacion: number
      }>) {
        const arr = votos.get(r.cod_cliente) ?? []
        arr.push({ fecha: r.fecha_puntuacion, punt: r.puntuacion })
        votos.set(r.cod_cliente, arr)
      }
    }

    const out: InscripcionSorteoRmd[] = filas.map((f) => {
      const sug = sugerencias.get(f.id) ?? null
      const cod = f.cod_cliente ?? sug?.cod ?? null
      const diaInscripcion = f.created_at.slice(0, 10)
      const vs =
        cod != null
          ? (votos.get(cod) ?? []).filter((v) => v.fecha >= diaInscripcion)
          : []
      const ultima = vs[vs.length - 1] ?? null
      return {
        ...f,
        cod_sugerido: sug?.cod ?? null,
        nombre_sugerido: sug?.nombre ?? null,
        votos_desde: vs.length,
        ultima_puntuacion: ultima?.punt ?? null,
        ultima_puntuacion_fecha: ultima?.fecha ?? null,
        participa: vs.length > 0,
      }
    })
    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}
