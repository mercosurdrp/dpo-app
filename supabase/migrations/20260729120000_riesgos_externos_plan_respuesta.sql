-- Riesgos Externos — Plan de Respuesta (DPO Planeamiento 2.2, R2.2.2)
--
-- La auditoría 2026-07 puntuó 3 el punto 2.2. El directorio "A quién llamar"
-- (mig 20260728180000) resuelve la parte de "contactos responsables", pero
-- R2.2.2 pide además:
--   · una matriz de ESCALAMIENTO (a quién se sube y en cuánto tiempo),
--   · temas de NIVEL DE SERVICIO,
--   · MANO DE OBRA,
--   · procedimientos de AJUSTE DE PRONÓSTICO.
-- Nada de eso estaba en la "Presentación Riesgo Externo 2026" ni en la matriz
-- de riesgos: las fichas dicen a quién avisar, pero no en cuánto tiempo se
-- escala ni qué se hace con el servicio, la gente y el pronóstico.
--
-- Los textos sembrados acá son BORRADORES derivados de las fichas de la PPT.
-- Se editan desde la UI y se validan en la reunión de Gestión del Riesgo
-- Externo (TOR cargado en el mismo punto 2.2, frecuencia cuatrimestral).

begin;

-- =============================================
-- 1) Config por riesgo: los tres bloques de R2.2.2
-- =============================================

alter table riesgos_externos_config
  add column if not exists plan_nivel_servicio text,
  add column if not exists plan_mano_obra text,
  add column if not exists plan_ajuste_pronostico text;

comment on column riesgos_externos_config.plan_nivel_servicio is
  'R2.2.2 — qué se prioriza para sostener el servicio al cliente durante el evento.';
comment on column riesgos_externos_config.plan_mano_obra is
  'R2.2.2 — qué se hace con la gente: convocatoria, reasignación, horas extra, licencias.';
comment on column riesgos_externos_config.plan_ajuste_pronostico is
  'R2.2.2 — cómo se ajustan preventa, ruteo y pedido a planta cuando ocurre el riesgo.';

-- La matriz de la PPT usa BAJO para invasión de plagas y el check original
-- sólo aceptaba critico/alto/medio.
alter table riesgos_externos_config
  drop constraint if exists riesgos_externos_config_criticidad_check;
alter table riesgos_externos_config
  add constraint riesgos_externos_config_criticidad_check
  check (criticidad in ('critico', 'alto', 'medio', 'bajo'));

-- Los 5 riesgos del enum que nunca se cargaron en config (criticidad según la
-- hoja "Riesgos Externos" de la matriz).
insert into riesgos_externos_config (tipo_riesgo, prioritario, criticidad, nota) values
  ('temporal', false, 'medio', null),
  ('saqueos', false, 'medio', null),
  ('no_apertura_de_caja', false, 'medio', null),
  ('amenaza_de_bomba', false, 'medio', null),
  ('invasion_de_plagas', false, 'bajo', null)
on conflict (tipo_riesgo) do nothing;


-- =============================================
-- 2) Matriz de escalamiento
-- =============================================
-- Una fila por (riesgo, nivel). El nivel 1 es quien detecta y contiene; el
-- último nivel es el Comité de Crisis. `minutos_disparo` es el tiempo desde el
-- inicio del evento a partir del cual se escala si no se resolvió: es el dato
-- que la auditoría no encontró en ninguna ficha.

create table if not exists riesgos_externos_escalamiento (
  id uuid primary key default gen_random_uuid(),
  tipo_riesgo text not null,
  nivel integer not null check (nivel between 1 and 5),
  rol text not null,
  contacto_id uuid references riesgos_externos_contactos(id) on delete set null,
  suplente text,
  disparador text not null,
  minutos_disparo integer check (minutos_disparo >= 0),
  acciones text,
  activo boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_riesgo, nivel)
);

comment on table riesgos_externos_escalamiento is
  'Matriz de escalamiento por riesgo externo (DPO Planeamiento 2.2, R2.2.2).';
comment on column riesgos_externos_escalamiento.minutos_disparo is
  'Minutos desde el inicio del evento a partir de los cuales se escala a este nivel. NULL = sin plazo definido.';

create index if not exists riesgos_externos_escalamiento_tipo_idx
  on riesgos_externos_escalamiento(tipo_riesgo, nivel);

