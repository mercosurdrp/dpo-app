// Definición de los PI del tablero de Indicadores de Flota.
//
// El ORDEN de `KPI_DEFS` es el orden de lectura de la pantalla y es fijo: va por
// lo que mueve el score DPO (tier), y dentro de cada tier por tema. Los filtros
// esconden tarjetas, nunca las reordenan: la gente aprende dónde está cada cosa,
// y la urgencia la resuelve el resumen de salud de arriba.

import type { FlotaKpi, FlotaKpiConDetalle } from "@/actions/flota-indicadores"
import { PLAN_COBERTURA_MINIMA } from "@/lib/vehiculos/plan-cumplimiento"
import { fmtMoney } from "./formato"

/** Tier = cuánto pesa el PI en la auditoría. */
export type TierKpi = 1 | 2 | 3

export type TemaKpi =
  | "disponibilidad"
  | "documentacion"
  | "estandares"
  | "checklist"
  | "plan"
  | "correctivo"
  | "repuestos"
  | "costos"
  | "neumaticos"
  | "combustible"
  | "cil"

/**
 * Forma del PI, que decide cómo se dibuja.
 *  - `estado`: porcentaje de foto (vale igual el día 7 que el 30) → línea + regla de meta.
 *  - `tasa`: continuo sin tope (días, km/l) → línea + regla.
 *  - `acumulativo`: se junta a lo largo del mes → columnas desde 0.
 *  - `conteo`: unidades en falta, meta 0 → columnas.
 *  - `sinSerie`: sin historia mensual a propósito.
 */
export type FormaKpi = "estado" | "tasa" | "acumulativo" | "conteo" | "sinSerie"

export interface KpiDef {
  kpi: FlotaKpi
  label: string
  descripcion: string
  /** Formatea el valor para mostrar. */
  fmt: (v: number) => string
  /** true = con serie mensual (tendencia); false = solo foto actual. */
  conSerie: boolean
  /** Punto del pilar Flota de DPO que este PI evidencia (ej. "2.1"). */
  dpo?: string
  /**
   * true = el valor SE ACUMULA a lo largo del mes (tareas hechas, litros
   * quemados, plata gastada, días parados).
   *
   * 🚨 En el mes en curso estos KPI no se comparan contra la meta: el día 7 un
   * acumulativo lleva un cuarto de lo que va a terminar siendo, y eso da un
   * semáforo falso en las DOS direcciones — falso rojo en los de "más es mejor"
   * (el CIL con 8 de 30 tareas) y falso verde en los de "menos es mejor" (el CO2
   * o el costo, que arrancan el mes en cero y cumplen cualquier tope).
   * Los porcentuales de ESTADO (disponibilidad, conformidad) NO son
   * acumulativos: valen igual el día 7 que el 30. Un porcentaje SÍ es
   * acumulativo cuando el numerador se va juntando durante el mes contra un
   * denominador fijo —la medición de neumáticos, que el día 3 da 4 % porque
   * todavía no se midió, no porque la rutina esté incumplida—.
   */
  acumulativo?: boolean
  /**
   * Cómo se llama lo que cuenta el denominador ("OT", "plan"). Si está, la
   * tarjeta muestra el `n` al lado del valor: "0 % (0 de 1 OT)".
   *
   * 🚨 Un porcentaje sobre 1 o 2 casos parece una medición y no lo es. Que el
   * lector vea el tamaño de la muestra sin tener que ir a buscarlo.
   */
  nLabel?: { sing: string; plural: string }
  /**
   * Cobertura mínima (n ÷ nTotal, en %) para juzgar el KPI contra la meta.
   * Por debajo el valor se muestra igual pero sin semáforo: no alcanza para
   * afirmar nada. Ver `PLAN_COBERTURA_MINIMA`.
   */
  coberturaMinima?: number
  tier: TierKpi
  tema: TemaKpi
  forma: FormaKpi
  /** Se dibuja como tarjeta grande (sólo tier 1). */
  heroe?: boolean
  /** El valor es un porcentaje 0–100 (decide la escala de la regla de meta). */
  pct?: boolean
}

const pct1 = (v: number) => `${v.toFixed(1)}%`
const pct0 = (v: number) => `${v.toFixed(0)}%`

