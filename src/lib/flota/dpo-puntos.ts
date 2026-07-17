// Mapa único sección del módulo de flota → punto del pilar FLOTA de DPO.
//
// Hasta ahora el vínculo con DPO vivía como comentarios sueltos en cada archivo
// (`// DPO 1.2`), invisibles para el auditor. Acá pasa a ser dato: la UI lo
// muestra y el badge enlaza a la evidencia cargada del punto.
//
// Los códigos salen de la tabla `preguntas` del pilar Flota (pilar_codigo "flota").
// Un punto puede responderse desde varias secciones y una sección puede cubrir
// varios puntos: por eso `puntos` es una lista.

export const PILAR_FLOTA_CODIGO = "flota"

export interface PuntoDpo {
  numero: string
  titulo: string
  bloque: string
  mandatorio: boolean
}

/** Los 15 puntos del pilar Flota, en el orden oficial de la auditoría. */
export const PUNTOS_FLOTA: PuntoDpo[] = [
  { numero: "1.1", titulo: "Documentos / Habilitaciones", bloque: "Compliance", mandatorio: true },
  { numero: "1.2", titulo: "Estándares de Flota", bloque: "Compliance", mandatorio: true },
  { numero: "1.3", titulo: "Checklist de Flota", bloque: "Compliance", mandatorio: true },
  { numero: "1.4", titulo: "Disposición de residuos de Mantenimiento", bloque: "Compliance", mandatorio: false },
  { numero: "2.1", titulo: "Clientes de Flota", bloque: "Confiabilidad de la Flota", mandatorio: false },
  { numero: "2.2", titulo: "Mantenimiento Preventivo", bloque: "Confiabilidad de la Flota", mandatorio: false },
  { numero: "2.3", titulo: "Políticas y Gestión de Piezas de Inventario", bloque: "Confiabilidad de la Flota", mandatorio: false },
  { numero: "2.4", titulo: "Mantenimiento Correctivo", bloque: "Confiabilidad de la Flota", mandatorio: false },
  { numero: "3.1", titulo: "Reuniones semanales", bloque: "Gestión de Flota", mandatorio: false },
  { numero: "3.2", titulo: "Presupuesto de Gastos de Flota", bloque: "Gestión de Flota", mandatorio: false },
  { numero: "3.3", titulo: "Consumo de Combustible", bloque: "Gestión de Flota", mandatorio: false },
  { numero: "3.4", titulo: "Políticas y Gestión de Neumáticos", bloque: "Gestión de Flota", mandatorio: false },
  { numero: "4.1", titulo: "ATO Formal Program & Cleaning Area", bloque: "Autonomía y Mejoras", mandatorio: false },
  { numero: "4.2", titulo: "Maintenance improvements & results", bloque: "Autonomía y Mejoras", mandatorio: false },
  { numero: "4.3", titulo: "Sustainability Goals", bloque: "Autonomía y Mejoras", mandatorio: false },
]

const PUNTO_POR_NUMERO = new Map(PUNTOS_FLOTA.map((p) => [p.numero, p]))

export function puntoFlota(numero: string): PuntoDpo | undefined {
  return PUNTO_POR_NUMERO.get(numero)
}

/** Grupos de la barra de secciones. Las 12 solapas planas no tenían jerarquía:
 *  los tableros del día convivían con el back-office. */
export type GrupoFlota = "operacion" | "analisis" | "activos" | "gestion"

export const GRUPO_LABELS: Record<GrupoFlota, string> = {
  operacion: "Operación",
  analisis: "Análisis",
  activos: "Activos",
  gestion: "Gestión",
}

export interface SeccionFlota {
  /** value de la Tab (no cambiar: es el estado de la URL). */
  id: string
  label: string
  grupo: GrupoFlota
  /** Puntos del pilar Flota que esta sección responde ante la auditoría. */
  puntos: string[]
  /** Requisitos puntuales que la sección evidencia, si aplica (ej. "R1.1.4"). */
  requisitos?: string[]
  /** Qué demuestra la sección, en el lenguaje del auditor. */
  aporta: string
}

