-- Eliminación de usuarios duplicados.
--
-- Problema: deleteUser() borraba de auth.users y confiaba en el ON DELETE CASCADE
-- hacia profiles. Pero ~70 FKs apuntan a profiles(id) con NO ACTION / RESTRICT
-- (capacitaciones.created_by, sops.uploaded_by, s5_acciones.responsable_id, ...),
-- así que el borrado del profile explota con foreign_key_violation y GoTrue
-- devuelve un 500 opaco: el usuario nunca se termina de borrar.
--
-- Solución: antes de borrar, repuntar TODAS las referencias del usuario a
-- eliminar hacia el usuario que se conserva. Se repuntan también las FK
-- CASCADE / SET NULL: si no, borrar el duplicado se llevaría puestas sus
-- notificaciones, comunicaciones y reportes en vez de unificarlos.

-- Referencias de un usuario, tabla por tabla. Alimenta el diálogo de la app.
create or replace function public.admin_usuario_referencias(p_id uuid)
returns table (tabla text, columna text, filas bigint)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  n bigint;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and array_length(c.conkey, 1) = 1
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col)
      into n using p_id;
    if n > 0 then
      tabla := r.tbl; columna := r.col; filas := n;
      return next;
    end if;
  end loop;
end $$;

comment on function public.admin_usuario_referencias(uuid) is
  'Cuenta, por tabla y columna, los registros que referencian a un usuario. Usado por el diálogo de eliminar usuario.';

-- Transfiere los registros de p_origen a p_destino (si se indica) y borra p_origen.
-- Devuelve jsonb con el detalle de lo movido.
create or replace function public.admin_usuario_eliminar(
  p_origen uuid,
  p_destino uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  fila record;
  movidas bigint;
  descartadas bigint;
  es_nullable boolean;
  detalle jsonb := '[]'::jsonb;
  total_movidas bigint := 0;
  total_descartadas bigint := 0;
begin
  if p_origen is null then
    raise exception 'Falta el usuario a eliminar';
  end if;
  if not exists (select 1 from public.profiles where id = p_origen) then
    raise exception 'El usuario a eliminar no existe';
  end if;
  if p_destino is not null then
    if p_destino = p_origen then
      raise exception 'El usuario destino no puede ser el mismo que se elimina';
    end if;
    if not exists (select 1 from public.profiles where id = p_destino) then
      raise exception 'El usuario destino no existe';
    end if;
  end if;

  if p_destino is not null then
    for r in
      select c.conrelid::regclass::text as tbl, a.attname::text as col, a.attnotnull as notnull
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'public.profiles'::regclass
        and array_length(c.conkey, 1) = 1
    loop
      movidas := 0;
      descartadas := 0;
      es_nullable := not r.notnull;

      begin
        execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
          using p_destino, p_origen;
        get diagnostics movidas = row_count;
      exception when unique_violation then
        -- La tabla tiene un único por (usuario, algo) y el destino ya tiene esa
        -- fila: se repunta fila por fila y las que chocan se resuelven aparte.
        for fila in execute format('select ctid from %s where %I = $1', r.tbl, r.col) using p_origen
        loop
          begin
            execute format('update %s set %I = $1 where ctid = $2', r.tbl, r.col)
              using p_destino, fila.ctid;
            movidas := movidas + 1;
          exception when unique_violation then
            if es_nullable then
              -- Se preserva el registro, se pierde solo la autoría duplicada.
              execute format('update %s set %I = null where ctid = $1', r.tbl, r.col)
                using fila.ctid;
            else
              -- Fila puente redundante (lecturas, asistentes): el destino ya la tiene.
              execute format('delete from %s where ctid = $1', r.tbl) using fila.ctid;
            end if;
            descartadas := descartadas + 1;
          end;
        end loop;
      end;

      if movidas > 0 or descartadas > 0 then
        detalle := detalle || jsonb_build_object(
          'tabla', r.tbl, 'columna', r.col,
          'movidas', movidas, 'descartadas', descartadas
        );
        total_movidas := total_movidas + movidas;
        total_descartadas := total_descartadas + descartadas;
      end if;
    end loop;
  end if;

  -- profiles se borra por el ON DELETE CASCADE desde auth.users
  delete from auth.users where id = p_origen;
  delete from public.profiles where id = p_origen;

  return jsonb_build_object(
    'eliminado', p_origen,
    'transferido_a', p_destino,
    'registros_movidos', total_movidas,
    'registros_descartados', total_descartadas,
    'detalle', detalle
  );
end $$;

comment on function public.admin_usuario_eliminar(uuid, uuid) is
  'Transfiere los registros del usuario p_origen a p_destino y lo elimina de auth.users + profiles. Sin destino, elimina sin transferir (falla si tiene referencias con FK NO ACTION/RESTRICT).';

revoke all on function public.admin_usuario_referencias(uuid) from public, anon, authenticated;
revoke all on function public.admin_usuario_eliminar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_usuario_referencias(uuid) to service_role;
grant execute on function public.admin_usuario_eliminar(uuid, uuid) to service_role;
