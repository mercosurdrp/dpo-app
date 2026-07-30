/**
 * Categorías de las fotos de una participación cruzada.
 *
 * La categoría vive en el PATH del archivo (`cruces/<id>/<categoria>/<archivo>`)
 * en vez de en una columna paralela: así no hay dos fuentes que se puedan
 * desincronizar y las fotos viejas — que se subieron sin subcarpeta — siguen
 * mostrándose, simplemente sin etiqueta.
 */
export type CategoriaFotoCruce = "tema" | "participantes"

export const CATEGORIA_FOTO_LABELS: Record<CategoriaFotoCruce, string> = {
  tema: "Tema tratado",
  participantes: "Participantes",
}

/** Campo del form (y subcarpeta) de cada categoría. */
export const CAMPOS_FOTO_CRUCE: { campo: string; categoria: CategoriaFotoCruce }[] = [
  { campo: "foto_tema", categoria: "tema" },
  { campo: "foto_participantes", categoria: "participantes" },
]

/** `cruces/<id>/tema/17...-captura.jpg` -> "tema". Las viejas devuelven null. */
export function categoriaDeFoto(path: string): CategoriaFotoCruce | null {
  const partes = path.split("/")
  // cruces / <id> / <categoria> / <archivo>
  if (partes.length < 4) return null
  const cat = partes[2]
  return cat === "tema" || cat === "participantes" ? cat : null
}

/** Etiqueta corta para el botón que abre la foto. */
export function labelDeFoto(path: string): string {
  const cat = categoriaDeFoto(path)
  return cat ? CATEGORIA_FOTO_LABELS[cat] : "Ver foto"
}
