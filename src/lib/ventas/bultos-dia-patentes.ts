/**
 * Detalle de un día del gráfico "Bultos por día Chess/Gestión": qué patentes
 * (camiones/repartos) componen los bultos entregados y rechazados de esa fecha.
 * Entregados de `ventas_diarias`; rechazados de `rechazos`; nombre del chofer
 * desde mapeo_patente_chofer (Chess) / mapeo_chofer_gescom (Gestión); la
 * patente de Gestión sale de `ventas_diarias_cliente` (derivada por el sync).
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface BultosPatenteDia {
  origen: "chess" | "gestion"
  ds_fletero_carga: string
  /** Patente mostrable: Chess = el fletero; Gestión = derivada (null si no se pudo). */
  patente: string | null
  chofer_nombre: string | null
  bultos: number
  bultos_rechazados: number
}

export interface BultosDiaPatentes {
  fecha: string
  total_bultos: number
  patentes: BultosPatenteDia[]
}

export async function getBultosDiaPatentes(
  supa: SupaClient,
  fecha: string,
): Promise<BultosDiaPatentes> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida (esperado YYYY-MM-DD)")
  }

  const [ventasRaw, rechazosRaw, mapeoRaw, gescomRaw, patentesGestionRaw] = await Promise.all([
    supa
      .from("ventas_diarias")
      .select("origen, ds_fletero_carga, total_bultos")
      .eq("fecha", fecha),
    // fecha_venta = día del reparto (la fecha del DVVTA llega ~1,6 días después en Chess)
    supa
      .from("rechazos")
      .select("origen, ds_fletero_carga, bultos_rechazados")
      .eq("fecha_venta", fecha),
    supa
      .from("mapeo_patente_chofer")
      .select("patente, catalogo_choferes(nombre)"),
    supa
      .from("mapeo_chofer_gescom")
      .select("codigo, nombre")
      .eq("activo", true),
    supa
      .from("ventas_diarias_cliente")
      .select("ds_fletero_carga, patente")
      .eq("fecha", fecha)
      .eq("origen", "gestion"),
  ])

  if (ventasRaw.error) throw new Error(`ventas_diarias: ${ventasRaw.error.message}`)

  // Índices de nombre de chofer (Chess por patente, Gestión por código)
  const choferIdx = new Map<string, string>()
  type MapeoRow = { patente: string; catalogo_choferes: { nombre: string | null } | null }
  for (const m of (mapeoRaw.data ?? []) as unknown as MapeoRow[]) {
    if (m.catalogo_choferes?.nombre) choferIdx.set(m.patente, m.catalogo_choferes.nombre)
  }
  if (!gescomRaw.error && gescomRaw.data) {
    for (const g of gescomRaw.data as Array<{ codigo: string; nombre: string }>) {
      choferIdx.set(`GESTION-${g.codigo}`, g.nombre)
    }
  }

  // Patente derivada de Gestión para el día (del detalle por cliente, mig 119)
  const patenteGestionIdx = new Map<string, string>()
  if (!patentesGestionRaw.error && patentesGestionRaw.data) {
    for (const p of patentesGestionRaw.data as Array<{ ds_fletero_carga: string; patente: string | null }>) {
      if (p.patente) patenteGestionIdx.set(p.ds_fletero_carga, p.patente)
    }
  }

  // Rechazados del día por fletero
  const rechIdx = new Map<string, number>()
  if (!rechazosRaw.error && rechazosRaw.data) {
    for (const r of rechazosRaw.data as Array<{
      origen: string | null; ds_fletero_carga: string | null; bultos_rechazados: number | null
    }>) {
      if (!r.ds_fletero_carga) continue
      const b = Number(r.bultos_rechazados ?? 0)
      if (!Number.isFinite(b)) continue
      rechIdx.set(r.ds_fletero_carga, (rechIdx.get(r.ds_fletero_carga) ?? 0) + b)
    }
  }

  let total = 0
  const patentes: BultosPatenteDia[] = []
  for (const v of (ventasRaw.data ?? []) as Array<{
    origen: string | null; ds_fletero_carga: string; total_bultos: number | null
  }>) {
    const origen = v.origen === "gestion" ? "gestion" as const : "chess" as const
    const bultos = Number(v.total_bultos ?? 0)
    if (!Number.isFinite(bultos)) continue
    total += bultos
    patentes.push({
      origen,
      ds_fletero_carga: v.ds_fletero_carga,
      patente: origen === "chess"
        ? v.ds_fletero_carga
        : patenteGestionIdx.get(v.ds_fletero_carga) ?? null,
      chofer_nombre: choferIdx.get(v.ds_fletero_carga) ?? null,
      bultos: Math.round(bultos * 10) / 10,
      bultos_rechazados: Math.round((rechIdx.get(v.ds_fletero_carga) ?? 0) * 10) / 10,
    })
  }
  patentes.sort((a, b) => b.bultos - a.bultos)

  return { fecha, total_bultos: Math.round(total * 10) / 10, patentes }
}
