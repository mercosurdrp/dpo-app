/**
 * Tipos del dashboard de rechazos V1 (Pampeana).
 *
 * Consumidos por:
 *   - src/actions/rechazos.ts → función `getRechazosComparado`
 *   - src/app/(dashboard)/indicadores/rechazos/* → UI consumer
 *
 * Convención general:
 *   - Montos en $ ARS sin redondear; el formateo es responsabilidad de la UI.
 *   - Tasas en porcentaje real (0–100), no en fracción (0–1).
 *   - Fechas como ISO `YYYY-MM-DD` para días y `YYYY-Www` para semanas.
 *   - Deltas: `_abs` en la misma unidad que el campo; `_pct` siempre en %.
 */

// ────────────────────────────────────────────────────────────────────────────
//  Input — request shape
// ────────────────────────────────────────────────────────────────────────────

/**
 * Filtros de la consulta. Todos son multi-select; ausencia/array vacío = sin filtro.
 * Se aplican en SQL `WHERE` (no en TS post-fetch).
 */
export interface RechazosFilters {
  ds_fletero_carga?: string[]   // patentes ej ["AF028YB","AE908DG"]
  id_cliente?: number[]
  id_rechazo?: number[]         // motivo
  id_articulo?: number[]
  categoria?: RechazoCategoria[] // desde catalogo_rechazos
  ds_canal_mkt?: string[]
  ds_supervisor?: string[]
}

export interface RechazosComparadoRequest {
  /** ISO date inclusivo. */
  desde: string
  /** ISO date inclusivo. Si es hoy, el rango se trunca a "hoy 23:59 ART". */
  hasta: string
  filters?: RechazosFilters
  /** Modo de comparación. Si se omite, se infiere del rango. */
  mode?: ComparisonMode
  /** Si true, el server resuelve los displays de los filtros y los devuelve en meta.filters_resolved. */
  include_filters_resolved?: boolean
}

// ────────────────────────────────────────────────────────────────────────────
//  Catálogos / enums
// ────────────────────────────────────────────────────────────────────────────

/** Coincide con el CHECK constraint de `catalogo_rechazos.categoria`. */
export type RechazoCategoria =
  | "Logística"
  | "Ventas"
  | "Cliente"
  | "Interno"
  | "Externo"
  | "POR_CLASIFICAR"

/** Cómo se calcula el "período anterior" comparado contra el actual. */
export type ComparisonMode =
  | "mes_en_curso"   // 1-X mes corriente vs 1-X mes anterior
  | "mes_cerrado"    // mes calendario completo vs mes calendario anterior
  | "rango_custom"   // N días vs N días inmediatamente anteriores

// ────────────────────────────────────────────────────────────────────────────
//  KPIs y deltas
// ────────────────────────────────────────────────────────────────────────────

/** Métricas del período (actual o anterior). Mismo shape para ambos. */
export interface RechazosKPI {
  /** Σ hl_rechazados — métrica de volumen PRIMARIA (unidad-consistente). */
  hl: number
  /** Σ ventas_diarias.total_hl entregados (denominador de `tasa`). */
  total_hl_entregados: number
  /** Σ bultos_rechazados — métrica de volumen SECUNDARIA (cubre combos, que dan 0 HL). */
  bultos: number
  /** Σ total_bultos entregados (denominador de `tasa_bultos`). */
  total_entregados: number
  /** Cantidad total de filas-rechazo en el período (incluye las que tienen monto_neto NULL). */
  eventos: number
  /** Subset de `eventos` que tienen monto_neto no-null. Base para `ticket_promedio`. */
  eventos_con_monto: number
  /** Σ monto_neto (sin IVA ni internos). NULL/NULL filas no suman. */
  monto_neto: number
  /** Σ monto_bruto (con IVA + internos). */
  monto_bruto: number
  /** % de rechazo PRIMARIO = hl / total_hl_entregados × 100. */
  tasa: number
  /** % de rechazo SECUNDARIO = bultos / total_entregados × 100. */
  tasa_bultos: number
  /** % de HL rechazado que es "controlable" según catalogo_rechazos.controlable. */
  pct_controlable: number
  /** $ promedio por evento con monto = monto_neto / eventos_con_monto. */
  ticket_promedio: number
  /** distinct id_cliente del período. */
  clientes_afectados: number
}

