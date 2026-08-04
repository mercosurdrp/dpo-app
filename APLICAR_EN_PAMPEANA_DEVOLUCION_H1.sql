-- =============================================
-- Devolución de Auditoría DPO — H1 2026 (Mercosur Pampeana)
--
-- Carga la devolución del auditor por pilar/pregunta (columna K del Excel
-- "2026_DPO_2.1_Final") separada en tareas accionables individuales, con
-- check de resuelta + responsable/fecha límite como plan de acción.
--
-- Tablas genéricas por período: cuando llegue la devolución H2 se insertan
-- filas con periodo='H2 2026' sin tocar el esquema.
-- =============================================

CREATE TABLE IF NOT EXISTS devolucion_preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL DEFAULT 'H1 2026',
  pilar TEXT NOT NULL,
  bloque TEXT NOT NULL,
  numero TEXT NOT NULL,           -- '1.1', '14.5', etc. (texto: conserva el formato)
  pregunta TEXT NOT NULL,
  mandatoria BOOLEAN NOT NULL DEFAULT false,
  nota TEXT NOT NULL DEFAULT 'N/A',  -- '0' | '1' | '3' | '5' | 'N/A'
  comentario TEXT,                -- devolución completa del auditor (col K)
  orden SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periodo, pilar, numero)
);
CREATE INDEX IF NOT EXISTS idx_devolucion_preg_pilar ON devolucion_preguntas(periodo, pilar);

CREATE TABLE IF NOT EXISTS devolucion_tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID NOT NULL REFERENCES devolucion_preguntas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  orden SMALLINT NOT NULL DEFAULT 0,
  resuelta BOOLEAN NOT NULL DEFAULT false,
  resuelta_at TIMESTAMPTZ,
  resuelta_por UUID REFERENCES profiles(id),
  responsable TEXT,               -- texto libre, igual que acciones.responsable
  fecha_limite DATE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devolucion_tareas_preg ON devolucion_tareas(pregunta_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_tareas_pend ON devolucion_tareas(resuelta) WHERE NOT resuelta;

-- RLS: lectura para cualquier autenticado; escritura controlada por server actions.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['devolucion_preguntas','devolucion_tareas']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR SELECT TO authenticated USING (true);
    $f$, t || '_read', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR INSERT TO authenticated WITH CHECK (true);
    $f$, t || '_insert', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR UPDATE TO authenticated USING (true);
    $f$, t || '_update', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','admin_rrhh'))
      );
    $f$, t || '_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
                   t || '_updated_at', t);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- SEED H1 2026 (idempotente: ON CONFLICT DO NOTHING)
