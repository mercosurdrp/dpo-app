-- FIX: entrega_cortes sólo tenía policy para service_role, pero registrarCorte()
-- (src/actions/priorizacion-entrega.ts) escribe con la anon key + sesión del
-- usuario, o sea rol authenticated. Resultado: el upsert del corte rebotaba con
-- "new row violates row-level security policy" y la tabla quedó en 0 filas desde
-- que se lanzó el módulo — el VRL nunca llegó a registrarse.
--
-- Alcance: leen todos los autenticados, escriben admin y supervisor. Mismo
-- criterio que la tabla vecina flota_indisponibilidad. No se abre la escritura a
-- todo authenticated porque la RLS es lo único que separa a un usuario de la API
-- REST de Supabase (no hace falta pasar por la UI), y acá hay 32 empleados y 4
-- auditores que no tienen por qué escribir ni borrar el histórico del VRL.
--
-- registrarCorte() valida el mismo rol antes de escribir, para que quien no lo
-- tenga vea un mensaje de la app y no un error opaco de la base.
create policy entrega_cortes_read on entrega_cortes
  for select to authenticated using (true);

create policy entrega_cortes_write on entrega_cortes
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