/**
 * Diferencias entre `actual` y `previous`. `_pct` es relativa al período anterior.
 * `_pp` (puntos porcentuales) se usa para deltas de % que viven en escala 0–100.
 */
export interface RechazosDelta {
  hl_abs: number;              hl_pct: number
  total_hl_entregados_abs: number; total_hl_entregados_pct: number
  bultos_abs: number;          bultos_pct: number
  total_entregados_abs: number; total_entregados_pct: number
  eventos_abs: number;         eventos_pct: number
  monto_neto_abs: number;      monto_neto_pct: number
  tasa_pp: number              // delta de la tasa HL en puntos porcentuales
  tasa_bultos_pp: number       // delta de la tasa bultos en puntos porcentuales
  pct_controlable_pp: number
  ticket_abs: number;          ticket_pct: number
  clientes_abs: number;        clientes_pct: number
  /**
   * Mapa KPI → razón por la que su delta NO es comparable.
   * Vacío/ausente = todos los deltas válidos. La UI muestra asterisco visual + tooltip
   * usando el value como caveat. Ejemplo: `{ pct_controlable: "catalogo_actualizado_2026-05" }`.
   */
  comparison_invalidated_by?: Partial<Record<keyof RechazosKPI, string>>
}

// ────────────────────────────────────────────────────────────────────────────
//  Series temporales
// ────────────────────────────────────────────────────────────────────────────

export interface RechazosPuntoDia {
  fecha: string         // "YYYY-MM-DD"
  hl: number
  bultos: number
  monto: number
  eventos: number
  /** 0–100, base HL. Si `total_hl_dia = 0`, devuelve 0 (no se muestra como gap). */
  tasa: number
}

export interface RechazosPuntoSemana {
  semana: string        // "YYYY-Www" (ISO 8601 week)
  desde: string         // primer día de la semana (YYYY-MM-DD)
  hasta: string         // último día de la semana
  hl: number
  bultos: number
  monto: number
  eventos: number
  tasa: number          // 0–100, base HL
}

// ────────────────────────────────────────────────────────────────────────────
//  Agregaciones (por dimensión)
// ────────────────────────────────────────────────────────────────────────────

export interface RechazosAggMotivo {
  id_rechazo: number
  ds_rechazo: string
  categoria: RechazoCategoria
  controlable: boolean
  hl: number
  bultos: number
  eventos: number
  monto: number              // monto_neto
  /** 0–100, contra el total de HL rechazado del período. */
  pct_del_total: number
}

export interface RechazosAggCategoria {
  categoria: RechazoCategoria
  hl: number
  bultos: number
  eventos: number
  monto: number
}

export interface RechazosAggChofer {
  /** COALESCE(chofer_nombre, patente). Lo que se muestra en la fila. */
  display: string
  patente: string
  /** Nombre desde mapeo_patente_chofer → catalogo_choferes. NULL si no hay mapeo. */
  chofer_nombre: string | null
  hl: number
  bultos: number
  eventos: number
  monto: number
  /** hl_chofer / total_hl_entregados_chofer × 100. 0 si no hay entregas FCVTA en el rango. */
  tasa: number
  /** Σ ventas_diarias.total_hl del mismo rango+patente (denominador de `tasa`). */
  total_hl_entregados: number
  /** Σ ventas_diarias.total_bultos del mismo rango+patente (denominador secundario, en bultos). */
  total_entregados: number
  /**
   * False si `total_hl_entregados <= 0` o `hl > total_hl_entregados` (la patente entregó menos
   * de lo que rechazó, o no aparece en ventas_diarias). En ese caso `tasa` no es comparable
   * con el promedio del fleet; la UI debe marcarlo con icono ⚠ y excluirlo de rankings de tasa.
   */
  denominador_confiable: boolean
  /**
   * Top 3 motivos por monto de esta patente en el período. Poblado SOLO en `ranking_sin_denominador`
   * para dar contexto en el bloque colapsado de la UI ("¿qué rechazó esta patente sin denominador?").
   * En `ranking_principal` queda undefined.
   */
  motivos_top?: { ds_rechazo: string; hl: number; monto: number; eventos: number }[]
}