drop trigger if exists riesgos_externos_escalamiento_updated_at
  on riesgos_externos_escalamiento;
create trigger riesgos_externos_escalamiento_updated_at
  before update on riesgos_externos_escalamiento
  for each row execute function update_updated_at();

alter table riesgos_externos_escalamiento enable row level security;

drop policy if exists riesgos_externos_escalamiento_select_auth
  on riesgos_externos_escalamiento;
create policy riesgos_externos_escalamiento_select_auth
  on riesgos_externos_escalamiento for select using (true);

drop policy if exists riesgos_externos_escalamiento_write_editors
  on riesgos_externos_escalamiento;
create policy riesgos_externos_escalamiento_write_editors
  on riesgos_externos_escalamiento for all
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


-- =============================================
-- 3) Carga inicial del escalamiento
-- =============================================

insert into riesgos_externos_escalamiento
  (tipo_riesgo, nivel, rol, suplente, disparador, minutos_disparo, acciones)
values
  -- ===== Corte de luz (CRÍTICO · prioritario) =====
  ('corte_de_luz', 1, 'Supervisor de Depósito', 'Auxiliar de depósito de turno',
   'Al detectar el corte', 0,
   'Quien detecta el corte avisa al SDD. El SDD verifica el arranque del grupo electrógeno y que tenga combustible suficiente para sostener la operación.'),
  ('corte_de_luz', 2, 'Jefe de Logística', 'Supervisor de entrega',
   'Si a los 30 min el generador no cubre la operación', 30,
   'El SDD llama a EDEN para pedir el tiempo estimado de resolución e informa al JDL. Se decide si se sostiene el turno o se pasa a operación mínima.'),
  ('corte_de_luz', 3, 'Comité de Crisis (Gerente, Jefes de área, RR.HH., HSMA)', 'Gerente',
   'Si el tiempo estimado de resolución supera las 24 h', 1440,
   'Regla de la ficha original: el JDL convoca al Comité de Crisis y se evalúa el alquiler de un grupo electrógeno (Club Rental).'),

  -- ===== Falla en generador (ALTO) =====
  ('falla_en_generador', 1, 'Supervisor de Depósito', 'Auxiliar de depósito de turno',
   'Al detectar la falla', 0,
   'Se informa al SDD y mantenimiento verifica el funcionamiento del generador.'),
  ('falla_en_generador', 2, 'Mantenimiento / Servicio técnico del generador', 'Supervisor de entrega',
   'Si a los 60 min el generador no arranca', 60,
   'Se llama al servicio técnico del generador. En paralelo se consulta a EDEN el tiempo de restitución del suministro.'),
  ('falla_en_generador', 3, 'Jefe de Logística', 'Gerente',
   'Si el tiempo de reparación no se adecua a la operación', 240,
   'El JDL autoriza el alquiler de un grupo electrógeno móvil (Club Rental) e informa al Gerente. Si hace falta un repuesto crítico, se evalúa la compra.'),

  -- ===== Corte de sistema · WMS/Chess (CRÍTICO · prioritario) =====
  ('corte_de_sistema', 1, 'Responsable de Sistemas', 'Supervisor de Depósito',
   'Al detectar la caída', 0,
   'Quien detecta avisa al Responsable de Sistemas, que evalúa la situación y abre el ticket al proveedor del WMS.'),
  ('corte_de_sistema', 2, 'Supervisor de Depósito', 'Supervisor de entrega',
   'Si a los 30 min no hay fecha de resolución', 30,
   'Se activa la contingencia de la ficha: ruteo por Chess y picking por planillas impresas.'),
  ('corte_de_sistema', 3, 'Jefe de Logística + Gerente', 'Comité de Crisis',
   'Si la caída compromete la salida a ruta', 120,
   'Se evalúa modificar los horarios de los turnos y se avisa a Ventas. Si supera el día, se convoca al Comité de Crisis.'),

  -- ===== Corte de internet (ALTO · prioritario) =====
  ('corte_de_internet', 1, 'Responsable de Sistemas', 'Supervisor de Depósito',
   'Al detectar el corte', 0,
   'Se informa al Responsable de Sistemas, que reclama al ISP y pide el plazo de resolución.'),
  ('corte_de_internet', 2, 'Supervisor de Depósito', 'Supervisor de entrega',
   'Si a los 60 min no se restableció', 60,
   'Se habilita conexión por datos móviles compartidos para las tareas críticas: facturación, cierre de ruta y carga del pedido.'),
  ('corte_de_internet', 3, 'Jefe de Logística', 'Gerente',
   'Si el corte compromete la facturación del día', 240,
   'El JDL evalúa con Sistemas el enlace alternativo y avisa a Ventas para reprogramar la carga de pedidos.'),

  -- ===== Corte de ruta o acceso principal (ALTO) =====
  ('corte_de_ruta_o_acceso', 1, 'Quien detecta el corte', 'Supervisor de cada área',
   'Al detectar el corte o la imposibilidad de ingreso', 0,
   'Informa a los supervisores de cada área.'),
  ('corte_de_ruta_o_acceso', 2, 'Supervisores de área', 'Supervisor de entrega',
   'Al confirmarse el corte', 30,
   'Cada supervisor comunica a su equipo la situación y el acceso alternativo: Camping Copacabana, ingreso por atrás del depósito. Para cortes con horario anunciado se adelanta la salida de los camiones del interior.'),
  ('corte_de_ruta_o_acceso', 3, 'Jefe de Logística', 'Gerente',
   'Si el corte impide completar el reparto del día', 240,
   'El JDL define con Ventas la reprogramación de las rutas afectadas.'),

  -- ===== Incendio (ALTO) =====
  ('incendio', 1, 'Vigilancia / Auxiliares de Depósito', 'Supervisor de Depósito',
   'Al detectar el foco de incendio', 0,
   'Quien detecta comunica a Vigilancia. Los auxiliares comandan la evacuación hacia el punto de encuentro y sólo intervienen si no se pone en riesgo su integridad física.'),
  ('incendio', 2, 'Supervisor de Depósito', 'Jefe de Logística',
   'De inmediato, en paralelo a la evacuación', 5,
   'Se llama a Bomberos (100) y se da aviso al JDL y al asesor de HSMA.'),
  ('incendio', 3, 'Comité de Crisis + HSMA', 'Gerente',
   'Una vez controlado el foco', 30,
   'El Comité junto con HSMA determina las causas, evalúa los daños y define las acciones de prevención.'),

  -- ===== Paro sindical (CRÍTICO) =====
  ('paro_sindical', 1, 'Jefe de RR.HH.', 'Gerente',
   'Ante rumores de paro', 0,
   'RR.HH. chequea las fuentes de información y busca negociar con el sindicato la posibilidad de levantar la medida.'),
  ('paro_sindical', 2, 'Jefe de RR.HH. + Asesoría legal', 'Jefe de Logística',
   'Al confirmarse el paro', 60,
   'RR.HH. consulta a Legales para buscar una conciliación y se avisa al Jefe de Ventas para que se comunique a los clientes.'),
  ('paro_sindical', 3, 'Comité de Crisis', 'Gerente',
   'Si no hay noticias de levantamiento de la medida', 240,
   'Se reestructura la operación: se suspenden clasificación de envases y reempaque para liberar recursos hacia entrega.'),

  -- ===== Emergencia médica · accidente interno (CRÍTICO) =====
  ('emergencia_medica_interna', 1, 'Vigilancia / Auxiliar de Depósito', 'Supervisor de Depósito',
   'Al ocurrir el accidente', 0,
   'Mantener la calma. Se da aviso a Vigilancia o al auxiliar de depósito, que evalúa la gravedad y llama a Emergencias Médicas (107).'),
  ('emergencia_medica_interna', 2, 'Jefe de RR.HH.', 'Supervisor de entrega',
   'Inmediatamente después de asistir a la persona', 15,
   'Se da aviso a la ART y se coordina la derivación al sanatorio que corresponda (lesiones en ojos u otras partes del cuerpo).'),
  ('emergencia_medica_interna', 3, 'Comité de Crisis + HSMA', 'Jefe de Logística',
   'Dentro de la hora del hecho', 60,
   'Se informa al SDD, se abre la investigación del accidente y se definen acciones para evitar la repetición. El alta laboral es condición para el reintegro.'),

  -- ===== Emergencia médica · accidente externo (CRÍTICO) =====
  ('emergencia_medica_externa', 1, 'Chofer / acompañante', 'Supervisor de entrega (SDR)',
   'Al ocurrir el accidente en ruta', 0,
   'Mantener la calma. Dar aviso a RR.HH. o al supervisor que corresponda (SDD o SDR) y llamar a Emergencias Médicas.'),
  ('emergencia_medica_externa', 2, 'Jefe de RR.HH.', 'Jefe de Logística',
   'Inmediatamente después de asistir a la persona', 15,
   'Se da aviso a la ART y, ante lesiones graves, se coordina la derivación al sanatorio que corresponda.'),
  ('emergencia_medica_externa', 3, 'Comité de Crisis + HSMA', 'Gerente',
   'Dentro de la hora del hecho', 60,
   'Se informa al SDR y al SDV, se abre la investigación y se define el reemplazo del vehículo y del personal afectado.'),

  -- ===== Temporal (MEDIO) =====
  ('temporal', 1, 'Supervisor de Depósito', 'Supervisor de entrega',
   'Ante alerta meteorológica o inicio del temporal', 0,
   'BORRADOR — validar. Se informa a jefes y supervisores de cada área y se evalúa el estado del playón y de la mercadería a la intemperie.'),
  ('temporal', 2, 'Jefe de Logística', 'Gerente',
   'Si el temporal impide operar con seguridad', 60,
   'BORRADOR — validar. Se suspende la carga en playón, se asegura la mercadería y se resguarda al personal.'),
  ('temporal', 3, 'Comité de Crisis', 'Gerente',
   'Si compromete la salida a ruta del día', 240,
   'BORRADOR — validar. El Comité define la suspensión de la salida a ruta y la reprogramación del reparto.'),

  -- ===== Robo · Warehouse (ALTO) =====
  ('robo_warehouse', 1, 'Vigilancia', 'Supervisor de Depósito',
   'Al detectar el hecho', 0,
   'Se da aviso a Vigilancia y a la seguridad policial que dispone la empresa.'),
  ('robo_warehouse', 2, 'Jefe de Logística', 'Gerente',
   'Inmediatamente después de asegurar a las personas', 15,
   'Se comunica al Gerente o al Jefe de Administración y se llama a la Seccional de Policía.'),
  ('robo_warehouse', 3, 'Comité de Crisis', 'Gerente',
   'Una vez superada la contingencia', 240,
   'Se evalúan los daños sufridos y se definen los mecanismos para prevenir futuros episodios.'),

  -- ===== Robo · Distribución (ALTO) =====
  ('robo_distribucion', 1, 'Chofer', 'Supervisor de entrega',
   'Durante el hecho', 0,
   'No resistirse. Cumplir el protocolo de caja de seguridad: el dinero va a la caja apenas se cobra y la llave queda en el CD.'),
  ('robo_distribucion', 2, 'Supervisor de entrega', 'Jefe de Logística',
   'Apenas la persona esté a salvo', 15,
   'Se llama a Emergencias/Policía (101/911) y se da aviso al JDL. Se verifica el estado del chofer y del ayudante.'),
  ('robo_distribucion', 3, 'Comité de Crisis', 'Gerente',
   'Una vez superada la contingencia', 240,
   'Se evalúan los daños, se acompaña al personal afectado y se revisa el circuito de efectivo de la ruta.'),

  -- ===== Saqueos (MEDIO) =====
  ('saqueos', 1, 'Vigilancia', 'Supervisor de Depósito',
   'Al detectar la situación', 0,
   'BORRADOR — validar. Se da aviso a Emergencias (101/911) y a la vigilancia privada.'),
  ('saqueos', 2, 'Jefe de Logística', 'Gerente',
   'Al confirmarse el riesgo sobre el CD', 30,
   'BORRADOR — validar. Se comunica al Gerente, se cierra el acceso al predio y se resguarda al personal.'),
  ('saqueos', 3, 'Comité de Crisis', 'Gerente',
   'Una vez superada la contingencia', 240,
   'BORRADOR — validar. Se evalúan los daños y se define la reanudación de la operación.'),

  -- ===== Clausura del predio (CRÍTICO) =====
  ('clausura_del_predio', 1, 'Supervisor de entrega', 'Supervisor de Depósito',
   'Al notificarse la clausura', 0,
   'Se identifica el motivo principal de la medida y se informa al JDL y al Gerente.'),
  ('clausura_del_predio', 2, 'Gerente', 'Jefe de Administración',
   'Dentro de la hora', 60,
   'El Gerente negocia la reapertura del predio con quienes intervinieron en la decisión.'),
  ('clausura_del_predio', 3, 'Comité de Crisis', 'Gerente',
   'Si la clausura se sostiene más de un turno', 240,
   'Se informa a todos los sectores, se reprograman las actividades dentro y fuera del CD y se definen acciones para evitar la repetición.'),

  -- ===== No apertura de caja (MEDIO) =====
  ('no_apertura_de_caja', 1, 'Administración', 'Supervisor de entrega',
   'Al no poder abrir la caja', 0,
   'BORRADOR — validar: el riesgo no tiene ficha en la PPT.'),
  ('no_apertura_de_caja', 2, 'Jefe de Administración', 'Jefe de Logística',
   'Si impide la rendición de la ruta', 60,
   'BORRADOR — validar: definir el circuito alternativo de rendición.'),
  ('no_apertura_de_caja', 3, 'Gerente', 'Comité de Crisis',
   'Si se sostiene más de un día', 480,
   'BORRADOR — validar.'),

  -- ===== Amenaza de bomba (MEDIO) =====
  ('amenaza_de_bomba', 1, 'Quien recibe la amenaza', 'Vigilancia',
   'Al recibir la amenaza', 0,
   'BORRADOR — validar. Registrar los datos de la llamada y avisar de inmediato a Vigilancia y al SDD.'),
  ('amenaza_de_bomba', 2, 'Supervisor de Depósito', 'Jefe de Logística',
   'De inmediato', 5,
   'BORRADOR — validar. Evacuación al punto de encuentro y llamada a Policía (101/911) y Bomberos (100).'),
  ('amenaza_de_bomba', 3, 'Comité de Crisis', 'Gerente',
   'Una vez despejado el predio', 60,
   'BORRADOR — validar. El Comité define el reingreso al predio y la reanudación.'),

  -- ===== Pandemia (CRÍTICO) =====
  ('pandemia', 1, 'Jefe de RR.HH.', 'Asesor de HSMA',
   'Al disponerse la medida sanitaria', 0,
   'Se siguen las indicaciones y procedimientos del gobierno nacional o provincial y se entregan los EPP necesarios.'),
  ('pandemia', 2, 'Gerente + Jefe de RR.HH.', 'Jefes de área',
   'Al definirse el alcance de la restricción', 1440,
   'Se limita la cantidad de personas en la empresa con home office, se otorgan licencias al personal de riesgo y se capacita al personal.'),
  ('pandemia', 3, 'Comité de Crisis', 'Gerente',
   'Mientras dure la medida', null,
   'Se acuerda con sindicatos y comités la metodología de trabajo y se comunican las reglas a toda la operación.'),

  -- ===== Invasión de plagas (BAJO) =====
  ('invasion_de_plagas', 1, 'Supervisor de Depósito', 'Auxiliar de depósito de turno',
   'Al detectar la presencia de plagas', 0,
   'Se refuerzan los protocolos de fumigación y se aísla la mercadería afectada.'),
  ('invasion_de_plagas', 2, 'Bioplagas (proveedor)', 'Jefe de Logística',
   'Dentro de las 24 h', 1440,
   'Se convoca al proveedor de control de plagas para el tratamiento del sector afectado.'),
  ('invasion_de_plagas', 3, 'Jefe de Logística + HSMA', 'Gerente',
   'Si compromete stock apto para la venta', 2880,
   'Se evalúa el bloqueo del stock afectado y se informa a Calidad. Solucionado el problema, se informa a todas las áreas.')
