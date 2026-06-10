-- 112_mapeo_chofer_gescom_venta_directa.sql
-- Flag `venta_directa` en mapeo_chofer_gescom: los códigos marcados son ventas directas
-- (no reparto) y el sync GESCOM los OBVIA por completo (ni denominador ni rechazos),
-- análogo a la exclusión de MOSTRADOR en Chess. Editable sin deploy.
-- Seed según definición del usuario 2026-06-10: 20017, 20022, 20050, 20012.
-- Idempotente; inocua en Misiones.

alter table public.mapeo_chofer_gescom
  add column if not exists venta_directa boolean not null default false;

insert into public.mapeo_chofer_gescom (codigo, nombre, venta_directa)
values
  ('20017', 'VENTA DIRECTA', true),
  ('20022', 'VENTA DIRECTA', true),
  ('20050', 'VENTA DIRECTA', true),
  ('20012', 'VENTA DIRECTA', true)
on conflict (codigo) do update set venta_directa = excluded.venta_directa;
