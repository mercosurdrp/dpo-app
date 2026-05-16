// Mapeo promotor (id_personal de Chess) → supervisor / JDV de preventa en
// Misiones. Derivado de la jerarquía de Chess (idPersonalSuperior) y
// confirmado operativamente. Los tres JDV se conocen por su zona:
//   Irala Iván     → CENTRAL
//   Bargas Ronaldo → IGUAZÚ
//   Bogado Leonardo → ZONA ESTE
// Las cuentas no-preventa (VI PEOPLE, MOSTRADOR, telesales, etc.) no tienen
// supervisor: caen en `null` y solo aparecen bajo el toggle "TODOS".

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
  2: "CENTRAL", // Wunsch José
  3: "CENTRAL", // Avalos Brian
  4: "CENTRAL", // Freitas Ale Claus
  5: "CENTRAL", // Fernández Agustín
  7: "CENTRAL", // Fragoso Esteban
  8: "CENTRAL", // Erhard Cristian
  13: "CENTRAL", // Benítez Gustavo
  31: "CENTRAL", // Castillo Cintia Noemí
  32: "CENTRAL", // Cristaldo Rodrigo
  // IGUAZÚ — Bargas Ronaldo
  6: "IGUAZU", // Grauman Jorge
  12: "IGUAZU", // Butnen Ornela Beatriz
  14: "IGUAZU", // Burgin Daiana
  18: "IGUAZU", // Zárate Javier
  // ZONA ESTE — Bogado Leonardo
  10: "ESTE", // Gaitano Gustavo
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
