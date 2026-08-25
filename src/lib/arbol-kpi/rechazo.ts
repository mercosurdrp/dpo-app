/**
 * Árbol de KPI: Rechazo — apertura del KPI en los drivers que la operación
 * puede mover, hasta el último nivel.
 *
 * Molde: el árbol corporativo del CD Tucumán (Arbol_Rechazo_CD_TUC.xlsx), que
 * abre cada KPI en 5 columnas — KPI → Componente Fórmula → Proceso → Actividad
 * → Tarea — con el valor del mes (MTH) y del año (YTD).
 *
 * Responde el punto 1.2 de la auditoría DPO H1 (Gestión · Definición del sueño,
 * nota 3): "revisar cascadeo hasta último nivel de operación" y "tener como PIs
 * críticos aquellos que los operarios pueden cambiar para mejorar el KPI
 * central". El Árbol del Sueño (`@/lib/sueno/arbol-config`) sigue siendo el
 * cascadeo estratégico: llega hasta Rechazo y lo abre sólo en Sin Dinero y
 * Cerrado. Este árbol es el zoom de ese nodo.
 *
 * 🚨 Sólo entran nodos que HOY se miden con datos propios. Del árbol de
 * Tucumán quedaron afuera, a propósito, cinco que no tienen fuente en Pampeana:
 *   - Uso OnTime (%) y sus derivados: viven en la app de pedidos, no en la
 *     logística. Sus dos actividades (performance de clic y adherencia a la
 *     secuencia) SÍ las tenemos por Foxtrot y se recolgaron de TMR, que es
 *     donde el chofer efectivamente las mueve.
 *   - Adherencia Modulación (%), Rechazo Modulado (%) y Eficiencia Modulación
 *     (%): no modulamos pedidos. Las tareas que colgaban de ahí (Sin Dinero,
 *     No Pedido, Cerrado) se recolgaron de Rechazo en pedidos.
 *   - Minorista (%) / SMK (%): apertura por canal de venta, que hoy no se
 *     distingue en la base.
 * Un nodo dibujado y siempre vacío le resta credibilidad al tablero, que es
 * justo lo contrario de lo que pide la auditoría.
 */

/** Columnas del árbol, de la raíz a la hoja. */
export type NivelKpi = "kpi" | "componente" | "proceso" | "actividad" | "tarea"

export const NIVEL_KPI_LABEL: Record<NivelKpi, string> = {
  kpi: "KPI",
  componente: "Componente Fórmula",
  proceso: "Proceso",
  actividad: "Actividad",
  tarea: "Tarea",
}

export const NIVELES_KPI_ORDEN: NivelKpi[] = [
  "kpi",
  "componente",
  "proceso",
  "actividad",
  "tarea",
]

export type MejorSiKpi = "mayor" | "menor" | "sin"

export interface NodoArbolKpi {
  /** key estable; se usa para el mapa de valores y para el drill. */
  key: string
  label: string
  nivel: NivelKpi
  /** key del padre (null sólo en la raíz). */
  parentKey: string | null
  unidad: string
  mejorSi: MejorSiKpi
  /**
   * Meta con la que se diseñó el nodo. Es sólo el FALLBACK: la vigente vive en
   * `arbol_kpi_config` por año y se edita desde la pantalla. null = informativo.
   */
  metaDefault: number | null
  /** De dónde sale el número. Se muestra al abrir el nodo: sin trazabilidad el árbol no se discute. */
  fuente: string
  /** Ruta de la app donde se gestiona ese driver, si existe. */
  href?: string
}

/**
 * Topología. El orden acá es el orden de dibujo dentro de cada columna.
 *
 * 🚨 Los tres nodos que en Tucumán colgaban de Modulación / Uso OnTime se
 * reasignaron al padre que mejor los explica con nuestra operación. Es la
 * primera decisión a revisar con la operación antes de darlo por cerrado.
 */
