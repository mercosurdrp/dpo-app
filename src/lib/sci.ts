/**
 * SCI — Sales Curve Index ("Índice de Curva de Ventas").
 *
 * Definición DPO (Glosario DPO de Quilmes): "Curva de ventas. Indicador que
 * refleja el desvío estándar del volumen de ventas". Lo piden Planeamiento 4.3
 * (R4.3.3: monitorear la curva de ventas / paradas mensualmente y que las
 * tendencias alimenten el plan territorial), Entrega 3.1 (KPI 7 del
 * dimensionamiento) y el TOR de la Reunión Ventas-Logística (KPI 2).
 *
 * Para que sea comparable entre meses de distinto nivel se expresa como
 * coeficiente de variación del volumen diario: desvío estándar ÷ promedio × 100.
 * Menor SCI = curva más plana = mejor (DPO: "un índice de curva de ventas más
 * bajo" evita cancelaciones en temporada alta). La misma cuenta sobre los
 * clientes entregados por día da la "Curva de PDVs" (SCI de paradas).
 *
 * Fuente: pc_volumen_diario — HL distribuidos con flota propia (Chess + GESCOM
 * sin cuentas de patentes), la misma base de Períodos Críticos y del
 * Dimensionamiento. Se excluyen domingos, feriados (pc_feriados) y días sin
 * reparto (HL ≤ UMBRAL_DIA_SIN_REPARTO_HL), para que un día cerrado no cuente
 * como "venta cero" y no infle el desvío.
 */

export const UMBRAL_DIA_SIN_REPARTO_HL = 5

export interface DiaVolumen {
  fecha: string          // YYYY-MM-DD
  hl: number             // HL distribuidos del día
  clientes: number       // clientes entregados (paradas) del día
  feriado: string | null // nombre del feriado si lo es (pc_feriados)
}

export interface DiaCurva extends DiaVolumen {
  dia: number            // día del mes
  semana: number         // semana del mes 1..5 (ceil(dia/7))
  diaSemana: number      // 1 = lunes … 6 = sábado
  valido: boolean        // entra en el cálculo
  motivo: string | null  // por qué no entra (feriado / sin reparto)
}

export interface SciMes {
  anio: number
  mes: number
  key: string            // YYYY-MM
  parcial: boolean       // mes en curso: el SCI todavía puede cambiar
  dias: number           // días válidos
  hlTotal: number
  promedio: number       // HL/día
  desvio: number         // desvío estándar poblacional (HL)
  sci: number | null     // desvío ÷ promedio × 100
  clientesProm: number
  clientesDesvio: number
  sciPdv: number | null  // "Curva de PDVs": lo mismo sobre paradas/día
  picoHl: number
  picoFecha: string | null
  picoRatio: number | null   // pico ÷ promedio
  minHl: number
  pctSemana: number[]        // % del HL del mes por semana del mes (índice 0 = semana 1)
  pctDiaSemana: number[]     // % del HL del mes por día de semana (índice 0 = lunes … 5 = sábado)
}

export interface EvaluacionDpo {
  /** Últimos 3 meses cerrados del año con SCI bajando mes a mes. null si no hay 3. */
  tendencia3: boolean | null
  ultimos3: SciMes[]
  /** Promedio del SCI de los meses cerrados del año (YTD) y del mismo tramo del año anterior. */
  ytd: number | null
  ytdAA: number | null
  mejoraVsAA: boolean | null
}

export function desvioPoblacional(xs: number[]): number {
  const n = xs.length
  if (n === 0) return 0
  const m = xs.reduce((a, b) => a + b, 0) / n
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / n
  return Math.sqrt(v)
}

function r1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Día de semana 1..7 (lunes..domingo) de una fecha YYYY-MM-DD sin depender de la TZ. */
export function diaSemanaIso(fecha: string): number {
  const d = new Date(fecha + "T00:00:00Z").getUTCDay() // 0 = domingo
  return d === 0 ? 7 : d
}

