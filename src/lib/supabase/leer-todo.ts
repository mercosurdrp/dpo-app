/**
 * PostgREST corta cada respuesta en 1000 filas sin avisar. Cualquier lectura que
 * pueda superar ese número tiene que pasar por acá: si no, se pierden las filas
 * MÁS NUEVAS (las consultas ordenan por fecha ascendente) y el indicador se
 * congela en el mes en que se llegó al tope.
 *
 * La query tiene que tener un orden total (ej. `.order("fecha").order("id")`):
 * con un orden con empates, dos páginas pueden repetir o saltear filas.
 */
const PAGE = 1000

export async function leerTodo<T>(
  query: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}
