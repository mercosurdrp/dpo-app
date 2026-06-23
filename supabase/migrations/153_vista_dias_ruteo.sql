-- 153: Días en que cada unidad efectivamente ruteó (para utilización / DRT en
-- el Seguimiento de flota). Distinct patente+fecha de los repartos.
create or replace view vista_dias_ruteo as
  select distinct upper(patente) as dominio, fecha
  from ventas_diarias_cliente
  where patente is not null and fecha is not null;

grant select on vista_dias_ruteo to authenticated;