export const ARBOL_RECHAZO: NodoArbolKpi[] = [
  // ── KPI ─────────────────────────────────────────────────────────────────
  {
    key: "rechazo",
    label: "Rechazo",
    nivel: "kpi",
    parentKey: null,
    unidad: "%",
    mejorSi: "menor",
    metaDefault: 1.7,
    fuente:
      "HL rechazados ÷ HL distribuidos del período. Mismo cálculo que la fila % Rechazo del cuadro mensual (el nodo Rechazo del Árbol del Sueño usa bultos: da parecido, no idéntico).",
    href: "/rechazos",
  },

  // ── Componente Fórmula ──────────────────────────────────────────────────
  {
    key: "vol_entregado_pdv",
    label: "Volumen entregado en PDV",
    nivel: "componente",
    parentKey: "rechazo",
    unidad: "HL",
    mejorSi: "sin",
    metaDefault: null,
    fuente: "HL distribuidos del período (ventas_diarias), el volumen que sí llegó al cliente.",
  },
  {
    key: "vol_cargado_camion",
    label: "Volumen cargado en camiones",
    nivel: "componente",
    parentKey: "rechazo",
    unidad: "HL",
    mejorSi: "sin",
    metaDefault: null,
    fuente: "HL cargados en los camiones del período (ocupacion_bodega_diaria).",
    href: "/indicadores/ocupacion-bodega",
  },

  // ── Proceso ─────────────────────────────────────────────────────────────
  {
    key: "rechazo_pedidos",
    label: "Rechazo en pedidos",
    nivel: "proceso",
    parentKey: "vol_entregado_pdv",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: null,
    fuente:
      "Pedidos con al menos un rechazo ÷ pedidos del período (cada cliente × fecha cuenta 1). Mide cuántas visitas se caen, no cuánto volumen.",
    href: "/rechazos",
  },
  {
    key: "tmr",
    label: "TMR · Tiempo medio de ruta",
    nivel: "proceso",
    parentKey: "vol_entregado_pdv",
    unidad: "hs",
    mejorSi: "menor",
    metaDefault: 6.5,
    fuente:
      "Duración promedio de las rutas finalizadas (Foxtrot). Es el mismo dato del nodo Tiempo en Ruta del Árbol del Sueño.",
    href: "/indicadores/tiempo-ruta",
  },
  {
    key: "dqi",
    label: "DQI",
    nivel: "proceso",
    parentKey: "vol_entregado_pdv",
    unidad: "PPM",
    mejorSi: "menor",
    metaDefault: null,
    fuente:
      "Delivery Quality Index corregido: roturas en ruta + reempaque sobre el volumen entregado (auditoría H2, punto 1.4).",
    href: "/indicadores/dqi",
  },
  {
    key: "ob",
    label: "Ocupación de bodega",
    nivel: "proceso",
    parentKey: "vol_cargado_camion",
    unidad: "%",
    mejorSi: "mayor",
    metaDefault: 100,
    fuente:
      "Cumplimiento del objetivo de carga: CEq promedio por viaje sobre los 600 CEq objetivo (100% = objetivo alcanzado). Cuánto del camión se llenó sobre los 1.440 CEq de bodega se ve en el detalle del módulo.",
    href: "/indicadores/ocupacion-bodega",
  },

  // ── Actividad ───────────────────────────────────────────────────────────
  {
    key: "pdv_camion",
    label: "PDV por camión",
    nivel: "actividad",
    parentKey: "rechazo_pedidos",
    unidad: "PDV",
    mejorSi: "sin",
    metaDefault: null,
    fuente: "Clientes visitados por ruta (Foxtrot). Cuántas bocas atiende cada camión por viaje.",
  },
  {
    key: "click_score",
    label: "Performance de clic",
    nivel: "actividad",
    parentKey: "tmr",
    unidad: "%",
    mejorSi: "mayor",
    metaDefault: null,
    fuente:
      "Driver click score de Foxtrot: si el chofer marca la entrega en el momento en que la hace. Sin esto, ninguna medición de ruta es confiable.",
  },
  {
    key: "adherencia_secuencia",
    label: "Adherencia a la secuencia",
    nivel: "actividad",
    parentKey: "tmr",
    unidad: "%",
    mejorSi: "mayor",
    metaDefault: null,
    fuente:
      "Cuánto respeta el chofer el orden de reparto planificado (Foxtrot). Salirse de la secuencia alarga la ruta y llega tarde al PDV.",
  },
  {
    key: "fuera_ruta",
    label: "Fuera de ruta",
    nivel: "actividad",
    parentKey: "tmr",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: null,
    fuente: "Entregas hechas fuera de la ruta planificada del día.",
    href: "/planeamiento/priorizacion-entrega",
  },
  {
    key: "dispersion_tiempo",
    label: "Dispersión de tiempo",
    nivel: "actividad",
    parentKey: "tmr",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: 10,
    fuente:
      "Desvío del tiempo real de ruta contra el planificado por Foxtrot. Mismo indicador que la matinal (meta 10%, gatillo 30%).",
    href: "/indicadores/desvio-plan",
  },
  {
    key: "cajas_km",
    label: "Cajas por KM",
    nivel: "actividad",
    parentKey: "ob",
    unidad: "CEq/km",
    mejorSi: "mayor",
    metaDefault: null,
    fuente:
      "CEq cargadas ÷ km recorridos del período. Los km salen del odómetro del checklist (retorno − liberación), la misma fuente del indicador de km de las reuniones: los km de Foxtrot llegan inconsistentes y están dados de baja desde el 21/07/2026.",
  },
  {
    key: "drop_size",
    label: "Drop size",
    nivel: "actividad",
    parentKey: "ob",
    unidad: "HL/PDV",
    mejorSi: "mayor",
    metaDefault: null,
    fuente:
      "HL entregados ÷ clientes visitados. Un drop chico obliga a más paradas para el mismo volumen.",
  },

  // ── Tarea ───────────────────────────────────────────────────────────────
  {
    key: "rech_sin_dinero",
    label: "Sin dinero",
    nivel: "tarea",
    parentKey: "rechazo_pedidos",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: 1.5,
    fuente:
      "% de pedidos rechazados por «SIN DINERO» (catalogo_rechazos). Mismo nodo del Árbol del Sueño.",
    href: "/sueno/radar-rechazos",
  },
  {
    key: "rech_cerrado",
    label: "Cerrado",
    nivel: "tarea",
    parentKey: "rechazo_pedidos",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: 0.5,
    fuente:
      "% de pedidos rechazados por «CERRADO» (catalogo_rechazos). Mismo nodo del Árbol del Sueño.",
    href: "/sueno/radar-rechazos",
  },
  {
    key: "rech_producto_no_apto",
    label: "Producto no apto",
    nivel: "tarea",
    parentKey: "rechazo_pedidos",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: null,
    fuente:
      "% de pedidos rechazados por «PRODUCTO NO APTO». Es el segundo motivo del año y apunta a calidad y almacén, no al cliente.",
  },
  {
    key: "rech_sin_envases",
    label: "Sin envases",
    nivel: "tarea",
    parentKey: "rechazo_pedidos",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: null,
    fuente:
      "% de pedidos rechazados por «SIN ENVASES». Lo maneja la operación: es de los PIs que el propio equipo puede mover.",
  },
  {
    key: "rech_error_distribucion",
    label: "Error de distribución",
    nivel: "tarea",
    parentKey: "rechazo_pedidos",
    unidad: "%",
    mejorSi: "menor",
    metaDefault: null,
    fuente:
      "% de pedidos rechazados por «ERROR DE DISTRIBUCIÓN» (se suman las dos variantes que trae el catálogo, con y sin tilde). Es 100% responsabilidad nuestra.",
  },
]

