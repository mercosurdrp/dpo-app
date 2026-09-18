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

// Umbrales del detector de dígito cambiado (ver `avisoDigitoCambiado`). Salen de
// los datos reales de la flota al 18/09/2026: sobre 1.087 saltos entre lecturas
// consecutivas, la mediana es 83 km, el p95 330 km y el máximo legítimo en un día
// 649 km. Todos los saltos mayores a 3.000 km del histórico son tipeos.
const SOSPECHOSO_DIA = 0.55 // del máximo plausible: 825 km/día o 11 hs/día
const NORMAL_DIA = 0.25 // del máximo plausible: 375 km/día o 5 hs/día
const SALTO_MIN = 2 // veces el máximo diario: 3.000 km o 40 hs
const PESO_DIGITO_MIN = 4 // el dígito tiene que valer 6.000 km u 80 hs

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
 * La lectura más chica que se obtiene cambiando UN dígito de `valor` sin que
 * quede por debajo de la anterior. 171.289 con previa 161.287 devuelve 161.289.
 *
 * Se exige la misma cantidad de dígitos: un número más corto o más largo ya lo
 * agarra el control de salto, y acá interesa el dedazo de una sola tecla.
 */
function candidatoDeUnDigito(valor: number, previa: number): number | null {
  const s = String(valor)
  if (String(previa).length !== s.length) return null
  let mejor: number | null = null
  for (let i = 0; i < s.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === s[i]) continue
      if (i === 0 && d === 0) continue // no acortar el número
      const c = Number(s.slice(0, i) + String(d) + s.slice(i + 1))
      if (c < previa || c >= valor) continue
      if (mejor === null || c < mejor) mejor = c
    }
  }
  return mejor
}

/** Marca el dígito que cambia entre los dos números: 1(7)1.289. */
function marcarDigito(valor: number, sugerido: number): string {
  const a = String(valor)
  const b = String(sugerido)
  const i = a.split("").findIndex((ch, k) => ch !== b[k])
  if (i < 0) return fmt(valor)
  return `${fmt(valor)} (el ${a[i]} en lugar del ${b[i]})`
}

/**
 * Detecta el DÍGITO CAMBIADO, el error que el control de salto deja pasar.
 *
 * El 14/09/2026 el AC165AJ entró con 171.289 teniendo 161.287 del 07/09: 10.002
 * km en 7 días = 1.429 km/día, justo abajo del tope de 1.500. Pasó, y como el
 * validador tampoco deja retroceder, las tres lecturas siguientes tuvieron que
 * seguir tipeando el número inflado. Ver también el 522.371 del AE591EI (25/08)
 * y el 145.237 del AF399KY (18/09).
 *
 * Criterio (conservador, para no trabar un viaje largo de verdad):
 * el salto es grande Y rápido, y cambiando un solo dígito la lectura queda en un
 * ritmo normal. El 8.628 km en 62 días del EI, que es real, no cae acá porque da
 * 139 km/día.
 */
export function avisoDigitoCambiado({
  valor,
  previa,
  fecha,
  esHorometro = false,
}: {
  valor: number
  previa: LecturaPrevia | null
  fecha: string
  esHorometro?: boolean
}): { sugerido: number; mensaje: string } | null {
  if (!previa || valor <= previa.odometro) return null
  const max = esHorometro ? HS_DIA_MAX_PLAUSIBLE : KM_DIA_MAX_PLAUSIBLE
  const unidad = esHorometro ? "hs" : "km"
  const dias = Math.max(1, diasEntre(previa.fecha, fecha))
  const salto = valor - previa.odometro
  if (salto < max * SALTO_MIN) return null
  if (salto / dias < max * SOSPECHOSO_DIA) return null

  const sugerido = candidatoDeUnDigito(valor, previa.odometro)
  if (sugerido === null || sugerido <= previa.odometro) return null
  // El dígito tiene que explicar casi todo el salto, pesar de verdad (los tipeos
  // reales estaban en la decena de mil) y dejar un ritmo normal. Un viaje largo
  // de verdad mueve miles de km sin que un solo dígito explique el número.
  if (valor - sugerido < salto / 2) return null
  if (valor - sugerido < max * PESO_DIGITO_MIN) return null
  if ((sugerido - previa.odometro) / dias > max * NORMAL_DIA) return null

  const enDias = dias === 1 ? "en 1 día" : `en ${dias} días`
  return {
    sugerido,
    mensaje: `Parece un dígito mal tipeado: ${marcarDigito(valor, sugerido)} da ${fmt(
      salto
    )} ${unidad} ${enDias}. ¿No será ${fmt(
      sugerido
    )}? La unidad marcaba ${fmt(previa.odometro)} ${unidad} el ${fmtFecha(previa.fecha)}.`,
  }
}

/**
 * Devuelve el mensaje de error, o null si la lectura es plausible.
 *
 * @param valor lectura que se está cargando (km, u horas en autoelevador)
 * @param previa última lectura conocida de la unidad (null si es la primera)
 * @param fecha fecha de la lectura nueva (ISO)
 * @param esHorometro true para autoelevadores (la lectura son horas)
 * @param permitirRetroceso no rechazar una lectura MENOR a la anterior
 */
export function validarLectura({
  valor,
  previa,
  fecha,
  esHorometro = false,
  permitirRetroceso = false,
}: {
  valor: number
  previa: LecturaPrevia | null
  fecha: string
  esHorometro?: boolean
  permitirRetroceso?: boolean
}): string | null {
  const unidad = esHorometro ? "hs" : "km"
  const que = esHorometro ? "El horómetro" : "El odómetro"

  if (!Number.isFinite(valor) || valor <= 0) {
    return `${que} tiene que ser un número mayor a 0`
  }
  if (!previa) return null

  // El odómetro no retrocede. Cubre también el caso "faltan dígitos"
  // (se cargó 117 cuando la unidad marcaba 117.922).
  //
  // 🚨 En el egreso esto NO se aplica (`permitirRetroceso`): el número del portón
  // y el del checklist los tipean dos personas distintas y difieren de a decenas
  // de km todo el tiempo — 33 de los 253 egresos de agosto y septiembre quedaron
  // por debajo de la última lectura del día anterior. Rechazarlos trabaría el
  // registro de TML cada dos días sin arreglar ningún dato: el km actual sale
  // igual de la lectura MÁS ALTA y las bajas ya se descartan al leer. Lo que sí
  // hace daño es un número inflado, y para eso siguen el salto y el dígito.
  if (valor < previa.odometro && !permitirRetroceso) {
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

  return avisoDigitoCambiado({ valor, previa, fecha, esHorometro })?.mensaje ?? null
}
