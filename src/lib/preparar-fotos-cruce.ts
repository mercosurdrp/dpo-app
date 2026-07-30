// Lado cliente: comprime las fotos de una participación cruzada antes de
// mandarlas al Server Action y valida que entren en el payload.
//
// Se manda MÁS de una foto (la captura del tema y la de los participantes), así
// que lo que importa es el peso TOTAL del request, no el de cada archivo: por
// encima del límite del Server Action el POST se corta con un error mudo.
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { CAMPOS_FOTO_CRUCE } from "@/lib/participacion-cruzada-fotos"

/** Margen propio sobre el `bodySizeLimit` de las Server Actions (25 MB). */
const MAX_TOTAL_BYTES = 12 * 1024 * 1024

/**
 * Reemplaza en el FormData los archivos crudos por sus versiones comprimidas.
 * Devuelve error si no hay ninguna foto (es la evidencia) o si aun comprimidas
 * no entran.
 */
export async function prepararFotos(
  formData: FormData,
): Promise<{ formData: FormData } | { error: string }> {
  let total = 0
  let cantidad = 0

  for (const { campo } of CAMPOS_FOTO_CRUCE) {
    const crudos = formData
      .getAll(campo)
      .filter((f): f is File => f instanceof File && f.size > 0)
    formData.delete(campo)
    for (const crudo of crudos) {
      let comprimida: File
      try {
        comprimida = await comprimirImagen(crudo)
      } catch {
        return { error: `No se pudo procesar «${crudo.name}». Probá con otra foto.` }
      }
      total += comprimida.size
      cantidad++
      formData.append(campo, comprimida)
    }
  }

  if (cantidad === 0) {
    return { error: "Subí al menos una foto: es la evidencia." }
  }
  if (total > MAX_TOTAL_BYTES) {
    return {
      error:
        `Las fotos pesan ${(total / 1024 / 1024).toFixed(1)} MB en total y el ` +
        "máximo es 12 MB. Subí menos fotos o sacalas con menos calidad.",
    }
  }

  return { formData }
}
