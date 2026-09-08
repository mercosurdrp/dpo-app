"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  archivosDelForm,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"
import {
  RMD_SORTEO_CAMPANIA,
  RMD_SORTEO_PREMIO,
  normalizarNombre,
  type InscripcionSorteoInput,
} from "@/lib/rmd-sorteo"

type Result<T> = { data: T } | { error: string }

/** Bucket compartido con los planes RMD; las fotos van bajo sorteo/<id>/. */
const BUCKET = "rmd-planes"

export type EstadoInscripcion = "participa" | "todavia_no" | "sin_cruzar"

export interface InscripcionSorteoRmd {
  id: string
  campania: string
  nombre_pdv: string
  cod_cliente: number | null
  /** Cliente resuelto: el cargado o el deducido por nombre. */
  cod_cliente_resuelto: number | null
  codigo_origen: "cargado" | "por_nombre" | null
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
  estado: EstadoInscripcion
}

export interface ResumenSorteoRmd {
  total: number
  participan: number
  todavia_no: number
  sin_cruzar: number
}

export interface GanadorSorteoRmd {
  id: string
  campania: string
  inscripcion_id: string
  premio: string
  participantes: number
  sorteado_en: string
  sorteado_por_nombre: string | null
  entregado_en: string | null
  entregado_por_nombre: string | null
  observaciones: string | null
  archivos: ArchivoAvance[]
  // datos del inscripto
  nombre_pdv: string
  cod_cliente_resuelto: number | null
  direccion: string
  localidad: string
  nombre_contacto: string
  telefono: string
}

const COLS_INSCRIPCION =
  "id, campania, nombre_pdv, cod_cliente, cod_cliente_resuelto, codigo_origen, nombre_sugerido, direccion, localidad, nombre_contacto, telefono, declara_califico, created_at, votos_desde, ultima_puntuacion, ultima_puntuacion_fecha, estado"

