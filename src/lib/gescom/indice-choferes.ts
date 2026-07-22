// Índice único patente/reparto → nombre del chofer.
//
// Hay DOS padrones y ninguno cubre al otro: las patentes de Chess viven en
// `mapeo_patente_chofer`, y los repartos de GESCOM entran como
// `GESTION-<codigo>` (GESCOM no informa patente) con su nombre en
// `mapeo_chofer_gescom`.
//
// Consultar solo el primero es la causa de que en varias pantallas apareciera
// el código crudo "GESTION-20012": el nombre no se encontraba y se caía al
// valor de la clave. Todo lo que necesite resolver un nombre de chofer debería
// usar este loader en vez de ir a `mapeo_patente_chofer` por su cuenta.

import { claveFleteroGescom, limpiarNombreChofer } from "./etiqueta-fletero"

// Acepta cualquiera de los clientes Supabase que circulan en el proyecto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any }

export interface ChoferPorPatente {
  patente: string
  chofer_nombre: string | null
}

/**
 * Los dos padrones combinados. `normalizar` permite que el consumidor use la
 * misma forma de clave que ya aplica a `ds_fletero_carga` (varios normalizan a
 * mayúsculas), para que el lookup matchee.
 */
export async function cargarChoferesPorPatente(
  supa: SupaLike,
  normalizar: (s: string) => string = (s) => s,
): Promise<ChoferPorPatente[]> {
  const [chessRes, gescomRes] = await Promise.all([
    supa.from("mapeo_patente_chofer").select("patente, catalogo_choferes(nombre)"),
    supa.from("mapeo_chofer_gescom").select("codigo, nombre").eq("activo", true),
  ])

  if (chessRes.error) {
    throw new Error(`mapeo_patente_chofer: ${chessRes.error.message}`)
  }

  type ChessRow = { patente: string; catalogo_choferes: { nombre: string | null } | null }
  const out: ChoferPorPatente[] = ((chessRes.data ?? []) as ChessRow[]).map((r) => ({
    patente: normalizar(r.patente),
    chofer_nombre: r.catalogo_choferes?.nombre ?? null,
  }))

  // Si el padrón de GESCOM falla, el reparto cae a "Rep. <codigo>" vía
  // etiquetaFletero: peor que el nombre, pero nunca el código crudo, y no vale
  // tumbar la pantalla entera por eso.
  if (!gescomRes.error) {
    for (const g of (gescomRes.data ?? []) as Array<{ codigo: string; nombre: string }>) {
      out.push({
        patente: normalizar(claveFleteroGescom(g.codigo.trim())),
        chofer_nombre: limpiarNombreChofer(g.nombre),
      })
    }
  }
  return out
}

/** Igual que `cargarChoferesPorPatente` pero ya indexado. */
export async function cargarIndiceChoferes(
  supa: SupaLike,
  normalizar: (s: string) => string = (s) => s,
): Promise<Map<string, string | null>> {
  const filas = await cargarChoferesPorPatente(supa, normalizar)
  return new Map(filas.map((f) => [f.patente, f.chofer_nombre]))
}
