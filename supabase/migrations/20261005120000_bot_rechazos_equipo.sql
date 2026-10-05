-- =============================================================
-- Bot de rechazos: equipo real (teléfonos + supervisor) para las alertas
-- de rechazo en reparto (foxtrot_alertas_rechazo / cron-alertas).
-- =============================================================
-- Datos: Chess /personalComercial + /rutasVenta (jerarquía y rutas) y
-- teléfonos completados por Fausto el 05/10/2026 (Chess no los tiene).
-- Solo Pampeana. Idempotente: se puede correr más de una vez.
-- Fuera a propósito: Vta. Mostrador (id 50, no es una persona), gerentes
-- y supervisores sin equipo (Carlos Martinez, Lopez Lucas).
-- Los envíos siguen APAGADOS (dry_run): se prenden desde la pantalla
-- Indicadores → Foxtrot Tracking → Alertas → Equipo.

BEGIN;

-- Si alguno de estos números estaba cargado en otra fila, se libera (phone_number es UNIQUE).
UPDATE bot_vendedores_wa
   SET phone_number = 'liberado-' || id_promotor, activo = false
 WHERE phone_number IN ('5493364344729', '5493364104454', '5493364580054', '5493364516477', '5493364517973', '5493364104453', '5493364104449', '5493364104448', '5493364657655', '5493364112630', '5493364658057', '5493364511561', '5493364223798', '5493364345313', '5493364217621', '5493364254083', '5493364406228', '5493364404629', '5492477314261', '5493364222886', '5493364252035', '5493364251866', '5493364625898', '5493364528260')
   AND id_promotor NOT IN ('sup_caballero', 'sup_petrillo', '53', '5', '18', '235', '20', '223', '54', '56', '236', '22', '234', '233', '101', '102', '201', '202', '108', '232', '231', '111', '105', '107');

-- Supervisores (ids sintéticos de la migración 157)
INSERT INTO bot_vendedores_wa (id_promotor, nombre, phone_number, empresa, rol, supervisor_id, activo, recibe_alertas_rechazo)
VALUES
  ('sup_caballero', 'CABALLERO SERGIO', '5493364344729', 'pampeana', 'supervisor', NULL, true, true),
  ('sup_petrillo', 'PETRILLO MAURO', '5493364104454', 'pampeana', 'supervisor', NULL, true, true)
ON CONFLICT (id_promotor) DO UPDATE SET
  nombre = EXCLUDED.nombre, phone_number = EXCLUDED.phone_number, rol = 'supervisor',
  activo = true, recibe_alertas_rechazo = true;

-- Vendedores (id_promotor = idPersonal de Chess), preventistas y repositores
INSERT INTO bot_vendedores_wa (id_promotor, nombre, phone_number, empresa, rol, supervisor_id, activo, recibe_alertas_rechazo)
VALUES
  ('53', 'BOSCACCI NICOLAS', '5493364580054', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('5', 'CHANFERONI DANIEL', '5493364516477', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('18', 'ESPINDOLA LUIS', '5493364517973', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('235', 'GODOY MAURICIO', '5493364104453', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('20', 'KEVIN BASSAN', '5493364104449', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('223', 'MARTINEZ JOSE', '5493364104448', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('54', 'OTTAVIANO NICOLAS', '5493364657655', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('56', 'OULEGO IVAN', '5493364112630', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('236', 'QUIÑONES RICARDO', '5493364658057', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('22', 'RODRIGUEZ JUAN PABLO', '5493364511561', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('234', 'SCHEFFER EMANUEL', '5493364223798', 'pampeana', 'promotor', 'sup_caballero', true, true),
  ('233', 'BARROS GASTON', '5493364345313', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('101', 'DINATALE DIEGO', '5493364217621', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('102', 'FRIAS GABRIELA', '5493364254083', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('201', 'GUSTAVO PEREZ', '5493364406228', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('202', 'LUGO FERNANDO', '5493364404629', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('108', 'MACAGNO ANTONELA', '5492477314261', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('232', 'OJEDA FLORENCIA', '5493364222886', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('231', 'SANTORO LUCAS', '5493364252035', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('111', 'SECCASPINA IGNACIO', '5493364251866', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('105', 'TRIANA VILLADA', '5493364625898', 'pampeana', 'promotor', 'sup_petrillo', true, true),
  ('107', 'URIARTE GREGORIO', '5493364528260', 'pampeana', 'promotor', 'sup_petrillo', true, true)
ON CONFLICT (id_promotor) DO UPDATE SET
  nombre = EXCLUDED.nombre, phone_number = EXCLUDED.phone_number, rol = 'promotor',
  supervisor_id = EXCLUDED.supervisor_id, activo = true, recibe_alertas_rechazo = true;

-- Horario pedido: 7:00 a 18:30. Envíos apagados hasta validar el día de prueba.
UPDATE foxtrot_alertas_config
   SET ventana_desde = '07:00', ventana_hasta = '18:30', dry_run = true, envios_activos = false
 WHERE id = 1;

COMMIT;
