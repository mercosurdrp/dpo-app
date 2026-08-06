"use server"
/**
 * Quiebres de Stock — Indicadores · Almacén.
 *
 * Responde "¿en qué producto quebramos, qué día?" con dos fuentes de distinta
 * calidad, y lo dice en pantalla en lugar de mezclarlas en silencio:
 *
 *   · STOCK (evidencia): la foto de la mañana en `quiebres_stock_fotos`, que
 *     deja el cron antes del picking. Un día con foto se evalúa por stock real.
 *   · VENTA (proxy): para los días sin foto —todo lo anterior a que el cron
 *     empezara a correr— se infiere el quiebre de la ausencia de venta. Un
 *     producto de rotación estable que no mueve nada N días operativos
 *     seguidos estaba quebrado. Es inferencia, no evidencia: sirve para
 *     priorizar y para revisarlo con el comprador, no para pagar un variable.
 *
 * La venta suma DISTRIBUCIÓN (`ventas_diarias_sku`) + MOSTRADOR
 * (`ventas_mostrador_sku`). El mostrador es ~40% del volumen y vive en otra
 * tabla: mirando sólo la primera, varios productos parecen quebrados y lo
 * único que pasó es que se vendieron por el mostrador.
 *
 * Este archivo sólo trae datos. El cálculo está en `@/lib/quiebres-stock/calculo`
 * para poder correrlo fuera de la app y auditarlo.
 */
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { getPool } from "@/lib/mercosur-dashboard"
import {
  agregarQuiebres,
  type ArticuloMaestro,
  type FilaFotoCruda,
  type FilaVentaCruda,
  type ResultadoQuiebres,
} from "@/lib/quiebres-stock/calculo"

export type {
  FamiliaQuiebre,
  QuiebresKpis,
  SkuDeFamilia,
} from "@/lib/quiebres-stock/calculo"

/** Familias que entran al indicador, por rotación del trimestre móvil. */
const UNIVERSO_DEFAULT = 30
/** Días operativos consecutivos sin movimiento para considerarlo quiebre. */
const MIN_DIAS_DEFAULT = 2
/** Motivo de rechazo "SIN STOCK" en `catalogo_rechazos`. */
const MOTIVO_SIN_STOCK = 13

/** Por qué quebró — lo carga a mano quien compra; no sale de ningún sistema. */
export interface ComentarioQuiebre {
  familia: string
  comentario: string
  /** true = no fue responsabilidad del comprador (ej: sin asignación de fábrica). */
  no_imputable: boolean
  updated_at: string | null
}

export interface QuiebresMes extends ResultadoQuiebres {
  anio: number
  mes: number
  comentarios: ComentarioQuiebre[]
}

const PATH_INDICADOR = "/indicadores/quiebres-stock"
const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = [
  "admin",
  "admin_rrhh",
  "supervisor",
]

/** Una página de PostgREST: lo que devuelve `select(...).range(...)`. */
type Pagina = PromiseLike<{
  data: unknown[] | null
  error: { message: string } | null
}>

/**
 * Lee una tabla completa paginando. Hace falta porque PostgREST corta en 1000
 * filas y un trimestre de venta por SKU pasa holgadamente ese techo: sin
 * paginar, el indicador mostraría un período truncado sin avisar.
 */
async function traerTodo<T>(
  tabla: string,
  consulta: (desde: number, hasta: number) => Pagina,
): Promise<T[]> {
  const paso = 1000
  const out: T[] = []
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await consulta(desde, desde + paso - 1)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const filas = (data ?? []) as T[]
    out.push(...filas)
    if (filas.length < paso) return out
  }
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/**
 * Maestro con marca y calibre. Vive en la Railway del dashboard Mercosur
 * (tabla `articulos`), no en Supabase: `chess_articulos` no trae esos campos y
 * sin ellos no hay forma de agrupar por producto físico.
 */
async function traerMaestro(): Promise<Map<number, ArticuloMaestro>> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id_articulo: number
      des_articulo: string | null
      marca: string | null
      calibre: string | null
      anulado: boolean | null
    }>("SELECT id_articulo, des_articulo, marca, calibre, anulado FROM articulos")
    const m = new Map<number, ArticuloMaestro>()
    for (const r of res.rows) {
      m.set(Number(r.id_articulo), {
        des_articulo: r.des_articulo ?? String(r.id_articulo),
        marca: r.marca,
        calibre: r.calibre,
        anulado: !!r.anulado,
      })
    }
    return m
  } finally {
    client.release()
  }
}