export interface RechazosAggCliente {
  id_cliente: number
  nombre_cliente: string
  hl: number
  bultos: number
  eventos: number
  monto: number
}

export interface RechazosAggProducto {
  id_articulo: number
  /** El `ds_articulo` más reciente (por created_at DESC), no el alfabéticamente "primero". */
  ds_articulo: string
  hl: number
  bultos: number
  eventos: number
  monto: number
}

export interface RechazosAggCanal {
  ds_canal_mkt: string
  hl: number
  bultos: number
  eventos: number
  monto: number
  /** 0–100, share del canal sobre el total de HL rechazado del período. */
  pct: number
}

export interface RechazosAggSupervisor {
  ds_supervisor: string
  hl: number
  bultos: number
  eventos: number
  monto: number
}

// ────────────────────────────────────────────────────────────────────────────
//  Mayores variaciones (highlights accionables)
// ────────────────────────────────────────────────────────────────────────────

export type TopVariacionMetric = "monto" | "tasa" | "bultos"
/**
 * Dimensiones de drill-down. Las primeras 4 ("motivo" | "chofer" | "canal" | "cliente")
 * pueden aparecer en `TopVariacion` (top variaciones server-side); "producto" solo se
 * usa para drill-down desde la UI (ranking de productos), no para top variaciones.
 */
export type TopVariacionDim = "motivo" | "chofer" | "canal" | "cliente" | "producto"

export interface TopVariacion {
  dim: TopVariacionDim
  /**
   * Identificador crudo de la dimensión: id_rechazo (number) para "motivo",
   * patente (string) para "chofer", ds_canal_mkt (string) para "canal", id_cliente
   * (number) para "cliente". Sirve para drill-down + lookups server-side.
   */
  id: string | number
  label: string                 // ej "BEES", "PEREZ J.", "KIOSCOS/MAXIKIO"
  metric: TopVariacionMetric
  actual_value: number
  previous_value: number
  /** Eventos del período previous para esta dimensión. Sirve para evaluar `baseline_low`. */
  previous_eventos: number
  delta_abs: number
  delta_pct: number             // 0 si previous_value es 0 y actual > 0 → marcamos como "nuevo"
  /** true si previous_value === 0 — el delta_pct es indefinido y se renderiza "—". */
  baseline_was_zero: boolean
  /**
   * true si el baseline cumple alguna de las dos condiciones:
   *   - previous_value < umbral monetario (por defecto $50.000 para metric=monto)
   *   - previous_eventos < umbral de eventos (por defecto 10)
   * El delta_pct sigue siendo válido aritméticamente, pero la UI debe marcarlo con
   * asterisco/tooltip para que gerencia entienda que está inflado por denominador chico.
   */
  baseline_low: boolean
}

export interface TopVariaciones {
  motivo_subio:    TopVariacion | null
  motivo_bajo:     TopVariacion | null
  chofer_mejoro:   TopVariacion | null   // metric=tasa, negativa
  chofer_empeoro:  TopVariacion | null   // metric=tasa, positiva
  canal_subio:     TopVariacion | null
  canal_bajo:      TopVariacion | null
}

// ────────────────────────────────────────────────────────────────────────────
//  Alertas
// ────────────────────────────────────────────────────────────────────────────

export type AlertSeverity = "rojo" | "amarillo" | "verde"
export type AlertCategory = "chofer" | "motivo" | "cliente" | "tendencia"

