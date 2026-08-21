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
 */

import { resolverPadron, normalizarNombre } from "./owd-padron"

export type Severidad = "critica" | "aviso"

export interface Alerta {
  /** Estable entre corridas: con esto se guarda el "visto"/"pospuesto". */
  id: string
  chequeo: string
  severidad: Severidad
  titulo: string
  detalle: string
  /** Sobre quién es la alerta. NO es un destinatario: las notificaciones van
   *  siempre a Esteban, que decide a quién avisarle. */
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

  const pregById = new Map((preguntas ?? []).map((p: any) => [p.id, p]))
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
