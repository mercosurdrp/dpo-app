-- =============================================
-- 20261104130000_presupuesto_tareas_pilar.sql
-- Pilar DPO de cada tarea de análisis de desvíos (/presupuesto), para
-- filtrar los gastos por pilar: Flota, Entrega, Almacén, Gente, Seguridad,
-- Gestión, Planificación o Administración (lo que no es de ningún pilar).
--
-- Nullable a propósito: la app clasifica las tareas sin pilar desde el
-- botón «Clasificar por pilar» (reglas en src/lib/presupuesto/pilares.ts),
-- y el editor puede corregirlo a mano en cada tarea. El SQL no clasifica.
-- =============================================

ALTER TABLE presupuestos_tareas
  ADD COLUMN IF NOT EXISTS pilar text
    CHECK (
      pilar IS NULL OR pilar IN (
        'flota', 'entrega', 'almacen', 'gente',
        'seguridad', 'gestion', 'planificacion', 'administracion'
      )
    );

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_pilar
  ON presupuestos_tareas (anio, pilar);

COMMENT ON COLUMN presupuestos_tareas.pilar IS
  'Pilar DPO del gasto (flota, entrega, almacen, gente, seguridad, gestion, planificacion, administracion). NULL = sin clasificar.';
