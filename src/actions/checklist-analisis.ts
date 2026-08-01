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

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { UMBRAL_CRONICO } from "@/lib/flota/checklist-cronicos"

/** Respuestas que NO son un cumplimiento; el resto de los valores son defecto. */
const VALORES_OK = ["ok", "bueno"]

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
  /** Veces que dio distinto de OK. */
  noOk: number
  /** noOk ÷ evaluado, en %. */
  tasa: number | null
  /** Dominios donde apareció el defecto, del más repetido al menos. */
  unidades: Array<{ dominio: string; veces: number }>
  ultimaFecha: string | null
}

export interface DefectoCronico {
  itemId: string
  item: string
  categoria: string
  critico: boolean
  tipoVehiculo: string
  dominio: string
  veces: number
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
  /** Desvíos por mes en toda la flota. */
  porMes: Array<{ ym: string; veces: number }>
  totales: {
    evaluado: number
    noOk: number
    /** noOk ÷ evaluado, en %. */
    tasa: number | null
    itemsActivos: number
    /** Ítems que alguna vez detectaron algo. */
    itemsConDeteccion: number
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

export async function getAnalisisChecklist(): Promise<
  { data: AnalisisChecklist } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [itemsRes, noOkRes, checksRes] = await Promise.all([
      supabase
        .from("checklist_items")
        .select("id, nombre, categoria, critico, tipo_vehiculo")
        .eq("active", true)
        .order("categoria")
        .order("orden"),
      supabase
        .from("checklist_respuestas")
        .select(
          "valor, item_id, item:checklist_items(nombre, categoria, critico), cv:checklist_vehiculos(fecha, dominio)"
        )
        .not("valor", "in", `(${VALORES_OK.map((v) => `"${v}"`).join(",")})`)
        .limit(5000),
      supabase
        .from("checklist_vehiculos")
        .select("fecha", { count: "exact" })
        .order("fecha", { ascending: true })
        .limit(1),
    ])
    if (itemsRes.error) return { error: itemsRes.error.message }
    if (noOkRes.error) return { error: noOkRes.error.message }
    if (checksRes.error) return { error: checksRes.error.message }

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
    }>

    // Denominador por ítem: 45 conteos `head` en paralelo, sin traer las filas.
    const evaluadoPorItem = new Map<string, number>()
    await Promise.all(
      items.map(async (i) => {
        const { count } = await supabase
          .from("checklist_respuestas")
          .select("id", { count: "exact", head: true })
          .eq("item_id", i.id)
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
      return {
        id: i.id,
        categoria: i.categoria,
        nombre: i.nombre,
        critico: i.critico,
        tipoVehiculo: i.tipo_vehiculo ?? "camión",
        evaluado,
        noOk: defectos.length,
        tasa: evaluado > 0 ? (defectos.length / evaluado) * 100 : null,
        unidades: [...porUnidad.entries()]
          .map(([dominio, veces]) => ({ dominio, veces }))
          .sort((a, b) => b.veces - a.veces),
        ultimaFecha: fechas.length > 0 ? fechas[fechas.length - 1] : null,
      }
    })
    analisis.sort((a, b) => b.noOk - a.noOk || a.nombre.localeCompare(b.nombre))

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
        primera: fechas[0],
        ultima: fechas[fechas.length - 1],
        diasSinRepetirse: diasDesde(fechas[fechas.length - 1], hoy),
        porMes: [...meses.entries()]
          .map(([ym, veces]) => ({ ym, veces }))
          .sort((a, b) => a.ym.localeCompare(b.ym)),
      })
    }
    cronicos.sort((a, b) => b.veces - a.veces)

    const mesesFlota = new Map<string, number>()
    for (const r of noOk) {
      const ym = r.cv!.fecha.slice(0, 7)
      mesesFlota.set(ym, (mesesFlota.get(ym) ?? 0) + 1)
    }

    const evaluadoTotal = [...evaluadoPorItem.values()].reduce((a, b) => a + b, 0)
    const fechasNoOk = noOk.map((r) => r.cv!.fecha).sort()

    return {
      data: {
        items: analisis,
        cronicos,
        porMes: [...mesesFlota.entries()]
          .map(([ym, veces]) => ({ ym, veces }))
          .sort((a, b) => a.ym.localeCompare(b.ym)),
        totales: {
          evaluado: evaluadoTotal,
          noOk: noOk.length,
          tasa: evaluadoTotal > 0 ? (noOk.length / evaluadoTotal) * 100 : null,
          itemsActivos: items.length,
          itemsConDeteccion: analisis.filter((i) => i.noOk > 0).length,
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
