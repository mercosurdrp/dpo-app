import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// Revisión del FODA tras un período crítico (R3.4.3).
//
// GET  → historial de revisiones (con sus ítems) y, por cada ítem vivo del
//        FODA, cuándo se lo revisó por última vez y qué pasó con él.
// POST → cierra una revisión completa: recibe UNA decisión por cada ítem activo
//        (mantiene / modifica / elimina) más los ítems nuevos, aplica los
//        cambios sobre pc_swot_items y deja el registro. Al final congela el
//        FODA resultante como foto "posterior" del período (respaldo).
//
// La revisión se guarda entera o no se guarda: si falta la decisión de algún
// ítem se rechaza, porque el valor de la evidencia es que se miró todo.

const CATEGORIAS = ["F", "O", "D", "A"] as const
const IMPACTOS = ["alto", "medio", "bajo"] as const
const ACCIONES = ["mantiene", "modifica", "elimina"] as const

type Categoria = (typeof CATEGORIAS)[number]
type Impacto = (typeof IMPACTOS)[number]

type ItemFoda = {
  id: string
  categoria: Categoria
  texto: string
  impacto: Impacto
  accion_recomendada: string | null
  orden: number
  activo: boolean
}

export type RevisionItem = {
  id: string
  revision_id: string
  item_id: string | null
  categoria: Categoria
  accion: "mantiene" | "modifica" | "elimina" | "agrega"
  texto_anterior: string | null
  accion_anterior: string | null
  texto_nuevo: string | null
  accion_nuevo: string | null
  nota: string
}

export type Revision = {
  id: string
  periodo_nombre: string
  periodo_anio: number
  periodo_fecha_inicio: string | null
  periodo_fecha_fin: string | null
  fecha: string
  nota: string
  created_at: string
  items: RevisionItem[]
  resumen: { mantiene: number; modifica: number; elimina: number; agrega: number }
}

export type UltimaRevision = {
  revision_id: string
  periodo_nombre: string
  periodo_anio: number
  fecha: string
  accion: RevisionItem["accion"]
}

function resumir(items: RevisionItem[]) {
  const r = { mantiene: 0, modifica: 0, elimina: 0, agrega: 0 }
  for (const it of items) r[it.accion]++
  return r
}

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_swot_revisiones")
    .select("*, pc_swot_revision_items(*)")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    // 42P01 = la tabla no existe: falta aplicar la migración 145.
    const falta = error.code === "42P01" || /pc_swot_revisiones/.test(error.message)
    return NextResponse.json(
      { error: falta ? "Falta aplicar la migración 145_pc_swot_revisiones.sql en Supabase." : error.message },
      { status: falta ? 424 : 500 },
    )
  }

  const revisiones: Revision[] = ((data ?? []) as unknown as (Omit<Revision, "items" | "resumen"> & {
    pc_swot_revision_items: RevisionItem[]
  })[]).map((r) => {
    const { pc_swot_revision_items: items, ...resto } = r
    return { ...resto, items: items ?? [], resumen: resumir(items ?? []) }
  })

  // Última revisión de cada ítem: la lista viene de la más nueva a la más vieja.
  const ultima: Record<string, UltimaRevision> = {}
  for (const r of revisiones) {
    for (const it of r.items) {
      if (!it.item_id || ultima[it.item_id]) continue
      ultima[it.item_id] = {
        revision_id: r.id,
        periodo_nombre: r.periodo_nombre,
        periodo_anio: r.periodo_anio,
        fecha: r.fecha,
        accion: it.accion,
      }
    }
  }

  return NextResponse.json({ revisiones, ultima_por_item: ultima })
}

type Decision = {
  item_id?: string
  accion?: string
  texto?: string
  accion_recomendada?: string
  impacto?: string
  categoria?: string
  nota?: string
}
type Nuevo = {
  categoria?: string
  texto?: string
  impacto?: string
  accion_recomendada?: string
}

