"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Adherencia al checklist de flota (DPO Flota 1.3, requisito R1.3.1a).
 *
 * 🚨 El denominador son los días que la unidad EFECTIVAMENTE REPARTIÓ
 * (`ventas_diarias_cliente`, las entregas reales), NO los días en que hay algún
 * checklist cargado. Medir contra los propios checklists es un denominador
 * auto-reportado: el camión que salió y no cargó nada desaparece del cálculo y
 * el número se infla solo. Con los datos del 07/07 al 06/08/2026 la diferencia
 * era 90,2 % (auto-reportado) contra 71,0 % (real), y esos 19 puntos eran 43
 * camión-día que rutearon sin ningún checklist.
 *
 * Dos cosas NO son incumplimiento y quedan afuera del denominador (11/08/2026):
 * el día en curso —el retorno todavía no pudo hacerse— y los camión-día de sólo
 * venta de gestión, donde la patente no se observa sino que se deduce del
 * `patente_default` del chofer. Se leía de `vista_dias_ruteo`, que es
 * `distinct patente + fecha` de esa misma tabla pero sin el fletero, así que no
 * permitía distinguir la patente observada de la deducida.
 *
 * Por qué importa el número exacto: el R1.3.1a se activa porque el checklist NO
 * impide usar la unidad, y exige adherencia del 100 % más medidas de gestión
 * rápidas cuando baja. El 1.3 es mandatorio y si el 1a aplica y no se cumple, el
 * punto va a cero.
 *
 * Sólo camiones: los autoelevadores no rutean y el acoplado no se conduce.
 */

export interface DiaFaltante {
  fecha: string
  dominio: string
  /** Qué falta: el retorno, o el checklist entero. */
  falta: "retorno" | "liberacion" | "ambos"
}

export interface AdherenciaPunto {
  /** `YYYY-MM-DD` o `YYYY-MM` según el agrupamiento. */
  clave: string
  ruteados: number
  completos: number
  pct: number
}

/** Hoy en hora de Argentina (el server corre en UTC). */
function hoyArg(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function ayerDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface AdherenciaChecklist {
  desde: string
  /** Último día medido: si el rango llega a hoy, es AYER (ver `diaEnCursoExcluido`). */
  hasta: string
  /** El día en curso quedó afuera porque los camiones todavía no volvieron. */
  diaEnCursoExcluido: boolean
  /** Camión-día descartados por ser sólo venta de gestión (patente deducida). */
  soloGestionExcluidos: number
  /** Camión-día descartados porque la unidad estaba fuera de servicio. */
  fueraDeServicioExcluidos: number
  /** Camión-día con reparto real: el denominador. */
  ruteados: number
  /** Con liberación Y retorno. */
  completos: number
  /** Salió, hizo la liberación, pero nunca cerró el retorno. */
  soloLiberacion: number
  /** Repartió sin ningún checklist: el caso que el 1a quiere detectar. */
  sinNinguno: number
  pct: number | null
  serieDia: AdherenciaPunto[]
  serieMes: AdherenciaPunto[]
  faltantes: DiaFaltante[]
  /** Camión-día sin checklist agrupados por unidad, de mayor a menor. */
  porUnidad: { dominio: string; ruteados: number; completos: number; pct: number }[]
}

/**
 * PostgREST corta en 1000 filas por consulta: sin paginar, un rango largo se
 * truncaba en silencio y la adherencia salía calculada sobre datos incompletos.
 */
async function traerTodo<T>(
  hacerQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] } | { error: string }> {
  const PASO = 1000
  const out: T[] = []
  for (let i = 0; ; i += PASO) {
    const { data, error } = await hacerQuery(i, i + PASO - 1)
    if (error) return { error: error.message }
    const filas = data ?? []
    out.push(...filas)
    if (filas.length < PASO) break
  }
  return { data: out }
}

