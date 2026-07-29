"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getChoferAsignado,
  getChoferPorDia,
  resolverChofer,
} from "@/lib/rmd-chofer"

type Result<T> = { data: T } | { error: string }

// Cobertura del RMD: de todas las entregas que recibieron la encuesta, cuántas
// terminaron puntuadas. El denominador vive en rmd_envios (una fila por
// encuesta enviada); nps_rmd_cliente solo tiene las respondidas.

/** Un mes de la comparación enviadas vs puntuadas, por fecha de ENTREGA. */
export interface RmdCoberturaMes {
  mes: number // 1-12
  enviadas: number
  puntuadas: number
  tasa_respuesta: number | null
  rmd: number | null
  bajas: number
  /** Mes todavía abierto: sus entregas pueden sumar puntuaciones ⇒ tasa baja. */
  parcial: boolean
}

export type RmdSegmento =
  | "queja_abierta"
  | "dejo_de_puntuar"
  | "nunca_puntuo"
  | "baja_participacion"
  | "pocos_envios"
  | "puntuando"

export interface RmdCoberturaCliente {
  cod_cliente: number
  nombre_cliente: string | null
  promotor: string | null
  localidad: string | null
  enviadas: number
  puntuadas: number
  /** Entregas encuestadas después de la última que el cliente puntuó. */
  envios_ignorados: number
  tasa_respuesta: number | null
  rmd: number | null
  bajas: number
  ultima_puntuacion: number | null
  ultima_puntuacion_fecha: string | null
  ultima_entrega: string | null
  hl_anio: number
  segmento: RmdSegmento
  prioridad: number
}

/** Cobertura por chofer: a qué camión no le califican las entregas. */
export interface RmdCoberturaChofer {
  chofer: string
  patentes: string[]
  enviadas: number
  puntuadas: number
  tasa_respuesta: number | null
  rmd: number | null
  bajas: number
}

export interface RmdCoberturaData {
  anio: number
  meses: RmdCoberturaMes[]
  choferes: RmdCoberturaChofer[]
  /** Solo los accionables (excluye a los que sí están puntuando). */
  clientes: RmdCoberturaCliente[]
  resumen: {
    /** Totales de meses cerrados: el mes abierto todavía suma puntuaciones. */
    enviadas: number
    puntuadas: number
    tasa_respuesta: number | null
    /** Entregas encuestadas que nadie calificó (meses cerrados). */
    sin_calificar: number
    clientes_alcanzados: number
    clientes_sin_voz: number
    /** HL del año que compran los clientes que no están puntuando. */
    hl_sin_voz: number
  }
}

const ANIO = 2026
const PAGINA = 1000

