/**
 * Padrón de cobertura de una OWD.
 *
 * Para las OWD de Almacén no hay meta mensual: la expectativa es que de cada
 * tarea se observe a TODOS los operadores que la realizan.
 *
 * 🚨 EL PADRÓN SALE DE LA AGENDA, NO DE SKAP (corregido el 26-08-2026).
 * Son dos cosas distintas y confundirlas daba avisos falsos:
 *   · `skap_asignaciones` = quién está CAPACITADO para la tarea. Sirve para
 *     capacitaciones. Tiene 6 con rol `pickero` y a Selenzo como
 *     `autoelevadorista`.
 *   · `owd_agenda`        = quién HACE la tarea de forma rutinaria. Eso es lo
 *     que se observa.
 * El ejemplo que lo dejó claro, textual de él: "pablo sabe manejar el
 * autoelevador pero no realiza la tarea de forma rutinaria, por lo que no le
 * hago owd... en caso de que algún día la haga le cargamos". Ese "le cargamos"
 * es cargarlo EN LA AGENDA: por eso la agenda es la fuente de verdad.
 *
 * Leyendo SKAP, 4.1 Picking y 4.3 Verificación pedían los mismos 6 `pickero`
 * cuando en realidad son dos grupos de 3 que nunca se cruzaron (piquean
 * Ovejero, Troli y Gálvez; verifican Selenzo, Sala y Veidoski), y 4.2 y 5.1
 * pedían un Selenzo que no maneja autoelevador en el día a día.
 *
 * `owd_templates.roles_cobertura` queda como el INTERRUPTOR: si tiene algo, la
 * plantilla se mide por cobertura en vez de por meta mensual, y el rol que
 * nombra documenta qué habilidad de SKAP corresponde. Ya no arma el padrón.
 * Sin `roles_cobertura` se cae al array manual `empleados_permitidos` (que es
 * lo que usan las OWD de Entrega).
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

// Permisivo a propósito: el cliente real es el de supabase-js, y acá sólo se
// encadenan select/eq/gte/lte. Tiparlo fino obligaba a describir el builder
// entero cada vez que cambia una query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (t: string) => any }

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
 * Devuelve los nombres que esta plantilla tiene que cubrir: los que están
 * agendados para ella en el año. Array vacío = sin control de cobertura.
 *
 * Se mira el AÑO entero y no el mes: la agenda reparte a cada operador en
 * fechas distintas, y un padrón mes a mes cambiaría de tamaño según cuándo le
 * toca a cada uno. Quien hace la tarea la hace todo el año.
 */
export async function resolverPadron(
  supabase: SupabaseLike,
  tpl: PadronTemplate | null | undefined,
  anio: number = new Date().getUTCFullYear(),
): Promise<string[]> {
  if (esPorCobertura(tpl) && tpl?.id) {
    const { data, error } = await supabase
      .from("owd_agenda")
      .select("empleado_observado")
      .eq("template_id", tpl.id)
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
    // Defensivo: si la agenda no está disponible no se rompe la pantalla de
    // OWD, simplemente queda sin control de cobertura.
    if (error || !Array.isArray(data)) return []

    // Un mismo operador aparece en varias fechas; y como `empleado_observado`
    // es texto libre, se deduplica por nombre normalizado y se conserva la
    // primera forma en que vino escrito para mostrarla.
    const porClave = new Map<string, string>()
    for (const row of data as Array<{ empleado_observado?: string | null }>) {
      const nombre = (row.empleado_observado ?? "").trim()
      if (!nombre) continue
      const clave = normalizarNombre(nombre)
      if (!porClave.has(clave)) porClave.set(clave, nombre)
    }
    return Array.from(porClave.values()).sort()
  }

  return ((tpl?.empleados_permitidos ?? []) as string[]).map((n) => (n || "").trim()).filter(Boolean)
}
