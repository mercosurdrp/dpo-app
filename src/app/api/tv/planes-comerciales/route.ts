import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina (lo consume el agregador de Planes de Acción y
// la Agenda Comercial del dashboard Mercosur). No usa sesión de cookie:
// valida el mismo Bearer que la reunión Logística-Ventas
// (DPO_REUNION_READ_TOKEN — mismo consumidor, mismo dominio de confianza)
// y lee con service role.
//
// Devuelve los planes de acción de área comercial con foco en cliente:
//  - nps: planes del tablero NPS (nps_planes, foco_cliente_id = cod Chess)
//  - rechazos: planes del indicador de rechazos (rechazos_planes,
//    foco_cliente_id = rechazos.id_cliente)
// Cada plan lleva su último avance como resumen de seguimiento. Solo lectura:
// la fuente de verdad sigue siendo dpo-app.

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type Supa = ReturnType<typeof getServiceClient>

type Avance = {
  plan_id: string
  comentario: string | null
  estado_resultante: string | null
  created_at: string
}

async function ultimosAvances(supabase: Supa, tabla: string, planIds: string[]) {
  const porPlan = new Map<string, Avance>()
  if (!planIds.length) return porPlan
  const { data } = await supabase
    .from(tabla)
    .select("plan_id, comentario, estado_resultante, created_at")
    .in("plan_id", planIds)
    .order("created_at", { ascending: false })
  for (const a of (data ?? []) as Avance[]) {
    if (!porPlan.has(a.plan_id)) porPlan.set(a.plan_id, a)
  }
  return porPlan
}

async function bloqueNps(supabase: Supa) {
  const { data, error } = await supabase
    .from("nps_planes")
    .select(
      "id, titulo, descripcion, foco_driver, foco_cliente_id, foco_cliente_nombre, foco_promotor, prioridad, estado, fecha_objetivo, created_at, updated_at, responsable:profiles!nps_planes_responsable_id_fkey(nombre)",
    )
    .order("created_at", { ascending: false })
  if (error) return { error: error.message }
  const planes = (data ?? []) as Array<Record<string, unknown>>
  const avances = await ultimosAvances(
    supabase,
    "nps_planes_avances",
    planes.map((p) => String(p.id)),
  )
  return planes.map((p) => {
    const resp = p.responsable as { nombre?: string } | null
    const av = avances.get(String(p.id))
    return {
      id: p.id,
      titulo: p.titulo,
      descripcion: p.descripcion ?? null,
      foco_driver: p.foco_driver ?? null,
      cliente_id: p.foco_cliente_id ?? null,
      cliente_nombre: p.foco_cliente_nombre ?? null,
      promotor: p.foco_promotor ?? null,
      prioridad: p.prioridad,
      estado: p.estado,
      responsable: resp?.nombre ?? null,
      fecha_objetivo: p.fecha_objetivo ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      ultimo_avance: av
        ? {
            comentario: av.comentario,
            estado_resultante: av.estado_resultante,
            fecha: av.created_at,
          }
        : null,
    }
  })
}

async function bloqueRechazos(supabase: Supa) {
  const { data, error } = await supabase
    .from("rechazos_planes")
    .select(
      "id, titulo, descripcion, foco_motivo_ds, foco_cliente_id, foco_cliente_nombre, prioridad, estado, fecha_objetivo, created_at, updated_at, responsable:profiles!rechazos_planes_responsable_id_fkey(nombre)",
    )
    .order("created_at", { ascending: false })
  if (error) return { error: error.message }
  const planes = (data ?? []) as Array<Record<string, unknown>>
  const avances = await ultimosAvances(
    supabase,
    "rechazos_planes_avances",
    planes.map((p) => String(p.id)),
  )
  return planes.map((p) => {
    const resp = p.responsable as { nombre?: string } | null
    const av = avances.get(String(p.id))
    return {
      id: p.id,
      titulo: p.titulo,
      descripcion: p.descripcion ?? null,
      motivo: p.foco_motivo_ds ?? null,
      cliente_id: p.foco_cliente_id ?? null,
      cliente_nombre: p.foco_cliente_nombre ?? null,
      prioridad: p.prioridad,
      estado: p.estado,
      responsable: resp?.nombre ?? null,
      fecha_objetivo: p.fecha_objetivo ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      ultimo_avance: av
        ? {
            comentario: av.comentario,
            estado_resultante: av.estado_resultante,
            fecha: av.created_at,
          }
        : null,
    }
  })
}

// Planes del Plan Territorial (Planeamiento 5.1). Van en este mismo feed porque
// son planes conjuntos comercial+logística: se gestionan en dpo-app y el
// dashboard sólo los muestra, igual que NPS y Rechazos.
// A diferencia de los otros dos, el foco no es un cliente sino una CIUDAD.
async function bloqueTerritorial(supabase: Supa) {
  const { data, error } = await supabase
    .from("territorial_planes")
    .select(
      "id, titulo, descripcion, ciudad, palanca, linea_base, meta, fecha_implementacion, prioridad, estado, fecha_objetivo, created_at, updated_at, comercial:profiles!territorial_planes_responsable_comercial_id_fkey(nombre), logistica:profiles!territorial_planes_responsable_logistica_id_fkey(nombre)",
    )
    .order("created_at", { ascending: false })
  if (error) return { error: error.message }
  const planes = (data ?? []) as Array<Record<string, unknown>>
  const avances = await ultimosAvances(
    supabase,
    "territorial_planes_avances",
    planes.map((p) => String(p.id)),
  )
  return planes.map((p) => {
    const com = p.comercial as { nombre?: string } | null
    const log = p.logistica as { nombre?: string } | null
    const av = avances.get(String(p.id))
    return {
      id: p.id,
      titulo: p.titulo,
      descripcion: p.descripcion ?? null,
      ciudad: p.ciudad ?? null,
      palanca: p.palanca ?? null,
      linea_base: p.linea_base ?? null,
      meta: p.meta ?? null,
      fecha_implementacion: p.fecha_implementacion ?? null,
      prioridad: p.prioridad,
      estado: p.estado,
      // Doble responsable: es lo que hace de estos planes algo conjunto.
      responsable_comercial: com?.nombre ?? null,
      responsable_logistica: log?.nombre ?? null,
      responsable: com?.nombre ?? log?.nombre ?? null,
      fecha_objetivo: p.fecha_objetivo ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      ultimo_avance: av
        ? {
            comentario: av.comentario,
            estado_resultante: av.estado_resultante,
            fecha: av.created_at,
          }
        : null,
    }
  })
}

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }

  const expected = process.env.DPO_REUNION_READ_TOKEN
  const auth = request.headers.get("authorization")
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = getServiceClient()
  try {
    const [nps, rechazos, territorial] = await Promise.all([
      bloqueNps(supabase),
      bloqueRechazos(supabase),
      bloqueTerritorial(supabase),
    ])
    return NextResponse.json({
      fuente:
        "dpo-app Pampeana — planes comerciales (NPS + Rechazos + Plan Territorial)",
      generado_en: new Date().toISOString(),
      nps,
      rechazos,
      territorial,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error inesperado" },
      { status: 500 },
    )
  }
}
