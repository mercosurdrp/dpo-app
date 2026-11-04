// Sistemas del vehículo para clasificar las órdenes de trabajo (DPO Flota
// R2.2.6 y R2.4.2).
//
// Las OT correctivas se cargan en texto libre ("se sueldan la cuna y parte de
// carrocería", "cambiar guía de lona y soldar carrocería", "soldadura paragolpe
// y escalera"): tres descripciones distintas del mismo problema. Para que el
// plan preventivo pueda EVOLUCIONAR a partir de lo que se repite hace falta
// una unidad de análisis más gruesa que la descripción: el sistema.
//
// Decisiones:
//  · Son 12 sistemas, no los 7 de la categoría del plan: "general" juntaba
//    carrocería, cabina, dirección y transmisión, que son recurrencias
//    distintas con contramedidas distintas.
//  · La clasificación se SUGIERE por palabras clave y la confirma la persona
//    al cargar la OT. Las 85 OT históricas se clasifican con un backfill que
//    usa esta misma función, así el criterio es uno solo.
//  · El empate se resuelve por el orden de la lista: carrocería antes que
//    motor porque "lavado de motor por pérdida de aceite" es una pérdida y
//    "soldadura de carrocería y regulación de frenos" es carrocería (lo que
//    llevó la unidad al taller suele ir primero en el texto, pero no siempre;
//    el puntaje por cantidad de coincidencias resuelve la mayoría).

import type { MantenimientoCategoria, MantenimientoSistema } from "@/types/database"

export interface SistemaOt {
  id: MantenimientoSistema
  label: string
  /** Qué entra, en palabras de taller (para el tooltip del selector). */
  descripcion: string
  /** Categoría del plan preventivo con la que se crea una tarea de este sistema. */
  categoria: MantenimientoCategoria
  /** Expresiones sobre el texto normalizado (minúsculas, sin tildes). */
  patrones: RegExp[]
}

/** Mínimo de OT correctivas en 12 meses, en toda la flota, para llamarlo recurrente. */
export const UMBRAL_RECURRENTE_FLOTA = 3
/** Mínimo de OT correctivas en 12 meses en la MISMA unidad. */
export const UMBRAL_RECURRENTE_UNIDAD = 2
/** Ventana del análisis de recurrencia, en meses. */
export const MESES_RECURRENCIA = 12

export const SISTEMAS_OT: SistemaOt[] = [
  {
    id: "neumaticos",
    label: "Neumáticos",
    descripcion: "Cubiertas: reparación, cambio, recapado, rotación, alineación y balanceo.",
    categoria: "neumaticos",
    patrones: [/neumatic/, /cubierta/, /gomeria/, /recapad/, /pinchad/, /\brueda\b/, /balanceo/, /alineaci/],
  },
  {
    id: "carroceria_lona",
    label: "Carrocería y lona",
    descripcion:
      "Soldaduras de caja y parantes, techo, lona, puerta de cortina y sus carros, guías y manijas de lona, escaleras, estribos, paragolpes, portacarros y portaconos.",
    categoria: "general",
    patrones: [
      /soldad/, /solda\b/, /parante/, /\blona\b/, /cortina/, /carro(s)? roma/, /portacarro/, /porta ?carro/,
      /porta ?cono/, /escalera/, /estribo/, /paragolpe/, /carrocer/, /caja de carga/, /techo/, /cuna\b/,
      /guia de lona/, /guia del carro/, /manija de lona/, /manija de caja/, /filtracion/, /chapa/, /cacha/,
      /porta ?matafuego/, /soporte de matafuego/, /burlete/,
    ],
  },
  {
    id: "refrigeracion_fluidos",
    label: "Pérdidas y refrigeración",
    descripcion:
      "Pérdidas de agua, aceite, combustible o urea; lavado de motor para buscar la fuga; mangueras, canillas, juntas; radiador, intercooler y bomba de agua.",
    categoria: "motor",
    patrones: [
      /perdida/, /perdida (de )?(agua|aceite|combustible|gasoil|urea|liquido)/, /fuga/, /lavado de motor/, /lava motor/, /radiador/, /intercooler/, /interculer/,
      /bomba de agua/, /bo[mb]a de agua/, /refrigerant/, /manguera/, /canilla/, /junta/, /urea/,
      /aceite hidraulico/, /drenaje/, /rebalsa/,
    ],
  },
  {
    id: "luces",
    label: "Luces y balizas",
    descripcion: "Focos, micas, balizas, ópticas, faros y luces lineales.",
    categoria: "electrico",
    patrones: [/\bfoco/, /\bmica/, /baliza/, /optica/, /\bfaro/, /luz\b/, /luces/, /lampara/, /\bled\b/],
  },
  {
    id: "electrico",
    label: "Eléctrico",
    descripcion:
      "Batería, alternador, burro de arranque, ECU, sensores, vigía, cableado, cámara de retroceso, escaneo de fallas.",
    categoria: "electrico",
    patrones: [
      /bateria/, /alternador/, /burro/, /arranque/, /\becu\b/, /sensor/, /vigia/, /electric/, /cablead/,
      /chicote/, /camara/, /escaneo/, /scanner/, /tablero/, /limitad/, /limitaci/, /gps/, /bobina/, /rele\b/, /relay/,
    ],
  },
  {
    id: "frenos_aire",
    label: "Frenos y circuito de aire",
    descripcion: "Cintas, pastillas, campanas, regulación de frenos, pulmones, mangueras y pérdidas de aire.",
    categoria: "frenos",
    patrones: [/freno/, /freno aire/, /cinta/, /pastilla/, /campana/, /pulmon/, /perdida de aire/, /compresor/, /circuito de aire/],
  },
  {
    id: "transmision",
    label: "Transmisión y embrague",
    descripcion: "Caja de velocidades, embrague, cardán, crucetas, diferencial, palanca de cambios.",
    categoria: "general",
    patrones: [/caja de velocidad/, /caja de cambio/, /embrague/, /cardan/, /cruceta/, /diferencial/, /palanca de cambio/, /fuelle/],
  },
  {
    id: "suspension_direccion",
    label: "Suspensión y dirección",
    descripcion: "Amortiguadores, elásticos, tren delantero, dirección, bujes, rótulas.",
    categoria: "general",
    patrones: [/amortiguador/, /elastico/, /tren delantero/, /direccion/, /\bbuje/, /rotula/, /barra estabiliz/, /suspension/],
  },
  {
    id: "cabina_confort",
    label: "Cabina y confort",
    descripcion: "Asientos y tapizados, aire acondicionado, espejos, vidrios, manijas de puerta, ploteo.",
    categoria: "general",
    patrones: [
      /asiento/, /butaca/, /tapiz/, /aire acondicionado/, /\ba\/?a\b/, /refrigerante.*cabina/, /espejo/, /vidrio/,
      /parabrisa/, /manija de puerta/, /cerradura/, /ploteo/, /grafica/, /calefacc/, /gas refrigerante/,
    ],
  },
  {
    id: "hidraulico",
    label: "Hidráulico",
    descripcion: "Autoelevadores: bomba y circuito hidráulico, mástil, cadenas, horquillas.",
    categoria: "hidraulico",
    patrones: [/hidraul/, /bomba hidraul/, /mastil/, /horquilla/, /cadena/, /elevaci/],
  },
  {
    id: "motor",
    label: "Motor",
    descripcion: "Turbo, pistones, válvulas, bielas, tapa de cilindros, inyección, correas, filtros, aceite.",
    categoria: "motor",
    patrones: [
      /\bmotor\b/, /turbo/, /piston/, /valvula/, /biela/, /tapa de cilindro/, /cilindro/, /inyec/, /correa/,
      /filtro/, /aceite/, /rectific/, /bru[ñn]/, /cigue/, /distribucion/, /bomba inyectora/,
    ],
  },
  {
    id: "otro",
    label: "Otro",
    descripcion: "No encaja en ningún sistema: revisarlo a mano.",
    categoria: "general",
    patrones: [],
  },
]

