// Pirámide de mantenimiento de flota + análisis histórico aperturado
// (DPO Flota 4.2 · R4.2.2 / R4.2.3).
//
// H1 (1/5), comentario del auditor: «Generar análisis aperturado de datos
// históricos. Generar pirámide de mantenimientos». La guía DPO pide una pirámide
// con las ROTURAS arriba y el PREVENTIVO en la base, que esté balanceada (cada
// escalón más angosto que el de abajo), seguida en el tiempo y con acciones que
// bajen el correctivo mejorando el plan preventivo.
//
// Niveles EXCLUSIVOS (cada evento cuenta una sola vez, en su nivel más alto),
// de la base a la punta:
//   1. preventivo  OT preventivas + proactivas realizadas (trabajo planificado)
//   2. deteccion   focos de checklist (un problema reportado varios días = 1)
//                  + hallazgos de aceite del CIL: el desvío se vio antes de fallar
//   3. correctivo  OT correctivas que NO son rotura
//   4. rotura      OT correctivas con auxilio, parada ≥ 1 día (`esRotura`) o con
//                  un rechazo «ROTURA DE CAMION» de la unidad ±3 días
//
// Un rechazo por rotura que no tiene OT correctiva de esa unidad cerca NO suma a
// la punta: va a `rechazosSinOt` para revisarlo (decisión de Fausto 06/11/2026:
// desde septiembre hay rechazos «rotura» casi diarios en AF399KY y AF028YB con 0
// bultos, que no se corresponden con ninguna reparación).
//
// Función pura: la usan la pantalla (vía `getPiramideFlota`), el PDF y el smoke.

import type { MantenimientoRealizado, MantenimientoSistema } from "@/types/database"
import { costoTotalOt } from "@/app/(dashboard)/vehiculos/mantenimiento/_components/ot-formato"
import { esOtInterna } from "./correctivo-analisis"
import { descripcionDeOt, sistemaDeOt } from "./recurrencia-correctivos"
import { diasFueraServicio, esRotura } from "./rotura"
import { labelSistema, sugerirSistema } from "./sistemas-ot"

export type NivelPiramide = "preventivo" | "deteccion" | "correctivo" | "rotura"

/** De la base a la punta. */
export const NIVELES_PIRAMIDE: Array<{ key: NivelPiramide; titulo: string; detalle: string }> = [
  { key: "preventivo", titulo: "Preventivo", detalle: "OT preventivas y proactivas realizadas" },
  { key: "deteccion", titulo: "Detectado por checklist / CIL", detalle: "Focos de checklist y hallazgos de aceite del CIL" },
  { key: "correctivo", titulo: "Correctivo", detalle: "Reparación no planificada, sin dejar la unidad parada" },
  { key: "rotura", titulo: "Rotura", detalle: "Auxilio en ruta, unidad parada ≥ 1 día o rechazo por rotura con OT" },
]

/** Ventana para validar un rechazo por rotura contra una OT correctiva. */
export const DIAS_VALIDACION_RECHAZO = 3
/** Ventana de «aviso previo»: misma que el KPI `checklist_deteccion` (1.3). */
export const DIAS_AVISO = 15
/** Retrabajo: la misma unidad y sistema vuelve a correctivo dentro de esta ventana. */
export const DIAS_RETRABAJO = 90

const DIA = 86_400_000

export interface DefectoChecklistIn {
  fecha: string
  dominio: string
  critico: boolean
  categoria: string
  item: string
  /** null = primer reporte del foco; con valor = repetición (no suma). */
  repeticionDe: string | null
}

export interface CilIn {
  fecha: string
  dominio: string
  hallazgo: boolean
}

export interface RechazoRoturaIn {
  fecha: string
  /** Patente del camión (`ds_fletero_carga` en Pampeana). */
  patente: string
  nrodoc: number | string | null
  bultos: number
  cliente: string | null
}

export interface OtPiramide {
  id: string
  numeroOt: string | null
  fecha: string
  ym: string
  dominio: string
  tipo: string
  nivel: NivelPiramide
  /** Por qué es rotura (solo nivel rotura). */
  motivoRotura: "auxilio" | "parada" | "rechazo" | null
  sistema: MantenimientoSistema
  sistemaSugerido: boolean
  taller: string
  interna: boolean
  descripcion: string
  costo: number
  diasParado: number
  horasTaller: number | null
  /** Hubo un defecto de checklist/CIL de la unidad en los DIAS_AVISO previos. */
  conAviso: boolean
  rechazos: number
}

export interface EventoRechazo {
  fecha: string
  patente: string
  docs: number
  bultos: number
  clientes: string[]
  otId: string | null
  otNumero: string | null
}

