import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Mapa "PATENTE|FECHA" → chofer que hizo el TML/check de ese camión ese día.
 * Fuentes: registros_vehiculos (TML) y checklist_vehiculos (check diario).
 * Es la fuente fecha-aware: el chofer real de la entrega, no el asignado fijo.
 */
export async function getChoferPorDia(
  supabase: Supabase,
  patentes: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (patentes.length === 0) return map
  const [reg, chk] = await Promise.all([
    supabase
      .from("registros_vehiculos")
      .select("dominio, fecha, chofer")
      .in("dominio", patentes),
    supabase
      .from("checklist_vehiculos")
      .select("dominio, fecha, chofer")
      .in("dominio", patentes),
  ])
  type DiaRow = {
    dominio: string | null
    fecha: string | null
    chofer: string | null
  }
  // El TML (registros_vehiculos) manda; el check completa lo que falte.
  for (const src of [chk.data, reg.data] as Array<DiaRow[] | null>) {
    for (const r of src ?? []) {
      const dom = (r.dominio ?? "").trim()
      const chofer = (r.chofer ?? "").trim()
      if (dom && r.fecha && chofer) map.set(`${dom}|${r.fecha}`, chofer)
    }
  }
  return map
}

/** Mapa patente → chofer asignado al camión (fallback), mapeo_empleado_fletero. */
export async function getChoferAsignado(
  supabase: Supabase,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data: mapeo } = await supabase
    .from("mapeo_empleado_fletero")
    .select("ds_fletero_carga, empleado_id")
  const filas = (mapeo ?? []) as Array<{
    ds_fletero_carga: string | null
    empleado_id: string | null
  }>
  const ids = [
    ...new Set(filas.map((f) => f.empleado_id).filter(Boolean)),
  ] as string[]
  if (ids.length === 0) return map
  const { data: emps } = await supabase
    .from("empleados")
    .select("id, nombre")
    .in("id", ids)
  const nombrePorId = new Map<string, string>()
  for (const e of (emps ?? []) as Array<{ id: string; nombre: string | null }>) {
    if (e.nombre) nombrePorId.set(e.id, e.nombre)
  }
  for (const f of filas) {
    const pat = (f.ds_fletero_carga ?? "").trim()
    const nom = f.empleado_id ? nombrePorId.get(f.empleado_id) : undefined
    if (pat && nom) map.set(pat, nom)
  }
  return map
}

/**
 * Resuelve el/los chofer(es) de una entrega. Por cada patente busca primero el
 * chofer del TML/check de esa fecha (exacto); si no hay, cae al asignado.
 * Regla especial: OJA403 no carga TML; cuando entrega a Pergamino lo maneja
 * FRIAS ANGEL. exacto = true sólo si TODOS los nombres salieron del día.
 */
export function resolverChofer(
  patentes: string | null,
  fecha: string | null,
  localidad: string | null,
  porDia: Map<string, string>,
  asignado: Map<string, string>,
): { chofer: string | null; exacto: boolean } {
  if (!patentes) return { chofer: null, exacto: false }
  const esPergamino = (localidad ?? "").toUpperCase().includes("PERGAMINO")
  const nombres = new Set<string>()
  let todosDelDia = true
  let huboMatch = false
  for (const raw of patentes.split("/")) {
    const pat = raw.trim()
    if (!pat) continue
    const delDia = fecha ? porDia.get(`${pat}|${fecha}`) : undefined
    if (delDia) {
      nombres.add(delDia)
      huboMatch = true
      continue
    }
    const asig = asignado.get(pat)
    if (asig) {
      nombres.add(asig)
      huboMatch = true
      todosDelDia = false
      continue
    }
    if (pat === "OJA403" && esPergamino) {
      nombres.add("FRIAS ANGEL")
      huboMatch = true
      todosDelDia = false
    }
  }
  if (!huboMatch) return { chofer: null, exacto: false }
  return { chofer: [...nombres].join(" / "), exacto: todosDelDia }
}
