// Tipos y helpers PUROS del Cuadro Mensual de Indicadores por Pilar (Pampeana).
// Sin "use server": se importa tanto desde la server action (que lo computa)
// como desde el client (que lo renderiza/exporta). El cálculo real contra las
// fuentes (Supabase, deposito-esteban, foxtrot, etc.) vive en
// src/actions/cuadro-mensual.ts.

export type Pilar = "Seguridad" | "Entrega" | "Ventas" | "Venta mostrador" | "Flota" | "Almacén" | "Personas" | "Costo Logístico"

/** Polaridad del indicador para el semáforo. "sin" = informativo, sin color. */
export type MejorSi = "mayor" | "menor" | "sin"

/** Cómo se resume la columna final (acumulado del año / promedio). */
export type AgregacionResumen = "suma" | "promedio" | "ultimo"

export interface IndicadorDef {
  id: string
  pilar: Pilar
  nombre: string
  unidad: string
  /** Meta por defecto (puede sobreescribirse por mes, ej. WQI target dinámico). */
  meta: number | null
  mejor_si: MejorSi
  /** Cómo se calcula la columna "Resumen" a partir de los meses con dato. */
  resumen: AgregacionResumen
  /** Nota al pie / tooltip aclaratorio. */
  nota?: string
}

// Los indicadores definidos con el usuario (3-5 por pilar). El orden acá es
// el orden de filas del cuadro.
export const INDICADORES: IndicadorDef[] = [
  // ── Seguridad ──
  { id: "lti", pilar: "Seguridad", nombre: "LTI", unidad: "casos", meta: 0, mejor_si: "menor", resumen: "suma", nota: "Accidentes con tiempo perdido (Lost Time Injuries) registrados en el mes." },
  { id: "tri", pilar: "Seguridad", nombre: "TRI", unidad: "casos", meta: 0, mejor_si: "menor", resumen: "suma", nota: "Total de lesiones registrables del mes (LTI + MDI + MTI)." },
  { id: "dias_sin_acc", pilar: "Seguridad", nombre: "Días sin accidentes", unidad: "días", meta: null, mejor_si: "mayor", resumen: "ultimo", nota: "Días al cierre del mes desde el último accidente con tiempo perdido (LTI)." },

  // ── Entrega ──
  { id: "bultos_vendidos", pilar: "Entrega", nombre: "Bultos distribuidos", unidad: "bultos", meta: null, mejor_si: "sin", resumen: "suma", nota: "Cantidad total de bultos facturados del mes (ventas_diarias)." },
  { id: "hl_vendidos", pilar: "Entrega", nombre: "HL distribuidos", unidad: "HL", meta: null, mejor_si: "sin", resumen: "suma", nota: "Volumen total distribuido del mes en hectolitros (ventas_diarias)." },
  { id: "ceq_vendidas", pilar: "Entrega", nombre: "CEq distribuidas", unidad: "CEq", meta: null, mejor_si: "sin", resumen: "suma", nota: "Cajas equivalentes distribuidas del mes (bultos × factor CEq = 120/bultos_pallet). Misma base que Bultos distribuidos." },
  { id: "viajes_mes", pilar: "Entrega", nombre: "Camiones a la calle", unidad: "viajes", meta: null, mejor_si: "sin", resumen: "suma", nota: "Cantidad de viajes del mes: suma de los camiones que salieron a reparto cada día (rutas Foxtrot). Un camión con viaje en un día cuenta 1." },
  { id: "hl_rechazados", pilar: "Entrega", nombre: "HL rechazados", unidad: "HL", meta: null, mejor_si: "sin", resumen: "suma", nota: "Volumen total rechazado del mes en hectolitros (misma base que el % Rechazo)." },
  { id: "rechazo", pilar: "Entrega", nombre: "% Rechazo", unidad: "%", meta: 1.7, mejor_si: "menor", resumen: "promedio", nota: "HL rechazados / HL distribuidos del mes. Meta ≤ 1,7%." },
  { id: "sla", pilar: "Entrega", nombre: "Cumplimiento SLA", unidad: "%", meta: 95, mejor_si: "mayor", resumen: "promedio", nota: "Días cumplidos / días medibles del mes, agregando todos los SLA operativos." },
  { id: "fte_prom", pilar: "Entrega", nombre: "FTE promedio", unidad: "personas", meta: null, mejor_si: "sin", resumen: "promedio", nota: "Personas por camión que sale a reparto: chofer + ayudantes, promediado sobre los egresos del mes (registros_vehiculos, la misma base del TML)." },

  // ── Ventas (total facturado en Chess, el sistema madre, NETO) ──
  { id: "facturado_chess_bultos", pilar: "Ventas", nombre: "Bultos vendidos", unidad: "bultos", meta: null, mejor_si: "sin", resumen: "suma", nota: "Total facturado en Chess (sistema madre), neto: Factura + Factura Presupuesto − Notas de Crédito − Devoluciones Presupuesto. No incluye Gestión." },
  { id: "facturado_chess_hl", pilar: "Ventas", nombre: "HL vendidos", unidad: "HL", meta: null, mejor_si: "sin", resumen: "suma", nota: "Hectolitros netos facturados en Chess: Factura + Factura Presupuesto − Notas de Crédito − Devoluciones Presupuesto. No incluye Gestión." },
  { id: "facturado_chess_ceq", pilar: "Ventas", nombre: "CEq vendidas", unidad: "CEq", meta: null, mejor_si: "sin", resumen: "suma", nota: "Cajas equivalentes netas facturadas en Chess (bultos × factor CEq = 120/bultos_pallet): Factura + Factura Presupuesto − Notas de Crédito − Devoluciones Presupuesto. No incluye Gestión." },

  // ── Venta mostrador (diferencia Vendidos − Distribuidos) ──
  { id: "mostrador_bultos", pilar: "Venta mostrador", nombre: "Bultos mostrador", unidad: "bultos", meta: null, mejor_si: "sin", resumen: "suma", nota: "Bultos vendidos (facturado Chess neto) − Bultos distribuidos: lo facturado que no salió en camión de reparto." },
  { id: "mostrador_hl", pilar: "Venta mostrador", nombre: "HL mostrador", unidad: "HL", meta: null, mejor_si: "sin", resumen: "suma", nota: "HL vendidos (facturado Chess neto) − HL distribuidos." },
  { id: "mostrador_ceq", pilar: "Venta mostrador", nombre: "CEq mostrador", unidad: "CEq", meta: null, mejor_si: "sin", resumen: "suma", nota: "CEq vendidas (facturado Chess neto) − CEq distribuidas." },

  // ── Flota ──
  { id: "tiempo_ruta", pilar: "Flota", nombre: "Tiempo prom. en ruta", unidad: "hs", meta: null, mejor_si: "sin", resumen: "promedio", nota: "Promedio de duración puerta a puerta de las rutas finalizadas (Foxtrot)." },
  { id: "horas_ruta", pilar: "Flota", nombre: "Horas en ruta", unidad: "hs", meta: null, mejor_si: "sin", resumen: "suma", nota: "Total de horas en la calle del mes: suma de la duración puerta a puerta de las rutas finalizadas (Foxtrot). Misma base que el tiempo promedio." },
  { id: "camiones_dia", pilar: "Flota", nombre: "Camiones por día", unidad: "u.", meta: null, mejor_si: "sin", resumen: "promedio", nota: "Promedio de rutas/camiones que salieron a reparto por día con actividad." },
  { id: "mantenimiento", pilar: "Flota", nombre: "% Cumpl. mantenimiento", unidad: "%", meta: 90, mejor_si: "mayor", resumen: "ultimo", nota: "Sin histórico mensual disponible aún: sólo se puede ver el estado actual del plan." },

  // ── Almacén ──
  { id: "wqi", pilar: "Almacén", nombre: "WQI (calidad)", unidad: "PPM", meta: null, mejor_si: "menor", resumen: "ultimo", nota: "Pérdidas en partes por millón (acumulado del mes). Meta = target dinámico del presupuesto." },
  { id: "productividad", pilar: "Almacén", nombre: "Productividad de picking", unidad: "HL/HH", meta: null, mejor_si: "mayor", resumen: "promedio", nota: "Hectolitros pickeados por hora-hombre (promedio diario del mes)." },
  { id: "precision", pilar: "Almacén", nombre: "Precisión de picking", unidad: "%", meta: 99, mejor_si: "mayor", resumen: "promedio", nota: "% de bultos pickeados sin error (promedio diario del mes). Meta ≥ 99%." },

  // ── Costo Logístico (tabla costo_logistico_mensual, la misma que carga
  // el panel de Costo por Punto de Venta / Clusterización) ──
  { id: "costo_distribucion", pilar: "Costo Logístico", nombre: "Costo Distribución", unidad: "$", meta: null, mejor_si: "sin", resumen: "suma", nota: "Costo de distribución del mes, cargado por los admins en Planeamiento → Costo por Punto de Venta. Meses sin carga quedan sin dato." },
  { id: "costo_almacen", pilar: "Costo Logístico", nombre: "Costo Almacén", unidad: "$", meta: null, mejor_si: "sin", resumen: "suma", nota: "Costo de almacén del mes, cargado por los admins en Planeamiento → Costo por Punto de Venta. Meses sin carga quedan sin dato." },
]