export interface ConteoNiveles {
  preventivo: number
  deteccion: number
  correctivo: number
  rotura: number
  costoPreventivo: number
  costoCorrectivo: number
  costoRotura: number
  diasParado: number
}

export interface MesPiramide extends ConteoNiveles {
  ym: string
  /** Preventivo ÷ (correctivo + rotura); null sin fallas. */
  ratioPrevCorr: number | null
  pctPreventivoCant: number | null
}

export interface FilaApertura extends ConteoNiveles {
  clave: string
  label: string
  costoTotal: number
  /** % de las fallas (correctivo + rotura) del período. */
  pctFallas: number
  pctAcumFallas: number
  ots: OtPiramide[]
}

export interface FilaTaller {
  taller: string
  interna: boolean
  ots: number
  correctivas: number
  roturas: number
  costo: number
  diasParadoProm: number | null
  horasTallerProm: number | null
  conHoras: number
  /** Correctivas de este taller que volvieron (misma unidad + sistema) en ≤ 90 días. */
  retrabajos: number
  pctRetrabajo: number | null
  retrabajoOts: Array<{ origen: OtPiramide; vuelta: OtPiramide }>
}

export interface BalancePiramide {
  balanceada: boolean
  /** Escalones donde el de arriba es más ancho que el de abajo. */
  inversiones: Array<{ abajo: NivelPiramide; arriba: NivelPiramide; nAbajo: number; nArriba: number }>
}

export interface KpisPiramide {
  pctPreventivoCant: number | null
  pctPreventivoCosto: number | null
  /** Días-unidad entre fallas (correctivo + rotura). */
  mtbfDias: number | null
  /** Horas promedio de taller de las fallas con entrada y salida cargadas. */
  mttrHoras: number | null
  /** Mediana: el promedio lo arrastran las paradas largas (OJA403 47 d, TOYOTA3 149 d). */
  mttrMedianaHoras: number | null
  mttrN: number
  roturasPorMes: number
  pctConAviso: number | null
  fallas: number
}

export interface PiramideFlota {
  desde: string
  hasta: string
  unidades: number
  niveles: ConteoNiveles
  detalleDeteccion: { checklist: number; criticos: number; cil: number }
  detalleRotura: { auxilio: number; parada: number; rechazo: number }
  balance: BalancePiramide
  kpis: KpisPiramide
  porMes: MesPiramide[]
  porUnidad: FilaApertura[]
  porSistema: FilaApertura[]
  talleres: FilaTaller[]
  ots: OtPiramide[]
  rechazosConOt: EventoRechazo[]
  rechazosSinOt: EventoRechazo[]
}

// ───────────────────────── helpers ─────────────────────────

