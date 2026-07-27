// Validación de la lectura de odómetro/horómetro que cargan los choferes.
//
// Un solo dedazo rompe medio módulo: como el km actual de una unidad es el
// odómetro MÁS ALTO que registró, un número con un dígito de más queda pegado
// para siempre. El 15/07/2026 se cargó 1.030.694 km en el checklist del AE908DG
// (real: 103.069) y el módulo de Neumáticos calculó 956.000 km rodados ⇒ marcó
// las 6 cubiertas en rojo. Pasó lo mismo en AE908DH, AE591EI y AF588SU.
//
// Los errores vistos NO son de separador de miles: son dígitos de más
// (1.030.694 por 103.069) o el primer dígito mal tecleado (737.625 por 137.625,
// 516.928 por 116.928). Por eso la validación no mira el formato sino el SALTO
// contra la última lectura conocida de esa unidad.
//
// Mismo criterio que usa `kmActualPorDominio` para descartar outliers, pero acá
// se aplica ANTES de guardar, para que el dato malo no entre.

/** Km/día máximo plausible para un camión o camioneta de reparto. */
export const KM_DIA_MAX_PLAUSIBLE = 1500
/** Horas/día máximas plausibles para un autoelevador. */
export const HS_DIA_MAX_PLAUSIBLE = 20

export interface LecturaPrevia {
  odometro: number
  fecha: string
}

const fmt = (n: number) => new Intl.NumberFormat("es-AR").format(n)
const fmtFecha = (f: string) => f.slice(0, 10).split("-").reverse().join("/")

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde.slice(0, 10)}T00:00:00`)
  const b = new Date(`${hasta.slice(0, 10)}T00:00:00`)
  const d = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  return Number.isFinite(d) ? d : 0
}

/**
 * Devuelve el mensaje de error, o null si la lectura es plausible.
 *
 * @param valor lectura que se está cargando (km, u horas en autoelevador)
 * @param previa última lectura conocida de la unidad (null si es la primera)
 * @param fecha fecha de la lectura nueva (ISO)
 * @param esHorometro true para autoelevadores (la lectura son horas)
 */
export function validarLectura({
  valor,
  previa,
  fecha,
  esHorometro = false,
}: {
  valor: number
  previa: LecturaPrevia | null
  fecha: string
  esHorometro?: boolean
}): string | null {
  const unidad = esHorometro ? "hs" : "km"
  const que = esHorometro ? "El horómetro" : "El odómetro"

  if (!Number.isFinite(valor) || valor <= 0) {
    return `${que} tiene que ser un número mayor a 0`
  }
  if (!previa) return null

  // El odómetro no retrocede. Cubre también el caso "faltan dígitos"
  // (se cargó 117 cuando la unidad marcaba 117.922).
  if (valor < previa.odometro) {
    return `${que} no puede ser menor al último cargado: la unidad marcaba ${fmt(
      previa.odometro
    )} ${unidad} el ${fmtFecha(previa.fecha)}. Revisá el número.`
  }

  const dias = Math.max(1, diasEntre(previa.fecha, fecha))
  const salto = valor - previa.odometro
  const porDia = salto / dias
  const max = esHorometro ? HS_DIA_MAX_PLAUSIBLE : KM_DIA_MAX_PLAUSIBLE

  if (porDia > max) {
    const enDias = dias === 1 ? "en 1 día" : `en ${dias} días`
    return `Ese número da ${fmt(Math.round(salto))} ${unidad} ${enDias}. Fijate si te sobra un dígito: la última lectura fue ${fmt(
      previa.odometro
    )} ${unidad} el ${fmtFecha(previa.fecha)}.`
  }

  return null
}