export const KPI_DEFS: KpiDef[] = [
  // ==================== Tier 1: lo que mira primero la auditoría ====================
  {
    kpi: "disponibilidad",
    label: "Disponibilidad de flota",
    descripcion: "Días disponibles ÷ días del período (unidades de ruta)",
    fmt: pct1,
    conSerie: true,
    dpo: "2.1",
    tier: 1,
    tema: "disponibilidad",
    forma: "estado",
    heroe: true,
    pct: true,
  },
  {
    kpi: "docs_conformidad",
    label: "Conformidad documental",
    descripcion:
      "Unidades activas sin documentos vencidos ÷ flota activa. Un doc vencido deja la unidad fuera de servicio hasta regularizar",
    fmt: pct0,
    conSerie: true,
    dpo: "1.1",
    tier: 1,
    tema: "documentacion",
    forma: "estado",
    heroe: true,
    pct: true,
  },
  // 🚨 Acá estaba "Conformidad de estándares" (el global). SALE del tablero por
  // decisión de Francisco (08/08/2026), y no por estar mal calculado:
  //
  //  - Es el promedio de los otros dos, así que no agrega información.
  //  - Su meta de 100 % es CONTRADICTORIA con las que fijamos el 01/08: para
  //    llegar a 100 % global haría falta 100 % de excelencia, que es justo lo
  //    que decidimos NO exigir (meta 95 %). Cumpliendo las dos metas al pie de
  //    la letra el global daría 98,3 % y seguiría en rojo: un indicador que no
  //    se puede cumplir aunque hagas todo bien deja de significar algo.
  //
  // El número NO se borró: se sigue calculando, sigue guardándose en
  // `flota_kpi_snapshots` y se muestra como badge informativo (sin semáforo) en
  // la pantalla de Estándares. Su meta sigue en `flota_metas` por si se decide
  // volver atrás.
  {
    kpi: "estandares_mandatorios",
    label: "Conformidad de estándares — mandatorios",
    descripcion:
      "Ítems OK ÷ evaluables entre los mandatorios (exigidos por ley o cuya ausencia habilita un riesgo grave). Un desvío acá es hallazgo de auditoría",
    fmt: pct1,
    conSerie: true,
    dpo: "1.2",
    tier: 1,
    tema: "estandares",
    forma: "estado",
    heroe: true,
    pct: true,
  },
  {
    kpi: "checklist_adherencia",
    label: "Adherencia al checklist",
    descripcion:
      "Camión-día con liberación Y retorno ÷ camión-día que efectivamente repartieron (no los que cargaron checklist: ese denominador se infla solo). El R1.3.1a exige 100 % porque el checklist no impide usar la unidad, y el 1.3 es mandatorio",
    fmt: pct1,
    conSerie: true,
    dpo: "1.3",
    tier: 1,
    tema: "checklist",
    forma: "estado",
    pct: true,
  },
  {
    kpi: "checklist_deteccion",
    label: "Defectos anticipados por checklist",
    descripcion:
      "OTs correctivas del mes con defecto detectado en el checklist de la unidad en los 15 días previos ÷ OTs correctivas. Si la OT es de neumáticos, el defecto tiene que ser de neumáticos: un desperfecto de otro sistema no la anticipa",
    fmt: pct0,
    conSerie: true,
    dpo: "1.3",
    nLabel: { sing: "OT", plural: "OT" },
    tier: 1,
    tema: "checklist",
    forma: "estado",
    heroe: true,
    pct: true,
  },
  {
    kpi: "checklist_resolucion",
    label: "Resolución de defectos de checklist",
    descripcion:
      "Días promedio entre que el chofer carga el defecto en el checklist y que mantenimiento cierra el plan (por mes de cierre). El reloj arranca en la observación, no en el alta del plan: cargar un plan ya resuelto no cuenta 0 días",
    fmt: (v) => `${v.toFixed(1)} d`,
    conSerie: true,
    dpo: "1.3",
    nLabel: { sing: "plan resuelto", plural: "planes resueltos" },
    tier: 1,
    tema: "checklist",
    forma: "tasa",
  },
  {
    kpi: "estandares_excelencia",
    label: "Conformidad de estándares — excelencia",
    descripcion:
      "Ítems OK ÷ evaluables entre los de excelencia (mejoras de desempeño, ergonomía o eficiencia)",
    fmt: pct1,
    conSerie: true,
    dpo: "1.2",
    tier: 1,
    tema: "estandares",
    forma: "estado",
    pct: true,
  },

  // ==================== Tier 2: confiabilidad de la flota ====================
  {
    kpi: "cumplimiento_plan",
    label: "Cumplimiento del plan preventivo",
    descripcion:
      "Tareas del plan al día ÷ tareas con datos. El n dice sobre cuántas de las tareas plan×unidad se calculó: una tarea que nunca se registró no entra en el denominador, así que con poca cobertura el porcentaje no representa al plan y queda sin semáforo",
    fmt: pct0,
    conSerie: true,
    dpo: "2.2",
    nLabel: { sing: "tarea con dato", plural: "tareas con dato" },
    coberturaMinima: PLAN_COBERTURA_MINIMA,
    tier: 2,
    tema: "plan",
    forma: "estado",
    pct: true,
  },
  {
    kpi: "services_vencidos",
    label: "Services vencidos",
    descripcion:
      "Unidades con service general vencido. Meses cerrados: última foto diaria del mes",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
    dpo: "2.2",
    tier: 2,
    tema: "plan",
    forma: "conteo",
  },
  {
    kpi: "correctivo_dias_parado",
    label: "Días parado por correctivo",
    descripcion:
      "Σ días fuera de servicio por OT correctivas dentro del mes (una OT que cruza meses reparte sus días)",
    fmt: (v) => `${v.toFixed(0)} d`,
    conSerie: true,
    dpo: "2.4",
    acumulativo: true,
    tier: 2,
    tema: "correctivo",
    forma: "acumulativo",
  },
  {
    kpi: "roturas_flota",
    label: "Roturas de flota",
    descripcion:
      "OT correctivas del mes que dejaron la unidad parada al menos un día o requirieron auxilio en ruta: la «avería» de la pirámide de fallas, que es el «nº de roturas de flota» del R2.4.3. Se cuenta por OT (n = correctivas del mes)",
    fmt: (v) => `${v.toFixed(0)}`,
    conSerie: true,
    dpo: "2.4",
    acumulativo: true,
    nLabel: { sing: "OT correctiva", plural: "OT correctivas" },
    tier: 2,
    tema: "correctivo",
    forma: "acumulativo",
  },
  {
    kpi: "correctivo_tiempo_servicio",
    label: "Tiempo de servicio en taller",
    descripcion:
      "Horas promedio entre la entrada y la salida del taller de las OT correctivas del mes, sobre las que tienen las dos fechas cargadas. Mide al proveedor tanto como a la falla y alimenta el ANS con los talleres (R2.4.3 «tiempo de servicio»)",
    fmt: (v) => `${v.toFixed(0)} h`,
    conSerie: true,
    dpo: "2.4",
    nLabel: { sing: "OT con entrada y salida", plural: "OT con entrada y salida" },
    tier: 2,
    tema: "correctivo",
    forma: "tasa",
  },
  {
    kpi: "rechazos_rotura_flota",
    label: "Rechazos por rotura de flota",
    descripcion:
      "Rechazos de entrega del mes con motivo «ROTURA DE CAMION - SINIESTRO» (tabla rechazos, fuente Chess). Es el KPI que el R2.4.3 nombra textual y el que conecta el correctivo con el nivel de servicio: cada evento es un cliente que no recibió por una falla del camión. n = bultos rechazados",
    fmt: (v) => `${v.toFixed(0)}`,
    conSerie: true,
    dpo: "2.4",
    acumulativo: true,
    nLabel: { sing: "bulto rechazado", plural: "bultos rechazados" },
    tier: 2,
    tema: "correctivo",
    forma: "acumulativo",
  },
  {
    kpi: "utilizacion",
    label: "Utilización de flota",
    descripcion: "Días ruteados ÷ días laborales disponibles (unidades en servicio)",
    fmt: pct1,
    conSerie: true,
    dpo: "2.1",
    tier: 2,
    tema: "correctivo",
    forma: "estado",
    pct: true,
  },
  {
    kpi: "inventario_exactitud",
    label: "Exactitud de inventario",
    descripcion:
      "Ítems sin diferencia en el último conteo físico del mes ÷ ítems contados (Repuestos → Conteo de stock)",
    fmt: pct0,
    conSerie: true,
    dpo: "2.3",
    nLabel: { sing: "repuesto contado", plural: "repuestos contados" },
    tier: 2,
    tema: "repuestos",
    forma: "estado",
    pct: true,
  },
  {
    kpi: "repuestos_stock_minimo",
    label: "Cumplimiento del stock mínimo",
    descripcion:
      "Ítems del último conteo físico del mes que estaban en o por encima de su stock mínimo ÷ ítems contados CON mínimo definido. Los ítems sin mínimo cargado no entran: no tienen regla que cumplir, y contarlos daría 100 % sin haber hecho nada",
    fmt: pct0,
    conSerie: true,
    dpo: "2.3",
    nLabel: { sing: "repuesto con mínimo", plural: "repuestos con mínimo" },
    tier: 2,
    tema: "repuestos",
    forma: "estado",
    pct: true,
  },
  {
    kpi: "repuestos_trazabilidad",
    label: "Trazabilidad de egresos",
    descripcion:
      "Egresos del pañol que nacieron de una OT o de un plan de acción del checklist (descuento automático, atado al trabajo y a la unidad) ÷ egresos del pañol del mes, sin los ajustes por conteo. Mide la disciplina de registro: el SOP dice que el egreso nunca se carga a mano, así que la meta es 100 %. Fórmula del 04/11/2026; la anterior (filas de repuesto de OT vinculadas ÷ todas) se movía con cuántas piezas compraba el taller. Arranca el 25/08/2026, que es cuando el vínculo existe",
    fmt: pct0,
    conSerie: true,
    dpo: "2.3",
    nLabel: { sing: "egreso contra trabajo", plural: "egresos contra trabajo" },
    tier: 2,
    tema: "repuestos",
    forma: "estado",
    pct: true,
  },
  {
    kpi: "repuestos_demora_pieza",
    label: "Demora por falta de pieza",
    descripcion:
      "Días promedio que un pedido de repuestos esperó la pieza, de la detección de la falta al retiro (los abiertos cuentan hasta hoy), por mes de detección. Es el «pedidos de servicio retrasados debido a las piezas» del R2.3.3: lo que el pañol existe para evitar",
    fmt: (v) => `${v.toFixed(1)} d`,
    conSerie: true,
    dpo: "2.3",
    nLabel: { sing: "pedido", plural: "pedidos" },
    tier: 2,
    tema: "repuestos",
    forma: "tasa",
  },
  {
    kpi: "valor_stock_panol",
    label: "Valor del pañol",
    descripcion:
      "Capital inmovilizado en el pañol: stock actual × último precio unitario de cada pieza. Es el primer KPI que el auditor nombra en R2.3.3 (capital circulante). Foto de hoy; los meses cerrados salen de los snapshots del cron. Se lee junto con los ítems SOBRE máximo",
    fmt: (v) => `$${Math.round(v).toLocaleString("es-AR")}`,
    conSerie: true,
    dpo: "2.3",
    nLabel: { sing: "pieza con precio", plural: "piezas con precio" },
    tier: 2,
    tema: "repuestos",
    forma: "tasa",
  },

  // ==================== Tier 3: gestión y mejora ====================
  {
    kpi: "costo_total",
    label: "Costo de mantenimiento",
    descripcion: "Costo mensual de OT: tareas + mano de obra + repuestos",
    fmt: fmtMoney,
    conSerie: true,
    dpo: "3.2",
    acumulativo: true,
    tier: 3,
    tema: "costos",
    forma: "acumulativo",
  },
  {
    kpi: "presupuesto_desvio",
    label: "Desvío presupuestario de flota",
    descripcion:
      "Gasto real vs. presupuestado en los rubros de flota que el control mensual marcó con desvío: rodados, neumáticos, autoelevadores y combustible",
    fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`,
    conSerie: true,
    dpo: "3.2",
    tier: 3,
    tema: "costos",
    forma: "tasa",
  },
  {
    kpi: "pct_preventivo",
    label: "% preventivo del costo",
    descripcion: "Costo preventivo + proactivo ÷ costo total del mes",
    fmt: pct0,
    conSerie: true,
    dpo: "3.2",
    tier: 3,
    tema: "costos",
    forma: "estado",
    pct: true,
  },
  // 🚨 Neumáticos son DOS indicadores y no uno: antes "conformidad" dividía por
  // las cubiertas instaladas, así que la que no se medía contaba como si
  // estuviera fuera de norma. El 6 % rojo de agosto de 2026 no era una flota con
  // las cubiertas destruidas —las 98 mediciones de tres meses dieron todas
  // dentro de estándar—, era la rutina de medición sin hacer. Separados, cada
  // número tiene un dueño distinto: medir es del que mide, la conformidad es de
  // mantenimiento. Medición va primero: sin medición la conformidad no se puede
  // afirmar.
  {
    kpi: "neumaticos_medicion",
    label: "Medición de neumáticos",
    descripcion:
      "Cubiertas medidas en el mes ÷ cubiertas instaladas en camiones y autoelevadores activos. Es la rutina mensual de DPO 3.4: sin medición, la conformidad no se puede afirmar",
    fmt: pct0,
    conSerie: true,
    dpo: "3.4",
    nLabel: { sing: "cubierta medida", plural: "cubiertas medidas" },
    // 🚨 Es un % pero se ACUMULA: las mediciones se van cargando a lo largo del
    // mes contra un denominador fijo (las cubiertas instaladas), así que el
    // día 3 marca 4 % y pinta rojo una rutina que todavía no tenía por qué
    // estar hecha. Se juzga contra la meta recién con el mes cerrado.
    acumulativo: true,
    tier: 3,
    tema: "neumaticos",
    forma: "acumulativo",
    pct: true,
  },
  {
    kpi: "neumaticos_conformidad",
    label: "Conformidad de neumáticos",
    descripcion:
      "De las cubiertas MEDIDAS en el mes, las que están dentro de estándar (≥3 mm de profundidad y 90–120 psi). Se lee junto con la medición: 100 % sobre 7 cubiertas de 85 no dice nada de la flota",
    fmt: pct0,
    conSerie: true,
    dpo: "3.4",
    nLabel: { sing: "cubierta medida", plural: "cubiertas medidas" },
    tier: 3,
    tema: "neumaticos",
    forma: "estado",
    pct: true,
  },
  // 🚨 Este NO tiene serie mensual a propósito: la tasa sale de una recta
  // ajustada sobre todas las rondas del programa, no de lo que pasó en el mes.
  // Mostrarla mes a mes dibujaría el ruido del calibre como si fuera desgaste.
  {
    kpi: "neumaticos_desgaste",
    label: "Desgaste de cubiertas",
    descripcion:
      "Milímetros de dibujo que se come la flota cada 1.000 km, de la recta ajustada sobre todas las rondas de medición (Neumáticos → Desgaste por km). Menos es mejor. Queda en «—» hasta que las rondas junten km suficientes: con dos rondas la pendiente todavía la mueve el calibre",
    fmt: (v) => `${v.toFixed(2)} mm/1.000 km`,
    conSerie: false,
    dpo: "3.4",
    nLabel: { sing: "cubierta en el ajuste", plural: "cubiertas en el ajuste" },
    tier: 3,
    tema: "neumaticos",
    forma: "sinSerie",
  },
  // El PI que pidió el auditor del H1 2026 ("Comenzar a seguir KPI de consumo
  // de neumaticos"). R3.4.4 nombra "Gasto de Neumáticos" como uno de los PI
  // válidos del punto: es el único de los cuatro que faltaba.
  {
    kpi: "neumaticos_gasto_km",
    label: "Gasto de neumáticos por km",
    descripcion:
      "Plata de goma (cubiertas nuevas + recapados) ÷ km de la flota, acumulado del año y expresado por cada 1.000 km. Menos es mejor. Se mira acumulado porque las cubiertas se compran por juego: mes a mes daría $0 los meses sin compra y un pico el mes que se compra. Excluye los autoelevadores, que miden horas y no km",
    fmt: (v) => `${fmtMoney(v)} /1.000 km`,
    conSerie: true,
    dpo: "3.4",
    // 🚨 Acumulativo: el numerador y el denominador se van juntando durante el
    // año, así que en enero el número todavía no se puede juzgar contra la meta.
    acumulativo: true,
    tier: 3,
    tema: "neumaticos",
    forma: "acumulativo",
  },
  {
    kpi: "combustible_kml",
    label: "Rendimiento de combustible",
    descripcion:
      "Σ km recorridos ÷ Σ litros con medición del mes, flota de reparto, sin los tramos con carga faltante (mismo criterio que el módulo Combustible). KPI principal del DPO 3.3",
    fmt: (v) => `${v.toFixed(2)} km/l`,
    conSerie: true,
    dpo: "3.3",
    tier: 3,
    tema: "combustible",
    forma: "tasa",
  },
  {
    // PI de pérdida de combustible (R3.3.3). Mientras haya litros sin
    // registrar el km/l de arriba está inflado: este número dice cuánto.
    kpi: "combustible_sin_registrar_l",
    label: "Litros sin registrar",
    descripcion:
      "Litros de las cargas cuyo tramo rinde más de 1,4× lo habitual del camión: entraron al tanque sin pasar por la app. Meta 0; la política de combustible exige registrar cada carga en el momento",
    fmt: (v) => `${Math.round(v).toLocaleString("es-AR")} L`,
    conSerie: true,
    dpo: "3.3",
    acumulativo: true,
    tier: 3,
    tema: "combustible",
    forma: "acumulativo",
  },
  {
    // Condición de la meta 3,75: una carga cada ≤ 7 días por camión.
    kpi: "combustible_camiones_sin_carga_7d",
    label: "Camiones con +7 días sin carga",
    descripcion:
      "Camiones de reparto con algún hueco de más de 7 días entre cargas en el mes: un camión parado sin avisar o una carga que no pasó por la app. Meta 0",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
    dpo: "3.3",
    nLabel: { sing: "camión", plural: "camiones" },
    tier: 3,
    tema: "combustible",
    forma: "conteo",
  },
  {
    kpi: "co2_flota",
    label: "Huella de CO₂ de flota",
    descripcion:
      "Litros de gasoil cargados × 2,68 kg CO₂/l (estimación estándar; sostenibilidad DPO 4.3)",
    fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${v.toFixed(0)} kg`),
    conSerie: true,
    dpo: "4.3",
    acumulativo: true,
    tier: 3,
    tema: "combustible",
    forma: "acumulativo",
  },
  {
    kpi: "cil_tareas",
    label: "Tareas CIL / ATO completadas",
    descripcion:
      "Limpiezas, inspecciones y lubricaciones autónomas registradas en el mes (Check lists → Tareas CIL)",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
    dpo: "4.1",
    acumulativo: true,
    tier: 3,
    tema: "cil",
    forma: "acumulativo",
  },
  {
    kpi: "cil_defectos_anticipables",
    label: "Defectos que el CIL anticipa",
    descripcion:
      "Defectos de checklist de las familias que la limpieza e inspección autónoma previene: pérdida de fluidos y nivel de aceite, luces (focos y destelladores) y soldaduras de carrocería, sólo en la flota de reparto. Menos es mejor: es el resultado del CIL, no la actividad",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
    dpo: "4.1",
    acumulativo: true,
    tier: 3,
    tema: "cil",
    forma: "acumulativo",
  },
  {
    kpi: "cil_fugas_detectadas",
    label: "Fugas de aceite que encontró el CIL",
    descripcion:
      "PI de ATO (R4.1.4): controles de aceite del CIL con nivel bajo o pasado, litros repuestos o pérdida a la vista, en camiones y autoelevadores. Cada hallazgo es una falla que no llegó a ruta. Se lee junto con «Pérdidas de aceite en ruta»",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
    dpo: "4.1",
    acumulativo: true,
    tier: 3,
    tema: "cil",
    forma: "acumulativo",
  },
  {
    kpi: "fugas_aceite_ruta",
    label: "Pérdidas de aceite en ruta",
    descripcion:
      "Resultado del ATO: eventos de pérdida de fluidos o nivel de aceite NO OK que llegaron al checklist diario (la misma unidad con menos de 7 días entre reportes = 1 evento). Incluye autoelevadores. Menos es mejor",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
    dpo: "4.1",
    acumulativo: true,
    tier: 3,
    tema: "cil",
    forma: "acumulativo",
  },
]

