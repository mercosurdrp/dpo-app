// Cumplimiento mensual de los ANS con proveedores de flota
// (DPO Flota 2.3 · R2.3.1a «política de repuestos del tercero» y R2.3.2a «KPI de
// puntualidad del proveedor»; se revisa en la reunión semanal, R3.1.4).
//
// Los 7 acuerdos (firmados 6 el 06/11/2026) fijan los mismos indicadores por
// tipo de proveedor (cláusula 5) y la misma regla de seguimiento (cláusula 6):
//   · si un indicador del mes NO llega al 100 % → plan de acción por escrito
//     dentro de los 7 días;
//   · si queda por debajo de la META 3 meses seguidos → se revisa el acuerdo.
// Por eso cada indicador tiene dos umbrales: la meta (verde/rojo) y el 100 %
// (a partir del cual hace falta plan aunque se cumpla la meta).
//
// Función pura: la usan la action (`getCumplimientoAns`) y el smoke.

import type { MantenimientoRealizado } from "@/types/database"
import { esOtInterna } from "./correctivo-analisis"
import { sistemaDeOt } from "./recurrencia-correctivos"

export type AnsTipo = "taller" | "carroceria" | "repuestos" | "matafuegos"

export const ANS_TIPO_LABEL: Record<AnsTipo, string> = {
  taller: "Taller mecánico",
  carroceria: "Carrocería",
  repuestos: "Repuestos",
  matafuegos: "Matafuegos",
}

export type AnsIndicadorKey =
  | "puntualidad_ot"
  | "retrabajos"
  | "detalle_ot"
  | "puntualidad_pedidos"
  | "pedidos_completos"
  | "criticos_disponibles"
  | "matafuegos_vigentes"
  | "recargas_puntuales"

export interface AnsIndicadorDef {
  key: AnsIndicadorKey
  nombre: string
  calculo: string
  meta: number
  /** "max": el indicador es malo cuando SUBE (retrabajos). */
  sentido: "min" | "max"
}

const DEFS: Record<AnsIndicadorKey, AnsIndicadorDef> = {
  puntualidad_ot: {
    key: "puntualidad_ot",
    nombre: "Puntualidad de entrega de unidades",
    calculo: "OT terminadas en o antes de la fecha/hora comprometida ÷ OT con fecha comprometida del mes",
    meta: 95,
    sentido: "min",
  },
  retrabajos: {
    key: "retrabajos",
    nombre: "Retrabajos",
    calculo:
      "OT correctivas del mes que vuelven por el mismo sistema de la misma unidad dentro de los 90 días de garantía ÷ OT del mes",
    meta: 2,
    sentido: "max",
  },
  detalle_ot: {
    key: "detalle_ot",
    nombre: "OT con detalle completo",
    calculo: "OT con mano de obra y repuestos detallados ÷ OT del mes",
    meta: 100,
    sentido: "min",
  },
  puntualidad_pedidos: {
    key: "puntualidad_pedidos",
    nombre: "Puntualidad de llegada de repuestos",
    calculo: "Pedidos entregados en o antes de la fecha comprometida ÷ pedidos con fecha comprometida del mes",
    meta: 95,
    sentido: "min",
  },
  pedidos_completos: {
    key: "pedidos_completos",
    nombre: "Pedidos completos",
    calculo: "Pedidos entregados completos y correctos ÷ pedidos entregados del mes",
    meta: 98,
    sentido: "min",
  },
  criticos_disponibles: {
    key: "criticos_disponibles",
    nombre: "Disponibilidad de críticos",
    calculo: "Pedidos de piezas del Anexo A disponibles al pedirlas ÷ pedidos de piezas del Anexo A",
    meta: 90,
    sentido: "min",
  },
  matafuegos_vigentes: {
    key: "matafuegos_vigentes",
    nombre: "Equipos vigentes",
    calculo: "Matafuegos activos con carga vigente ÷ matafuegos del padrón",
    meta: 100,
    sentido: "min",
  },
  recargas_puntuales: {
    key: "recargas_puntuales",
    nombre: "Puntualidad de recargas",
    calculo: "Equipos devueltos en ≤ 72 h hábiles ÷ equipos retirados en el mes",
    meta: 95,
    sentido: "min",
  },
}

