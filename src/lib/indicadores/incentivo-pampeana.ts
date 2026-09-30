/**
 * «Tu incentivo» en Pampeana (DPO Entrega 2.1 · R2.1.4: que cada operario vea
 * el logro de su incentivo y sepa cómo lograrlo, sin intervención de líderes).
 *
 * Mismo formato que el de Distribuciones (`MiIncentivo`), pero los KPIs NO van
 * escritos en el código: salen de `pc_incentivos_kpis`, que es lo que carga
 * Períodos Críticos. Los que la app sabe medir por persona se miden; el resto
 * se muestra como «todavía no se registra en la app», así el operario igual
 * sabe qué le piden.
 *
 * El registro de premiación guarda el ganador como TEXTO (`equipo`), así que el
 * cruce con la persona es por nombre, igual que en Distribuciones.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NumerosPersonaPampeana } from "@/lib/indicadores/como-venimos-pampeana"
import { normTexto } from "@/lib/gescom/patente-chofer"

export interface KpiHabilitante {
  titulo: string
  /** La meta tal como la enuncia el programa. */
  meta: string
  valor: number | null
  unidad: string
  dec: number
  cumple: boolean | null
  /** false = el programa lo pide pero la app no lo mide por persona. */
  medido: boolean
  detalle?: string
}

export interface PodioItem {
  posicion: string | null
  nombre: string
  premio: string | null
  foto_url: string | null
  anio: number
  mes: number
  es_mio: boolean
}

export interface MiIncentivo {
  programa: { nombre: string; periodo: string; comunicado_fecha: string | null } | null
  ambito: string
  kpis: KpiHabilitante[]
  cumplidos: number
  medidos: number
  mi_premio: PodioItem | null
  podio: PodioItem[]
  podio_mes: { anio: number; mes: number } | null
}

/** Ámbito del programa que corresponde a choferes y ayudantes. */
const AMBITO_ENTREGA = "Entrega"

function tokens(nombre: string | null): Set<string> {
  return new Set(normTexto(nombre ?? "").match(/[A-Z]{2,}/g) ?? [])
}

function esDe(equipo: string | null, persona: NumerosPersonaPampeana): boolean {
  const a = tokens(equipo)
  const b = tokens(persona.nombre)
  let comunes = 0
  for (const t of a) if (b.has(t)) comunes++
  return comunes >= 2
}

/** Primer número de un texto de meta: "Promedio del mes: 0,5% o menos" → 0.5. */
function numeroDe(meta: string): number | null {
  const m = meta.match(/(\d+(?:[.,]\d+)?)/)
  return m ? Number(m[1].replace(",", ".")) : null
}

type KpiRow = { ambito: string; nombre: string; meta: string | null; orden: number | null }

/**
 * Qué sabe medir la app por persona. Se reconoce el KPI por su nombre: si el
 * programa cambia el texto, cae en «no medido» en vez de mostrar otra cosa.
 */
function medir(k: KpiRow, p: NumerosPersonaPampeana): KpiHabilitante {
  const meta = k.meta ?? ""
  const base: KpiHabilitante = {
    titulo: k.nombre,
    meta,
    valor: null,
    unidad: "",
    dec: 0,
    cumple: null,
    medido: false,
  }
  if (/rechazo/i.test(k.nombre)) {
    const limite = numeroDe(meta)
    return {
      ...base,
      valor: p.rechazo_imputable,
      unidad: "%",
      dec: 2,
      cumple: p.rechazo_imputable == null || limite == null ? null : p.rechazo_imputable <= limite,
      medido: true,
      detalle: "sin error de preventa ni sin stock",
    }
  }
  return base
}

export async function buildMiIncentivoPampeana(
  supabase: SupabaseClient,
  persona: NumerosPersonaPampeana,
  anio: number,
): Promise<MiIncentivo | null> {
  const [{ data: prog }, { data: kpis }, { data: regs }] = await Promise.all([
    supabase.from("pc_incentivos_programa").select("nombre, periodo, comunicado_fecha").eq("id", 1).maybeSingle(),
    supabase.from("pc_incentivos_kpis").select("ambito, nombre, meta, orden").eq("programa_id", 1).order("orden"),
    supabase
      .from("pc_incentivos_registro")
      .select("anio, mes, ambito, equipo, posicion, premio, foto_path")
      .eq("anio", anio)
      .order("mes", { ascending: false }),
  ])
  if (!prog) return null

  const propios = ((kpis ?? []) as KpiRow[]).filter((k) => k.ambito === "Todos" || k.ambito === AMBITO_ENTREGA)
  const medidos = propios.map((k) => medir(k, persona))

  type Reg = {
    anio: number
    mes: number
    ambito: string
    equipo: string | null
    posicion: string | null
    premio: string | null
    foto_path: string | null
  }
  const registros = ((regs ?? []) as Reg[]).filter((r) => r.ambito === AMBITO_ENTREGA && r.posicion)
  const ultimoMes = registros.length > 0 ? registros[0].mes : null
  const delMes = ultimoMes != null ? registros.filter((r) => r.mes === ultimoMes) : []

  const paths = delMes.map((r) => r.foto_path).filter((x): x is string => !!x)
  const urlByPath: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("reuniones").createSignedUrls(paths, 60 * 60 * 24)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl
  }
  const aItem = (r: Reg): PodioItem => ({
    posicion: r.posicion,
    nombre: r.equipo ?? "—",
    premio: r.premio,
    foto_url: r.foto_path ? (urlByPath[r.foto_path] ?? null) : null,
    anio: r.anio,
    mes: r.mes,
    es_mio: esDe(r.equipo, persona),
  })
  const mio = registros.find((r) => esDe(r.equipo, persona))

  return {
    programa: {
      nombre: prog.nombre as string,
      periodo: prog.periodo as string,
      comunicado_fecha: (prog.comunicado_fecha as string | null) ?? null,
    },
    ambito: persona.rol === "chofer" ? "Choferes" : "Ayudantes",
    kpis: medidos,
    cumplidos: medidos.filter((k) => k.medido && k.cumple === true).length,
    medidos: medidos.filter((k) => k.medido).length,
    mi_premio: mio ? aItem(mio) : null,
    podio: delMes.map(aItem),
    podio_mes: ultimoMes != null ? { anio: delMes[0].anio, mes: ultimoMes } : null,
  }
}
