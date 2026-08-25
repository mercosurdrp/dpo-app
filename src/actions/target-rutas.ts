"use server"
/**
 * Target de CEq por camión según ruta (pedido de la reunión de logística del
 * 19/05). La ruta del día de cada camión se deriva de
 * ocupacion_bodega_localidad_diaria: se suma el CEq por ruta (vía el mapeo
 * localidad→ruta de rutas_reparto) y gana la dominante. El CEq real del
 * camión-día sale de ocupacion_bodega_diaria.ceq_total (Chess + Gestión).
 * OJO: los viajes 100% Gestión no tienen detalle por localidad (el sync GESCOM
 * no lo trae), quedan como "sin ruta" y se comparan contra el target global.
 */
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { MINIMO_CEQ } from "@/lib/ocupacion-bodega"

const ROLES_EDICION = ["admin", "supervisor"] as const
const SOLO_PAMPEANA = "El target por ruta solo está disponible en Pampeana."
/** Carga mínima esperada por viaje: el fallback cuando la ruta no tiene target. */
const TARGET_GLOBAL_CEQ = MINIMO_CEQ

// ---------- Types ----------

export interface RutaReparto {
  id: string
  nombre: string
  localidades: string[]
  target_ceq: number | null
  orden: number
}

export interface RutaStats {
  ruta_id: string
  ruta: string
  target_ceq: number | null
  camion_dias: number
  ceq_prom: number
  ceq_p50: number
  ceq_p80: number
  ceq_max: number
  /** Sugerencia de target = p80 histórico redondeado a múltiplo de 5. */
  sugerencia: number
  /** Solo si hay target definido. */
  dias_en_target: number | null
  pct_en_target: number | null
}

export interface CamionDiaRuta {
  fecha: string
  patente: string
  /** null = sin detalle por localidad (viaje 100% Gestión o dato viejo). */
  ruta: string | null
  ruta_id: string | null
  ceq_total: number
  bultos_total: number
  /** Target aplicado: el de la ruta si existe, si no el mínimo global. */
  target: number
  target_es_de_ruta: boolean
  pct: number
}

export interface TargetRutasData {
  desde: string
  hasta: string
  rutas: RutaReparto[]
  stats: RutaStats[]
  dias: CamionDiaRuta[]
  localidades_sin_ruta: string[]
  target_global: number
}

// ---------- Helpers ----------

function hoyARG(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0
  const idx = (ordenados.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return ordenados[lo]
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo)
}

const r1 = (n: number) => Math.round(n * 10) / 10

// ---------- Lectura ----------

