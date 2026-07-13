-- Varios archivos por avance/tarea (antes: uno solo por fila).
-- Las columnas archivo_* / evidencia_url siguen existiendo y guardan el PRIMER
-- archivo: hay lectores viejos (PDF de rechazos, historial de archivos del punto)
-- y un CHECK que exige comentario o archivo_path.
BEGIN;

ALTER TABLE public.planes_accion_avances
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.nps_planes_avances
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rechazos_planes_avances
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rmd_planes_avances
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tlp_planes_avances
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.s5_acciones_evidencias
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.reuniones_actividades_evidencias
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: el archivo único que ya tenían pasa a ser el primer elemento.
UPDATE public.planes_accion_avances SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;
UPDATE public.nps_planes_avances SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;
UPDATE public.rechazos_planes_avances SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;
UPDATE public.rmd_planes_avances SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;
UPDATE public.tlp_planes_avances SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;

UPDATE public.s5_acciones_evidencias SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;
UPDATE public.reuniones_actividades_evidencias SET archivos = jsonb_build_array(
  jsonb_build_object('path', archivo_path, 'nombre', archivo_nombre,
                     'mime', archivo_mime, 'bytes', archivo_bytes))
  WHERE archivo_path IS NOT NULL AND archivos = '[]'::jsonb;

-- Tareas del presupuesto: evidencia_url (path único, destructivo) -> lista.
ALTER TABLE public.presupuestos_tareas
  ADD COLUMN IF NOT EXISTS evidencia_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidencia_nombres text[] NOT NULL DEFAULT '{}';

UPDATE public.presupuestos_tareas
  SET evidencia_urls = ARRAY[evidencia_url],
      evidencia_nombres = ARRAY[COALESCE(evidencia_nombre, 'Archivo')]
  WHERE evidencia_url IS NOT NULL AND evidencia_urls = '{}';

COMMIT;
