-- =============================================
-- Reportes de Seguridad: tipo_sif + tipo_accidente
-- =============================================
-- Reemplaza el booleano `sif` por dos campos categorizados:
--   tipo_sif        : sif_actual / sif_potencial / sif_precursor
--   tipo_accidente  : fat / lti / mti / fai / sio / sho
-- Mantenemos la columna `sif` (boolean) para no perder histórico.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reporte_seguridad_tipo_sif') THEN
    CREATE TYPE reporte_seguridad_tipo_sif AS ENUM (
      'sif_actual',
      'sif_potencial',
      'sif_precursor'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reporte_seguridad_tipo_accidente') THEN
    CREATE TYPE reporte_seguridad_tipo_accidente AS ENUM (
      'fat',
      'lti',
      'mti',
      'fai',
      'sio',
      'sho'
    );
  END IF;
END $$;

ALTER TABLE reportes_seguridad
  ADD COLUMN IF NOT EXISTS tipo_sif reporte_seguridad_tipo_sif,
  ADD COLUMN IF NOT EXISTS tipo_accidente reporte_seguridad_tipo_accidente;

CREATE INDEX IF NOT EXISTS idx_reportes_seguridad_tipo_sif
  ON reportes_seguridad(tipo_sif);
CREATE INDEX IF NOT EXISTS idx_reportes_seguridad_tipo_accidente
  ON reportes_seguridad(tipo_accidente);