function limpiar(s: unknown, max: number): string {
  return typeof s === "string"
    ? s.replace(/\s+/g, " ").trim().slice(0, max)
    : ""
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

/**
 * Busca el cliente que corresponde a un nombre de negocio + localidad en la
 * base de encuestados del año. Sólo devuelve algo si la coincidencia es única.
 */
async function sugerirCliente(
  supabase: ReturnType<typeof createAdminClient>,
  nombre_pdv: string,
  localidad: string,
): Promise<{ cod: number; nombre: string } | null> {
  const n = normalizarNombre(nombre_pdv)
  if (n.length < 4) return null
  // La palabra más larga acota la consulta; el resto se compara en memoria.
  const palabra = n.split(" ").sort((a, b) => b.length - a.length)[0]
  if (!palabra || palabra.length < 3) return null

  const { data } = await supabase
    .from("v_rmd_cobertura_cliente")
    .select("cod_cliente, nombre_cliente, localidad")
    .ilike("nombre_cliente", `%${palabra}%`)
    .limit(200)
  const cat = (
    (data ?? []) as Array<{
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

  const loc = normalizarNombre(localidad)
  const candidatos = cat.filter(
    (c) => c.norm === n || c.norm.includes(n) || n.includes(c.norm),
  )
  const filtrados =
    candidatos.length > 1
      ? candidatos.filter((c) => loc && c.loc.includes(loc))
      : candidatos
  return filtrados.length === 1
    ? { cod: filtrados[0].cod, nombre: filtrados[0].nombre }
    : null
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
    const telDigits = telefono.replace(/\D/g, "")
    if (telDigits.length < 6)
      return { error: "Escribí un teléfono o WhatsApp válido." }
    if (cod_cliente != null && (cod_cliente <= 0 || cod_cliente > 99_999_999))
      return { error: "El número de cliente no parece válido." }

    const supabase = createAdminClient()

    // Un PDV por campaña: mismo código o mismo teléfono → ya está inscripto.
    // El teléfono se compara por sus dígitos, buscando por el final (los
    // últimos 8 alcanzan para acotar; después se compara completo).
    const cola = telDigits.slice(-8)
    const [porCodigo, porTel] = await Promise.all([
      cod_cliente != null
        ? supabase
            .from("rmd_sorteo_inscripciones")
            .select("id")
            .eq("campania", RMD_SORTEO_CAMPANIA)
            .eq("cod_cliente", cod_cliente)
            .limit(1)
        : Promise.resolve({ data: [] as Array<{ id: string }> }),
      supabase
        .from("rmd_sorteo_inscripciones")
        .select("id, telefono")
        .eq("campania", RMD_SORTEO_CAMPANIA)
        .ilike("telefono", `%${cola.split("").join("%")}%`)
        .limit(50),
    ])
    const repetida =
      (porCodigo.data ?? []).length > 0 ||
      ((porTel.data ?? []) as Array<{ telefono: string }>).some(
        (p) => p.telefono.replace(/\D/g, "") === telDigits,
      )
    if (repetida) return { ok: true, repetido: true }

    // Resolver el cliente una sola vez, al inscribirse.
    let cod_cliente_resuelto: number | null = cod_cliente
    let codigo_origen: "cargado" | "por_nombre" | null =
      cod_cliente != null ? "cargado" : null
    let nombre_sugerido: string | null = null
    if (cod_cliente == null) {
      const sug = await sugerirCliente(supabase, nombre_pdv, localidad)
      if (sug) {
        cod_cliente_resuelto = sug.cod
        codigo_origen = "por_nombre"
        nombre_sugerido = sug.nombre
      }
    }

    let user_agent: string | null = null
    try {
      user_agent = (await headers()).get("user-agent")?.slice(0, 300) ?? null
    } catch {
      user_agent = null
    }

    const fila = {
      campania: RMD_SORTEO_CAMPANIA,
      nombre_pdv,
      cod_cliente,
      direccion,
      localidad,
      nombre_contacto,
      telefono,
      declara_califico: !!input.declara_califico,
      user_agent,
    }
    let { error } = await supabase.from("rmd_sorteo_inscripciones").insert({
      ...fila,
      cod_cliente_resuelto,
      codigo_origen,
      nombre_sugerido,
    })
    // Si la segunda migración todavía no está aplicada, las columnas nuevas no
    // existen: se guarda igual sin ellas antes que perder la inscripción.
    if (error && /cod_cliente_resuelto|codigo_origen|nombre_sugerido/.test(error.message)) {
      ;({ error } = await supabase.from("rmd_sorteo_inscripciones").insert(fila))
    }
    if (error)
      return { error: "No pudimos guardar la inscripción. Probá de nuevo." }
    return { ok: true, repetido: false }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

// ------------------------------------------------------------------
// Resumen: cuatro conteos que hace la base (sirve con decenas de miles).
// ------------------------------------------------------------------
export async function resumenSorteoRmd(): Promise<Result<ResumenSorteoRmd>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const base = () =>
      supabase
        .from("v_rmd_sorteo_inscripciones")
        .select("id", { count: "exact", head: true })
        .eq("campania", RMD_SORTEO_CAMPANIA)
    const [t, p, n, s] = await Promise.all([
      base(),
      base().eq("estado", "participa"),
      base().eq("estado", "todavia_no"),
      base().eq("estado", "sin_cruzar"),
    ])
    const err = t.error ?? p.error ?? n.error ?? s.error
    if (err) return { error: err.message }
    return {
      data: {
        total: t.count ?? 0,
        participan: p.count ?? 0,
        todavia_no: n.count ?? 0,
        sin_cruzar: s.count ?? 0,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

// ------------------------------------------------------------------
// Buscador paginado (lo hace la base, con índice trigram).
// ------------------------------------------------------------------
export interface BusquedaInscripciones {
  q?: string
  estado?: EstadoInscripcion | "todos"
  pagina?: number
  porPagina?: number
}

export async function buscarInscripcionesSorteoRmd(
  b: BusquedaInscripciones,
): Promise<Result<{ filas: InscripcionSorteoRmd[]; total: number }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const porPagina = Math.min(Math.max(b.porPagina ?? 20, 5), 100)
    const pagina = Math.max(b.pagina ?? 0, 0)

    let q = supabase
      .from("v_rmd_sorteo_inscripciones")
      .select(COLS_INSCRIPCION, { count: "exact" })
      .eq("campania", RMD_SORTEO_CAMPANIA)
    if (b.estado && b.estado !== "todos") q = q.eq("estado", b.estado)
    const palabras = normalizarNombre(b.q ?? "")
      .split(" ")
      .filter((w) => w.length >= 2)
      .slice(0, 5)
    for (const w of palabras) q = q.ilike("busqueda", `%${w}%`)

    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range(pagina * porPagina, pagina * porPagina + porPagina - 1)
    if (error) return { error: error.message }
    return {
      data: {
        filas: (data ?? []) as unknown as InscripcionSorteoRmd[],
        total: count ?? 0,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

// ------------------------------------------------------------------
// CSV (hasta 50.000 filas, con el filtro vigente).
// ------------------------------------------------------------------
export async function exportarInscripcionesSorteoRmd(
  b: Pick<BusquedaInscripciones, "q" | "estado">,
): Promise<Result<{ csv: string; filas: number }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const palabras = normalizarNombre(b.q ?? "")
      .split(" ")
      .filter((w) => w.length >= 2)
      .slice(0, 5)

    const TOPE = 50_000
    const LOTE = 1_000
    const filas: InscripcionSorteoRmd[] = []
    for (let desde = 0; desde < TOPE; desde += LOTE) {
      let q = supabase
        .from("v_rmd_sorteo_inscripciones")
        .select(COLS_INSCRIPCION)
        .eq("campania", RMD_SORTEO_CAMPANIA)
      if (b.estado && b.estado !== "todos") q = q.eq("estado", b.estado)
      for (const w of palabras) q = q.ilike("busqueda", `%${w}%`)
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(desde, desde + LOTE - 1)
      if (error) return { error: error.message }
      const lote = (data ?? []) as unknown as InscripcionSorteoRmd[]
      filas.push(...lote)
      if (lote.length < LOTE) break
    }

    const celda = (v: unknown) => {
      const s = v == null ? "" : String(v)
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const cab = [
      "fecha_inscripcion",
      "negocio",
      "cod_cliente_cargado",
      "cod_cliente_resuelto",
      "origen_codigo",
      "direccion",
      "localidad",
      "contacto",
      "telefono",
      "declara_califico",
      "entregas_calificadas_desde",
      "ultima_puntuacion",
      "ultima_puntuacion_fecha",
      "estado",
    ]
    const lineas = filas.map((i) =>
      [
        i.created_at.slice(0, 16).replace("T", " "),
        i.nombre_pdv,
        i.cod_cliente ?? "",
        i.cod_cliente_resuelto ?? "",
        i.codigo_origen ?? "",
        i.direccion,
        i.localidad,
        i.nombre_contacto,
        i.telefono,
        i.declara_califico ? "si" : "no",
        i.votos_desde,
        i.ultima_puntuacion ?? "",
        i.ultima_puntuacion_fecha ?? "",
        i.estado,
      ]
        .map(celda)
        .join(";"),
    )
    return {
      data: { csv: [cab.join(";"), ...lineas].join("\r\n"), filas: filas.length },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

// ------------------------------------------------------------------
// Sorteo: elegir un ganador al azar entre los que participan.
// ------------------------------------------------------------------
function mapGanador(r: Record<string, unknown>): GanadorSorteoRmd {
  const ins = (r.inscripcion ?? {}) as Record<string, unknown>
  return {
    id: r.id as string,
    campania: r.campania as string,
    inscripcion_id: r.inscripcion_id as string,
    premio: r.premio as string,
    participantes: r.participantes as number,
    sorteado_en: r.sorteado_en as string,
    sorteado_por_nombre: (r.sorteado_por_nombre as string | null) ?? null,
    entregado_en: (r.entregado_en as string | null) ?? null,
    entregado_por_nombre: (r.entregado_por_nombre as string | null) ?? null,
    observaciones: (r.observaciones as string | null) ?? null,
    archivos: Array.isArray(r.archivos) ? (r.archivos as ArchivoAvance[]) : [],
    nombre_pdv: (ins.nombre_pdv as string) ?? "",
    cod_cliente_resuelto: (ins.cod_cliente_resuelto as number | null) ?? null,
    direccion: (ins.direccion as string) ?? "",
    localidad: (ins.localidad as string) ?? "",
    nombre_contacto: (ins.nombre_contacto as string) ?? "",
    telefono: (ins.telefono as string) ?? "",
  }
}

const SELECT_GANADOR =
  "*, inscripcion:rmd_sorteo_inscripciones!rmd_sorteo_ganadores_inscripcion_id_fkey(nombre_pdv, cod_cliente_resuelto, direccion, localidad, nombre_contacto, telefono)"

export async function listarGanadoresSorteoRmd(): Promise<
  Result<GanadorSorteoRmd[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rmd_sorteo_ganadores")
      .select(SELECT_GANADOR)
      .eq("campania", RMD_SORTEO_CAMPANIA)
      .order("sorteado_en", { ascending: false })
    if (error) return { error: error.message }
    return {
      data: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
        mapGanador,
      ),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function elegirGanadorSorteoRmd(): Promise<
  Result<GanadorSorteoRmd>
> {
  try {
    const profile = await requireAuth()
    if (!isEditorRole(profile.role))
      return { error: "Sólo un supervisor o admin puede sortear." }
    const supabase = await createClient()

    // Los que ya ganaron en esta campaña no vuelven a entrar.
    const { data: previos } = await supabase
      .from("rmd_sorteo_ganadores")
      .select("inscripcion_id")
      .eq("campania", RMD_SORTEO_CAMPANIA)
    const excluidos = new Set(
      ((previos ?? []) as Array<{ inscripcion_id: string }>).map(
        (p) => p.inscripcion_id,
      ),
    )

    const base = () =>
      supabase
        .from("v_rmd_sorteo_inscripciones")
        .select("id", { count: "exact" })
        .eq("campania", RMD_SORTEO_CAMPANIA)
        .eq("estado", "participa")

    const { count, error: e1 } = await base().limit(1)
    if (e1) return { error: e1.message }
    const total = count ?? 0
    if (total === 0)
      return { error: "Todavía no hay inscriptos que hayan calificado en BEES." }
    if (total <= excluidos.size)
      return { error: "Todos los que participan ya ganaron en esta campaña." }

    // Elegir un índice al azar, y si cae en uno que ya ganó, avanzar.
    // Se lee de a un lote alrededor del índice para no traer toda la lista.
    let idx = Math.floor(Math.random() * total)
    let elegido: string | null = null
    for (let intentos = 0; intentos < 20 && !elegido; intentos++) {
      const desde = Math.max(0, Math.min(idx, total - 1))
      const { data, error } = await base()
        .order("created_at", { ascending: true })
        .range(desde, desde + 49)
      if (error) return { error: error.message }
      const cand = ((data ?? []) as Array<{ id: string }>).find(
        (r) => !excluidos.has(r.id),
      )
      if (cand) elegido = cand.id
      else idx = (desde + 50) % total
    }
    if (!elegido) return { error: "No se pudo elegir un ganador. Probá de nuevo." }

    const { data: ins, error: e2 } = await supabase
      .from("rmd_sorteo_ganadores")
      .insert({
        campania: RMD_SORTEO_CAMPANIA,
        inscripcion_id: elegido,
        premio: RMD_SORTEO_PREMIO.titulo,
        participantes: total,
        sorteado_por: profile.id,
        sorteado_por_nombre: profile.nombre,
      })
      .select(SELECT_GANADOR)
      .single()
    if (e2) return { error: e2.message }
    return { data: mapGanador(ins as unknown as Record<string, unknown>) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

/** Marca el premio como entregado y guarda la(s) foto(s) de la entrega. */
export async function registrarEntregaGanadorRmd(
  formData: FormData,
): Promise<Result<GanadorSorteoRmd>> {
  try {
    const profile = await requireAuth()
    if (!isEditorRole(profile.role))
      return { error: "Sólo un supervisor o admin puede registrar la entrega." }
    const supabase = await createClient()

    const ganadorId = String(formData.get("ganador_id") ?? "")
    if (!ganadorId) return { error: "Falta el ganador." }
    const observaciones = limpiar(formData.get("observaciones"), 500) || null
    const files = archivosDelForm(formData, "archivo")
    if (files.length === 0)
      return { error: "Subí al menos una foto de la entrega." }

    const { data: actual, error: e0 } = await supabase
      .from("rmd_sorteo_ganadores")
      .select("archivos")
      .eq("id", ganadorId)
      .single()
    if (e0) return { error: e0.message }

    const subida = await subirArchivosAvance(
      supabase,
      BUCKET,
      `sorteo/${ganadorId}`,
      files,
    )
    if ("error" in subida) return { error: subida.error }

    const previos = Array.isArray(actual?.archivos)
      ? (actual.archivos as ArchivoAvance[])
      : []
    const { data, error } = await supabase
      .from("rmd_sorteo_ganadores")
      .update({
        entregado_en: new Date().toISOString(),
        entregado_por: profile.id,
        entregado_por_nombre: profile.nombre,
        observaciones,
        archivos: [...previos, ...subida.archivos],
      })
      .eq("id", ganadorId)
      .select(SELECT_GANADOR)
      .single()
    if (error) return { error: error.message }
    return { data: mapGanador(data as unknown as Record<string, unknown>) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function getSorteoRmdSignedUrl(
  archivoPath: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!archivoPath.startsWith("sorteo/"))
      return { error: "Ruta de archivo inválida" }
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(archivoPath, 60 * 10)
    if (error || !data)
      return { error: error?.message ?? "No se pudo generar URL" }
    return { data: { url: data.signedUrl } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error generando URL" }
  }
}