/** Clasifica los días de un mes: cuáles entran en el cálculo y por qué no. */
export function armarCurvaMes(dias: DiaVolumen[], anio: number, mes: number): DiaCurva[] {
  const key = `${anio}-${String(mes).padStart(2, "0")}`
  return dias
    .filter((d) => d.fecha.startsWith(key))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => {
      const dia = Number(d.fecha.slice(8, 10))
      const ds = diaSemanaIso(d.fecha)
      let motivo: string | null = null
      if (ds === 7) motivo = "domingo"
      else if (d.feriado) motivo = `feriado: ${d.feriado}`
      else if (!(d.hl > UMBRAL_DIA_SIN_REPARTO_HL)) motivo = "sin reparto"
      return {
        ...d,
        dia,
        semana: Math.min(5, Math.ceil(dia / 7)),
        diaSemana: ds,
        valido: motivo === null,
        motivo,
      }
    })
}

export function calcularSciMes(
  dias: DiaVolumen[],
  anio: number,
  mes: number,
  hoy: { anio: number; mes: number },
): SciMes {
  const key = `${anio}-${String(mes).padStart(2, "0")}`
  const curva = armarCurvaMes(dias, anio, mes)
  const validos = curva.filter((d) => d.valido)
  const n = validos.length
  const hls = validos.map((d) => d.hl)
  const clis = validos.map((d) => d.clientes)
  const hlTotal = hls.reduce((a, b) => a + b, 0)
  const promedio = n ? hlTotal / n : 0
  const desvio = desvioPoblacional(hls)
  const clientesProm = n ? clis.reduce((a, b) => a + b, 0) / n : 0
  const clientesDesvio = desvioPoblacional(clis)
  const pico = validos.reduce<DiaCurva | null>((p, d) => (!p || d.hl > p.hl ? d : p), null)
  const minHl = n ? Math.min(...hls) : 0
  const pctSemana = [0, 0, 0, 0, 0]
  const pctDiaSemana = [0, 0, 0, 0, 0, 0]
  for (const d of validos) {
    pctSemana[d.semana - 1] += d.hl
    pctDiaSemana[d.diaSemana - 1] += d.hl
  }
  const pct = (v: number) => (hlTotal > 0 ? r1((v / hlTotal) * 100) : 0)
  // SCI con menos de 5 días no dice nada (un mes recién empezado).
  const suficiente = n >= 5 && promedio > 0
  return {
    anio,
    mes,
    key,
    parcial: anio === hoy.anio && mes === hoy.mes,
    dias: n,
    hlTotal: Math.round(hlTotal),
    promedio: r1(promedio),
    desvio: r1(desvio),
    sci: suficiente ? r1((desvio / promedio) * 100) : null,
    clientesProm: r1(clientesProm),
    clientesDesvio: r1(clientesDesvio),
    sciPdv: suficiente && clientesProm > 0 ? r1((clientesDesvio / clientesProm) * 100) : null,
    picoHl: pico ? r1(pico.hl) : 0,
    picoFecha: pico?.fecha ?? null,
    picoRatio: pico && promedio > 0 ? Math.round((pico.hl / promedio) * 100) / 100 : null,
    minHl: r1(minHl),
    pctSemana: pctSemana.map(pct),
    pctDiaSemana: pctDiaSemana.map(pct),
  }
}

/** Criterios de mejora del handbook (Entrega 3.1): tendencia de 3 meses y mejor que el año anterior. */
export function evaluarDpo(meses: SciMes[], anio: number): EvaluacionDpo {
  const cerrados = meses
    .filter((m) => m.anio === anio && !m.parcial && m.sci !== null)
    .sort((a, b) => a.mes - b.mes)
  const ultimos3 = cerrados.slice(-3)
  const tendencia3 =
    ultimos3.length === 3
      ? (ultimos3[1].sci as number) < (ultimos3[0].sci as number) &&
        (ultimos3[2].sci as number) < (ultimos3[1].sci as number)
      : null
  const prom = (xs: SciMes[]) =>
    xs.length ? r1(xs.reduce((a, m) => a + (m.sci as number), 0) / xs.length) : null
  const ytd = prom(cerrados)
  const mesesCerrados = new Set(cerrados.map((m) => m.mes))
  const aa = meses.filter((m) => m.anio === anio - 1 && mesesCerrados.has(m.mes) && m.sci !== null)
  const ytdAA = prom(aa)
  return {
    tendencia3,
    ultimos3,
    ytd,
    ytdAA,
    mejoraVsAA: ytd !== null && ytdAA !== null ? ytd < ytdAA : null,
  }
}

export const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
export const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
export const DIAS_SEMANA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
