-- 20260627100000_agenda_recurrencia.sql
-- Agenda: soporte de eventos recurrentes (diario / semanal / mensual) con
-- fecha de corte opcional. La expansión a ocurrencias se hace en la lectura
-- (server action), no se materializan filas.

BEGIN;

ALTER TABLE agenda_eventos
  ADD COLUMN IF NOT EXISTS recurrencia text NOT NULL DEFAULT 'ninguna'
    CHECK (recurrencia IN ('ninguna', 'diaria', 'semanal', 'mensual')),
  ADD COLUMN IF NOT EXISTS recurrencia_hasta date;

COMMIT;