export const SISTEMA_POR_ID = new Map<MantenimientoSistema, SistemaOt>(
  SISTEMAS_OT.map((s) => [s.id, s])
)

export function labelSistema(id: MantenimientoSistema | null | undefined): string {
  return id ? SISTEMA_POR_ID.get(id)?.label ?? id : "Sin clasificar"
}

/** Minúsculas y sin tildes, para que "pérdida" y "perdida" sean lo mismo. */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
}

export interface SugerenciaSistema {
  sistema: MantenimientoSistema
  /** Cantidad de coincidencias del sistema ganador (1 = débil). */
  puntos: number
  /** Qué patrones pegaron, para mostrar por qué se sugirió. */
  coincidencias: string[]
}

/**
 * Deduce el sistema de una OT a partir de sus textos (tareas, observaciones).
 * Devuelve null si ningún patrón coincide. Las OT de rubro neumáticos van
 * directo a `neumaticos` sin mirar el texto.
 */
export function sugerirSistema(
  textos: Array<string | null | undefined>,
  opts?: { rubro?: string | null }
): SugerenciaSistema | null {
  if (opts?.rubro === "neumaticos") {
    return { sistema: "neumaticos", puntos: 99, coincidencias: ["rubro neumáticos"] }
  }
  const texto = normalizarTexto(textos.filter((t): t is string => !!t && t.trim() !== "").join(" · "))
  if (!texto) return null

  let mejor: SugerenciaSistema | null = null
  for (const s of SISTEMAS_OT) {
    if (s.patrones.length === 0) continue
    const coincidencias: string[] = []
    for (const p of s.patrones) {
      const m = texto.match(p)
      if (m) coincidencias.push(m[0].trim())
    }
    // El empate lo gana el que está antes en la lista (ver cabecera).
    if (coincidencias.length > 0 && (!mejor || coincidencias.length > mejor.puntos)) {
      mejor = { sistema: s.id, puntos: coincidencias.length, coincidencias }
    }
  }
  return mejor
}

/** Textos de una OT que sirven para clasificarla. */
export function textosDeOt(ot: {
  observaciones?: string | null
  tareas?: Array<{ descripcion?: string | null }> | null
}): string[] {
  return [...(ot.tareas ?? []).map((t) => t.descripcion ?? ""), ot.observaciones ?? ""]
}

/**
 * Sistema de una tarea del plan preventivo, por su nombre y palabras clave.
 * Sirve para decir "este sistema ya lo cubre el plan con la tarea X".
 */
export function sistemaDeTareaPlan(t: {
  nombre: string
  categoria: MantenimientoCategoria
  palabras_clave?: string[] | null
}): MantenimientoSistema {
  const sug = sugerirSistema([t.nombre, ...(t.palabras_clave ?? [])])
  if (sug) return sug.sistema
  switch (t.categoria) {
    case "frenos":
      return "frenos_aire"
    case "neumaticos":
      return "neumaticos"
    case "electrico":
      return "electrico"
    case "hidraulico":
      return "hidraulico"
    case "motor":
      return "motor"
    default:
      return "otro"
  }
}
