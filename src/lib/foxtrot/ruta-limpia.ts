// Una ruta de Foxtrot es LIMPIA si se cerró el mismo día que arrancó.
//
// 🚨 Cuando el chofer no finaliza la ruta en la app, Foxtrot la cierra horas o
// días después y su `tiempo_ruta_minutos` (finalized − started) deja de ser un
// tiempo de trabajo: promediando todas, enero da 11,8 hs por ruta (¡casi 12!)
// contra 7,4 con las limpias. Se descarta ~1 de cada 4 rutas.
//
// 🚨 Los dos timestamps viven dentro de `raw_data`, pero NUNCA hay que traer ese
// jsonb entero: son ~100 KB por ruta (arrastra todos los waypoints) y la query
// muere por statement timeout — tumbó el cuadro mensual el 13-jul-2026. Proyectar
// solo lo necesario:
//
//   .select("fecha, tiempo_ruta_minutos, ini:raw_data->>started_timestamp, fin:raw_data->>finalized_timestamp")
export const SELECT_RUTA_LIMPIA =
  "ini:raw_data->>started_timestamp, fin:raw_data->>finalized_timestamp"

const dia = (t: string): string => new Date(t).toISOString().slice(0, 10)

export function esRutaLimpia(ini: string | null, fin: string | null): boolean {
  if (!ini || !fin) return false
  return dia(ini) === dia(fin)
}
