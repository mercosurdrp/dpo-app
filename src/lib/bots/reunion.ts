// Reunión de bots (08:00, después de las rondas de las 07:30). Dos vueltas:
//  1) cada bot lee lo que encontraron los otros pilares y dice qué lo conecta
//     con el suyo (o qué le pide a otro pilar);
//  2) un moderador arma el acta: conexiones, prioridades del día y hasta 2
//     planes conjuntos, que quedan propuestos igual que los de la ronda.
// Mismas reglas que la ronda: los números salen del contexto y se validan;
// si el modelo inventa, se reintenta y si insiste sale la versión plantilla.

import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import { hoyArgentina } from "@/lib/warehouse/auto-indicadores"
import { armarContexto, type ContextoPilar } from "./contexto"
import { generarJson, modeloBots } from "./llm"
import { lineasPlanes, proximoNumero } from "./planes"
import {
  ameritaPlan,
  compacto,
  destinoDe,
  estadoRelevante,
  fechaCorta,
  numerosInventados,
  sanearPlanes,
  TENDENCIA_PROPIA,
} from "./ronda"
import type { BotPilar, PlanPropuesto, SalidaRonda } from "./tipos"

const MAX_PLANES_CONJUNTOS = 2

interface Participante {
  bot: BotPilar
  ctx: ContextoPilar
  /** Títulos de los planes que ya propuso hoy en la ronda. */
  planesRonda: string[]
}

export interface Intervencion {
  bot: string
  texto: string
  modo: "ia" | "plantilla"
}

export interface Acta {
  conexiones: Array<{ pilares: string[]; descripcion: string }>
  prioridades: string[]
  planes_conjuntos: PlanPropuesto[]
}

export interface ResultadoReunion {
  corrida_id: string | null
  mensaje: string | null
  modo: "ia" | "plantilla"
  enviado: boolean
  destinos: string[]
  planes: number
  error: string | null
  /** Por qué no hubo reunión (pocos pilares, todo en verde). */
  omitida: string | null
}

// ---------- contexto ----------

/** El contexto de la ronda de hoy de cada bot; si no corrió, se arma de nuevo. */
async function participantes(bots: BotPilar[], hoy: string): Promise<Participante[]> {
  const supabase = createAdminClient()
  const out: Participante[] = []
  for (const bot of bots) {
    // La ronda real (no prueba) tiene prioridad; si no hay, la última prueba.
    const { data } = await supabase
      .from("bots_corridas")
      .select("contexto, salida, dry")
      .eq("bot_key", bot.key)
      .eq("tipo", "ronda")
      .eq("fecha", hoy)
      .order("dry", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
    const corrida = data?.[0] as
      | { contexto: ContextoPilar | null; salida: SalidaRonda | null; dry: boolean }
      | undefined
    const ctx = corrida?.contexto?.indicadores ? corrida.contexto : await armarContexto(bot, hoy)
    out.push({
      bot,
      ctx,
      planesRonda: (corrida?.salida?.planes_propuestos ?? []).map((p) => p.titulo),
    })
  }
  return out
}

const fueraDeMeta = (ctx: ContextoPilar) =>
  ctx.indicadores.filter((i) => {
    const e = estadoRelevante(i)
    return e === "rojo" || e === "amarillo"
  })

function datosReunion(ps: Participante[]) {
  return {
    hoy: ps[0].ctx.hoy,
    pilares: ps.map((p) => {
      const c = compacto(p.ctx)
      return {
        pilar: p.bot.nombre,
        fuera_de_meta: c.indicadores.filter((i) => i.estado === "rojo" || i.estado === "amarillo"),
        en_verde: c.indicadores.filter((i) => i.estado === "verde").map((i) => i.nombre),
        planes_ya_propuestos: p.planesRonda,
        contexto_del_pilar: p.bot.prompt_extra,
      }
    }),
  }
}

/** Un único contexto con los indicadores de todos, para validar números. */
function unido(ps: Participante[]): ContextoPilar {
  return {
    bot: "reunion",
    pilar: "Reunión de bots",
    hoy: ps[0].ctx.hoy,
    reunion_tipo: "",
    indicadores: ps.flatMap((p) => p.ctx.indicadores),
  }
}

function problemas(texto: string, ctx: ContextoPilar): string | null {
  const inventados = numerosInventados(texto, ctx)
  const tendencia = TENDENCIA_PROPIA.test(texto)
  if (inventados.length === 0 && !tendencia) return null
  return [
    inventados.length ? `números que no están en el JSON: ${inventados.join(", ")}` : null,
    tendencia ? "describiste tendencias que no están en el campo tendencia" : null,
  ]
    .filter(Boolean)
    .join("; ")
}

/** Llama al modelo y valida el texto; un reintento con la corrección. */
async function conValidacion<T>(opts: {
  sistema: string
  usuario: string
  nombreSchema: string
  schema: Record<string, unknown>
  texto: (r: T) => string
  ctx: ContextoPilar
}): Promise<{ r: T | null; nota: string | null }> {
  let nota: string | null = null
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await generarJson<T>({
        sistema: opts.sistema,
        usuario: intento === 0
          ? opts.usuario
          : `${opts.usuario}\n\nOJO, el intento anterior estuvo mal (${nota}). Corregilo: solo números del JSON, escritos tal cual.`,
        nombreSchema: opts.nombreSchema,
        schema: opts.schema,
      })
      nota = problemas(opts.texto(r), opts.ctx)
      if (!nota) return { r, nota: null }
    } catch (e) {
      nota = e instanceof Error ? e.message : String(e)
    }
  }
  return { r: null, nota }
}