export async function getTargetRutas(
  dias = 60,
): Promise<{ data: TargetRutasData } | { error: string }> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supa = await createClient()
    const hasta = hoyARG()
    const desde = restarDias(hasta, Math.min(Math.max(dias, 7), 120))

    const [rutasRaw, oblRaw, obRaw] = await Promise.all([
      supa
        .from("rutas_reparto")
        .select("id, nombre, localidades, target_ceq, orden")
        .eq("activo", true)
        .order("orden"),
      supa
        .from("ocupacion_bodega_localidad_diaria")
        .select("fecha, patente, localidad, ceq_total")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(0, 9999),
      supa
        .from("ocupacion_bodega_diaria")
        .select("fecha, patente, ceq_total, bultos_total")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("ceq_total", 0)
        .range(0, 9999),
    ])

    if (rutasRaw.error) {
      // 42P01 = la tabla todavía no existe en este Supabase
      if (rutasRaw.error.code === "42P01") {
        return {
          error:
            "Falta aplicar la migración de rutas: correr APLICAR_EN_PAMPEANA_RUTAS_TARGETS.sql en el Supabase de Pampeana.",
        }
      }
      return { error: `rutas_reparto: ${rutasRaw.error.message}` }
    }
    if (obRaw.error) return { error: `ocupacion_bodega_diaria: ${obRaw.error.message}` }

    const rutas: RutaReparto[] = (rutasRaw.data ?? []).map((r) => ({
      id: r.id as string,
      nombre: r.nombre as string,
      localidades: (r.localidades ?? []) as string[],
      target_ceq: r.target_ceq == null ? null : Number(r.target_ceq),
      orden: Number(r.orden ?? 0),
    }))

    // Mapeo localidad → ruta (si una localidad quedó en dos rutas, gana la de
    // menor orden; la edición desde la app lo evita).
    const rutaPorLocalidad = new Map<string, RutaReparto>()
    for (const ruta of rutas) {
      for (const loc of ruta.localidades) {
        if (!rutaPorLocalidad.has(loc)) rutaPorLocalidad.set(loc, ruta)
      }
    }

    // CEq por (fecha|patente) por ruta, para elegir la dominante del día.
    const ceqPorRutaDia = new Map<string, Map<string, number>>()
    const localidadesVistas = new Set<string>()
    for (const row of (oblRaw.data ?? []) as Array<{
      fecha: string
      patente: string
      localidad: string
      ceq_total: number | null
    }>) {
      const loc = (row.localidad ?? "").trim()
      if (!loc) continue
      localidadesVistas.add(loc)
      const ruta = rutaPorLocalidad.get(loc)
      if (!ruta) continue
      const key = `${row.fecha}|${row.patente}`
      let porRuta = ceqPorRutaDia.get(key)
      if (!porRuta) {
        porRuta = new Map()
        ceqPorRutaDia.set(key, porRuta)
      }
      porRuta.set(ruta.id, (porRuta.get(ruta.id) ?? 0) + Number(row.ceq_total ?? 0))
    }

    const rutaPorId = new Map(rutas.map((r) => [r.id, r]))

    const diasRows: CamionDiaRuta[] = []
    for (const row of (obRaw.data ?? []) as Array<{
      fecha: string
      patente: string
      ceq_total: number
      bultos_total: number
    }>) {
      const key = `${row.fecha}|${row.patente}`
      const porRuta = ceqPorRutaDia.get(key)
      let rutaDominante: RutaReparto | null = null
      if (porRuta && porRuta.size > 0) {
        let maxCeq = -1
        for (const [rutaId, ceq] of porRuta) {
          if (ceq > maxCeq) {
            maxCeq = ceq
            rutaDominante = rutaPorId.get(rutaId) ?? null
          }
        }
      }
      const target = rutaDominante?.target_ceq ?? TARGET_GLOBAL_CEQ
      const ceq = Number(row.ceq_total)
      diasRows.push({
        fecha: row.fecha,
        patente: row.patente,
        ruta: rutaDominante?.nombre ?? null,
        ruta_id: rutaDominante?.id ?? null,
        ceq_total: r1(ceq),
        bultos_total: r1(Number(row.bultos_total)),
        target,
        target_es_de_ruta: rutaDominante?.target_ceq != null,
        pct: target > 0 ? r1((ceq / target) * 100) : 0,
      })
    }
    diasRows.sort((a, b) =>
      a.fecha === b.fecha ? b.ceq_total - a.ceq_total : (a.fecha < b.fecha ? 1 : -1),
    )

    // Stats históricas por ruta (sobre camión-días con ruta derivada).
    const stats: RutaStats[] = rutas.map((ruta) => {
      const ceqs = diasRows
        .filter((d) => d.ruta_id === ruta.id)
        .map((d) => d.ceq_total)
        .sort((a, b) => a - b)
      const p80 = percentil(ceqs, 0.8)
      const target = ruta.target_ceq
      const enTarget =
        target != null ? ceqs.filter((c) => c >= target).length : null
      return {
        ruta_id: ruta.id,
        ruta: ruta.nombre,
        target_ceq: target,
        camion_dias: ceqs.length,
        ceq_prom: r1(ceqs.reduce((a, b) => a + b, 0) / (ceqs.length || 1)),
        ceq_p50: r1(percentil(ceqs, 0.5)),
        ceq_p80: r1(p80),
        ceq_max: r1(ceqs[ceqs.length - 1] ?? 0),
        sugerencia: Math.max(5, Math.round(p80 / 5) * 5),
        dias_en_target: enTarget,
        pct_en_target:
          target != null && ceqs.length > 0
            ? r1(((enTarget ?? 0) / ceqs.length) * 100)
            : null,
      }
    })

    const localidadesSinRuta = [...localidadesVistas]
      .filter((l) => !rutaPorLocalidad.has(l))
      .sort()

    return {
      data: {
        desde,
        hasta,
        rutas,
        stats,
        dias: diasRows,
        localidades_sin_ruta: localidadesSinRuta,
        target_global: TARGET_GLOBAL_CEQ,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando target por ruta" }
  }
}

// ---------- Escritura ----------

export async function setTargetRuta(
  rutaId: string,
  target: number | null,
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    if (target != null && (!Number.isFinite(target) || target <= 0 || target > 5000)) {
      return { error: "El target tiene que ser un número entre 1 y 5000 CEq." }
    }
    const admin = createAdminClient()
    const { error } = await admin
      .from("rutas_reparto")
      .update({
        target_ceq: target,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rutaId)
    if (error) return { error: error.message }
    revalidatePath("/indicadores/target-rutas")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error guardando target" }
  }
}

/**
 * Asigna una localidad a una ruta (sacándola de cualquier otra) o la
 * desasigna (rutaId = null). Mantiene la invariante: una localidad vive en
 * una sola ruta.
 */
export async function asignarLocalidad(
  localidad: string,
  rutaId: string | null,
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const loc = localidad.trim().toUpperCase()
    if (!loc) return { error: "Localidad vacía." }

    const admin = createAdminClient()
    const { data: rutas, error: errRutas } = await admin
      .from("rutas_reparto")
      .select("id, localidades")
    if (errRutas) return { error: errRutas.message }

    const ahora = new Date().toISOString()
    for (const ruta of rutas ?? []) {
      const actuales = (ruta.localidades ?? []) as string[]
      const tiene = actuales.includes(loc)
      const debeTener = ruta.id === rutaId
      if (tiene === debeTener) continue
      const nuevas = debeTener ? [...actuales, loc] : actuales.filter((l) => l !== loc)
      const { error } = await admin
        .from("rutas_reparto")
        .update({ localidades: nuevas, updated_by: profile.id, updated_at: ahora })
        .eq("id", ruta.id)
      if (error) return { error: error.message }
    }
    revalidatePath("/indicadores/target-rutas")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error asignando localidad" }
  }
}
