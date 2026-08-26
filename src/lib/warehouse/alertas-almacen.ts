/**
 * Motor de alertas del pilar ALMACÉN.
 *
 * Vive acá (dpo-app) y no en deposito-esteban porque las tablas que necesita
 * están detrás de RLS: la anon key devuelve [] en todas. Se expone por
 * /api/alertas/almacen con Bearer, y deposito-esteban lo proxea desde su
 * backend Python (nunca desde el JS, que es público).
 *
 * Cada chequeo devuelve alertas con la misma forma para que el tablero las
 * pinte igual sin saber de dónde salieron.
 *
 * 🚨 ESTO NO NOTIFICA A NADIE, y es a propósito (decisión del 26-08-2026): sin
 * mail y sin WhatsApp, la pestaña es el único canal. Por eso lo que no aparece
 * acá directamente no existe, y por eso conviene sumar chequeos antes que
 * afinar los que ya están.
 */

import { resolverPadron, normalizarNombre } from "./owd-padron"
import { estadoDerivado } from "@/lib/capacitacion-estado"
import { normalizePilar } from "@/lib/capacitacion-adherencia"
import { esFeriado } from "@/lib/feriados-ar"
import { SLA_CARGA_TARGET } from "@/lib/sla-cumplimiento"
import {
  CARGA_EXCEPCIONES_DIA_CUMPLE,
  CARGA_FERIADOS,
} from "@/lib/sla-carga-excepciones"

export type Severidad = "critica" | "aviso"

export interface Alerta {
  /** Estable entre corridas: con esto se guarda el "visto"/"pospuesto". */
  id: string
  chequeo: string
  severidad: Severidad
  titulo: string
  detalle: string
  /** Sobre quién es la alerta. NO es un destinatario: acá no se notifica a
   *  nadie (ver el encabezado), lo mira Esteban y él decide a quién avisarle. */
  sobre?: string
  fecha?: string
  diasVencido?: number
  link?: string
}

/** Días de atraso desde los que algo vencido pasa a crítica. */
const DIAS_CRITICA = 7

const PILAR_ALMACEN = "Almacén"

/** Compromisos de reunión que siguen abiertos (el cerrado es "cerrada"). */
const ESTADOS_COMPROMISO_ABIERTO = ["no_comenzada", "en_curso"]

/** Planes de acción que siguen abiertos (el cerrado es "completado"). */
const ESTADOS_PLAN_ABIERTO = ["pendiente", "en_progreso"]

/**
 * Lo que de `requisitos_legales` es de Almacén. El resto de la tabla (VTV,
 * seguros, licencias, SENASA…) es de Flota y tiene otro responsable: si se
 * colara acá, el tablero del pilar mostraría pendientes que no son suyos.
 */
const CATEGORIAS_LEGALES_ALMACEN = ["Extintores depósito", "Extintores de autoelevadores"]

/** Un vencimiento legal a esta distancia o menos ya es crítico. */
const DIAS_LEGAL_CRITICA = 15
/** Y desde acá se empieza a avisar: la recarga se pide con anticipación. */
const DIAS_LEGAL_AVISO = 45

/** Ventana hacia atrás del chequeo de checklists de autoelevador. */
const DIAS_VENTANA_CHECKLIST = 14
/** Faltas en esa ventana desde las que el checklist pasa a crítica. */
const FALTAS_CHECKLIST_CRITICA = 3

/** Puntos por debajo del target desde los que el SLA pasa de aviso a crítica. */
const MARGEN_AVISO_SLA = 5

/** Horizonte del aviso de stock por vencer (el blob llega hasta 60 días). */
const DIAS_VENCIMIENTO_AVISO = 30

const SLA_CARGA_PRECOCIDO_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=sla-carga"

const VENCIMIENTOS_BLOB_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=wms-vencimientos"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any }

function hoyISO(ahora: Date): string {
  return ahora.toISOString().slice(0, 10)
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + "T00:00:00Z").getTime()
  const b = new Date(hasta + "T00:00:00Z").getTime()
  return Math.round((b - a) / 86_400_000)
}

