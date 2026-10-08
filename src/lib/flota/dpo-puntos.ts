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
  // 🚨 El orden de este array ES el orden de las solapas. Los checklists van
  // primeros dentro de Operación: es lo que se mira todos los días.
  {
    // 🚨 El id sigue siendo "checklists" (es el estado de la solapa en la URL),
    // pero el label dice NO OK: esta sección no muestra los checklists, muestra
    // los ÍTEMS que dieron NO OK y su plan de acción. El nombre viejo hacía
    // buscar acá el checklist de salida, que ahora tiene su propia solapa.
    id: "checklists",
    label: "Check list NO OK",
    grupo: "operacion",
    puntos: ["1.3"],
    requisitos: ["R1.3.2", "R1.3.3", "R1.3.6", "R1.3.7"],
    aporta:
      "Checklist digital con estratificación por vehículo, incidencia y conductor, y seguimiento de defectos críticos.",
  },
  {
    // La misma tabla que la solapa "Historial Checklists" de /vehiculos, con el
    // mismo componente y los mismos datos: se mira todos los días para saber si
    // el chofer hizo el control y con qué odómetro, y había que salir del módulo
    // para verlo. Sigue estando también en /vehiculos, que es donde se edita.
    id: "checklist-flota",
    label: "Checklist salida / retorno",
    grupo: "operacion",
    puntos: ["1.3"],
    requisitos: ["R1.3.2", "R1.3.3"],
    aporta:
      "Checklist de liberación y de retorno por unidad y por día: quién lo hizo, a qué hora, con qué odómetro y con qué resultado. Es la verificación previa a la salida del punto 1.3.",
  },
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
    // 🚨 El id es el estado de la solapa en la URL: no renombrarlo.
    id: "cil",
    label: "CIL / 5S",
    grupo: "operacion",
    puntos: ["4.1"],
    requisitos: ["R4.1.1"],
    aporta:
      "Limpieza, inspección y lubricación autónoma (CIL/ATO) por unidad: cobertura mensual, tareas registradas con evidencia fotográfica y entrega de artículos de limpieza. Estaba dentro de Check lists, que responde otro punto (1.3, la verificación previa a la salida).",
  },
  {
    id: "analisis-items",
    label: "Análisis por ítem",
    grupo: "analisis",
    puntos: ["1.3"],
    aporta:
      "Estratificación de los defectos del checklist por ítem y por unidad: qué falla, con qué frecuencia sobre las veces evaluado, y qué defectos se repiten en la misma unidad.",
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
    // El 1.4 va acá además de en Repuestos: el panel de desecho y reciclado es
    // el que registra la disposición de las cubiertas con su certificado, que es
    // la evidencia textual de R1.4.2 ("fecha, material, proveedor" + el número
    // de fuego de cada cubierta). Mirar sólo Repuestos deja afuera el circuito.
    puntos: ["3.4", "1.4"],
    requisitos: ["R3.4.3", "R3.4.4", "R1.4.2"],
    aporta:
      "Medición milimétrica mensual, presión, rotación y alineación por unidad, y la disposición final de cada cubierta —retiro de la recicladora, certificado de descarte y número de fuego—.",
  },
  {
    // 🚨 El 4.3 NO pide medir el CO2 de cada unidad, que es lo que suena: pide
    // ELEGIR un KPI/PI por su impacto ecológico (R4.3.2) y que muestre tendencia
    // positiva sobre los últimos 3 meses. Los elegidos son emisiones por km
    // —calculadas desde el gasoil, sin medir nada— y recuperación de cubiertas
    // por recapado. Los indicadores que más se repiten en las OT (carrocería,
    // luces) quedan afuera a propósito: son de confiabilidad, no ecológicos, y
    // los puntúan el 2.2 y el 3.4.
    id: "sustentabilidad",
    label: "Sustentabilidad",
    grupo: "analisis",
    puntos: ["4.3"],
    requisitos: ["R4.3.2", "R4.3.3"],
    aporta:
      "Dos PI de sostenibilidad con serie mensual y tendencia de 3 meses: kg de CO₂ cada 100 km —calculado desde el gasoil cargado por unidad— y porcentaje de cubiertas recuperadas por recapado, con los remitos y certificados de disposición como respaldo.",
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
    // El mapa de la auditoría: qué puntuó el último ciclo y dónde está hoy la
    // evidencia de cada punto. No declara puntos propios porque los responde a
    // todos, leyéndolos.
    id: "estado-dpo",
    label: "Estado DPO",
    grupo: "gestion",
    puntos: [],
    aporta:
      "Estado de cada punto del pilar: puntaje y observación de la última auditoría, las solapas que lo respaldan y sus documentos.",
  },
  {
    // Los documentos no responden UN punto: son la evidencia documental de
    // todos. Por eso la solapa no declara puntos propios y la lista los agrupa
    // por el punto que cada documento dice responder.
    id: "documentos",
    label: "SOP y SLA",
    grupo: "gestion",
    puntos: [],
    aporta:
      "Procedimientos operativos estándar y acuerdos de servicio del pilar, con el punto del DPO que responde cada uno y su estado de firma.",
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

/** Las solapas del módulo que declaran responder un punto ("2.3"). */
export function seccionesDeFlotaPorPunto(numero: string): SeccionFlota[] {
  return SECCIONES_FLOTA.filter((s) => s.puntos.includes(numero))
}

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
