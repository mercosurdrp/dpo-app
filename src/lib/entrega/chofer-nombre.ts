import { getMiEmpleado } from "@/lib/session"

/**
 * Nombre de chofer (el de Chess/Foxtrot, vía `mapeo_empleado_chofer`) del
 * usuario logueado, o null si no está vinculado. Lo usan las cargas del
 * chofer (heladeras, roturas en calle) para dejar asentado quién la hizo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMiNombreChofer(supabase: any): Promise<string | null> {
  const empleado = await getMiEmpleado()
  if (!empleado) return null
  const { data: chofer } = await supabase
    .from("mapeo_empleado_chofer")
    .select("nombre_chofer")
    .eq("empleado_id", empleado.id)
    .limit(1)
    .maybeSingle()
  return (chofer?.nombre_chofer as string) ?? null
}