export async function getRmdCobertura(): Promise<Result<RmdCoberturaData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: mesData, error: mesErr } = await supabase
      .from("v_rmd_cobertura_mensual")
      .select("mes, enviadas, puntuadas, tasa_respuesta, rmd, bajas, parcial")
      .eq("anio", ANIO)
      .order("mes")
    if (mesErr) return { error: mesErr.message }

    // Clientes y días-camión superan el tope de filas de PostgREST: paginamos.
    const clientes: RmdCoberturaCliente[] = []
    let clientesAlcanzados = 0
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from("v_rmd_cobertura_cliente")
        .select(
          "cod_cliente, nombre_cliente, promotor, localidad, enviadas, puntuadas, envios_ignorados, tasa_respuesta, rmd, bajas, ultima_puntuacion, ultima_puntuacion_fecha, ultima_entrega, hl_anio, segmento, prioridad",
        )
        .eq("anio", ANIO)
        .order("prioridad")
        .order("hl_anio", { ascending: false })
        .range(desde, desde + PAGINA - 1)
      if (error) return { error: error.message }
      const lote = (data ?? []) as unknown as Array<Record<string, unknown>>
      clientesAlcanzados += lote.length
      for (const c of lote) {
        const segmento = c.segmento as RmdSegmento
        if (segmento === "puntuando") continue
        clientes.push({
          cod_cliente: Number(c.cod_cliente),
          nombre_cliente: (c.nombre_cliente as string) ?? null,
          promotor: (c.promotor as string) ?? null,
          localidad: (c.localidad as string) ?? null,
          enviadas: Number(c.enviadas ?? 0),
          puntuadas: Number(c.puntuadas ?? 0),
          envios_ignorados: Number(c.envios_ignorados ?? 0),
          tasa_respuesta:
            c.tasa_respuesta == null ? null : Number(c.tasa_respuesta),
          rmd: c.rmd == null ? null : Number(c.rmd),
          bajas: Number(c.bajas ?? 0),
          ultima_puntuacion:
            c.ultima_puntuacion == null ? null : Number(c.ultima_puntuacion),
          ultima_puntuacion_fecha:
            (c.ultima_puntuacion_fecha as string) ?? null,
          ultima_entrega: (c.ultima_entrega as string) ?? null,
          hl_anio: Number(c.hl_anio ?? 0),
          segmento,
          prioridad: Number(c.prioridad ?? 9),
        })
      }
      if (lote.length < PAGINA) break
    }

    // ---- cobertura por chofer ----
    // La vista trae (patente, día); el chofer se resuelve contra el TML/check de
    // ESE día, igual que en el resto del dashboard: un mismo camión lo maneja
    // distinta gente según la jornada.
    type DiaCamion = {
      vehiculo_entrega: string
      fecha_entrega: string
      pergamino: boolean
      enviadas: number
      puntuadas: number
      suma_puntuacion: number | null
      bajas: number
    }
    const dias: DiaCamion[] = []
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from("v_rmd_cobertura_vehiculo")
        .select(
          "vehiculo_entrega, fecha_entrega, pergamino, enviadas, puntuadas, suma_puntuacion, bajas",
        )
        .eq("anio", ANIO)
        .range(desde, desde + PAGINA - 1)
      if (error) return { error: error.message }
      const lote = (data ?? []) as unknown as DiaCamion[]
      dias.push(...lote)
      if (lote.length < PAGINA) break
    }

    const patentes = [
      ...new Set(
        dias
          .flatMap((d) => (d.vehiculo_entrega ?? "").split("/"))
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ]
    const [choferPorDia, choferAsignado] = await Promise.all([
      getChoferPorDia(supabase, patentes),
      getChoferAsignado(supabase),
    ])

    // El mismo chofer aparece con el nombre corto del TML y con el completo del
    // legajo ("FRIAS ANGEL" / "FRIAS ANGEL ERMINDO"): sin unificar quedan dos
    // filas para la misma persona. Se toma como canónico el nombre más largo
    // que empieza igual, palabra por palabra.
    const nombresChofer = new Set<string>()
    const resueltos = dias.map((d) => {
      const { chofer } = resolverChofer(
        d.vehiculo_entrega,
        d.fecha_entrega,
        d.pergamino ? "PERGAMINO" : null,
        choferPorDia,
        choferAsignado,
      )
      if (chofer) nombresChofer.add(chofer)
      return { d, chofer }
    })
    const canonico = new Map<string, string>()
    const ordenados = [...nombresChofer].sort((a, b) => b.length - a.length)
    for (const n of nombresChofer) {
      canonico.set(n, ordenados.find((o) => o === n || o.startsWith(`${n} `)) ?? n)
    }

    const porChofer = new Map<
      string,
      {
        patentes: Set<string>
        enviadas: number
        puntuadas: number
        suma: number
        bajas: number
      }
    >()
    for (const { d, chofer } of resueltos) {
      const clave = chofer
        ? (canonico.get(chofer) ?? chofer)
        : "Sin chofer identificado"
      const cur = porChofer.get(clave) ?? {
        patentes: new Set<string>(),
        enviadas: 0,
        puntuadas: 0,
        suma: 0,
        bajas: 0,
      }
      for (const p of d.vehiculo_entrega.split("/")) {
        const pat = p.trim()
        if (pat) cur.patentes.add(pat)
      }
      cur.enviadas += d.enviadas
      cur.puntuadas += d.puntuadas
      cur.suma += d.suma_puntuacion ?? 0
      cur.bajas += d.bajas
      porChofer.set(clave, cur)
    }

    const choferes: RmdCoberturaChofer[] = [...porChofer.entries()]
      .map(([chofer, c]) => ({
        chofer,
        patentes: [...c.patentes].sort(),
        enviadas: c.enviadas,
        puntuadas: c.puntuadas,
        tasa_respuesta: c.enviadas
          ? Math.round((c.puntuadas / c.enviadas) * 1000) / 10
          : null,
        rmd: c.puntuadas ? Math.round((c.suma / c.puntuadas) * 100) / 100 : null,
        bajas: c.bajas,
      }))
      // los que menos feedback dejan primero: ahí no sabemos cómo entregamos
      .sort((a, b) => (a.tasa_respuesta ?? 0) - (b.tasa_respuesta ?? 0))

    const meses: RmdCoberturaMes[] = (
      (mesData ?? []) as unknown as Array<Record<string, unknown>>
    ).map((m) => ({
      mes: Number(m.mes),
      enviadas: Number(m.enviadas ?? 0),
      puntuadas: Number(m.puntuadas ?? 0),
      tasa_respuesta:
        m.tasa_respuesta == null ? null : Number(m.tasa_respuesta),
      rmd: m.rmd == null ? null : Number(m.rmd),
      bajas: Number(m.bajas ?? 0),
      parcial: Boolean(m.parcial),
    }))

    // El mes abierto no entra en los totales: sus entregas todavía pueden
    // recibir puntuación (mediana 4 días, hasta ~30).
    const cerrados = meses.filter((m) => !m.parcial)
    const enviadas = cerrados.reduce((s, m) => s + m.enviadas, 0)
    const puntuadas = cerrados.reduce((s, m) => s + m.puntuadas, 0)
    const sinVoz = clientes.filter((c) => c.segmento !== "pocos_envios")

    return {
      data: {
        anio: ANIO,
        meses,
        choferes,
        clientes,
        resumen: {
          enviadas,
          puntuadas,
          tasa_respuesta: enviadas
            ? Math.round((puntuadas / enviadas) * 1000) / 10
            : null,
          sin_calificar: enviadas - puntuadas,
          clientes_alcanzados: clientesAlcanzados,
          clientes_sin_voz: sinVoz.length,
          hl_sin_voz:
            Math.round(sinVoz.reduce((s, c) => s + c.hl_anio, 0) * 10) / 10,
        },
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando la cobertura de RMD",
    }
  }
}
