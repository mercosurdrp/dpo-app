// Detección automática de períodos críticos a partir del calendario diario.
//
// R3.4.1: identificar períodos para anticipar. Un período es una SEMANA que
// aprieta, no una celda roja suelta: lo abren los días CRÍTICOS (el volumen
// supera la capacidad de distribución) y lo completan los días AL LÍMITE (90% o
// más de la capacidad). Una corrida de días al límite sin ningún crítico también
// es período si dura al menos 2 días. Clientes, rechazo y ausentismo no abren
// período por sí solos. Los bloques van de 1 a 7 días (con gaps cortos) y se
// nombran por feriado/temporada.

import type { DiaCalendario } from "../_components/client"
import { intensidadDia, intensidadMax, type Intensidad } from "./intensidad"

// Un EVENTO DE EMPRESA (ej. Expoagro) queda FIJO: sus días siempre integran un
// período sugerido aunque el volumen no llegue a la capacidad. Se marcan con
// tipo='empresa' en pc_feriados.
const esEventoEmpresa = (d: DiaCalendario) => d.tipo_feriado === "empresa"

// Un día CRÍTICO abre un período: supera el volumen O es evento de empresa.
const esCritico = (d: DiaCalendario) => d.trigger_vol === true || esEventoEmpresa(d)
// Un día AL LÍMITE integra el período pero no lo abre solo.
const esLimite = (d: DiaCalendario) => intensidadDia(d) === "LIMITE"
// Día que forma parte de un bloque.
const esAncla = (d: DiaCalendario) => esCritico(d) || esLimite(d)
// Una corrida sólo de días al límite necesita esta cantidad para ser período.
const MIN_LIMITE_SOLOS = 2

export type PeriodoCritico = {
  /** "{añoMM}-{idx}" para listar y trackear. */
  id: string
  nombre: string
  motivo: string
  fechaInicio: string
  fechaFin: string
  cantDias: number
  cantDiasCriticos: number   // días que superaron la capacidad
  cantDiasLimite: number     // días entre el 90% y el 100% de la capacidad
  intensidad: Intensidad     // la del día más exigente del bloque
  hlMax: number
  hlAcum: number
  clientesMax: number
  pctCapacidadMax: number    // hl / capacidad del día pico (1 = justo la capacidad)
  diaPico: string         // fecha del día con más HL
  feriadoCercano: string | null
  dias: DiaCalendario[]   // los días del bloque (incluye gaps no-CRITICO)
}

// Permitimos hasta 2 días no-ALTO entre días ALTO antes de cortar el bloque.
// Esto cubre el caso típico de un fin de semana con sábado/domingo en MEDIO o
// BAJO partiendo lo que en realidad es un único período crítico.
const MAX_GAP = 2
// Tope del manual: cada período crítico va de 1 día a 1 semana.
const MAX_DIAS = 7

const MES_LABEL: Record<number, string> = {
  1: "Enero",  2: "Febrero",  3: "Marzo",  4: "Abril",
  5: "Mayo",   6: "Junio",    7: "Julio",  8: "Agosto",
  9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}

function parseFecha(f: string): Date {
  return new Date(f + "T00:00:00")
}

function diffDias(a: string, b: string): number {
  return Math.round((parseFecha(b).getTime() - parseFecha(a).getTime()) / 86400000)
}

/**
 * Encuentra el feriado dentro del rango [fechaInicio−1, fechaFin+3].
 * Prioriza el feriado que cae DESPUÉS del fin (= "pre-feriado", efecto acopio).
 */
function feriadoCercano(
  bloque: DiaCalendario[],
  todosLosFeriados: { fecha: string; nombre: string }[],
): { fecha: string; nombre: string; relacion: "pre" | "post" | "intra" } | null {
  const inicio = bloque[0].fecha
  const fin = bloque[bloque.length - 1].fecha

  // intra: algún día del bloque es feriado
  const intra = bloque.find((d) => d.es_feriado)
  if (intra) return { fecha: intra.fecha, nombre: intra.nombre_feriado ?? "", relacion: "intra" }

  // pre: feriado en los 3 días siguientes al fin del bloque
  for (const f of todosLosFeriados) {
    const d = diffDias(fin, f.fecha)
    if (d >= 1 && d <= 3) return { ...f, relacion: "pre" }
  }
  // post: feriado el día anterior al inicio del bloque
  for (const f of todosLosFeriados) {
    const d = diffDias(f.fecha, inicio)
    if (d === 1) return { ...f, relacion: "post" }
  }
  return null
}

