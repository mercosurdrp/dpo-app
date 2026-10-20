import type { SupabaseClient } from "@supabase/supabase-js"
import {
  SLA_CASOS_MIDE_DESDE,
  categoriaRmd,
  sumarDias,
  vencimientoCaso,
  type CasoCategoria,
} from "@/lib/sla-cumplimiento"

/**
 * Apertura automática de planes RMD — para que ninguna puntuación baja quede
 * sin plan y el SLA `ent_rmd` no se pinte de rojo por un caso que nadie vio.
 *
 * Nació el 20/10/2026: el SLA daba 0 % y todos los días rojos porque había 18
 * casos vencidos SIN plan, todos puntuaciones 4 (PASIVAS) de 6 clientes. Los
 * planes se venían cargando a mano y solo para los detractores (1-3).
 *
 * Regla: un cliente necesita un plan nuevo si tiene al menos un caso (puntuación
 * 1-4 desde SLA_CASOS_MIDE_DESDE) que NO está cubierto. Un caso está cubierto si
 * el cliente tiene un plan abierto (pendiente / en progreso: cuando se cierre lo
 * va a cerrar) o un plan cerrado en la fecha del caso o después — el mismo
 * criterio con que `evaluarCaso` decide si un caso se cerró.
 *
 * 🚨 El plan se abre PENDIENTE y nunca se cierra solo: cerrarlo es registrar lo
 * que realmente se hizo con el cliente (avance + evidencia). Cerrar planes por
 * código maquillaría el indicador.
 *
 * Idempotente: correrlo dos veces no duplica, porque el plan recién abierto deja
 * cubiertos los casos de ese cliente.
 */

/** Responsable por defecto de los planes automáticos (el que cargaba los planes RMD a mano). */
export const RMD_PLANES_RESPONSABLE_EMAIL = "fazzaretti@mercosurdrp.com.ar"

/** Días que se le dan al plan cuando el plazo del SLA ya venció. */
const DIAS_PLAN_VENCIDO = 7

interface Puntuacion {
  cod_cliente: number
  nombre_cliente: string | null
  fecha_puntuacion: string
  nro_pedido: string | null
  puntuacion: number
  motivos: string | null
  comentario: string | null
  promotor: string | null
  localidad: string | null
  vehiculo_entrega: string | null
}

interface CasoAbierto extends Puntuacion {
  fecha: string
  categoria: CasoCategoria
  vencimiento: string
}

export interface PlanAbierto {
  id: string
  cod_cliente: number
  titulo: string
  casos: number
  fecha_objetivo: string
}

export interface ResultadoAbrirPlanes {
  casos: number
  casosSinCubrir: number
  planes: PlanAbierto[]
  dryRun: boolean
}

function hoyArg(): string {
  // Argentina es UTC-3 fijo.
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
}

