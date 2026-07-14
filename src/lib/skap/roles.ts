import type { SkapRol } from "@/types/database"

// 🚨 Vive acá y NO en el action: un archivo "use server" solo puede exportar
// funciones async — exportar esta constante desde `actions/skap-habilidades.ts`
// rompía el build de TODA la app ("A 'use server' file can only export async
// functions, found object").

/** Roles de la matriz SKAP, con el sector de empleados al que pertenecen. */
export const ROLES_SKAP: { rol: SkapRol; label: string; sector: string }[] = [
  { rol: "chofer", label: "Chofer", sector: "Distribución" },
  { rol: "ayudante", label: "Ayudante", sector: "Distribución" },
  { rol: "pickero", label: "Pickero", sector: "Depósito" },
  { rol: "autoelevadorista", label: "Autoelevadorista", sector: "Depósito" },
  { rol: "mantenimiento", label: "Mantenimiento", sector: "Depósito" },
  { rol: "administrativo", label: "Administrativo", sector: "Distribución" },
]