function generarNombreYMotivo(
  bloque: DiaCalendario[],
  cercano: ReturnType<typeof feriadoCercano>,
): { nombre: string; motivo: string } {
  const inicio = parseFecha(bloque[0].fecha)
  const fin = parseFecha(bloque[bloque.length - 1].fecha)
  const mesIni = inicio.getMonth() + 1

  if (cercano) {
    const nombre =
      cercano.relacion === "pre"   ? `Pre-${cercano.nombre}`
    : cercano.relacion === "post"  ? `Post-${cercano.nombre}`
    :                                cercano.nombre
    const motivo =
      cercano.relacion === "pre"   ? `Acopio antes de ${cercano.nombre} (${cercano.fecha})`
    : cercano.relacion === "post"  ? `Recuperación post ${cercano.nombre} (${cercano.fecha})`
    :                                `Feriado: ${cercano.nombre}`
    return { nombre, motivo }
  }

  // Sin feriado próximo: nombrar por temporada / fin de mes / mes
  const diaIni = inicio.getDate()
  const diaFin = fin.getDate()
  if (mesIni === 12 && diaIni >= 18) {
    return { nombre: "Fiestas fin de año", motivo: "Demanda alta de Navidad/Año Nuevo" }
  }
  if (mesIni === 1 && diaFin <= 10) {
    return { nombre: "Inicio de año / Verano", motivo: "Temporada alta de verano + post fiestas" }
  }
  if (mesIni >= 12 || mesIni <= 2) {
    return {
      nombre: `Temporada alta — ${MES_LABEL[mesIni]}`,
      motivo: "Verano: demanda sostenida de bebidas frías",
    }
  }
  if (diaIni >= 26 || diaFin >= 28) {
    return {
      nombre: `Cierre de mes — ${MES_LABEL[mesIni]}`,
      motivo: "Cierre de facturación / objetivos comerciales",
    }
  }
  return {
    nombre: `${MES_LABEL[mesIni]} — semana ${Math.ceil(diaIni / 7)}`,
    motivo: "Patrón estacional/semanal de alta demanda",
  }
}

/**
 * Devuelve los períodos críticos detectados (bloques de 1–7 días). Un día
 * integra un período si superó la capacidad de distribución (o es evento de
 * empresa) o quedó al límite (90% o más). Un bloque sin ningún día crítico
 * necesita al menos MIN_LIMITE_SOLOS días al límite.
 */
export function detectarPeriodosCriticos(dias: DiaCalendario[]): PeriodoCritico[] {
  // Lista plana de feriados del rango — el tooltip ya viene marcado por día,
  // pero para "pre/post feriado" necesitamos saberlos en orden.
  const feriados = dias
    .filter((d) => d.es_feriado && d.nombre_feriado)
    .map((d) => ({ fecha: d.fecha, nombre: d.nombre_feriado! }))

  const bloques: DiaCalendario[][] = []
  let actual: DiaCalendario[] = []
  let gap = 0

  for (const d of dias) {
    const esAlto = esAncla(d)

    if (esAlto) {
      // si hay gap acumulado pero estoy abriendo bloque, los días no-ALTO previos
      // ya forman parte del bloque (los agregué cuando gap<=MAX_GAP).
      actual.push(d)
      gap = 0
      if (actual.length >= MAX_DIAS) {
        bloques.push(actual)
        actual = []
      }
      continue
    }

    // No es ALTO. Si hay un bloque activo, lo extiendo siempre que no se pase
    // de MAX_GAP no-ALTO consecutivos.
    if (actual.length > 0) {
      if (gap < MAX_GAP) {
        actual.push(d)
        gap++
      } else {
        // cortar el bloque, descartar los gap finales para que arranque/cierre en ancla
        while (actual.length > 0 && !esAncla(actual[actual.length - 1])) {
          actual.pop()
        }
        if (actual.length > 0) bloques.push(actual)
        actual = []
        gap = 0
      }
    }
  }
  // Cerrar el último bloque si quedó abierto
  while (actual.length > 0 && !esAncla(actual[actual.length - 1])) {
    actual.pop()
  }
  if (actual.length > 0) bloques.push(actual)

  return bloques
    .filter((b) => b.some(esCritico) || b.filter(esLimite).length >= MIN_LIMITE_SOLOS)
    .map((bloque, i) => {
    const cercano = feriadoCercano(bloque, feriados)
    const { nombre, motivo } = generarNombreYMotivo(bloque, cercano)
    const diaPico = bloque.reduce((max, d) =>
      Number(d.hl) > Number(max.hl) ? d : max,
    bloque[0])
    return {
      id: `${bloque[0].fecha}-${i + 1}`,
      nombre,
      motivo,
      fechaInicio: bloque[0].fecha,
      fechaFin: bloque[bloque.length - 1].fecha,
      cantDias: bloque.length,
      cantDiasCriticos: bloque.filter((d) => d.trigger_vol).length,
      cantDiasLimite: bloque.filter(esLimite).length,
      intensidad: intensidadMax(bloque),
      hlMax: Math.max(...bloque.map((d) => Number(d.hl))),
      hlAcum: bloque.reduce((s, d) => s + Number(d.hl), 0),
      clientesMax: Math.max(...bloque.map((d) => Number(d.clientes_dia ?? 0))),
      pctCapacidadMax: Math.max(...bloque.map((d) => Number(d.pct_capacidad))),
      diaPico: diaPico.fecha,
      feriadoCercano: cercano ? `${cercano.nombre} (${cercano.fecha})` : null,
      dias: bloque,
    }
  })
}
