"use server"

import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { Profile } from "@/types/database"

const BUCKET = "presupuestos"
const REVALIDATE_PATH = "/presupuesto"
const SHEET_DESVIOS = "DESVIOS"
const UMBRAL_PCT = 15
const UMBRAL_ABS = 250_000
const DIAS_VENCIMIENTO = 10

type Result<T> = { data: T } | { error: string }

export interface PreviewTareaItem {
  rubro: string
  categoria: string | null
  tipo_costo: "fijo" | "variable" | null
  monto_presupuestado: number | null
  monto_real: number | null
  desvio_pct: number | null
  desvio_abs: number | null
  motivo: "no_presupuestado" | "pct" | "abs" | "pct_y_abs"
  responsable_id: string | null
  responsable_nombre: string | null
  ya_existe: boolean
}

interface CatalogoRow {
  rubro: string
  categoria: string
  tipo_costo: "fijo" | "variable"
  responsable_default_id: string | null
}

interface ProfileMin {
  id: string
  nombre: string | null
}

/**
 * Presupuesto ANUAL por rubro, para las metas de las iniciativas de ahorro.
 *
 * Sale de una hoja distinta a la de los desvíos: la hoja "DESVIOS" sólo trae los
 * meses ya cerrados (el archivo de julio 2026 llega hasta junio), así que sumarla
 * daría medio año. La hoja "PRESUPUESTO <año> MRP" tiene los 12 meses más una
 * columna TOTAL (verificado: TOTAL == suma de los 12 en todos los rubros).
 */
function parseHojaPresupuestoAnual(buffer: ArrayBuffer): Map<string, number> {
  const wb = XLSX.read(buffer, { type: "array" })
  const nombre = wb.SheetNames.find((n) => /^\s*PRESUPUESTO\b/i.test(n))
  if (!nombre) {
    throw new Error(
      'El Excel no tiene una hoja "PRESUPUESTO <año> MRP" con el presupuesto anual',
    )
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], {
    header: 1,
    defval: null,
    blankrows: false,
  })

  // Misma forma que la hoja DESVIOS: rubro en la col 1, datos desde la fila 3.
  // Acá la col 2 es el TOTAL del año.
  const out = new Map<string, number>()
  for (let i = 3; i < aoa.length; i++) {
    const row = aoa[i]
    if (!row) continue
    const sub = row[1]
    if (typeof sub !== "string") continue
    const subNorm = normalizar(sub)
    if (!subNorm || subNorm === "TOTAL" || subNorm === "RUBRO") continue
    const total = row[2]
    if (typeof total !== "number" || !Number.isFinite(total) || total === 0) {
      continue
    }
    out.set(subNorm, total)
  }
  return out
}

/** Presupuesto anual de cada rubro del EERR del año. Clave: rubro normalizado. */
export async function getPresupuestoAnualPorRubro(
  anio: number,
): Promise<Result<Record<string, number>>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: eerr, error: errEerr } = await supabase
      .from("presupuestos_eerr_anual")
      .select("archivo_url")
      .eq("anio", anio)
      .maybeSingle()
    if (errEerr) return { error: errEerr.message }
    if (!eerr?.archivo_url) {
      return { error: `No hay Estado de Resultado cargado para ${anio}` }
    }

    const { data: blob, error: errDl } = await supabase.storage
      .from(BUCKET)
      .download(eerr.archivo_url)
    if (errDl || !blob) {
      return { error: `Descargando EERR: ${errDl?.message ?? "sin blob"}` }
    }

    const mapa = parseHojaPresupuestoAnual(await blob.arrayBuffer())
    return { data: Object.fromEntries(mapa) }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error leyendo el presupuesto anual por rubro",
    }
  }
}

function normalizar(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase()
}

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para generar tareas")
  }
  return profile
}

interface FilaDesvio {
  rubro: string
  rubro_norm: string
  presup: number | null
  real: number | null
}

