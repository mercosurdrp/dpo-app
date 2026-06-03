// Quiénes pueden VER y OPERAR la Recepción de acarreos dentro de dpo-app
// (marcar inicio/fin de descarga). Además de admin y supervisor, esta lista
// blanca de emails habilita a maquinistas/almacén que tienen rol genérico
// (empleado/auditor). Para sumar a alguien, agregá su email acá.
export const ACARREO_OPERADORES = [
  "107@dpo.local", // Pedro Martinez (maquinista)
  "30@dpo.local", // Diego Cerbin (maquinista)
  "173@dpo.local", // Pablo Selenzo (maquinista)
  "135@dpo.local", // German Veidoski
  "110@dpo.local", // Marcos Sala
]

export function puedeOperarAcarreo(
  role?: string | null,
  email?: string | null,
): boolean {
  if (role === "admin" || role === "supervisor") return true
  return !!email && ACARREO_OPERADORES.includes(email)
}
