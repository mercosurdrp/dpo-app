// Tipos y constante del PI de sostenibilidad de flota (punto 4.3).
//
// Viven acá y no en la action porque un archivo "use server" sólo puede exportar
// funciones async: exportar una constante deja al módulo SIN exportaciones y el
// build se cae con "The module has no exports at all".

/**
 * Kg de CO2 por litro de gasoil quemado. Factor de combustión de diésel
 * (DEFRA / IPCC, ~2,68 kg CO2/L): es el que se usa para alcance 1 y el que hay
 * que citar como fuente ante la auditoría. Si algún día entra una unidad a GNC
 * o eléctrica, este número deja de servirle a esa unidad.
 */
export const KG_CO2_POR_LITRO_DIESEL = 2.68

export interface MesSustentabilidad {
  mes: string
  litros: number
  km: number
  cargas: number
  co2Kg: number
  /** El PI: kg de CO2 cada 100 km. `null` si el mes no tiene km cargados. */
  co2Por100Km: number | null
}

export interface UnidadSustentabilidad {
  dominio: string
  litros: number
  km: number
  co2Kg: number
  co2Por100Km: number | null
}

export interface SustentabilidadFlota {
  factor: number
  porMes: MesSustentabilidad[]
  porUnidad: UnidadSustentabilidad[]
  /** Totales del año en curso. */
  anio: { litros: number; km: number; co2Kg: number; co2Por100Km: number | null }
}

/** Litros y km de un período, pasados a emisiones y al PI por 100 km. */
export function agregadoCo2(litros: number, km: number) {
  const co2Kg = litros * KG_CO2_POR_LITRO_DIESEL
  return {
    litros: Math.round(litros * 10) / 10,
    km: Math.round(km),
    co2Kg: Math.round(co2Kg),
    co2Por100Km: km > 0 ? Math.round((co2Kg / km) * 100 * 10) / 10 : null,
  }
}
