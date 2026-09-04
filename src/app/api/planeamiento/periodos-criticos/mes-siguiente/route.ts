import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { intensidadDia, type Intensidad } from "@/app/(dashboard)/planeamiento/periodos-criticos/_lib/intensidad"

export const dynamic = "force-dynamic"

// GET /api/planeamiento/periodos-criticos/mes-siguiente?fecha=2026-08-25
//
// Calendario del MES SIGUIENTE a la fecha dada, para la revisión mensual de
// períodos críticos en la reunión Ventas-Logística (R3.4.2). La reunión del
// último martes de agosto tiene que mirar septiembre: cómo viene cada día según
// lo observado en la misma fecha del año anterior (volumen contra la capacidad
// de distribución, clientes, rechazo y ausentismo), y los feriados del mes.
//
// Si el mes ya empezó (revisión cargada tarde) se devuelve también el dato real
// de los días que ya pasaron.

type Fila = {
  fecha: string
  dow: number
  dia_semana: string
  hl: number
  pct_capacidad: number
  clientes_dia: number
  otif_estimado: number
  pct_ausentismo: number
  es_feriado: boolean
  nombre_feriado: string | null
  tipo_feriado: string | null
  trigger_vol: boolean
  trigger_cli: boolean
  trigger_otif: boolean
  trigger_aus: boolean
}

// Misma escala que el calendario del módulo (CRITICO / LIMITE / NORMAL).
export type { Intensidad }

export type DiaObservado = {
  fecha: string
  dia_semana: string
  hl: number
  pct_capacidad: number
  clientes_dia: number
  pct_rechazo: number
  pct_ausentismo: number
  trigger_vol: boolean
  trigger_cli: boolean
  trigger_otif: boolean
  trigger_aus: boolean
  intensidad: Intensidad
}

function observado(f: Fila): DiaObservado {
  return {
    fecha: f.fecha,
    dia_semana: f.dia_semana,
    hl: Number(f.hl),
    pct_capacidad: Number(f.pct_capacidad),
    clientes_dia: Number(f.clientes_dia),
    pct_rechazo: Number(f.otif_estimado),
    pct_ausentismo: Number(f.pct_ausentismo),
    trigger_vol: !!f.trigger_vol,
    trigger_cli: !!f.trigger_cli,
    trigger_otif: !!f.trigger_otif,
    trigger_aus: !!f.trigger_aus,
    intensidad: intensidadDia({ trigger_vol: !!f.trigger_vol, pct_capacidad: Number(f.pct_capacidad) }),
  }
}

export type DiaMesSiguiente = {
  fecha: string
  dia: number
  dow: number
  dia_semana: string
  es_feriado: boolean
  nombre_feriado: string | null
  /** Lo observado en la misma fecha del año anterior. Null si esa fecha no existió (29/2). */
  base: DiaObservado | null
  /** Dato real del día, sólo si ya pasó y hay volumen cargado. */
  real: DiaObservado | null
}

const COLS =
  "fecha, dow, dia_semana, hl, pct_capacidad, clientes_dia, otif_estimado, pct_ausentismo, " +
  "es_feriado, nombre_feriado, tipo_feriado, trigger_vol, trigger_cli, trigger_otif, trigger_aus"

export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const param = req.nextUrl.searchParams.get("fecha")
  const hoyArg = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const fecha = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : hoyArg

  // Mes siguiente al de la fecha (la reunión de agosto mira septiembre).
  const anioRef = Number(fecha.slice(0, 4))
  const mesRef = Number(fecha.slice(5, 7))
  const anio = mesRef === 12 ? anioRef + 1 : anioRef
  const mes = mesRef === 12 ? 1 : mesRef + 1
  const anioBase = anio - 1

  const supabase = await createClient()
  const [{ data: destino, error: e1 }, { data: base, error: e2 }, { data: umb }, { data: planesRaw }] =
    await Promise.all([
      supabase
        .from("v_pc_calendario_dia_multianio")
        .select(COLS)
        .eq("anio", anio)
        .eq("mes", mes)
        .order("fecha", { ascending: true }),
      supabase
        .from("v_pc_calendario_dia_multianio")
        .select(COLS)
        .eq("anio", anioBase)
        .eq("mes", mes)
        .order("fecha", { ascending: true }),
      supabase.from("pc_umbrales").select("vol_pico").eq("id", 1).maybeSingle(),
      supabase.from("pc_planes_accion").select("codigo, descripcion, plan_texto"),
    ])

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const basePorDia = new Map<number, Fila>()
  for (const f of (base ?? []) as unknown as Fila[]) basePorDia.set(Number(f.fecha.slice(8, 10)), f)

  const dias: DiaMesSiguiente[] = ((destino ?? []) as unknown as Fila[]).map((f) => {
    const dia = Number(f.fecha.slice(8, 10))
    const b = basePorDia.get(dia) ?? null
    const yaPaso = f.fecha < hoyArg && Number(f.hl) > 0
    return {
      fecha: f.fecha,
      dia,
      dow: Number(f.dow),
      dia_semana: f.dia_semana,
      es_feriado: !!f.es_feriado,
      nombre_feriado: f.nombre_feriado ?? null,
      base: b ? observado(b) : null,
      real: yaPaso ? observado(f) : null,
    }
  })

  const criticosBase = dias
    .filter((d) => d.base?.trigger_vol)
    .map((d) => ({ fecha: d.fecha, dia_semana: d.dia_semana, base: d.base! }))
  // Días a anticipar: los críticos y los que quedaron al límite.
  const aAnticipar = dias
    .filter((d) => d.base && d.base.intensidad !== "NORMAL")
    .map((d) => ({ fecha: d.fecha, dia_semana: d.dia_semana, base: d.base! }))

  // Plan de acción del escalón más exigente del mes: es la sugerencia para
  // hablar con Ventas. Sin días críticos ni al límite no hay plan que proponer.
  const peor: Intensidad | null = criticosBase.length > 0 ? "CRITICO" : aAnticipar.length > 0 ? "LIMITE" : null
  const planes = (planesRaw ?? []) as { codigo: string; descripcion: string; plan_texto: string }[]
  const plan = peor ? planes.find((p) => p.codigo === peor) ?? null : null

  return NextResponse.json({
    anio,
    mes,
    anio_base: anioBase,
    capacidad: umb?.vol_pico != null ? Number(umb.vol_pico) : null,
    dias,
    criticos_base: criticosBase,
    a_anticipar: aAnticipar,
    plan,
  })
}