const fmt = (iso: string) => iso.split("-").reverse().join("/")
const capitalizar = (s: string | null) =>
  (s ?? "").toLowerCase().replace(/(^|[\s(])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())

async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function abrirPlanesRmdPendientes(
  supabase: SupabaseClient,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ResultadoAbrirPlanes> {
  const hoy = hoyArg()

  // 1. Todas las puntuaciones 1-4 desde que rige el acuerdo.
  const puntuaciones = await traerTodo<Puntuacion>((desde, hasta) =>
    supabase
      .from("nps_rmd_cliente")
      .select(
        "cod_cliente, nombre_cliente, fecha_puntuacion, nro_pedido, puntuacion, motivos, comentario, promotor, localidad, vehiculo_entrega",
      )
      .lte("puntuacion", 4)
      .gte("fecha_puntuacion", SLA_CASOS_MIDE_DESDE)
      .order("fecha_puntuacion")
      .order("cod_cliente")
      .order("nro_pedido")
      .range(desde, hasta),
  )
  const casos: CasoAbierto[] = []
  for (const p of puntuaciones) {
    const categoria = categoriaRmd(Number(p.puntuacion))
    if (!categoria) continue
    const fecha = String(p.fecha_puntuacion).slice(0, 10)
    casos.push({ ...p, cod_cliente: Number(p.cod_cliente), fecha, categoria, vencimiento: vencimientoCaso(fecha, categoria) })
  }
  if (casos.length === 0) return { casos: 0, casosSinCubrir: 0, planes: [], dryRun }

  // 2. Planes de esos clientes: abiertos y fechas de cierre.
  const clienteIds = [...new Set(casos.map((c) => c.cod_cliente))]
  const planes: Array<{ id: string; foco_cliente_id: number; estado: string; updated_at: string }> = []
  for (let i = 0; i < clienteIds.length; i += 200) {
    const { data, error } = await supabase
      .from("rmd_planes")
      .select("id, foco_cliente_id, estado, updated_at")
      .in("foco_cliente_id", clienteIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    planes.push(...((data ?? []) as typeof planes))
  }
  const primerCierre = new Map<string, string>()
  const completados = planes.filter((p) => p.estado === "completado")
  for (let i = 0; i < completados.length; i += 200) {
    const { data, error } = await supabase
      .from("rmd_planes_avances")
      .select("plan_id, created_at")
      .in("plan_id", completados.slice(i, i + 200).map((p) => p.id))
      .eq("estado_resultante", "completado")
    if (error) throw new Error(error.message)
    for (const a of (data ?? []) as Array<{ plan_id: string; created_at: string }>) {
      const prev = primerCierre.get(a.plan_id)
      if (!prev || a.created_at < prev) primerCierre.set(a.plan_id, a.created_at)
    }
  }
  const conPlanAbierto = new Set<number>()
  const cierres = new Map<number, string[]>()
  for (const p of planes) {
    const cli = Number(p.foco_cliente_id)
    if (p.estado !== "completado") {
      conPlanAbierto.add(cli)
      continue
    }
    const cierre = (primerCierre.get(p.id) ?? p.updated_at).slice(0, 10)
    cierres.set(cli, [...(cierres.get(cli) ?? []), cierre])
  }

  // 3. Casos sin cubrir, agrupados por cliente.
  const porCliente = new Map<number, CasoAbierto[]>()
  for (const c of casos) {
    if (conPlanAbierto.has(c.cod_cliente)) continue
    if ((cierres.get(c.cod_cliente) ?? []).some((cierre) => cierre >= c.fecha)) continue
    porCliente.set(c.cod_cliente, [...(porCliente.get(c.cod_cliente) ?? []), c])
  }
  const casosSinCubrir = [...porCliente.values()].reduce((n, l) => n + l.length, 0)
  if (porCliente.size === 0) return { casos: casos.length, casosSinCubrir: 0, planes: [], dryRun }

  // 4. Un plan por cliente.
  const { data: responsable } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", RMD_PLANES_RESPONSABLE_EMAIL)
    .maybeSingle()
  const responsableId = (responsable as { id: string } | null)?.id ?? null

  const filas = []
  for (const [cli, lista] of porCliente) {
    const ultimo = lista[lista.length - 1]
    const hayDetractor = lista.some((c) => c.categoria === "detractor")
    const vencimientos = lista.map((c) => c.vencimiento).sort()
    const proximo = vencimientos.find((v) => v >= hoy)
    const fechaObjetivo = proximo ?? sumarDias(hoy, DIAS_PLAN_VENCIDO)

    const { data: historia } = await supabase
      .from("nps_rmd_cliente")
      .select("puntuacion, fecha_puntuacion")
      .eq("cod_cliente", cli)
    const hist = (historia ?? []) as Array<{ puntuacion: number; fecha_puntuacion: string }>
    const baselineN = hist.length
    const baselineRmd = baselineN
      ? Math.round((hist.reduce((s, h) => s + Number(h.puntuacion), 0) / baselineN) * 100) / 100
      : null

    const motivos = [...new Set(lista.map((c) => c.motivos).filter(Boolean))] as string[]
    const lineas = lista.map(
      (c) =>
        `• ${fmt(c.fecha)} — pedido ${c.nro_pedido ?? "s/d"} — ${c.puntuacion}★ — ${c.motivos ?? "sin motivo"}` +
        (c.vehiculo_entrega ? ` — vehículo ${c.vehiculo_entrega}` : "") +
        ` — vence ${fmt(c.vencimiento)}` +
        (c.comentario ? `\n  Comentario del cliente: "${c.comentario.replace(/\s+/g, " ").trim()}"` : ""),
    )
    const vencidos = vencimientos.filter((v) => v < hoy).length
    const descripcion = [
      `Cliente ${cli} — ${ultimo.nombre_cliente ?? "s/nombre"} (${capitalizar(ultimo.localidad) || "s/localidad"})`,
      `Promotor: ${ultimo.promotor ?? "—"}`,
      baselineRmd != null ? `RMD histórico del cliente: ${baselineRmd} sobre ${baselineN} puntuaciones.` : "",
      ``,
      `Puntuaciones ${hayDetractor ? "bajas" : "pasivas (4★)"} sin plan (${lista.length}):`,
      ...lineas,
      ``,
      vencidos > 0
        ? `⚠ ${vencidos} de estos casos ya vencieron el plazo del SLA (30 días para 1-3★, 45 para 4★): el SLA de cierre de casos RMD está en rojo hasta que este plan se cierre.`
        : `Plazo del SLA: cerrarlo antes del ${fmt(vencimientos[0])} (30 días para 1-3★, 45 para 4★).`,
      ``,
      `Acción: contactar o visitar al cliente, preguntarle qué le faltó para poner 5★ y resolverlo. Cerrar el plan con un avance que cuente qué se hizo y la evidencia.`,
      ``,
      `Plan abierto automáticamente por la plataforma.`,
    ]
      .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
      .join("\n")

    filas.push({
      titulo: `${hayDetractor ? "Detractor" : "Pasivo"} RMD — ${capitalizar(ultimo.nombre_cliente)} (${capitalizar(ultimo.localidad) || "s/loc"})`,
      descripcion,
      prioridad: hayDetractor || lista.length >= 2 || vencidos > 0 ? "alta" : "media",
      estado: "pendiente",
      foco_motivo: motivos.join(" / ") || null,
      foco_cliente_id: cli,
      foco_cliente_nombre: ultimo.nombre_cliente,
      foco_promotor: ultimo.promotor,
      fecha_objetivo: fechaObjetivo,
      responsable_id: responsableId,
      created_by: responsableId,
      baseline_rmd: baselineRmd,
      baseline_n: baselineN || null,
      baseline_fecha: ultimo.fecha,
      _casos: lista.length,
    })
  }

  if (dryRun) {
    return {
      casos: casos.length,
      casosSinCubrir,
      planes: filas.map((f) => ({
        id: "",
        cod_cliente: f.foco_cliente_id,
        titulo: f.titulo,
        casos: f._casos,
        fecha_objetivo: f.fecha_objetivo,
      })),
      dryRun,
    }
  }

  const { data: creados, error } = await supabase
    .from("rmd_planes")
    .insert(filas.map(({ _casos, ...f }) => f))
    .select("id, foco_cliente_id, titulo, fecha_objetivo")
  if (error) throw new Error(error.message)
  const casosPorCliente = new Map(filas.map((f) => [f.foco_cliente_id, f._casos]))
  return {
    casos: casos.length,
    casosSinCubrir,
    planes: ((creados ?? []) as Array<{ id: string; foco_cliente_id: number; titulo: string; fecha_objetivo: string }>).map(
      (p) => ({
        id: p.id,
        cod_cliente: Number(p.foco_cliente_id),
        titulo: p.titulo,
        casos: casosPorCliente.get(p.foco_cliente_id) ?? 0,
        fecha_objetivo: p.fecha_objetivo,
      }),
    ),
    dryRun,
  }
}