const REGLAS = [
  "- Español rioplatense (vos), directo y breve.",
  "- Usá SOLO los números que aparecen en el JSON, escritos tal cual (coma decimal, con su unidad). No calcules diferencias, promedios ni porcentajes nuevos.",
  "- Las relaciones entre pilares son HIPÓTESIS a verificar («puede que», «posible»), nunca hechos. No inventes camiones, choferes, clientes ni causas.",
  "- NUNCA deduzcas si algo mejoró o empeoró: si lo mencionás, usá el campo tendencia tal cual.",
].join("\n")

// ---------- vuelta 1: intervenciones ----------

const SCHEMA_INTERVENCION = {
  type: "object",
  additionalProperties: false,
  required: ["intervencion"],
  properties: { intervencion: { type: "string" } },
}

async function intervenir(
  p: Participante,
  datos: ReturnType<typeof datosReunion>,
  ctxUnido: ContextoPilar,
): Promise<Intervencion> {
  const sistema = [
    `Sos el bot del pilar ${p.bot.nombre} del programa DPO de una distribuidora de bebidas en Argentina.`,
    "Estás en la reunión diaria de los bots de pilar. Ya revisaste tus indicadores; ahora ves también los de los otros pilares.",
    "",
    "intervencion: 1 o 2 frases (máximo 280 caracteres), en primera persona como el pilar («En Entrega…»):",
    "- ¿Qué de lo que pasa en otro pilar puede estar relacionado con tus indicadores fuera de meta, o qué de tu pilar puede estar afectando a otro? Si le pedís algo concreto a otro pilar, nombralo.",
    "- Si no ves ninguna relación, decí en una frase cuál es tu foco de hoy. No fuerces conexiones.",
    "",
    "Reglas, sin excepción:",
    REGLAS,
  ].join("\n")
  const { r, nota } = await conValidacion<{ intervencion: string }>({
    sistema,
    usuario: JSON.stringify({ sos: p.bot.nombre, ...datos }),
    nombreSchema: "intervencion_bot",
    schema: SCHEMA_INTERVENCION,
    texto: (x) => x.intervencion,
    ctx: ctxUnido,
  })
  if (r) return { bot: p.bot.key, texto: r.intervencion.trim(), modo: "ia" }
  if (nota) console.warn(`[bots:reunion] intervención ${p.bot.key} descartada: ${nota}`)
  const rojos = fueraDeMeta(p.ctx).map((i) => i.nombre)
  return {
    bot: p.bot.key,
    texto: rojos.length ? `Mi foco de hoy: ${rojos.join(", ")}.` : "Todo en verde, sin temas para la mesa.",
    modo: "plantilla",
  }
}

// ---------- vuelta 2: moderador ----------