export const INDICADORES_POR_TIPO: Record<AnsTipo, AnsIndicadorKey[]> = {
  taller: ["puntualidad_ot", "retrabajos", "detalle_ot"],
  carroceria: ["puntualidad_ot", "retrabajos"],
  repuestos: ["puntualidad_pedidos", "pedidos_completos", "criticos_disponibles"],
  matafuegos: ["matafuegos_vigentes", "recargas_puntuales"],
}

export function defIndicador(k: AnsIndicadorKey): AnsIndicadorDef {
  return DEFS[k]
}

/** Garantía de mano de obra de los ANS de taller: 90 días. */
export const DIAS_GARANTIA = 90
/** Plazo de los matafuegos: 72 h hábiles = 3 días hábiles. */
export const DIAS_HABILES_RECARGA = 3
/** Meses seguidos bajo la meta que disparan la revisión del acuerdo. */
export const MESES_REVISION = 3

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface AnsProveedorIn {
  ansId: string
  proveedorId: string
  nombre: string
  tipo: AnsTipo
  fechaFirma: string | null
  fechaVencimiento: string | null
  adjuntoUrl: string | null
  email: string | null
  telefono: string | null
}

export interface PedidoAnsIn {
  id: string
  proveedor: string | null
  fecha: string
  fechaCompra: string | null
  fechaRetiro: string | null
  fechaComprometida: string | null
  entregaCompleta: boolean | null
  esCritico: boolean
  disponibleAlPedir: boolean | null
  estado: string
  descripcion: string | null
}

export interface ExtintorAnsIn {
  id: string
  numero: string
  ubicacion: string
  vencimientoCarga: string | null
}

export interface RecargaAnsIn {
  id: string
  proveedor: string | null
  fechaRetiro: string
  fechaDevolucion: string | null
  cantidad: number
}

export interface PlanAnsIn {
  id: string
  ansId: string
  year: number
  mes: number
  indicador: string
  estado: "abierto" | "cerrado"
}

// ---------------------------------------------------------------------------
// Salidas
// ---------------------------------------------------------------------------

/** verde: ≥ meta y 100 %; ambar: cumple la meta pero hubo fallas (pide plan); rojo: bajo la meta. */
export type AnsSemaforo = "verde" | "ambar" | "rojo" | "sin_dato"

export interface AnsDetalle {
  id: string
  fecha: string
  titulo: string
  detalle: string
  ok: boolean | null
}

export interface AnsResultado {
  key: AnsIndicadorKey
  nombre: string
  calculo: string
  meta: number
  sentido: "min" | "max"
  num: number
  den: number
  /** % (null = sin datos para medir). */
  valor: number | null
  semaforo: AnsSemaforo
  /** El mes no llegó al 100 % (o tuvo algún retrabajo): el acuerdo pide plan. */
  requierePlan: boolean
  /** Por qué no se puede medir o qué falta cargar. */
  nota: string | null
  detalle: AnsDetalle[]
}

export interface AnsMesProveedor {
  ym: string
  resultados: AnsResultado[]
}

