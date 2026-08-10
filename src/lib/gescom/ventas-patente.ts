import type { SupabaseClient } from "@supabase/supabase-js"
import {
  loadChecklistDominios,
  loadChoferesGescom,
  patenteDeChofer,
  type ChoferGescom,
} from "./patente-chofer"
import { codigoFleteroGescom, esFleteroGescom } from "./etiqueta-fletero"

// Traducción de filas de `ventas_diarias` / `rechazos` de Gestión a la patente
// real del viaje, para los cálculos POR CHOFER.
//
// GESCOM guarda `ds_fletero_carga = 'GESTION-<codigoChofer>'` (no expone
// patente), así que todo cálculo que filtre o agrupe por patente ve 0 bultos
// de Gestión: mi-entrega, visibilidad-resultados y /indicadores/choferes
// arrastraron ese bug hasta agosto 2026. El puente es el mismo que usan el
// sync de rechazos, el TLP y la OB: `patenteDeChofer` (checklist del día →
// fallback `patente_default` de `mapeo_chofer_gescom`).

export interface ResolucionGescom {
  choferes: Map<string, ChoferGescom>
  checklists: Map<string, string>
}

/** Mapeos necesarios para resolver fleteros de Gestión en [desde, hasta]. */
export async function loadResolucionGescom(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<ResolucionGescom> {
  const [choferes, checklists] = await Promise.all([
    loadChoferesGescom(supabase),
    loadChecklistDominios(supabase, desde, hasta),
  ])
  return { choferes, checklists }
}

export type FleteroResuelto =
  /** Reparto de Gestión con patente conocida para ese día. */
  | { tipo: "patente"; patente: string }
  /** Chofer de mayoreo/venta directa: NO es reparto, excluir. */
  | { tipo: "venta_directa" }
  /** Gestión sin patente resoluble: dejar la fila como está. */
  | { tipo: "sin_resolver" }
  /** No es un código de Gestión (patente de Chess): dejar la fila como está. */
  | { tipo: "chess" }

export function resolverFleteroGescom(
  dsFleteroCarga: string | null | undefined,
  fecha: string,
  res: ResolucionGescom,
): FleteroResuelto {
  if (!esFleteroGescom(dsFleteroCarga)) return { tipo: "chess" }
  const codigo = codigoFleteroGescom(dsFleteroCarga)
  if (!codigo) return { tipo: "sin_resolver" } // "GESTION" pelado, sin código
  if (res.choferes.get(codigo)?.ventaDirecta) return { tipo: "venta_directa" }
  const patente = patenteDeChofer(codigo, fecha, res.choferes, res.checklists)
  return patente ? { tipo: "patente", patente } : { tipo: "sin_resolver" }
}

/**
 * Reemplaza el `ds_fletero_carga` de las filas de Gestión por la patente del
 * día y descarta las de venta directa. Las irresolubles quedan como están
 * (caen al bucket "sin asignar" de cada pantalla, como hasta ahora).
 *
 * `viajesChess` (claves `fecha|patente` con venta Chess): en `ventas_diarias`
 * de Gestión la columna `viajes` guarda COMPROBANTES (decenas por día), no
 * planillas como Chess — y la carga de Gestión va arriba del mismo camión.
 * Con el set, las filas traducidas aportan 0 viajes si Chess ya contó el
 * viaje de esa patente ese día, o 1 si el reparto fue solo de Gestión.
 */
export function traducirFilasGescom<
  T extends { fecha: string; ds_fletero_carga: string | null; viajes?: number | null },
>(rows: T[], res: ResolucionGescom, opts?: { viajesChess?: Set<string> }): T[] {
  const out: T[] = []
  for (const r of rows) {
    const rr = resolverFleteroGescom(r.ds_fletero_carga, r.fecha, res)
    if (rr.tipo === "venta_directa") continue
    if (rr.tipo !== "patente") {
      out.push(r)
      continue
    }
    const traducida = { ...r, ds_fletero_carga: rr.patente }
    if (opts?.viajesChess && typeof r.viajes === "number") {
      traducida.viajes = opts.viajesChess.has(`${r.fecha}|${rr.patente}`) ? 0 : 1
    }
    out.push(traducida)
  }
  return out
}
