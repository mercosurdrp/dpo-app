// Tipos y constantes de la clusterización de clientes (Planeamiento 4.2).
// Viven fuera de `clusterizacion.ts` porque ese archivo es "use server" y un
// módulo "use server" solo puede exportar funciones async (exportar un objeto
// como CLUSTER_LABELS rompe el build de Turbopack).
import type { ClusterPeriodo } from "@/lib/mercosur-dashboard"

// Los 4 clústeres del manual DPO (Planeamiento 4.2), definidos por el cruce
// 2×2 de ingresos (alto/bajo) × crecimiento (positivo/negativo).
export type ClusterId = "ganador" | "en_crecimiento" | "basico" | "ventas_bajas"

export const CLUSTER_LABELS: Record<ClusterId, string> = {
  ganador: "Ganador",
  en_crecimiento: "Productor",
  basico: "Básico",
  ventas_bajas: "Ventas Bajas",
}

// ── Baja de clúster por servicio ─────────────────────────────────────────────
// La auditoría DPO de H1 2026 pidió que las variables "pasa / no pasa" entren en
// la clusterización: el cliente que rechaza entregas por su culpa, califica mal
// la entrega (RMD) o es detractor de NPS baja al cuadrante de abajo de su misma
// columna. Se guarda el motivo para que el descenso sea auditable.
export type MotivoBaja = "rechazos" | "rmd" | "nps"

export const MOTIVO_BAJA_LABELS: Record<MotivoBaja, string> = {
  rechazos: "Rechazos",
  rmd: "RMD bajo",
  nps: "Detractor NPS",
}

/** Categorías de la encuesta NPS tal como vienen del Power BI de Quilmes. */
export type NpsCategoria = "Promoter" | "Passive" | "Detractor"

export const NPS_CATEGORIA_LABELS: Record<NpsCategoria, string> = {
  Promoter: "Promotor",
  Passive: "Pasivo",
  Detractor: "Detractor",
}

// Matriz Valor × Costo: cruce de facturación (alta/baja, mediana) con el costo
// logístico $/HL del año (alto/bajo, mediana). Cada cuadrante tiene una jugada.
export type CuadranteId = "proteger" | "optimizar" | "mantener" | "revisar"

export const CUADRANTE_LABELS: Record<CuadranteId, string> = {
  proteger: "Óptimos",
  optimizar: "Operacional",
  mantener: "Transaccional",
  revisar: "Parásitos",
}

// ── Diagrama 3D (2×2×2) ──────────────────────────────────────────────────────
// Cruce de los 3 ejes binarios → 8 tipos de cliente:
//   Z facturación (alta/baja, mediana) × X costo $/HL (mayor/menor, mediana) ×
//   Y crecimiento (mayor/menor vs el mismo semestre del año anterior).
export type CuboId =
  | "estrella" | "rentable" | "motor" | "pesado"
  | "promesa" | "hormiga" | "dilema" | "critico"

export interface CuboMeta {
  label: string
  /** Combinación cluster + cuadrante que representa (ej. "Ganador + Óptimo"). */
  combo: string
  /** Lectura / jugada recomendada. */
  jugada: string
  color: string
  /** Coordenadas para el gráfico 3D (0/1). x=costo mayor, y=crecimiento mayor, z=facturación alta. */
  x: 0 | 1
  y: 0 | 1
  z: 0 | 1
}

export const CUBO_META: Record<CuboId, CuboMeta> = {
  estrella: { label: "Estrella", combo: "Ganador + Óptimo", jugada: "Lo mejor: factura, barato y crece. Proteger y replicar.", color: "#059669", x: 0, y: 1, z: 1 },
  rentable: { label: "Rentable", combo: "Básico + Óptimo", jugada: "Gran margen y estable (vaca lechera). Defender y ordeñar.", color: "#0d9488", x: 0, y: 0, z: 1 },
  motor: { label: "Motor", combo: "Ganador + Operacional", jugada: "Crece y factura pero caro. Abaratar la logística.", color: "#2563eb", x: 1, y: 1, z: 1 },
  pesado: { label: "Pesado", combo: "Básico + Operacional", jugada: "Factura, caro y plano. Optimizar costo de servir.", color: "#d97706", x: 1, y: 0, z: 1 },
  promesa: { label: "Promesa", combo: "Productor + Transaccional", jugada: "Chico, barato y subiendo. Potenciar / desarrollar.", color: "#0891b2", x: 0, y: 1, z: 0 },
  hormiga: { label: "Hormiga", combo: "Ventas Bajas + Transaccional", jugada: "Chico, barato y plano. Mantener sin esfuerzo.", color: "#64748b", x: 0, y: 0, z: 0 },
  dilema: { label: "Dilema", combo: "Productor + Parásito", jugada: "Crece pero caro y chico. Vigilar: ¿escala o drena?", color: "#c026d3", x: 1, y: 1, z: 0 },
  critico: { label: "Crítico", combo: "Ventas Bajas + Parásito", jugada: "Chico, caro y cayendo (sangría). Revisar / desinvertir.", color: "#dc2626", x: 1, y: 0, z: 0 },
}

