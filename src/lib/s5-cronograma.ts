/**
 * Cronograma de limpieza 5S del almacén: qué se limpia en cada sector y con
 * qué frecuencia. Es el mismo cronograma que está en el Word de la cartelera
 * (`Escritorio\5S\Cronograma de Limpieza 5S.docx`); si se cambia uno hay que
 * cambiar el otro.
 *
 * Vive fuera de las server actions porque lo usa también la pantalla del
 * operario para pintar la lista. Sin tabla propia: los ítems cambian poco y
 * un cambio es un commit.
 */

export type FrecuenciaCheck = "diaria" | "semanal" | "quincenal" | "mensual"

export interface ItemCronograma {
  /** Estable: es la clave con la que se guarda el tilde. No renombrar. */
  id: string
  texto: string
  frecuencia: FrecuenciaCheck
}

export const FRECUENCIA_LABEL: Record<FrecuenciaCheck, string> = {
  diaria: "Todos los días",
  semanal: "Esta semana",
  quincenal: "Esta quincena",
  mensual: "Este mes",
}

export const CRONOGRAMA_5S: Record<number, ItemCronograma[]> = {
  1: [
    { id: "s1-pisos", texto: "Calles y playa de estiba barridas, sin cartón, film ni vidrios", frecuencia: "diaria" },
    { id: "s1-tachos", texto: "Tachos vaciados e identificados", frecuencia: "diaria" },
    { id: "s1-pallets", texto: "Pallets vacíos apilados en la zona demarcada", frecuencia: "diaria" },
    { id: "s1-heladeras", texto: "Zona de heladeras: equipos alineados y limpios", frecuencia: "semanal" },
    { id: "s1-paredes", texto: "Paredes, columnas y telas de araña", frecuencia: "mensual" },
  ],
  2: [
    { id: "s2-pasillos", texto: "Pasillos y frente de estiba barridos; sendas libres", frecuencia: "diaria" },
    { id: "s2-reempaque", texto: "Banco de reempaque limpio, sin mercadería fuera de lugar", frecuencia: "diaria" },
    { id: "s2-traspaletas", texto: "Traspaletas y elementos de limpieza en su lugar", frecuencia: "diaria" },
    { id: "s2-rechazos", texto: "Rechazos desarmados y en su zona; nada en el piso", frecuencia: "diaria" },
    { id: "s2-estanterias", texto: "Estanterías de stay: estantes limpios y señalización", frecuencia: "mensual" },
  ],
  3: [
    { id: "s3-pisos", texto: "Pisos sin residuos ni derrames", frecuencia: "diaria" },
    { id: "s3-tachos", texto: "Tachos vaciados", frecuencia: "diaria" },
    { id: "s3-vacios", texto: "Vacíos y cajones clasificados y apilados; sin botellas ajenas", frecuencia: "semanal" },
    { id: "s3-capacho", texto: "Zona del capacho limpia y ordenada", frecuencia: "semanal" },
    { id: "s3-paredes", texto: "Paredes, portones y telas de araña", frecuencia: "mensual" },
  ],
  4: [
    { id: "s4-tachos", texto: "Tachos exteriores vaciados", frecuencia: "diaria" },
    { id: "s4-darsenas", texto: "Dársenas sin cartón, film ni envases sueltos", frecuencia: "diaria" },
    { id: "s4-playa", texto: "Playa y veredas barridas", frecuencia: "semanal" },
    { id: "s4-ajenos", texto: "Sin botellas ni cajones ajenos en el predio", frecuencia: "semanal" },
    { id: "s4-pasto", texto: "Corte de pasto y desmalezado", frecuencia: "quincenal" },
    { id: "s4-carteleria", texto: "Cartelería y demarcación exterior", frecuencia: "mensual" },
  ],
}

export function itemsDelSector(sector: number): ItemCronograma[] {
  return CRONOGRAMA_5S[sector] ?? []
}

/** Cumplimiento del check en un mes. Lo calcula `actions/s5-check`. */
export interface AdherenciaCheck {
  /** Días lunes a sábado del mes ya transcurridos, hoy incluido. */
  dias: number
  /** De esos, cuántos tuvieron todos los ítems diarios tildados. */
  dias_completos: number
  pct: number | null
  /** Ítems semanales/quincenales/mensuales hechos al menos una vez en el mes. */
  periodicos_hechos: number
  periodicos_total: number
}

/** Línea que queda en las observaciones de la auditoría al completarla. */
export function textoAdherencia(a: AdherenciaCheck): string {
  if (a.dias === 0) return "Check diario de limpieza: sin días cargados."
  return `Check diario de limpieza: ${a.dias_completos} de ${a.dias} días completos (${a.pct}%) · periódicos ${a.periodicos_hechos}/${a.periodicos_total}.`
}
