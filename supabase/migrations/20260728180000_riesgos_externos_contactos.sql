-- Riesgos Externos — Directorio "A quién llamar" (DPO Planeamiento 2.2)
-- Un contacto por (tipo_riesgo, nombre): el mismo proveedor puede cubrir varios
-- riesgos y se carga una fila por cada uno, así la ficha de cada riesgo se lee sola.
-- Origen de la carga inicial: PPT "Presentación Riesgo Externo 2026" e "Imprimir.pptx"
-- (evidencia del punto 2.2, R2.2.3 / R2.2.4) + contactos aportados por el usuario.

create table if not exists riesgos_externos_contactos (
  id uuid primary key default gen_random_uuid(),
  tipo_riesgo text not null,
  nombre text not null,
  categoria text not null default 'externo'
    check (categoria in ('externo', 'interno', 'emergencia')),
  empresa text,
  referente text,
  telefono text,
  telefono_alt text,
  email text,
  horario text,
  notas text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_riesgo, nombre)
);

create index if not exists riesgos_externos_contactos_tipo_idx
  on riesgos_externos_contactos(tipo_riesgo);

drop trigger if exists riesgos_externos_contactos_updated_at
  on riesgos_externos_contactos;
create trigger riesgos_externos_contactos_updated_at
  before update on riesgos_externos_contactos
  for each row execute function update_updated_at();

alter table riesgos_externos_contactos enable row level security;

drop policy if exists riesgos_externos_contactos_select_auth
  on riesgos_externos_contactos;
create policy riesgos_externos_contactos_select_auth
  on riesgos_externos_contactos for select using (true);

drop policy if exists riesgos_externos_contactos_write_editors
  on riesgos_externos_contactos;
create policy riesgos_externos_contactos_write_editors
  on riesgos_externos_contactos for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (
          array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]
        )
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (
          array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]
        )
    )
  );

-- ===== Carga inicial =====
-- Los contactos sin teléfono son los gaps que dejó la PPT: quedan visibles a
-- propósito para que se completen desde la UI (la pantalla los marca "falta teléfono").
insert into riesgos_externos_contactos
  (tipo_riesgo, nombre, categoria, empresa, telefono, orden, notas)