/** Valores que la operación gestiona desde la pantalla (tabla arbol_kpi_config). */
export interface NodoConfigValores {
  meta?: number | null
  gatillo?: number | null
  responsableId?: string | null
  responsableNombre?: string | null
  nota?: string | null
}

/** Nodo con su meta, gatillo y responsable ya resueltos. */
export interface NodoResuelto extends NodoArbolKpi {
  /** Meta vigente: la cargada este año, o la del código si nadie la tocó. */
  meta: number | null
  /** Umbral rojo. Sólo existe si alguien lo definió. */
  gatillo: number | null
  responsableId: string | null
  responsableNombre: string | null
  /** Por qué ese objetivo. Es lo que el auditor pregunta al ver una meta. */
  notaMeta: string | null
}

/** Aplica la config guardada sobre la topología del código. */
export function resolverArbol(
  config: Record<string, NodoConfigValores> = {},
): NodoResuelto[] {
  return ARBOL_RECHAZO.map((n) => {
    const c = config[n.key]
    return {
      ...n,
      meta: c?.meta ?? n.metaDefault,
      gatillo: c?.gatillo ?? null,
      responsableId: c?.responsableId ?? null,
      responsableNombre: c?.responsableNombre ?? null,
      notaMeta: c?.nota ?? null,
    }
  })
}