export interface AnsProveedorCumplimiento {
  proveedor: AnsProveedorIn
  /** Mes pedido. */
  mes: AnsMesProveedor
  /** Últimos 6 meses (el pedido incluido), del más viejo al más nuevo. */
  historia: AnsMesProveedor[]
  /** Indicadores con MESES_REVISION meses seguidos bajo la meta hasta el mes pedido. */
  revisarAcuerdo: AnsIndicadorKey[]
  /** Indicadores que piden plan este mes y no tienen ninguno cargado. */
  planesFaltantes: AnsIndicadorKey[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normProveedor(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const GENERICAS = new Set(["taller", "gomeria", "repuestos", "sosa", "integral", "servicios"])

/**
 * ¿El texto cargado (taller de la OT, proveedor del pedido) es este proveedor?
 * El ProveedorPicker unifica los nombres, pero hay OT viejas con variantes
 * («Bettiolo», «Luval Jufra»): se acepta el nombre exacto o la primera palabra
 * distintiva del maestro (≥ 4 letras y no genérica).
 */
export function esDelProveedor(texto: string | null | undefined, nombreProveedor: string): boolean {
  const t = normProveedor(texto)
  const n = normProveedor(nombreProveedor)
  if (!t || !n) return false
  if (t === n) return true
  const clave = n.split(" ").find((w) => w.length >= 4 && !GENERICAS.has(w))
  if (!clave) return false
  return t.split(" ").includes(clave)
}

export function ymDe(fecha: string): string {
  return fecha.slice(0, 7)
}

export function ymSumar(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function finDeMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000)
}

/** Suma días hábiles (lunes a sábado: los ANS cuentan el sábado a la mañana). */
export function sumarDiasHabiles(fecha: string, n: number): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`)
  let quedan = n
  while (quedan > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0) quedan--
  }
  return d.toISOString().slice(0, 10)
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y.slice(2)}`
}

function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
  return f.replace(",", "")
}

function resultado(
  key: AnsIndicadorKey,
  num: number,
  den: number,
  detalle: AnsDetalle[],
  nota: string | null
): AnsResultado {
  const def = DEFS[key]
  const valor = den > 0 ? (num / den) * 100 : null
  let semaforo: AnsSemaforo = "sin_dato"
  let requierePlan = false
  if (valor != null) {
    if (def.sentido === "min") {
      const cumpleMeta = valor >= def.meta - 1e-9
      requierePlan = valor < 100 - 1e-9
      semaforo = !cumpleMeta ? "rojo" : requierePlan ? "ambar" : "verde"
    } else {
      const cumpleMeta = valor <= def.meta + 1e-9
      requierePlan = num > 0
      semaforo = !cumpleMeta ? "rojo" : requierePlan ? "ambar" : "verde"
    }
  }
  return { ...def, num, den, valor, semaforo, requierePlan, nota, detalle }
}

/** OT con mano de obra cargada y, si costó más que la mano de obra, con los repuestos detallados. */
export function otConDetalleCompleto(m: MantenimientoRealizado): boolean {
  const mo = Number(m.costo_mano_obra || 0)
  const tareas = (m.tareas ?? []).reduce((a, t) => a + Number(t.costo || 0), 0)
  const manoObra = Math.max(mo, tareas)
  if (!(manoObra > 0)) return false
  const repuestos = (m.repuestos ?? []).filter((r) => (r.descripcion ?? "").trim() !== "")
  if (repuestos.length > 0) return true
  // Sin repuestos: completa sólo si el total es la mano de obra (tolerancia $1).
  return Number(m.costo || 0) <= manoObra + 1
}

/** Las OT programadas (todavía no hechas) y las canceladas no se miden. */
function otCuenta(m: MantenimientoRealizado): boolean {
  return m.estado !== "cancelado" && m.estado !== "programado"
}

function otTitulo(m: MantenimientoRealizado): string {
  return `${m.numero_ot ? `OT ${m.numero_ot}` : "OT s/n"} · ${m.dominio}`
}

// ---------------------------------------------------------------------------
// Cálculo por indicador
// ---------------------------------------------------------------------------