export const KPI_DEF_BY = new Map(KPI_DEFS.map((d) => [d.kpi, d]))

// KPIs cuya serie de meses cerrados sale de `flota_kpi_snapshots` (los pisa el
// cron diario); el mes en curso se calcula en vivo.
export const KPIS_FOTO: FlotaKpi[] = [
  "cumplimiento_plan",
  "services_vencidos",
  "docs_conformidad",
  "estandares_conformidad",
  "estandares_mandatorios",
  "estandares_excelencia",
]

export const TIERS: { tier: TierKpi; titulo: string; sub: string }[] = [
  {
    tier: 1,
    titulo: "Lo que mira primero la auditoría",
    sub: "Puntos mandatorios 1.1 a 1.3 y la disponibilidad que siente el cliente (2.1)",
  },
  {
    tier: 2,
    titulo: "Confiabilidad de la flota",
    sub: "Plan preventivo, correctivo y repuestos (bloque 2 del pilar)",
  },
  {
    tier: 3,
    titulo: "Gestión y mejora",
    sub: "Costos, neumáticos, combustible y autonomía (bloques 3 y 4)",
  },
]

export const TEMAS: { id: TemaKpi; label: string }[] = [
  { id: "disponibilidad", label: "Disponibilidad" },
  { id: "documentacion", label: "Documentación" },
  { id: "estandares", label: "Estándares" },
  { id: "checklist", label: "Checklist" },
  { id: "plan", label: "Plan preventivo" },
  { id: "correctivo", label: "Correctivo y uso" },
  { id: "repuestos", label: "Repuestos" },
  { id: "costos", label: "Costos" },
  { id: "neumaticos", label: "Neumáticos" },
  { id: "combustible", label: "Combustible y huella" },
  { id: "cil", label: "CIL / ATO" },
]
export const TEMA_LABEL = Object.fromEntries(TEMAS.map((t) => [t.id, t.label])) as Record<
  TemaKpi,
  string
