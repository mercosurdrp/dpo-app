// Comprime una imagen en el navegador antes de mandarla a un Server Action.
// Reescala al lado máximo indicado y reencoda a JPEG para esquivar el límite
// de payload de las Server Actions (lo que hacía fallar la subida de fotos).
// Devuelve un File (conserva un nombre usable como key de Storage).
export async function comprimirImagen(
  file: File,
  { maxLado = 1600, calidad = 0.82 }: { maxLado?: number; calidad?: number } = {},
): Promise<File> {
  // Si no es imagen, la dejamos pasar tal cual (no hay nada que comprimir).
  if (!file.type.startsWith("image/")) return file

  const blob = await new Promise<Blob>((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxLado || height > maxLado) {
        const r = Math.min(maxLado / width, maxLado / height)
        width = Math.round(width * r)
        height = Math.round(height * r)
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("No se pudo procesar la imagen"))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))),
        "image/jpeg",
        calidad,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Archivo de imagen inválido"))
    }
    img.src = url
  })

  const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg"
  return new File([blob], nombre, { type: "image/jpeg" })
}