on conflict (tipo_riesgo, nivel) do nothing;


-- =============================================
-- 4) Nivel de servicio · mano de obra · ajuste de pronóstico
-- =============================================
-- Un update por riesgo para que se lea cuál es cuál al revisarlo.

update riesgos_externos_config set
  plan_nivel_servicio = 'Se prioriza la carga de los camiones de ruta larga y de los clientes críticos. La salida a ruta se sostiene aunque el picking se demore; Ventas avisa la demora a los PDV afectados.',
  plan_mano_obra = 'Con luz de emergencia sólo se realizan tareas seguras. Si el corte supera las 4 h sin generador, se libera al personal de picking y se recupera en el turno siguiente con horas extra; expedición se mantiene en el CD.',
  plan_ajuste_pronostico = 'Si el corte cae en la ventana de preventa, se congela el pedido del día y la facturación pasa al día siguiente. El ruteo del día siguiente se recalcula sumando el remanente no entregado y se avisa a planta para reprogramar la recepción.'
where tipo_riesgo = 'corte_de_luz';

update riesgos_externos_config set
  plan_nivel_servicio = 'Mientras el generador no cubra la operación se trabaja en modo mínimo: se completan primero los pedidos ya pickeados y se sostiene la expedición de las rutas cargadas.',
  plan_mano_obra = 'Se reasigna al personal de picking a tareas que no dependan de energía (control de carga, orden de playón). Si la falla se extiende, se corta el turno y se reprograma con horas extra.',
  plan_ajuste_pronostico = 'Se recalcula el cierre del día con lo efectivamente preparado; el faltante se suma al pronóstico del día siguiente.'