function parseHojaDesvios(buffer: ArrayBuffer, mes: number): FilaDesvio[] {
  const wb = XLSX.read(buffer, { type: "array" })
  const ws = wb.Sheets[SHEET_DESVIOS]
  if (!ws) throw new Error(`El Excel no tiene la hoja "${SHEET_DESVIOS}"`)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  const colPpto = 2 + 4 * (mes - 1)
  const colReal = 3 + 4 * (mes - 1)

  const out: FilaDesvio[] = []
  for (let i = 3; i < aoa.length; i++) {
    const row = aoa[i]
    if (!row) continue
    const sub = row[1]
    if (typeof sub !== "string") continue
    const subNorm = normalizar(sub)
    if (!subNorm || subNorm === "TOTAL" || subNorm === "RUBRO") continue

    const presupRaw = row[colPpto]
    const realRaw = row[colReal]
    const presup =
      typeof presupRaw === "number" && Number.isFinite(presupRaw)
        ? presupRaw
        : null
    const real =
      typeof realRaw === "number" && Number.isFinite(realRaw) ? realRaw : null
    if (presup === null && real === null) continue

    out.push({ rubro: sub.trim(), rubro_norm: subNorm, presup, real })
  }
  return out
}

function aplicarCriterio(
  fila: FilaDesvio,
  tipo: "fijo" | "variable" | null,
): {
  cumple: boolean
  motivo: PreviewTareaItem["motivo"]
  desvio_pct: number | null
  desvio_abs: number | null
} {
  const { presup, real } = fila

  const noPresupuestado =
    (presup === null || presup === 0) && real !== null && real !== 0

  if (noPresupuestado) {
    return {
      cumple: true,
      motivo: "no_presupuestado",
      desvio_pct: null,
      desvio_abs: real,
    }
  }

  if (presup === null || real === null) {
    return {
      cumple: false,
      motivo: "pct",
      desvio_pct: null,
      desvio_abs: null,
    }
  }

  const desvio_abs = real - presup
  const desvio_pct = presup !== 0 ? (desvio_abs / presup) * 100 : null
  const absPct = desvio_pct === null ? 0 : Math.abs(desvio_pct)
  const absAbs = Math.abs(desvio_abs)

  const cumplePct = absPct > UMBRAL_PCT
  const cumpleAbs = absAbs > UMBRAL_ABS

  if (tipo === "variable") {
    if (cumplePct && cumpleAbs) {
      return { cumple: true, motivo: "pct_y_abs", desvio_pct, desvio_abs }
    }
    if (cumplePct) {
      return { cumple: true, motivo: "pct", desvio_pct, desvio_abs }
    }
    if (cumpleAbs) {
      return { cumple: true, motivo: "abs", desvio_pct, desvio_abs }
    }
    return { cumple: false, motivo: "pct", desvio_pct, desvio_abs }
  }

  // fijo o desconocido (rubro fuera de catálogo): solo |%|>15 dispara mensual
  if (cumplePct) {
    return { cumple: true, motivo: "pct", desvio_pct, desvio_abs }
  }
  return { cumple: false, motivo: "pct", desvio_pct, desvio_abs }
}

export async function previewTareasDesdeEerr(
  anio: number,
  mes: number,
): Promise<Result<PreviewTareaItem[]>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: eerr, error: errEerr } = await supabase
      .from("presupuestos_eerr_anual")
      .select("archivo_url")
      .eq("anio", anio)
      .maybeSingle()
    if (errEerr) return { error: errEerr.message }
    if (!eerr || !eerr.archivo_url) {
      return { error: "No hay Estado de Resultado cargado para ese año" }
    }

    const { data: blob, error: errDl } = await supabase.storage
      .from(BUCKET)
      .download(eerr.archivo_url)
    if (errDl || !blob) {
      return { error: `Descargando EERR: ${errDl?.message ?? "sin blob"}` }
    }
    const buffer = await blob.arrayBuffer()

    const filas = parseHojaDesvios(buffer, mes)

    const { data: catalogoRaw } = await supabase
      .from("presupuesto_rubros_catalogo")
      .select("rubro, categoria, tipo_costo, responsable_default_id")
      .eq("activo", true)
    const catalogo = (catalogoRaw ?? []) as CatalogoRow[]
    const byNorm = new Map(catalogo.map((c) => [normalizar(c.rubro), c]))

    const respIds = Array.from(
      new Set(catalogo.map((c) => c.responsable_default_id).filter(Boolean)),
    ) as string[]
    const { data: profilesRaw } = await supabase
      .from("profiles")
      .select("id, nombre")
      .in("id", respIds.length > 0 ? respIds : ["00000000-0000-0000-0000-000000000000"])
    const profiles = (profilesRaw ?? []) as ProfileMin[]
    const byProfileId = new Map(profiles.map((p) => [p.id, p]))

    const { data: existentesRaw } = await supabase
      .from("presupuestos_tareas")
      .select("rubro")
      .eq("anio", anio)
      .eq("mes", mes)
    const existentes = new Set(
      (existentesRaw ?? []).map((t: { rubro: string }) =>
        normalizar(t.rubro),
      ),
    )

    const items: PreviewTareaItem[] = []
    for (const f of filas) {
      const cat = byNorm.get(f.rubro_norm) ?? null
      const tipo = cat?.tipo_costo ?? null
      const res = aplicarCriterio(f, tipo)
      if (!res.cumple) continue

      const respId = cat?.responsable_default_id ?? null
      const respNombre = respId
        ? byProfileId.get(respId)?.nombre ?? null
        : null

      items.push({
        rubro: f.rubro,
        categoria: cat?.categoria ?? null,
        tipo_costo: tipo,
        monto_presupuestado: f.presup,
        monto_real: f.real,
        desvio_pct: res.desvio_pct,
        desvio_abs: res.desvio_abs,
        motivo: res.motivo,
        responsable_id: respId,
        responsable_nombre: respNombre,
        ya_existe: existentes.has(f.rubro_norm),
      })
    }

    items.sort((a, b) => {
      const aw = a.ya_existe ? 1 : 0
      const bw = b.ya_existe ? 1 : 0
      if (aw !== bw) return aw - bw
      const aAbs = Math.abs(a.desvio_abs ?? 0)
      const bAbs = Math.abs(b.desvio_abs ?? 0)
      return bAbs - aAbs
    })

    return { data: items }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error generando preview",
    }
  }
}