/**
 * Estado de evaluación de una regla. Si no hay datos suficientes (ej. "3
 * períodos consecutivos" pero solo tenemos 2 períodos previos), la regla
 * se omite — no aparece en `alerts[]` y no falsea con datos parciales.
 */
export type AlertEvaluation = "available" | "insufficient_history"

export interface Alert {
  severity: AlertSeverity
  category: AlertCategory
  /** Texto principal mostrado en el banner. Ya formateado. */
  title: string
  /** Texto secundario opcional (tooltip o expand). */
  detail?: string
  /**
   * Resumen calculado server-side. Si la concentración del fenómeno es clara
   * (top 1-3 días o patentes >70% del monto), describe dónde ocurrió. Si además
   * el baseline previous es bajo, agrega esa nota. Si no hay concentración clara
   * y el baseline está OK, es null (no se inventa texto).
   *
   * Ejemplos:
   *   "Concentrado en 2 días (02/05, 04/05) y 2 patentes (AF588SU, AF469UR)"
   *   "Concentrado en 1 patente (AF469UR) — baseline anterior bajo ($98k, 8 eventos)"
   *   null
   */
  context_summary?: string | null
  /** Si está presente, click navega al drill-down de esa dimensión. */
  drillTo?: { tipo: TopVariacionDim; id: string | number }
}

// ────────────────────────────────────────────────────────────────────────────
//  Meta del response
// ────────────────────────────────────────────────────────────────────────────

export interface SyncLogEntry {
  ran_at: string
  source: "cron" | "manual-bearer" | "manual-session" | "script"
  errors_count: number
}

export interface PeriodWindow {
  desde: string
  hasta: string
  /** Label legible: "1-11 may", "abril 2026", "15-may → 09-jun". */
  label: string
}

export interface RechazosComparadoMeta {
  /** Última corrida del sync (header "Última corrida HH:MM"). Null si la tabla `sync_log` está vacía. */
  lastSync: SyncLogEntry | null
  /** Ventana del período actual (la que pidió el usuario). */
  actual: PeriodWindow
  /** Ventana del período anterior calculada según `mode`. */
  previous: PeriodWindow
  mode: ComparisonMode
  /**
   * Echo LITERAL de los IDs del request (no displays). Sirve para telemetría
   * y para construir cache keys deterministas en el futuro. Si la UI necesita
   * los displays para renderizar chips, consulta `filters_resolved`.
   */
  filters_applied: RechazosFilters
  /** Displays resueltos opcionales (chofer name, motivo ds, cliente nombre, etc.) si la UI los pidió. */
  filters_resolved?: RechazosFiltersResolved
  /** Generación del response (debug + cache key futura). */
  generated_at: string
  /** ms que tardó el server action de punta a punta. */
  duration_ms: number
}

/**
 * Versión "humana" de los filtros: cada array es el display correspondiente al ID en `filters_applied`.
 * El server resuelve los displays solo cuando la UI lo pide explícitamente (no en cada request).
 */