where tipo_riesgo = 'falla_en_generador';

update riesgos_externos_config set
  plan_nivel_servicio = 'Se prepara por planilla la ruta del día priorizando los clientes ya facturados. Los pedidos que no se puedan facturar pasan a F+1 y Ventas los comunica al cliente.',
  plan_mano_obra = 'El picking por planilla rinde menos: se refuerza con el personal de reempaque y clasificación de envases y se prevén horas extra en el cierre. Un administrativo queda dedicado a cargar en el sistema lo hecho en papel cuando el servicio vuelve.',
  plan_ajuste_pronostico = 'Se congela el pedido a planta hasta recuperar el stock del sistema. Al restablecerse, se recuenta y se ajusta el pronóstico del día siguiente con el remanente y con lo que se preparó por planilla.'
where tipo_riesgo = 'corte_de_sistema';

update riesgos_externos_config set
  plan_nivel_servicio = 'Se sostienen facturación y cierre de ruta por datos móviles. Si no alcanza, se prioriza la facturación de las rutas que ya están cargadas.',
  plan_mano_obra = 'Sin cambios de dotación: el personal sigue operando y sólo se reprograman las tareas que dependen de conectividad (carga de pedidos, reportes).',
  plan_ajuste_pronostico = 'Si el corte alcanza la ventana de preventa, los pedidos se cargan diferidos y el ruteo del día siguiente absorbe lo no facturado.'