const SCHEMA_ACTA = {
  type: "object",
  additionalProperties: false,
  required: ["conexiones", "prioridades", "planes_conjuntos"],
  properties: {
    conexiones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pilares", "descripcion"],
        properties: {
          pilares: { type: "array", items: { type: "string" } },
          descripcion: { type: "string" },
        },
      },
    },
    prioridades: { type: "array", items: { type: "string" } },
    planes_conjuntos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "indicador", "causa_probable", "accion", "responsable_sugerido", "fecha_objetivo"],
        properties: {
          titulo: { type: "string" },
          indicador: { type: "string" },
          causa_probable: { type: "string" },
          accion: { type: "string" },
          responsable_sugerido: { type: "string" },
          fecha_objetivo: { type: "string" },
        },
      },
    },
  },
}

function actaPlantilla(ps: Participante[]): Acta {
  return {
    conexiones: [],
    prioridades: ps
      .map((p) => {
        const peor = fueraDeMeta(p.ctx).sort(
          (a, b) => (estadoRelevante(a) === "rojo" ? 0 : 1) - (estadoRelevante(b) === "rojo" ? 0 : 1),
        )[0]
        return peor ? `${p.bot.nombre}: ${peor.nombre}` : null
      })
      .filter((x): x is string => x != null),
    planes_conjuntos: [],
  }
}

async function moderar(
  ps: Participante[],
  datos: ReturnType<typeof datosReunion>,
  intervenciones: Intervencion[],
  ctxUnido: ContextoPilar,
): Promise<{ acta: Acta; modo: "ia" | "plantilla"; nota: string | null }> {
  const sistema = [
    "Sos el moderador de la reunión diaria de los bots de pilar del programa DPO de una distribuidora de bebidas en Argentina.",
    "Leés los indicadores de todos los pilares y lo que dijo cada bot, y armás el acta.",
    "",
    "- conexiones: como máximo 3, SOLO entre pilares distintos y con sustento en los datos. Cada una es una hipótesis a verificar en una frase. Si no hay conexiones reales, devolvé la lista vacía: no fuerces.",
    "- prioridades: como máximo 3, lo que hay que atacar HOY, de lo más grave a lo menos. Cada una dice el pilar y el indicador y qué hacer, en una frase.",
    `- planes_conjuntos: como máximo ${MAX_PLANES_CONJUNTOS}, SOLO si la acción necesita a dos pilares trabajando juntos y sobre un indicador con puede_proponer_plan=true (indicador = su nombre exacto). No repitas ni reformules planes_ya_propuestos. La causa_probable es una hipótesis («posible…»), la acción es concreta y verificable en una semana (qué se mira, con quién, dónde), responsable_sugerido nombra un rol de cada pilar, fecha_objetivo YYYY-MM-DD entre 7 y 21 días después de hoy. Si no hace falta ninguno, lista vacía.`,
    "",
    "Reglas, sin excepción:",
    REGLAS,
  ].join("\n")
  const { r, nota } = await conValidacion<Acta>({
    sistema,
    usuario: JSON.stringify({
      ...datos,
      intervenciones: intervenciones.map((i) => ({
        pilar: ps.find((p) => p.bot.key === i.bot)?.bot.nombre,
        dijo: i.texto,
      })),
    }),
    nombreSchema: "acta_reunion_bots",
    schema: SCHEMA_ACTA,
    texto: (a) =>
      [
        ...a.conexiones.map((c) => c.descripcion),
        ...a.prioridades,
        ...a.planes_conjuntos.map((p) => p.titulo),
      ].join("\n"),
    ctx: ctxUnido,
  })
  if (!r) return { acta: actaPlantilla(ps), modo: "plantilla", nota }
  return {
    acta: {
      conexiones: r.conexiones.slice(0, 3),
      prioridades: r.prioridades.slice(0, 3),
      planes_conjuntos: sanearPlanes(r.planes_conjuntos, ctxUnido, MAX_PLANES_CONJUNTOS),
    },
    modo: "ia",
    nota: null,
  }
}

// ---------- reunión ----------

