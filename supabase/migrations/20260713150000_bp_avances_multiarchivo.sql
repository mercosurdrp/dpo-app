-- Buenas Prácticas: adjuntar N fotos/archivos como evidencia de la implementación.
-- Mismo patrón que 20260713120000_avances_multiarchivo.sql (planes, 5S, reuniones, ...):
-- la lista vive en `archivos`; las columnas singulares siguen guardando el PRIMER
-- archivo para no romper lecturas viejas.

ALTER TABLE bp_avances
  ADD COLUMN IF NOT EXISTS archivos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: las filas que ya tenían un adjunto singular pasan a la lista.
UPDATE bp_avances
SET archivos = jsonb_build_array(
      jsonb_build_object(
        'path', archivo_path,
        'nombre', COALESCE(archivo_nombre, 'Archivo'),
        'mime', archivo_mime,
        'bytes', archivo_bytes
      )
    )
WHERE archivo_path IS NOT NULL
  AND jsonb_array_length(archivos) = 0;

COMMENT ON COLUMN bp_avances.archivos IS
  'Adjuntos del avance: [{path,nombre,mime,bytes}] en el bucket buenas-practicas.';