where tipo_riesgo = 'corte_de_internet';

update riesgos_externos_config set
  plan_nivel_servicio = 'Las rutas que cruzan el corte se reprograman a F+1 y Ventas avisa a los clientes. Se adelanta la salida de los camiones del interior para no quedar del lado equivocado del corte.',
  plan_mano_obra = 'Se comunica a todo el personal el acceso alternativo (Camping Copacabana). Quienes no puedan llegar se reprograman al turno siguiente.',
  plan_ajuste_pronostico = 'El volumen de las rutas suspendidas se reparte en los días siguientes; se avisa a planta si se posterga una recepción.'
where tipo_riesgo = 'corte_de_ruta_o_acceso';

update riesgos_externos_config set
  plan_nivel_servicio = 'La operación se detiene hasta que Bomberos habilite el reingreso. Ventas comunica la suspensión del reparto a los clientes del día.',
  plan_mano_obra = 'Evacuación total al punto de encuentro y recuento de personal. No se reingresa hasta la habilitación; el turno se reprograma.',
  plan_ajuste_pronostico = 'Se recalcula el stock disponible después de evaluar los daños y se ajusta el pedido a planta a la capacidad real del depósito.'
where tipo_riesgo = 'incendio';

update riesgos_externos_config set
  plan_nivel_servicio = 'Se revisa el listado de clientes críticos para focalizar la entrega en ellos según el horario de levantamiento de la medida.',
  plan_mano_obra = 'Se suspenden las tareas no críticas (clasificación de envases, reempaque) para liberar recursos hacia entrega. RR.HH. define con los supervisores quiénes se presentan y se usa personal de depósito para armar nuevas duplas de reparto.',
  plan_ajuste_pronostico = 'El volumen no entregado se reprograma en los días posteriores al paro y se avisa a planta para postergar las recepciones comprometidas.'
