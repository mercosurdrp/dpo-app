-- Estándares de Flota (DPO 1.2): criticidad del ítem.
--
-- El punto pide distinguir lo MANDATORIO de lo de EXCELENCIA, y hasta ahora los
-- 46 ítems del modal camión pesaban igual: el 94,91 % de conformidad mezclaba
-- "le falta el arco antienganche" con "no tiene control crucero".
--
-- Criterio de la clasificación (acordado con el Gestor de Flota, 01/08/2026):
--   mandatorio → lo exige la ley (Ley 24.449 / RTO), o su ausencia habilita un
--                riesgo de lesión grave (caída de altura, atrapamiento, contacto
--                eléctrico, pérdida de control, incendio), o lo pide el texto del
--                requisito DPO (R1.2.5 telemetría).
--   excelencia → mejora desempeño, ergonomía, imagen o eficiencia; su ausencia
--                no habilita un riesgo grave inmediato.
--
-- El seed matchea por (ambito, orden) y NO por nombre: la planilla de origen
-- trae erratas ("ESTRIBOS LAERALES", "VIDIRIO Y ESPEJOS") que no conviene
-- congelar en una migración.

alter table public.flota_estandar_items
  add column if not exists criticidad text not null default 'excelencia';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'flota_estandar_items_criticidad_check'
      and conrelid = 'public.flota_estandar_items'::regclass
  ) then
    alter table public.flota_estandar_items
      add constraint flota_estandar_items_criticidad_check
      check (criticidad in ('mandatorio', 'excelencia'));
  end if;
end $$;

comment on column public.flota_estandar_items.criticidad is
  'DPO 1.2: mandatorio (legal o riesgo grave) vs excelencia (mejora). Separa el KPI de conformidad en dos.';

-- Camión: 23 mandatorios de 46.
--   10 edad de la flota · 20 lonas/cortinas · 30 caballetes · 40 dirección
--   hidráulica · 50 ABS · 120 arco antienganche · 170 documentación · 180
--   extintores · 190 ID de unidad · 200 estribos laterales · 210 estribo
--   superior · 220 cinta antideslizante · 230 vidrios y espejos · 240 botiquín
--   · 250 cinturón · 260 telemetría (R1.2.5) · 270 calco 3 puntos de apoyo ·
--   280 conos · 290 tacos de sujeción · 300 bandas reflectantes · 310 caja de
--   seguridad · 340 agarradera amarilla · 390 primer punto de apoyo amarillo.
update public.flota_estandar_items
   set criticidad = 'mandatorio'
 where ambito = 'camion'
   and orden in (10, 20, 30, 40, 50, 120, 170, 180, 190, 200, 210, 220, 230,
                 240, 250, 260, 270, 280, 290, 300, 310, 340, 390);

-- Autoelevador: 13 mandatorios de 17 (quedan en excelencia parabrisas cerrado,
-- marca de altura en torre, puerta e inflado de neumático).
update public.flota_estandar_items
   set criticidad = 'mandatorio'
 where ambito = 'autoelevador'
   and orden in (10, 20, 30, 40, 80, 90, 100, 110, 120, 130, 150, 160, 170);

-- La matriz se lee siempre agrupada por criticidad dentro de cada ámbito.
create index if not exists flota_estandar_items_ambito_criticidad_idx
  on public.flota_estandar_items (ambito, criticidad, orden);

-- Metas de los dos KPIs nuevos. El global (estandares_conformidad) se mantiene
-- para no cortar su serie histórica. Ambas editables con el lápiz de la card.
insert into flota_metas (kpi, meta, comparador, unidad, justificacion) values
  ('estandares_mandatorios', 100, '>=', '%',
   'Un ítem mandatorio es exigido por ley o su ausencia habilita un riesgo de lesión grave: la única meta defendible ante el auditor es 100%.'),
  ('estandares_excelencia', 95, '>=', '%',
   'Los ítems de excelencia son mejoras: se admite una brecha acotada mientras haya plan de acción, pero no puede quedar librada.')
on conflict (kpi) do nothing;
