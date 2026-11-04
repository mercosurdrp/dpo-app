-- Backfill de OT correctivas INTERNAS (DPO Flota 2.4 / R2.4.1). Generado 2026-11-04
-- por .scratch-rmd/correctivo/backfill-internas.mjs (solo lectura). REVISAR antes de correr.
-- Requiere APLICAR_EN_PAMPEANA_CORRECTIVO_2_4.sql (origen 'checklist'). Idempotente por numero_ot.
BEGIN;
CREATE TABLE IF NOT EXISTS backup_ot_internas_20261105 AS SELECT * FROM mantenimiento_realizados WHERE false;
-- El trigger descontaría de nuevo el stock al insertar el repuesto de la OT: el egreso YA está hecho.
ALTER TABLE mantenimiento_realizado_repuestos DISABLE TRIGGER trg_ot_repuesto_stock_ins;


-- A) 13 egresos manuales del pañol → OT internas con el repuesto vinculado
-- AE591EI 05/08/2026: Cambio de 1 Foco H7 24V 70W; Cambio de 5 Foco 24V 5W
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1803', 'AE591EI', '2026-08-05', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de foco en AE591EI — hecho en casa, sin pasar por taller · Cambio de 5 focos en AE591EI — hecho en casa, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1803');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco H7 24V 70W; Cambio de 5 Foco 24V 5W' FROM mantenimiento_realizados WHERE numero_ot = '1803'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco H7 24V 70W', 1, 'a6b33cea-f9aa-47ed-9c97-80d2f04f366e', 'e9930ad5-7feb-48f3-94c1-920a2c3140e0' FROM mantenimiento_realizados WHERE numero_ot = '1803'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'e9930ad5-7feb-48f3-94c1-920a2c3140e0');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1803 — AE591EI · ' || motivo WHERE id = 'e9930ad5-7feb-48f3-94c1-920a2c3140e0' AND motivo NOT LIKE 'OT %';
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco 24V 5W', 5, '0114db3a-11dc-4f4d-b4a8-f923326cf0ea', 'f041737d-2fa1-439b-9de1-f6a8690c6836' FROM mantenimiento_realizados WHERE numero_ot = '1803'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'f041737d-2fa1-439b-9de1-f6a8690c6836');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1803 — AE591EI · ' || motivo WHERE id = 'f041737d-2fa1-439b-9de1-f6a8690c6836' AND motivo NOT LIKE 'OT %';
-- AF399KY 05/08/2026: Cambio de 4 Foco 24V 5W; Cambio de 1 Foco H7 24V 70W
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1804', 'AF399KY', '2026-08-05', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de 4 focos en AF399KY — hecho en casa, sin pasar por taller · Cambio de foco en AF399KY — hecho en casa, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1804');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 4 Foco 24V 5W; Cambio de 1 Foco H7 24V 70W' FROM mantenimiento_realizados WHERE numero_ot = '1804'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco 24V 5W', 4, '0114db3a-11dc-4f4d-b4a8-f923326cf0ea', 'c2bee2c2-d963-4a26-8bac-a4384967886a' FROM mantenimiento_realizados WHERE numero_ot = '1804'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'c2bee2c2-d963-4a26-8bac-a4384967886a');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1804 — AF399KY · ' || motivo WHERE id = 'c2bee2c2-d963-4a26-8bac-a4384967886a' AND motivo NOT LIKE 'OT %';
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco H7 24V 70W', 1, 'a6b33cea-f9aa-47ed-9c97-80d2f04f366e', 'd2357a62-048c-41ad-b9b4-fbda2adbfa69' FROM mantenimiento_realizados WHERE numero_ot = '1804'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'd2357a62-048c-41ad-b9b4-fbda2adbfa69');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1804 — AF399KY · ' || motivo WHERE id = 'd2357a62-048c-41ad-b9b4-fbda2adbfa69' AND motivo NOT LIKE 'OT %';
-- AE908DF 05/08/2026: Cambio de 4 Foco 24V 5W
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1805', 'AE908DF', '2026-08-05', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de 4 focos en AE908DF — hecho en casa, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1805');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 4 Foco 24V 5W' FROM mantenimiento_realizados WHERE numero_ot = '1805'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco 24V 5W', 4, '0114db3a-11dc-4f4d-b4a8-f923326cf0ea', 'ff1f61d1-f3e0-4f90-969e-571d1cd7ff3f' FROM mantenimiento_realizados WHERE numero_ot = '1805'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'ff1f61d1-f3e0-4f90-969e-571d1cd7ff3f');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1805 — AE908DF · ' || motivo WHERE id = 'ff1f61d1-f3e0-4f90-969e-571d1cd7ff3f' AND motivo NOT LIKE 'OT %';
-- AF028YB 05/08/2026: Cambio de 1 Foco H7 24V 70W
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1806', 'AF028YB', '2026-08-05', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de foco en AF028YB — hecho en casa, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1806');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco H7 24V 70W' FROM mantenimiento_realizados WHERE numero_ot = '1806'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco H7 24V 70W', 1, 'a6b33cea-f9aa-47ed-9c97-80d2f04f366e', '25cde722-1c2f-4340-a0c6-e0c02465d04b' FROM mantenimiento_realizados WHERE numero_ot = '1806'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = '25cde722-1c2f-4340-a0c6-e0c02465d04b');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1806 — AF028YB · ' || motivo WHERE id = '25cde722-1c2f-4340-a0c6-e0c02465d04b' AND motivo NOT LIKE 'OT %';
-- AF664NY 05/08/2026: Cambio de 1 Foco H7 24V 70W
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1807', 'AF664NY', '2026-08-05', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de foco en AF664NY — hecho en casa, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1807');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco H7 24V 70W' FROM mantenimiento_realizados WHERE numero_ot = '1807'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco H7 24V 70W', 1, 'a6b33cea-f9aa-47ed-9c97-80d2f04f366e', '2499587e-4ecc-4a16-b766-a730518128f8' FROM mantenimiento_realizados WHERE numero_ot = '1807'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = '2499587e-4ecc-4a16-b766-a730518128f8');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1807 — AF664NY · ' || motivo WHERE id = '2499587e-4ecc-4a16-b766-a730518128f8' AND motivo NOT LIKE 'OT %';
-- AE908DH 05/08/2026: Cambio de 1 Foco H7 24V 70W; Cambio de 5 Foco 24V 5W
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1808', 'AE908DH', '2026-08-05', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de foco en AE908DH — hecho en casa, sin pasar por taller · Cambio de 5 focos en AE908DH — hecho en casa, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1808');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco H7 24V 70W; Cambio de 5 Foco 24V 5W' FROM mantenimiento_realizados WHERE numero_ot = '1808'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco H7 24V 70W', 1, 'a6b33cea-f9aa-47ed-9c97-80d2f04f366e', 'd2271fb5-dafa-4734-b70c-e019952d023a' FROM mantenimiento_realizados WHERE numero_ot = '1808'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'd2271fb5-dafa-4734-b70c-e019952d023a');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1808 — AE908DH · ' || motivo WHERE id = 'd2271fb5-dafa-4734-b70c-e019952d023a' AND motivo NOT LIKE 'OT %';
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco 24V 5W', 5, '0114db3a-11dc-4f4d-b4a8-f923326cf0ea', '4141025a-5fa4-4a39-a8ac-61fdc8fe5f6f' FROM mantenimiento_realizados WHERE numero_ot = '1808'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = '4141025a-5fa4-4a39-a8ac-61fdc8fe5f6f');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1808 — AE908DH · ' || motivo WHERE id = '4141025a-5fa4-4a39-a8ac-61fdc8fe5f6f' AND motivo NOT LIKE 'OT %';
-- AE908DF 13/10/2026: Cambio de 1 Foco R10W 24V
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1809', 'AE908DF', '2026-10-13', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de 1 foco en AE908DF — hecho en depósito, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1809');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco R10W 24V' FROM mantenimiento_realizados WHERE numero_ot = '1809'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco R10W 24V', 1, '4294bb54-5a8c-466d-bdce-27f51c6e2e49', 'cdd1c1ac-5318-4482-87bb-198d54f7e80f' FROM mantenimiento_realizados WHERE numero_ot = '1809'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = 'cdd1c1ac-5318-4482-87bb-198d54f7e80f');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1809 — AE908DF · ' || motivo WHERE id = 'cdd1c1ac-5318-4482-87bb-198d54f7e80f' AND motivo NOT LIKE 'OT %';
-- AF588SU 13/10/2026: Cambio de 1 Foco R10W 24V
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1810', 'AF588SU', '2026-10-13', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de 1 foco en AF588SU — hecho en depósito, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1810');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco R10W 24V' FROM mantenimiento_realizados WHERE numero_ot = '1810'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco R10W 24V', 1, '4294bb54-5a8c-466d-bdce-27f51c6e2e49', '74d3e7ba-9003-42db-af92-e47c7d61e4b3' FROM mantenimiento_realizados WHERE numero_ot = '1810'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = '74d3e7ba-9003-42db-af92-e47c7d61e4b3');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1810 — AF588SU · ' || motivo WHERE id = '74d3e7ba-9003-42db-af92-e47c7d61e4b3' AND motivo NOT LIKE 'OT %';
-- AE908DG 13/10/2026: Cambio de 1 Foco R10W 24V
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1811', 'AE908DG', '2026-10-13', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de 1 foco en AE908DG — hecho en depósito, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1811');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco R10W 24V' FROM mantenimiento_realizados WHERE numero_ot = '1811'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco R10W 24V', 1, '4294bb54-5a8c-466d-bdce-27f51c6e2e49', '0ddbb7db-09e5-4460-877b-417f0d3f852d' FROM mantenimiento_realizados WHERE numero_ot = '1811'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = '0ddbb7db-09e5-4460-877b-417f0d3f852d');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1811 — AE908DG · ' || motivo WHERE id = '0ddbb7db-09e5-4460-877b-417f0d3f852d' AND motivo NOT LIKE 'OT %';
-- AE591EI 13/10/2026: Cambio de 1 Foco R10W 24V
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1812', 'AE591EI', '2026-10-13', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del pañol: Cambio de 1 foco en AE591EI — hecho en depósito, sin pasar por taller. Hecha en depósito, sin taller ni costo de mano de obra.', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1812');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'Cambio de 1 Foco R10W 24V' FROM mantenimiento_realizados WHERE numero_ot = '1812'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
INSERT INTO mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, repuesto_id, movimiento_id)
  SELECT id, 'Foco R10W 24V', 1, '4294bb54-5a8c-466d-bdce-27f51c6e2e49', '5225b051-b3dc-4e42-860c-06c582b58366' FROM mantenimiento_realizados WHERE numero_ot = '1812'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_repuestos rr WHERE rr.movimiento_id = '5225b051-b3dc-4e42-860c-06c582b58366');
