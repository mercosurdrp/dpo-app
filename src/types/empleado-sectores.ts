// Sectores que puede tener un empleado.
//
// 🚨 Vive acá y no en `actions/admin-empleado-link.ts` a propósito: un archivo
// con la directiva "use server" SÓLO puede exportar funciones async. Con esta
// constante adentro, Next tiraba el módulo entero al evaluarlo
// ("A 'use server' file can only export async functions, found object") y eso
// dejaba en 500 a TODAS las Server Actions de /admin/usuarios — crear usuario,
// editar, cambiar contraseña, activar/desactivar y borrar. El diálogo hacía su
// POST, el POST moría y la pantalla no mostraba cambio alguno.
export const EMPLEADO_SECTORES = [
  "Distribución",
  "Depósito",
  "Sin asignar",
] as const

export type EmpleadoSector = (typeof EMPLEADO_SECTORES)[number]
