-- =============================================
-- 5S: agregar nombre opcional a sector responsable
-- =============================================

ALTER TABLE s5_sector_responsables
  ADD COLUMN nombre TEXT;
