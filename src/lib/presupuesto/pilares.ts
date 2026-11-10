/**
 * Pilares del presupuesto: a qué pilar de DPO pertenece cada rubro de gasto.
 *
 * Son los siete pilares del programa más «Administración» para lo que no es
 * de ningún pilar (impuestos, amortizaciones, bancarios). Sirve para filtrar
 * las tareas de análisis de desvíos en /presupuesto: «todos los gastos de
 * Flota», por ejemplo.
 *
 * El pilar de una tarea se guarda en `presupuestos_tareas.pilar` y se puede
 * elegir a mano. Cuando no se eligió, se infiere del rubro (`inferirPilar`),
 * con el catálogo de rubros del EERR como primera fuente cuando el rubro
 * está catalogado. Las reglas viven acá y en ningún otro lado: el SQL no
 * clasifica, lo hace la acción «Clasificar por pilar».
 *
 * Sin "use server": lo importan tanto el cliente como las actions.
 */

export const PILARES = [
  "flota",
  "entrega",
  "almacen",
  "gente",
  "seguridad",
  "gestion",
  "planificacion",
  "administracion",
] as const

export type PilarPresupuesto = (typeof PILARES)[number]

export const PILAR_LABELS: Record<PilarPresupuesto, string> = {
  flota: "Flota",
  entrega: "Entrega",
  almacen: "Almacén",
  gente: "Gente",
  seguridad: "Seguridad",
  gestion: "Gestión",
  planificacion: "Planificación",
  administracion: "Administración",
}

/** Clases del badge por pilar (mismo tono que las solapas del programa). */
export const PILAR_BADGE: Record<PilarPresupuesto, string> = {
  flota: "border-blue-200 bg-blue-50 text-blue-700",
  entrega: "border-violet-200 bg-violet-50 text-violet-700",
  almacen: "border-amber-200 bg-amber-50 text-amber-800",
  gente: "border-pink-200 bg-pink-50 text-pink-700",
  seguridad: "border-red-200 bg-red-50 text-red-700",
  gestion: "border-teal-200 bg-teal-50 text-teal-700",
  planificacion: "border-indigo-200 bg-indigo-50 text-indigo-700",
  administracion: "border-slate-200 bg-slate-100 text-slate-600",
}

export function esPilar(v: unknown): v is PilarPresupuesto {
  return typeof v === "string" && (PILARES as readonly string[]).includes(v)
}

/** Categoría del catálogo de rubros (`presupuesto_rubros_catalogo.categoria`) → pilar. */
const CATEGORIA_CATALOGO_A_PILAR: Record<string, PilarPresupuesto> = {
  FLOTA: "flota",
  ENTREGA: "entrega",
  ACARREO: "entrega",
  ALMACEN: "almacen",
  INSTALACIONES: "almacen",
  GENTE: "gente",
  ADMINISTRACION: "administracion",
}

export function pilarDesdeCategoriaCatalogo(
  categoria: string | null | undefined
): PilarPresupuesto | null {
  if (!categoria) return null
  return CATEGORIA_CATALOGO_A_PILAR[normalizarTexto(categoria)] ?? null
}

/** Mayúsculas, sin tildes ni espacios repetidos: para comparar rubros escritos a mano. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Reglas por palabra clave sobre el rubro. El ORDEN importa: las pérdidas y
 * los elementos de seguridad van antes que las reglas genéricas de flota o
 * administración («SEGURO RODADOS» es Flota, «SEGURO CONTRA INCENDIOS» no;
 * «FALTANTE ACARREO» es una pérdida de Almacén, no un costo de Entrega).
 */
