// Mapeo promotor (id_personal de Chess) → supervisor / JDV de preventa en
// Misiones. Los tres JDV se conocen por su zona:
//   Irala Iván      → CENTRAL
//   Bargas Ronaldo  → IGUAZÚ
//   Bogado Leonardo → ZONA ESTE
//
// ⚠️ OJO: en Chess los id_personal se repiten entre sucursales (un mismo id
// puede ser un promotor distinto en Eldorado vs Iguazú). Por eso este mapeo
// NO se deriva de catálogos genéricos: refleja los id_personal verificados
// que efectivamente aparecen en la vista v_fueras_de_ruta_misiones
// (verificado contra la base el 2026-05-16). Si aparece un promotor nuevo,
// cae en `null` (solo visible bajo "TODOS") hasta agregarlo acá a mano.
//
// Las cuentas no-preventa (VI PEOPLE, MOSTRADOR, VENTA TELEFONICA, etc.) no
// tienen supervisor: caen en `null`.

export type SupervisorKey = "CENTRAL" | "IGUAZU" | "ESTE"

export interface SupervisorInfo {
  key: SupervisorKey
  nombre: string
  zona: string
}

export const SUPERVISORES: Record<SupervisorKey, SupervisorInfo> = {
  CENTRAL: { key: "CENTRAL", nombre: "Irala Iván", zona: "CENTRAL" },
  IGUAZU: { key: "IGUAZU", nombre: "Bargas Ronaldo", zona: "IGUAZÚ" },
  ESTE: { key: "ESTE", nombre: "Bogado Leonardo", zona: "ZONA ESTE" },
}

// Orden de presentación en la UI.
export const SUPERVISOR_KEYS: SupervisorKey[] = ["CENTRAL", "IGUAZU", "ESTE"]

const PROMOTOR_A_SUPERVISOR: Record<number, SupervisorKey> = {
  // CENTRAL — Irala Iván
  1: "CENTRAL", // Duran Luis
  3: "CENTRAL", // Avalos Brian
  4: "CENTRAL", // Freitas Ale Claus
  5: "CENTRAL", // Fernández Agustín
  7: "CENTRAL", // Fragoso Esteban
  13: "CENTRAL", // Benítez Gustavo
  // IGUAZÚ — Bargas Ronaldo
  9: "IGUAZU", // Gómez César
  10: "IGUAZU", // Paniagua Fabricio
  11: "IGUAZU", // Cartagena Joan
  12: "IGUAZU", // Butnen Ornela Beatriz
  14: "IGUAZU", // Burgin Daiana
  15: "IGUAZU", // Miranda Leticia
  22: "IGUAZU", // Jara Adrián
  // ZONA ESTE — Bogado Leonardo
  50: "ESTE", // Alvez de Lima Lucas
  51: "ESTE", // Acosta Lázaro
  52: "ESTE", // Bothner Erick
  53: "ESTE", // Aguirre Diego
}

export function supervisorDePromotor(
  idPersonal: number | null | undefined,
): SupervisorKey | null {
  if (idPersonal == null) return null
  return PROMOTOR_A_SUPERVISOR[idPersonal] ?? null
}
