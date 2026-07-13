import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Un archivo adjunto de un avance. Se guarda en la columna jsonb `archivos`. */
export interface ArchivoAvance {
  path: string
  nombre: string
  mime: string | null
  bytes: number | null
}

export function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80)
}

/** Los File no vacíos de un campo repetido del form (input `multiple`). */
export function archivosDelForm(formData: FormData, key = "archivo"): File[] {
  return formData
    .getAll(key)
    .filter((f): f is File => f instanceof File && f.size > 0)
}

/**
 * Sube todos los archivos al bucket. Si uno falla, borra los ya subidos para
 * no dejar huérfanos: el avance se registra completo o no se registra.
 */
export async function subirArchivosAvance(
  supabase: Supabase,
  bucket: string,
  prefijo: string,
  files: File[],
): Promise<{ archivos: ArchivoAvance[] } | { error: string }> {
  const subidos: ArchivoAvance[] = []
  const marca = Date.now()

  for (const [i, file] of files.entries()) {
    const path = `${prefijo}/v${marca}-${i}-${cleanFileName(file.name)}`
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (error) {
      if (subidos.length > 0) {
        await supabase.storage.from(bucket).remove(subidos.map((a) => a.path))
      }
      return { error: `Subiendo ${file.name}: ${error.message}` }
    }
    subidos.push({
      path,
      nombre: file.name,
      mime: file.type || null,
      bytes: file.size,
    })
  }

  return { archivos: subidos }
}

/**
 * Archivos de una fila de avance. Las filas viejas (anteriores al multiarchivo)
 * tienen la columna `archivos` vacía y el adjunto en las columnas singulares.
 */
export function archivosDeFila(row: {
  archivos?: unknown
  archivo_path?: string | null
  archivo_nombre?: string | null
  archivo_mime?: string | null
  archivo_bytes?: number | null
}): ArchivoAvance[] {
  if (Array.isArray(row.archivos) && row.archivos.length > 0) {
    return (row.archivos as ArchivoAvance[]).filter((a) => a?.path)
  }
  if (row.archivo_path) {
    return [
      {
        path: row.archivo_path,
        nombre: row.archivo_nombre ?? "Archivo",
        mime: row.archivo_mime ?? null,
        bytes: row.archivo_bytes ?? null,
      },
    ]
  }
  return []
}

/**
 * Columnas a insertar en la tabla de avances. Las singulares siguen guardando el
 * primer archivo: las leen el PDF de rechazos, el historial de archivos del punto
 * y el CHECK que exige comentario o archivo_path.
 */
export function columnasArchivos(archivos: ArchivoAvance[]) {
  const primero = archivos[0] ?? null
  return {
    archivos,
    archivo_path: primero?.path ?? null,
    archivo_nombre: primero?.nombre ?? null,
    archivo_mime: primero?.mime ?? null,
    archivo_bytes: primero?.bytes ?? null,
  }
}