export interface ClienteClusterizado {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  promotor: string | null
  /** Supervisor de venta (derivado del promotor). */
  supervisor: string | null
  segmento: string | null
  /** Clúster final: el que le toca por facturación y crecimiento, ya con la baja aplicada. */
  cluster: ClusterId
  /** Clúster que le correspondía por facturación × crecimiento, ANTES de la baja por servicio. */
  cluster_base: ClusterId
  /** true si bajó de clúster por rechazos, RMD o NPS (cluster !== cluster_base). */
  degradado: boolean
  /** Por qué bajó. Vacío si no bajó. */
  motivos_baja: MotivoBaja[]
  ingresos_actual: number
  ingresos_anterior: number
  /** Crecimiento relativo período/período. null = cliente nuevo (sin venta previa). */
  crecimiento_pct: number | null
  bultos_actual: number
  dias_actual: number
  /** Proxy de costo de servir: bultos por visita (menor = más caro de servir). */
  drop_size: number
  /**
   * Costo logístico $/HL acumulado del año (YTD), traído del indicador Costo/PDV
   * (misma fuente que su solapa "Acumulado"). null = el PDV no tiene costo cargado.
   */
  costo_x_hl_ytd: number | null
  /** Costo $/HL por encima de la mediana del año (caro de servir). null = sin dato de costo. */
  costo_alto: boolean | null
  /** Cuadrante Valor×Costo (facturación alta/baja × $/HL alto/bajo). null = sin dato de costo. */
  cuadrante: CuadranteId | null
  /** Cubo del diagrama 3D (facturación × costo × crecimiento). null = sin dato de costo. */
  cubo: CuboId | null
  /** Equipos de frío (EDF) INSTALADOS en el PDV (comodato). 0 = ninguno. */
  equipos_frio_n: number
  /** Modelos de equipos de frío instalados (resumen). null = ninguno. */
  equipos_frio_tipos: string | null
  /** RMD promedio del cliente en la ventana (1-5). null = sin calificaciones. */
  rmd_prom: number | null
  rmd_n: number
  /** Encuestas NPS del cliente en la ventana. 0 = nunca lo encuestaron. */
  nps_n: number
  /** Score de la ÚLTIMA encuesta NPS (0-10). null = sin encuestas. */
  nps_score: number | null
  /** Categoría de la última encuesta NPS. null = sin encuestas. */
  nps_categoria: NpsCategoria | null
  /** Encuestas en las que respondió como Detractor dentro de la ventana. */
  nps_detractores: number
  /** Entregas rechazadas por CAUSA DEL CLIENTE (sin dinero/cerrado/sin envases), últimos 45 días. */
  rechazos_culpa: number
  /**
   * Entregas rechazadas por CAUSA DEL CLIENTE en TODO el período analizado (el
   * semestre, no los 45 días). Es el número que decide la baja de clúster: en una
   * ventana de 6 meses un rechazo aislado le pasa a cualquiera, dos ya es patrón.
   */
  rechazos_culpa_periodo: number
  /** Entregas rechazadas por cualquier motivo, últimos 45 días. */
  rechazos_total: number
  /** Entregas rechazadas por cualquier motivo en TODO el período analizado. */
  rechazos_total_periodo: number
  /**
   * Detalle de los rechazos por culpa del cliente (cada entrega: fecha, motivo,
   * bultos) en TODO el período: es la evidencia de la baja de clúster.
   */
  rechazos_detalle: { fecha: string; motivo: string; bultos: number }[]
  /**
   * ESTADO (responsabilidad del cliente): "no_pasa" si rechazó ≥ 1 entrega por su
   * culpa (sin dinero / cerrado / sin envases) en los últimos 45 días. Los rechazos
   * por error interno (preventa, distribución, etc.) NO cuentan.
   */
  estado: "pasa" | "no_pasa"
  /** Señal de salud: drop size (45 días) por debajo del piso (caro de servir). */
  drop_bajo: boolean
  /** Señal de salud: RMD promedio por debajo del piso (mal servicio percibido). */
  rmd_bajo: boolean
  /** SALUD de servicio: "atencion" si drop bajo o RMD bajo; "sano" si ninguna. */
  salud: "sano" | "atencion"
  // ── Censo Thomas (null = PDV fuera del censo o censado sin volumen) ──
  /** HL/mes de TODO el mercado en el PDV según el censo vigente. */
  censo_hl_mercado: number | null
  /** HL/mes que el PDV le compra a la COMPETENCIA (potencial cautivo). */
  censo_hl_comp: number | null
  /** Share of market CMQ en el PDV (0–1). */
  censo_som: number | null
  /** Banda de SOM (dominado/compartido/invadido). */
  dominio: DominioId | null
  /** Frente estratégico del cruce cubos × censo. */
  frente: FrenteId | null
  /** Score de ataque = HL competencia × facilidad del cubo (prioriza puntuales). */
  score_ataque: number | null
  /** Batalla sugerida: marca competencia top del PDV → marca CMQ espejo. */
  batalla: string | null
}