/** 'YYYY-MM-DD' ± n días, sin corrimiento por zona horaria. */
function sumarDiasISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 0 = domingo. */
function diaSemanaISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ────────────────────────────────────────────────────────────────────
// 1) OWD: cobertura del padrón.
//    No hay meta: de cada tarea se observa a TODOS los que la realizan.
// ────────────────────────────────────────────────────────────────────
async function chequeoOwdCobertura(sb: Sb, ahora: Date): Promise<Alerta[]> {
  const desdeMes = hoyISO(ahora).slice(0, 8) + "01"

  const { data: templates } = await sb
    .from("owd_templates")
    // `*` a propósito: así toma `roles_cobertura` en cuanto exista, sin tener
    // que tocar esta query (hoy la columna todavía no está aplicada).
    .select("*, preguntas(numero, bloques(pilares(nombre)))")
    .eq("activo", true)

  const deAlmacen = (templates ?? []).filter(
    (t: any) => t?.preguntas?.bloques?.pilares?.nombre === PILAR_ALMACEN,
  )
  if (deAlmacen.length === 0) return []

  const { data: obs } = await sb
    .from("owd_observaciones")
    .select("template_id, empleado_observado, fecha")
    .gte("fecha", desdeMes)

  const out: Alerta[] = []
  for (const t of deAlmacen) {
    const padron = await resolverPadron(sb as never, t)
    if (padron.length === 0) continue

    const vistos = new Set(
      (obs ?? [])
        .filter((o: any) => o.template_id === t.id)
        .map((o: any) => normalizarNombre(o.empleado_observado || "")),
    )
    const faltan = padron.filter((p) => !vistos.has(normalizarNombre(p)))
    if (faltan.length === 0) continue

    const numero = t?.preguntas?.numero ?? "?"
    out.push({
      id: `owd-cobertura:${t.id}:${desdeMes}`,
      chequeo: "owd_cobertura",
      severidad: "aviso",
      titulo: `${numero} — faltan ${faltan.length} de ${padron.length} operadores`,
      detalle: `Sin observar este mes en "${t.nombre}": ${faltan.join(", ")}.`,
      fecha: desdeMes,
      link: `/owd/${t.id}`,
    })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
// 2) OWD: agendadas que quedaron sin hacer.
//    El calendario ya dice quién y cuándo; esto sólo mira lo que venció.
// ────────────────────────────────────────────────────────────────────
async function chequeoOwdAgendaVencida(sb: Sb, ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)

  const { data: filas } = await sb
    .from("owd_agenda")
    .select(
      "id, fecha, empleado_observado, estado, owd_templates(id, nombre, preguntas(numero, bloques(pilares(nombre))))",
    )
    .eq("estado", "planificada")
    .lt("fecha", hoy)

  return (filas ?? [])
    .filter((f: any) => f?.owd_templates?.preguntas?.bloques?.pilares?.nombre === PILAR_ALMACEN)
    .map((f: any): Alerta => {
      const dias = diasEntre(f.fecha, hoy)
      const numero = f.owd_templates?.preguntas?.numero ?? "?"
      return {
        id: `owd-agenda:${f.id}`,
        chequeo: "owd_agenda_vencida",
        severidad: dias >= DIAS_CRITICA ? "critica" : "aviso",
        titulo: `${numero} — OWD agendada sin hacer hace ${dias} día${dias === 1 ? "" : "s"}`,
        detalle: `"${f.owd_templates?.nombre}" del ${f.fecha} sobre ${f.empleado_observado}.`,
        sobre: f.empleado_observado ?? undefined,
        fecha: f.fecha,
        diasVencido: dias,
        link: `/owd/${f.owd_templates?.id}`,
      }
    })
}

// ────────────────────────────────────────────────────────────────────
// 3) Compromisos de la reunión warehouse vencidos.
//    El cron /api/tareas/cron-vencimientos NO mira esta tabla.
// ────────────────────────────────────────────────────────────────────
async function chequeoCompromisosReunion(sb: Sb, ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)

  const { data: filas } = await sb
    .from("reuniones_actividades")
    .select("id, descripcion, fecha_compromiso, estado, reuniones(tipo)")
    .lt("fecha_compromiso", hoy)
    // Los estados reales son cerrada / no_comenzada / en_curso. Se listan los
    // ABIERTOS en vez de excluir el cerrado: si mañana aparece un estado nuevo,
    // esto lo ignora en lugar de reportarlo como vencido.
    .in("estado", ESTADOS_COMPROMISO_ABIERTO)

  return (filas ?? [])
    .filter((f: any) => f?.reuniones?.tipo === "warehouse")
    .map((f: any): Alerta => {
      const dias = diasEntre(f.fecha_compromiso, hoy)
      return {
        id: `reunion-compromiso:${f.id}`,
        chequeo: "compromiso_reunion_vencido",
        severidad: dias >= DIAS_CRITICA ? "critica" : "aviso",
        titulo: `Compromiso de reunión vencido hace ${dias} día${dias === 1 ? "" : "s"}`,
        detalle: `${f.descripcion} (comprometido para el ${f.fecha_compromiso}, estado "${f.estado}").`,
        fecha: f.fecha_compromiso,
        diasVencido: dias,
        link: "/reuniones",
      }
    })
}