function diasEntre(a: string, b: string): number {
  return Math.round(
    (Date.parse(b.slice(0, 10) + "T12:00:00Z") - Date.parse(a.slice(0, 10) + "T12:00:00Z")) / DIA
  )
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const v = [...xs].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function normPatente(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  let y = Number(desde.slice(0, 4))
  let m = Number(desde.slice(5, 7))
  const yh = Number(hasta.slice(0, 4))
  const mh = Number(hasta.slice(5, 7))
  while (y < yh || (y === yh && m <= mh)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

function conteoVacio(): ConteoNiveles {
  return {
    preventivo: 0,
    deteccion: 0,
    correctivo: 0,
    rotura: 0,
    costoPreventivo: 0,
    costoCorrectivo: 0,
    costoRotura: 0,
    diasParado: 0,
  }
}

function sumarOt(c: ConteoNiveles, o: OtPiramide) {
  if (o.nivel === "preventivo") {
    c.preventivo++
    c.costoPreventivo += o.costo
  } else if (o.nivel === "correctivo") {
    c.correctivo++
    c.costoCorrectivo += o.costo
    c.diasParado += o.diasParado
  } else if (o.nivel === "rotura") {
    c.rotura++
    c.costoRotura += o.costo
    c.diasParado += o.diasParado
  }
}

/** Sistema de un defecto de checklist, para cruzarlo con las OT. */
export function sistemaDeDefecto(d: Pick<DefectoChecklistIn, "item" | "categoria">): MantenimientoSistema {
  return sugerirSistema([d.item, d.categoria])?.sistema ?? "otro"
}

export function calcularBalance(n: Pick<ConteoNiveles, NivelPiramide>): BalancePiramide {
  // Sin detección registrada (el checklist digital arrancó en abril de 2026) el
  // escalón no existe para ese período: se compara el preventivo directo con el
  // correctivo, en vez de declarar invertida una pirámide por falta de dato.
  const orden: NivelPiramide[] =
    n.deteccion > 0 ? ["preventivo", "deteccion", "correctivo", "rotura"] : ["preventivo", "correctivo", "rotura"]
  const inversiones: BalancePiramide["inversiones"] = []
  for (let i = 0; i < orden.length - 1; i++) {
    const abajo = orden[i]
    const arriba = orden[i + 1]
    if (n[arriba] > n[abajo]) inversiones.push({ abajo, arriba, nAbajo: n[abajo], nArriba: n[arriba] })
  }
  return { balanceada: inversiones.length === 0, inversiones }
}

function apertura(
  ots: OtPiramide[],
  deteccion: Array<{ clave: string }>,
  clave: (o: OtPiramide) => string,
  label: (k: string) => string
): FilaApertura[] {
  const filas = new Map<string, FilaApertura>()
  const fila = (k: string) => {
    let f = filas.get(k)
    if (!f) {
      f = { ...conteoVacio(), clave: k, label: label(k), costoTotal: 0, pctFallas: 0, pctAcumFallas: 0, ots: [] }
      filas.set(k, f)
    }
    return f
  }
  for (const o of ots) {
    const f = fila(clave(o))
    sumarOt(f, o)
    f.ots.push(o)
  }
  for (const d of deteccion) fila(d.clave).deteccion++
  const totalFallas = ots.filter((o) => o.nivel === "correctivo" || o.nivel === "rotura").length || 1
  const out = [...filas.values()]
  for (const f of out) {
    f.costoTotal = f.costoPreventivo + f.costoCorrectivo + f.costoRotura
    f.pctFallas = ((f.correctivo + f.rotura) / totalFallas) * 100
    f.ots.sort((a, b) => b.fecha.localeCompare(a.fecha))
  }
  // Pareto por fallas (correctivo + rotura): así el % acumulado sube parejo.
  // A igual cantidad, primero lo que más rompe y después lo que más cuesta.
  out.sort(
    (a, b) =>
      b.correctivo + b.rotura - (a.correctivo + a.rotura) ||
      b.rotura - a.rotura ||
      b.costoCorrectivo + b.costoRotura - (a.costoCorrectivo + a.costoRotura) ||
      b.preventivo - a.preventivo
  )
  let acum = 0
  for (const f of out) {
    acum += f.pctFallas
    f.pctAcumFallas = acum
  }
  return out
}

// ───────────────────────── principal ─────────────────────────

export function construirPiramide(params: {
  mantenimientos: MantenimientoRealizado[]
  defectos: DefectoChecklistIn[]
  cil: CilIn[]
  rechazosRotura: RechazoRoturaIn[]
  /** Dominios activos de la flota (denominador del MTBF). */
  dominiosActivos: string[]
  desde: string
  hasta: string
}): PiramideFlota {
  const { desde, hasta } = params
  const enRango = (f: string | null | undefined) => !!f && f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta

  // Detección: un foco = primer reporte (las repeticiones no suman).
  const defectos = params.defectos.filter((d) => enRango(d.fecha) && !d.repeticionDe)
  const cilHallazgos = params.cil.filter((c) => c.hallazgo && enRango(c.fecha))
  const deteccionEventos = [
    ...defectos.map((d) => ({
      fecha: d.fecha.slice(0, 10),
      dominio: d.dominio,
      sistema: sistemaDeDefecto(d),
    })),
    ...cilHallazgos.map((c) => ({
      fecha: c.fecha.slice(0, 10),
      dominio: c.dominio,
      sistema: "refrigeracion_fluidos" as MantenimientoSistema,
    })),
  ]
  // Para el «aviso previo» se miran también los defectos de antes del rango.
  const avisosPorUnidad = new Map<string, string[]>()
  for (const d of params.defectos) {
    const arr = avisosPorUnidad.get(d.dominio) ?? []
    arr.push(d.fecha.slice(0, 10))
    avisosPorUnidad.set(d.dominio, arr)
  }
  for (const c of params.cil) {
    if (!c.hallazgo) continue
    const arr = avisosPorUnidad.get(c.dominio) ?? []
    arr.push(c.fecha.slice(0, 10))
    avisosPorUnidad.set(c.dominio, arr)
  }

  // OT del rango (sin canceladas).
  const otsRango = params.mantenimientos.filter((m) => m.estado !== "cancelado" && enRango(m.fecha))
  const correctivasRango = otsRango.filter((m) => m.tipo === "correctivo")

  // Rechazos por rotura → eventos (fecha × patente) → validación contra OT.
  const eventosMap = new Map<string, EventoRechazo>()
  for (const r of params.rechazosRotura) {
    if (!enRango(r.fecha)) continue
    const patente = normPatente(r.patente)
    const k = `${r.fecha.slice(0, 10)}|${patente}`
    const e = eventosMap.get(k) ?? {
      fecha: r.fecha.slice(0, 10),
      patente,
      docs: 0,
      bultos: 0,
      clientes: [],
      otId: null,
      otNumero: null,
    }
    e.docs++
    e.bultos += Number(r.bultos || 0)
    if (r.cliente && !e.clientes.includes(r.cliente)) e.clientes.push(r.cliente)
    eventosMap.set(k, e)
  }
  const rechazosPorOt = new Map<string, number>()
  for (const e of eventosMap.values()) {
    let mejor: MantenimientoRealizado | null = null
    let mejorD = Infinity
    for (const m of correctivasRango) {
      if (normPatente(m.dominio) !== e.patente) continue
      const d = Math.abs(diasEntre(m.fecha, e.fecha))
      if (d <= DIAS_VALIDACION_RECHAZO && d < mejorD) {
        mejor = m
        mejorD = d
      }
    }
    if (mejor) {
      e.otId = mejor.id
      e.otNumero = mejor.numero_ot ?? null
      rechazosPorOt.set(mejor.id, (rechazosPorOt.get(mejor.id) ?? 0) + 1)
    }
  }
  const eventos = [...eventosMap.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))

  // OT → nivel.
  const ots: OtPiramide[] = otsRango.map((m) => {
    const { sistema, sugerido } = sistemaDeOt(m)
    const interna = esOtInterna(m)
    const rechazos = rechazosPorOt.get(m.id) ?? 0
    let nivel: NivelPiramide
    let motivoRotura: OtPiramide["motivoRotura"] = null
    if (m.tipo !== "correctivo") nivel = "preventivo"
    else if (esRotura(m, hasta)) {
      nivel = "rotura"
      motivoRotura = m.auxilio_ruta ? "auxilio" : "parada"
    } else if (rechazos > 0) {
      nivel = "rotura"
      motivoRotura = "rechazo"
    } else nivel = "correctivo"
    const fecha = m.fecha.slice(0, 10)
    const avisos = avisosPorUnidad.get(m.dominio) ?? []
    const conAviso =
      m.tipo === "correctivo" &&
      avisos.some((f) => {
        const d = diasEntre(f, fecha)
        return d >= 0 && d <= DIAS_AVISO
      })
    return {
      id: m.id,
      numeroOt: m.numero_ot ?? null,
      fecha,
      ym: fecha.slice(0, 7),
      dominio: m.dominio,
      tipo: m.tipo,
      nivel,
      motivoRotura,
      sistema,
      sistemaSugerido: sugerido,
      taller: interna ? "Depósito (interno)" : (m.taller ?? "").trim() || "(sin taller)",
      interna,
      descripcion: descripcionDeOt(m),
      costo: costoTotalOt(m),
      diasParado: m.tipo === "correctivo" ? (diasFueraServicio(m, hasta) ?? 0) : 0,
      horasTaller:
        m.entrada_taller && m.salida_taller
          ? Math.max(0, (Date.parse(m.salida_taller) - Date.parse(m.entrada_taller)) / 3_600_000)
          : null,
      conAviso,
      rechazos,
    }
  })
  ots.sort((a, b) => b.fecha.localeCompare(a.fecha))

  // Totales.
  const niveles = conteoVacio()
  for (const o of ots) sumarOt(niveles, o)
  niveles.deteccion = deteccionEventos.length

  const fallas = ots.filter((o) => o.nivel === "correctivo" || o.nivel === "rotura")
  const totalOt = ots.length
  const costoTotal = niveles.costoPreventivo + niveles.costoCorrectivo + niveles.costoRotura
  const unidades = new Set(params.dominiosActivos.map(normPatente)).size
  const diasPeriodo = Math.max(1, diasEntre(desde, hasta) + 1)
  const conHoras = fallas.filter((o) => o.horasTaller != null)
  const meses = mesesEntre(desde, hasta)

  const kpis: KpisPiramide = {
    pctPreventivoCant: totalOt > 0 ? (niveles.preventivo / totalOt) * 100 : null,
    pctPreventivoCosto: costoTotal > 0 ? (niveles.costoPreventivo / costoTotal) * 100 : null,
    mtbfDias: fallas.length > 0 && unidades > 0 ? (unidades * diasPeriodo) / fallas.length : null,
    mttrHoras: conHoras.length > 0 ? conHoras.reduce((a, o) => a + (o.horasTaller ?? 0), 0) / conHoras.length : null,
    mttrMedianaHoras: mediana(conHoras.map((o) => o.horasTaller ?? 0)),
    mttrN: conHoras.length,
    roturasPorMes: meses.length > 0 ? niveles.rotura / meses.length : 0,
    pctConAviso: fallas.length > 0 ? (fallas.filter((o) => o.conAviso).length / fallas.length) * 100 : null,
    fallas: fallas.length,
  }

  // Serie mensual.
  const porMesMap = new Map<string, MesPiramide>(
    meses.map((ym) => [ym, { ...conteoVacio(), ym, ratioPrevCorr: null, pctPreventivoCant: null }])
  )
  for (const o of ots) {
    const f = porMesMap.get(o.ym)
    if (f) sumarOt(f, o)
  }
  for (const d of deteccionEventos) {
    const f = porMesMap.get(d.fecha.slice(0, 7))
    if (f) f.deteccion++
  }
  const porMes = [...porMesMap.values()]
  for (const f of porMes) {
    const fl = f.correctivo + f.rotura
    f.ratioPrevCorr = fl > 0 ? f.preventivo / fl : null
    const tot = f.preventivo + fl
    f.pctPreventivoCant = tot > 0 ? (f.preventivo / tot) * 100 : null
  }

  // Aperturas.
  const porUnidad = apertura(
    ots,
    deteccionEventos.map((d) => ({ clave: d.dominio })),
    (o) => o.dominio,
    (k) => k
  )
  const porSistema = apertura(
    ots,
    deteccionEventos.map((d) => ({ clave: d.sistema })),
    (o) => o.sistema,
    (k) => labelSistema(k as MantenimientoSistema)
  )

  // Talleres: desempeño contra lo que se le pide en un ANS.
  const correctivasOrden = ots.filter((o) => o.tipo === "correctivo").sort((a, b) => a.fecha.localeCompare(b.fecha))
  const talleresMap = new Map<string, FilaTaller>()
  for (const o of ots) {
    const t = talleresMap.get(o.taller) ?? {
      taller: o.taller,
      interna: o.interna,
      ots: 0,
      correctivas: 0,
      roturas: 0,
      costo: 0,
      diasParadoProm: null,
      horasTallerProm: null,
      conHoras: 0,
      retrabajos: 0,
      pctRetrabajo: null,
      retrabajoOts: [],
    }
    t.ots++
    t.costo += o.costo
    if (o.tipo === "correctivo") t.correctivas++
    if (o.nivel === "rotura") t.roturas++
    talleresMap.set(o.taller, t)
  }
  for (const t of talleresMap.values()) {
    const corr = correctivasOrden.filter((o) => o.taller === t.taller)
    t.diasParadoProm = corr.length > 0 ? corr.reduce((a, o) => a + o.diasParado, 0) / corr.length : null
    const ch = corr.filter((o) => o.horasTaller != null)
    t.conHoras = ch.length
    t.horasTallerProm = ch.length > 0 ? ch.reduce((a, o) => a + (o.horasTaller ?? 0), 0) / ch.length : null
    for (const o of corr) {
      const vuelta = correctivasOrden.find(
        (v) =>
          v.id !== o.id &&
          v.dominio === o.dominio &&
          v.sistema === o.sistema &&
          v.sistema !== "otro" &&
          diasEntre(o.fecha, v.fecha) > 0 &&
          diasEntre(o.fecha, v.fecha) <= DIAS_RETRABAJO
      )
      if (vuelta) {
        t.retrabajos++
        t.retrabajoOts.push({ origen: o, vuelta })
      }
    }
    t.pctRetrabajo = corr.length > 0 ? (t.retrabajos / corr.length) * 100 : null
  }
  const talleres = [...talleresMap.values()].sort((a, b) => b.correctivas - a.correctivas || b.ots - a.ots)

  const roturas = ots.filter((o) => o.nivel === "rotura")
  return {
    desde,
    hasta,
    unidades,
    niveles,
    detalleDeteccion: {
      checklist: defectos.length,
      criticos: defectos.filter((d) => d.critico).length,
      cil: cilHallazgos.length,
    },
    detalleRotura: {
      auxilio: roturas.filter((o) => o.motivoRotura === "auxilio").length,
      parada: roturas.filter((o) => o.motivoRotura === "parada").length,
      rechazo: roturas.filter((o) => o.motivoRotura === "rechazo").length,
    },
    balance: calcularBalance(niveles),
    kpis,
    porMes,
    porUnidad,
    porSistema,
    talleres,
    ots,
    rechazosConOt: eventos.filter((e) => e.otId),
    rechazosSinOt: eventos.filter((e) => !e.otId),
  }
}