where tipo_riesgo = 'paro_sindical';

update riesgos_externos_config set
  plan_nivel_servicio = 'La atención de la persona accidentada tiene prioridad sobre cualquier tarea. La ruta o la línea afectada se reasigna para no frenar el reparto del resto.',
  plan_mano_obra = 'Se cubre el puesto de la persona accidentada con personal del mismo turno. El reintegro requiere alta laboral.',
  plan_ajuste_pronostico = 'Sin impacto en el pronóstico salvo que la parada afecte la salida a ruta; en ese caso se reprograma la ruta involucrada.'
where tipo_riesgo in ('emergencia_medica_interna', 'emergencia_medica_externa');

update riesgos_externos_config set
  plan_nivel_servicio = 'BORRADOR — validar. Se suspende la salida a ruta mientras dure el temporal y se comunican las demoras a los clientes del día.',
  plan_mano_obra = 'BORRADOR — validar. Se resguarda al personal en zona segura; no se opera en playón. El turno se reprograma según la duración.',
  plan_ajuste_pronostico = 'BORRADOR — validar. Las rutas suspendidas se reprograman al día siguiente y se ajusta el pedido a planta si se posterga una recepción.'
where tipo_riesgo = 'temporal';

update riesgos_externos_config set
  plan_nivel_servicio = 'Superada la contingencia, se retoma el reparto con la mercadería disponible; los clientes afectados por faltante se reprograman.',
  plan_mano_obra = 'Se acompaña al personal involucrado y se cubre su puesto en el turno. Se refuerza vigilancia en los horarios de riesgo.',
  plan_ajuste_pronostico = 'Se recuenta el stock afectado y se ajusta el pedido a planta con la diferencia detectada.'