export async function getAdherenciaChecklist(
  desde: string,
  hasta: string,
): Promise<{ data: AdherenciaChecklist } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // El día en curso no se puede exigir: el camión salió, hizo la liberación y
    // todavía no volvió, así que el retorno no existe todavía. Contarlo hunde el
    // número sin que nadie haya incumplido nada (11/08/2026: 3 de 9 a media
    // mañana). El corte real es AYER.
    const hastaEfectivo = hasta >= hoyArg() ? ayerDe(hoyArg()) : hasta
    const diaEnCursoExcluido = hastaEfectivo !== hasta

    const [vehRes, repartoRes, chkRes, indispRes, otRes] = await Promise.all([
      supabase.from("catalogo_vehiculos").select("dominio, tipo"),
      traerTodo<{ patente: string | null; fecha: string; ds_fletero_carga: string | null }>(
        (a, b) =>
          supabase
            .from("ventas_diarias_cliente")
            .select("patente, fecha, ds_fletero_carga")
            .gte("fecha", desde)
            .lte("fecha", hastaEfectivo)
            .range(a, b),
      ),
      traerTodo<{ dominio: string; fecha: string; tipo: string }>((a, b) =>
        supabase
          .from("checklist_vehiculos")
          .select("dominio, fecha, tipo")
          .gte("fecha", desde)
          .lte("fecha", hastaEfectivo)
          .range(a, b),
      ),
      supabase
        .from("flota_indisponibilidad")
        .select("dominio, fecha_desde, fecha_hasta")
        .gte("fecha_hasta", desde)
        .lte("fecha_desde", hastaEfectivo),
      // 🚨 La parada por una ORDEN DE TRABAJO se guarda acá, no en
      // `flota_indisponibilidad`: son dos lugares distintos y mirar sólo el
      // primero castigaba al camión que estuvo en el taller. Caso real: el
      // AF588SU el 03/08/2026 entró por la OT 1755 (pérdida de aire en una
      // manguera, taller Luval) con `fuera_servicio` ese mismo día, no cargó
      // checklist —lógico, no salió— y figuraba en ventas con UN cliente y 0,33
      // bultos. Contaba como incumplimiento del chofer, que había cargado
      // normalmente el 01, el 04 y el 05.
      supabase
        .from("mantenimiento_realizados")
        .select("dominio, fuera_servicio_desde, fuera_servicio_hasta")
        .not("fuera_servicio_desde", "is", null)
        .lte("fuera_servicio_desde", hastaEfectivo),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if ("error" in repartoRes) return { error: repartoRes.error }
    if ("error" in chkRes) return { error: chkRes.error }
    if (indispRes.error) return { error: indispRes.error.message }
    if (otRes.error) return { error: otRes.error.message }

    const esCamion = new Set(
      ((vehRes.data || []) as Array<{ dominio: string; tipo: string | null }>)
        .filter((v) => v.tipo === "camion")
        .map((v) => v.dominio.trim().toUpperCase()),
    )

    const clave = (fecha: string, dominio: string) => `${fecha}|${dominio}`
    const lib = new Set<string>()
    const ret = new Set<string>()
    for (const c of chkRes.data) {
      const dom = (c.dominio || "").trim().toUpperCase()
      if (!esCamion.has(dom)) continue
      if (c.tipo === "liberacion") lib.add(clave(c.fecha, dom))
      else if (c.tipo === "retorno") ret.add(clave(c.fecha, dom))
    }

    // Denominador: camión-día con reparto real, sin repetir.
    //
    // 🚨 Se descartan los camión-día cuya actividad es SÓLO venta de gestión
    // (`ds_fletero_carga = 'GESTION-<código>'`). GESCOM no expone la patente:
    // `patenteDeChofer()` la deduce del checklist del día y, si no hay, cae al
    // `mapeo_chofer_gescom.patente_default`. O sea que el chofer que no carga el
    // checklist FABRICA un camión-día con su patente vieja, y ese camión-día
    // entra al denominador con 0 % garantizado: la falta se castiga dos veces y
    // encima en la unidad equivocada. Caso real: FRÍAS pasó de AF469UR a OJA403
    // y AF469UR seguía sumando 8 camión-día de 1 a 7 clientes, con el último
    // checklist propio en junio. Si el camión además repartió su ruta (el
    // fletero ES su patente), el día cuenta normalmente aunque lleve gestión.
    const filas = new Map<string, { fecha: string; dominio: string; observada: boolean }>()
    for (const r of repartoRes.data) {
      const dom = (r.patente || "").trim().toUpperCase()
      if (!dom || !esCamion.has(dom)) continue
      const k = clave(r.fecha, dom)
      const derivada = (r.ds_fletero_carga || "").trim().toUpperCase().startsWith("GESTION")
      const prev = filas.get(k)
      filas.set(k, {
        fecha: r.fecha,
        dominio: dom,
        observada: (prev?.observada ?? false) || !derivada,
      })
    }
    // 🚨 Una unidad FUERA DE SERVICIO no repartió: si aparece con reparto ese
    // día, el dato está mal atribuido y exigirle el checklist es absurdo.
    // AF469UR estuvo en taller del 23/06 al 03/08/2026 por la ECU (OT 1733) y
    // aun así figuraba con 9 camión-día. La indisponibilidad ya está cargada en
    // el sistema: alcanza con mirarla.
    const indisponible = [
      ...((indispRes.data || []) as Array<{
        dominio: string
        fecha_desde: string
        fecha_hasta: string
      }>).map((i) => ({
        dominio: (i.dominio || "").trim().toUpperCase(),
        desde: i.fecha_desde,
        hasta: i.fecha_hasta,
      })),
      // Las paradas por orden de trabajo. Si la OT no cerró
      // (`fuera_servicio_hasta` en null) la unidad sigue afuera: se toma el
      // final del rango medido, no la fecha de inicio, o el día de la parada
      // sería el único perdonado y los siguientes volverían a contar.
      ...((otRes.data || []) as Array<{
        dominio: string
        fuera_servicio_desde: string | null
        fuera_servicio_hasta: string | null
      }>)
        .filter((o) => o.fuera_servicio_desde)
        .map((o) => ({
          dominio: (o.dominio || "").trim().toUpperCase(),
          desde: o.fuera_servicio_desde as string,
          hasta: o.fuera_servicio_hasta ?? hastaEfectivo,
        })),
    ]
    const estaFueraDeServicio = (dominio: string, fecha: string) =>
      indisponible.some(
        (i) => i.dominio === dominio && fecha >= i.desde && fecha <= i.hasta,
      )

    const ruteados = new Map<string, { fecha: string; dominio: string }>()
    let soloGestionExcluidos = 0
    let fueraDeServicioExcluidos = 0
    for (const [k, v] of filas) {
      if (estaFueraDeServicio(v.dominio, v.fecha)) {
        fueraDeServicioExcluidos++
        continue
      }
      if (!v.observada) {
        soloGestionExcluidos++
        continue
      }
      ruteados.set(k, { fecha: v.fecha, dominio: v.dominio })
    }

    let completos = 0
    let soloLiberacion = 0
    let sinNinguno = 0
    const faltantes: DiaFaltante[] = []
    const porUnidadMap = new Map<string, { ruteados: number; completos: number }>()

    for (const [k, { fecha, dominio }] of ruteados) {
      const tieneLib = lib.has(k)
      const tieneRet = ret.has(k)
      const acc = porUnidadMap.get(dominio) ?? { ruteados: 0, completos: 0 }
      acc.ruteados += 1

      if (tieneLib && tieneRet) {
        completos += 1
        acc.completos += 1
      } else if (tieneLib) {
        soloLiberacion += 1
        faltantes.push({ fecha, dominio, falta: "retorno" })
      } else if (tieneRet) {
        faltantes.push({ fecha, dominio, falta: "liberacion" })
      } else {
        sinNinguno += 1
        faltantes.push({ fecha, dominio, falta: "ambos" })
      }
      porUnidadMap.set(dominio, acc)
    }

    const agrupar = (corte: (f: string) => string): AdherenciaPunto[] => {
      const m = new Map<string, { ruteados: number; completos: number }>()
      for (const [k, { fecha }] of ruteados) {
        const c = corte(fecha)
        const acc = m.get(c) ?? { ruteados: 0, completos: 0 }
        acc.ruteados += 1
        if (lib.has(k) && ret.has(k)) acc.completos += 1
        m.set(c, acc)
      }
      return [...m.entries()]
        .map(([clave, v]) => ({
          clave,
          ruteados: v.ruteados,
          completos: v.completos,
          pct: Math.round((v.completos / v.ruteados) * 1000) / 10,
        }))
        .sort((a, b) => a.clave.localeCompare(b.clave))
    }

    const total = ruteados.size

    return {
      data: {
        desde,
        hasta: hastaEfectivo,
        diaEnCursoExcluido,
        soloGestionExcluidos,
        fueraDeServicioExcluidos,
        ruteados: total,
        completos,
        soloLiberacion,
        sinNinguno,
        pct: total ? Math.round((completos / total) * 1000) / 10 : null,
        serieDia: agrupar((f) => f),
        serieMes: agrupar((f) => f.slice(0, 7)),
        faltantes: faltantes.sort(
          (a, b) => b.fecha.localeCompare(a.fecha) || a.dominio.localeCompare(b.dominio),
        ),
        porUnidad: [...porUnidadMap.entries()]
          .map(([dominio, v]) => ({
            dominio,
            ruteados: v.ruteados,
            completos: v.completos,
            pct: Math.round((v.completos / v.ruteados) * 1000) / 10,
          }))
          .sort((a, b) => a.pct - b.pct || b.ruteados - a.ruteados),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
