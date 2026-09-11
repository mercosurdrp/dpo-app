"use server"

import { requireAuth } from "@/lib/session"
import { getPool } from "@/lib/mercosur-dashboard"
import { ciudadDeLocalidad } from "@/lib/priorizacion/score"

// ─────────────────────────────────────────────────────────────────────────────
// Rutero vigente de promotores por ciudad, leído de la base comercial
// (ruta_clientes_dia + clientes, sincronizadas desde Chess todos los días).
//
// Es el "después" vivo de un plan territorial: cuántos promotores atienden la
// ciudad, qué días la visitan y con qué mezcla de frecuencias. No se guarda
// acá: el plan congela una foto en territorial_rediseno_rutas, porque cuando
// ventas vuelva a tocar el rutero la evidencia del plan no tiene que moverse.
//
// dia_semana en ruta_clientes_dia es 1 = domingo … 7 = sábado (verificado
// contra cambios_ruta_items, que trae el nombre y el número del día juntos).
// ─────────────────────────────────────────────────────────────────────────────

const DIAS = ["", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

export interface PromotorRutero {
  nombre: string
  pdv: number
  /** Días de visita a la ciudad, ya como texto ("Mar · Mié · Jue"). */
  dias: string
  dias_num: number[]
}

export interface RuteroVigente {
  ciudad: string
  /** Última sincronización del rutero en la base comercial (ISO). */
  sincronizado: string | null
  clientes_activos: number
  pdv_en_rutero: number
  /** Clientes con ventana horaria relevada por el promotor. */
  con_horario: number
  promotores: PromotorRutero[]
  /** Unión de los días de visita de todos los promotores, como texto. */
  dias_visita: string
  /** Cuántos días distintos por semana entra un promotor a la ciudad. */
  visitas_sem: number
  mix: { semanal: number; quincenal: number; trimensual: number; mensual: number }
  /** El mix ya escrito como lo mostraría la tarjeta. */
  mix_texto: string
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Orden de frecuencias para desempatar: menor = más frecuente. */
function rango(f: string): number {
  if (f === "SEMANAL") return 0
  if (f === "QUINCENAL") return 1
  if (f === "TRIMENSUAL") return 2
  if (f.startsWith("MENSUAL")) return 3
  return 9
}

/**
 * Rutero vigente de una ciudad de dpo-app ("Colón", "San Nicolás"…). Devuelve
 * null si la base comercial no responde: la página del plan no puede caerse
 * por eso, el rediseño guardado sigue siendo la evidencia.
 */
export async function getRuteroVigente(
  ciudad: string,
): Promise<RuteroVigente | null> {
  try {
    await requireAuth()
    const objetivo = norm(ciudad)
    const pool = getPool()

    // 1) Qué localidades comerciales caen en esta ciudad de ruteo. Son ~100
    //    localidades distintas: se traen todas y se mapean con el mismo alias
    //    que usa Priorización, así "COLON" y "Colón" son la misma cosa.
    const locs = await pool.query<{ des_localidad: string | null }>(
      `SELECT DISTINCT des_localidad FROM clientes WHERE anulado IS DISTINCT FROM 'S'`,
    )
    const localidades = locs.rows
      .map((r) => r.des_localidad)
      .filter((l): l is string => {
        if (!l) return false
        return norm(ciudadDeLocalidad(l)) === objetivo || norm(l) === objetivo
      })
    if (localidades.length === 0) return null

    // 2) Clientes activos de esas localidades y su rutero.
    const cli = await pool.query<{ id_cliente: number; con_horario: boolean }>(
      `SELECT id_cliente, (horario IS NOT NULL) AS con_horario
         FROM clientes
        WHERE anulado IS DISTINCT FROM 'S' AND des_localidad = ANY($1)`,
      [localidades],
    )
    const ids = cli.rows.map((r) => r.id_cliente)
    if (ids.length === 0) return null

    const rut = await pool.query<{
      promotor: string | null
      id_cliente: number
      dia_semana: number
      frecuencia: string | null
      synced_at: Date | string | null
    }>(
      `SELECT promotor, id_cliente, dia_semana, frecuencia, synced_at
         FROM ruta_clientes_dia
        WHERE id_cliente = ANY($1)`,
      [ids],
    )

    const porPromotor = new Map<string, { pdv: Set<number>; dias: Set<number> }>()
    const frecPorCliente = new Map<number, string>()
    const diasCiudad = new Set<number>()
    let sincronizado: string | null = null
    for (const r of rut.rows) {
      const nombre = (r.promotor ?? "(sin promotor)").trim()
      const p = porPromotor.get(nombre) ?? { pdv: new Set(), dias: new Set() }
      p.pdv.add(r.id_cliente)
      p.dias.add(Number(r.dia_semana))
      porPromotor.set(nombre, p)
      diasCiudad.add(Number(r.dia_semana))
      // Un cliente con dos frecuencias distintas (raro) se queda con la más alta.
      const f = (r.frecuencia ?? "").toUpperCase()
      const prev = frecPorCliente.get(r.id_cliente)
      if (!prev || rango(f) < rango(prev)) frecPorCliente.set(r.id_cliente, f)
      if (r.synced_at) {
        const iso = new Date(r.synced_at).toISOString()
        if (!sincronizado || iso > sincronizado) sincronizado = iso
      }
    }

    const mix = { semanal: 0, quincenal: 0, trimensual: 0, mensual: 0 }
    for (const f of frecPorCliente.values()) {
      if (f === "SEMANAL") mix.semanal++
      else if (f === "QUINCENAL") mix.quincenal++
      else if (f === "TRIMENSUAL") mix.trimensual++
      else if (f.startsWith("MENSUAL")) mix.mensual++
    }

    const diasTexto = (d: Set<number>) =>
      [...d]
        .sort((a, b) => a - b)
        .map((n) => DIAS[n] ?? String(n))
        .join(" · ")

    const promotores: PromotorRutero[] = [...porPromotor.entries()]
      .map(([nombre, p]) => ({
        nombre,
        pdv: p.pdv.size,
        dias: diasTexto(p.dias),
        dias_num: [...p.dias].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.pdv - a.pdv)

    const partes: string[] = []
    if (mix.semanal) partes.push(`${mix.semanal} semanal`)
    if (mix.quincenal) partes.push(`${mix.quincenal} quincenal`)
    if (mix.trimensual) partes.push(`${mix.trimensual} trimensual`)
    if (mix.mensual) partes.push(`${mix.mensual} mensual`)

    return {
      ciudad,
      sincronizado,
      clientes_activos: cli.rows.length,
      pdv_en_rutero: frecPorCliente.size,
      con_horario: cli.rows.filter((r) => r.con_horario).length,
      promotores,
      dias_visita: diasTexto(diasCiudad),
      visitas_sem: diasCiudad.size,
      mix,
      mix_texto: partes.join(" · "),
    }
  } catch (err) {
    console.error("[territorial-rutero] no se pudo leer el rutero vigente:", err)
    return null
  }
}
