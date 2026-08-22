/**
 * Padrón de cobertura de una OWD.
 *
 * Para las OWD de Almacén no hay meta mensual: la expectativa es que de cada
 * tarea se observe a TODOS los operadores que la realizan. Quién hace qué ya
 * está cargado en `skap_asignaciones` (una persona puede tener más de un rol:
 * Selenzo es pickero Y autoelevadorista, y entra en los dos padrones).
 *
 * `owd_templates.roles_cobertura` dice qué roles cubre cada plantilla. Si está
 * seteado, el padrón se resuelve contra SKAP; si no, se cae al array manual
 * `empleados_permitidos` (que es lo que usan las OWD de Entrega).
 *
 * Nota: 4.3 "Verificación de cargas" cubre `pickero` completo. SKAP no tiene un
 * rol "verificador" (el CHECK sólo admite chofer/ayudante/pickero/
 * autoelevadorista/mantenimiento/administrativo) y los observados son pickeros.
 */

// `owd_observaciones.empleado_observado` es texto libre, no FK: se compara
// normalizado (sin acentos, sin dobles espacios, orden de tokens indistinto)
// porque el mismo operario aparece como "PABLO SELENZO" y "SELENZO, PABLO".
export function normalizarNombre(n: string): string {
  return (n || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
}

type SupabaseLike = {
  from: (t: string) => {
    select: (q: string) => {
      in: (c: string, v: string[]) => { eq: (c: string, v: unknown) => Promise<{ data: unknown; error: { message: string } | null }> }
    }
  }
}

export interface PadronTemplate {
  id?: string
  empleados_permitidos?: string[] | null
  roles_cobertura?: string[] | null
}

function rolesDe(tpl: PadronTemplate | null | undefined): string[] {
  return (tpl?.roles_cobertura ?? []).filter(Boolean)
}

/**
 * true = la plantilla se mide por cobertura del padrón, no por meta mensual.
 * Son excluyentes: un CHECK en la base impide que una plantilla tenga las dos.
 */
export function esPorCobertura(tpl: PadronTemplate | null | undefined): boolean {
  return rolesDe(tpl).length > 0
}

/**
 * Devuelve los nombres que esta plantilla tiene que cubrir.
 * Array vacío = la plantilla no lleva control de cobertura.
 */
export async function resolverPadron(
  supabase: SupabaseLike,
  tpl: PadronTemplate | null | undefined,
): Promise<string[]> {
  const roles = rolesDe(tpl)

  if (roles.length > 0) {
    const { data, error } = await supabase
      .from("skap_asignaciones")
      .select("rol, empleados(nombre, activo)")
      .in("rol", roles)
      .eq("activo", true)
    // Defensivo: si SKAP no está disponible no se rompe la pantalla de OWD,
    // simplemente queda sin control de cobertura.
    if (error || !Array.isArray(data)) return []

    const nombres = new Set<string>()
    for (const row of data as Array<{ empleados?: { nombre?: string; activo?: boolean } | null }>) {
      const e = row.empleados
      if (!e?.nombre) continue
      if (e.activo === false) continue // baja: sale del padrón
      nombres.add(e.nombre.trim())
    }
    return Array.from(nombres).sort()
  }

  return ((tpl?.empleados_permitidos ?? []) as string[]).map((n) => (n || "").trim()).filter(Boolean)
}