const REGLAS: Array<[PilarPresupuesto, RegExp]> = [
  // Seguridad: EPP, elementos de seguridad, médicos, ART, matafuegos.
  [
    "seguridad",
    /\bEPP\b|ELEMENTOS? DE SEGURIDAD|ACCESORIOS DE SEGURIDAD|MEDIC|PREOCUPACIONAL|\bART\b|MATAFUEGO|EXTINTOR/,
  ],
  // Almacén: pérdidas, envases, inventario, autoelevadores alquilados/asegurados, instalaciones del depósito.
  [
    "almacen",
    /PERDIDA|\bNAC\b|ENVASE|ROTURA|DERRAME|VENCIDO|INVENTARIO|DIF AUDITORIA|FALTANTE|ALQUILER.*AUTOELEVADOR|SEGURO.*AUTOELEVADOR|ALMACEN|DEPOSITO|INSTALACION|ELECTRICIDAD|\bAGUA\b|\bGAS\b(?!-?OIL)/,
  ],
  // Entrega: fleteros (subcontratación de flota = acarreo), peajes, multas de tránsito, tasa de abasto, sobrecargas.
  [
    "entrega",
    /SUBCONTRAT|FLETE|ACARREO|PEAJE|MULTAS? DE TRANSITO|TRANSITO DISTRIBUCION|TASA DE ABASTO|ABASTO|SOBRECARGA|DISTRIBUCION|ENTREGA|REPARTO/,
  ],
  // Flota: rodados, lubricantes (el combustible va a Entrega, ver esCombustible), cubiertas, mantenimiento de autoelevadores, VTV, patentes, seguros de rodados.
  [
    "flota",
    /RODADO|CAMION|COMBUSTIBLE|GASOIL|GAS-OIL|GAS OIL|LUBRICANTE|NEUMATIC|CUBIERTA|AUTOELEVADOR|\bVTV\b|VERIFICACION TECNICA|PATENTE|SENASA|LAVADO|\bGPS\b|RASTREO|SATELITAL|SISTEMAS? FLOTA|\bMTTO\b|MANTENIMIENTO DE VEH|REPARACION.*VEH|MULTA|TALLER|\bFLOTA\b/,
  ],
  // Gente: todo lo laboral y de personal.
  [
    "gente",
    /SUELDO|JORNAL|LABORAL|HS\.? ?EX|HORAS? EXTRA|INCENTIVO|VACACION|\bSAC\b|CARGAS SOCIALES|GREMIAL|ANTIGUEDAD|PRESENTISMO|\bADIC\b|ADICIONAL|ALCANCE DE OBJETIVOS|GRATIFICACION|INDEMNIZ|JUICIO|ROPA DE TRABAJO|ATENCION(ES)? AL PERSONAL|REFRIGERIO|CAPACITACION|SELECCION DE PERSONAL|MOVILIDAD|VIATICO|RECONOCIMIENTO|ESTUDIO JURIDICO|ESTUDIO LABORAL|SEGURO DE VIDA|REMUNERATIVO|PERSONAL|SUTIAGA|\bCMQ\b|HOTEL|PREPAGA|PREAVISO|REMIS|PASAJE/,
  ],
  // Gestión: sistemas, honorarios, consultoría, contable, librería.
  [
    "gestion",
    /SISTEMA|SOFTWARE|LICENCIA|COMPUTACION|INTERNET|TELEFON|HONORARIO|CONSULTOR|ESTUDIO CONTABLE|IMPOSITIV|AUDITOR|PAPELERIA|LIBRERIA/,
  ],
  // Administración: impuestos, tasas, amortizaciones, financiero, seguros generales, alquileres, vigilancia.
  [
    "administracion",
    /IMPUESTO|\bTASAS?\b|\bABL\b|AMORTIZACION|INTERES|BANCARIO|FINANCIA|SEGURO|ALQUILER|INTERCOMPA|ADMINISTRATIV|SEGURIDAD PRIVADA|VIGILANCIA|ALARMA|PUBLICIDAD|MARKETING|ESCRIBAN|CAUDALES|CHEQ|CAMBIO|COMISION|MENSAJERIA|ENCOMIENDA|LIMP|MUEBLES|OTROS/,
  ],
]

/**
 * Combustible del reparto (gasoil, urea, nafta) = costo de ENTREGA (decisión de
 * Fausto 09/11, DPO Entrega 3.1), aunque el catálogo lo tenga en FLOTA. Se mira
 * el sub-rubro (lo que va después de ":") para que «COMBUSTIBLES Y
 * LUBRICANTES: Lubricantes» siga en Flota.
 */
function esCombustible(rubroNormalizado: string): boolean {
  const sub = rubroNormalizado.includes(":") ? rubroNormalizado.slice(rubroNormalizado.lastIndexOf(":") + 1) : rubroNormalizado
  return /COMBUSTIBLE|GASOIL|GAS-? ?OIL|UREA|NAFTA/.test(sub) && !/LUBRICANTE/.test(sub)
}

/** Pilar inferido del nombre del rubro, o null si ninguna regla lo reconoce. */
export function inferirPilar(rubro: string): PilarPresupuesto | null {
  const r = normalizarTexto(rubro)
  if (!r) return null
  if (esCombustible(r)) return "entrega"
  for (const [pilar, re] of REGLAS) {
    if (re.test(r)) return pilar
  }
  return null
}

/**
 * Pilar para un rubro: Seguridad si el rubro es de seguridad (EPP, elementos
 * de seguridad, médicos, ART: el catálogo los reparte por área responsable,
 * no por pilar); si no, lo que diga el catálogo si el rubro está catalogado;
 * si no, las reglas por palabra clave.
 */
export function pilarParaRubro(
  rubro: string,
  categoriaCatalogo?: string | null
): PilarPresupuesto | null {
  const inferido = inferirPilar(rubro)
  if (inferido === "seguridad") return inferido
  if (esCombustible(normalizarTexto(rubro))) return "entrega"
  return pilarDesdeCategoriaCatalogo(categoriaCatalogo) ?? inferido
}
