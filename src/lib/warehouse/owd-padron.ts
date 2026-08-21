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

/**
 * Fallback mientras `roles_cobertura` no exista en la base.
 *
 * La columna la agrega APLICAR_EN_PAMPEANA_OWD_COBERTURA_SIN_META.sql, que se
 * pega a mano en el SQL editor. Hasta entonces el mapeo vive acá para que el
 * comportamiento en producción sea el correcto igual; una vez aplicado el SQL
 * manda la base y esta constante deja de usarse (se puede borrar).
 *
 * 4.3 "Verificación de cargas" va a `pickero` completo: SKAP no tiene un rol
 * "verificador" (el CHECK sólo admite chofer/ayudante/pickero/autoelevadorista/
 * mantenimiento/administrativo) y los tres observados hasta hoy son pickeros.
 */
const COBERTURA_POR_DEFECTO: Record<string, string[]> = {
  "408cb530-f188-4854-9c76-e6b7bb51e430": ["pickero"], // 4.1 Proceso de Picking
  "acdc58ad-4446-4c56-82a4-3456f9c24af9": ["autoelevadorista"], // 4.2 Reposición del Área de Picking
  "27549014-6907-4a5d-b431-d06095309c3c": ["pickero"], // 4.3 Verificación de cargas
  "b400b7be-5a03-4ddd-8b91-4869a4fdfd52": ["autoelevadorista"], // 5.1 Carga y Descarga
}

function rolesDe(tpl: PadronTemplate | null | undefined): string[] {
  const declarados = (tpl?.roles_cobertura ?? []).filter(Boolean)
  if (declarados.length > 0) return declarados
  return tpl?.id ? (COBERTURA_POR_DEFECTO[tpl.id] ?? []) : []
}

/**
 * true = la plantilla se mide por cobertura del padrón, no por meta mensual.
 * Se usa para ignorar el `meta_mensual = 8` que quedó en la base hasta que se
 * aplique el SQL: si la plantilla cubre un padrón, no tiene meta.
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