values
  -- Corte de luz
  ('corte_de_luz', 'EDEN', 'externo', 'EDEN — distribuidora eléctrica', '3364-526944', 1, 'Pedir tiempo estimado de resolución; si supera 24 h se convoca al comité de crisis.'),
  ('corte_de_luz', 'Club Rental', 'externo', 'Club Rental', '3364 218522', 2, 'Provisión y alquiler de grupo electrógeno.'),
  ('corte_de_luz', 'Supervisor de Depósito', 'interno', null, '3364 22-0316', 3, null),

  -- Falla en generador
  ('falla_en_generador', 'Club Rental', 'externo', 'Club Rental', '3364 218522', 1, 'Alquiler de grupo electrógeno portátil si la falla no se resuelve.'),
  ('falla_en_generador', 'Servicio técnico del generador', 'externo', null, null, 2, 'FALTA EL DATO: confirmar si lo cubre Club Rental o es otro proveedor.'),
  ('falla_en_generador', 'Mantenimiento eléctrico', 'externo', null, null, 3, 'FALTA EL DATO: se llama cuando el problema no es del generador.'),
  ('falla_en_generador', 'EDEN', 'externo', 'EDEN — distribuidora eléctrica', '3364-526944', 4, null),
  ('falla_en_generador', 'Supervisor de entrega', 'interno', null, '3364 62-7812', 5, null),
  ('falla_en_generador', 'Jefe de Logística', 'interno', null, '3751-375390', 6, null),

  -- Corte de sistema (WMS / Chess)
  ('corte_de_sistema', 'Proveedor de WMS', 'externo', null, '112354-0836', 1, 'Confirmar razón social y referente.'),
  ('corte_de_sistema', 'Responsable de Sistemas', 'interno', null, '3757-632946', 2, null),
  ('corte_de_sistema', 'Supervisor de Depósito', 'interno', null, '3364 22-0316', 3, 'Contingencia: ruteo por Chess y picking por planillas.'),

  -- Corte de internet
  ('corte_de_internet', 'Proveedor de internet', 'externo', null, '3407-480616', 1, 'Confirmar razón social y referente.'),
  ('corte_de_internet', 'Responsable de Sistemas', 'interno', null, '03751-15632946', 2, null),
  ('corte_de_internet', 'SDD — Supervisor de Depósito', 'interno', null, '3364 22-0316', 3, null),
  ('corte_de_internet', 'SDF — Supervisor de entrega', 'interno', null, '3364 62-7812', 4, null),
  ('corte_de_internet', 'JDL — Jefe de Logística', 'interno', null, '3751-375390', 5, null),

  -- Corte de ruta o acceso principal
  ('corte_de_ruta_o_acceso', 'Supervisor de entrega', 'interno', null, '3364 62-7812', 1, 'Acceso alternativo: Camping Copacabana, ingreso por atrás del depósito.'),
  ('corte_de_ruta_o_acceso', 'Jefe de Logística', 'interno', null, '3751-375390', 2, null),
  ('corte_de_ruta_o_acceso', 'SDD — Supervisor de Depósito', 'interno', null, '3364 22-0316', 3, null),

  -- Incendio
  ('incendio', 'Bomberos', 'emergencia', null, '100', 1, null),
  ('incendio', 'Vigilancia / seguridad privada', 'externo', null, '3407 490459', 2, null),
  ('incendio', 'Auxiliares de Depósito', 'interno', null, '3364 10-4446', 3, 'Comandan la evacuación hacia el punto de encuentro.'),
  ('incendio', 'Jefe de Logística', 'interno', null, '3751-375390', 4, null),

  -- Paro sindical
  ('paro_sindical', 'Sindicato', 'externo', null, null, 1, 'FALTA EL DATO.'),
  ('paro_sindical', 'Asesoría legal', 'externo', null, null, 2, 'FALTA EL DATO: RR.HH. consulta a Legales para la conciliación.'),
  ('paro_sindical', 'Taxi / remis', 'externo', null, null, 3, 'FALTA EL DATO: traslado del personal sin movilidad propia.'),
  ('paro_sindical', 'Jefe de RR.HH.', 'interno', null, '03751-15448166', 4, null),
  ('paro_sindical', 'Jefe de Logística', 'interno', null, '3751-375390', 5, null),

  -- Emergencia médica (accidente interno)
  ('emergencia_medica_interna', 'Emergencias médicas', 'emergencia', null, '107', 1, null),
  ('emergencia_medica_interna', 'ART', 'externo', null, null, 2, 'FALTA EL DATO: se le da aviso en todos los accidentes.'),
  ('emergencia_medica_interna', 'Sanatorio de derivación', 'externo', null, null, 3, 'FALTA EL DATO: derivación por lesiones en ojos u otras partes del cuerpo.'),
  ('emergencia_medica_interna', 'Supervisor de entrega', 'interno', null, '3364 62-7812', 4, null),
  ('emergencia_medica_interna', 'Jefe de Logística', 'interno', null, '3751-375390', 5, null),
  ('emergencia_medica_interna', 'SDD — Supervisor de Depósito', 'interno', null, '3364 22-0316', 6, null),

  -- Emergencia médica (accidente externo)
  ('emergencia_medica_externa', 'Emergencias médicas', 'emergencia', null, '107', 1, 'Tomado de la ficha de accidente interno — confirmar que aplica igual.'),
  ('emergencia_medica_externa', 'ART', 'externo', null, null, 2, 'FALTA EL DATO.'),
  ('emergencia_medica_externa', 'Sanatorio de derivación', 'externo', null, null, 3, 'FALTA EL DATO: derivación por lesiones graves.'),
  ('emergencia_medica_externa', 'Supervisor de entrega', 'interno', null, '3364 62-7812', 4, null),
  ('emergencia_medica_externa', 'Jefe de Logística', 'interno', null, '3751-375390', 5, null),
  ('emergencia_medica_externa', 'SDD — Supervisor de Depósito', 'interno', null, '3364 22-0316', 6, null),

  -- Robo (Warehouse)
  ('robo_warehouse', 'Policía', 'emergencia', null, '101/911', 1, 'Llamar a la seccional que corresponda.'),
  ('robo_warehouse', 'Vigilancia / seguridad privada', 'externo', null, '3407 490459', 2, null),
  ('robo_warehouse', 'Jefe de Logística', 'interno', null, '3751-375390', 3, null),
  ('robo_warehouse', 'SDD — Supervisor de Depósito', 'interno', null, '3364 22-0316', 4, null),

  -- Robo (Distribución)
  ('robo_distribucion', 'Emergencias / Policía', 'emergencia', null, '101/911', 1, null),
  ('robo_distribucion', 'Vigilancia / seguridad privada', 'externo', null, '3407 490459', 2, null),
  ('robo_distribucion', 'Supervisor de entrega', 'interno', null, '3364 62-7812', 3, null),
  ('robo_distribucion', 'Jefe de Logística', 'interno', null, '3751-375390', 4, null),

  -- Saqueos (sin ficha propia en la PPT)
  ('saqueos', 'Policía', 'emergencia', null, '101/911', 1, 'Sin ficha propia en la PPT — validar el circuito.'),
  ('saqueos', 'Vigilancia / seguridad privada', 'externo', null, '3407 490459', 2, 'Sin ficha propia en la PPT — validar el circuito.'),

  -- Amenaza de bomba (sin ficha propia en la PPT)
  ('amenaza_de_bomba', 'Policía', 'emergencia', null, '101/911', 1, 'Sin ficha propia en la PPT — validar el circuito.'),
  ('amenaza_de_bomba', 'Bomberos', 'emergencia', null, '100', 2, 'Sin ficha propia en la PPT — validar el circuito.'),
  ('amenaza_de_bomba', 'Vigilancia / seguridad privada', 'externo', null, '3407 490459', 3, 'Sin ficha propia en la PPT — validar el circuito.'),

  -- Clausura del predio
  ('clausura_del_predio', 'Gerente', 'interno', null, '3364 11-2627', 1, 'Negocia la reapertura del predio.'),
  ('clausura_del_predio', 'Supervisor de entrega', 'interno', null, '3364 62-7812', 2, null),
  ('clausura_del_predio', 'Jefe de Logística', 'interno', null, '3751-375390', 3, null),
  ('clausura_del_predio', 'SDD — Supervisor de Depósito', 'interno', null, '3364 22-0316', 4, null),

  -- Pandemia
  ('pandemia', 'Gerente', 'interno', null, '3364 11-2627', 1, null),
  ('pandemia', 'Jefe de RR.HH.', 'interno', null, '3406-420544', 2, null),

  -- Invasión de plagas
  ('invasion_de_plagas', 'Bioplagas', 'externo', 'Bioplagas', '3407 400703', 1, 'Control de plagas.'),

  -- Riesgos sin ningún contacto definido todavía
  ('temporal', 'Sin contacto definido', 'externo', null, null, 1, 'FALTA EL DATO: el riesgo no tiene ficha en la PPT.'),
  ('no_apertura_de_caja', 'Sin contacto definido', 'externo', null, null, 1, 'FALTA EL DATO: el riesgo no tiene ficha en la PPT.')
on conflict (tipo_riesgo, nombre) do nothing;
