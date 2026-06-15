-- Action Log (reuniones_actividades): campos estilo Planner para replicar el
-- Action Log de la "Reunión Diaria de Logística" exportado de Microsoft Planner.
-- Se agregan: prioridad, etiquetas (multi), checklist, varios responsables y
-- fecha de inicio. El "bucket/Depósito" del Planner se OMITE a propósito
-- (es casi equivalente al estado: no iniciada / en curso / realizada).
alter table reuniones_actividades
  add column if not exists prioridad text not null default 'media',
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists fecha_inicio date,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists responsables uuid[] not null default '{}';

comment on column reuniones_actividades.prioridad is 'media | importante | urgente';
comment on column reuniones_actividades.etiquetas is 'categorías: ALMACEN, ENTREGA, GENTE, FLOTA, MANTENIMIENTO, VENTAS, SEGURIDAD, GESTION, SLA, ADMIN';
comment on column reuniones_actividades.fecha_inicio is 'fecha de inicio de la tarea (Planner); ordena el Action Log (más viejas abajo)';
comment on column reuniones_actividades.checklist is 'array de {texto: string, completado: boolean}';
comment on column reuniones_actividades.responsables is 'IDs de profiles asignados (multi); responsable_id sigue siendo el principal';
