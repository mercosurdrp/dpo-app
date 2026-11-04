-- Residuos de mantenimiento (DPO Flota 1.4): estado de la constancia que falta.
--
-- Hay residuos cuyo certificado de disposición final todavía no está: los 4
-- services de autoelevador (LitorMac y Rosario Servicios Autoelevadores) no
-- entran en el manifiesto de aceite, que cubre sólo camiones. Hasta ahora el
-- panel sólo podía decir "falta", y no se distinguía el que nadie pidió del que
-- ya está reclamado y en trámite — que ante el auditor no es lo mismo.
--
-- 🚨 El trámite NO es el certificado. Va en columnas aparte a propósito: si se
-- guardara en `certificado_url` el registro figuraría como amparado cuando no
-- lo está, que es exactamente lo que el R1.4.2 no perdona.

alter table mantenimiento_residuos
  add column if not exists constancia_solicitada_at date,
  add column if not exists tramite_path text,
  add column if not exists tramite_url text,
  add column if not exists tramite_nombre text,
  add column if not exists tramite_mime text;

comment on column mantenimiento_residuos.constancia_solicitada_at is
  'Fecha en que se le reclamó la constancia de disposición final al operador. NULL = todavía no se pidió.';
comment on column mantenimiento_residuos.tramite_path is
  'Comprobante de que la constancia está en trámite (remito, mail, foto del pedido). NO es el certificado: el certificado va en certificado_path.';
