// Ronda de la mañana de un bot de pilar: mira sus indicadores, le escribe al
// encargado por WhatsApp y deja propuestos planes de acción para los rojos.
// Los números salen del contexto (calculado por la app); el modelo solo los
// lee y redacta. Si el modelo cita un número que no está en el contexto se
// reintenta una vez y, si insiste, se manda la versión plantilla sin IA.

import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import { armarContexto, type ContextoPilar, type IndicadorContexto } from "./contexto"
import { generarJson, modeloBots } from "./llm"
import { lineasPlanes, proximoNumero } from "./planes"
import type { BotPilar, PlanPropuesto, SalidaRonda } from "./tipos"

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

export interface ResultadoRonda {
  bot: string
  corrida_id: string | null
  mensaje: string
  modo: "ia" | "plantilla"
  enviado: boolean
  destino: string | null
  planes: number
  error: string | null
  contexto: ContextoPilar
}

// ---------- formato ----------

function num(n: number | null | undefined): string {
  if (n == null) return "—"
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return `${DIAS_SEMANA[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function encabezado(bot: BotPilar, hoy: string): string {
  return `${bot.emoji} *${bot.nombre} · ${fechaCorta(hoy)}*`
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00")
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Estado que manda para el aviso: el del día, o el del MTD si es mensual. */
export function estadoRelevante(i: IndicadorContexto) {
  return i.umbral_mensual ? i.estado_mtd : (i.ultimo?.estado ?? "sin_dato")
}

/**
 * Tendencia del último día operativo contra el anterior, según la polaridad.
 * La calcula el código: el modelo la confundía ("mejoró" con una caída).
 */
function tendencia(i: IndicadorContexto): string | null {
  // Los mensuales se leen por el acumulado: comparar dos días sueltos no dice nada.
  if (i.umbral_mensual) return "acumulado del mes"
  const vals = i.serie.map((p) => p.valor).filter((v): v is number => v != null)
  if (vals.length < 2 || !i.mejor_si) return null
  const [ant, ult] = vals.slice(-2)
  if (Math.abs(ult - ant) <= Math.max(Math.abs(ant) * 0.02, 0.01)) return "igual que el día anterior"
  const mejoro = i.mejor_si === "menor" ? ult < ant : ult > ant
  return mejoro ? "mejoró vs. el día anterior" : "empeoró vs. el día anterior"
}

/** Indicadores con los que el bot puede proponer un plan. */
export function ameritaPlan(i: IndicadorContexto): boolean {
  return estadoRelevante(i) === "rojo" || i.racha_fuera >= 3
}

// ---------- contexto compacto para el prompt ----------

/** Valor listo para citar, en formato es-AR y con su unidad. */
function conUnidad(n: number | string | null | undefined, unidad: string | null): string | null {
  if (n == null) return null
  if (typeof n === "string") return n
  const u = !unidad || unidad === "#" ? "" : unidad === "%" ? "%" : ` ${unidad}`
  return `${num(n)}${u}`
}

export function compacto(ctx: ContextoPilar) {
  return {
    pilar: ctx.pilar,
    hoy: ctx.hoy,
    novedades_del_dia: ctx.novedades ?? [],
    indicadores: ctx.indicadores.map((i) => ({
      nombre: i.nombre,
      unidad: i.unidad,
      meta: conUnidad(i.meta, i.unidad),
      gatillo: conUnidad(i.gatillo, i.unidad),
      mejor_si: i.mejor_si,
      estado: estadoRelevante(i),
      umbral_mensual: i.umbral_mensual,
      ultimo_dia: i.ultimo
        ? { fecha: i.ultimo.fecha, valor: conUnidad(i.ultimo.texto ?? i.ultimo.valor, i.unidad) }
        : null,
      ultimos_dias_operativos: i.serie.map((p) => ({
        fecha: p.fecha,
        valor: conUnidad(p.texto ?? p.valor, i.unidad),
        estado: p.estado,
      })),
      acumulado_mes: conUnidad(i.mtd_texto ?? i.mtd, i.unidad),
      estado_acumulado_mes: i.estado_mtd,
      dias_seguidos_fuera_de_meta: i.racha_fuera,
      fuera_de_meta_toda_la_semana: i.racha_toda_la_serie,
      tendencia: tendencia(i),
      puede_proponer_plan: ameritaPlan(i),
    })),
  }
}

// ---------- anti-alucinación ----------

/** Todos los números que el bot tiene permitido citar. */
function numerosPermitidos(ctx: ContextoPilar): number[] {
  const out = new Set<number>()
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return
    out.add(n)
    out.add(Math.abs(n))
  }
  for (const i of ctx.indicadores) {
    add(i.meta)
    add(i.gatillo)
    add(i.mtd)
    add(i.racha_fuera)
    for (const p of i.serie) {
      add(p.valor)
      for (const m of (p.texto ?? "").match(/\d+(?:[.,]\d+)?/g) ?? []) add(Number(m.replace(",", ".")))
      add(Number(p.fecha.slice(8, 10)))
      add(Number(p.fecha.slice(5, 7)))
    }
    for (const m of (i.mtd_texto ?? "").match(/\d+(?:[.,]\d+)?/g) ?? []) add(Number(m.replace(",", ".")))
  }
  for (const nov of ctx.novedades ?? []) {
    for (const m of nov.match(/\d[\d.,]*\d|\d/g) ?? []) for (const v of lecturas(m)) add(v)
  }
  add(Number(ctx.hoy.slice(8, 10)))
  add(Number(ctx.hoy.slice(5, 7)))
  add(ctx.indicadores.length)
  // Conteos que el mensaje puede citar ("5 indicadores en verde", "3 planes").
  const estados = ctx.indicadores.map(estadoRelevante)
  for (const e of ["verde", "amarillo", "rojo"] as const) add(estados.filter((x) => x === e).length)
  add(estados.filter((x) => x === "rojo" || x === "amarillo").length)
  for (let n = 1; n <= 3; n++) add(n)
  return [...out]
}

/** Interpretaciones posibles de un número escrito en es-AR o en en-US. */
function lecturas(token: string): number[] {
  const res: number[] = []
  const esAr = Number(token.replace(/\./g, "").replace(",", "."))
  if (Number.isFinite(esAr)) res.push(esAr)
  const en = Number(token.replace(/,/g, ""))
  if (Number.isFinite(en)) res.push(en)
  return res
}

export function numerosInventados(texto: string, ctx: ContextoPilar): string[] {
  const permitidos = numerosPermitidos(ctx)
  const tokens = texto.match(/\d[\d.,]*\d|\d/g) ?? []
  return tokens.filter((t) => {
    const ok = lecturas(t).some((v) =>
      permitidos.some((p) => Math.abs(p - v) <= Math.max(0.051, Math.abs(p) * 0.005)),
    )
    return !ok
  })
}

/** Indicadores en rojo/amarillo que el mensaje no nombra. */
export function indicadoresOmitidos(texto: string, ctx: ContextoPilar): string[] {
  const t = texto.toLowerCase()
  return ctx.indicadores
    .filter((i) => {
      const e = estadoRelevante(i)
      return e === "rojo" || e === "amarillo"
    })
    .map((i) => i.nombre)
    .filter((n) => !t.includes(n.trim().toLowerCase()))
}

/** Tendencias inventadas por el modelo (las válidas vienen del campo tendencia). */
export const TENDENCIA_PROPIA = /subiendo|bajando|cayendo|creciendo|repunt|viene (mejor|peor)/i

/** Indicadores que no están en rojo/amarillo pero el mensaje pinta como tales. */
export function indicadoresDeMas(texto: string, ctx: ContextoPilar): string[] {
  const lineas = texto.split("\n").filter((l) => /^\s*(🔴|🟡|🟠)/u.test(l))
  return ctx.indicadores
    .filter((i) => {
      const e = estadoRelevante(i)
      return e !== "rojo" && e !== "amarillo"
    })
    .map((i) => i.nombre)
    .filter((n) => lineas.some((l) => l.toLowerCase().includes(`*${n.trim().toLowerCase()}*`)))
}

// ---------- plantilla sin IA (fallback) ----------

const ICONO = { rojo: "🔴", amarillo: "🟡", verde: "✅", neutro: "▫️", sin_dato: "▫️" } as const

export function mensajePlantilla(ctx: ContextoPilar): string {
  const fuera = ctx.indicadores.filter((i) => {
    const e = estadoRelevante(i)
    return e === "rojo" || e === "amarillo"
  })
  if (fuera.length === 0) return "✅ Todos los indicadores con meta están en verde."
  const lineas = fuera
    .sort((a, b) => (estadoRelevante(a) === "rojo" ? 0 : 1) - (estadoRelevante(b) === "rojo" ? 0 : 1))
    .map((i) => {
      const v = i.umbral_mensual ? i.mtd : i.ultimo?.valor
      const u = i.unidad && i.unidad !== "#" ? ` ${i.unidad}` : ""
      const meta = i.meta != null ? ` (meta ${num(i.meta)}${u})` : ""
      const racha = i.racha_fuera >= 2 ? ` · ${i.racha_fuera} días seguidos` : ""
      return `${ICONO[estadoRelevante(i)]} ${i.nombre}: ${num(v)}${u}${meta}${racha}`
    })
  const verdes = ctx.indicadores.filter((i) => estadoRelevante(i) === "verde").length
  if (verdes > 0) lineas.push(`✅ ${verdes} indicadores en verde.`)
  return lineas.join("\n")
}

// ---------- IA ----------

const SCHEMA_SALIDA = {
  type: "object",
  additionalProperties: false,
  required: ["mensaje_whatsapp", "hallazgos", "planes_propuestos"],
  properties: {
    mensaje_whatsapp: { type: "string" },
    hallazgos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indicador", "severidad", "lectura"],
        properties: {
          indicador: { type: "string" },
          severidad: { type: "string", enum: ["rojo", "amarillo"] },
          lectura: { type: "string" },
        },
      },
    },
    planes_propuestos: {
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

function promptSistema(bot: BotPilar): string {
  return [
    `Sos el bot del pilar ${bot.nombre} del programa DPO de una distribuidora de bebidas en Argentina.`,
    "Cada mañana revisás los indicadores de tu pilar y le escribís al encargado por WhatsApp.",
    "",
    "Reglas, sin excepción:",
    "- Escribí en español rioplatense (vos), directo y breve, como un jefe de pilar que conoce la operación.",
    "- Usá SOLO los números que aparecen en el JSON, escritos tal cual (coma decimal). No calcules diferencias, promedios ni porcentajes nuevos. No inventes camiones, choferes, clientes ni causas como si fueran hechos.",
    "- Los valores ya vienen formateados con su unidad: copialos tal cual.",
    "- mensaje_whatsapp: sin saludo ni encabezado (ya va arriba). Una línea por indicador con estado rojo o amarillo (usá el campo estado, no la racha), primero los rojos, con este formato exacto:",
    "  🔴 *<nombre>*: <valor del último día> (meta <meta>) · <comentario corto>",
    "  El comentario dice la racha («3 días seguidos», o «toda la semana» si fuera_de_meta_toda_la_semana) o, si no hay racha de 2 o más días, el campo tendencia tal cual viene. NUNCA deduzcas vos si mejoró o empeoró: usá solo el campo tendencia. Si es de umbral mensual, usá el acumulado del mes en vez del último día.",
    "  NO agregues líneas de resumen, conteos de verdes ni avisos de planes: eso lo agrega el sistema. Máximo 10 líneas.",
    "- hallazgos: uno por indicador en rojo o amarillo, con una lectura corta de la tendencia de los últimos días.",
    "- planes_propuestos: SOLO para indicadores con puede_proponer_plan=true, como máximo 3. La causa_probable es una hipótesis a verificar (decí «posible…»), la acción es concreta, operativa y verificable en una semana (qué se mira, con quién, dónde) — nada genérico como «capacitar» o «revisar estrategias» sin decir qué, responsable_sugerido es un rol (ej. «Supervisor de Distribución»), fecha_objetivo en formato YYYY-MM-DD entre 7 y 21 días después de hoy.",
    bot.prompt_extra ? `\nContexto del pilar: ${bot.prompt_extra}` : "",
  ].join("\n")
}

export function sanearPlanes(
  planes: PlanPropuesto[],
  ctx: ContextoPilar,
  maximoPlanes = 3,
): PlanPropuesto[] {
  const habilitados = new Map(
    ctx.indicadores.filter(ameritaPlan).map((i) => [i.nombre.trim().toLowerCase(), i.nombre]),
  )
  const minimo = sumarDias(ctx.hoy, 3)
  const maximo = sumarDias(ctx.hoy, 45)
  return planes
    .filter((p) => habilitados.has(p.indicador.trim().toLowerCase()))
    .slice(0, maximoPlanes)
    .map((p) => {
      const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_objetivo) &&
        p.fecha_objetivo >= minimo && p.fecha_objetivo <= maximo
      return {
        ...p,
        indicador: habilitados.get(p.indicador.trim().toLowerCase())!,
        fecha_objetivo: fechaOk ? p.fecha_objetivo : sumarDias(ctx.hoy, 14),
      }
    })
}

async function redactar(
  bot: BotPilar,
  ctx: ContextoPilar,
): Promise<{ salida: SalidaRonda | null; cuerpo: string; modo: "ia" | "plantilla"; nota: string | null }> {
  // Todo en verde: no hace falta el modelo.
  const hayFuera = ctx.indicadores.some((i) => {
    const e = estadoRelevante(i)
    return e === "rojo" || e === "amarillo"
  })
  if (!hayFuera) return { salida: null, cuerpo: mensajePlantilla(ctx), modo: "plantilla", nota: null }

  const usuario = JSON.stringify(compacto(ctx))
  let nota: string | null = null
  for (let intento = 0; intento < 2; intento++) {
    try {
      const salida: SalidaRonda = await generarJson<SalidaRonda>({
        sistema: promptSistema(bot),
        usuario: intento === 0
          ? usuario
          : `${usuario}\n\nOJO, el intento anterior estuvo mal (${nota}). Corregilo: una línea por CADA indicador en rojo o amarillo, con su nombre exacto, y solo números del JSON.`,
        nombreSchema: "ronda_pilar",
        schema: SCHEMA_SALIDA,
      })
      const inventados = numerosInventados(salida.mensaje_whatsapp, ctx)
      const omitidos = indicadoresOmitidos(salida.mensaje_whatsapp, ctx)
      const deMas = indicadoresDeMas(salida.mensaje_whatsapp, ctx)
      const tendenciaPropia = TENDENCIA_PROPIA.test(salida.mensaje_whatsapp)
      if (inventados.length === 0 && omitidos.length === 0 && deMas.length === 0 && !tendenciaPropia) {
        salida.planes_propuestos = sanearPlanes(salida.planes_propuestos, ctx)
        // El modelo a veces usa 🟠 en vez de 🟡.
        const cuerpo = salida.mensaje_whatsapp.trim().replaceAll("🟠", "🟡")
        return { salida, cuerpo, modo: "ia", nota: null }
      }
      nota = [
        inventados.length ? `números que no están en el JSON: ${inventados.join(", ")}` : null,
        omitidos.length ? `faltan indicadores fuera de meta: ${omitidos.join(", ")}` : null,
        deMas.length ? `estos están en verde (mirá el campo estado), no los pongas: ${deMas.join(", ")}` : null,
        tendenciaPropia ? "describiste tendencias que no están en el campo tendencia" : null,
      ]
        .filter(Boolean)
        .join("; ")
    } catch (e) {
      nota = e instanceof Error ? e.message : String(e)
    }
  }
  return { salida: null, cuerpo: mensajePlantilla(ctx), modo: "plantilla", nota }
}

// ---------- ronda ----------

/** A quién le escribe el bot: el override de calibración o su encargado. */
export function destinoDe(bot: BotPilar): string | null {
  const override = (process.env.BOTS_DESTINO_OVERRIDE ?? "").trim()
  return override || bot.telefono?.trim() || null
}

export async function cargarBots(key?: string): Promise<BotPilar[]> {
  const supabase = createAdminClient()
  let q = supabase.from("bots_pilar").select("*").eq("activo", true)
  if (key) q = q.eq("key", key)
  const { data, error } = await q.order("key")
  if (error) throw new Error(`bots_pilar: ${error.message}`)
  return (data ?? []) as BotPilar[]
}

export async function correrRonda(
  bot: BotPilar,
  opts: { dry: boolean; hoy?: string },
): Promise<ResultadoRonda> {
  const supabase = createAdminClient()
  const ctx = await armarContexto(bot, opts.hoy)
  const { salida, cuerpo, modo, nota } = await redactar(bot, ctx)
  // Los cierres con conteos los arma el código: el modelo no cuenta bien.
  // Los planes van numerados (los números se reinician cada día) para poder
  // aprobarlos respondiendo «sí 3» por WhatsApp.
  const verdes = ctx.indicadores.filter((i) => estadoRelevante(i) === "verde").length
  const desde = salida?.planes_propuestos.length ? await proximoNumero(supabase, ctx.hoy) : 1
  const planes = (salida?.planes_propuestos ?? []).map((p, i) => ({ ...p, numero: desde + i }))
  const verdesLinea = modo === "ia" && verdes > 0 ? [`✅ ${verdes} indicadores en verde.`] : []
  const novedades = ctx.novedades?.length ? ["", ...ctx.novedades] : []
  const cierre = modo === "ia" ? lineasPlanes(planes) : []
  const mensaje = [encabezado(bot, ctx.hoy), cuerpo, ...verdesLinea, ...novedades, ...cierre].join("\n")

  const destino = destinoDe(bot)

  let enviado = false
  let error: string | null = modo === "plantilla" && nota ? `IA descartada: ${nota}` : null
  if (!opts.dry) {
    if (!destino) {
      error = [error, "Sin teléfono de destino"].filter(Boolean).join(" · ")
    } else {
      try {
        const r = await sendText(destino, mensaje)
        enviado = r.ok
        if (!r.ok) error = [error, `Evolution ${r.status}`].filter(Boolean).join(" · ")
      } catch (e) {
        error = [error, e instanceof Error ? e.message : String(e)].filter(Boolean).join(" · ")
      }
    }
  }

  const { data: corrida, error: errIns } = await supabase
    .from("bots_corridas")
    .insert({
      bot_key: bot.key,
      fecha: ctx.hoy,
      tipo: "ronda",
      contexto: ctx,
      salida,
      mensaje,
      modo,
      modelo: modo === "ia" ? modeloBots() : null,
      dry: opts.dry,
      enviado,
      destino,
      error,
    })
    .select("id")
    .single()
  if (errIns) throw new Error(`bots_corridas: ${errIns.message}`)
  const corridaId = (corrida as { id: string }).id

  // En modo prueba no se guardan propuestas: quedan solo en `salida`.
  if (planes.length > 0 && !opts.dry) {
    const { error: errPlanes } = await supabase.from("bots_planes_propuestos").insert(
      planes.map((p) => ({ ...p, corrida_id: corridaId, bot_key: bot.key, fecha: ctx.hoy })),
    )
    if (errPlanes) throw new Error(`bots_planes_propuestos: ${errPlanes.message}`)
  }

  return {
    bot: bot.key,
    corrida_id: corridaId,
    mensaje,
    modo,
    enviado,
    destino,
    planes: planes.length,
    error,
    contexto: ctx,
  }
}
