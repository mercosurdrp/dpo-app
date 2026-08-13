"use server"

// Análisis por ítem del checklist de flota (DPO 1.3).
//
// La pantalla de Check lists lista los defectos uno por uno, ordenados por
// fecha: sirve para actuar sobre el defecto del día, pero no responde las dos
// preguntas del punto — QUÉ ítem falla y DÓNDE se repite. Con 41.000 respuestas
// esa lectura no se hace a ojo.
//
// Dos cosas que el análisis deja a la vista y la lista no:
//   · la TASA DE DETECCIÓN por ítem (un ítem que nunca dio NO OK en miles de
//     checks no está sano: probablemente no se está mirando), y
//   · los DEFECTOS CRÓNICOS — el mismo ítem repitiéndose en la misma unidad,
//     que es lo que anticipa la rotura y justifica adelantar el correctivo.
//
// El denominador (veces que cada ítem fue evaluado) se cuenta con `head` contra
// PostgREST en vez de traer las 41.000 filas: son 45 conteos en paralelo.
//
// Cada ítem lleva además su OBSERVACIÓN: la conclusión escrita de por qué su
// tasa es la que es. Sin eso el análisis es una tabla de números que hay que
// volver a explicar en cada reunión — y el ítem que nunca detectó nada tiene
// explicación válida en varios casos (documentación la controla el sistema con
// alertas, no el chofer), pero si no está escrita el auditor la lee como un
// control que no se está haciendo.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { UMBRAL_CRONICO } from "@/lib/flota/checklist-cronicos"

// El checklist tiene TRES niveles, no dos: además de OK y NO OK existe REGULAR
// ("leve presencia de fluidos", en el criterio del propio ítem). Aplanarlos a
// "defecto" es un error de lectura: NO OK saca la unidad de servicio, REGULAR
// es una observación que hay que seguir. Se cuentan por separado.
const VALORES_OK = ["ok", "bueno"]
const VALORES_REGULAR = ["regular"]

