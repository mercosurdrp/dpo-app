-- 20260626170000_agenda_eventos.sql
-- Módulo "Agenda": eventos/citas propios del equipo de gestión.
-- CRUD de eventos con fecha (y horario opcional), categorizados para colorear
-- en el calendario mensual. Solo tenant Misiones (gateado en la UI), pero la
-- tabla es inocua si la migración corre también en Pampeana.
-- Acceso: lectura para autenticados, escritura admin/supervisor (patrón mig 115).

BEGIN;

CREATE TABLE IF NOT EXISTS agenda_eventos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  fecha         date not null,                         -- día del evento
  todo_el_dia   boolean not null default true,
  hora_inicio   time,                                  -- solo si no es todo el día
  hora_fin      time,
  categoria     text not null default 'otro'
                check (categoria in (
                  'reunion', 'tarea', 'recordatorio',
                  'capacitacion', 'visita', 'otro')),
  responsable   text,                                  -- texto libre (a quién aplica)
  ubicacion     text,
  creado_por    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_fecha     ON agenda_eventos (fecha);
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_categoria ON agenda_eventos (categoria);

-- ───────────────────────── RLS (mismo patrón que mig 115 / gastos) ─────────────────────────
-- Lectura: cualquier usuario autenticado. Escritura: admin / supervisor.
ALTER TABLE agenda_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_eventos_read ON agenda_eventos;
CREATE POLICY agenda_eventos_read ON agenda_eventos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS agenda_eventos_write ON agenda_eventos;
CREATE POLICY agenda_eventos_write ON agenda_eventos
  FOR ALL TO authenticated
  USING (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin', 'supervisor'])))
  WITH CHECK (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin', 'supervisor'])));

COMMIT;