where tipo_riesgo in ('robo_warehouse', 'robo_distribucion', 'saqueos');

update riesgos_externos_config set
  plan_nivel_servicio = 'Sin acceso al predio no hay reparto: Ventas comunica la suspensión y se define con el cliente la nueva fecha de entrega.',
  plan_mano_obra = 'El personal queda a disposición fuera del predio; RR.HH. define licencias o reprogramación de turnos según la duración de la medida.',
  plan_ajuste_pronostico = 'Se congelan la preventa y el pedido a planta mientras dure la clausura y se reprograma el volumen al reabrir.'
where tipo_riesgo = 'clausura_del_predio';

update riesgos_externos_config set
  plan_nivel_servicio = 'BORRADOR — validar: definir qué pasa con la rendición de la ruta y la entrega del día.',
  plan_mano_obra = 'BORRADOR — validar.',
  plan_ajuste_pronostico = 'BORRADOR — validar.'
where tipo_riesgo = 'no_apertura_de_caja';

update riesgos_externos_config set
  plan_nivel_servicio = 'BORRADOR — validar. La operación se detiene hasta que la autoridad habilite el reingreso al predio.',
  plan_mano_obra = 'BORRADOR — validar. Evacuación total y recuento de personal; el turno se reprograma según la duración.',
  plan_ajuste_pronostico = 'BORRADOR — validar. Se reprograma el reparto del día y se avisa a planta si se posterga una recepción.'
where tipo_riesgo = 'amenaza_de_bomba';

update riesgos_externos_config set
  plan_nivel_servicio = 'Se sostiene el reparto a los clientes habilitados según la normativa vigente, con los protocolos sanitarios que correspondan.',
  plan_mano_obra = 'Se limita la cantidad de personas en el CD con home office, se otorgan licencias al personal de riesgo y se entregan los EPP. Al normalizarse se reincorpora escalonadamente al personal con licencia y home office.',
  plan_ajuste_pronostico = 'El pronóstico se recalcula con la demanda real de los canales habilitados y el pedido a planta se ajusta a la capacidad operativa reducida.'
where tipo_riesgo = 'pandemia';

update riesgos_externos_config set
  plan_nivel_servicio = 'La mercadería afectada se bloquea y no se despacha. Se reemplaza por stock apto para no afectar la entrega.',
  plan_mano_obra = 'Sin cambios de dotación; se refuerzan los protocolos de limpieza y fumigación en el sector afectado.',
  plan_ajuste_pronostico = 'El stock bloqueado se descuenta del disponible y se ajusta el pedido a planta para reponerlo.'
where tipo_riesgo = 'invasion_de_plagas';

commit;