// "Personas" ya no tiene indicadores propios: el FTE pasó a Entrega (personas
// por camión) en lugar del FTE de nómina que salía del biométrico.
export const PILARES_ORDEN: Pilar[] = ["Seguridad", "Entrega", "Ventas", "Venta mostrador", "Flota", "Almacén", "Costo Logístico"]

/** Color del pilar para los encabezados de grupo (tailwind-ish, inline). */
export const PILAR_COLOR: Record<Pilar, string> = {
  Seguridad: "#dc2626", // rojo
  Entrega: "#2563eb", // azul
  Ventas: "#16a34a", // verde
  "Venta mostrador": "#d97706", // ámbar
  Flota: "#7c3aed", // violeta
  Almacén: "#0891b2", // cyan
  Personas: "#db2777", // rosa
  "Costo Logístico": "#92400e", // marrón
}

export interface CeldaMes {
  /** "YYYY-MM" */
  mes: string
  valor: number | null
  /** Meta efectiva del mes (puede diferir del default, ej. WQI). undefined = usar def.meta. */
  meta?: number | null
  /** Mes en curso con dato incompleto. */
  parcial?: boolean
}

export interface FilaIndicador {
  def: IndicadorDef
  /** mesKey ("YYYY-MM") -> celda. */
  celdas: Record<string, CeldaMes>
  /** Columna resumen (acumulado o promedio del año según def.resumen). */
  resumen: number | null
}