export const SECCIONES_FLOTA: SeccionFlota[] = [
  {
    id: "tablero",
    label: "Tablero operativo",
    grupo: "operacion",
    puntos: ["2.2", "1.1"],
    requisitos: ["R2.2.3", "R1.1.4"],
    aporta:
      "Adherencia al plan preventivo en herramienta digital y unidades fuera de servicio por documentación.",
  },
  {
    id: "programacion",
    label: "Programación OT",
    grupo: "operacion",
    puntos: ["2.2", "2.4"],
    requisitos: ["R2.2.3"],
    aporta:
      "Programación semanal de órdenes de trabajo por unidad, con registro histórico y orden imprimible para el taller.",
  },
  {
    id: "historial",
    label: "Órdenes de Trabajo",
    grupo: "operacion",
    puntos: ["2.4"],
    requisitos: ["R2.4.1", "R2.4.2"],
    aporta:
      "Registro digital de todas las órdenes de servicio correctivo, estratificable por unidad, tipo y estado.",
  },
  {
    id: "checklists",
    label: "Check lists",
    grupo: "operacion",
    puntos: ["1.3"],
    requisitos: ["R1.3.2", "R1.3.3", "R1.3.6", "R1.3.7"],
    aporta:
      "Checklist digital con estratificación por vehículo, incidencia y conductor, y seguimiento de defectos críticos.",
  },
  {
    id: "indicadores",
    label: "Indicadores",
    grupo: "analisis",
    puntos: ["2.1", "4.3"],
    requisitos: ["R2.1.3", "R2.1.4", "R4.3.2"],
    aporta:
      "PIs de flota con meta, serie histórica y planes de acción asociados. Incluye la huella de CO₂.",
  },
  {
    id: "seguimiento",
    label: "Seguimiento de flota",
    grupo: "analisis",
    puntos: ["2.1"],
    requisitos: ["R2.1.3"],
    aporta:
      "Disponibilidad y utilización de la flota de distribución, por unidad y día a día.",
  },
  {
    id: "piramide",
    label: "Pirámide de defectos",
    grupo: "analisis",
    puntos: ["4.2"],
    requisitos: ["R4.2.3"],
    aporta:
      "Pirámide de flota: roturas arriba y preventivo abajo, para atacar la causa raíz del correctivo.",
  },
  {
    id: "neumaticos",
    label: "Neumáticos",
    grupo: "activos",
    puntos: ["3.4"],
    requisitos: ["R3.4.3", "R3.4.4"],
    aporta:
      "Medición milimétrica mensual, presión, rotación y alineación por unidad.",
  },
  {
    id: "estandares",
    label: "Estándares",
    grupo: "activos",
    puntos: ["1.2"],
    requisitos: ["R1.2.1", "R1.2.3"],
    aporta:
      "Matriz de cumplimiento de los GTS (estándares técnicos globales) controlada electrónicamente.",
  },
  {
    id: "herramientas",
    label: "Herramientas",
    grupo: "activos",
    puntos: ["4.1"],
    requisitos: ["R4.1.1"],
    aporta: "Registro del pañol que habilita el área de Limpieza, Inspección y Lubricación (CIL).",
  },
  {
    id: "repuestos",
    label: "Repuestos",
    grupo: "gestion",
    puntos: ["2.3", "1.4"],
    requisitos: ["R2.3.2", "R1.4.2"],
    aporta:
      "Stock mínimo/objetivo/máximo con recuentos, y trazabilidad de la disposición de residuos de mantenimiento.",
  },
  {
    id: "gastos",
    label: "Gastos",
    grupo: "gestion",
    puntos: ["3.2"],
    requisitos: ["R3.2.1", "R3.2.2"],
    aporta: "Gasto real de flota imputado por unidad y proveedor, contra presupuesto.",
  },
  {
    id: "plantillas",
    label: "Plan / Plantillas",
    grupo: "gestion",
    puntos: ["2.2"],
    requisitos: ["R2.2.2", "R2.2.6"],
    aporta:
      "Plan preventivo por tipo de unidad según ciclo de km/horas/tiempo, con overrides por unidad.",
  },
]

const SECCION_POR_ID = new Map(SECCIONES_FLOTA.map((s) => [s.id, s]))

export function seccionFlota(id: string): SeccionFlota | undefined {
  return SECCION_POR_ID.get(id)
}

export const GRUPOS_ORDEN: GrupoFlota[] = ["operacion", "analisis", "activos", "gestion"]

export function seccionesDeGrupo(g: GrupoFlota): SeccionFlota[] {
  return SECCIONES_FLOTA.filter((s) => s.grupo === g)
}

/** Link a la evidencia cargada del punto (bucket dpo-evidencia). El punto viaja
 *  con guion en la URL: 2.2 → 2-2. */
export function hrefEvidencia(numero: string): string {
  return `/evidencia/${PILAR_FLOTA_CODIGO}/${numero.replace(".", "-")}`
}

/** Puntos del pilar que NINGUNA sección del módulo declara responder.
 *  Se calcula para no mentirle al auditor por omisión. */
export function puntosSinSeccion(): PuntoDpo[] {
  const cubiertos = new Set(SECCIONES_FLOTA.flatMap((s) => s.puntos))
  return PUNTOS_FLOTA.filter((p) => !cubiertos.has(p.numero))
}