export async function POST(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: {
    periodo_nombre?: string
    periodo_anio?: number
    periodo_fecha_inicio?: string | null
    periodo_fecha_fin?: string | null
    fecha?: string | null
    nota?: string
    decisiones?: Decision[]
    nuevos?: Nuevo[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const periodoNombre = (body.periodo_nombre ?? "").trim()
  const periodoAnio = Number(body.periodo_anio)
  if (!periodoNombre || !Number.isInteger(periodoAnio)) {
    return NextResponse.json({ error: "periodo_nombre y periodo_anio son obligatorios" }, { status: 400 })
  }
  const decisiones = Array.isArray(body.decisiones) ? body.decisiones : []
  const nuevos = Array.isArray(body.nuevos) ? body.nuevos : []

  const supabase = await createClient()
  const { data: activosRaw, error: eItems } = await supabase
    .from("pc_swot_items")
    .select("id, categoria, texto, impacto, accion_recomendada, orden, activo")
    .eq("activo", true)
  if (eItems) return NextResponse.json({ error: eItems.message }, { status: 500 })
  const activos = (activosRaw ?? []) as ItemFoda[]
  const porId = new Map(activos.map((a) => [a.id, a]))

  // Una decisión por ítem activo, ni más ni menos.
  const decididos = new Set<string>()
  for (const d of decisiones) {
    if (!d.item_id || !porId.has(d.item_id)) {
      return NextResponse.json({ error: `Decisión sobre un ítem que no está activo: ${d.item_id}` }, { status: 400 })
    }
    if (!ACCIONES.includes(d.accion as (typeof ACCIONES)[number])) {
      return NextResponse.json({ error: `Acción inválida para ${d.item_id}: ${d.accion}` }, { status: 400 })
    }
    if (decididos.has(d.item_id)) {
      return NextResponse.json({ error: `El ítem ${d.item_id} tiene dos decisiones` }, { status: 400 })
    }
    decididos.add(d.item_id)
  }
  const sinDecidir = activos.filter((a) => !decididos.has(a.id))
  if (sinDecidir.length > 0) {
    return NextResponse.json(
      { error: `Faltan decidir ${sinDecidir.length} ítem(s). La revisión se guarda cuando están todos.`, faltan: sinDecidir.map((a) => a.id) },
      { status: 400 },
    )
  }
  for (const n of nuevos) {
    if (!CATEGORIAS.includes(n.categoria as Categoria) || !(n.texto ?? "").trim()) {
      return NextResponse.json({ error: "Cada ítem nuevo necesita categoría y texto" }, { status: 400 })
    }
  }

  // ── Cabecera ────────────────────────────────────────────────────────────
  const { data: rev, error: eRev } = await supabase
    .from("pc_swot_revisiones")
    .insert({
      periodo_nombre: periodoNombre,
      periodo_anio: periodoAnio,
      periodo_fecha_inicio: body.periodo_fecha_inicio || null,
      periodo_fecha_fin: body.periodo_fecha_fin || null,
      fecha: body.fecha || new Date().toISOString().slice(0, 10),
      nota: (body.nota ?? "").trim(),
      created_by: profile.id,
    })
    .select("id")
    .single()
  if (eRev || !rev) {
    const falta = eRev?.code === "42P01"
    return NextResponse.json(
      { error: falta ? "Falta aplicar la migración 145_pc_swot_revisiones.sql en Supabase." : eRev?.message ?? "No se pudo crear la revisión" },
      { status: falta ? 424 : 500 },
    )
  }

  // ── Decisiones sobre los ítems existentes ───────────────────────────────
  const ahora = new Date().toISOString()
  const filas: Omit<RevisionItem, "id">[] = []
  for (const d of decisiones) {
    const it = porId.get(d.item_id!)!
    const nota = (d.nota ?? "").trim()
    if (d.accion === "mantiene") {
      filas.push({ revision_id: rev.id, item_id: it.id, categoria: it.categoria, accion: "mantiene",
        texto_anterior: it.texto, accion_anterior: it.accion_recomendada ?? "", texto_nuevo: null, accion_nuevo: null, nota })
      continue
    }
    if (d.accion === "elimina") {
      const { error } = await supabase.from("pc_swot_items").update({ activo: false, updated_at: ahora }).eq("id", it.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      filas.push({ revision_id: rev.id, item_id: it.id, categoria: it.categoria, accion: "elimina",
        texto_anterior: it.texto, accion_anterior: it.accion_recomendada ?? "", texto_nuevo: null, accion_nuevo: null, nota })
      continue
    }
    // modifica
    const texto = (d.texto ?? it.texto).trim() || it.texto
    const accion = (d.accion_recomendada ?? it.accion_recomendada ?? "").trim()
    const impacto = IMPACTOS.includes(d.impacto as Impacto) ? (d.impacto as Impacto) : it.impacto
    const categoria = CATEGORIAS.includes(d.categoria as Categoria) ? (d.categoria as Categoria) : it.categoria
    const { error } = await supabase
      .from("pc_swot_items")
      .update({ texto, accion_recomendada: accion, impacto, categoria, updated_at: ahora })
      .eq("id", it.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    filas.push({ revision_id: rev.id, item_id: it.id, categoria, accion: "modifica",
      texto_anterior: it.texto, accion_anterior: it.accion_recomendada ?? "", texto_nuevo: texto, accion_nuevo: accion,
      nota: categoria !== it.categoria ? `${nota ? nota + " · " : ""}Movido de ${it.categoria} a ${categoria}` : nota })
  }

  // ── Ítems nuevos ────────────────────────────────────────────────────────
  if (nuevos.length > 0) {
    const maxOrden = Math.max(0, ...activos.map((a) => Number(a.orden) || 0))
    const { data: creados, error } = await supabase
      .from("pc_swot_items")
      .insert(nuevos.map((n, i) => ({
        categoria: n.categoria,
        texto: (n.texto ?? "").trim(),
        impacto: IMPACTOS.includes(n.impacto as Impacto) ? n.impacto : "medio",
        accion_recomendada: (n.accion_recomendada ?? "").trim(),
        orden: maxOrden + 1 + i,
        activo: true,
        periodo_nombre: periodoNombre,
        periodo_anio: periodoAnio,
        periodo_fecha_inicio: body.periodo_fecha_inicio || null,
        periodo_fecha_fin: body.periodo_fecha_fin || null,
        created_by: profile.id,
      })))
      .select("id, categoria, texto, accion_recomendada")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const c of (creados ?? []) as ItemFoda[]) {
      filas.push({ revision_id: rev.id, item_id: c.id, categoria: c.categoria, accion: "agrega",
        texto_anterior: null, accion_anterior: null, texto_nuevo: c.texto, accion_nuevo: c.accion_recomendada ?? "", nota: "" })
    }
  }

  const { error: eFilas } = await supabase.from("pc_swot_revision_items").insert(filas)
  if (eFilas) return NextResponse.json({ error: eFilas.message }, { status: 500 })

  // ── Respaldo: foto del FODA resultante como "posterior" del período ─────
  const { data: resultantes } = await supabase
    .from("pc_swot_items")
    .select("categoria, texto, impacto, accion_recomendada")
    .eq("activo", true)
    .order("categoria")
    .order("orden")
  await supabase.from("pc_swot_snapshots").upsert(
    {
      periodo_nombre: periodoNombre,
      periodo_anio: periodoAnio,
      periodo_fecha_inicio: body.periodo_fecha_inicio || null,
      periodo_fecha_fin: body.periodo_fecha_fin || null,
      momento: "posterior",
      fecha_corte: body.fecha || new Date().toISOString().slice(0, 10),
      items: resultantes ?? [],
      nota: `Foto automática al cerrar la revisión del período. ${(body.nota ?? "").trim()}`.trim(),
      created_by: profile.id,
    },
    { onConflict: "periodo_anio,periodo_nombre,momento" },
  )

  return NextResponse.json({ ok: true, revision_id: rev.id, resumen: resumir(filas as RevisionItem[]) })
}