-- =============================================

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a3c14f2e-c586-4313-96b3-c810c40e4820', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.1', 'Reporte de incidentes/accidentes', true, '1', 'SOP disponible. Confección de la pirámide ok. Proceso de reporte de CS/CI en marcha desde el 2026 (23 reportes efectuados en el presente período - en su mayoría condiciones inseguras). Cuentan con App Vercel para acceder a los reportes y registros. Oportunidad: - Ajustar caso Cordone: solicitar nuevamente la recategorización a MTI del caso. Corregir clasificación de SIF (de SIF potencial pasaría a NA SIF). - Ajustar caso Rodriguez: corregir clasificación de SIF (de SIF actual pasaría a NA SIF). - Seguir reforzando reporte de comportamientos seguros/inseguros y condiciones inseguras. Afianzar participación de mandos medios y operación en dicho reporte. - Desarrollar análisis de gráfico de torta o similar a fin de analizar cuáles son los comportamientos inseguros más frecuentes o críticos en función a las tendencias y enfocar los PDA a dichos casos. - Alinear reporte de GKPIs en función a lo relevado internamente.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '974b29de-e97a-4b16-a45d-951050d02432', id, 'Ajustar caso Cordone: solicitar nuevamente la recategorización a MTI del caso. Corregir clasificación de SIF (de SIF potencial pasaría a NA SIF)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f518f9c7-cf49-48fd-a198-5c7950391392', id, 'Ajustar caso Rodriguez: corregir clasificación de SIF (de SIF actual pasaría a NA SIF)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '71f0e0bb-4e16-4d8e-80c4-57c4c536d736', id, 'Seguir reforzando reporte de comportamientos seguros/inseguros y condiciones inseguras. Afianzar participación de mandos medios y operación en dicho reporte', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '342bf757-8890-492e-87d6-0ba6dc9e3e2d', id, 'Desarrollar análisis de gráfico de torta o similar a fin de analizar cuáles son los comportamientos inseguros más frecuentes o críticos en función a las tendencias y enfocar los PDA a dichos casos', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '27d0f90b-f6d3-497f-9519-65c60ea80678', id, 'Alinear reporte de GKPIs en función a lo relevado internamente', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ab33a61f-18a6-4132-a924-9e80481c764e', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.2', 'Notificacion de incidentes/accidentes', false, '3', 'Notificaciones al EDV 100% documentadas. Alertas de seguridad compartidas al personal. Oportunidad: - Reforzar investigaciones, profundizando en el 5PQ. - Documentar notificación de alerta del caso de Rodríguez.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b174939e-084c-48b2-a6ac-5ac7688e712a', id, 'Reforzar investigaciones, profundizando en el 5PQ', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '52e81773-9d57-4537-8df6-b404b1ba6174', id, 'Documentar notificación de alerta del caso de Rodríguez', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c9f37afa-a437-4d69-9880-068373396982', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.3', 'Investigación de incidentes/accidentes y análisis de causa raíz', false, '3', 'Se implementa herramienta de análisis de causas con conclusión de causa raíz para el 100% de las investigaciones. Incorporaron al análisis la simulación del evento a fin de recrear la mecánica del accidente; revisan historial de comportamientos inseguros registrados con respecto al colaborador accidentado; actualizan ER en función a los accidentes ocurridos. Oportunidad: - Profundizar 5 por qué, considerando método, persona y proceso. - Reforzar gestión de implementación de acciones correctivas. Aplicar OWD al personal accidentado luego del reingreso y para casos de incidentes. - Documentar PDA mediante action log digital, asignando responsable, fecha de cumplimiento y status.', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '995ae288-a328-479c-b15e-b5318251bd96', id, 'Profundizar 5 por qué, considerando método, persona y proceso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ebef4dde-095c-4c7b-9beb-de72ce810450', id, 'Reforzar gestión de implementación de acciones correctivas. Aplicar OWD al personal accidentado luego del reingreso y para casos de incidentes', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7f6a6c21-34ad-4b92-8c00-f098c2df107c', id, 'Documentar PDA mediante action log digital, asignando responsable, fecha de cumplimiento y status', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d1cce84e-d885-4471-8f3a-ffaa9720cd3f', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.4', 'Proceso de revisión de rutina de gestión de incidentes/accidentes', false, '3', 'Se trata en el minuto de seguridad el tratamiento de pirámide de accidentología y alertas de seguridad por incidentes y accidentes (internos y/o externos). Oportunidad: seguir reforzando el conocimiento de la operación sobre pirámide de accidentología, clasificación y gestión de SIF.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4c22a559-06a1-4ea5-9cf5-749c8b5ec802', id, 'seguir reforzando el conocimiento de la operación sobre pirámide de accidentología, clasificación y gestión de SIF', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('97ac0115-fe13-43ae-a8dd-6d8ad97cd606', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.1', 'Control y gestión de entornos con déficit de oxígeno', false, 'N/A', NULL, 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c021a7f2-9f53-42ee-af33-2b306b10fe53', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.2', 'Monitoreo y gestión de sistemas de amoníaco', false, 'N/A', NULL, 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5794a6d3-ea06-4ed8-8026-ef22d3e73a48', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.3', 'Monitoreo y gestión de prevención de explosiones', false, '3', 'Carga de fuego realizada. No cuentan con áreas con riesgo de explosividad. Oportunidad: - Incluir baterías de litio en estudio de carga de fuego, detallando el poder calorífico del mismo. - Evaluar posibilidad de migrar el sector de carga de diesel a zona externa.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3cff8ac7-6335-4e16-b532-c1779907feb7', id, 'Incluir baterías de litio en estudio de carga de fuego, detallando el poder calorífico del mismo', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '52ad1b3f-520f-48b2-afe2-100b0e79a9d5', id, 'Evaluar posibilidad de migrar el sector de carga de diesel a zona externa', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bcbf7c83-2ab2-4b81-98a1-f32e9db52201', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.4', 'Gestión de sistemas eléctricos', true, '3', 'Medición de PAT realizada. Buen estado general de tableros. Se evidencia check trimestral de tableros. Personal autorizado y OPL de bloqueo y etiquetado gestionado a la vista. Oportunidad: - Actualizar medición de PAT verificando la continuidad de las masas en la totalidad de los tomacorrientes (prueba de disyuntor diferencial). Verificar OHMs obtenidos en cada uno de ellos. - Documentar permiso de trabajo para tareas excepcionales que involucren el manejo de tableros eléctricos.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fb02ca41-68d9-4274-b644-a667e08d8598', id, 'Actualizar medición de PAT verificando la continuidad de las masas en la totalidad de los tomacorrientes (prueba de disyuntor diferencial). Verificar OHMs obtenidos en cada uno de ellos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3a70bde3-07b7-4d56-9ebe-5ced406bc126', id, 'Documentar permiso de trabajo para tareas excepcionales que involucren el manejo de tableros eléctricos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('80ccd002-f30a-402d-94f8-68a8039168d9', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.1', 'Gestión del plan de tráfico', false, '3', 'Implementaron zona cero. Plan de tráfico implementado y gestionado a la vista. Oportunidad: - Incluir en layout: velocidad máxima, ubicación del trabaruedas proyectado a incorporarse. - Clausurar senda peatonal trasera en zona de vacíos. Ajustar apilabilidad de vacíos en dicho sector. - Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking. - Implementar reductores de velocidad en ingreso y salida de camiones. - Reforzar pintura de sendas y cruces peligrosos. - Vallar sendas de circulación en ingreso peatonal.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'dc487b2a-b0e0-41bf-8b69-5a5a11d006df', id, 'Incluir en layout: velocidad máxima, ubicación del trabaruedas proyectado a incorporarse', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c29164ce-4254-46fd-a0bf-93489b88c06f', id, 'Clausurar senda peatonal trasera en zona de vacíos. Ajustar apilabilidad de vacíos en dicho sector', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6c04fd6c-9f7e-40ef-b566-381c9c0d006a', id, 'Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3ca56884-e4ce-440d-974b-7459ee9bc3f4', id, 'Implementar reductores de velocidad en ingreso y salida de camiones', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e385ac49-2ee6-468a-a211-db663c769447', id, 'Reforzar pintura de sendas y cruces peligrosos', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '62cbc7c5-5d3e-4ffb-a130-ede91b42a399', id, 'Vallar sendas de circulación en ingreso peatonal', 6 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('fe954ab7-6649-4335-b541-a10fe02017fc', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.2', 'Carga y descarga de forma segura', false, '1', 'SOP disponible. Zona segura correctamente implementada. Oportunidad: - Implementar trabaruedas habilitado por CMQ. - Colocar cartelería en zona segura. - Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones. - Unificar aspectos de Seguridad y operativos dentro del mismo SOP.', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a166a313-f36f-40b4-bbca-a7538a646413', id, 'Implementar trabaruedas habilitado por CMQ', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1e1f571b-47ac-432d-8260-f034dfa2a41c', id, 'Colocar cartelería en zona segura', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'de30182f-e332-4d16-afca-eba4bef3855f', id, 'Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '43bef950-88db-482d-9b36-b605fed891ca', id, 'Unificar aspectos de Seguridad y operativos dentro del mismo SOP', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c0b6f73e-40b4-4365-b30c-ab3218e57d12', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.3', 'Utilización segura de equipos industriales motorizados', false, '1', 'La distribuidora dispone de autoelevadores a base de combustión interna (diesel). Oportunidad: - Se recomienda migrar al sistema a base de GLP según estándar global. Evidenciar plan de recambio. - Gestionar habilitación de autoelevadoristas según Res. 960/15.', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2b37a63f-6836-4436-8611-3ac207a4026e', id, 'Se recomienda migrar al sistema a base de GLP según estándar global. Evidenciar plan de recambio', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4255cabd-a2d1-45b3-b969-34d774dea589', id, 'Gestionar habilitación de autoelevadoristas según Res. 960/15', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8226b7d0-f5af-4830-af31-2313d1ed753e', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.4', 'Gestión de seguridad de los peatones', true, '3', 'Zona de picking segregada mediante barreras y mallas metálicas. Espejos parabólicos instalados en puntos ciegos. Oportunidad: - Implementar barreras fijas en zona de clasificación de envases. - Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking. - Implementar barreras fijas en sendas de circulación peatonal del ingreso a la distribuidora. - Se sugiere implementar alarmas de notificación de paso peatonal en cruces peligrosos. - Instalar puertas vaivén en cruces peligrosos. - Instalar barrera fija en cruce peligroso hacia canchas de picking (nave 2).', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '230c6417-9aaf-4b92-a8fa-2c7fdd284269', id, 'Implementar barreras fijas en zona de clasificación de envases', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '147db0e6-5231-4cb2-8b18-953fedfe60f5', id, 'Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c87d712a-e9a5-4352-bcb5-50f5ee19d35e', id, 'Implementar barreras fijas en sendas de circulación peatonal del ingreso a la distribuidora', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '454bab05-7a53-4761-9de7-9a54b429d57a', id, 'Se sugiere implementar alarmas de notificación de paso peatonal en cruces peligrosos', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b0dae0ac-f0d9-4d86-a0a4-ca1442f63e29', id, 'Instalar puertas vaivén en cruces peligrosos', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '932ccd0d-e121-4b6f-8175-dbd2ecca9d41', id, 'Instalar barrera fija en cruce peligroso hacia canchas de picking (nave 2)', 6 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('49d57451-036a-4851-8f24-060b52962607', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.5', 'Inspección previa al uso de equipos industriales motorizados y ejecucion segura', false, '3', 'Se evidencia adherencia al check de autoelevadores. Oportunidad: - Reforzar implementación de OWD del proceso. - Reforzar frecuencia de implementación de zorras eléctricas (check diario).', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7a78bfbb-a96d-4ef0-a03d-4cfa7f882706', id, 'Reforzar implementación de OWD del proceso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '63ef00d1-2042-471d-b20e-4a78d66401ea', id, 'Reforzar frecuencia de implementación de zorras eléctricas (check diario)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('79a178dd-e796-479e-8950-e35f8f8ac32a', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.6', 'Ejecución Segura de control de llaves', true, '3', 'Cuentan con tablero para el guardado de llaves al finalizar la jornada. Comenzaron a implementar OWDs. Oportunidad: - Reforzar proceso de control de llaves durante la operación de recarga mediante la implementación de depósito de llave con sistema de bloqueo en trabaruedas. - Gestionar a la vista personal responsable del control final. - Unificar en SOP de control de llaves los aspectos de seguridad y operativos. - Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones.', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd93dbfba-66a4-494b-8b50-3af7db32c645', id, 'Reforzar proceso de control de llaves durante la operación de recarga mediante la implementación de depósito de llave con sistema de bloqueo en trabaruedas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ef34a77a-ea4f-4f54-847e-76b27535898e', id, 'Gestionar a la vista personal responsable del control final', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '59cb5b05-164c-4940-b916-cb3a21fbbc40', id, 'Unificar en SOP de control de llaves los aspectos de seguridad y operativos', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd20df22b-3377-4706-9a39-3b35a46366fa', id, 'Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2154bfac-5038-4ac1-a35d-6460701df804', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.7', 'Gestión de puertas muelles', false, 'N/A', NULL, 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3b3ff2a8-a54c-4101-bfdd-3885b60094ae', 'H1 2026', 'Seguridad', 'MANIPULACIÓN DE MATERIALES Y ERGONOMÍA', '4.1', 'Ejecución segura de manipulación manual de materiales', false, '3', 'Estudio ergonómico de puestos de trabajo realizado (totalidad de puestos contemplados). Tuvieron dos casos de TME en el presente período. Oportunidad: - En función a los eventos ocurridos, reforzar el aspecto conductual del personal sobre la manipulación manual de cargas. - Reforzar conclusiones del estudio y PDA derivados del mismo. - Integrar preguntas referidas a posturas ergonómicas dentro de los puntos a evaluar en las OWD.', 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e236c893-f9fe-4509-a6a2-293590c812ed', id, 'En función a los eventos ocurridos, reforzar el aspecto conductual del personal sobre la manipulación manual de cargas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8b71eea7-c454-44ee-8bc9-e2632e19332f', id, 'Reforzar conclusiones del estudio y PDA derivados del mismo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0f6d8dc6-b38e-4229-986a-676427333cc8', id, 'Integrar preguntas referidas a posturas ergonómicas dentro de los puntos a evaluar en las OWD', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('11d5d333-3264-4309-8f43-29d81f893d09', 'H1 2026', 'Seguridad', 'MANIPULACIÓN DE MATERIALES Y ERGONOMÍA', '4.2', 'Gestión de equipos de elevación mecánica, racks y estantes', false, '3', 'Racks en buenas condiciones. Protecciones visibles en base de bastidores y extremos. Check trimestral ok. Gestionaron cartelería de capacidad máxima para la totalidad de los racks. Oportunidad: - Implementar habilitación anual por parte de profesional habilitado. Contemplar en dicho estudio la medición de nivelación del suelo donde se afirma la estructura de los racks. - Completar soporte transversal faltante.', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '48d3dd04-e1a6-4c06-85fc-39b443a6c4aa', id, 'Implementar habilitación anual por parte de profesional habilitado. Contemplar en dicho estudio la medición de nivelación del suelo donde se afirma la estructura de los racks', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '48b7f6ae-9f04-403a-833e-759b2f64a3ad', id, 'Completar soporte transversal faltante', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6283d5ce-d31a-48d1-aedb-b7b9f7a2f7c7', 'H1 2026', 'Seguridad', 'MANIPULACIÓN DE MATERIALES Y ERGONOMÍA', '4.3', 'Ejecución segura de equipos de elevación mecánica', true, 'N/A', 'No cuentan con gato hidráulico o cricket botella.', 18)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('05b080d9-a6cf-441a-830a-ecc056c89812', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.1', 'Ejecucion segura de Carga de GLP', true, 'N/A', NULL, 19)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2ae35fb5-93b8-474b-baed-a9cfc02aadef', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.2', 'Ejecucion segura de Carga de baterías', true, '1', 'Sector de carga de baterías en cumplimiento de 5S, cartelería (OPL y riesgo eléctrico) y lavaojos disponible en sector. Oportunidad: - Desarrollar SOP. - Gestionar a la vista cartelería de personal autorizado. - Verificar que la carga de baterías cuente con sistema de corte automático en cargadores para prevenir sobrecalentamiento. - Contar con extintor específico para baterías de litio en el sector (F500 o clase L).', 20)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '835a0600-9ebc-48c2-89bb-6340e5eb05a7', id, 'Desarrollar SOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '85ef6a18-1598-458f-ad12-152cda8a05f7', id, 'Gestionar a la vista cartelería de personal autorizado', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4debf7a0-1fb9-48ed-8db0-8f188d934247', id, 'Verificar que la carga de baterías cuente con sistema de corte automático en cargadores para prevenir sobrecalentamiento', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '69d4f9fe-9069-473e-91ae-908fc1e93997', id, 'Contar con extintor específico para baterías de litio en el sector (F500 o clase L)', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6fe866d7-db5e-490c-8637-7dbe017aa1c0', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.3', 'Ejecucion segura de carga de Diesel/Gasoil', true, '1', 'Sector de carga de diesel en cumplimiento de 5S, kit antiderrame disponible , lavaojos y OPL. Cartelería de prohibición de fumar y riesgo de incendio presente. Oportunidad: - Desarrollar SOP. - Remover material combustible (pallet) donde se posiciona el tambor de diesel. Reemplazar por estructura metálica. - Implementar OWDs del proceso.', 21)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b4e44c44-6f9f-4b43-81f2-8eca776377db', id, 'Desarrollar SOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f22ece5e-380c-4eb0-b7fa-e83e119811b7', id, 'Remover material combustible (pallet) donde se posiciona el tambor de diesel. Reemplazar por estructura metálica', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f1350bfe-c562-4273-b75a-8a62739e582b', id, 'Implementar OWDs del proceso', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('833170c2-099d-4663-9703-29fe80786a60', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.4', 'Almacenamiento y transporte seguro de tubos de gas comprimido', false, '1', 'Cuentan con SOP de manipulación de tubos de CO2. Disponen de OPL para manipulación y transporte de barriles de cerveza. Oportunidad: - Profundizar SOP incluyendo la manipulación de barriles. - Implementar OWDs al proceso.', 22)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1a8c2a01-36ef-49b8-acde-0174b05a9f4f', id, 'Profundizar SOP incluyendo la manipulación de barriles', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e1d3a36f-aa4f-44c4-8b19-06c61e108192', id, 'Implementar OWDs al proceso', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b775f431-d40c-437f-9da9-41d0ed9e531b', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.5', 'Almacenamiento de sustancias peligrosas', false, '3', 'Materiales incompatibles almacenados por separado (matriz de compatibilidad visible). Bateas de contención antiderrames disponibles para la lavandina en dicho sector. Orden y limpieza ok. Oportunidad: - Completar bandeja antiderrame para la totalidad de los productos.', 23)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'dd0d2159-9451-4ced-ab54-bf3a7b1f5d64', id, 'Completar bandeja antiderrame para la totalidad de los productos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('df51f6ba-964e-4821-91da-c5b361afb9ab', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.6', 'SDS Management', false, '3', 'Hojas de seguridad y matriz de compatibilidad disponibles. Se evidencia control de inventario químico. Oportunidad: gestionar a la vista (en formato físico) las hojas de seguridad de la totalidad de los productos almacenados.', 24)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bcbf2af8-c0ea-47b2-a23f-1137551aa358', id, 'gestionar a la vista (en formato físico) las hojas de seguridad de la totalidad de los productos almacenados', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1f9f66a1-72f7-4fbb-be71-299b074cfc8c', 'H1 2026', 'Seguridad', 'ESPACIO CONFINADO', '6.1', 'Identificación, señalizacion e inventario de espacios confinados', false, 'N/A', NULL, 25)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('36543a72-2eba-4b78-bd33-c3185f9ac5ea', 'H1 2026', 'Seguridad', 'ESPACIO CONFINADO', '6.2', 'Ejecucion segura de entrada en espacios confinados', false, '5', 'Capacitación de espacios confinados realizada. Entrevistas ok.', 26)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4eee7cd1-520c-4190-8ee1-933da3b460b1', 'H1 2026', 'Seguridad', 'PREVENCIÓN DE VIOLENCIA', '7.1', 'Gestión de dinero efectivo en ruta', false, '3', 'SOP documentado. Alrededor de un 50% de los PDVs manejan medios de pago en efectivo. Oportunidad: - Reforzar implementación de OWDs al proceso, entrenamientos y completar relevamiento de medios de pago en PDV a fin de impulsar PDA. - Ajustar SOP agregando el detalle del límite de billetes que pueden cargarse en la caja fuerte y plan de contingencias ante llenado de caja fuerte. - Reforzar, en los casos en los que sea posible, la gestión de migración de medios de pago en efectivo hacia medios de pago digitales, a fin de disminuir la manipulación de efectivo en ruta.', 27)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c2d03db4-2668-448b-9efd-7b37512e5d00', id, 'Reforzar implementación de OWDs al proceso, entrenamientos y completar relevamiento de medios de pago en PDV a fin de impulsar PDA', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '53be7a31-705a-4b78-90bf-f6c0317c3128', id, 'Ajustar SOP agregando el detalle del límite de billetes que pueden cargarse en la caja fuerte y plan de contingencias ante llenado de caja fuerte', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5e504f8d-ef76-43b4-8793-65a668ec3b92', id, 'Reforzar, en los casos en los que sea posible, la gestión de migración de medios de pago en efectivo hacia medios de pago digitales, a fin de disminuir la manipulación de efectivo en ruta', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('592db010-413d-4a53-9647-37a4a81647ab', 'H1 2026', 'Seguridad', 'PREVENCIÓN DE VIOLENCIA', '7.2', 'Ejecución segura de la prevención de la violencia', false, '3', 'SOP completo. Cuentan con cerco perimetral, sistema CCTV y alarma con sensor de movimiento. Cuentan con custodio de seguridad desde las 18 hasta las 7:30. Oportunidad: - Proyectar implementar botones antipánico en tesorería. - Implementar OWDs y completar entrenamientos. Incorporar más preguntas sobre prevención de violencia en OWDs de ruta.', 28)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f86c5ad1-9e2f-4670-b413-2424e66c1b1c', id, 'Proyectar implementar botones antipánico en tesorería', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '44813e4d-7b99-452d-b169-48a09a718c0d', id, 'Implementar OWDs y completar entrenamientos. Incorporar más preguntas sobre prevención de violencia en OWDs de ruta', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ecf1b098-ba1c-4f0f-b9b9-b3dd4dfd70c2', 'H1 2026', 'Seguridad', 'PREVENCIÓN DE VIOLENCIA', '7.3', 'Toolkit Violence Prevention', false, 'N/A', 'Toolkit completo al 60% nivel 1 y 60% nivel 2. Seguir traccionando PDA.', 29)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd82eeaa7-d83e-489a-bdfb-7bd411469a11', id, 'Seguir traccionando PDA', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f22f218d-7c71-43bb-8207-73506b992621', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.1', 'Gestión de la calificacion de los conductores', false, '5', 'Buen seguimiento de licencias. Oportunidad: - Reforzar seguimiento de licencias de personal de T1 tercerizado fijo.', 30)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f6c76528-d697-4c56-b424-90460721aa19', id, 'Reforzar seguimiento de licencias de personal de T1 tercerizado fijo', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c987b874-ae98-4f23-8cb1-acbe8f7822b2', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.2', 'Gestión de rutas peligrosas', false, 'N/A', 'Se evidencia relevamiento en marcha de rutas de riesgo. Oportunidad: - Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en rutas de riesgo. - Implementar herramienta "MyMaps" o similar a fin de mejorar la visualización de riesgos en ruta y el acceso del personal a dicha información. - Registrar la totalidad de los PDA ante riesgos detectados en determinadas zonas (por ej: ventanas horarias, cambio de ruta, etc.).', 31)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '22908b4a-462a-40d2-9f1d-8a9f42a74d3d', id, 'Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en rutas de riesgo', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b7a28ae8-eb32-48f0-9e49-86fdf1510dce', id, 'Implementar herramienta "MyMaps" o similar a fin de mejorar la visualización de riesgos en ruta y el acceso del personal a dicha información', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '719db04e-83e8-4c44-84a3-e0d90bf14dfa', id, 'Registrar la totalidad de los PDA ante riesgos detectados en determinadas zonas (por ej: ventanas horarias, cambio de ruta, etc.)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('eb0af3f6-e9bc-44b4-99ce-82305ec5b253', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.3', 'Ejecución segura de la conducción', false, 'N/A', 'Entrevistas ok. Tuvieron dos eventos de accidentabilidad en distribución. Oportunidad: reforzar implementación de OWDs en ruta, reporte de comportamientos y relevamiento telemétrico.', 32)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '67cb7da1-6f00-4d2c-acb6-e3eba431b388', id, 'reforzar implementación de OWDs en ruta, reporte de comportamientos y relevamiento telemétrico', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('84d65c82-9e79-469d-806e-69fc85cd3f2d', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.4', 'Gestión de telemetría', true, 'N/A', 'Cuentan con sistema de telemetría "Localiza", el cual mide solamente el control de velocidad y la ubicación satelital. Oportunidades: - Reforzar relevamiento de frenadas y giros bruscos, aceleraciones, uso de cinturón de seguridad, etc. - Reforzar registro de acciones realizadas a partir del análisis obtenido del seguimiento de telemetría (charlas 1a1, capacitaciones, análisis de tendencias, etc.). - Monitorear uso de cinturón de seguridad mediante OWDs. - Mapear desvíos en ruta detectados durante la aplicación de OWDs y ejecutar PDA en función a dichos desvíos. - Afianzar sinergia entre Seguridad y pilares Entrega y flota en este respecto.', 33)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c075fea1-3872-4b28-bdc7-0521f33597f2', id, 'Reforzar relevamiento de frenadas y giros bruscos, aceleraciones, uso de cinturón de seguridad, etc', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '813ea78f-a182-4435-9264-3192c86a4647', id, 'Reforzar registro de acciones realizadas a partir del análisis obtenido del seguimiento de telemetría (charlas 1a1, capacitaciones, análisis de tendencias, etc.)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a1b7f745-c352-4399-bdd4-ead5c3205792', id, 'Monitorear uso de cinturón de seguridad mediante OWDs', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ad6afd1d-5cb3-4140-b424-5c52d912f51a', id, 'Mapear desvíos en ruta detectados durante la aplicación de OWDs y ejecutar PDA en función a dichos desvíos', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9e407eca-e24f-4ee9-8ca8-c140daf1f523', id, 'Afianzar sinergia entre Seguridad y pilares Entrega y flota en este respecto', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('90d3fc0c-08dc-4049-b8bc-ee2cff03b995', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.5', 'Gestión de la jornada Laboral', true, 'N/A', 'No se observan desvíos de jornada en T2. Oportunidad: reforzar relevamiento de jornada de T1.', 34)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e423ef3a-574d-4e23-b8d4-b0535d051de6', id, 'reforzar relevamiento de jornada de T1', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c279270e-a5e8-428f-ab5f-4c78266a769c', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.6', 'Gestión del control de pesos', true, 'N/A', 'Se realiza el control de cargas mediante los límites establecidos por WMS según la capacidad máxima de cada camión. Se evidencia seguimiento diario de cargas con comparativa de kg transportados y capacidad máxima. Oportunidad: - Adherirse al ruteo centralizado traccionado por CMQ a fin de garantizar la gestión completa del control de cargas y la optimización de entregas en ruta.', 35)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4158c50f-bcc3-4fd5-a183-f23232b9cfb8', id, 'Adherirse al ruteo centralizado traccionado por CMQ a fin de garantizar la gestión completa del control de cargas y la optimización de entregas en ruta', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a1a8c357-508b-4849-8aae-b07276b5c9b5', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.7', 'Gestión de la seguridad en los desplazamientos/ IN ITINERES', false, '5', 'Capacitación sobre accidentes in itínere realizada. No han tenido accidentes in itínere en el presente período. Entrevistas ok. Oportunidad: implementar gestión visual y entrega de flyers.', 36)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5e3d0594-d54d-4208-80d8-169330b4fed7', id, 'implementar gestión visual y entrega de flyers', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.7'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('41ccdc80-5b86-41ca-b904-503df375f06f', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.8', 'Toolkit seguridad vial', false, 'N/A', 'Se evidencia presentación mensual de Toolkit. Oportunidad: - Ajustar inconsistencias relacionadas a control de velocidad adaptativo (mide la distancia con respecto al vehículo que está en frente), airbags y sistema de electrónico de estabilidad, ya que no disponen de dichos elementos en la flota. - Documentar PDA.', 37)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2e3be0b0-ad64-4c2a-9598-647db969243b', id, 'Ajustar inconsistencias relacionadas a control de velocidad adaptativo (mide la distancia con respecto al vehículo que está en frente), airbags y sistema de electrónico de estabilidad, ya que no disponen de dichos elementos en la flota', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.8'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'da9702cf-51f2-40c0-980b-f56da4e87af7', id, 'Documentar PDA', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.8'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('38acba4c-3340-4e5d-9292-43494d7cf726', 'H1 2026', 'Seguridad', 'TRABAJO EN ALTURA', '9.1', 'Protección de Trabajos en Altura', false, '3', 'SOP completo. No se registran trabajos en altura durante el presente período. Oportunidad: - Incorporar un arnés de seguridad al stock de EPP. - Efectuar control del arnés de seguridad y documentarlo. - Gestionar acceso seguro al techo e incorporar línea de vida.', 38)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f5fe4e1c-429a-4c82-b2dc-cc17c061ab8d', id, 'Incorporar un arnés de seguridad al stock de EPP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1fb7ccbc-f873-4c53-9eb9-3900fc3e6582', id, 'Efectuar control del arnés de seguridad y documentarlo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '50c1adf2-917b-40d5-9c6c-a5fd45178d7c', id, 'Gestionar acceso seguro al techo e incorporar línea de vida', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e817f4ee-5bf5-41c8-a0dd-3345a26bd06c', 'H1 2026', 'Seguridad', 'TRABAJO EN ALTURA', '9.2', 'Ejecución Segura de Trabajos en Altura', false, '3', 'SOP completo. Capacitación de trabajo en altura realizada. Oportunidad: - Incorporar arnés de seguridad al stock de EPP. - Efectuar control del arnés de seguridad y documentarlo. - Implementar OWD de trabajo en altura en caso de que dicho trabajo lo realice personal interno (o permiso de trabajo para personal tercerizado). - Reforzar evidencia documental (programa de seguridad en caso de corresponder, habilitación y documentación de plataformas elevadoras, etc).', 39)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ec01121a-aa8d-4b33-8031-db1fc08baaff', id, 'Incorporar arnés de seguridad al stock de EPP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8a06ca33-a252-4537-a3cc-973de0193484', id, 'Efectuar control del arnés de seguridad y documentarlo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9c3f867e-d538-401f-a1c8-925c431c8ff7', id, 'Implementar OWD de trabajo en altura en caso de que dicho trabajo lo realice personal interno (o permiso de trabajo para personal tercerizado)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '00783e86-1102-4b7a-bbaa-e594ebc91ca7', id, 'Reforzar evidencia documental (programa de seguridad en caso de corresponder, habilitación y documentación de plataformas elevadoras, etc)', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ff27223d-33da-48ab-8c77-497c2c61771c', 'H1 2026', 'Seguridad', 'TRABAJO EN ALTURA', '9.3', 'Gestión de trabajos en techos', false, 'N/A', NULL, 40)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('7f9b70f6-ddf4-4bf9-8c73-53ae25470d8c', 'H1 2026', 'Seguridad', 'LOTO/SAM', '10.1', 'Ejecución segura de SAM', false, 'N/A', NULL, 41)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3d7d1ef3-6300-497e-ac61-113b37b15297', 'H1 2026', 'Seguridad', 'LOTO/SAM', '10.2', 'Ejecución segura de LOTO', false, '3', 'SOP LOTO completo. Capacitación sobre SAM/LOTO realizada. Permiso registrado por parte del contratista. Oportunidad: - Completar kit de bloqueo LOTO incorporando dispositivos de bloqueo de llaves térmicas.', 42)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b23ce19c-eb17-4ae2-9304-288c24233a50', id, 'Completar kit de bloqueo LOTO incorporando dispositivos de bloqueo de llaves térmicas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='10.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a8b61166-7504-4b15-b710-b353e1bcf30f', 'H1 2026', 'Seguridad', 'LOTO/SAM', '10.3', 'Gestión de equipos LOTO', false, '3', 'Kit de bloqueo y etiquetado disponible e inventariado. Oportunidad: incorporar dispositivos de bloqueo de llaves térmicas.', 43)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5c5c5519-4409-4425-b1aa-33143651fb5a', id, 'incorporar dispositivos de bloqueo de llaves térmicas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='10.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('99ce24c4-3fb9-4618-b424-571f2427694c', 'H1 2026', 'Seguridad', 'SALUD OCUPACIONAL', '11.1', 'Notificación, investigación y gestión de las causas de las enfermedades profesionales', true, '3', 'Cruzan con pilar Gente en seguimiento de ausentismo y documentan enfermedades profesionales. Oportunidad: llevar adelante campañas de vacunación, deporte, prevención de adicciones, calentamiento previo a la jornada, pausas activas, etc.', 44)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '10903718-6f59-4ff6-ad6b-c40ac6217175', id, 'llevar adelante campañas de vacunación, deporte, prevención de adicciones, calentamiento previo a la jornada, pausas activas, etc', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='11.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f7c95c91-f5ec-4ae2-bbf2-72631fe59aca', 'H1 2026', 'Seguridad', 'SALUD OCUPACIONAL', '11.2', 'Gestión de Mediciones Iluminación y Ruido', false, '5', 'Medición de ruido e iluminación completas, sin observaciones ni desvíos. Oportunidad: documentar conclusiones del estudio de iluminación, a pesar de obtener resultados conforme a la normativa.', 45)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '21ca8c4d-0990-49eb-b6f4-c5e144a6bab8', id, 'documentar conclusiones del estudio de iluminación, a pesar de obtener resultados conforme a la normativa', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='11.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('056aaec9-b58b-49ad-a2ef-d588f5e3d4fe', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.1', 'Dispositivos médicos y botiquín de primeros auxilios', false, '3', 'Se cumple con al menos 1 botiquin en deposito y todos los camiones tienen 1 botiquin. Relevamiento de extintores y botiquines ok. Oportunidad: - Precintar la totalidad de los botiquines con precintos numerados fáciles de romper. - Incorporar DEA.', 46)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f5a88df5-d5a9-4955-99ea-8c9a97f417d8', id, 'Precintar la totalidad de los botiquines con precintos numerados fáciles de romper', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c247cc8f-d15a-4b65-8580-cf7d49a20520', id, 'Incorporar DEA', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('66a4df8f-0db2-43d4-b605-a749e682ec58', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.2', 'Gestión del sistema de prevención y protección contra incendios', true, '3', 'Carga de fuego realizada. Extintores en buen estado de mantenimiento (se relevan mensualmente), cartelería de emergencia ok, vías de evacuación libres de obstáculos, sistema de alarma centralizada implementado. Números de emergencia gestionados a la vista. Cuentan con luces LED de emergencia. Oportunidad: - Remover material combustible sobre el que se apoya el tambor de diesel. Verificar posibilidad de reposicionar el sector de carga de diesel en el exterior. - Incluir en carga de fuego el detalle del poder calorífico del litio. - Incorporar extintor para litio en sector de carga de baterías (F500 o clase L). - Gestionar a la vista números de emergencia en garita de Seguridad.', 47)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '03b9cb9e-41ab-45d9-a601-ef4aaee8a6d4', id, 'Remover material combustible sobre el que se apoya el tambor de diesel. Verificar posibilidad de reposicionar el sector de carga de diesel en el exterior', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5d6ad2e1-5ed1-48df-bb14-fc5fd92b14ea', id, 'Incluir en carga de fuego el detalle del poder calorífico del litio', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '61f4ea90-2ef1-4c49-a904-0d9816900612', id, 'Incorporar extintor para litio en sector de carga de baterías (F500 o clase L)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'eeefd07d-736b-4105-98bb-27f05c043c26', id, 'Gestionar a la vista números de emergencia en garita de Seguridad', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('64d02086-aa27-4d48-8394-0027e2718441', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.3', 'Plan de Respuesta a Emergencias', false, '3', 'Plan de respuesta ante emergencia documentado. Oportunidad: - Incorporar hipótesis de emergencias y procedimiento de actuación ante situaciones de explosión y transmisión de enfermedades pandémicas.', 48)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b833a986-31d3-4950-b8a6-06b7b6b7dbc0', id, 'Incorporar hipótesis de emergencias y procedimiento de actuación ante situaciones de explosión y transmisión de enfermedades pandémicas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e64615a5-f30c-49bd-91e8-b9cb08216289', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.4', 'Gestión especializada de Respuesta a Emergencias', false, '5', 'Cuentan con brigada de emergencias. Gestionaron a la vista la identificación de los mismos con nombre y apellido, foto identificatoria y rol a cumplir. Se evidencia conocimiento del personal sobre quienes conforman la brigada.', 49)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5d1a723c-607f-4a38-aa8b-0853bd518e0f', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.5', 'Gestión de Simulacros de Respuesta a Emergencias', false, '3', 'Se evidencia simulacro realizado durante 28-04. Participación del 83% en logística. Informe de simulacro documentado con oportunidades de mejora detectadas. Oportunidades: - Avanzar en el cumplimiento de las oportunidades de mejora detectadas durante la realización del ejercicio. - Aspirar a alcanzar el 90% de participación por sector.', 50)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ac529919-905e-49a7-9095-194c6b2efb72', id, 'Avanzar en el cumplimiento de las oportunidades de mejora detectadas durante la realización del ejercicio', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b8e32b00-c914-4fd0-a21a-e0415edcd07b', id, 'Aspirar a alcanzar el 90% de participación por sector', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a2dfeea2-ef2a-4092-a0c9-b8a0051539e1', 'H1 2026', 'Seguridad', 'FORMACIÓN Y COMPETENCIA', '13.1', 'GESTION DE ENTRENAMIENTOS', false, '1', 'Se gestiona el PAC de manera centralizada desde el pilar de Gente. Oportunidad: - Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador. - Seguir reforzando el avance del calendarizado. - Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones.', 51)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '19fb930e-64c8-4c2b-9480-d60556a225f3', id, 'Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b5d01a78-3901-41cf-b54d-9936d1a54ff8', id, 'Seguir reforzando el avance del calendarizado', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '74b9d721-911c-4d0a-a41b-12bfce624f8d', id, 'Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('562cb341-9ee7-463d-af7f-1c7129b92be0', 'H1 2026', 'Seguridad', 'FORMACIÓN Y COMPETENCIA', '13.2', 'Gestión de Entrenamientos Calificados', true, '0', 'Oportunidad: - Reforzar registro de capacitaciones mandatorias para empleados calificados. - Medir porcentaje de asistencia de manera individualizada por capacitación especializada y aspirar a alcanzar el 100% en dicho indicador. - Seguir reforzando el avance del calendarizado. - Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones.', 52)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd1031827-1c2c-4b63-bc30-f2efa7465fdd', id, 'Reforzar registro de capacitaciones mandatorias para empleados calificados', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9b8ad03c-97b2-4629-8812-309c39068a97', id, 'Medir porcentaje de asistencia de manera individualizada por capacitación especializada y aspirar a alcanzar el 100% en dicho indicador', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4b73241e-a39d-4220-89e1-eb0abd734cd6', id, 'Seguir reforzando el avance del calendarizado', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b9397e15-2d28-4362-8812-72f0575fc794', id, 'Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8740918f-fb6d-4efe-a04a-3c565d132e57', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.1', 'Gestión de inventarios', true, '3', 'Control de inventario documentado mediante herramienta digital. Oportunidad: - Incorporar control de stock de EPP.', 53)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '83b658af-8762-4f85-b53c-ffddb295ee11', id, 'Incorporar control de stock de EPP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5397b766-803b-4571-9e7c-d1a703f4c4d5', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.2', 'Gestión de la evaluación de riesgos', true, '3', 'ER realizada. Entrevistas ok. Oportunidad: adaptar a formato estándar CMQ.', 54)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7805a4f6-7f92-403d-8d1f-d97602355e10', id, 'adaptar a formato estándar CMQ', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('480e5ee3-3ad0-4dcb-9c89-2c18ee639af8', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.3', 'Gestión de la evaluación del PDV', false, 'N/A', 'Se evidencia un relevamiento de PDVs en marcha (aprox. el 30% de los PDVs relevados). Oportunidad: - Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en PDVs. - Registrar la totalidad de los PDA ante riesgos detectados en determinados PDVs.', 55)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2047c855-3486-4675-bc05-e0fdafdc9ff5', id, 'Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en PDVs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f06913b1-d9ab-4a79-96b8-c3b7529fc919', id, 'Registrar la totalidad de los PDA ante riesgos detectados en determinados PDVs', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('84ffa193-59f9-4d04-835e-11868115af0a', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.4', 'Gestión de elementos de protección personal', false, '3', 'Se evidencia correcta gestión documental Res. 299. Matriz de EPP completa. Cuentan con guantes anticorte en depósito. Oportunidad: - Reforzar análisis de tendencias en cuanto a la falta de uso de EPP por sector (cruzar con gráfico de torta de comportamientos inseguros). - Seguir reforzando reporte de comportamientos inseguros y PDA ante falta de uso de EPP. - Incorporar máscara facial y mangas anticorte para la manipulación de litro.', 56)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'af234635-6f1d-4010-9119-31d813f8547e', id, 'Reforzar análisis de tendencias en cuanto a la falta de uso de EPP por sector (cruzar con gráfico de torta de comportamientos inseguros)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'eb91c34a-0f8c-416d-99f4-0cffaa019cb6', id, 'Seguir reforzando reporte de comportamientos inseguros y PDA ante falta de uso de EPP', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '581bc58e-913f-479e-a686-053ce08c8b26', id, 'Incorporar máscara facial y mangas anticorte para la manipulación de litro', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('93574eaa-2222-4271-b976-31efab10d088', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.5', 'Rutina de seguridad MCRS', false, '0', 'Implementar rutina semanal de seguridad con mandos medios. Abordar temáticas referidas en requerimiento 1. Llevar PDA mediante App DPO con trazabilidad de cumplimiento de dichas acciones con responsable, fecha de cumplimiento, status, etc.', 57)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '765d5949-eb83-4c74-ba2f-571517fe3745', id, 'Implementar rutina semanal de seguridad con mandos medios (MCRS), abordando las temáticas del requerimiento 1', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '46f3b069-a6da-4b41-bea7-2146069d3d82', id, 'Llevar PDA mediante App DPO con trazabilidad de cumplimiento (responsable, fecha, status)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6be04ee2-87c4-4cc0-b112-430780f91e15', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.1', 'Gestión de inducción de visitantes', true, '5', 'Implementan proceso de inducción a visitas y registro de las mismas. Cuentan con test de conocimiento a fin de validar la efectividad de la inducción.', 58)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f939c9cd-c43a-487a-9f3a-5b6ff228875d', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.2', 'Gestión de inducción de contratistas', false, '5', 'Implementan proceso de inducción de contratistas y registro documental. Implementan test de conocimiento a fin de validar la efectividad de la inducción. Solicitan clásula de no repetición contra Distribuidora Mercosur Región Pampeana en Seguros de vida obligatorios y ART (en caso de personal bajo relación de dependencia) y en Seguros de accidentes personales (en caso de personal monotributista).', 59)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('fc16f92b-3f00-48dd-bb9f-51aa4f1070cc', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.3', 'Gestión de grandes obras', false, '1', 'No han tenido trabajos que requieran la aprobación de un PS. Oportunidad: - Afianzar la comunicación entre gerencia y referente de Seguridad en lo relacionado a obras o tareas proyectadas a realizarse, a fin de gestionar la documentación con anterioridad a la realización de los trabajos. - Desarrollar SOP con la gestión de aprobación de Programas de Seguridad y para qué casos aplica (resoluciones 35, 51, 61, 503, 550, 319).', 60)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7167c549-67b2-4854-b423-fff81a8368a1', id, 'Afianzar la comunicación entre gerencia y referente de Seguridad en lo relacionado a obras o tareas proyectadas a realizarse, a fin de gestionar la documentación con anterioridad a la realización de los trabajos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='15.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5ebadb2d-027a-441a-bc5c-60a16ae654d1', id, 'Desarrollar SOP con la gestión de aprobación de Programas de Seguridad y para qué casos aplica (resoluciones 35, 51, 61, 503, 550, 319)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='15.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('efdcaf5b-cb05-4ee9-ac6a-5599f6b157c7', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.4', 'Gestión de permisos de trabajo', true, '5', 'Se evidencian permisos de trabajo firmados.', 61)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9723c8fd-007c-4602-ad13-8e692faa2dfb', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.1', 'Preguntas en la encuesta de Cultura de Seguridad', false, '3', 'Se evidencia participación en la encuesta de Cultura de Seguridad. Seguir traccionando PDA a fin de evidenciar mejoras en la presente dimensión.', 62)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2c6f2b6d-15bb-4f2b-b42d-77e19eb623cc', id, 'Seguir traccionando PDA a fin de evidenciar mejoras en la presente dimensión', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2bec9246-aa83-46c8-8d30-5132b1d9f2cc', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.2', 'Liderazgo en seguridad conductual', false, '3', 'Participaron de taller OLT y safe together. Oportunidad: cascadear material visto en taller al personal de Gerencia y mandos medios a fin de afianzar la implementación de la Seguridad como valor en todos los niveles de la distribuidora.', 63)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c4b440bd-5ebb-4a14-8e37-9cb7d7a4729b', id, 'cascadear material visto en taller al personal de Gerencia y mandos medios a fin de afianzar la implementación de la Seguridad como valor en todos los niveles de la distribuidora', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('82382c10-2852-42c5-a9c7-16e6116aa6d2', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.3', 'Campeones de seguridad', false, '3', 'Campeón de Seguridad designado para almacén. Oportunidad: - Seguir reforzando participación y colaboración de la operación en lo relativo a la seguridad (asistencia a capacitaciones, asistencia a comité de seguridad, revisión de checks, reporte de condiciones y comportamientos, monitoreos de seguridad, etc.). - Gestionar selección de campeón de Seguridad en el área de distribución.', 64)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '973ccf0e-04f7-48ce-ba3b-896c0cd25d76', id, 'Seguir reforzando participación y colaboración de la operación en lo relativo a la seguridad (asistencia a capacitaciones, asistencia a comité de seguridad, revisión de checks, reporte de condiciones y comportamientos, monitoreos de seguridad, etc.)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '21b42fee-361b-457e-acca-d7f238a9f358', id, 'Gestionar selección de campeón de Seguridad en el área de distribución', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('41e7c5e3-0283-4c3d-9b32-fe96f552c64d', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.4', 'Comité de Seguridad', false, '3', 'Se ejecuta la dinámica del comité de Seguridad de forma trimestral. Se registran los PDA en herramienta digital (App DPO). Incluyen personal operativo a la instancia. Oportunidad: reforzar cumplimiento de PDA, darle continuidad.', 65)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8e65a0d6-e62b-42c6-800e-c47cf9143474', id, 'reforzar cumplimiento de PDA, darle continuidad', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b63ce9cf-c9ce-4999-861a-cd2b76cc13bd', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.5', 'Semana Mundial de la Seguridad', false, '5', 'Se evidencia adherencia a campañas HSMA.', 66)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b18d7065-800b-4848-8f06-470a77da492d', 'H1 2026', 'Gente', 'CULTURA', '1.1', 'El distribuidor cuenta con Principios desarrollados? ¿Los Principios de Cultura del DISTRIBUIDOR son incorporados y comprendidos?', false, '3', 'Desarrollaron principios de cultura y cascadearon al personal mediante capacitación. Comenzaron a vincular los PIs/KPIs o tareas diarias con los distintos principios. Implementaron cartelera con espacio en blanco para bajar a tierra los conceptos a la operación. Oportunidades: - Seguir reforzando el conocimiento de la operación sobre principios de cultura. - Seguir potenciando el rol de embajador de cultura.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '273fec55-5e82-4673-b9c6-87502d436756', id, 'Seguir reforzando el conocimiento de la operación sobre principios de cultura', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '03b418f4-20a6-46b9-b251-56be6abb9afb', id, 'Seguir potenciando el rol de embajador de cultura', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('59274868-69a7-49b0-9002-6495c8ab8b52', 'H1 2026', 'Gente', 'RECLUTAMIENTO Y SELECCIÓN', '2.1', '¿Qué tan efectivo es el DISTRIBUIDOR para atraer talento?', false, '5', 'SOP de reclutamiento y selección desarrollado. Completaron capacitación de sesgos inconscientes. Perfiles de puestos desarrollados (incluyen EPPs por puesto y detalle de KPIs/PIs). Documentan seguimiento de las contrataciones, incluyendo detalle sobre: puesto a cubrir, fecha de apertura de vacante, fuente de búsqueda, fecha de cierre de vacante, días transcurridos, etc. Implementan seguimiento documental de CVs. Plan de demanda/presupuesto de dotación desarrollado y cruzado con simulador de dimensionamiento. Actividades de marca empleadora ok.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('45648544-b95c-449a-85bb-b9c1d9355348', 'H1 2026', 'Gente', 'RECOMPENSAS Y RECONOCIMIENTO', '3.1', '¿Qué tan efectiva es la Estrategia de Recompensas y Reconocimientos del DISTRIBUIDOR ?', false, '3', 'Esquema de reconocimientos por cumplimiento de objetivos implementado mensualmente. Cuentan con un pack de beneficios disponible. Política salarial establecida. Objetivos/targets definidos para mandos medios, con seguimiento del avance mensual y PDA ante desvíos del target. Entrevistas ok. Oportunidad: - Documentar seguimiento mensual de la evolución de los indicadores en función a la implementación de 3R, a fin de evidenciar el repago obtenido a partir de su mejora. - Rotar indicadores seleccionados para la dinámica a fin de ir puntualizando sobre aquellos que se deban potenciar (indicadores críticos).', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bcdc0fc4-324d-4c0c-8317-893cc4708bdb', id, 'Documentar seguimiento mensual de la evolución de los indicadores en función a la implementación de 3R, a fin de evidenciar el repago obtenido a partir de su mejora', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8ba9a3e6-09b0-47fe-ac5e-115533858bfa', id, 'Rotar indicadores seleccionados para la dinámica a fin de ir puntualizando sobre aquellos que se deban potenciar (indicadores críticos)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f4c40d13-f988-43ee-9819-4f6b2514252f', 'H1 2026', 'Gente', 'ESTRATEGIA DEL PAC', '4.1', '¿La Estrategia de Aprendizaje está conectada con la Estrategia de Negocio y activa una Cultura Activa de Aprendizaje?', true, '1', 'El PAC 2026 se encuentra calendarizado. Listado de capacitaciones disponible. Oportunidad: - Reforzar seguimiento del avance del calendarizado de capacitaciones (adherencia al gantt), aspirar a alcanzar el 90% de cumplimiento a final del año. - Incluir relevamiento del porcentaje de avance del calendarizado YTD al seguimiento del PAC. - Disponibilizar recursos y tecnología para el dictado de capacitaciones y acceso del personal al material de dichas capacitaciones.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '35b2ad33-80d6-4b0e-b559-5c80b2315ace', id, 'Reforzar seguimiento del avance del calendarizado de capacitaciones (adherencia al gantt), aspirar a alcanzar el 90% de cumplimiento a final del año', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '36cfb373-1ac0-4e5f-966d-0a88b3b02ed5', id, 'Incluir relevamiento del porcentaje de avance del calendarizado YTD al seguimiento del PAC', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '82bd1835-c252-4db7-8810-588e3ae31f22', id, 'Disponibilizar recursos y tecnología para el dictado de capacitaciones y acceso del personal al material de dichas capacitaciones', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4e61eacf-93a9-4942-a120-44525bdd105b', 'H1 2026', 'Gente', 'SEGUIMIENTO DE LA ASISTENCIA A LAS CAPACITACIONES', '4.2', '¿Existe un seguimiento de asistencia efectivo y acciones antes desvios para asegurar la mejora contínua en la competencia de los colaboradores?', true, '1', 'Se evidencia seguimiento consolidado de la asistencia a capacitaciones. Implementan test de conocimiento. Oportunidad: - Documentar todos los test de validación conceptual e individualizar los resultados, a fin de recapacitar al personal que desapruebe los mismos. - Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador. - Estandarizar gestión de capacitaciones, a fin de consolidar la información del dictado de cada capacitación y garantizar un seguimiento por pilar de su desarrollo.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '67a88b6c-9540-4f59-8fb0-df076aacca37', id, 'Documentar todos los test de validación conceptual e individualizar los resultados, a fin de recapacitar al personal que desapruebe los mismos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '11f232b6-cec3-4830-8191-6f7511aef1a5', id, 'Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '743267fe-9587-41bb-b1c5-cc4684019ac3', id, 'Estandarizar gestión de capacitaciones, a fin de consolidar la información del dictado de cada capacitación y garantizar un seguimiento por pilar de su desarrollo', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('7f825986-348d-45fc-b59c-2cc7a18400e8', 'H1 2026', 'Gente', 'INDUCCIONES', '4.3', '¿Se completó el proceso de inducción tanto para los nuevos miembros como para los que cambiaron de PUESTO DE trabajo para que se integren en la cultura de ABI y entreguen resultados rápidamente?', true, '3', 'SOP de inducciones desarrollado. No tuvieron ingresos en el presente período. Incluyen principios de cultura dentro del onboarding. Dentro de la inducción funcional se repasa la DP y se mapean los indicadores relacionados a su puesto. Oportunidades: - Implementar dinámica de padrinos/buddies en potenciales próximos ingresos. - Implementar feedback entre padrino y ahijado (durante la primera semana y al finalizar el proceso). - Apuntar a alcanzar el nivel 4 de SKAP en potenciales padrinos.', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b08b4b94-2039-4595-af11-b7396ac47782', id, 'Implementar dinámica de padrinos/buddies en potenciales próximos ingresos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '41c61668-76d9-4310-91f0-8eaf6c65e0cc', id, 'Implementar feedback entre padrino y ahijado (durante la primera semana y al finalizar el proceso)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3a20ca0e-097a-4839-bb71-39fff3419185', id, 'Apuntar a alcanzar el nivel 4 de SKAP en potenciales padrinos', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('250e2fe7-02a3-4ad5-807b-df9ac7c558ca', 'H1 2026', 'Gente', 'SKAP', '4.4', '¿Qué tan bien se utiliza el Proceso de adquisición de habilidades (SKAP) para mejorar a nuestros equipos e impulsar la autonomía y los resultados?', true, '3', 'Implementaron matríz de habilidades para la totalidad de la operación. Se registran PDA ante oportunidades de mejora detectadas en SKAP, incluyendo: detalle, responsable, fecha de cumplimiento y status. Entrevistas ok. Oportunidades: - Se sugiere hacer uso de herramientas digitales a fin de que cada operario pueda acceder a visualizar su status de avance en SKAP (mediante herramienta Linktree, chatbot o similar). - Evidenciar cruce de información con resultados obtenidos en matriz SKAP. - Evidenciar avance en el cumplimiento de los PDA.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '265e6e44-1bf9-4c14-918d-398f95fae56f', id, 'Se sugiere hacer uso de herramientas digitales a fin de que cada operario pueda acceder a visualizar su status de avance en SKAP (mediante herramienta Linktree, chatbot o similar)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ca6bb554-ee26-41eb-b1ee-122125aba57a', id, 'Evidenciar cruce de información con resultados obtenidos en matriz SKAP', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ae1bf9b6-26aa-4ed3-b92c-32dd268a6616', id, 'Evidenciar avance en el cumplimiento de los PDA', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('28b67f90-d2a8-4dff-acbc-ec902904370b', 'H1 2026', 'Gente', 'KPI AUSENTISMO', '5.1', '¿El Distribuidor tiene una gestión del ausentismo?', true, '3', 'Se excluyen las licencias prolongadas o planificadas. Se evidencia comparativa vs AA. No contemplan en ausentismo las licencias por ART que ya se estén mapeando dentro del indicador TRI. Oportunidad: - Corregir discrepancias detectadas entre el seguimiento interno y el reporte en planilla de GKPIs del drive (mes de abril). - Reforzar relevamiento de jornada del personal de T1.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '12751873-0b51-49c4-8047-d533c789fdac', id, 'Corregir discrepancias detectadas entre el seguimiento interno y el reporte en planilla de GKPIs del drive (mes de abril)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '30f1ac29-4511-49a3-a93d-c5e416ca91b0', id, 'Reforzar relevamiento de jornada del personal de T1', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d6e48635-c35e-418a-aae2-72759706c5d7', 'H1 2026', 'Gente', 'ENGAGEMENT', '5.2', '¿Es el Ambiente de Trabajo Seguro e Inclusivo?', true, '3', 'Adheridos a instancias People. 100% logística y 98% total empresa obtenido en última encuesta. Entrevistas ok. Oportunidad: - Reforzar abordaje sobre Seguridad Psicológica (avanzar en cuanto a cursos incluidos en app Humand, capacitaciones internas y reforzar comunicación de los equipos y el rol de los líderes). - Avanzar en el cumplimiento de los PDA derivados de la última encuesta.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b2352b1d-1002-4c3d-b27a-456f33144549', id, 'Reforzar abordaje sobre Seguridad Psicológica (avanzar en cuanto a cursos incluidos en app Humand, capacitaciones internas y reforzar comunicación de los equipos y el rol de los líderes)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e41a6f0a-a368-444d-992c-1ad99ae72ffd', id, 'Avanzar en el cumplimiento de los PDA derivados de la última encuesta', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('06afcccb-f81e-43a1-b3d2-5f0e907c6a6f', 'H1 2026', 'Gente', 'PLAN DE COMUNICACIÓN', '5.3', '¿Qué tan efectivo es el Plan de Comunicación del distribuidor?', false, '3', 'Cuentan con cronograma de comunicaciones documentado. Oportunidad: - Seguir reforzando gestión visual. - Reforzar la participación del personal en cuanto a actualizaciones del plan de comunicación generando instancias de feedback. Potenciar el "Por qué" de cada evento. - Potenciar uso de la herramienta Humand.', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4863bc0f-0ed7-4aa4-9dda-bcaa19d964a1', id, 'Seguir reforzando gestión visual', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4a0e41a9-a14d-4a89-82c8-1d6cd4cf0f47', id, 'Reforzar la participación del personal en cuanto a actualizaciones del plan de comunicación generando instancias de feedback. Potenciar el "Por qué" de cada evento', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e798b04b-53b5-4a1c-b2f8-5bf1202fb270', id, 'Potenciar uso de la herramienta Humand', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('753bba4b-5e50-4758-9f68-30a0cb53dcf9', 'H1 2026', 'Gente', 'ENTORNO LABORAL', '5.4', '¿Qué tan bien está empoderando el DISTRIBUIDOR a sus equipos para garantizar que tengan las condiciones adecuadas para hacer su trabajo?', false, '1', 'Se observan condiciones adecuadas en las instalaciones. Cuentan con herramienta de relevamiento y reporte de cuestiones relacionadas a servicios generales a fin de monitorear el avance periódicamente y realizar ajustes previos a las instancias de encuestas (escucha activa). Oportunidad: - Potenciar uso de herramienta de reporte de SSGG. - Lograr consolidar una operación capacitada para abordar los problemas de SSGG de forma autónoma (arreglo de cuestiones simples referidas a SSGG).', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4d71e190-d4e7-4a6a-86d7-908dfd46d074', id, 'Potenciar uso de herramienta de reporte de SSGG', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f85d7890-de83-4a69-a6ee-1965c13ad28a', id, 'Lograr consolidar una operación capacitada para abordar los problemas de SSGG de forma autónoma (arreglo de cuestiones simples referidas a SSGG)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d84ee17e-dbb5-45a2-8233-41332bb2a149', 'H1 2026', 'Gente', 'NEGOCIACION SINDICAL', '5.5', '¿Qué tan efectivo es el DISTRIBUIDOR al asociarse con Relaciones Laborales (sindicatos) para impulsar la autonomía?', false, '5', 'SOP documentado. Documentan PDA derivados de negociaciones sindicales. Seguir trabajando en forjar relaciones positivas con sindicatos a fin de apalancar los procesos.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9a9948b5-ccba-4784-bf20-32f483ce03e9', 'H1 2026', 'Gente', 'TALENTO Y CRECIMIENTO', '6.1', '¿Están mejorando los procesos y se ve reflejado en el ambiente laboral?', false, '3', 'Adheridos a instancias People en cuanto a evaluaciones de desempeño. Proceso de OPR desarrollado, dar curso al feedback. Oportunidades: - Realizar seguimiento de trayectoria del personal con posibilidades de ascenso. - Formalizar plan de carrera/mapeo de reemplazos. - Registrar seguimiento y monitoreo mensual o bimestral de los PDA derivados de las evaluaciones de desempeño. - Garantizar que los PDA desarrollados sean medibles. - Reforzar avance de PDA cargados en Humand. - Evidenciar cruce de información con resultados obtenidos en matriz SKAP.', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bc036dcf-5931-4f92-9ce3-411acd519162', id, 'Realizar seguimiento de trayectoria del personal con posibilidades de ascenso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ffd4fa4c-1379-4f48-a739-cee4b6f4e38a', id, 'Formalizar plan de carrera/mapeo de reemplazos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '61613aa1-fbba-47e8-8b05-30e18d08df71', id, 'Registrar seguimiento y monitoreo mensual o bimestral de los PDA derivados de las evaluaciones de desempeño', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'efbca8de-a868-4b1d-8b7d-c5c9f8d00688', id, 'Garantizar que los PDA desarrollados sean medibles', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '313a44d6-0057-425b-9ff4-227683e9da54', id, 'Reforzar avance de PDA cargados en Humand', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5a2febe1-06cc-4393-951c-223d25b93202', id, 'Evidenciar cruce de información con resultados obtenidos en matriz SKAP', 6 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('dc479f9e-9fae-4853-9273-03a22336bd58', 'H1 2026', 'Gente', 'KPI TURNOVER', '6.2', '¿El Distribuidor tiene una gestión del Turnover?', false, '3', 'Realizan seguimiento del indicador. No consideran re-estructuración ni finalización de contrato dentro de la medición del indicador. Implementan entrevistas de salida por medio de Humand y registran PDA. Oportunidades: - Documentar entrevistas de permanencia e implementar PDA ante potenciales causales de salida detectadas en dicha instancia. - Avanzar en el cumplimiento de los PDA derivados de las entrevistas de salida. - Ajustar Headcount que figura en reporte de SKPIs (36 GKPIs vs 35 seguimiento interno).', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e47122a0-8cfd-4361-9590-6ec66a04ec07', id, 'Documentar entrevistas de permanencia e implementar PDA ante potenciales causales de salida detectadas en dicha instancia', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'dae72147-ff3b-48aa-a18b-d81d5acb8f97', id, 'Avanzar en el cumplimiento de los PDA derivados de las entrevistas de salida', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '574a6188-8097-408f-8d66-2a849cf46a39', id, 'Ajustar Headcount que figura en reporte de SKPIs (36 GKPIs vs 35 seguimiento interno)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f817c603-27df-4be3-bf5f-b4dafa64a1e5', 'H1 2026', 'Gente', 'EQUIPOS AUTÓNOMOS', '7.1', '¿Qué tan efectivo es el distribuidor para empoderar a los equipos autónomos?', false, '1', 'Se evidencia buena participación de la operación en las rutinas. Se encuentran en fase 3. Entrevistas ok. Oportunidad: - Concluir PDA y fases del cuadro de autonomía segregado por área. - Seguir potenciando autonomía de equipos. - Potenciar la implementación de herramientas como 3R y SKAP a fin de seguir afianzando el perfil del personal. - Reforzar cultura de Seguridad, aumentando el reporte de CS/CS desde la operación.', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0d0cac8e-e536-4a93-bf5d-7dd24e55ffe1', id, 'Concluir PDA y fases del cuadro de autonomía segregado por área', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0fc1cb8a-27e9-4a5d-a759-17a372797573', id, 'Seguir potenciando autonomía de equipos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '05a5b638-cf7d-4473-9c1d-2b84d8170fad', id, 'Potenciar la implementación de herramientas como 3R y SKAP a fin de seguir afianzando el perfil del personal', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0e53a80b-b378-4f69-b7ab-a25e841d3079', id, 'Reforzar cultura de Seguridad, aumentando el reporte de CS/CS desde la operación', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9a7059ab-ac0e-4d64-9437-7335b1e52057', 'H1 2026', 'Gente', 'COMITÉ DE GENTE LOGISTICO', '7.2', '¿El Comité de Gente Logistico se asegura de que las personas trabajen juntas para permitir y capacitar a los equipos para impulsar los resultados?', true, '3', 'Desde junio-26 implementan rutina de Comité de Gente Logístico según formato estándar cargado en CAMPUS y llevan PDA mediante herramienta digital. Oportunidades: - Dar continuidad a la dinámica. - Profundizar seguimiento del farol de indicadores de los distintos pilares. - Tratar avances sobre evaluaciones de desempeño en dicha instancia. - Llevar PDA mediante herramienta digital (App DPO) e incluir fecha límite de cumplimiento de dichas acciones, visibilizando el semáforo con el status de cumplimiento.', 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6af92666-21c1-46cf-993c-3873a63d7f8f', id, 'Dar continuidad a la dinámica', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '522e4e82-ca93-4f98-92ce-ac0102ec531d', id, 'Profundizar seguimiento del farol de indicadores de los distintos pilares', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1eedb262-8189-40af-bbf1-cf2c3901af9b', id, 'Tratar avances sobre evaluaciones de desempeño en dicha instancia', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2273dbcf-dff4-4d87-a220-fc94ca325e95', id, 'Llevar PDA mediante herramienta digital (App DPO) e incluir fecha límite de cumplimiento de dichas acciones, visibilizando el semáforo con el status de cumplimiento', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('94b58b90-1944-422b-aac6-b7b873d5a71c', 'H1 2026', 'Gestión', 'STRATEGY', '1.1', 'Compliance', true, '5', 'Ok, cuentan con línea ética vigente y los empleados están al tanto de ella.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a90c1138-7f37-4a45-bc2e-acbf116e0cbc', 'H1 2026', 'Gestión', 'STRATEGY', '1.2', 'Definición del sueño', false, '3', 'Tener como Pis críticos aquellos que los operarios pueden cambiar para mejorar el KPI central. Oportunidad: aperturar KPI de seguridad tanto como almacén como para distribución. Entrega: revisar cascadeo hasta ultimo nivel de operación. Reforzar conocimiento de la operación sobre KPIs criticos y como sus actividades diarias influyen en los objetivos del distribuidor a nivel estrategico.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4484853a-468b-4394-8e2a-8da3eaae6043', id, 'aperturar KPI de seguridad tanto como almacén como para distribución', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f4e75357-2e4e-470f-8bb3-dc1d0447287d', id, 'Entrega: revisar cascadeo hasta ultimo nivel de operación', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9a10aac1-dade-4588-a1b1-daceece89def', id, 'Reforzar conocimiento de la operación sobre KPIs criticos y como sus actividades diarias influyen en los objetivos del distribuidor a nivel estrategico', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4b7eeebd-ec4a-4360-8ed1-ca1a0dc60a95', 'H1 2026', 'Gestión', 'STRATEGY', '1.3', 'Definición de objetivos estratégicos', false, '3', NULL, 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f23bf41d-f194-462e-b9fe-33719e0faf30', 'H1 2026', 'Gestión', 'BUSINESS AND PROCESSES MAPPING', '2.1', 'Descripción de negocio', false, '5', 'Ok, bien desarrollado la descripción de negocio obteniendo KPIs críticos en base a la matriz de criticidad.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e489a395-0f3e-457a-9e54-e4d2247d9d0b', 'H1 2026', 'Gestión', 'BUSINESS AND PROCESSES MAPPING', '2.2', 'Mapeo de procesos', false, '3', 'Continuar trabajando en el mapa de procesos, desarrollando todas las tareas de las actividad crítica e identificar la tarea crítica.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '061e5539-4835-4bf9-b0ca-a51c5a933aa5', id, 'Continuar trabajando en el mapa de procesos, desarrollando todas las tareas de las actividad crítica e identificar la tarea crítica', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6017208d-d8bc-412d-afe6-7ec8c3fe24e5', 'H1 2026', 'Gestión', 'BUSINESS AND PROCESSES MAPPING', '2.3', 'Indicadores de productos y procesos', true, '0', 'Desarrollar arból de KPIs', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '787c40fb-b7f3-48f0-985c-8345975c499f', id, 'Desarrollar arból de KPIs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c71a1d16-9cdb-400a-ba3c-aed0ed0d6d83', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.1', '5S (Standarize)', true, '3', 'Continuar trabajando con la implementación de 5S en las distintas áreas del almacén.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'eee149e6-d168-44ab-a0b0-c90ea14b9a61', id, 'Continuar trabajando con la implementación de 5S en las distintas áreas del almacén', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3d8ef9ff-d5d1-4fb4-a7fa-d7ee6f196026', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.2', 'Estandarización & Entrenamientos (Standarize)', false, '3', 'Seguir con el proceso de estandarización y entrenamientos. Bien desarrollados los SOPs.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e75fea41-3336-4650-a482-92169a69d54a', id, 'Seguir con el proceso de estandarización y entrenamientos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6c48e147-f324-47fa-89fc-cffa52d46a8a', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.3', 'Diagnóstico de Trabajo Operativo (OWD/DTO) (DO)', false, '3', 'Continuar implementando OWDs para los distintos procesos y los distintos operarios. Definir acciones correctivas en caso de incumplimiento.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd61338cc-9d0d-4c0b-bb0e-3c147c7e1afa', id, 'Continuar implementando OWDs para los distintos procesos y los distintos operarios', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '15fa1275-8e48-4f7e-b156-438171f7ddfc', id, 'Definir acciones correctivas en caso de incumplimiento', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('48d1b639-2a8f-47ee-9b14-a028883bdc9b', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.4', 'Sistema de Gestión de Control y Reporte (MCRS) (Check)', true, '3', NULL, 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d1eed70e-ff89-41bd-acd0-e6a8adec128f', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.5', 'Workstations / Estación de trabajo (Check)', true, '1', 'Hacer foco en las estaciones de reempaque y PRI. Oportunidad: añadir una bacha en caso de ser posible en el área de reempaque Entrega: sumar SOPs a la workstation', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7cb3d6f6-b1d9-4d14-84d1-b3f34508f248', id, 'Añadir una bacha, en caso de ser posible, en el área de reempaque', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5b0f0727-7740-478d-86a5-54da723417b7', id, 'Sumar SOPs a la workstation', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('38e9281a-2516-47d8-b0c7-13af38c29ca5', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.6', 'Team Room (Check)', true, '3', 'Hacer foco en como impactan las tareas de los operarios en los PIs.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '84560675-cec1-4aab-8a85-0c2a5d341bc9', id, 'Hacer foco en como impactan las tareas de los operarios en los PIs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4bf5d9c2-6642-4baf-937e-cc999b525b02', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.7', 'Tratamiento de Anomalía', false, '1', 'Sumar valores gatillo para indicadores criticos. Oportunidad de que miembros del equipo ejecuten resoluciones de forma autonoma', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8cfeca02-7304-4d1e-8bbc-98e9291a7cb0', id, 'Sumar valores gatillo para indicadores criticos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.7'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c1f183c0-c86d-45d0-b89d-32a8bab7f612', id, 'Oportunidad de que miembros del equipo ejecuten resoluciones de forma autonoma', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.7'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('49414f54-79d1-44a8-aca3-345b386b74b4', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.1', 'Monitoreo de Targets (Do)', false, '1', 'Planificar performance targets', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '71ac4d7b-62ec-4b06-abd4-973b962041a2', id, 'Planificar performance targets', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('25707719-d7d4-4604-ab24-728a792ae1aa', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.2', 'Gestión de Proyectos (Do)', false, '3', 'Seguir relacionando os objetivos estratégicos a sus proyectos. Oportunidad: participación de miembros del equipo en proyectos.', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '75e8f34d-48c1-44e0-b095-5f27488725da', id, 'participación de miembros del equipo en proyectos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e33a72b1-0035-49df-b714-bcefed28cd5d', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.3', 'PDCA (Do)', false, '0', NULL, 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fa9496e7-b454-43c0-b8ec-94c7e63f0f4e', id, 'Implementar metodología PDCA (nota 0 en auditoría, sin comentario del auditor)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a98bd87c-fc1d-4ca6-a8a1-2d4ed4a26a73', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.4', 'Buenas Prácticas (Act)', false, '3', 'Continuar con el programa de buenas prácticas, con enfoque en mejora de KPI o PI relacionado.', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f8aba477-61fd-4ecb-b5c2-2952736f4f66', id, 'Continuar con el programa de buenas prácticas, con enfoque en mejora de KPI o PI relacionado', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('54d4eef5-18c2-41e4-94e6-5db385b2d931', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.5', 'GOPs (Act)', false, '3', 'Trabajar adherencia al GOP.', 18)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'beb1db0e-923b-4f2b-8449-18738f385fc8', id, 'Trabajar adherencia al GOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a11f6dd7-c4a7-4e81-b90e-dccea23dea73', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.1', 'PRE RUTA', false, '3', 'SOP: realizar correcciones sobre RACI. Corregir desarrollo para explicar bien el proceso. Sumar diagrama de flujo. Hay matinal todos los dias. OWDs ok. Actualizar cambio de cloudfleet a herramienta propia. TML estan dentro de la meta. Hay registro por chofer x dia en herramienta. Objetivo del estandar es 30min. Ver la posibilidad de comenzar a tomar inicio de TML con registro de asistencia a la matinal.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8edfe766-3431-447f-a263-906d1c555a5b', id, 'SOP: realizar correcciones sobre RACI', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd573f248-df37-487b-8e7f-60cbc55f718c', id, 'Corregir desarrollo para explicar bien el proceso', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ea33192d-8600-44ab-aa25-a6f70dec16bc', id, 'Sumar diagrama de flujo', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '160ff4a2-6208-44cd-be76-063e09283293', id, 'Actualizar cambio de cloudfleet a herramienta propia', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3f043bd8-7299-4483-acf1-a01b80ea1755', id, 'Ver la posibilidad de comenzar a tomar inicio de TML con registro de asistencia a la matinal', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('cac6d341-3634-4534-99b5-243640b4a940', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.2', 'EN RUTA', false, '3', 'SOP: Corregir RACI. Sumar diagrama de flujo. OWDs ok. Poseen seguimiento de las rutas con herramienta propia. Siguen adherencia a la secuencia y clickeo en las matinales. Hoy en dia hay objetivo 8 hs. Oportunidad de comenzar a medir desvio sobre tiempo planificado para la ruta asignada y generar PDAs sobre eso. Excelente analisis por PDV.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd0b62e43-b4a1-42a2-a282-a5076ff178e3', id, 'Corregir RACI', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '36c4bfef-b83c-4b72-aa2c-4b8db9a4acd0', id, 'Sumar diagrama de flujo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '16bc1402-f3f1-4938-acfd-89586d23c13a', id, 'Oportunidad de comenzar a medir desvio sobre tiempo planificado para la ruta asignada y generar PDAs sobre eso', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('cb90ae93-4161-4e8c-a3e3-3ec1e81b553e', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.3', 'POST RUTA', false, '3', 'SOP: Corregir RACI. Sumar diagrama de flujo. Dejar solamente tareas del estandar diario del post ruta.Oportunidad de comenzar el TI con geolocalizacion. Mejorar desvios sobre TI.', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e1ccea9c-b017-4fed-a187-cefca2fe80f9', id, 'SOP: corregir RACI', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5d673f1e-ccc1-4f5e-9192-269f3c7acf8f', id, 'SOP: sumar diagrama de flujo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9500cdc1-886a-493f-bca9-16a1ea6e4c45', id, 'SOP: dejar solamente tareas del estándar diario del post ruta', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6475fb1c-d6a0-4384-b7d2-105a5e74b7e8', id, 'Comenzar el TI con geolocalización', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cb6180ef-7d4e-4b16-9826-4d68e59527ad', id, 'Mejorar desvíos sobre TI', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d8efbb9c-1322-444c-aaaa-913b1e39c2a5', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.4', 'CALIDAD DE ENTREGA DE LOS PRODUCTOS', false, '3', 'Tienen para reportar las roturas en la workstation.Seguimiento de rotura por SKU, por camion. DQI mal medido. No toman reempaque.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '05314b3c-de5b-4689-a163-001ebe38a3ed', id, 'Corregir medición de DQI: hoy está mal medido, no toman el reempaque', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bdf2cb9e-f2c1-4d0b-98ea-ceee5cab1ea7', 'H1 2026', 'Entrega', 'EQUIPOS EMPORDERADOS', '2.1', 'VISIBILIDAD DE RESULTADOS', false, '5', 'Poseen visibilidad de resultados en la herramienta. Objetivos y valores reales de los indcadores (Rechazo,, roturas y demas indicadores), compensacion variable (hs extra y bultos entregados). Es individual.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b9608253-587f-4fe7-8149-21415efca95a', 'H1 2026', 'Entrega', 'EQUIPOS EMPORDERADOS', '2.2', 'PROCESO DE FEEDBACK', false, '5', NULL, 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('db827919-1bb3-4212-8533-56318d868714', 'H1 2026', 'Entrega', 'EFICIENCIA DE PROCESOS', '3.1', 'IMPACTOS FINANCIEROS Y DE PRODUCTIVIDAD', false, '3', 'Realizan presupuesto, el mismo debe ser aprobado por gerencia. Luego se va midiendo el desvio de los gastos por sobre lo presupuestado. Hay seguimiento dde los motivos de los desvios.Seguir trabajando en seguimiento de costos para reducir los desvios. TLP: 31.07 OB: 73', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ed7a7056-13c2-4b67-8833-f89863ea6807', id, 'Seguir trabajando en seguimiento de costos para reducir los desvíos (TLP 31.07, objetivo 73)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6d5c3c86-bc74-4f85-8127-a62716b23bb5', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.1', 'CALIDAD DEL SERVICIO AL CLIENTE', false, '1', 'RMD: 4.99. Buen seguimiento del indicador. Seguimiento de detractores, con PDAs. Hay seguimiento de clientes ¨recuperados¨. Sumar tasa de respuesta. Definir SLA para cierre de casos detractores. Realizar SOP.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ef4a9a13-8a3b-46e8-894f-839b23e7f6f8', id, 'Sumar tasa de respuesta', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a33f6bea-c065-408e-bd75-23711a3a2249', id, 'Definir SLA para cierre de casos detractores', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a95ee08e-9ea0-4290-addb-6a29b64d8b3c', id, 'Realizar SOP', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4b66c637-2844-478d-96e7-69eefcfa8def', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.2', 'COMUNICACIÓN AL CLIENTE', false, '1', NULL, 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c109edce-adaf-4491-b35c-1c041c6aa3cc', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.3', 'ENTREGAS INFULL', false, '5', 'SOP rechazo y modulaciones ok. OWDs ok. Ofrecen distintos metodos de pago. Excelente seguimiento del rechazo. Por chofer, motivo, SKU, top clientes. Excelente gestion.', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2a922d45-62c3-4f34-8b85-704f984d0db9', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.4', 'ENTREGAS ON TIME', false, '1', 'No hay ruteo centralizado. Tienen reunion semanal con su ruteador.Hay rutina para relevamiento de VH (91,2%). Hay detalle de avances por promotor. Oportunidad de comenzar a medir adherencia a VH. On time fuera de la meta (98,64 % obj 99%).', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '77a7393d-8108-423e-bec7-397c835c8b6e', id, 'Comenzar a medir adherencia a ventanas horarias (VH)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '59829790-87c8-43b5-af7c-52768e2ea166', id, 'Mejorar On Time: 98,64% actual vs objetivo 99%', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8efff4f3-b45f-4a88-99d8-ae4339336414', 'H1 2026', 'Entrega', 'MEJORAS DE ENTREGA', '5.1', 'NPS DE ENTREGA', false, '3', 'NPS: 83,2. 11 detractores de entrega. Buen analisis de detractores. Reforzar seguimiento y planes de accion para con los mismos.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '61943203-702f-4afa-a1ee-7164c40348b3', id, 'Reforzar seguimiento y planes de acción sobre los detractores (NPS 83,2 — 11 detractores de entrega)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2876178b-9f4b-4a25-ace5-2374f0aecd4b', 'H1 2026', 'Entrega', 'MEJORAS DE ENTREGA', '5.2', 'BENCHMARK', false, '1', 'Realizaron Bench con Palco un dia antes de la auditoria.. Vieron: TLP, rechazos, RMD. Para H2 mostrar proceso documentado y resultados. Oportunidad de realizar bench interno.', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f4effac0-5d42-496d-b3b2-819a27098ee6', id, 'Para H2 mostrar proceso de benchmark documentado y resultados', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c574e8a4-8ba0-4545-b8d5-cbb2679cc342', id, 'Realizar bench interno', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c6fb0689-052c-4d7d-a51c-197fb37945a6', 'H1 2026', 'Flota', 'COMPLIANCE', '1.1', 'Documentos / Habilitaciones', true, '3', '11 camiones T2. 2 AE. Oportunidad de generar tablero como maestro de flota con todos los camiones y los requisitos. Se sigue toda la documentacion en el apartado de requisitos legales, hay avisos de proximos a vencer y existe proceso para bloqueo de los vehiculos en caso de que no cumpla.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c96cb6d5-39ae-4088-93f9-9b2eba089358', id, 'Oportunidad de generar tablero como maestro de flota con todos los camiones y los requisitos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c8de2f86-6ac3-4e29-8532-0367fa377e4d', 'H1 2026', 'Flota', 'COMPLIANCE', '1.2', 'Estándares de Flota', true, '3', 'Estandar de camiones ok. Tablero de estandar ok. Se sigue % de cumplimiento por camion. Diferenciar entre mandatorias y excelencia. Sumar OPLs de camiones y AE.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '32b9e896-7079-4444-b157-081ae97b9bf3', id, 'Diferenciar entre mandatorias y excelencia', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e0f9a769-cc58-4132-b272-b9dc4127d234', id, 'Sumar OPLs de camiones y AE', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b2deed26-04a8-4c17-b8a0-ca70b57cb653', 'H1 2026', 'Flota', 'COMPLIANCE', '1.3', 'Checklist de Flota', true, '3', 'Check digital.Ok para camiones y AE. Se divide por secotres (carroceria, motor, frenos, luces, neumaticos, seguridad. etc). Define cuales son criticos y cuales no. Buen seguimiento de items que dan nook. Oportunidad de realizar analisis aperturado de las fallas y generar PDAs. Adherencia al check se sigue en la reunion de logisitca, oportunidad de sumarlo a esta solapa. Se sigue KPI de tiempo: trabajar en los desvios. Oportunidad de comenzar a seguir KPI de calidad.', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ec3b8b0a-dddf-4987-820a-87656c4f7097', id, 'Oportunidad de realizar analisis aperturado de las fallas y generar PDAs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'eebd515d-5015-43bf-8aeb-1373b6482d69', id, 'Oportunidad de comenzar a seguir KPI de calidad', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3cd07afe-d412-4368-95b7-92b6c7c792fc', 'H1 2026', 'Flota', 'COMPLIANCE', '1.4', 'Disposición de residuos de Mantenimiento', false, '0', 'Generar SOP.de disposicion de residuos. Cerrar con empresa para disposicion de neumaticos para el futuro y sumar certificados al SOP, mismo para aceite. Generar seguimiento historico para cuando comiencen.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'be88a37f-cb51-49d2-ab5b-29ef5c514f63', id, 'Generar SOP de disposición de residuos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4ca93552-6288-4def-8747-b26cd93d7701', id, 'Cerrar con empresa la disposición de neumáticos a futuro y sumar certificados al SOP (ídem aceite)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '67dc2465-dd95-4f4a-9f20-935c70313a2e', id, 'Generar seguimiento histórico para cuando comiencen', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('93d13167-a10f-4e82-b1ce-1c2e63578af1', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.1', 'Clientes de Flota', false, '5', 'Se sigue disponibilidad de flota x mes x dia. Todo gestionado por la herramienta propia. Poseen reunion semanal con el ruteador donde ven disponibilidad de flota, consumo de combustible, motivos por los cuales los camiones estan parados.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('aa33c432-1317-4845-b57c-3a0446afdd5a', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.2', 'Mantenimiento Preventivo', false, '3', 'Cada camion y AE tiene su plan de mantenimiento cargado y este se gestiona desde el tablero principal ( hay avisos de services pendientes de menos de 30 dias). Hay seguimiento de los mantenimientos que se realizaron. Luego se sigue por cada mantenimiento los trabajos realizados con sus respectivos valores. Oportunidad de comenzar a seguir KPI de % de cumplimiento de plan de mantenimientos preventivos. Mant proactivos ok.', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '949b1583-b49c-4bac-acc0-24603a3260da', id, 'Oportunidad de comenzar a seguir KPI de % de cumplimiento de plan de mantenimientos preventivos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('21b5189b-73ee-4902-b9df-84e352827245', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.3', 'Políticas y Gestión de Piezas de Inventario', false, '1', 'Generar SOP. Poseen inventario, recien mes de julio es el primer conteo de stock que realizan. Generar rutina de conteo de stock, comenzar a seguir un KPI y generar PDAs.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd0e1cb6b-01e9-42d2-b397-8510a4c36873', id, 'Generar SOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5873bad2-e0e6-45be-942a-f21911e14b8f', id, 'Generar rutina de conteo de stock, comenzar a seguir un KPI y generar PDAs', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('16860f43-7c24-4456-bfb5-e0e7c0ca28b0', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.4', 'Mantenimiento Correctivo', false, '1', 'Hay seguimiento de correctivos externos, falta realizar seguimiento de los internos (no estaban mapeados los cambios de foco por ej.) Oportunidad de comenzar a mapearlos cuando un check sale nook, sumar la OT para cerrar el circulo con el descuento en el stock. Oportunidad de generar analisis de incidencias aperturado y tomar acciones. Comenzar a seguir KPI y generar PDA', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '18c0af66-88a7-44ca-ade6-1043e38c747e', id, 'Oportunidad de generar analisis de incidencias aperturado y tomar acciones', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ba3d5ce1-82f5-4777-9f84-cf003311caea', id, 'Comenzar a seguir KPI y generar PDA', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a0c60371-99b4-40c7-a177-759c421f6b59', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.1', 'Reuniones semanales', false, '1', 'Hay reunion semanal de flota. Realizar ciclo de gestion de flota (desc del negocio y mapeo de procesos). Oportunidad de generar seguimiento de SLAs, KPI y generar PDAs.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2239eed9-c5b2-4efd-9f0e-01b6e433cb8b', id, 'Realizar ciclo de gestion de flota (desc del negocio y mapeo de procesos)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3d4382c3-199f-4c60-898f-a4a4c479d872', id, 'Oportunidad de generar seguimiento de SLAs, KPI y generar PDAs', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a7e00cb6-34d6-4734-848c-970c1090b71e', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.2', 'Presupuesto de Gastos de Flota', false, '3', 'Seguimiento de gastos vs presupuestado. Motivos ante desvios. Oportunidad de segregar en motivos (correctivos, preventivos).', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e0a44007-a55a-47ca-95b5-c860c4298579', id, 'Oportunidad de segregar en motivos (correctivos, preventivos)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d95a1d59-7acf-4503-842d-139c65a31284', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.3', 'Consumo de Combustible', false, '3', 'Beun seguimiento. Se sigue rendimiento km/l de cada camion y generan PDAs. Colocaron limitador de velocidad (julio) por lo que se esta viendo tendencia positiva en los consumos (revisar en H2). Realizar SOP.', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fe10dcce-8775-47cb-ad44-2ff4de89c02c', id, 'Realizar SOP de consumo de combustible', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9428a6df-8d94-4296-9fa4-014d23ba7260', id, 'Revisar en H2 la tendencia de consumos tras el limitador de velocidad (colocado en julio)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c56dbf2d-bfc2-4a4b-9a76-d9f4833885d3', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.4', 'Políticas y Gestión de Neumáticos', false, '1', 'Buen seguimiento por la herramienta. Poseen marca de fuego. Medicion de mm y calibracion mensual. Comenzar a seguir KPI de consumo de neumaticos. Realizar SOP.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3387b906-def0-477e-b236-2a410e2bee35', id, 'Comenzar a seguir KPI de consumo de neumaticos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '26dfc4aa-ddd5-4419-8a33-fc2ad8257984', id, 'Realizar SOP', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('52242887-0eca-433b-b943-5a3554206670', 'H1 2026', 'Flota', 'AUTONOMÍA Y MEJORAS DE LA FLOTA', '4.1', 'ATO Formal Program & Cleaning Area Autonomous team operation', false, '0', NULL, 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('17f9156e-1c5d-4d50-a776-43b606815279', 'H1 2026', 'Flota', 'AUTONOMÍA Y MEJORAS DE LA FLOTA', '4.2', 'Maintenance improvements & results', false, '1', 'Generar analisi aperturado de datos historicos. Generar piramide de mantenimientos.', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c150b7a5-3417-4c6a-994c-005fb176b461', id, 'Generar analisi aperturado de datos historicos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b0a0f4b8-7ee7-48a4-a880-d739405a909c', id, 'Generar piramide de mantenimientos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('441442aa-61f6-4af6-b4b6-56db96cc9e49', 'H1 2026', 'Flota', 'AUTONOMÍA Y MEJORAS DE LA FLOTA', '4.3', 'Sustainability Goals', false, '0', NULL, 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a6c6b203-3e28-4758-90ff-fe585490827c', 'H1 2026', 'Almacén', 'LAYOUT & CAPACIDAD', '1.1', 'Optimización de Layout', true, '3', 'Oportunidad: continuar trabajando en layout, carteleria, responsables por area, sendas, zona segura de chofer. Foco en 5s en distintas zonas del almacen (ejemplo parque de envases, carga y descarga). Seguridad en clasificacion de envases Continuar trabajando en medicion de adherencia al ABC', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '23e8c161-c043-4376-a219-25527fb761a7', id, 'Continuar trabajando en layout: cartelería, responsables por área, sendas, zona segura de chofer', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'de3d57f5-e630-489e-a830-2e86e1c83a4d', id, 'Foco en 5S en distintas zonas del almacén (ej: parque de envases, carga y descarga)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ab85ab62-3803-43a6-8fea-62c50c63241c', id, 'Seguridad en clasificación de envases', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ba4f7353-a5f1-4630-b82c-09c640cacaa2', id, 'Continuar trabajando en medición de adherencia al ABC', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1a7c7399-6269-4fb2-9df8-1b15de8e7b2a', 'H1 2026', 'Almacén', 'LAYOUT & CAPACIDAD', '1.2', 'Gestión de la Capacidad', false, '3', 'Revisar calculo de densidad', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5b94ef93-8c29-424b-bdd4-82ab6e3e2a48', id, 'Revisar calculo de densidad', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5a280286-ed44-403f-9830-49409b6f8a29', 'H1 2026', 'Almacén', 'CALIDAD', '2.1', 'Fundamentos de la Calidad', true, '1', 'Oportunidad: Foco en analisis de gestion de plagas, mitigacion de las ocurrencias y solidas rutinas de limpieza Continuar trabajando en estaciones de limpieza dentro del almacen y en la disposicion finalo de residuos', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b147640d-4a1e-49ed-a399-481759ed2d8a', id, 'Foco en análisis de gestión de plagas, mitigación de las ocurrencias y sólidas rutinas de limpieza', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f0b5902b-b665-4f5a-9328-fc0d582b3b4d', id, 'Continuar trabajando en estaciones de limpieza dentro del almacén y en la disposición final de residuos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1f1a20ea-128a-401f-bc42-a0071bedd25f', 'H1 2026', 'Almacén', 'CALIDAD', '2.2', 'Políticas de Calidad', false, '1', 'Oportunidad: continuar trabajando en PRI y reempaque (teniendo en cuenta entandarizacion de las zonas) Foco en ambas estaciones de trabajo, asi como tambien considerar zona de derrame (con responsables, QR del SOP, zona cerrada, carteleria, etc)', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c3101073-43be-4bee-a703-611bad9f292c', id, 'Continuar trabajando en PRI y reempaque (estandarización de las zonas)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '86335114-3aa1-4df4-b984-25205926664f', id, 'Foco en ambas estaciones de trabajo y considerar zona de derrame (responsables, QR del SOP, zona cerrada, cartelería, etc.)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5f9f2a23-12f8-4ea6-b899-8ac62db1f9e5', 'H1 2026', 'Almacén', 'CALIDAD', '2.3', 'Gestión de Frescura', false, '3', 'Buen analisis de frescura, continuar trabajando en acciones por frescura', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9b9508e0-1540-421c-975e-142560e985ac', id, 'Continuar trabajando en acciones por frescura', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8016ad29-822e-43c3-abcf-2a5c9e06bf39', 'H1 2026', 'Almacén', 'CALIDAD', '2.4', 'Rutinas de Calidad de Packaging', false, '1', 'Oportunidad: Foco en seguimiento de tickets de mercosur pampeana', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f8c3a236-7936-4ce8-8f1d-0e63fd942b6d', id, 'Foco en seguimiento de tickets de mercosur pampeana', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a5059dfe-ce59-4d0b-9fda-191c728c3fbc', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.1', 'Proceso de Conteo y Resultados de Inventario', true, '3', 'Realizan conteos diarios Foco en correccion del indicador diferencia de inventario (contemplar faltantes de planta) Continuar trabajando en PDA ante desvios de diferencias Revisar ajustes', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd2467e42-12de-444d-88c7-f5fb1b44f56c', id, 'Corregir el indicador de diferencia de inventario (contemplar faltantes de planta)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'eb0b73fb-c8b2-4988-aad2-f79f26435795', id, 'Continuar trabajando en PDA ante desvíos de diferencias', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2ce58966-de72-42db-b7a0-3337ac342c00', id, 'Revisar ajustes', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f8a7b956-365c-4138-bfec-35f5e7fcf8a2', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.2', 'Trazabilidad del Producto', false, '5', 'Ok, cuentan con WMS y SOPs detallados y actualizados', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a19c43cf-af3a-4484-a210-f5ec4fc687d1', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.3', 'Gestión de Activos', false, '3', 'Oportunidad: continuar trabajando en el seguimiento del DS de envases Continuar trabajando en la recaudacion de informacion para el proceso de clasificacion de envases y % de descarte del mismo Foco en acciones y revision del valor objetivo para dicha productividad', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ecdb754e-49e4-43c2-b50a-ee2f9bb7aa2d', id, 'Continuar el seguimiento del DS de envases', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ecab19cc-d19b-4660-a3b6-c257004fc62e', id, 'Continuar la recolección de información para clasificación de envases y % de descarte', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a2529ef4-bb80-42de-8d5e-541ddf83719d', id, 'Foco en acciones y revisión del valor objetivo para dicha productividad', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('129d3293-c85d-49c7-9ba4-31dc433ddaf6', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.4', 'Registro y Prevención de Pérdidas', true, '1', 'Oportunidad: continuar trabajando en el analisis de indicadores (WQI: CORREGIR INDICADOR teniendo en cuenta volumen reempacado) Foco en seguimiento de SCL y FGLI. Definir acciones en PDA', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'feeb4289-28f7-4f5d-bf97-340f7454dac3', id, 'Corregir indicador WQI teniendo en cuenta el volumen reempacado', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5d23821b-5fcd-4d0b-90ad-7cb48464fd04', id, 'Foco en seguimiento de SCL y FGLI', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1a9ea11e-11b1-45ee-869c-68778760045f', id, 'Definir acciones en PDA', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d8536de6-e198-468e-ad8c-12aaa44836b7', 'H1 2026', 'Almacén', 'PICKING', '4.1', 'Proceso de Picking', false, '5', 'Ok, cuentan con SOP definido y se realizan OWDs. Controlan la carga y ven como afectan los errores al rechazo.', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8eca7f9d-e3dc-4321-a3bf-2533be198fce', 'H1 2026', 'Almacén', 'PICKING', '4.2', 'Reposición del Área de Picking', false, '3', 'Oportunidad: continuar trabajando en el analisis del PI teniendo en cuenta el exceso de reabastecimientos. Revisar si tenemos la cantidad de pallets necesarios para el volumen de picking diario', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '810c00f3-be80-43bf-a07b-304b8a1e0a75', id, 'continuar trabajando en el analisis del PI teniendo en cuenta el exceso de reabastecimientos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '62dd8c9d-ab1f-480d-ba58-ca166b3d5a4d', id, 'Revisar si tenemos la cantidad de pallets necesarios para el volumen de picking diario', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('73a2b66a-f4ea-477e-b5f5-d489bb564ee1', 'H1 2026', 'Almacén', 'PICKING', '4.3', 'Precisión de Picking', false, '3', 'Oportunidad: continuar trajando en analisis de eficiencia de picking, teniendo comparar con volumen movido por el operario', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '51208d41-b49b-4789-935d-fa9ea75c0f37', id, 'continuar trajando en analisis de eficiencia de picking, teniendo comparar con volumen movido por el operario', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6065ad74-694a-4760-ba71-252931e28ddc', 'H1 2026', 'Almacén', 'CARGA Y DESCARGA DE VEHÍCULOS DE DISTRIBUCIÓN', '5.1', 'Proceso de Carga y Descarga T2', false, '5', 'Ok, bien ejecutado el proceso de carga y descarga. Continuar trabajando en layout el area designada para carga y descarga, definir en caso de ser posible zona externa al almacen', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('164a1db5-0435-4874-b92e-edf36cac1128', 'H1 2026', 'Almacén', 'CARGA Y DESCARGA DE VEHÍCULOS DE DISTRIBUCIÓN', '5.2', 'Programación de Cargas Salientes T2', false, '3', 'Cuentan con SLA, continuar trabajando en el seguimiento de la misma y reforzar PDA ante cada NOOK', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cb596898-f2c0-4adb-b744-28c4d931dc35', id, 'Continuar el seguimiento de la SLA y reforzar PDA ante cada NOOK', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('fac03efd-9879-4e3f-a007-85609714060f', 'H1 2026', 'Almacén', 'CARGA Y DESCARGA DE VEHÍCULOS DE DISTRIBUCIÓN', '5.3', 'Eficiencia de Carga y Descarga', false, '1', 'Analizar histograma de carga y descarga de camiones y definir PDA en base a eso. Continuar con la controlación de % de camiones decargados y cargados para los SLAs definidos.', 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c52eeb45-dfd6-46c4-b62f-e7a4a73ed874', id, 'Analizar histograma de carga y descarga de camiones y definir PDA en base a eso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2b68f7a9-3d91-4cad-b16c-cb6667d725c2', id, 'Continuar con la controlación de % de camiones decargados y cargados para los SLAs definidos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2073ea08-fc33-4ab9-adff-1cfab12b73d4', 'H1 2026', 'Almacén', 'REAPROVISIONAMIENTO', '6.1', 'Proceso de Recepción T1', false, '5', 'Ok, bien definido y ejecutado el proceso de recepción de carga, seguir trabajando en base a los valores objetivos.', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5725f8ff-94c6-4fad-8c50-944eab626541', 'H1 2026', 'Almacén', 'REAPROVISIONAMIENTO', '6.2', 'Programación de Carga Entrante T1', false, '3', 'Cuentan con SLA definida, continuar trabajando en el seguimiento de la misma.', 18)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '04db4b1a-73ba-4d7a-9629-bfa995dc0073', id, 'Continuar trabajando en el seguimiento de la SLA definida', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('20b38f88-005c-4ffc-be90-fa52f5ed16c5', 'H1 2026', 'Almacén', 'REAPROVISIONAMIENTO', '6.3', 'Tiempo de Ciclo del Camión T1', false, '1', 'Controlar tiempo de ciclo de camión, calcular el WPS y definir acciones de mejora.', 19)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '389d944e-bd2c-4e17-97c0-cd0d7e342c36', id, 'Controlar tiempo de ciclo de camión, calcular el WPS y definir acciones de mejora', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='6.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('7b9e87e7-4e8f-468d-8209-a57e033e9c32', 'H1 2026', 'Almacén', 'MEJORAS DE PRODUCTIVIDAD', '7.1', 'Gestión de Productividad de Almacén', false, '3', 'Continuar con seguimiento del WNP en todas las áreas del almacén a nivel individual . Oportunidad: simulador dimensionamiento para mejorar productividad.', 20)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3245e6ae-0872-4d22-bf5f-b960c4735215', id, 'simulador dimensionamiento para mejorar productividad', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('63432c56-9d0a-437d-acea-c481f42f7bcf', 'H1 2026', 'Almacén', 'MEJORAS DE PRODUCTIVIDAD', '7.2', 'Herramienta de Telemetría', false, '1', 'Controlar FNP.', 21)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd3ef650c-46d7-45ee-b51a-805a3793568f', id, 'Controlar FNP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('41a23dd9-7764-49a3-a3c8-6261eb2c7124', 'H1 2026', 'Almacén', 'MEJORAS DE PRODUCTIVIDAD', '7.3', 'Iniciativas de Productividad', false, '1', 'Continuar trabajando en la herramienta. Avanzar en los PDA y gestionar acceso a los resultados.', 22)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '777e37a3-871f-4bec-8879-1979ddf9aadd', id, 'Continuar trabajando en la herramienta', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7af0a883-afa2-4655-b80e-8e9b9db449fb', id, 'Avanzar en los PDA y gestionar acceso a los resultados', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ce5c22aa-8f8b-492f-9091-74b56f94dc83', 'H1 2026', 'Planeamiento', 'GESTIÓN DE PRESUPUESTO', '1.1', 'Proceso y creación de presupuesto', true, '3', 'Revisar y corregir RACI (No deberia aparecer mas de un responsable por fila) Mejorar analisis y cruce entre presupuesto con iniciativas de ahorro Entender impacto de mas SKPIs con el presupuesto (OB - rechazo )', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fae538e8-5561-40cb-955a-7d6374770e8a', id, 'Revisar y corregir RACI (no debería aparecer más de un responsable por fila)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4e01e387-65e0-4f65-a553-831d3c13e37f', id, 'Mejorar análisis y cruce entre presupuesto e iniciativas de ahorro', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8c0e43d5-18fc-4020-9ed2-af0d0177695b', id, 'Entender impacto de más SKPIs con el presupuesto (OB, rechazo)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('874bc7e3-ca45-4133-82ff-ab1b4577974e', 'H1 2026', 'Planeamiento', 'GESTIÓN DE PRESUPUESTO', '1.2', 'Monitoreo de costos', false, '3', 'Tienen rutina de dueños de paquetes (Continuar trabajando en evidencia) Analizar acciones Mucho foco en las acciones ante desvios y seguimiento de las mismas Segregar mas cada desvio por paquete (que no se trabaje de manera aislada cada paquete con el presupuesto) Realizaron bench con Palco Continuar trabajando en analisis de costo por PDV', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e173e92e-3df9-4f6e-a446-5c3a85201b28', id, 'Continuar trabajando en evidencia de la rutina de dueños de paquetes', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c632e70b-71dc-4359-bad4-9363aa4625df', id, 'Foco en acciones ante desvíos y seguimiento de las mismas', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e9c4ee4d-8c42-4228-bae3-b9accd242833', id, 'Segregar más cada desvío por paquete (no trabajar cada paquete aislado del presupuesto)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '97d63bc0-d2c6-499f-8cbe-813205649e8d', id, 'Continuar trabajando en análisis de costo por PDV', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('adc2f4df-b6a8-46fb-8769-606d577d9946', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.1', 'Permisos y licencias para el derecho a operar', true, '5', 'Completo. Foco en seguimiento de proximos vencimientos', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('49719b2f-0fc4-4f96-b672-b29f61397fa6', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.2', 'Evaluación de riesgos, respuesta y reanudación del negocio', true, '3', 'Reforzar carteleria Reforzar plan de respuesta incluir una matriz de escalamiento con contactos responsables , mano de obra y procedimientos de ajuste de pronóstico para mitigar el riesgo, como mínimo.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '438089b7-03af-4c67-99f9-1a4a02164489', id, 'Reforzar cartelería', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c481c1e5-d904-4824-9777-c61368326c84', id, 'Reforzar plan de respuesta: incluir matriz de escalamiento con contactos responsables, mano de obra y procedimientos de ajuste de pronóstico', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('cdd2069b-7c52-4f16-ae2b-0e6e1130d8a1', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.3', 'Recurso del dimensionamiento', false, '1', 'Oportunidad: continuar trabajando en analisis del simulador. Actualmente comparar con volumen real y revisar la ociosidad de flota (cruzado con pilar flota) Utilizar la herramienta de forma dinamica que nos permita tomar decisiones', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9792f001-f2fc-4d0b-a1a0-65b199aa936a', id, 'Continuar el análisis del simulador: comparar con volumen real y revisar ociosidad de flota (cruzado con pilar Flota)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a1800a58-b132-47b3-806e-601972e0ac64', id, 'Utilizar la herramienta de forma dinámica para tomar decisiones', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1c36fc4c-b535-4037-a15b-4646ab113fb7', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.4', 'Mantenimiento de instalaciones', false, '3', 'Continuar trabajando en acciones y vinculo con bloque 5', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'caa14eb5-e013-4f11-851d-97afab481a7f', id, 'Continuar trabajando en acciones y vinculo con bloque 5', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('abcd7976-406e-4259-97e9-78d41fa0155a', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.1', 'Conectando ventas y operaciones', true, '3', 'Rutina semanal (Todos los martes) Oportunidad Foco en seguimiento de SLA con acciones asociadas Foco en acciones concretas (formato de las acciones en herramienta)', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '167a7590-68da-4526-b337-28777c4229e0', id, 'Foco en seguimiento de SLA con acciones asociadas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f7dbecd8-4608-40d6-941e-37585bac7eeb', id, 'Foco en acciones concretas (formato de las acciones en la herramienta)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9e71911f-f752-4fb9-95df-03132db0c8ae', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.2', 'Rutina de pronóstico: mitigación del nivel de servicio y los impactos de los costos', true, '5', 'Buen analisis y seguimiento', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2d4f6fe8-84db-44ff-b854-520036f1dff3', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.3', 'SOP de enrutamiento y matriz de habilidades', false, 'N/A', 'Foco en OWD para ruteador suplente', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'acea610b-97e9-4f42-b80b-1f233bf5ef38', id, 'Foco en OWD para ruteador suplente', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8965a8dc-2456-4a82-8885-8dfda11fe16c', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.4', 'Periodo Crítico', false, '1', 'Oportunidad: continuar trabajando en analisis de periodos criticos Cascadear y definir incentivo de temporada alta', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b172a48a-0b91-4704-aa59-10cccf6248bb', id, 'Continuar trabajando en análisis de períodos críticos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5e51d99d-b16e-4285-baf9-caca1393c93d', id, 'Cascadear y definir incentivo de temporada alta', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3a370187-369c-47a7-8726-28113be5eae2', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.1', 'Análisis y plan centrado en el cliente', true, '3', 'Oportunidad: Continuar trabajando en analisis de NPS. Definir acciones concretas y dar seguimiento a pasivos Buenos valores de NPS', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5230aca9-a0f7-4904-bde3-9d220f5b9174', id, 'Continuar trabajando en análisis de NPS', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f6a2fa8e-3bf0-4f81-bcf8-152d5b8a5071', id, 'Definir acciones concretas y dar seguimiento a pasivos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('33fcfcbe-3bf7-4f76-bd6f-410ae9fd6778', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.2', 'Plan de agrupación de clientes', false, '3', 'Oportunidad: Continuar trabajando en clusterizacion de clientes. Foco en variables definidas. Tener en cuenta variables pasa/no pasa', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1fbc2f91-a0dd-4194-8f42-1470c94085fe', id, 'Continuar trabajando en clusterizacion de clientes', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ddb2e682-b10a-46b1-97bd-d8b8d69bd7bd', id, 'Foco en variables definidas', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a77f632e-867c-4715-9cad-00bd89ee5798', id, 'Tener en cuenta variables pasa/no pasa', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6932a4fc-b3fc-4024-bf06-69c1fcf7c0db', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.3', 'Servicio de Entrega Expreso y Flexible', false, '0', NULL, 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2e914de4-1c88-4a2e-8646-4ac72c7dce92', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.4', 'Gestión proactiva del nivel de servicio', false, '3', 'Oportunidad: continuar trabajando en impacto de la herramienta en rechazos, TLP, etc. Y reforzar evidencia que los cambios y cancelaciones de pedidos se incluyen en el cálculo OTIF con un código de motivo asignado.', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '875b8f69-3484-4dc8-a95e-f9d730bd866d', id, 'continuar trabajando en impacto de la herramienta en rechazos, TLP, etc', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bd6977d9-9d10-4c6a-8ffa-e2594dd53e61', id, 'Y reforzar evidencia que los cambios y cancelaciones de pedidos se incluyen en el cálculo OTIF con un código de motivo asignado', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b3df21af-06d8-48bc-9a6a-aae6d219a38b', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A MEDIANO PLAZO', '5.1', 'Plan Territorial e Implementación', false, '0', 'Oportunidad. Realizar analisis de reestructuracion de rutas en post de la mejora en el costo/HL Teniendo en cuenta nalisis de(relevamiento de ventas horarias, frecuencia de entrega, rechazo, etc)', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a752d057-bfa3-48d0-9cc5-603a6547d834', id, 'Realizar análisis de reestructuración de rutas para mejorar el costo/HL (ventas horarias, frecuencia de entrega, rechazo, etc.)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c0fba222-7329-4f71-b02e-679e3e31b058', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A MEDIANO PLAZO', '5.2', 'Rutina de campeones', false, '3', NULL, 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e7ed6ca4-ed79-4d11-be6c-f17d7223eac2', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A MEDIANO PLAZO', '5.3', '3YP & CAPEX', false, '1', 'Cuentan con evidencia. Continuar trabajando con impacto en bloque 1 Foco en año que viene y 2028', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1c686578-fa04-459a-a2d1-a991b6ef4794', id, 'Continuar trabajando el 3YP con impacto en bloque 1', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f6c36182-b25a-4aae-8ee2-95ad2a921617', id, 'Foco en 2027 y 2028', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
