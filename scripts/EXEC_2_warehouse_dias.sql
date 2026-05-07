-- =============================================
-- EXEC #2 — Reuniones Warehouse: días lun-vie
-- =============================================
-- ISO weekday: 1=lun, 2=mar, 3=mié, 4=jue, 5=vie, 6=sáb, 7=dom
-- =============================================

UPDATE reuniones_tipos_config
SET dias_semana = '{1,2,3,4,5}'
WHERE tipo = 'warehouse';

-- Verificación
SELECT tipo, nombre, dias_semana FROM reuniones_tipos_config WHERE tipo = 'warehouse';
