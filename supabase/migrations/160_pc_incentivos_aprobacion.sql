-- 160_pc_incentivos_aprobacion.sql
-- DPO 3.4 R3.4.4: el programa de incentivos guarda la APROBACIÓN DE GERENCIA
-- firmada (archivo + fecha + nota), separada del comunicado firmado por los
-- empleados que ya vivía en comunicado_path. Pedido por Sebastián Roselli,
-- 14/09/2026: "un lugar para cargar los archivos firmados por gerencia para la
-- aprobación del incentivo y el comunicado firmado por los empleados".
--
-- Los archivos van al bucket privado `reuniones`, prefijo `incentivos-pc/`,
-- igual que los otros dos adjuntos del programa.

begin;

alter table pc_incentivos_programa
  add column if not exists aprobacion_path   text,
  add column if not exists aprobacion_nombre text,
  add column if not exists aprobacion_fecha  date,
  add column if not exists aprobacion_nota   text;

comment on column pc_incentivos_programa.aprobacion_path is
  'Aprobación de gerencia firmada (bucket reuniones, prefijo incentivos-pc/). Evidencia R3.4.4.';
comment on column pc_incentivos_programa.comunicado_path is
  'Comunicado firmado por los empleados (planilla de firmas). Evidencia R3.4.4.';

commit;