export interface GenerarItemInput {
  rubro: string
  monto_presupuestado: number | null
  monto_real: number | null
  responsable_id: string | null
  tipo_costo: "fijo" | "variable" | null
}

export async function generarTareasDesdeEerr(
  anio: number,
  mes: number,
  items: GenerarItemInput[],
): Promise<Result<{ creadas: number; saltadas: number }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    if (!items.length) return { data: { creadas: 0, saltadas: 0 } }

    const norms = items.map((i) => normalizar(i.rubro))
    const { data: existentesRaw } = await supabase
      .from("presupuestos_tareas")
      .select("rubro")
      .eq("anio", anio)
      .eq("mes", mes)
    const existentes = new Set(
      (existentesRaw ?? []).map((t: { rubro: string }) =>
        normalizar(t.rubro),
      ),
    )

    const hoy = new Date()
    const vence = new Date(hoy)
    vence.setDate(vence.getDate() + DIAS_VENCIMIENTO)
    const fechaLimite = vence.toISOString().slice(0, 10)

    const aInsertar: Array<{
      anio: number
      mes: number
      rubro: string
      monto_presupuestado: number | null
      monto_real: number | null
      responsable_id: string | null
      tipo_costo: "fijo" | "variable" | null
      fecha_limite: string
      estado: "pendiente"
      created_by: string
    }> = []

    let saltadas = 0
    for (let i = 0; i < items.length; i++) {
      if (existentes.has(norms[i])) {
        saltadas++
        continue
      }
      const it = items[i]
      aInsertar.push({
        anio,
        mes,
        rubro: it.rubro,
        monto_presupuestado: it.monto_presupuestado,
        monto_real: it.monto_real,
        responsable_id: it.responsable_id,
        tipo_costo: it.tipo_costo,
        fecha_limite: fechaLimite,
        estado: "pendiente",
        created_by: profile.id,
      })
    }

    if (!aInsertar.length) {
      return { data: { creadas: 0, saltadas } }
    }

    const { error } = await supabase
      .from("presupuestos_tareas")
      .insert(aInsertar)
    if (error) return { error: error.message }

    const porResp = new Map<string, number>()
    for (const t of aInsertar) {
      if (!t.responsable_id) continue
      porResp.set(t.responsable_id, (porResp.get(t.responsable_id) ?? 0) + 1)
    }
    for (const [respId, cant] of porResp) {
      try {
        await supabase.from("notificaciones").insert({
          user_id: respId,
          tipo: "presupuesto_tarea_asignada",
          titulo: `${cant} tarea${cant > 1 ? "s" : ""} de análisis asignada${cant > 1 ? "s" : ""}`,
          mensaje: `Se te asignaron ${cant} análisis de desvíos del EERR.`,
          link: REVALIDATE_PATH,
        })
      } catch {
        // no bloquear
      }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { creadas: aInsertar.length, saltadas } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error generando tareas",
    }
  }
}