>
export const TEMA_IDS = TEMAS.map((t) => t.id) as [TemaKpi, ...TemaKpi[]]

// ==================== Destino del click ====================

/**
 * A dónde lleva el botón de detalle de cada tarjeta.
 *
 * 🚨 La regla es una sola: el click tiene que terminar donde el número se
 * puede AUDITAR, no en una pantalla parecida. Para casi todos los PI esa
 * pantalla ya existe en otra solapa y lo único que faltaba era el atajo; para
 * los tres que no la tienen (detección, resolución y trazabilidad) se abre el
 * panel con las filas que forman el numerador y el denominador. Un porcentaje
 * del que no se puede ver el detrás no se puede discutir en una reunión.
 */
export interface DestinoKpi {
  /** Solapa del módulo de mantenimiento. */
  tab?: string
  /** Ruta de otra pantalla (el módulo de combustible vive fuera). */
  href?: string
  /** Panel propio con las filas del cálculo. */
  detalle?: FlotaKpiConDetalle
  label: string
  /**
   * Texto del botón cuando el mes NO tiene valor.
   *
   * 🚨 Un "—" se lee como "la app no anda". Los dos PI de repuestos salen del
   * conteo FÍSICO del mes, así que sin conteo no hay número — y eso no es una
   * falla del tablero, es una tarea sin hacer. El botón lo dice y lleva a
   * hacerla.
   */
  labelSinDato?: string
}