// ────────────────────────────────────────────────────────────────────
// 4) Puntos DPO de Almacén con nota baja y sin plan de acción abierto.
// ────────────────────────────────────────────────────────────────────
async function chequeoPuntosSinPlan(sb: Sb): Promise<Alerta[]> {
  const { data: pilares } = await sb.from("pilares").select("id").eq("nombre", PILAR_ALMACEN)
  const pilarId = pilares?.[0]?.id
  if (!pilarId) return []

  const { data: bloques } = await sb.from("bloques").select("id").eq("pilar_id", pilarId)
  const bloqueIds = (bloques ?? []).map((b: any) => b.id)
  if (bloqueIds.length === 0) return []

  const { data: preguntas } = await sb
    .from("preguntas")
    .select("id, numero, texto")
    .in("bloque_id", bloqueIds)
  const preguntaIds = (preguntas ?? []).map((p: any) => p.id)
  if (preguntaIds.length === 0) return []

  // Última respuesta de cada pregunta: la auditoría más reciente que la tocó.
  const { data: respuestas } = await sb
    .from("respuestas")
    .select("pregunta_id, puntaje, updated_at")
    .in("pregunta_id", preguntaIds)
    .order("updated_at", { ascending: false })

  const ultima = new Map<string, number>()
  for (const r of respuestas ?? []) {
    if (!ultima.has(r.pregunta_id) && r.puntaje !== null) {
      ultima.set(r.pregunta_id, Number(r.puntaje))
    }
  }

  const { data: planes } = await sb
    .from("planes_accion")
    .select("pregunta_id, estado")
    .in("pregunta_id", preguntaIds)
  const conPlanAbierto = new Set(
    (planes ?? [])
      .filter((p: any) => ESTADOS_PLAN_ABIERTO.includes(p.estado))
      .map((p: any) => p.pregunta_id),
  )

  // Tipada a mano: sin esto el `.map()` sobre un `any[]` infiere Map<{}, {}>
  // y el acceso a .numero no compila.
  const pregById = new Map<string, { numero: string; texto: string }>(
    (preguntas ?? []).map((p: any) => [p.id as string, { numero: p.numero, texto: p.texto }]),
  )
  const out: Alerta[] = []
  for (const [preguntaId, puntaje] of ultima) {
    if (puntaje > 1) continue
    if (conPlanAbierto.has(preguntaId)) continue
    const p = pregById.get(preguntaId)
    out.push({
      id: `dpo-sin-plan:${preguntaId}`,
      chequeo: "punto_dpo_sin_plan",
      severidad: "critica",
      titulo: `${p?.numero ?? "?"} sacó ${puntaje} y no tiene plan de acción`,
      detalle: `${p?.texto ?? ""} — la última auditoría lo calificó ${puntaje} y no hay ningún plan abierto.`,
      link: `/pilares/${pilarId}/pregunta/${preguntaId}`,
    })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
// 5) Requisitos legales a nombre de Almacén: los matafuegos.
//    Alcance fijado con él: de toda `requisitos_legales`, lo del pilar son los
//    extintores (depósito + autoelevadores). El resto es de Flota.
// ────────────────────────────────────────────────────────────────────
async function chequeoRequisitosLegales(sb: Sb, ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)

  const { data: cats } = await sb
    .from("requisitos_legales_categorias")
    .select("id, nombre")
    .in("nombre", CATEGORIAS_LEGALES_ALMACEN)
  const catById = new Map<string, string>(
    (cats ?? []).map((c: any) => [c.id as string, c.nombre as string]),
  )
  if (catById.size === 0) return []

  const { data: filas } = await sb
    .from("requisitos_legales")
    .select("id, nombre, fecha_vencimiento, categoria_id")
    .in("categoria_id", [...catById.keys()])
    .not("fecha_vencimiento", "is", null)
    .lte("fecha_vencimiento", sumarDiasISO(hoy, DIAS_LEGAL_AVISO))

  // Los 13 matafuegos del depósito vencen todos el mismo día: una alerta por
  // cada uno serían 13 tarjetas para un único trámite. Se agrupan por
  // categoría + fecha y los equipos se listan en el detalle.
  // El tipo va a mano: sin él, el `nombres: []` del fallback infiere never[]
  // y el .push() de abajo no compila.
  type GrupoLegal = { cat: string; fecha: string; nombres: string[] }
  const grupos = new Map<string, GrupoLegal>()
  for (const f of filas ?? []) {
    const cat = catById.get(f.categoria_id)
    if (!cat) continue
    const clave = `${f.categoria_id}|${f.fecha_vencimiento}`
    const g: GrupoLegal = grupos.get(clave) ?? { cat, fecha: f.fecha_vencimiento, nombres: [] }
    g.nombres.push(String(f.nombre ?? "sin nombre"))
    grupos.set(clave, g)
  }

  const out: Alerta[] = []
  for (const [clave, g] of grupos) {
    const dias = diasEntre(hoy, g.fecha) // negativo = ya vencido
    const vencido = dias < 0
    const cuantos = g.nombres.length
    const que = cuantos === 1 ? g.nombres[0] : `${cuantos} equipos`
    out.push({
      id: `requisito-legal:${clave}`,
      chequeo: "requisito_legal_vence",
      severidad: vencido || dias <= DIAS_LEGAL_CRITICA ? "critica" : "aviso",
      titulo: vencido
        ? `${g.cat}: ${que} vencido${cuantos === 1 ? "" : "s"} hace ${-dias} día${dias === -1 ? "" : "s"}`
        : `${g.cat}: ${que} vence${cuantos === 1 ? "" : "n"} en ${dias} día${dias === 1 ? "" : "s"}`,
      detalle:
        `Vencimiento ${g.fecha}. ${[...g.nombres].sort().join(", ")}.` +
        (vencido || cuantos === 1 ? "" : " Son todos el mismo día: la recarga se pide de una vez."),
      fecha: g.fecha,
      diasVencido: vencido ? -dias : undefined,
      link: "/requisitos-legales",
    })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
// 6) Capacitaciones del pilar Almacén que ya tenían que estar cerradas.
//    Se usa el MISMO estado derivado que /capacitaciones: una "programada" con
//    fecha pasada y asistentes cargados figura en curso allá, y tiene que
//    figurar igual acá o los dos tableros se contradicen.
// ────────────────────────────────────────────────────────────────────
async function chequeoCapacitaciones(sb: Sb, ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)

  const { data: caps } = await sb
    .from("capacitaciones")
    .select("id, titulo, fecha, estado, pilar")
    .lt("fecha", hoy) // la de hoy todavía se puede estar dictando
  // "Almacén" y "Almacen" conviven en la columna: se comparan sin tilde.
  const deAlmacen = (caps ?? []).filter(
    (c: any) => normalizePilar(c.pilar) === normalizePilar(PILAR_ALMACEN),
  )
  if (deAlmacen.length === 0) return []

  const { data: asis } = await sb
    .from("asistencias")
    .select("capacitacion_id, presente, resultado")
    .in(
      "capacitacion_id",
      deAlmacen.map((c: any) => c.id),
    )

  type Resumen = { total: number; presentes: number; rendidos: number; pendientes: number }
  const vacio = (): Resumen => ({ total: 0, presentes: 0, rendidos: 0, pendientes: 0 })
  const resumen = new Map<string, Resumen>()
  for (const a of asis ?? []) {
    const r = resumen.get(a.capacitacion_id) ?? vacio()
    r.total++
    if (a.presente) r.presentes++
    if (a.resultado === "pendiente") r.pendientes++
    else r.rendidos++
    resumen.set(a.capacitacion_id, r)
  }

  const atrasadas: Array<{ fecha: string; titulo: string; dias: number; porQue: string }> = []
  for (const c of deAlmacen) {
    const r = resumen.get(c.id) ?? vacio()
    const estado = estadoDerivado(
      {
        estado: c.estado,
        fecha: c.fecha,
        total_asistentes: r.total,
        presentes: r.presentes,
        rendidos: r.rendidos,
        pendientes: r.pendientes,
      },
      hoy,
    )
    if (estado === "completada" || estado === "cancelada") continue
    atrasadas.push({
      fecha: c.fecha,
      titulo: String(c.titulo),
      dias: diasEntre(c.fecha, hoy),
      porQue: r.total === 0 ? "sin asistentes cargados" : `${r.pendientes}/${r.total} sin rendir`,
    })
  }
  if (atrasadas.length === 0) return []

  // Una tarjeta por capacitación serían doce para un mismo trabajo (sentarse a
  // cerrar el Gantt de Almacén) y taparían todo lo demás del tablero. Va una
  // sola, con el detalle completo adentro.
  atrasadas.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const vieja = atrasadas[0]
  return [
    {
      id: `capacitaciones-atrasadas:${hoy}`,
      chequeo: "capacitacion_atrasada",
      severidad: vieja.dias >= DIAS_CRITICA ? "critica" : "aviso",
      titulo:
        atrasadas.length === 1
          ? `Capacitación sin cerrar hace ${vieja.dias} día${vieja.dias === 1 ? "" : "s"}`
          : `${atrasadas.length} capacitaciones de Almacén sin cerrar (la más vieja, del ${vieja.fecha})`,
      detalle: atrasadas
        .map((c) => `${c.fecha} — "${c.titulo}" (${c.dias} d, ${c.porQue})`)
        .join(" · "),
      fecha: vieja.fecha,
      diasVencido: vieja.dias,
      link: "/capacitaciones",
    },
  ]
}

// ────────────────────────────────────────────────────────────────────
// 7) Checklist diario de los autoelevadores.
//    La adherencia de checklists que ya existe mide SÓLO camiones, así que hoy
//    nadie avisa si falta el del autoelevador.
//
//    Un día cuenta como operativo si (a) no es domingo ni feriado y (b) hubo al
//    menos un checklist de CUALQUIER vehículo. La condición (b) es la que salva
//    los días que el depósito no abrió por un motivo que no está en ningún
//    calendario: si no laburó nadie, no se reclama nada.
// ────────────────────────────────────────────────────────────────────
async function chequeoChecklistAutoelevadores(sb: Sb, ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)
  const desde = sumarDiasISO(hoy, -DIAS_VENTANA_CHECKLIST)

  const { data: unidades } = await sb
    .from("catalogo_vehiculos")
    .select("dominio")
    .eq("tipo", "autoelevador")
    .eq("active", true)
  const dominios = (unidades ?? []).map((v: any) => String(v.dominio))
  if (dominios.length === 0) return []

  const { data: checks } = await sb
    .from("checklist_vehiculos")
    .select("fecha, dominio")
    .gte("fecha", desde)
    .lt("fecha", hoy) // el día en curso todavía puede completarse

  const diasConActividad = new Set((checks ?? []).map((c: any) => String(c.fecha)))
  const hechos = new Set((checks ?? []).map((c: any) => `${c.fecha}|${c.dominio}`))

  const faltantesPorDominio = new Map<string, string[]>()
  for (let d = DIAS_VENTANA_CHECKLIST; d >= 1; d--) {
    const iso = sumarDiasISO(hoy, -d)
    if (diaSemanaISO(iso) === 0 || esFeriado(iso)) continue
    if (!diasConActividad.has(iso)) continue // ese día no operó nadie
    for (const dom of dominios) {
      if (hechos.has(`${iso}|${dom}`)) continue
      const acum: string[] = faltantesPorDominio.get(dom) ?? []
      acum.push(iso)
      faltantesPorDominio.set(dom, acum)
    }
  }

  const out: Alerta[] = []
  for (const [dom, dias] of faltantesPorDominio) {
    out.push({
      id: `checklist-autoelevador:${dom}:${desde}`,
      chequeo: "checklist_autoelevador",
      severidad: dias.length >= FALTAS_CHECKLIST_CRITICA ? "critica" : "aviso",
      titulo: `${dom}: ${dias.length} día${dias.length === 1 ? "" : "s"} sin checklist en los últimos ${DIAS_VENTANA_CHECKLIST}`,
      detalle: `Días operativos sin checklist de liberación: ${dias.join(", ")}.`,
      sobre: dom,
      fecha: dias[dias.length - 1],
      diasVencido: dias.length,
      link: "/vehiculos/mantenimiento",
    })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
// 8) SLA de carga del mes en curso contra su target.
//    Lee el MISMO blob pre-cocinado que la matriz de /sla y aplica las mismas
//    excepciones manuales, para que los dos tableros no den números distintos.
// ────────────────────────────────────────────────────────────────────
async function chequeoSlaCarga(ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)
  const mes = hoy.slice(0, 7)

  const res = await fetch(SLA_CARGA_PRECOCIDO_URL, { cache: "no-store" })
  if (!res.ok) throw new Error(`el blob del SLA de carga respondió ${res.status}`)
  const json = (await res.json()) as {
    data?: { dias?: Record<string, { estado?: string }> | null } | null
  }
  const dias = json?.data?.dias
  if (!dias || typeof dias !== "object") throw new Error("el blob del SLA de carga vino vacío")

  let aplica = 0
  let cumplidos = 0
  const incumplidos: string[] = []
  for (const [fecha, d] of Object.entries(dias)) {
    if (!fecha.startsWith(mes)) continue
    if (CARGA_FERIADOS[fecha]) continue // no aplica, igual que un domingo
    const estado = CARGA_EXCEPCIONES_DIA_CUMPLE[fecha] ? "si" : d?.estado
    if (estado !== "si" && estado !== "no") continue // sd / na / día en curso
    aplica++
    if (estado === "si") cumplidos++
    else incumplidos.push(fecha)
  }
  if (aplica === 0) return []

  const pct = Math.round((cumplidos / aplica) * 100)
  if (pct >= SLA_CARGA_TARGET) return []

  return [
    {
      id: `sla-carga:${mes}`,
      chequeo: "sla_carga_bajo_target",
      severidad: pct < SLA_CARGA_TARGET - MARGEN_AVISO_SLA ? "critica" : "aviso",
      titulo: `SLA de carga ${pct}% en ${mes} (target ${SLA_CARGA_TARGET}%)`,
      detalle: `${cumplidos} de ${aplica} días de reparto cumplieron. Días que no: ${incumplidos.sort().join(", ")}.`,
      fecha: hoy,
      link: "/sla",
    },
  ]
}

// ────────────────────────────────────────────────────────────────────
// 9) Stock próximo a vencer (blob 'wms-vencimientos' del pusher del depósito).
//    Lo ya vencido va uno por uno; lo que está por vencer va en UNA alerta
//    agrupada — si no, un mes cargado tapa todo lo demás del tablero.
// ────────────────────────────────────────────────────────────────────
async function chequeoVencimientosStock(ahora: Date): Promise<Alerta[]> {
  const hoy = hoyISO(ahora)

  const res = await fetch(VENCIMIENTOS_BLOB_URL, { cache: "no-store" })
  if (!res.ok) throw new Error(`el blob de vencimientos respondió ${res.status}`)
  const json = (await res.json()) as { data?: { items?: any[] } | null }
  const items = Array.isArray(json?.data?.items) ? json!.data!.items! : []
  if (items.length === 0) return []

  const out: Alerta[] = []
  const porVencer: any[] = []
  for (const it of items) {
    const dias = Number(it?.dias)
    if (!Number.isFinite(dias)) continue
    if (dias < 0) {
      out.push({
        id: `stock-vencido:${it.articulo}:${it.vencimiento}`,
        chequeo: "stock_vencido",
        severidad: "critica",
        titulo: `${it.descripcion} vencido hace ${-dias} día${dias === -1 ? "" : "s"}`,
        detalle: `Artículo ${it.articulo}, vencimiento ${it.vencimiento}: ${it.bultos} bultos todavía en stock.`,
        fecha: it.vencimiento,
        diasVencido: -dias,
      })
    } else if (dias <= DIAS_VENCIMIENTO_AVISO) {
      porVencer.push(it)
    }
  }

  if (porVencer.length > 0) {
    porVencer.sort((a, b) => Number(a.dias) - Number(b.dias))
    const bultos = porVencer.reduce((s, it) => s + (Number(it.bultos) || 0), 0)
    out.push({
      id: `stock-por-vencer:${hoy}`,
      chequeo: "stock_por_vencer",
      severidad: "aviso",
      titulo: `${porVencer.length} SKU vencen en menos de ${DIAS_VENCIMIENTO_AVISO} días (${Math.round(bultos)} bultos)`,
      detalle: porVencer
        .map((it) => `${it.descripcion} — ${it.vencimiento} (${it.dias} d, ${it.bultos} bultos)`)
        .join(" · "),
      fecha: porVencer[0].vencimiento,
    })
  }
  return out
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ResultadoAlertas {
  generado: string
  criticas: number
  avisos: number
  alertas: Alerta[]
  /** Chequeos que fallaron. Van aparte para que el tablero NO muestre
   *  "todo bien" cuando en realidad no se pudo mirar. */
  errores: Array<{ chequeo: string; error: string }>
}

export async function correrChequeos(sb: Sb, ahora = new Date()): Promise<ResultadoAlertas> {
  const chequeos: Array<[string, () => Promise<Alerta[]>]> = [
    ["owd_cobertura", () => chequeoOwdCobertura(sb, ahora)],
    ["owd_agenda_vencida", () => chequeoOwdAgendaVencida(sb, ahora)],
    ["compromiso_reunion_vencido", () => chequeoCompromisosReunion(sb, ahora)],
    ["punto_dpo_sin_plan", () => chequeoPuntosSinPlan(sb)],
    ["requisito_legal_vence", () => chequeoRequisitosLegales(sb, ahora)],
    ["capacitacion_atrasada", () => chequeoCapacitaciones(sb, ahora)],
    ["checklist_autoelevador", () => chequeoChecklistAutoelevadores(sb, ahora)],
    ["sla_carga_bajo_target", () => chequeoSlaCarga(ahora)],
    ["vencimientos_stock", () => chequeoVencimientosStock(ahora)],
  ]

  const alertas: Alerta[] = []
  const errores: Array<{ chequeo: string; error: string }> = []

  const resultados = await Promise.allSettled(chequeos.map(([, fn]) => fn()))
  resultados.forEach((r, i) => {
    const nombre = chequeos[i][0]
    if (r.status === "fulfilled") alertas.push(...r.value)
    else errores.push({ chequeo: nombre, error: String(r.reason?.message ?? r.reason) })
  })

  // Críticas primero y, dentro de cada grupo, lo más vencido arriba.
  alertas.sort((a, b) => {
    if (a.severidad !== b.severidad) return a.severidad === "critica" ? -1 : 1
    return (b.diasVencido ?? 0) - (a.diasVencido ?? 0)
  })

  return {
    generado: ahora.toISOString(),
    criticas: alertas.filter((a) => a.severidad === "critica").length,
    avisos: alertas.filter((a) => a.severidad === "aviso").length,
    alertas,
    errores,
  }
}