export interface CuadroMensual {
  /** Meses del cuadro, de enero al mes actual: ["2026-01", ...]. */
  meses: string[]
  /** "YYYY-MM" del mes en curso. */
  mesActual: string
  filas: FilaIndicador[]
  /** ISO timestamp de generación (lo setea la action). */
  generadoEn: string
}

// ── Helpers de fechas ──

const NOMBRES_MES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

/** "2026-03" -> "Mar 26". */
export function nombreMes(mesKey: string): string {
  const [a, m] = mesKey.split("-")
  const idx = Number(m) - 1
  return `${NOMBRES_MES[idx] ?? m} ${a.slice(2)}`
}

/** Lista de meses "YYYY-MM" desde `desde` hasta `hasta` inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  let [a, m] = desde.split("-").map(Number)
  const [ah, mh] = hasta.split("-").map(Number)
  while (a < ah || (a === ah && m <= mh)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return out
}

/** Todas las fechas "YYYY-MM-DD" de un mes "YYYY-MM". */
export function diasDelMes(mesKey: string): string[] {
  const [a, m] = mesKey.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const out: string[] = []
  for (let d = 1; d <= ultimo; d++) {
    out.push(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
  }
  return out
}

/** Mes actual en hora Argentina (UTC-3), como "YYYY-MM". */
export function mesActualARG(): string {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return `${arg.getUTCFullYear()}-${String(arg.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Fecha de hoy en hora Argentina como "YYYY-MM-DD". */
export function hoyARG(): string {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return `${arg.getUTCFullYear()}-${String(arg.getUTCMonth() + 1).padStart(2, "0")}-${String(arg.getUTCDate()).padStart(2, "0")}`
}

// ── Semáforo y formato ──

/** Clases tailwind para una celda según valor vs meta y polaridad. */
export function colorCelda(
  valor: number | null,
  meta: number | null | undefined,
  mejorSi: MejorSi,
): string {
  if (valor === null || valor === undefined) return "bg-slate-50 text-slate-300"
  if (mejorSi === "sin" || meta === null || meta === undefined) {
    return "text-slate-700"
  }
  const cumple = mejorSi === "mayor" ? valor >= meta : valor <= meta
  return cumple
    ? "bg-emerald-50 text-emerald-700"
    : "bg-red-50 text-red-700"
}

/** Formatea un valor para mostrar/exportar, según unidad. "—" si es null. */
export function formatValor(valor: number | null, unidad: string): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—"
  switch (unidad) {
    case "%":
      return `${valor.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    case "$":
      return `$ ${valor.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
    case "HL":
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    case "bultos":
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    case "CEq":
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    case "PPM":
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    case "hs":
      return valor.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case "HL/HH":
      return valor.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case "FTE":
      return valor.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    // Tripulación por camión: 2 decimales, porque el rango útil es angosto
    // (2,2–2,7) y con uno solo se pierden los movimientos de dotación.
    case "personas":
      return valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case "u.":
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })
    case "casos":
    case "días":
    case "viajes":
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    default:
      return valor.toLocaleString("es-AR", { maximumFractionDigits: 2 })
  }
}

/** Resume una serie de celdas en el valor de la columna "Resumen". */
export function resumirFila(
  celdas: Record<string, CeldaMes>,
  agregacion: AgregacionResumen,
): number | null {
  const vals = Object.values(celdas)
    .map((c) => c.valor)
    .filter((v): v is number => v !== null && Number.isFinite(v))
  if (vals.length === 0) return null
  switch (agregacion) {
    case "suma":
      return vals.reduce((a, b) => a + b, 0)
    case "promedio":
      return vals.reduce((a, b) => a + b, 0) / vals.length
    case "ultimo":
      return vals[vals.length - 1]
  }
}
