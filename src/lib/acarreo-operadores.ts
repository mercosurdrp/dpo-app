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

// Quiénes operan VEHÍCULOS desde el portal del empleado (checklist + carga de
// combustible) sin ser choferes de distribución. Las tarjetas del Inicio salen
// para quien está vinculado a un legajo que figura como chofer o ayudante en
// los registros de vehículos; los maquinistas cargan los autoelevadores y no
// tienen ese vínculo, así que sin esta lista no tienen por dónde entrar.
// Para sumar a alguien, agregá su email acá.
export const VEHICULOS_OPERADORES = [
  "107@dpo.local", // Pedro Martinez (maquinista)
  "30@dpo.local", // Diego Cerbin (maquinista)
  "173@dpo.local", // Pablo Selenzo (maquinista)
]

export function puedeOperarVehiculos(
  role?: string | null,
  email?: string | null,
): boolean {
  if (role === "admin" || role === "supervisor") return true
  return !!email && VEHICULOS_OPERADORES.includes(email)
}

// Quiénes pueden dar el "Ingreso a depósito" (acción reservada): además de los
// admin, esta lista acotada habilita a personas puntuales sin darles rol admin.
export const INGRESO_OPERADORES = [
  "135@dpo.local", // German Veidoski (habilitado para dar ingreso, sigue siendo auditor)
  "110@dpo.local", // Marcos Sala (habilitado para dar ingreso, sigue siendo auditor)
]

export function puedeDarIngreso(
  role?: string | null,
  email?: string | null,
): boolean {
  if (role === "admin") return true
  return !!email && INGRESO_OPERADORES.includes(email)
}