export interface ClusterResumen {
  cluster: ClusterId
  clientes: number
  ingresos_total: number
  pct_clientes: number
  pct_ingresos: number
  drop_size_prom: number
  rmd_prom: number | null
  rmd_n: number
  /** Clientes del cluster por estado de salud de servicio. */
  no_pasan: number
  en_atencion: number
  sanos: number
  /** Clientes que ENTRARON a este clúster bajando desde el de arriba. */
  degradados_recibidos: number
  /** Clientes que SALIERON de este clúster por la baja de servicio. */
  degradados_perdidos: number
}

export interface ClusterizacionData {
  periodo: ClusterPeriodo
  /**
   * Umbral de facturación del semestre que separa "alto" de "bajo": la facturación
   * del cliente Nº `max_ganadores` entre los que crecen, para que el clúster Ganador
   * no pase de ese tope y lo integren los que más facturan.
   */
  umbral_ingresos: number
  /** Tope de clientes del clúster Ganador (regla de la auditoría DPO). */
  max_ganadores: number
  /** Rechazos por culpa del cliente en el período que disparan la baja de clúster. */
  min_rechazos_baja: number
  /** RMD promedio por debajo del cual el cliente baja de clúster. */
  rmd_minimo_baja: number
  /** Umbral de costo $/HL (mediana del año) que separa "caro" de "barato". 0 si no hay datos. */
  umbral_costo: number
  resumen: ClusterResumen[]
  clientes: ClienteClusterizado[]
  // ── Censo Thomas (null/[] = sin censo cargado o base no disponible) ──
  /** Nombre del censo vigente usado para el cruce (ej. "ABR-26"). */
  censo_nombre: string | null
  /** Umbral de potencial cautivo (p75 del HL comp entre PDV con competencia). */
  umbral_potencial: number
  /** PDV censados con volumen de mercado pero SIN venta nuestra este año. */
  conquista: ConquistaPdv[]
}

// ── Cruce con el Censo Thomas (mercado vs competencia) ────────────────────────

/** Banda de share of market CMQ en el PDV según el censo. */
export type DominioId = "dominado" | "compartido" | "invadido"

export const DOMINIO_META: Record<DominioId, { label: string; desc: string; color: string }> = {
  dominado: { label: "Dominado", desc: "SOM ≥ 70% — el PDV es nuestro", color: "#059669" },
  compartido: { label: "Compartido", desc: "SOM 40–70% — convivimos con la competencia", color: "#d97706" },
  invadido: { label: "Invadido", desc: "SOM < 40% — la competencia manda en el PDV", color: "#dc2626" },
}

/** Frente estratégico del cruce cubos × censo (nivel macro nuevo). */
export type FrenteId = "casa_propia" | "muro" | "gigantes" | "veredicto" | "sin_frente"

export const FRENTE_META: Record<
  FrenteId,
  { label: string; icon: string; jugada: string; color: string }
> = {
  casa_propia: {
    label: "Ganar la casa propia",
    icon: "⚔️",
    jugada:
      "Estrellas/Rentables con mucho volumen de competencia adentro: ya entramos, ya cobramos, ya crecemos — ganar share es la venta más barata que existe.",
    color: "#059669",
  },
  muro: {
    label: "Muro defensivo",
    icon: "🏰",
    jugada:
      "Facturación alta y SOM ≥ 70%: acá no hay share que ganar, hay exclusividad que defender (evitar la entrada de CCU).",
    color: "#2563eb",
  },
  gigantes: {
    label: "Gigantes dormidos",
    icon: "💎",
    jugada:
      "Chicos PARA NOSOTROS pero grandes DEL MERCADO: el censo revela que mueven volumen — se lo compran a otro. Tratamiento de desarrollo agresivo.",
    color: "#0891b2",
  },
  veredicto: {
    label: "Veredicto con datos",
    icon: "⚖️",
    jugada:
      "Dilemas/Críticos: el censo decide — invadido con mercado = atacar (mal penetrado, no mal cliente); dominado y chico = desinvertir sin culpa, no queda jugo.",
    color: "#c026d3",
  },
  sin_frente: {
    label: "Plan del cubo",
    icon: "📦",
    jugada: "Sin oportunidad diferencial de mercado: aplica el plan genérico de su cubo.",
    color: "#64748b",
  },
}

/** PDV censado con volumen de mercado pero SIN venta nuestra este año (conquista). */
export interface ConquistaPdv {
  id_cliente: number
  hl_total: number
  hl_cmq: number
  som: number | null
  canal: string | null
  subcanal: string | null
  promotor_censo: string | null
  comp_marca: string | null
  comp_marca_hl: number
}
