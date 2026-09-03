-- 144_pc_banda_al_limite.sql
-- DPO 3.4: la escala del calendario pasa a CRITICO / LIMITE / NORMAL.
--
-- El amarillo deja de ser "contexto sin volumen" y pasa a ser "al límite": el
-- día llega al 90% de la capacidad de distribución sin superarla. Así un
-- período se lee como semana (la previa de Navidad 2025 fue 96% · 113% · 102% ·
-- 94%) y no como celdas rojas sueltas. Clientes, rechazo y ausentismo siguen
-- como contexto en el detalle del día. Pedido por Sebastián Roselli, 03/09/2026.
--
-- El 90% es una constante del código (PCT_LIMITE en _lib/intensidad.ts); el
-- color se calcula en la app a partir de pct_capacidad, la vista no cambia.

begin;

delete from pc_planes_accion where codigo = 'ATENCION';

insert into pc_planes_accion (codigo, descripcion, plan_texto) values
  ('LIMITE',
   'Al límite — entre el 90% y el 100% de la capacidad de distribución',
   E'Día que entra en la flota pero sin margen: cualquier pedido extra o ausencia lo pasa a crítico.\n• Confirmar la dotación completa del día anterior; no otorgar francos.\n• Revisar el ruteo de la víspera y dejar prevista la segunda vuelta por si hace falta.\n• Si es víspera de feriado o cierre de mes, adelantar paletazos y pedidos grandes.\n• Avisar a Ventas que el día está al límite.')
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      plan_texto  = excluded.plan_texto,
      updated_at  = now();

commit;
