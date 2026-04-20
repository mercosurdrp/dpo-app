-- =============================================
-- DPO archivos: auditoría + desarchivar + motivo
-- =============================================

-- Columnas de auditoría adicionales
ALTER TABLE dpo_archivos
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_by UUID REFERENCES profiles(id),
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES profiles(id);

-- Backfill: para los ya archivados, usar updated_at como archived_at aproximado
UPDATE dpo_archivos
SET archived_at = updated_at
WHERE archivado = true AND archived_at IS NULL;

-- Nuevos valores en el enum de actividad
ALTER TYPE dpo_actividad_tipo ADD VALUE IF NOT EXISTS 'archivo_archivado';
ALTER TYPE dpo_actividad_tipo ADD VALUE IF NOT EXISTS 'archivo_desarchivado';
ALTER TYPE dpo_actividad_tipo ADD VALUE IF NOT EXISTS 'archivo_metadata_editada';
