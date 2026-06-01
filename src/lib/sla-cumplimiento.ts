// Constantes y tipos del cumplimiento de SLA.
// 🚨 Viven fuera de actions/sla.ts porque ese archivo es "use server" y un
// módulo de Server Actions SOLO puede exportar funciones async (Turbopack
// rechaza exportar constantes/tipos desde ahí, aunque tsc no lo marque).

export const SLA_RUTEO_NOMBRE = "Tiempo de finalización del ruteo"
export const SLA_RUTEO_TARGET = 95

export interface CumplimientoDiaRuteo {
  fecha: string // YYYY-MM-DD
  diaSemana: string // "Lun".."Sáb"
  aplica: boolean // false los domingos
  limite: string | null // "09:00" / "07:30"
  horaFin: string | null // "08:47" en hora ARG, null si no cerró
  cumple: boolean | null // null si no aplica o sin hora_fin
}

export interface CumplimientoRuteoMes {
  year: number
  month: number
  target: number
  totalAplica: number // días con ruteo medibles (denominador)
  cumplidos: number
  porcentaje: number | null
  dias: CumplimientoDiaRuteo[]
}
