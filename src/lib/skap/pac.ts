import type { SkapRol } from "@/types/database"
import { normalizarHabilidad } from "@/lib/skap/talento"

// Vínculo Matriz SKAP ↔ PAC (las capacitaciones calendarizadas en la tabla
// `capacitaciones`). Vive fuera del action porque un archivo "use server" sólo
// puede exportar funciones async.

export interface CapacitacionPac {
  id: string
  titulo: string
  fecha: string
  pilar: string | null
  /** Estado efectivo: el manual (cursos externos) manda sobre el de la tabla. */
  estado: string
}

/** Pilar con el que se crea en el PAC una capacitación que sale de la matriz. */
export const PILAR_DE_ROL: Record<SkapRol, string> = {
  chofer: "Entrega",
  ayudante: "Entrega",
  temporal: "Entrega",
  pickero: "Almacen",
  autoelevadorista: "Almacen",
  mantenimiento: "Almacen",
  administrativo: "Entrega",
}

/**
 * Temas de la matriz que en el PAC se llaman distinto: si la habilidad
 * contiene la clave, cualquiera de estas frases en el título suma fuerte.
 */
const SINONIMOS: [string, string[]][] = [
  ["manejo defensivo", ["manejo defensivo", "conduccion segura"]],
  ["manejo manual de carga", ["manejo manual de cargas"]],
  ["emergencia", ["emergencia", "brigada", "primeros auxilios"]],
  ["aplicacion de er", ["er del puesto", "rutas criticas"]],
  ["epp", ["epp", "salud ocupacional"]],
  ["reporte de accidente", ["reporte de lesiones", "investigacion de incidentes"]],
  ["calidad", ["calidad"]],
  ["entrega del producto", ["ejecucion de entrega", "en ruta"]],
  ["estado general del camion", ["checklist de flota", "pre ruta"]],
  ["foxtrot", ["herramientas digitales"]],
  ["documentacion", ["cierre de caja", "herramientas digitales"]],
  ["rendicion", ["cierre de caja", "manejo de efectivo"]],
  ["cobranza", ["cierre de caja", "manejo de efectivo"]],
  ["rechazo", ["rechazo"]],
  ["5s", ["5s"]],
  ["5 s", ["5s"]],
  ["objetivos", ["satisfaccion del cliente", "herramientas de gestion", "ciclo de gestion"]],
  ["operacion del distribuidor", ["delivery team journey", "ejecucion de entrega"]],
  ["programa dpo", ["dpo"]],
  ["autoelevador", ["autoelevador"]],
  ["glp", ["glp"]],
  ["zorra", ["zorra"]],
  ["picking", ["picking"]],
  ["canchas", ["picking", "lay out"]],
  ["reempaque", ["reempaque"]],
  ["frescura", ["pri", "fefo", "calidad"]],
  ["roturas", ["rotura"]],
  ["envases", ["clasificacion"]],
  ["retornos", ["devoluciones"]],
  ["lubricacion", ["mantenimiento"]],
  ["maquina", ["autoelevador", "mantenimiento"]],
  ["politicas y procedimiento", ["politica"]],
]

const VACIAS = new Set([
  "de", "del", "la", "las", "los", "el", "en", "y", "a", "que", "para", "por", "con", "sus", "su",
  "conocimiento", "conocimientos", "general", "generales", "sobre", "gestion", "correcto", "uso",
  "procedimiento", "aplicacion", "operacion", "practica", "control", "tratamiento", "producto", "productos",
  "manejo", "carga", "cargas", "puesto",
])

function palabras(s: string): Set<string> {
  return new Set(normalizarHabilidad(s).split(" ").filter((w) => w.length >= 3 && !VACIAS.has(w)))
}

/**
 * Capacitaciones del PAC que tratan una habilidad, de la más a la menos
 * probable. Sinónimo = 3 puntos; cada palabra significativa en común = 1.
 * Las canceladas no se sugieren; a igualdad de puntaje va la de fecha más
 * cercana a hoy (primero las que vienen).
 */
export function sugerirCapacitaciones(
  habilidad: string,
  caps: CapacitacionPac[],
  hoy: string,
  max = 3,
): CapacitacionPac[] {
  const h = normalizarHabilidad(habilidad)
  const ph = palabras(habilidad)
  const frases = SINONIMOS.filter(([clave]) => h.includes(clave)).flatMap(([, f]) => f)

  return caps
    .filter((c) => c.estado !== "cancelada")
    .map((c) => {
      // Frase completa, no pedazo de palabra: «pri» no tiene que caer en «primeros».
      const t = ` ${normalizarHabilidad(c.titulo)} `
      let puntos = frases.some((f) => t.includes(` ${f} `)) ? 3 : 0
      for (const w of palabras(c.titulo)) if (ph.has(w)) puntos++
      return { c, puntos }
    })
    .filter((x) => x.puntos >= 2)
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        Number(b.c.fecha >= hoy) - Number(a.c.fecha >= hoy) ||
        Math.abs(Date.parse(a.c.fecha) - Date.parse(hoy)) - Math.abs(Date.parse(b.c.fecha) - Date.parse(hoy)),
    )
    .slice(0, max)
    .map((x) => x.c)
}

/** Resultado de una persona en una capacitación del PAC, tal como la ve la matriz. */
export type EstadoPacPersona = "no_inscripta" | "inscripta" | "cumplida"

/**
 * Cumplida = aprobó el examen, o estuvo presente en una capacitación que ya
 * figura completada (los cursos externos no se rinden en la app).
 */
export function estadoPacPersona(
  asistencia: { presente: boolean; resultado: string } | undefined,
  estadoCapacitacion: string,
): EstadoPacPersona {
  if (!asistencia) return "no_inscripta"
  if (asistencia.resultado === "aprobado") return "cumplida"
  if (asistencia.presente && estadoCapacitacion === "completada") return "cumplida"
  return "inscripta"
}