export const DESTINO_KPI: Partial<Record<FlotaKpi, DestinoKpi>> = {
  disponibilidad: { tab: "seguimiento", label: "Ver día a día por unidad" },
  utilizacion: { tab: "seguimiento", label: "Ver día a día por unidad" },
  correctivo_dias_parado: { tab: "seguimiento", label: "Ver las paradas del mes" },
  costo_total: {
    tab: "historial",
    label: "Ver las órdenes de trabajo",
    labelSinDato: "Sin OT cargadas este mes",
  },
  pct_preventivo: {
    tab: "historial",
    label: "Ver las órdenes de trabajo",
    labelSinDato: "Sin OT cargadas este mes",
  },
  cumplimiento_plan: { tab: "tablero", label: "Ver el plan tarea por unidad" },
  services_vencidos: { tab: "tablero", label: "Ver el plan tarea por unidad" },
  docs_conformidad: { tab: "tablero", label: "Ver la documentación por unidad" },
  estandares_mandatorios: { tab: "estandares", label: "Ver la matriz de estándares" },
  estandares_excelencia: { tab: "estandares", label: "Ver la matriz de estándares" },
  inventario_exactitud: {
    detalle: "inventario_exactitud",
    label: "Ver el conteo ítem por ítem, con la causa de cada diferencia",
    labelSinDato: "Sin conteo este mes",
  },
  repuestos_stock_minimo: {
    detalle: "repuestos_stock_minimo",
    label: "Ver qué ítems quedaron FUERA del mínimo",
    labelSinDato: "Sin conteo este mes",
  },
  repuestos_demora_pieza: {
    tab: "repuestos",
    label: "Ver los pedidos de repuestos",
    labelSinDato: "Sin pedidos este mes",
  },
  valor_stock_panol: {
    tab: "repuestos",
    label: "Ver el valor por ítem en Inventario",
    labelSinDato: "Sin precios cargados en el pañol",
  },
  cil_tareas: { tab: "cil", label: "Ver las tareas CIL del mes" },
  cil_defectos_anticipables: { tab: "analisis-items", label: "Ver los defectos por ítem" },
  cil_fugas_detectadas: {
    detalle: "cil_fugas_detectadas",
    label: "Ver los controles de aceite del mes",
    // Gris no es "cero hallazgos": es que nadie cargó el control estructurado.
    labelSinDato: "Sin controles de aceite cargados este mes",
  },
  fugas_aceite_ruta: {
    detalle: "fugas_aceite_ruta",
    label: "Ver las pérdidas que llegaron al checklist",
  },
  neumaticos_medicion: { tab: "neumaticos", label: "Ver las mediciones del mes" },
  neumaticos_conformidad: { tab: "neumaticos", label: "Ver las mediciones del mes" },
  neumaticos_desgaste: { tab: "neumaticos", label: "Ver el desgaste por km" },
  neumaticos_gasto_km: {
    tab: "neumaticos",
    label: "Ver el costo de neumáticos por unidad",
    labelSinDato: "Sin km cargados este año",
  },
  combustible_kml: {
    href: "/vehiculos/combustible/analisis",
    label: "Ver el análisis por camión y por chofer",
  },
  combustible_sin_registrar_l: {
    href: "/vehiculos/combustible/analisis",
    label: "Ver qué camiones tienen cargas sin registrar",
  },
  combustible_camiones_sin_carga_7d: {
    href: "/vehiculos/combustible/analisis",
    label: "Ver los días desde la última carga",
  },
  co2_flota: { href: "/vehiculos/combustible", label: "Ver el módulo de Combustible" },
  checklist_adherencia: {
    tab: "checklists",
    label: "Ver los días que faltan y de quién",
  },
  checklist_deteccion: {
    detalle: "checklist_deteccion",
    label: "Ver las OT correctivas del mes",
  },
  checklist_resolucion: {
    detalle: "checklist_resolucion",
    label: "Ver los planes resueltos del mes",
  },
  repuestos_trazabilidad: {
    detalle: "repuestos_trazabilidad",
    label: "Ver los repuestos cargados en OT",
  },
  roturas_flota: { tab: "analisis-correctivos", label: "Ver el análisis de correctivos" },
  correctivo_tiempo_servicio: { tab: "historial", label: "Ver las OT con entrada y salida de taller" },
  rechazos_rotura_flota: { href: "/rechazos", label: "Ver los rechazos por rotura de camión" },
  presupuesto_desvio: {
    detalle: "presupuesto_desvio",
    label: "Ver el desvío rubro por rubro",
    // Gris no es "cero desvío": es que nadie cargó el control del mes. La
    // tarjeta lo dice en vez de dejar al lector adivinando.
    labelSinDato: "Sin control de presupuesto este mes",
  },
}