UPDATE mantenimiento_repuestos_movimientos SET motivo = 'OT 1812 — AE591EI · ' || motivo WHERE id = '5225b051-b3dc-4e42-860c-06c582b58366' AND motivo NOT LIKE 'OT %';

-- B) planes correctivos resueltos del checklist sin OT (47) → episodios
-- AE591EI Luces bajas y altas 29/07/2026–29/07/2026 (2 planes) → ya existe OT interna 1803 del 05/08/2026 (creada arriba): se vincula
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1803') WHERE id IN ('bb331988-904e-4616-a9b8-80968b4e192c', 'c25b8ac1-c7ce-422b-b18b-0cb61cec41a1') AND ot_id IS NULL;
-- AE908DF Luces de frenos 02/07/2026–02/07/2026 (2 planes): se le cambio foco
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1813', 'AE908DF', '2026-07-03', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Luces de frenos, reportado 02/07/2026 a 02/07/2026). Hecha en depósito, sin taller ni costo. Plan: se le cambio foco', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1813');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se le cambio foco' FROM mantenimiento_realizados WHERE numero_ot = '1813'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1813') WHERE id IN ('0173ff32-dfa0-41ef-9705-bfa497159086', '46e22cb6-4eb1-4c50-9ce7-76625d2b8156') AND ot_id IS NULL;
-- AE908DF Luces de frenos 07/08/2026–07/08/2026 (1 planes) → ya existe OT interna 1805 del 05/08/2026 (creada arriba): se vincula
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1805') WHERE id IN ('df261ca2-e4dd-477d-95fd-d73afa2caf8b') AND ot_id IS NULL;
-- AE908DH Cierre de lonas 27/07/2026–27/07/2026 (1 planes) → ya existe OT interna 1808 del 05/08/2026 (creada arriba): se vincula
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1808') WHERE id IN ('454a52db-47c3-4433-a342-b824f04ec756') AND ot_id IS NULL;
-- AF028YB Cierre de lonas 14/04/2026: se reparo
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1814', 'AF028YB', '2026-04-14', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Cierre de lonas, reportado 14/04/2026). Hecha en depósito, sin taller ni costo. Plan: se reparo', 'checklist', 'carroceria_lona', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1814');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se reparo' FROM mantenimiento_realizados WHERE numero_ot = '1814'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1814') WHERE id IN ('cf85b50c-d3ae-4d1e-9803-1ad7d6ece97f') AND ot_id IS NULL;
-- AF028YB Luces de giro y balizas delanteras y traseras 16/04/2026: se arreglo
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1815', 'AF028YB', '2026-04-17', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Luces de giro y balizas delanteras y traseras, reportado 16/04/2026). Hecha en depósito, sin taller ni costo. Plan: se arreglo', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1815');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se arreglo' FROM mantenimiento_realizados WHERE numero_ot = '1815'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1815') WHERE id IN ('1093dc45-b24f-426f-a1ce-56dd16cdcb02') AND ot_id IS NULL;
-- AF028YB Luces de giro y balizas delanteras y traseras 15/05/2026: se arreglo
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1816', 'AF028YB', '2026-05-16', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Luces de giro y balizas delanteras y traseras, reportado 15/05/2026). Hecha en depósito, sin taller ni costo. Plan: se arreglo', 'checklist', 'luces', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1816');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se arreglo' FROM mantenimiento_realizados WHERE numero_ot = '1816'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1816') WHERE id IN ('69fa8bd8-a616-48ba-9024-2e4307bbcc35') AND ot_id IS NULL;
-- AF028YB Pérdida de fluidos y/o alarmas 20/05/2026: se reparo
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1817', 'AF028YB', '2026-05-21', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Pérdida de fluidos y/o alarmas, reportado 20/05/2026). Hecha en depósito, sin taller ni costo. Plan: se reparo', 'checklist', 'refrigeracion_fluidos', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1817');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se reparo' FROM mantenimiento_realizados WHERE numero_ot = '1817'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1817') WHERE id IN ('8abefdcf-cf95-464e-ab8c-2ed66bd310e5') AND ot_id IS NULL;
-- AF664NY Cierre de lonas 12/06/2026–16/06/2026 (2 planes): se reparo lona | se reparo cierre de lona
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1818', 'AF664NY', '2026-06-16', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Cierre de lonas, reportado 12/06/2026 a 16/06/2026). Hecha en depósito, sin taller ni costo. Plan: se reparo lona | se reparo cierre de lona', 'checklist', 'carroceria_lona', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1818');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se reparo lona' FROM mantenimiento_realizados WHERE numero_ot = '1818'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1818') WHERE id IN ('c64e4108-ef79-4c92-9355-0dc10a3f6df4', 'dd7d488a-a0c7-4e77-84a2-1c20d092d6aa') AND ot_id IS NULL;
-- AF664NY Cierre de lonas 27/08/2026–31/08/2026 (4 planes) → ya existe OT 1768 del 11/09/2026 (cambiar guia de lona y soldar carroceria): se vincula
UPDATE checklist_planes_accion SET ot_id = '19033dbe-8aa7-40fc-b2f9-2f121315a050' WHERE id IN ('53162d4a-7422-470e-a12a-721cabff58dc', 'e880bcfb-d354-4666-a174-addb63624cdb', '60837f86-c561-42cc-b957-6a9e536a0b14', 'bf44086a-c389-45c9-b1ce-63e858aa8cce') AND ot_id IS NULL;
-- AF664NY Estado de lonas general 26/08/2026–26/08/2026 (1 planes) → ya existe OT 1762 del 24/08/2026 (soldaduras varias en carroceria): se vincula
UPDATE checklist_planes_accion SET ot_id = '8fb871d9-fe77-4196-a947-e8ca31277f40' WHERE id IN ('4bbb9eb3-97e3-4f5e-b926-5bcf000c20cc') AND ot_id IS NULL;
-- AF664NY Estado de manijas y barandas 27/08/2026–27/08/2026 (1 planes) → ya existe OT 1762 del 24/08/2026 (soldaduras varias en carroceria): se vincula
UPDATE checklist_planes_accion SET ot_id = '8fb871d9-fe77-4196-a947-e8ca31277f40' WHERE id IN ('b3e4fa38-e940-4d14-8948-0cc5e0756bfc') AND ot_id IS NULL;
-- HELI1 Estado del neumático (desgaste) 02/09/2026–02/09/2026 (1 planes) → ya existe OT 1767 del 03/09/2026 (null): se vincula
UPDATE checklist_planes_accion SET ot_id = '6e3d72af-107d-4e86-9a1f-fa57ea58848c' WHERE id IN ('cbdec3ed-f6dc-4f0a-a832-3cea9a99bff0') AND ot_id IS NULL;
-- HELI1 Pérdida de fluidos y/o alarmas 24/06/2026–25/06/2026 (2 planes): se saca un poco de aceite por que estan pasado | se llevo a nivel el aceite
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1819', 'HELI1', '2026-06-30', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Pérdida de fluidos y/o alarmas, reportado 24/06/2026 a 25/06/2026). Hecha en depósito, sin taller ni costo. Plan: se saca un poco de aceite por que estan pasado | se llevo a nivel el aceite', 'checklist', 'refrigeracion_fluidos', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1819');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se saca un poco de aceite por que estan pasado' FROM mantenimiento_realizados WHERE numero_ot = '1819'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1819') WHERE id IN ('f2aeb2b0-6abd-48ed-bf8a-df6fd3c2a323', 'd587140d-16b8-4b0b-827f-c36dc7967468') AND ot_id IS NULL;
-- HELI1 Pérdida de fluidos y/o alarmas 11/07/2026–04/08/2026 (18 planes) → ya existe OT 1789 del 04/08/2026 (Pérdida de aceite hidráulico corregida con personal propio: se drenaron 6 litros): se vincula
UPDATE checklist_planes_accion SET ot_id = 'ef30b9fd-ec75-4959-b908-9f3cef614f7e' WHERE id IN ('e8926712-6644-4e6d-9c7c-b922aef75691', '0e12f863-29cb-42a7-91c1-89d32a1eff33', '29d8ac02-008d-4cc8-bebd-235efc17c1d1', '7cf8aa65-87fd-4e92-869d-39d99c4dd4bc', '80dd6baa-a4af-459e-bdb6-8170d834e5cc', '1e5e16fb-0df0-4059-993d-4bbbadafe231', 'b8fb7759-82a9-4f8c-9dd1-30e87349ed40', '575b3865-7615-4066-aecc-db4ffd92613c', '36f20d2d-0ee6-45df-8247-69e7321dc5c2', 'b7ae5ad1-306a-49ed-859d-be010775c522', 'cbc1c704-26b5-4ce3-8a78-27b191431b11', 'bb68704f-3b5d-46ac-86bc-fc9bed325b00', 'f0bd3316-e57e-47e1-a16f-a3dd605bbc59', '4f85794e-1990-4dbf-ae7c-287dd11c3803', '459f17ba-29d3-4207-9223-5c312b646adf', 'ced70c28-a54b-4589-a2c6-d2adf2d35639', '566fe4b0-6796-41f1-825d-df58ae7729bd', '318cab19-d021-4651-a69f-e770440b4fdb') AND ot_id IS NULL;
-- HELI1 Pérdida de fluidos y/o alarmas 28/10/2026: habia quedado aceite residual del servis se lavo la maquina y se soluciono
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1820', 'HELI1', '2026-10-28', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Pérdida de fluidos y/o alarmas, reportado 28/10/2026). Hecha en depósito, sin taller ni costo. Plan: habia quedado aceite residual del servis se lavo la maquina y se soluciono', 'checklist', 'refrigeracion_fluidos', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1820');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'habia quedado aceite residual del servis se lavo la maquina y se soluciono' FROM mantenimiento_realizados WHERE numero_ot = '1820'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1820') WHERE id IN ('221d847d-ee4b-449f-88e5-e422a931fb75') AND ot_id IS NULL;
-- HELI2 Pérdida de fluidos y/o alarmas 24/06/2026–25/06/2026 (2 planes): se saco un poco de aceite por que esta pasado del nivel | se llevo a nivel
INSERT INTO mantenimiento_realizados (numero_ot, dominio, fecha, tipo, estado, taller, costo, observaciones, origen, sistema, es_service_general, rubro)
  SELECT '1821', 'HELI2', '2026-06-30', 'correctivo', 'completado', 'Depósito', 0, 'OT interna reconstruida del plan de acción del checklist (Pérdida de fluidos y/o alarmas, reportado 24/06/2026 a 25/06/2026). Hecha en depósito, sin taller ni costo. Plan: se saco un poco de aceite por que esta pasado del nivel | se llevo a nivel', 'checklist', 'refrigeracion_fluidos', false, 'general'
  WHERE NOT EXISTS (SELECT 1 FROM mantenimiento_realizados WHERE numero_ot = '1821');
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, descripcion)
  SELECT id, 'se saco un poco de aceite por que esta pasado del nivel' FROM mantenimiento_realizados WHERE numero_ot = '1821'
  AND NOT EXISTS (SELECT 1 FROM mantenimiento_realizado_tareas t WHERE t.mantenimiento_id = mantenimiento_realizados.id);