/** Hoy en horario argentino: el server corre en UTC. */
function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function diasDesde(fecha: string, hoy: string): number {
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

export interface AnalisisItem {
  id: string
  categoria: string
  nombre: string
  critico: boolean
  /** Modal al que aplica el ítem. Sin valor en la tabla = camión. */
  tipoVehiculo: string
  /** Veces que el ítem se evaluó (todas las respuestas registradas). */
  evaluado: number
  /** Veces que dio NO OK: defecto que impide o compromete la operación. */
  noOk: number
  /** Veces que dio REGULAR: observación a seguir, no impide operar. */
  regular: number
  /** noOk + regular. */
  hallazgos: number
  /** hallazgos ÷ evaluado, en %. */
  tasa: number | null
  /** Dominios donde apareció el defecto, del más repetido al menos. */
  unidades: Array<{ dominio: string; veces: number }>
  ultimaFecha: string | null
  /** Criterio operativo que lee el chofer al completar el check. */
  criterio: string | null
  /** Conclusión del análisis, escrita por el Gestor de Flota. */
  observacion: string | null
  /** Cuándo se escribió esa conclusión. */
  observacionFecha: string | null
}

export interface DefectoCronico {
  itemId: string
  item: string
  categoria: string
  critico: boolean
  tipoVehiculo: string
  dominio: string
  veces: number
  /** Desglose de `veces`: cuántos fueron NO OK y cuántos sólo observación. */
  noOk: number
  regular: number
  primera: string
  ultima: string
  /** Días desde la última detección: un crónico resuelto deja de sumar. */
  diasSinRepetirse: number
  /** Desvíos por mes "YYYY-MM", cronológico: muestra si escala o se apagó. */
  porMes: Array<{ ym: string; veces: number }>
}

export interface AnalisisChecklist {
  items: AnalisisItem[]
  cronicos: DefectoCronico[]
  /** Desvíos por mes en toda la flota, separados por severidad. */
  porMes: Array<{ ym: string; veces: number; noOk: number; regular: number }>
  /** Hallazgos por categoría del checklist, de mayor a menor. */
  porCategoria: Array<{
    categoria: string
    veces: number
    noOk: number
    regular: number
  }>
  totales: {
    evaluado: number
    noOk: number
    regular: number
    hallazgos: number
    /** hallazgos ÷ evaluado, en %. */
    tasa: number | null
    itemsActivos: number
    /** Ítems que alguna vez detectaron algo. */
    itemsConDeteccion: number
    /** Ítems con la conclusión del análisis ya escrita. */
    itemsConObservacion: number
    /** Ítems con el criterio operativo cargado (lo que lee el chofer). */
    itemsConCriterio: number
    checklists: number
    desde: string | null
    hasta: string | null
  }
}

interface RespuestaNoOk {
  valor: string
  item_id: string
  item: { nombre: string; categoria: string; critico: boolean } | null
  cv: { fecha: string; dominio: string } | null
}

/**
 * Análisis por ítem. El período es opcional: sin él se mira toda la historia,
 * que es como nació la pantalla. Cuando viene, se recorta TODO —los defectos y
 * también el denominador de evaluaciones—: si sólo se filtraran los hallazgos,
 * la tasa saldría dividida por las evaluaciones de todos los tiempos y daría
 * ridículamente baja.
 */
export async function getAnalisisChecklist(periodo?: {
  desde?: string | null
  hasta?: string | null
}): Promise<{ data: AnalisisChecklist } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const desde = periodo?.desde ?? null
    const hasta = periodo?.hasta ?? null
    const acotarPorFecha = <T extends { gte: unknown; lte: unknown }>(
      q: T,
      columna: string
    ): T => {
      let r = q as unknown as {
        gte: (c: string, v: string) => typeof r
        lte: (c: string, v: string) => typeof r
      }
      if (desde) r = r.gte(columna, desde)
      if (hasta) r = r.lte(columna, hasta)
      return r as unknown as T
    }

    const [itemsRes, noOkRes, checksRes, obsRes] = await Promise.all([
      supabase
        .from("checklist_items")
        .select("id, nombre, categoria, critico, tipo_vehiculo, descripcion")
        .eq("active", true)
        .order("categoria")
        .order("orden"),
      acotarPorFecha(
        supabase
          .from("checklist_respuestas")
          .select(
            "valor, item_id, item:checklist_items(nombre, categoria, critico), cv:checklist_vehiculos!inner(fecha, dominio)"
          )
          .not("valor", "in", `(${VALORES_OK.map((v) => `"${v}"`).join(",")})`)
          .limit(5000),
        "cv.fecha"
      ),
      acotarPorFecha(
        supabase
          .from("checklist_vehiculos")
          .select("fecha", { count: "exact" })
          .order("fecha", { ascending: true })
          .limit(1),
        "fecha"
      ),
      supabase.from("checklist_item_analisis").select("item_id, observacion, updated_at"),
    ])
    if (itemsRes.error) return { error: itemsRes.error.message }
    if (noOkRes.error) return { error: noOkRes.error.message }
    if (checksRes.error) return { error: checksRes.error.message }
    if (obsRes.error) return { error: obsRes.error.message }

    // Ojo: el mismo nombre existe varias veces, una por modal ("Pérdida de
    // fluidos" está en camión y en autoelevador). Se agrupa por id y el modal se
    // muestra: si no, dos filas homónimas conviven con denominadores que difieren
    // en un orden de magnitud (1.315 evaluaciones contra 60) y la tasa no se
    // entiende.
    const items = (itemsRes.data || []) as Array<{
      id: string
      nombre: string
      categoria: string
      critico: boolean
      tipo_vehiculo: string | null
      descripcion: string | null
    }>

    const obsPorItem = new Map(
      ((obsRes.data || []) as Array<{
        item_id: string
        observacion: string | null
        updated_at: string
      }>).map((o) => [o.item_id, o])
    )

    // Denominador por ítem: 45 conteos `head` en paralelo, sin traer las filas.
    // Con período, el conteo entra por `checklist_vehiculos` para poder cortar
    // por la fecha del checklist, que es la que manda.
    const evaluadoPorItem = new Map<string, number>()
    await Promise.all(
      items.map(async (i) => {
        const { count } = await acotarPorFecha(
          supabase
            .from("checklist_respuestas")
            .select("id, cv:checklist_vehiculos!inner(fecha)", {
              count: "exact",
              head: true,
            })
            .eq("item_id", i.id),
          "cv.fecha"
        )
        evaluadoPorItem.set(i.id, count ?? 0)
      })
    )

    // Los defectos son pocos (decenas): se agregan en memoria sin problema.
    const noOk = ((noOkRes.data || []) as unknown as RespuestaNoOk[]).filter(
      (r) => r.item != null && r.cv != null
    )

    const porItem = new Map<string, RespuestaNoOk[]>()
    for (const r of noOk) {
      const lista = porItem.get(r.item_id)
      if (lista) lista.push(r)
      else porItem.set(r.item_id, [r])
    }

    const analisis: AnalisisItem[] = items.map((i) => {
      const defectos = porItem.get(i.id) ?? []
      const evaluado = evaluadoPorItem.get(i.id) ?? 0
      const porUnidad = new Map<string, number>()
      for (const d of defectos) {
        const dom = d.cv!.dominio
        porUnidad.set(dom, (porUnidad.get(dom) ?? 0) + 1)
      }
      const fechas = defectos.map((d) => d.cv!.fecha).sort()
      const regular = defectos.filter((d) => VALORES_REGULAR.includes(d.valor)).length
      const obs = obsPorItem.get(i.id)
      return {
        id: i.id,
        categoria: i.categoria,
        nombre: i.nombre,
        critico: i.critico,
        tipoVehiculo: i.tipo_vehiculo ?? "camión",
        evaluado,
        noOk: defectos.length - regular,
        regular,
        hallazgos: defectos.length,
        tasa: evaluado > 0 ? (defectos.length / evaluado) * 100 : null,
        unidades: [...porUnidad.entries()]
          .map(([dominio, veces]) => ({ dominio, veces }))
          .sort((a, b) => b.veces - a.veces),
        ultimaFecha: fechas.length > 0 ? fechas[fechas.length - 1] : null,
        criterio: i.descripcion,
        observacion: obs?.observacion ?? null,
        observacionFecha: obs?.observacion ? obs.updated_at : null,
      }
    })
    // Ordena por defecto real primero y recién después por observaciones: un
    // NO OK pesa más que un REGULAR aunque se repita menos.
    analisis.sort(
      (a, b) => b.noOk - a.noOk || b.regular - a.regular || a.nombre.localeCompare(b.nombre)
    )

    const tipoPorItem = new Map(items.map((i) => [i.id, i.tipo_vehiculo ?? "camión"]))
    const hoy = hoyArgentina()

    // Crónicos: mismo ítem + misma unidad repitiéndose.
    const porItemUnidad = new Map<string, RespuestaNoOk[]>()
    for (const r of noOk) {
      const k = `${r.item_id}|${r.cv!.dominio}`
      const lista = porItemUnidad.get(k)
      if (lista) lista.push(r)
      else porItemUnidad.set(k, [r])
    }
    const cronicos: DefectoCronico[] = []
    for (const [k, lista] of porItemUnidad) {
      if (lista.length < UMBRAL_CRONICO) continue
      const [itemId, dominio] = k.split("|")
      const fechas = lista.map((r) => r.cv!.fecha).sort()
      const meses = new Map<string, number>()
      for (const f of fechas) {
        const ym = f.slice(0, 7)
        meses.set(ym, (meses.get(ym) ?? 0) + 1)
      }
      cronicos.push({
        itemId,
        item: lista[0].item!.nombre,
        categoria: lista[0].item!.categoria,
        critico: lista[0].item!.critico,
        tipoVehiculo: tipoPorItem.get(itemId) ?? "camión",
        dominio,
        veces: lista.length,
        noOk: lista.filter((r) => !VALORES_REGULAR.includes(r.valor)).length,
        regular: lista.filter((r) => VALORES_REGULAR.includes(r.valor)).length,
        primera: fechas[0],
        ultima: fechas[fechas.length - 1],
        diasSinRepetirse: diasDesde(fechas[fechas.length - 1], hoy),
        porMes: [...meses.entries()]
          .map(([ym, veces]) => ({ ym, veces }))
          .sort((a, b) => a.ym.localeCompare(b.ym)),
      })
    }
    cronicos.sort((a, b) => b.veces - a.veces)

    const esRegular = (r: RespuestaNoOk) => VALORES_REGULAR.includes(r.valor)

    const mesesFlota = new Map<string, { noOk: number; regular: number }>()
    for (const r of noOk) {
      const ym = r.cv!.fecha.slice(0, 7)
      const m = mesesFlota.get(ym) ?? { noOk: 0, regular: 0 }
      if (esRegular(r)) m.regular++
      else m.noOk++
      mesesFlota.set(ym, m)
    }

    // Por categoría del checklist (MOTOR, LUCES, SEGURIDAD...): es el corte que
    // dice en qué parte del vehículo se concentra lo que se detecta.
    const categorias = new Map<string, { noOk: number; regular: number }>()
    for (const r of noOk) {
      const cat = r.item!.categoria
      const c = categorias.get(cat) ?? { noOk: 0, regular: 0 }
      if (esRegular(r)) c.regular++
      else c.noOk++
      categorias.set(cat, c)
    }

    const evaluadoTotal = [...evaluadoPorItem.values()].reduce((a, b) => a + b, 0)
    const fechasNoOk = noOk.map((r) => r.cv!.fecha).sort()

    return {
      data: {
        items: analisis,
        cronicos,
        porMes: [...mesesFlota.entries()]
          .map(([ym, v]) => ({ ym, veces: v.noOk + v.regular, ...v }))
          .sort((a, b) => a.ym.localeCompare(b.ym)),
        porCategoria: [...categorias.entries()]
          .map(([categoria, v]) => ({
            categoria,
            veces: v.noOk + v.regular,
            ...v,
          }))
          .sort((a, b) => b.veces - a.veces || a.categoria.localeCompare(b.categoria)),
        totales: {
          evaluado: evaluadoTotal,
          noOk: noOk.filter((r) => !VALORES_REGULAR.includes(r.valor)).length,
          regular: noOk.filter((r) => VALORES_REGULAR.includes(r.valor)).length,
          hallazgos: noOk.length,
          tasa: evaluadoTotal > 0 ? (noOk.length / evaluadoTotal) * 100 : null,
          itemsActivos: items.length,
          itemsConDeteccion: analisis.filter((i) => i.hallazgos > 0).length,
          itemsConObservacion: analisis.filter((i) => i.observacion != null).length,
          itemsConCriterio: analisis.filter((i) => i.criterio != null).length,
          checklists: checksRes.count ?? 0,
          desde: fechasNoOk[0] ?? null,
          hasta: fechasNoOk[fechasNoOk.length - 1] ?? null,
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Guarda la conclusión del análisis de un ítem (DPO 1.3). Sólo el Gestor de
 * Flota — admin o supervisor. Texto vacío borra la nota en vez de dejar una
 * fila con la observación en blanco.
 */
export async function setObservacionItem(input: {
  itemId: string
  observacion: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const texto = input.observacion?.trim() || null

    if (texto == null) {
      const { error } = await supabase
        .from("checklist_item_analisis")
        .delete()
        .eq("item_id", input.itemId)
      if (error) return { error: error.message }
      return { success: true }
    }

    const { error } = await supabase.from("checklist_item_analisis").upsert(
      {
        item_id: input.itemId,
        observacion: texto,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      },
      { onConflict: "item_id" }
    )
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