export async function getQuiebresMes(params: {
  anio: number
  mes: number
  universo?: number
  minDias?: number
}): Promise<{ data: QuiebresMes } | { error: string }> {
  await requireAuth()
  const { anio, mes } = params
  const universo = params.universo ?? UNIVERSO_DEFAULT
  const minDias = params.minDias ?? MIN_DIAS_DEFAULT

  try {
    const supabase = await createClient()

    const desdeMes = `${anio}-${String(mes).padStart(2, "0")}-01`
    const hastaMes = ymd(new Date(Date.UTC(anio, mes, 0)))
    // Trimestre móvil que termina en el mes elegido: define qué productos
    // entran al universo. Rankear por el mes propio sería un vicio — el que
    // quiebra vende menos y se cae del ranking justo el mes que hay que mirarlo.
    const desdeTri = ymd(new Date(Date.UTC(anio, mes - 3, 1)))
    // Mes anterior, para mostrar el contraste en el detalle por SKU.
    const desdePrevio = ymd(new Date(Date.UTC(anio, mes - 2, 1)))

    const [maestro, dist, most, rech, fotos, comentarios] = await Promise.all([
      traerMaestro(),
      traerTodo<FilaVentaCruda>("ventas_diarias_sku", (d, h) =>
        supabase
          .from("ventas_diarias_sku")
          .select("fecha,id_articulo,ds_articulo,bultos")
          .gte("fecha", desdeTri)
          .lte("fecha", hastaMes)
          .range(d, h),
      ),
      traerTodo<FilaVentaCruda>("ventas_mostrador_sku", (d, h) =>
        supabase
          .from("ventas_mostrador_sku")
          .select("fecha,id_articulo,ds_articulo,bultos")
          .gte("fecha", desdeTri)
          .lte("fecha", hastaMes)
          .range(d, h),
      ),
      traerTodo<{ id_articulo: number }>("rechazos", (d, h) =>
        supabase
          .from("rechazos")
          .select("id_articulo")
          .eq("id_rechazo", MOTIVO_SIN_STOCK)
          .gte("fecha", desdeMes)
          .lte("fecha", hastaMes)
          .range(d, h),
      ),
      // Las fotos son opcionales: mientras la migración no esté aplicada —o el
      // cron no haya corrido— el indicador funciona igual con el proxy de
      // venta. Un indicador que se cae porque falta la fuente nueva es peor
      // que uno que avisa que está mirando la vieja.
      traerTodo<FilaFotoCruda>("quiebres_stock_fotos", (d, h) =>
        supabase
          .from("quiebres_stock_fotos")
          .select("fecha,id_articulo,bultos")
          .gte("fecha", desdeMes)
          .lte("fecha", hastaMes)
          .range(d, h),
      ).catch(() => [] as FilaFotoCruda[]),
      traerTodo<ComentarioQuiebre>("quiebres_stock_comentarios", (d, h) =>
        supabase
          .from("quiebres_stock_comentarios")
          .select("familia,comentario,no_imputable,updated_at")
          .eq("anio", anio)
          .eq("mes", mes)
          .range(d, h),
      ).catch(() => [] as ComentarioQuiebre[]),
    ])

    const ventas = [...dist, ...most]
    if (ventas.length === 0) {
      return { error: `No hay ventas por SKU cargadas para ${mes}/${anio}.` }
    }

    const resultado = agregarQuiebres({
      ventas,
      fotos,
      rechazosSinStock: rech.map((r) => r.id_articulo),
      maestro,
      desdeMes,
      desdePrevio,
      universo,
      minDias,
      noImputables: new Set(
        comentarios.filter((c) => c.no_imputable).map((c) => c.familia),
      ),
      // Una causa cargada es un comentario con texto: tildar el check sin
      // explicar nada no alcanza para dejar de figurar como "sin causa".
      conCausa: new Set(
        comentarios.filter((c) => c.comentario.trim().length > 0).map((c) => c.familia),
      ),
    })

    return { data: { anio, mes, ...resultado, comentarios } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

/**
 * Guarda (o pisa) el comentario de por qué quebró un producto en un mes.
 * Una fila por (familia, año, mes): el upsert actualiza en vez de duplicar.
 */
export async function guardarComentarioQuiebre(params: {
  familia: string
  anio: number
  mes: number
  comentario: string
  noImputable: boolean
}): Promise<{ data: ComentarioQuiebre } | { error: string }> {
  const profile = await requireRole(ROLES_EDICION)
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("quiebres_stock_comentarios")
      .upsert(
        {
          familia: params.familia,
          anio: params.anio,
          mes: params.mes,
          comentario: params.comentario.trim(),
          no_imputable: params.noImputable,
          autor: profile.id,
        },
        { onConflict: "familia,anio,mes" },
      )
      .select("familia,comentario,no_imputable,updated_at")
      .single()
    if (error) return { error: error.message }
    revalidatePath(PATH_INDICADOR)
    return { data: data as ComentarioQuiebre }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

/** Meses con venta cargada, del más nuevo al más viejo, para el selector. */
export async function getMesesDisponibles(): Promise<
  { data: { anio: number; mes: number }[] } | { error: string }
> {
  await requireAuth()
  try {
    const supabase = await createClient()
    const { data: max } = await supabase
      .from("ventas_diarias_sku")
      .select("fecha")
      .order("fecha", { ascending: false })
      .limit(1)
    const { data: min } = await supabase
      .from("ventas_diarias_sku")
      .select("fecha")
      .order("fecha", { ascending: true })
      .limit(1)
    const maxF = max?.[0]?.fecha as string | undefined
    const minF = min?.[0]?.fecha as string | undefined
    if (!maxF || !minF) return { data: [] }

    const out: { anio: number; mes: number }[] = []
    const [maxY, maxM] = maxF.split("-").map(Number)
    const [minY, minM] = minF.split("-").map(Number)
    let y = maxY
    let m = maxM
    while (y > minY || (y === minY && m >= minM)) {
      out.push({ anio: y, mes: m })
      m--
      if (m === 0) {
        m = 12
        y--
      }
    }
    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}