export interface RechazosFiltersResolved {
  ds_fletero_carga?: { patente: string; chofer_display: string }[]
  id_cliente?: { id: number; nombre: string }[]
  id_rechazo?: { id: number; ds: string }[]
  id_articulo?: { id: number; ds: string }[]
  categoria?: RechazoCategoria[]
  ds_canal_mkt?: string[]
  ds_supervisor?: string[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Response completo
// ────────────────────────────────────────────────────────────────────────────

/**
 * Listas completas para poblar los dropdowns de filtros (UI).
 * Se calculan SIN aplicar los filtros del request — de esa forma el dropdown
 * sigue mostrando todas las opciones cuando el usuario ya tiene filtros activos.
 */
export interface RechazosFilterOptions {
  /** Catálogo completo de motivos activos (con categoría + flag controlable). */
  motivos: { id_rechazo: number; ds_rechazo: string; categoria: RechazoCategoria; controlable: boolean }[]
  /** Mapeo completo de patentes (con chofer resuelto si está cargado). */
  fleteros: { patente: string; chofer_display: string }[]
  /** Canales distintos del período (sin filtros). */
  canales: string[]
  /** Supervisores distintos del período (sin filtros). */
  supervisores: string[]
  /** Categorías presentes en el catálogo. */
  categorias: RechazoCategoria[]
}

export interface RechazosComparado {
  meta: RechazosComparadoMeta
  actual: RechazosKPI
  previous: RechazosKPI
  delta: RechazosDelta

  /** Listas para los dropdowns de filtros — independientes de los filtros aplicados. */
  filter_options: RechazosFilterOptions

  /**
   * Alertas evaluadas server-side. La UI debe distinguir:
   *   items=[],          tendencia_evaluation='available'             → todo OK, sin nada que mostrar
   *   items=[],          tendencia_evaluation='insufficient_history'  → "tendencia: histórico insuficiente"
   *   items=[Alert,...], tendencia_evaluation='available'             → render normal
   */
  alerts: {
    items: Alert[]
    /** Estado de la regla "tasa global subió 3 períodos consecutivos". Sin 3 períodos previos → insufficient_history. */
    tendencia_evaluation: AlertEvaluation
  }

  series: {
    por_dia: RechazosPuntoDia[]
    por_semana: RechazosPuntoSemana[]
  }

  agg: {
    por_motivo: RechazosAggMotivo[]
    por_categoria: RechazosAggCategoria[]
    /**
     * Ranking de choferes en DOS bloques separados:
     *   ranking_principal:        denominador_confiable === true. Esta es la lista que la
     *                             UI muestra en el ranking visible + entra en alertas + top_variaciones.
     *   ranking_sin_denominador:  denominador_confiable === false. UI los muestra colapsados
     *                             ("N choferes sin denominador comparable - click para ver").
     */
    por_chofer: {
      ranking_principal: RechazosAggChofer[]
      ranking_sin_denominador: RechazosAggChofer[]
    }
    por_cliente: RechazosAggCliente[]
    por_producto: RechazosAggProducto[]
    por_canal: RechazosAggCanal[]
    por_supervisor: RechazosAggSupervisor[]
  }

  top_variaciones: TopVariaciones
}

/** Discriminated union para devolver error sin lanzar excepción. */
export type RechazosComparadoResult =
  | { ok: true; data: RechazosComparado }
  | { ok: false; error: string }

// ────────────────────────────────────────────────────────────────────────────
//  Drill-down (server action separada, no es parte de getRechazosComparado)
// ────────────────────────────────────────────────────────────────────────────

export interface RechazosDetalleRequest {
  desde: string
  hasta: string
  filters?: RechazosFilters
  /** Dimensión adicional para drill-down: "motivo BEES", "chofer RODRIGUEZ", etc. */
  drill?: { tipo: TopVariacionDim; value: string | number }
  offset?: number
  limit?: number       // default 100, max 1000
}

export interface RechazosDetalleRow {
  id: string
  /** Fecha de carga de la devolución en Chess (auditoría). */
  fecha: string
  /** Día al que se imputa el rechazo = fecha de la venta original. El dashboard usa esta. */
  fecha_venta: string
  /** Patente (== ds_fletero_carga en DB). Columna secundaria en la grilla. */
  patente: string
  /** COALESCE(chofer_nombre_via_mapeo, patente). Columna principal en CSV de gerencia. */
  chofer_display: string
  id_rechazo: number
  ds_rechazo: string
  categoria: RechazoCategoria
  controlable: boolean
  id_cliente: number | null
  nombre_cliente: string | null
  id_articulo: number
  ds_articulo: string
  hl_rechazados: number
  bultos_rechazados: number
  monto_neto: number | null
  monto_bruto: number | null
  ds_localidad: string | null
  ds_canal_mkt: string | null
  ds_supervisor: string | null
  id_documento: string | null
  fecha_pedido: string | null
}

export interface RechazosDetalleResponse {
  rows: RechazosDetalleRow[]
  total: number              // count total con filtros aplicados (para paginación)
  offset: number
  limit: number
}
