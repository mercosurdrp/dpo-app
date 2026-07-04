-- Rol al que aplica cada ítem de OWD. Al cargar una observación de un
-- Chofer o Ayudante solo se muestran los ítems de ese rol + los comunes.
alter table owd_items
  add column if not exists rol text not null default 'ambos'
  check (rol in ('chofer', 'ayudante', 'ambos'));