/** Nodos hijos directos de una key. */
export function hijosDe(key: string | null): NodoArbolKpi[] {
  return ARBOL_RECHAZO.filter((n) => n.parentKey === key)
}

/** Igual que `hijosDe` pero sobre los nodos ya resueltos. */
export function hijosResueltos(
  nodos: NodoResuelto[],
  key: string | null,
): NodoResuelto[] {
  return nodos.filter((n) => n.parentKey === key)
}

/** Nodo raíz del árbol. */
export const RAIZ_RECHAZO = ARBOL_RECHAZO.find((n) => n.parentKey === null)!

/**
 * Nodos del árbol de Tucumán que NO se implementaron, con el motivo. Se
 * muestran al pie del árbol: la auditoría pregunta por el cascadeo completo y
 * la respuesta honesta es qué falta y por qué.
 */
export const NODOS_SIN_FUENTE: { label: string; nivel: NivelKpi; motivo: string }[] = [
  {
    label: "Uso OnTime",
    nivel: "proceso",
    motivo:
      "Se mide en la app de pedidos, no en la logística. Sus dos actividades (performance de clic y adherencia a la secuencia) sí las tenemos y cuelgan de TMR.",
  },
  {
    label: "Adherencia Modulación",
    nivel: "proceso",
    motivo: "No modulamos pedidos: no hay proceso de modulación que medir.",
  },
  {
    label: "Rechazo Modulado",
    nivel: "actividad",
    motivo: "Depende de la modulación de pedidos, que no existe en Pampeana.",
  },
  {
    label: "Eficiencia Modulación",
    nivel: "actividad",
    motivo: "Depende de la modulación de pedidos, que no existe en Pampeana.",
  },
  {
    label: "Dispersión de KM",
    nivel: "actividad",
    motivo:
      "Los km recorridos de Foxtrot (fx_driven_m) llegan inconsistentes desde el CSV de ROUTE_ANALYTICS — la operación los dio de baja de la matinal el 21/07/2026. Los km planificados sí son confiables, así que el nodo se puede reactivar si se cruza contra los km del odómetro.",
  },
  {
    label: "No pedido",
    nivel: "tarea",
    motivo:
      "No existe como motivo en nuestro catálogo de rechazos. En su lugar se abrieron los tres que sí pesan acá: producto no apto, sin envases y error de distribución.",
  },
  {
    label: "NPS",
    nivel: "tarea",
    motivo:
      "Es el único que sí tiene fuente propia (módulo /nps): queda pendiente de conectar al árbol, no descartado.",
  },
  {
    label: "Minorista (%) / SMK (%)",
    nivel: "proceso",
    motivo:
      "Apertura del volumen por canal de venta. La tabla de rechazos trae ds_canal_mkt, así que se podría abrir el rechazo por canal; lo que falta es el volumen DISTRIBUIDO por canal para el denominador.",
  },
]