UPDATE checklist_planes_accion SET ot_id = (SELECT id FROM mantenimiento_realizados WHERE numero_ot = '1821') WHERE id IN ('d492479b-4dad-4fbb-b5f3-3ec2da227941', 'a2e4d037-b4d8-45a8-9b16-491f9693cc4a') AND ot_id IS NULL;

ALTER TABLE mantenimiento_realizado_repuestos ENABLE TRIGGER trg_ot_repuesto_stock_ins;
-- Verificación
SELECT origen, count(*) FROM mantenimiento_realizados WHERE tipo = 'correctivo' AND fecha >= '2026-01-01' GROUP BY 1;
SELECT count(*) AS planes_con_ot FROM checklist_planes_accion WHERE tipo = 'correctivo' AND ot_id IS NOT NULL;
COMMIT;


-- Quedaron SIN OT (revisar):
-- SIN OT (no es reparación): AE908DG Equipo de manipulación (carrito) 21/08/2026: "se envia carrito a soldar"
-- SIN OT (no es reparación): AE908DG Equipo de manipulación (carrito) 12/09/2026: "resuelto"
-- SIN OT (no es reparación): AE908DG La carga está debidamente asegurada 13/07/2026: "Carga sin asegurar en el AE908DG (estiba alta de latas sin stretch): se reacondiciono la c"
-- SIN OT (no es reparación): AE908DG La carga está debidamente asegurada 16/09/2026: "Se bajó el pallet y se reestibó antes de salir. Se habló con el armado de carga para que l"
-- SIN OT (no es reparación): HELI1 ¿Nivel de combustible superior a 1/4 tanque? 30/06/2026: "Autoelevador HELI1 con menos de 1/4 de tanque: se cargo combustible en el dia; el checklis"