function calcularIndicador(
  key: AnsIndicadorKey,
  ym: string,
  prov: AnsProveedorIn,
  ctx: {
    ots: MantenimientoRealizado[]
    pedidos: PedidoAnsIn[]
    extintores: ExtintorAnsIn[]
    recargas: RecargaAnsIn[]
    hoy: string
    ahoraIso: string
  }
): AnsResultado {
  const otsProv = ctx.ots.filter((m) => !esOtInterna(m) && esDelProveedor(m.taller, prov.nombre))
  const otsMes = otsProv.filter((m) => ymDe(m.fecha) === ym && otCuenta(m))

  switch (key) {
    case "puntualidad_ot": {
      let num = 0
      let den = 0
      let sinCompromiso = 0
      const detalle: AnsDetalle[] = []
      for (const m of otsMes) {
        const comp = m.salida_comprometida ?? null
        if (!comp) {
          sinCompromiso++
          continue
        }
        const salida = m.salida_taller
        if (!salida) {
          // Todavía en taller: cuenta recién cuando vence el compromiso.
          if (comp > ctx.ahoraIso) continue
          den++
          detalle.push({
            id: m.id,
            fecha: m.fecha,
            titulo: otTitulo(m),
            detalle: `Comprometida ${fmtFechaHora(comp)} · sigue en taller`,
            ok: false,
          })
          continue
        }
        den++
        const ok = salida <= comp
        if (ok) num++
        detalle.push({
          id: m.id,
          fecha: m.fecha,
          titulo: otTitulo(m),
          detalle: `Comprometida ${fmtFechaHora(comp)} · entregada ${fmtFechaHora(salida)}`,
          ok,
        })
      }
      const nota =
        sinCompromiso > 0
          ? `${sinCompromiso} de ${otsMes.length} OT del mes sin fecha comprometida: no entran en la medición.`
          : otsMes.length === 0
            ? "Sin OT en el mes."
            : null
      return resultado(key, num, den, detalle, nota)
    }

    case "retrabajos": {
      // Correctivas del proveedor (desde 90 días antes del mes) ordenadas.
      const correctivas = otsProv
        .filter((m) => m.tipo === "correctivo" && otCuenta(m))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
      const detalle: AnsDetalle[] = []
      let num = 0
      for (const v of correctivas) {
        if (ymDe(v.fecha) !== ym) continue
        const sv = sistemaDeOt(v).sistema
        if (sv === "otro") continue
        const origen = [...correctivas]
          .reverse()
          .find(
            (o) =>
              o.id !== v.id &&
              o.dominio === v.dominio &&
              sistemaDeOt(o).sistema === sv &&
              diasEntre(o.fecha, v.fecha) > 0 &&
              diasEntre(o.fecha, v.fecha) <= DIAS_GARANTIA
          )
        if (!origen) continue
        num++
        detalle.push({
          id: v.id,
          fecha: v.fecha,
          titulo: otTitulo(v),
          detalle: `Vuelve por ${sv} · origen ${otTitulo(origen)} del ${fmtFecha(origen.fecha)} (${diasEntre(origen.fecha, v.fecha)} días)`,
          ok: false,
        })
      }
      return resultado(key, num, otsMes.length, detalle, otsMes.length === 0 ? "Sin OT en el mes." : null)
    }

    case "detalle_ot": {
      let num = 0
      const detalle: AnsDetalle[] = []
      for (const m of otsMes) {
        const ok = otConDetalleCompleto(m)
        if (ok) num++
        else
          detalle.push({
            id: m.id,
            fecha: m.fecha,
            titulo: otTitulo(m),
            detalle: !(Number(m.costo_mano_obra || 0) > 0)
              ? "Falta la mano de obra"
              : "Falta el detalle de repuestos",
            ok: false,
          })
      }
      return resultado(key, num, otsMes.length, detalle, otsMes.length === 0 ? "Sin OT en el mes." : null)
    }

    case "puntualidad_pedidos":
    case "pedidos_completos":
    case "criticos_disponibles": {
      const pedidosMes = ctx.pedidos.filter(
        (p) =>
          p.estado !== "anulado" &&
          esDelProveedor(p.proveedor, prov.nombre) &&
          ymDe(p.fechaCompra ?? p.fecha) === ym
      )
      const titulo = (p: PedidoAnsIn) =>
        (p.descripcion ?? "Pedido").replace(/\s+/g, " ").slice(0, 70)
      if (key === "puntualidad_pedidos") {
        let num = 0
        let den = 0
        let sin = 0
        const detalle: AnsDetalle[] = []
        for (const p of pedidosMes) {
          if (!p.fechaComprometida) {
            sin++
            continue
          }
          if (!p.fechaRetiro) {
            if (p.fechaComprometida >= ctx.hoy) continue
            den++
            detalle.push({
              id: p.id,
              fecha: p.fechaCompra ?? p.fecha,
              titulo: titulo(p),
              detalle: `Comprometido ${fmtFecha(p.fechaComprometida)} · todavía no llegó`,
              ok: false,
            })
            continue
          }
          den++
          const ok = p.fechaRetiro <= p.fechaComprometida
          if (ok) num++
          detalle.push({
            id: p.id,
            fecha: p.fechaCompra ?? p.fecha,
            titulo: titulo(p),
            detalle: `Comprometido ${fmtFecha(p.fechaComprometida)} · llegó ${fmtFecha(p.fechaRetiro)}`,
            ok,
          })
        }
        const nota =
          pedidosMes.length === 0
            ? "Sin pedidos en el mes."
            : sin > 0
              ? `${sin} de ${pedidosMes.length} pedidos sin fecha comprometida: no entran en la medición.`
              : null
        return resultado(key, num, den, detalle, nota)
      }
      if (key === "pedidos_completos") {
        const entregados = pedidosMes.filter((p) => p.fechaRetiro && p.entregaCompleta != null)
        const num = entregados.filter((p) => p.entregaCompleta).length
        const detalle = entregados
          .filter((p) => !p.entregaCompleta)
          .map((p) => ({
            id: p.id,
            fecha: p.fechaCompra ?? p.fecha,
            titulo: titulo(p),
            detalle: "Llegó incompleto o equivocado",
            ok: false,
          }))
        return resultado(
          key,
          num,
          entregados.length,
          detalle,
          pedidosMes.length === 0 ? "Sin pedidos en el mes." : null
        )
      }
      const criticos = pedidosMes.filter((p) => p.esCritico && p.disponibleAlPedir != null)
      const num = criticos.filter((p) => p.disponibleAlPedir).length
      const detalle = criticos
        .filter((p) => !p.disponibleAlPedir)
        .map((p) => ({
          id: p.id,
          fecha: p.fechaCompra ?? p.fecha,
          titulo: titulo(p),
          detalle: "Pieza crítica sin stock al pedirla",
          ok: false,
        }))
      return resultado(
        key,
        num,
        criticos.length,
        detalle,
        criticos.length === 0 ? "Sin pedidos de piezas del Anexo A en el mes." : null
      )
    }

    case "matafuegos_vigentes": {
      // Foto al cierre del mes (o a hoy si es el mes en curso).
      const ref = ym === ymDe(ctx.hoy) ? ctx.hoy : finDeMes(ym)
      const detalle: AnsDetalle[] = []
      let num = 0
      for (const e of ctx.extintores) {
        const ok = !!e.vencimientoCarga && e.vencimientoCarga >= ref
        if (ok) num++
        else
          detalle.push({
            id: e.id,
            fecha: e.vencimientoCarga ?? ref,
            titulo: `Matafuego ${e.numero}`,
            detalle: `${e.ubicacion} · ${e.vencimientoCarga ? `carga vencida el ${fmtFecha(e.vencimientoCarga)}` : "sin fecha de carga"}`,
            ok: false,
          })
      }
      return resultado(
        key,
        num,
        ctx.extintores.length,
        detalle,
        `Padrón actual al ${fmtFecha(ref)}${ym !== ymDe(ctx.hoy) ? " (con los vencimientos cargados hoy)" : ""}.`
      )
    }

    case "recargas_puntuales": {
      const delMes = ctx.recargas.filter(
        (r) => ymDe(r.fechaRetiro) === ym && (!r.proveedor || esDelProveedor(r.proveedor, prov.nombre))
      )
      let num = 0
      let den = 0
      const detalle: AnsDetalle[] = []
      for (const r of delMes) {
        const limite = sumarDiasHabiles(r.fechaRetiro, DIAS_HABILES_RECARGA)
        if (!r.fechaDevolucion && limite >= ctx.hoy) continue
        den += r.cantidad
        const ok = !!r.fechaDevolucion && r.fechaDevolucion <= limite
        if (ok) num += r.cantidad
        detalle.push({
          id: r.id,
          fecha: r.fechaRetiro,
          titulo: `${r.cantidad} equipo${r.cantidad === 1 ? "" : "s"} retirado${r.cantidad === 1 ? "" : "s"} el ${fmtFecha(r.fechaRetiro)}`,
          detalle: r.fechaDevolucion
            ? `Devuelto${r.cantidad === 1 ? "" : "s"} el ${fmtFecha(r.fechaDevolucion)} (límite ${fmtFecha(limite)})`
            : `Sin devolver (límite ${fmtFecha(limite)})`,
          ok,
        })
      }
      return resultado(key, num, den, detalle, delMes.length === 0 ? "Sin retiros en el mes." : null)
    }
  }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function calcularCumplimientoAns(params: {
  ym: string
  proveedores: AnsProveedorIn[]
  ots: MantenimientoRealizado[]
  pedidos: PedidoAnsIn[]
  extintores: ExtintorAnsIn[]
  recargas: RecargaAnsIn[]
  planes: PlanAnsIn[]
  hoy: string
  ahoraIso: string
}): AnsProveedorCumplimiento[] {
  const { ym } = params
  const meses = Array.from({ length: 6 }, (_, i) => ymSumar(ym, i - 5))
  return params.proveedores.map((prov) => {
    const keys = INDICADORES_POR_TIPO[prov.tipo]
    const historia = meses.map((m) => ({
      ym: m,
      resultados: keys.map((k) => calcularIndicador(k, m, prov, params)),
    }))
    const mes = historia[historia.length - 1]

    // El acuerdo rige desde la firma: los meses previos son línea de base y no
    // disparan ni la revisión ni el plan obligatorio.
    const vigenteDesde = prov.fechaFirma ? ymDe(prov.fechaFirma) : null
    const rige = (m: string) => vigenteDesde != null && m >= vigenteDesde
    const revisarAcuerdo = keys.filter((k, i) => {
      const ult = historia.slice(-MESES_REVISION)
      return (
        ult.length === MESES_REVISION &&
        ult.every((h) => rige(h.ym) && h.resultados[i].semaforo === "rojo")
      )
    })
    const [y, m] = ym.split("-").map(Number)
    const planesFaltantes = mes.resultados
      .filter((r) => r.requierePlan && rige(ym))
      .filter(
        (r) =>
          !params.planes.some(
            (p) => p.ansId === prov.ansId && p.year === y && p.mes === m && p.indicador === r.key
          )
      )
      .map((r) => r.key)

    return { proveedor: prov, mes, historia, revisarAcuerdo, planesFaltantes }
  })
}

/** Texto del resultado mensual para mandarle al proveedor (cláusula 5: «le envía el resultado»). */
export function textoResumenProveedor(c: AnsProveedorCumplimiento, mesLabel: string): string {
  const lineas = [
    `*Mercosur Región Pampeana · ANS ${ANS_TIPO_LABEL[c.proveedor.tipo].toLowerCase()}*`,
    `Resultado de ${mesLabel} — ${c.proveedor.nombre}`,
    "",
  ]
  for (const r of c.mes.resultados) {
    const v = r.valor == null ? "sin datos" : `${r.valor.toFixed(1).replace(".", ",")} %`
    const meta = `${r.sentido === "min" ? "≥" : "≤"} ${r.meta} %`
    const ic = r.semaforo === "verde" ? "✅" : r.semaforo === "ambar" ? "🟡" : r.semaforo === "rojo" ? "🔴" : "⚪"
    lineas.push(`${ic} ${r.nombre}: ${v} (${r.num}/${r.den}) · meta ${meta}`)
  }
  if (c.mes.resultados.some((r) => r.requierePlan)) {
    lineas.push(
      "",
      "Según la cláusula 6 del acuerdo, los indicadores que no llegaron al 100 % requieren un plan de acción por escrito dentro de los 7 días. Lo vemos en la reunión semanal de flota."
    )
  }
  return lineas.join("\n")
}