function nombres(ps: Participante[]): string {
  const n = ps.map((p) => `${p.bot.emoji} ${p.bot.nombre}`)
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n.at(-1)}` : n[0]
}

/** El bot dueño de un plan conjunto: el que tiene ese indicador para plan. */
function duenoDelPlan(p: PlanPropuesto, ps: Participante[]): string {
  const ind = p.indicador.trim().toLowerCase()
  const dueno = ps.find((x) =>
    x.ctx.indicadores.some((i) => i.nombre.trim().toLowerCase() === ind && ameritaPlan(i)),
  )
  return (dueno ?? ps[0]).bot.key
}

export async function correrReunion(
  bots: BotPilar[],
  opts: { dry: boolean; hoy?: string },
): Promise<ResultadoReunion> {
  const hoy = opts.hoy ?? hoyArgentina()
  const vacio = (omitida: string): ResultadoReunion => ({
    corrida_id: null,
    mensaje: null,
    modo: "plantilla",
    enviado: false,
    destinos: [],
    planes: 0,
    error: null,
    omitida,
  })
  if (bots.length < 2) return vacio("Hace falta al menos 2 bots activos para la reunión.")

  const ps = await participantes(bots, hoy)
  if (ps.every((p) => fueraDeMeta(p.ctx).length === 0)) {
    return vacio("Todos los pilares en verde: no hubo temas.")
  }

  const datos = datosReunion(ps)
  const ctxUnido = unido(ps)
  const intervenciones: Intervencion[] = []
  for (const p of ps) intervenciones.push(await intervenir(p, datos, ctxUnido))
  const { acta, modo, nota } = await moderar(ps, datos, intervenciones, ctxUnido)

  const supabase = createAdminClient()
  const desde = acta.planes_conjuntos.length ? await proximoNumero(supabase, hoy) : 1
  const planes = acta.planes_conjuntos.map((p, i) => ({
    ...p,
    numero: desde + i,
    bot_key: duenoDelPlan(p, ps),
  }))

  const lineas = [
    `🤝 *Reunión de bots · ${fechaCorta(hoy)}*`,
    `_Participaron ${nombres(ps)}_`,
    "",
    ...intervenciones.map((i) => {
      const b = ps.find((p) => p.bot.key === i.bot)!.bot
      return `${b.emoji} *${b.nombre}:* ${i.texto}`
    }),
  ]
  if (acta.conexiones.length) {
    lineas.push("", "🔗 *Conexiones*", ...acta.conexiones.map((c) => `• ${c.descripcion}`))
  }
  if (acta.prioridades.length) {
    lineas.push("", "🎯 *Prioridades de hoy*", ...acta.prioridades.map((x, i) => `${i + 1}) ${x}`))
  }
  lineas.push(...lineasPlanes(planes))
  const mensaje = lineas.join("\n")

  // El acta va a todos los encargados (sin repetir: en calibración es uno solo).
  const destinos = [...new Set(ps.map((p) => destinoDe(p.bot)).filter((d): d is string => !!d))]
  let enviado = false
  const errores: string[] = []
  if (modo === "plantilla" && nota) errores.push(`IA descartada en el acta: ${nota}`)
  const plantillas = intervenciones.filter((i) => i.modo === "plantilla").map((i) => i.bot)
  if (plantillas.length) errores.push(`Intervención con plantilla: ${plantillas.join(", ")}`)
  if (!opts.dry) {
    if (destinos.length === 0) errores.push("Sin teléfono de destino")
    for (const d of destinos) {
      try {
        const r = await sendText(d, mensaje)
        if (r.ok) enviado = true
        else errores.push(`Evolution ${r.status} (${d})`)
      } catch (e) {
        errores.push(e instanceof Error ? e.message : String(e))
      }
    }
  }
  const error = errores.length ? errores.join(" · ") : null

  const { data: corrida, error: errIns } = await supabase
    .from("bots_corridas")
    .insert({
      bot_key: null,
      fecha: hoy,
      tipo: "reunion",
      contexto: { participantes: ps.map((p) => p.bot.key), datos },
      salida: { intervenciones, acta },
      mensaje,
      modo,
      modelo: modeloBots(),
      dry: opts.dry,
      enviado,
      destino: destinos.join(", ") || null,
      error,
    })
    .select("id")
    .single()
  if (errIns) throw new Error(`bots_corridas: ${errIns.message}`)
  const corridaId = (corrida as { id: string }).id

  if (planes.length > 0 && !opts.dry) {
    const { error: errPlanes } = await supabase
      .from("bots_planes_propuestos")
      .insert(planes.map((p) => ({ ...p, corrida_id: corridaId, fecha: hoy })))
    if (errPlanes) throw new Error(`bots_planes_propuestos: ${errPlanes.message}`)
  }

  return {
    corrida_id: corridaId,
    mensaje,
    modo,
    enviado,
    destinos,
    planes: planes.length,
    error,
    omitida: null,
  }
}
