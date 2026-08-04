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
  ('f1b615f4-50ad-4674-9f48-a804081e968f', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.1', 'Reporte de incidentes/accidentes', true, '1', 'SOP disponible. Confección de la pirámide ok. Proceso de reporte de CS/CI en marcha desde el 2026 (23 reportes efectuados en el presente período - en su mayoría condiciones inseguras). Cuentan con App Vercel para acceder a los reportes y registros. Oportunidad: - Ajustar caso Cordone: solicitar nuevamente la recategorización a MTI del caso. Corregir clasificación de SIF (de SIF potencial pasaría a NA SIF). - Ajustar caso Rodriguez: corregir clasificación de SIF (de SIF actual pasaría a NA SIF). - Seguir reforzando reporte de comportamientos seguros/inseguros y condiciones inseguras. Afianzar participación de mandos medios y operación en dicho reporte. - Desarrollar análisis de gráfico de torta o similar a fin de analizar cuáles son los comportamientos inseguros más frecuentes o críticos en función a las tendencias y enfocar los PDA a dichos casos. - Alinear reporte de GKPIs en función a lo relevado internamente.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '220bd7ae-3d1b-4a94-94e6-d78f3d38ce61', id, 'Ajustar caso Cordone: solicitar nuevamente la recategorización a MTI del caso. Corregir clasificación de SIF (de SIF potencial pasaría a NA SIF)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd904916b-91a2-4549-98b8-111ab1b68ca6', id, 'Ajustar caso Rodriguez: corregir clasificación de SIF (de SIF actual pasaría a NA SIF)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3bf79f24-6d55-4051-8817-dd679cde896e', id, 'Seguir reforzando reporte de comportamientos seguros/inseguros y condiciones inseguras. Afianzar participación de mandos medios y operación en dicho reporte', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8aaeb920-710b-4ffa-aec6-363dcb3a671e', id, 'Desarrollar análisis de gráfico de torta o similar a fin de analizar cuáles son los comportamientos inseguros más frecuentes o críticos en función a las tendencias y enfocar los PDA a dichos casos', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cf851d0d-8f57-405f-9887-059fb0445671', id, 'Alinear reporte de GKPIs en función a lo relevado internamente', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ae5da0cb-5b51-4fd8-9324-d69136123b09', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.2', 'Notificacion de incidentes/accidentes', false, '3', 'Notificaciones al EDV 100% documentadas. Alertas de seguridad compartidas al personal. Oportunidad: - Reforzar investigaciones, profundizando en el 5PQ. - Documentar notificación de alerta del caso de Rodríguez.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '656af352-3a46-4b39-a47b-a6798be87fb2', id, 'Reforzar investigaciones, profundizando en el 5PQ', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b35aa079-cdac-49f0-aa7c-392085454de5', id, 'Documentar notificación de alerta del caso de Rodríguez', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('708d48fd-81df-4142-86f6-24411a596d40', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.3', 'Investigación de incidentes/accidentes y análisis de causa raíz', false, '3', 'Se implementa herramienta de análisis de causas con conclusión de causa raíz para el 100% de las investigaciones. Incorporaron al análisis la simulación del evento a fin de recrear la mecánica del accidente; revisan historial de comportamientos inseguros registrados con respecto al colaborador accidentado; actualizan ER en función a los accidentes ocurridos. Oportunidad: - Profundizar 5 por qué, considerando método, persona y proceso. - Reforzar gestión de implementación de acciones correctivas. Aplicar OWD al personal accidentado luego del reingreso y para casos de incidentes. - Documentar PDA mediante action log digital, asignando responsable, fecha de cumplimiento y status.', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '585f1133-664e-45fb-898e-1f76c4217df2', id, 'Profundizar 5 por qué, considerando método, persona y proceso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f58ccc12-4abf-412e-be9b-874fb171bd53', id, 'Reforzar gestión de implementación de acciones correctivas. Aplicar OWD al personal accidentado luego del reingreso y para casos de incidentes', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fead92d8-240f-4f3c-8254-f2b5ed719464', id, 'Documentar PDA mediante action log digital, asignando responsable, fecha de cumplimiento y status', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0c568831-2354-4833-9e02-91fdb0c3ef8c', 'H1 2026', 'Seguridad', 'SIF Y GESTIÓN DE INCIDENTES', '1.4', 'Proceso de revisión de rutina de gestión de incidentes/accidentes', false, '3', 'Se trata en el minuto de seguridad el tratamiento de pirámide de accidentología y alertas de seguridad por incidentes y accidentes (internos y/o externos). Oportunidad: seguir reforzando el conocimiento de la operación sobre pirámide de accidentología, clasificación y gestión de SIF.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b52e7b28-4901-4bc6-89a1-c26a55b43750', id, 'seguir reforzando el conocimiento de la operación sobre pirámide de accidentología, clasificación y gestión de SIF', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2002f50a-e3cb-458b-adcb-9858fa9014d9', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.1', 'Control y gestión de entornos con déficit de oxígeno', false, 'N/A', NULL, 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4dff53e5-762d-405c-9c95-73b88563812b', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.2', 'Monitoreo y gestión de sistemas de amoníaco', false, 'N/A', NULL, 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('54d20728-01f6-4e9c-991f-1ca21c99e797', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.3', 'Monitoreo y gestión de prevención de explosiones', false, '3', 'Carga de fuego realizada. No cuentan con áreas con riesgo de explosividad. Oportunidad: - Incluir baterías de litio en estudio de carga de fuego, detallando el poder calorífico del mismo. - Evaluar posibilidad de migrar el sector de carga de diesel a zona externa.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '99dc372d-3a3c-4818-83a3-b6e1cc7bb6ff', id, 'Incluir baterías de litio en estudio de carga de fuego, detallando el poder calorífico del mismo', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1da9cd55-f834-41cb-85ee-ca1c187c4158', id, 'Evaluar posibilidad de migrar el sector de carga de diesel a zona externa', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5e4cf86e-2674-4bc0-a66a-c720df38db9a', 'H1 2026', 'Seguridad', 'GESTIÓN DE PROCESOS DE ALTO RIESGO', '2.4', 'Gestión de sistemas eléctricos', true, '3', 'Medición de PAT realizada. Buen estado general de tableros. Se evidencia check trimestral de tableros. Personal autorizado y OPL de bloqueo y etiquetado gestionado a la vista. Oportunidad: - Actualizar medición de PAT verificando la continuidad de las masas en la totalidad de los tomacorrientes (prueba de disyuntor diferencial). Verificar OHMs obtenidos en cada uno de ellos. - Documentar permiso de trabajo para tareas excepcionales que involucren el manejo de tableros eléctricos.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '69abc6be-3039-46a4-a04a-6e25053f9211', id, 'Actualizar medición de PAT verificando la continuidad de las masas en la totalidad de los tomacorrientes (prueba de disyuntor diferencial). Verificar OHMs obtenidos en cada uno de ellos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'edb2b881-96bf-4ce7-84b3-41c91e10b28f', id, 'Documentar permiso de trabajo para tareas excepcionales que involucren el manejo de tableros eléctricos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a6d03bf2-43e6-423a-a689-94cdedc7905d', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.1', 'Gestión del plan de tráfico', false, '3', 'Implementaron zona cero. Plan de tráfico implementado y gestionado a la vista. Oportunidad: - Incluir en layout: velocidad máxima, ubicación del trabaruedas proyectado a incorporarse. - Clausurar senda peatonal trasera en zona de vacíos. Ajustar apilabilidad de vacíos en dicho sector. - Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking. - Implementar reductores de velocidad en ingreso y salida de camiones. - Reforzar pintura de sendas y cruces peligrosos. - Vallar sendas de circulación en ingreso peatonal.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0ba9b080-e26b-4bf4-b09a-8455c4876350', id, 'Incluir en layout: velocidad máxima, ubicación del trabaruedas proyectado a incorporarse', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b26386a8-96ab-44e9-b4c4-f705de085b6c', id, 'Clausurar senda peatonal trasera en zona de vacíos. Ajustar apilabilidad de vacíos en dicho sector', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '873da4a1-e23e-43ef-9807-f7522f1dcc35', id, 'Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '17e58587-29f4-4d7d-8943-ea2ac5f55e14', id, 'Implementar reductores de velocidad en ingreso y salida de camiones', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1e4357c1-578d-4afd-b4c6-df4ec3b963dc', id, 'Reforzar pintura de sendas y cruces peligrosos', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd06f49b7-17f1-46be-a144-bec05d186d06', id, 'Vallar sendas de circulación en ingreso peatonal', 6 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1b323f97-74e9-4dbc-aa95-6b481eebaa8b', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.2', 'Carga y descarga de forma segura', false, '1', 'SOP disponible. Zona segura correctamente implementada. Oportunidad: - Implementar trabaruedas habilitado por CMQ. - Colocar cartelería en zona segura. - Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones. - Unificar aspectos de Seguridad y operativos dentro del mismo SOP.', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd7c618c8-e558-495f-a00f-1a55091bd3a5', id, 'Implementar trabaruedas habilitado por CMQ', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9c99902d-75b7-49a2-a463-171170d4f721', id, 'Colocar cartelería en zona segura', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '638e3002-37db-492e-bcea-7aedd10a0181', id, 'Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e9abd67b-9cf5-455f-acd6-348ac3cc96af', id, 'Unificar aspectos de Seguridad y operativos dentro del mismo SOP', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('7d88ff46-5b61-4818-8130-6eaeea9d1157', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.3', 'Utilización segura de equipos industriales motorizados', false, '1', 'La distribuidora dispone de autoelevadores a base de combustión interna (diesel). Oportunidad: - Se recomienda migrar al sistema a base de GLP según estándar global. Evidenciar plan de recambio. - Gestionar habilitación de autoelevadoristas según Res. 960/15.', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '76689636-4b69-4762-9621-b8038841cc5a', id, 'Se recomienda migrar al sistema a base de GLP según estándar global. Evidenciar plan de recambio', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1562fc08-01fb-458a-97ee-f247b616b601', id, 'Gestionar habilitación de autoelevadoristas según Res. 960/15', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('14c3e9dd-0f2a-46c5-8609-f73c1f6c3078', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.4', 'Gestión de seguridad de los peatones', true, '3', 'Zona de picking segregada mediante barreras y mallas metálicas. Espejos parabólicos instalados en puntos ciegos. Oportunidad: - Implementar barreras fijas en zona de clasificación de envases. - Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking. - Implementar barreras fijas en sendas de circulación peatonal del ingreso a la distribuidora. - Se sugiere implementar alarmas de notificación de paso peatonal en cruces peligrosos. - Instalar puertas vaivén en cruces peligrosos. - Instalar barrera fija en cruce peligroso hacia canchas de picking (nave 2).', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f3f73208-2cb4-4360-b813-62b672f3f4e8', id, 'Implementar barreras fijas en zona de clasificación de envases', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cf9db453-c3e6-42fe-9017-4cba9a958828', id, 'Ajustar camino hacia zona de clasificación, verificando la posibilidad de generar acceso desde el área de picking', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '34272b51-9215-47b2-8346-42c5d08b377e', id, 'Implementar barreras fijas en sendas de circulación peatonal del ingreso a la distribuidora', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a853c9ff-aa1e-433a-a7cc-b915d201927d', id, 'Se sugiere implementar alarmas de notificación de paso peatonal en cruces peligrosos', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3015d9da-ae0a-4e4b-961c-d370f0df9f88', id, 'Instalar puertas vaivén en cruces peligrosos', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a144fe8f-025f-47a6-8638-a71740a23eea', id, 'Instalar barrera fija en cruce peligroso hacia canchas de picking (nave 2)', 6 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2758b612-0268-4595-b6d2-c995edbed18a', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.5', 'Inspección previa al uso de equipos industriales motorizados y ejecucion segura', false, '3', 'Se evidencia adherencia al check de autoelevadores. Oportunidad: - Reforzar implementación de OWD del proceso. - Reforzar frecuencia de implementación de zorras eléctricas (check diario).', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '65a0f8fb-a8bf-4d79-8059-0ae292b3f6a7', id, 'Reforzar implementación de OWD del proceso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c908b623-b693-4211-a50f-4ad6c5944e56', id, 'Reforzar frecuencia de implementación de zorras eléctricas (check diario)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0f930b2f-2185-442a-8ba1-b0d085dcebcd', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.6', 'Ejecución Segura de control de llaves', true, '3', 'Cuentan con tablero para el guardado de llaves al finalizar la jornada. Comenzaron a implementar OWDs. Oportunidad: - Reforzar proceso de control de llaves durante la operación de recarga mediante la implementación de depósito de llave con sistema de bloqueo en trabaruedas. - Gestionar a la vista personal responsable del control final. - Unificar en SOP de control de llaves los aspectos de seguridad y operativos. - Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones.', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9df85a37-812f-46a1-8fb6-b768a6b957c2', id, 'Reforzar proceso de control de llaves durante la operación de recarga mediante la implementación de depósito de llave con sistema de bloqueo en trabaruedas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd6c1baf8-cc42-4c87-b70c-1179d1270ecb', id, 'Gestionar a la vista personal responsable del control final', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0bdcc683-ee10-4943-b588-2450f8a68c30', id, 'Unificar en SOP de control de llaves los aspectos de seguridad y operativos', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b12b2252-f09e-4099-bedc-506ce742e582', id, 'Comenzar con la implementación de OWDs en función al procedimiento. Desarrollar análisis en función a las tendencias y desvíos recurrentes detectados durante la realización de OWDs, a fin de focalizar las acciones', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('7c0a7d4b-ec3a-495b-9881-505db93ae787', 'H1 2026', 'Seguridad', 'SEGURIDAD EN EL TRANSPORTE EN EL LUGAR DE TRABAJO', '3.7', 'Gestión de puertas muelles', false, 'N/A', NULL, 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('82c4f6fb-fcd8-4659-bf7a-382306929878', 'H1 2026', 'Seguridad', 'MANIPULACIÓN DE MATERIALES Y ERGONOMÍA', '4.1', 'Ejecución segura de manipulación manual de materiales', false, '3', 'Estudio ergonómico de puestos de trabajo realizado (totalidad de puestos contemplados). Tuvieron dos casos de TME en el presente período. Oportunidad: - En función a los eventos ocurridos, reforzar el aspecto conductual del personal sobre la manipulación manual de cargas. - Reforzar conclusiones del estudio y PDA derivados del mismo. - Integrar preguntas referidas a posturas ergonómicas dentro de los puntos a evaluar en las OWD.', 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '68023a0b-0cf3-464a-bcf2-b48af0c1b672', id, 'En función a los eventos ocurridos, reforzar el aspecto conductual del personal sobre la manipulación manual de cargas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5160e5d1-2a66-47e4-aaad-fd5bff930161', id, 'Reforzar conclusiones del estudio y PDA derivados del mismo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '94940c0a-ab79-412f-83d3-1f1474ab39e3', id, 'Integrar preguntas referidas a posturas ergonómicas dentro de los puntos a evaluar en las OWD', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2c2cd3c5-8ba0-45ac-9e89-54aace28be2f', 'H1 2026', 'Seguridad', 'MANIPULACIÓN DE MATERIALES Y ERGONOMÍA', '4.2', 'Gestión de equipos de elevación mecánica, racks y estantes', false, '3', 'Racks en buenas condiciones. Protecciones visibles en base de bastidores y extremos. Check trimestral ok. Gestionaron cartelería de capacidad máxima para la totalidad de los racks. Oportunidad: - Implementar habilitación anual por parte de profesional habilitado. Contemplar en dicho estudio la medición de nivelación del suelo donde se afirma la estructura de los racks. - Completar soporte transversal faltante.', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1d359bf8-15ee-4c4f-bce5-4995a4d584b6', id, 'Implementar habilitación anual por parte de profesional habilitado. Contemplar en dicho estudio la medición de nivelación del suelo donde se afirma la estructura de los racks', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1bd9d629-1b1f-49a7-80cb-996883da3df9', id, 'Completar soporte transversal faltante', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('569bbed9-6a2b-46ab-9b59-7219220cd3e6', 'H1 2026', 'Seguridad', 'MANIPULACIÓN DE MATERIALES Y ERGONOMÍA', '4.3', 'Ejecución segura de equipos de elevación mecánica', true, 'N/A', 'No cuentan con gato hidráulico o cricket botella.', 18)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('50fa3e7b-f932-4cc5-94e4-54b481ef1947', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.1', 'Ejecucion segura de Carga de GLP', true, 'N/A', NULL, 19)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4203a226-a865-4654-9a6b-8b39df811617', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.2', 'Ejecucion segura de Carga de baterías', true, '1', 'Sector de carga de baterías en cumplimiento de 5S, cartelería (OPL y riesgo eléctrico) y lavaojos disponible en sector. Oportunidad: - Desarrollar SOP. - Gestionar a la vista cartelería de personal autorizado. - Verificar que la carga de baterías cuente con sistema de corte automático en cargadores para prevenir sobrecalentamiento. - Contar con extintor específico para baterías de litio en el sector (F500 o clase L).', 20)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '695b121d-b4c1-42dd-8ec2-e46aec5838d5', id, 'Desarrollar SOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c5d50381-66f0-4143-ae85-a392a85eb4d9', id, 'Gestionar a la vista cartelería de personal autorizado', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '079f3f68-8e0b-499f-a0ed-07d899f557d7', id, 'Verificar que la carga de baterías cuente con sistema de corte automático en cargadores para prevenir sobrecalentamiento', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8b21edc5-28e2-4d3a-ac13-4f05b6a5a6ac', id, 'Contar con extintor específico para baterías de litio en el sector (F500 o clase L)', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3bbaa9db-ff61-4083-a407-9d6b712eb5cf', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.3', 'Ejecucion segura de carga de Diesel/Gasoil', true, '1', 'Sector de carga de diesel en cumplimiento de 5S, kit antiderrame disponible , lavaojos y OPL. Cartelería de prohibición de fumar y riesgo de incendio presente. Oportunidad: - Desarrollar SOP. - Remover material combustible (pallet) donde se posiciona el tambor de diesel. Reemplazar por estructura metálica. - Implementar OWDs del proceso.', 21)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '009369fb-e36c-452e-bab2-fe38134fcea4', id, 'Desarrollar SOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '74644a77-e02a-47fa-bb65-84bd52aab7fe', id, 'Remover material combustible (pallet) donde se posiciona el tambor de diesel. Reemplazar por estructura metálica', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '55975e4f-2f28-4e52-8632-f9f44f120ad9', id, 'Implementar OWDs del proceso', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9bd75208-d2af-4b20-9b4d-3c9972711a67', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.4', 'Almacenamiento y transporte seguro de tubos de gas comprimido', false, '1', 'Cuentan con SOP de manipulación de tubos de CO2. Disponen de OPL para manipulación y transporte de barriles de cerveza. Oportunidad: - Profundizar SOP incluyendo la manipulación de barriles. - Implementar OWDs al proceso.', 22)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6bb27487-b706-4236-8e10-01109c83c654', id, 'Profundizar SOP incluyendo la manipulación de barriles', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3af83a39-498c-4ceb-ace3-b5b2d28e05e4', id, 'Implementar OWDs al proceso', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('19a6ef92-e526-4ebe-a9fd-8f56aa4b8670', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.5', 'Almacenamiento de sustancias peligrosas', false, '3', 'Materiales incompatibles almacenados por separado (matriz de compatibilidad visible). Bateas de contención antiderrames disponibles para la lavandina en dicho sector. Orden y limpieza ok. Oportunidad: - Completar bandeja antiderrame para la totalidad de los productos.', 23)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '975dfc48-43f4-46f5-a90b-efec4f7b39b0', id, 'Completar bandeja antiderrame para la totalidad de los productos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('44b096e5-0a51-43d8-814b-db44fd2ce99f', 'H1 2026', 'Seguridad', 'SUSTANCIAS PELIGROSAS', '5.6', 'SDS Management', false, '3', 'Hojas de seguridad y matriz de compatibilidad disponibles. Se evidencia control de inventario químico. Oportunidad: gestionar a la vista (en formato físico) las hojas de seguridad de la totalidad de los productos almacenados.', 24)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8d368955-439a-4936-bb9e-6ce0d58c0d3f', id, 'gestionar a la vista (en formato físico) las hojas de seguridad de la totalidad de los productos almacenados', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='5.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f8f0f347-393f-4a7f-b716-f05d48bc0375', 'H1 2026', 'Seguridad', 'ESPACIO CONFINADO', '6.1', 'Identificación, señalizacion e inventario de espacios confinados', false, 'N/A', NULL, 25)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e08c80ec-3bbd-419d-8e84-7508cbf42cec', 'H1 2026', 'Seguridad', 'ESPACIO CONFINADO', '6.2', 'Ejecucion segura de entrada en espacios confinados', false, '5', 'Capacitación de espacios confinados realizada. Entrevistas ok.', 26)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('aecba78a-a519-4d85-a791-06ba534b8815', 'H1 2026', 'Seguridad', 'PREVENCIÓN DE VIOLENCIA', '7.1', 'Gestión de dinero efectivo en ruta', false, '3', 'SOP documentado. Alrededor de un 50% de los PDVs manejan medios de pago en efectivo. Oportunidad: - Reforzar implementación de OWDs al proceso, entrenamientos y completar relevamiento de medios de pago en PDV a fin de impulsar PDA. - Ajustar SOP agregando el detalle del límite de billetes que pueden cargarse en la caja fuerte y plan de contingencias ante llenado de caja fuerte. - Reforzar, en los casos en los que sea posible, la gestión de migración de medios de pago en efectivo hacia medios de pago digitales, a fin de disminuir la manipulación de efectivo en ruta.', 27)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '89362c0a-6724-4b03-a651-d336a01cb0cb', id, 'Reforzar implementación de OWDs al proceso, entrenamientos y completar relevamiento de medios de pago en PDV a fin de impulsar PDA', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '68ff9a37-3bdc-49d0-8853-5db3e378405e', id, 'Ajustar SOP agregando el detalle del límite de billetes que pueden cargarse en la caja fuerte y plan de contingencias ante llenado de caja fuerte', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'aeab66e7-890f-4a6f-82cc-b3e46621765e', id, 'Reforzar, en los casos en los que sea posible, la gestión de migración de medios de pago en efectivo hacia medios de pago digitales, a fin de disminuir la manipulación de efectivo en ruta', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1df1720b-f0a0-4866-9b20-722653d7a891', 'H1 2026', 'Seguridad', 'PREVENCIÓN DE VIOLENCIA', '7.2', 'Ejecución segura de la prevención de la violencia', false, '3', 'SOP completo. Cuentan con cerco perimetral, sistema CCTV y alarma con sensor de movimiento. Cuentan con custodio de seguridad desde las 18 hasta las 7:30. Oportunidad: - Proyectar implementar botones antipánico en tesorería. - Implementar OWDs y completar entrenamientos. Incorporar más preguntas sobre prevención de violencia en OWDs de ruta.', 28)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e75aac7f-1a6c-44f4-a3cf-df0bff9b6cc6', id, 'Proyectar implementar botones antipánico en tesorería', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cba15c9d-d315-434a-bf89-8cfcbcf4d14f', id, 'Implementar OWDs y completar entrenamientos. Incorporar más preguntas sobre prevención de violencia en OWDs de ruta', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('db9fa325-577b-4d48-a8f5-776cbaf7d801', 'H1 2026', 'Seguridad', 'PREVENCIÓN DE VIOLENCIA', '7.3', 'Toolkit Violence Prevention', false, 'N/A', 'Toolkit completo al 60% nivel 1 y 60% nivel 2. Seguir traccionando PDA.', 29)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd1cd8319-bcce-4124-918d-ce19ae877f03', id, 'Seguir traccionando PDA', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='7.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('abb8ad5a-4420-471f-b362-2cd148eaeb40', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.1', 'Gestión de la calificacion de los conductores', false, '5', 'Buen seguimiento de licencias. Oportunidad: - Reforzar seguimiento de licencias de personal de T1 tercerizado fijo.', 30)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b1178ac6-b1f3-46f7-be2d-b06081be906e', id, 'Reforzar seguimiento de licencias de personal de T1 tercerizado fijo', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('398a848d-b7d8-4161-85bc-d3eae6ef1791', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.2', 'Gestión de rutas peligrosas', false, 'N/A', 'Se evidencia relevamiento en marcha de rutas de riesgo. Oportunidad: - Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en rutas de riesgo. - Implementar herramienta "MyMaps" o similar a fin de mejorar la visualización de riesgos en ruta y el acceso del personal a dicha información. - Registrar la totalidad de los PDA ante riesgos detectados en determinadas zonas (por ej: ventanas horarias, cambio de ruta, etc.).', 31)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0781a45c-72fc-424e-866c-b80cb8274da4', id, 'Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en rutas de riesgo', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1476da8d-c508-4fcc-875b-00232db5f1a0', id, 'Implementar herramienta "MyMaps" o similar a fin de mejorar la visualización de riesgos en ruta y el acceso del personal a dicha información', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bacc82da-7ea1-4009-bba3-eca0e05879b5', id, 'Registrar la totalidad de los PDA ante riesgos detectados en determinadas zonas (por ej: ventanas horarias, cambio de ruta, etc.)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4324c47d-4eee-4070-bae8-66aefd83dbc6', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.3', 'Ejecución segura de la conducción', false, 'N/A', 'Entrevistas ok. Tuvieron dos eventos de accidentabilidad en distribución. Oportunidad: reforzar implementación de OWDs en ruta, reporte de comportamientos y relevamiento telemétrico.', 32)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0379b742-1d72-45e0-a9b7-f9f090aea117', id, 'reforzar implementación de OWDs en ruta, reporte de comportamientos y relevamiento telemétrico', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5a680add-47ef-4376-9ab3-d32e057164e7', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.4', 'Gestión de telemetría', true, 'N/A', 'Cuentan con sistema de telemetría "Localiza", el cual mide solamente el control de velocidad y la ubicación satelital. Oportunidades: - Reforzar relevamiento de frenadas y giros bruscos, aceleraciones, uso de cinturón de seguridad, etc. - Reforzar registro de acciones realizadas a partir del análisis obtenido del seguimiento de telemetría (charlas 1a1, capacitaciones, análisis de tendencias, etc.). - Monitorear uso de cinturón de seguridad mediante OWDs. - Mapear desvíos en ruta detectados durante la aplicación de OWDs y ejecutar PDA en función a dichos desvíos. - Afianzar sinergia entre Seguridad y pilares Entrega y flota en este respecto.', 33)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4f18e5d8-0915-46a5-b51d-1964e8d9755f', id, 'Reforzar relevamiento de frenadas y giros bruscos, aceleraciones, uso de cinturón de seguridad, etc', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a86b1904-395e-4efe-96fc-707cd0497b97', id, 'Reforzar registro de acciones realizadas a partir del análisis obtenido del seguimiento de telemetría (charlas 1a1, capacitaciones, análisis de tendencias, etc.)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a46b4cec-3e61-4f52-bf39-11f6c64add1d', id, 'Monitorear uso de cinturón de seguridad mediante OWDs', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6e208c09-ce6b-4c55-bd8a-9c901097ae61', id, 'Mapear desvíos en ruta detectados durante la aplicación de OWDs y ejecutar PDA en función a dichos desvíos', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0d945947-a700-442e-97c2-787181402556', id, 'Afianzar sinergia entre Seguridad y pilares Entrega y flota en este respecto', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2b9ff8cb-ba41-489d-a3cf-476ac7b53ac3', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.5', 'Gestión de la jornada Laboral', true, 'N/A', 'No se observan desvíos de jornada en T2. Oportunidad: reforzar relevamiento de jornada de T1.', 34)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '98decaff-53a1-45e5-9ad4-b7e9fd73fb22', id, 'reforzar relevamiento de jornada de T1', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0c8fe71a-dd55-426c-8546-a2a09cc1d9d4', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.6', 'Gestión del control de pesos', true, 'N/A', 'Se realiza el control de cargas mediante los límites establecidos por WMS según la capacidad máxima de cada camión. Se evidencia seguimiento diario de cargas con comparativa de kg transportados y capacidad máxima. Oportunidad: - Adherirse al ruteo centralizado traccionado por CMQ a fin de garantizar la gestión completa del control de cargas y la optimización de entregas en ruta.', 35)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7a468b79-cf9a-4b46-b7bd-a166022ff2e8', id, 'Adherirse al ruteo centralizado traccionado por CMQ a fin de garantizar la gestión completa del control de cargas y la optimización de entregas en ruta', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('dbabf7ef-c940-42ae-8e9a-c37dd1787bbf', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.7', 'Gestión de la seguridad en los desplazamientos/ IN ITINERES', false, '5', 'Capacitación sobre accidentes in itínere realizada. No han tenido accidentes in itínere en el presente período. Entrevistas ok. Oportunidad: implementar gestión visual y entrega de flyers.', 36)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '85698bd5-31a7-4bdb-a393-fffa01723149', id, 'implementar gestión visual y entrega de flyers', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.7'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bb355f30-8d51-4a53-85b6-007c5c2a91c8', 'H1 2026', 'Seguridad', 'SEGURIDAD VIAL Y DE CONDUCCIÓN', '8.8', 'Toolkit seguridad vial', false, 'N/A', 'Se evidencia presentación mensual de Toolkit. Oportunidad: - Ajustar inconsistencias relacionadas a control de velocidad adaptativo (mide la distancia con respecto al vehículo que está en frente), airbags y sistema de electrónico de estabilidad, ya que no disponen de dichos elementos en la flota. - Documentar PDA.', 37)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7aad9ff9-6b01-4b7a-b579-455a3917e5b4', id, 'Ajustar inconsistencias relacionadas a control de velocidad adaptativo (mide la distancia con respecto al vehículo que está en frente), airbags y sistema de electrónico de estabilidad, ya que no disponen de dichos elementos en la flota', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.8'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c248ea4f-db6c-4dac-8cbf-fefef34c63d0', id, 'Documentar PDA', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='8.8'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e09e29e1-436f-4a80-9d27-d6acb81ffacd', 'H1 2026', 'Seguridad', 'TRABAJO EN ALTURA', '9.1', 'Protección de Trabajos en Altura', false, '3', 'SOP completo. No se registran trabajos en altura durante el presente período. Oportunidad: - Incorporar un arnés de seguridad al stock de EPP. - Efectuar control del arnés de seguridad y documentarlo. - Gestionar acceso seguro al techo e incorporar línea de vida.', 38)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f2e64e76-0ed1-4981-b2a2-fd7c88895966', id, 'Incorporar un arnés de seguridad al stock de EPP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '669313ba-85a5-493f-b6a8-9f8f36f972dd', id, 'Efectuar control del arnés de seguridad y documentarlo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '52c9be6c-f581-4e62-9e51-bb861c2b7c06', id, 'Gestionar acceso seguro al techo e incorporar línea de vida', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c89a7615-a9ef-450c-af47-713f330695c1', 'H1 2026', 'Seguridad', 'TRABAJO EN ALTURA', '9.2', 'Ejecución Segura de Trabajos en Altura', false, '3', 'SOP completo. Capacitación de trabajo en altura realizada. Oportunidad: - Incorporar arnés de seguridad al stock de EPP. - Efectuar control del arnés de seguridad y documentarlo. - Implementar OWD de trabajo en altura en caso de que dicho trabajo lo realice personal interno (o permiso de trabajo para personal tercerizado). - Reforzar evidencia documental (programa de seguridad en caso de corresponder, habilitación y documentación de plataformas elevadoras, etc).', 39)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'dfeacfee-4c99-4684-83d6-9b248c55f8ac', id, 'Incorporar arnés de seguridad al stock de EPP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4760fc10-a665-4572-a70b-06d5d73658ed', id, 'Efectuar control del arnés de seguridad y documentarlo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '745f3d95-09e6-4b36-b493-a94ab4b84eeb', id, 'Implementar OWD de trabajo en altura en caso de que dicho trabajo lo realice personal interno (o permiso de trabajo para personal tercerizado)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f59ebb2a-0d00-4408-a5bf-1f4897e3b625', id, 'Reforzar evidencia documental (programa de seguridad en caso de corresponder, habilitación y documentación de plataformas elevadoras, etc)', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='9.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2ab08bb5-733a-4388-88f8-4a1de923eb56', 'H1 2026', 'Seguridad', 'TRABAJO EN ALTURA', '9.3', 'Gestión de trabajos en techos', false, 'N/A', NULL, 40)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8abfe84e-e819-4ce1-964e-811cd7abb129', 'H1 2026', 'Seguridad', 'LOTO/SAM', '10.1', 'Ejecución segura de SAM', false, 'N/A', NULL, 41)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('82645b19-0d5c-49e4-a511-520f62a7f4b6', 'H1 2026', 'Seguridad', 'LOTO/SAM', '10.2', 'Ejecución segura de LOTO', false, '3', 'SOP LOTO completo. Capacitación sobre SAM/LOTO realizada. Permiso registrado por parte del contratista. Oportunidad: - Completar kit de bloqueo LOTO incorporando dispositivos de bloqueo de llaves térmicas.', 42)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '93dd557e-1132-4f49-a34a-5e2027d37e43', id, 'Completar kit de bloqueo LOTO incorporando dispositivos de bloqueo de llaves térmicas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='10.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f71f23ce-c2db-4c0a-b069-c8f7c80a63fe', 'H1 2026', 'Seguridad', 'LOTO/SAM', '10.3', 'Gestión de equipos LOTO', false, '3', 'Kit de bloqueo y etiquetado disponible e inventariado. Oportunidad: incorporar dispositivos de bloqueo de llaves térmicas.', 43)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a9b8a060-fa7e-4653-a233-fd2d5db514b7', id, 'incorporar dispositivos de bloqueo de llaves térmicas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='10.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b6c01736-f973-47cd-8168-2f6f962a7f61', 'H1 2026', 'Seguridad', 'SALUD OCUPACIONAL', '11.1', 'Notificación, investigación y gestión de las causas de las enfermedades profesionales', true, '3', 'Cruzan con pilar Gente en seguimiento de ausentismo y documentan enfermedades profesionales. Oportunidad: llevar adelante campañas de vacunación, deporte, prevención de adicciones, calentamiento previo a la jornada, pausas activas, etc.', 44)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6a53c501-cc49-4770-999c-53a2f9bd047c', id, 'llevar adelante campañas de vacunación, deporte, prevención de adicciones, calentamiento previo a la jornada, pausas activas, etc', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='11.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('32f9ed11-b05f-48f1-989e-bc06d1dff234', 'H1 2026', 'Seguridad', 'SALUD OCUPACIONAL', '11.2', 'Gestión de Mediciones Iluminación y Ruido', false, '5', 'Medición de ruido e iluminación completas, sin observaciones ni desvíos. Oportunidad: documentar conclusiones del estudio de iluminación, a pesar de obtener resultados conforme a la normativa.', 45)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '058b3ad4-0785-4793-9b7f-385bb29a19d4', id, 'documentar conclusiones del estudio de iluminación, a pesar de obtener resultados conforme a la normativa', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='11.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('19ff2005-39e0-4a99-bc1a-8021c6f054ba', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.1', 'Dispositivos médicos y botiquín de primeros auxilios', false, '3', 'Se cumple con al menos 1 botiquin en deposito y todos los camiones tienen 1 botiquin. Relevamiento de extintores y botiquines ok. Oportunidad: - Precintar la totalidad de los botiquines con precintos numerados fáciles de romper. - Incorporar DEA.', 46)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b0054d77-ee84-4126-a0da-d36af8026d89', id, 'Precintar la totalidad de los botiquines con precintos numerados fáciles de romper', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4a144dca-25e4-44ad-81b6-869f8fc3fd09', id, 'Incorporar DEA', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('fe197e06-574a-459d-ba98-3403109f3cbb', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.2', 'Gestión del sistema de prevención y protección contra incendios', true, '3', 'Carga de fuego realizada. Extintores en buen estado de mantenimiento (se relevan mensualmente), cartelería de emergencia ok, vías de evacuación libres de obstáculos, sistema de alarma centralizada implementado. Números de emergencia gestionados a la vista. Cuentan con luces LED de emergencia. Oportunidad: - Remover material combustible sobre el que se apoya el tambor de diesel. Verificar posibilidad de reposicionar el sector de carga de diesel en el exterior. - Incluir en carga de fuego el detalle del poder calorífico del litio. - Incorporar extintor para litio en sector de carga de baterías (F500 o clase L). - Gestionar a la vista números de emergencia en garita de Seguridad.', 47)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0be0ef7a-52c8-4b54-a46c-2d0cd069b7bc', id, 'Remover material combustible sobre el que se apoya el tambor de diesel. Verificar posibilidad de reposicionar el sector de carga de diesel en el exterior', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '53b6dea3-f233-46a7-ae22-824cf22151cc', id, 'Incluir en carga de fuego el detalle del poder calorífico del litio', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '65f8dfcb-15b1-409a-acc2-6834e54c7728', id, 'Incorporar extintor para litio en sector de carga de baterías (F500 o clase L)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9a6d7209-1dda-4731-bc13-98f7876caa8c', id, 'Gestionar a la vista números de emergencia en garita de Seguridad', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('976f5f9e-d040-44e5-85c3-c4acfd06e860', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.3', 'Plan de Respuesta a Emergencias', false, '3', 'Plan de respuesta ante emergencia documentado. Oportunidad: - Incorporar hipótesis de emergencias y procedimiento de actuación ante situaciones de explosión y transmisión de enfermedades pandémicas.', 48)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c8aece61-38cf-4132-b810-915b7d10ccfe', id, 'Incorporar hipótesis de emergencias y procedimiento de actuación ante situaciones de explosión y transmisión de enfermedades pandémicas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('58ba6a44-9ff6-4602-a578-51c51722ad76', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.4', 'Gestión especializada de Respuesta a Emergencias', false, '5', 'Cuentan con brigada de emergencias. Gestionaron a la vista la identificación de los mismos con nombre y apellido, foto identificatoria y rol a cumplir. Se evidencia conocimiento del personal sobre quienes conforman la brigada.', 49)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('71b1f278-147d-4e36-b2e9-b78c6b9793fc', 'H1 2026', 'Seguridad', 'RESPUESTA ANTE EMERGENCIAS', '12.5', 'Gestión de Simulacros de Respuesta a Emergencias', false, '3', 'Se evidencia simulacro realizado durante 28-04. Participación del 83% en logística. Informe de simulacro documentado con oportunidades de mejora detectadas. Oportunidades: - Avanzar en el cumplimiento de las oportunidades de mejora detectadas durante la realización del ejercicio. - Aspirar a alcanzar el 90% de participación por sector.', 50)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1df510a9-7e50-4be3-b1bb-73e2db5f9111', id, 'Avanzar en el cumplimiento de las oportunidades de mejora detectadas durante la realización del ejercicio', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '967f2334-2fe4-4356-b338-b9b9a499437d', id, 'Aspirar a alcanzar el 90% de participación por sector', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='12.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('95f35528-4292-47e4-aa6c-686ddd87c4d4', 'H1 2026', 'Seguridad', 'FORMACIÓN Y COMPETENCIA', '13.1', 'GESTION DE ENTRENAMIENTOS', false, '1', 'Se gestiona el PAC de manera centralizada desde el pilar de Gente. Oportunidad: - Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador. - Seguir reforzando el avance del calendarizado. - Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones.', 51)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '412c4e75-df6a-408d-ad7d-b52c14c268de', id, 'Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd67762f0-d54b-4d1e-baba-e922af5af63f', id, 'Seguir reforzando el avance del calendarizado', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fdc84999-3ffc-4572-88ad-c05f5ecf827a', id, 'Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b66f270c-5d1c-4d55-9aff-f65172e3b5a7', 'H1 2026', 'Seguridad', 'FORMACIÓN Y COMPETENCIA', '13.2', 'Gestión de Entrenamientos Calificados', true, '0', 'Oportunidad: - Reforzar registro de capacitaciones mandatorias para empleados calificados. - Medir porcentaje de asistencia de manera individualizada por capacitación especializada y aspirar a alcanzar el 100% en dicho indicador. - Seguir reforzando el avance del calendarizado. - Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones.', 52)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '36339db1-bd1f-4c68-9c95-4066676935b2', id, 'Reforzar registro de capacitaciones mandatorias para empleados calificados', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a1fce796-59f9-43f3-8f74-17e650ea41a4', id, 'Medir porcentaje de asistencia de manera individualizada por capacitación especializada y aspirar a alcanzar el 100% en dicho indicador', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c186e2df-66cd-47f1-a01f-0a0cd7c93bee', id, 'Seguir reforzando el avance del calendarizado', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '565d2389-e47c-4c7e-bc66-23970965e73c', id, 'Fomentar participación de los líderes en cuanto a la selección de temáticas a reforzar en capacitaciones', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='13.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e6973ade-b520-4481-8846-a31ce9f78171', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.1', 'Gestión de inventarios', true, '3', 'Control de inventario documentado mediante herramienta digital. Oportunidad: - Incorporar control de stock de EPP.', 53)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '12f8423a-f904-4583-ab24-15b410d45ae7', id, 'Incorporar control de stock de EPP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('698600b5-04c6-404c-8259-a114143de727', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.2', 'Gestión de la evaluación de riesgos', true, '3', 'ER realizada. Entrevistas ok. Oportunidad: adaptar a formato estándar CMQ.', 54)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'da2d40da-3477-4452-988c-d7149239aa98', id, 'adaptar a formato estándar CMQ', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('67a6a85a-9bc1-44ec-9089-e330e396533d', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.3', 'Gestión de la evaluación del PDV', false, 'N/A', 'Se evidencia un relevamiento de PDVs en marcha (aprox. el 30% de los PDVs relevados). Oportunidad: - Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en PDVs. - Registrar la totalidad de los PDA ante riesgos detectados en determinados PDVs.', 55)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'df1f455d-b578-4433-a042-4099aa9f1eb1', id, 'Seguir incrementando la participación e imput de choferes y preventistas mediante forms de reporte de aspectos relevados en PDVs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fd910d1f-3cf0-4f7f-8a1e-ef1f481fe157', id, 'Registrar la totalidad de los PDA ante riesgos detectados en determinados PDVs', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9485b4fd-e07c-4690-a444-c9d683bf986f', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.4', 'Gestión de elementos de protección personal', false, '3', 'Se evidencia correcta gestión documental Res. 299. Matriz de EPP completa. Cuentan con guantes anticorte en depósito. Oportunidad: - Reforzar análisis de tendencias en cuanto a la falta de uso de EPP por sector (cruzar con gráfico de torta de comportamientos inseguros). - Seguir reforzando reporte de comportamientos inseguros y PDA ante falta de uso de EPP. - Incorporar máscara facial y mangas anticorte para la manipulación de litro.', 56)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd38008dd-5a15-4f63-abec-6dc712018e0c', id, 'Reforzar análisis de tendencias en cuanto a la falta de uso de EPP por sector (cruzar con gráfico de torta de comportamientos inseguros)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '094a8bd4-3043-4bc6-97cb-6d52c22815a0', id, 'Seguir reforzando reporte de comportamientos inseguros y PDA ante falta de uso de EPP', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1fcbf467-0da3-4de3-b7ff-fb7aba57133a', id, 'Incorporar máscara facial y mangas anticorte para la manipulación de litro', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e99ec265-10b6-4f92-9842-1e6b44f87087', 'H1 2026', 'Seguridad', 'GESTIÓN DE LA SEGURIDAD OPERACIONAL', '14.5', 'Rutina de seguridad MCRS', false, '0', 'Implementar rutina semanal de seguridad con mandos medios. Abordar temáticas referidas en requerimiento 1. Llevar PDA mediante App DPO con trazabilidad de cumplimiento de dichas acciones con responsable, fecha de cumplimiento, status, etc.', 57)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '148872ae-c2ac-4121-896f-2ad9916aa6bc', id, 'Implementar rutina semanal de seguridad con mandos medios (MCRS), abordando las temáticas del requerimiento 1', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '914e0c1a-4c11-41db-9e9c-1db1cc5857f6', id, 'Llevar PDA mediante App DPO con trazabilidad de cumplimiento (responsable, fecha, status)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='14.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d505e0c6-77aa-4dc2-acb2-a52e7d975dea', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.1', 'Gestión de inducción de visitantes', true, '5', 'Implementan proceso de inducción a visitas y registro de las mismas. Cuentan con test de conocimiento a fin de validar la efectividad de la inducción.', 58)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e79b6f93-360a-43c8-8844-a10b94d8ea51', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.2', 'Gestión de inducción de contratistas', false, '5', 'Implementan proceso de inducción de contratistas y registro documental. Implementan test de conocimiento a fin de validar la efectividad de la inducción. Solicitan clásula de no repetición contra Distribuidora Mercosur Región Pampeana en Seguros de vida obligatorios y ART (en caso de personal bajo relación de dependencia) y en Seguros de accidentes personales (en caso de personal monotributista).', 59)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f949ca43-9791-4068-a187-7a51eebef4c6', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.3', 'Gestión de grandes obras', false, '1', 'No han tenido trabajos que requieran la aprobación de un PS. Oportunidad: - Afianzar la comunicación entre gerencia y referente de Seguridad en lo relacionado a obras o tareas proyectadas a realizarse, a fin de gestionar la documentación con anterioridad a la realización de los trabajos. - Desarrollar SOP con la gestión de aprobación de Programas de Seguridad y para qué casos aplica (resoluciones 35, 51, 61, 503, 550, 319).', 60)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd4e6b566-f3b5-41c0-a8d7-fe921f40a647', id, 'Afianzar la comunicación entre gerencia y referente de Seguridad en lo relacionado a obras o tareas proyectadas a realizarse, a fin de gestionar la documentación con anterioridad a la realización de los trabajos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='15.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b19b21af-5188-405c-9ff1-e9c1aa564034', id, 'Desarrollar SOP con la gestión de aprobación de Programas de Seguridad y para qué casos aplica (resoluciones 35, 51, 61, 503, 550, 319)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='15.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('74e2ec62-7e4d-42e7-aaeb-063c61cdca27', 'H1 2026', 'Seguridad', 'GESTIÓN DEL TRABAJO NO ESTÁNDAR', '15.4', 'Gestión de permisos de trabajo', true, '5', 'Se evidencian permisos de trabajo firmados.', 61)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4ecc600c-6112-4e47-9497-253a18124ddf', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.1', 'Preguntas en la encuesta de Cultura de Seguridad', false, '3', 'Se evidencia participación en la encuesta de Cultura de Seguridad. Seguir traccionando PDA a fin de evidenciar mejoras en la presente dimensión.', 62)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '78537d46-1431-433e-8bd5-8e4a19a07c33', id, 'Seguir traccionando PDA a fin de evidenciar mejoras en la presente dimensión', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('798b9340-cb65-41a9-bb6d-0e3c2a581443', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.2', 'Liderazgo en seguridad conductual', false, '3', 'Participaron de taller OLT y safe together. Oportunidad: cascadear material visto en taller al personal de Gerencia y mandos medios a fin de afianzar la implementación de la Seguridad como valor en todos los niveles de la distribuidora.', 63)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f070fe7c-22a1-4b08-a294-b2baee056caf', id, 'cascadear material visto en taller al personal de Gerencia y mandos medios a fin de afianzar la implementación de la Seguridad como valor en todos los niveles de la distribuidora', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e715d0bd-b24b-4a9b-b0df-9c3c87790674', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.3', 'Campeones de seguridad', false, '3', 'Campeón de Seguridad designado para almacén. Oportunidad: - Seguir reforzando participación y colaboración de la operación en lo relativo a la seguridad (asistencia a capacitaciones, asistencia a comité de seguridad, revisión de checks, reporte de condiciones y comportamientos, monitoreos de seguridad, etc.). - Gestionar selección de campeón de Seguridad en el área de distribución.', 64)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f4e150c2-8325-48c1-859b-99ce09dcf33f', id, 'Seguir reforzando participación y colaboración de la operación en lo relativo a la seguridad (asistencia a capacitaciones, asistencia a comité de seguridad, revisión de checks, reporte de condiciones y comportamientos, monitoreos de seguridad, etc.)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd3b90a96-7d97-4dd9-ae8c-ee9282b95848', id, 'Gestionar selección de campeón de Seguridad en el área de distribución', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5cf6a539-b92d-4e70-a89e-d6a3acc74561', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.4', 'Comité de Seguridad', false, '3', 'Se ejecuta la dinámica del comité de Seguridad de forma trimestral. Se registran los PDA en herramienta digital (App DPO). Incluyen personal operativo a la instancia. Oportunidad: reforzar cumplimiento de PDA, darle continuidad.', 65)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'aac5f060-45eb-4110-bcf4-6e24ff102e58', id, 'reforzar cumplimiento de PDA, darle continuidad', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Seguridad' AND numero='16.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bd739a6d-a41c-4232-b4b1-390d247d51b8', 'H1 2026', 'Seguridad', 'GESTIÓN DEL COMPORTAMIENTO', '16.5', 'Semana Mundial de la Seguridad', false, '5', 'Se evidencia adherencia a campañas HSMA.', 66)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e39921c5-37bc-436d-b68a-66488d701bfe', 'H1 2026', 'Gente', 'CULTURA', '1.1', 'El distribuidor cuenta con Principios desarrollados? ¿Los Principios de Cultura del DISTRIBUIDOR son incorporados y comprendidos?', false, '3', 'Desarrollaron principios de cultura y cascadearon al personal mediante capacitación. Comenzaron a vincular los PIs/KPIs o tareas diarias con los distintos principios. Implementaron cartelera con espacio en blanco para bajar a tierra los conceptos a la operación. Oportunidades: - Seguir reforzando el conocimiento de la operación sobre principios de cultura. - Seguir potenciando el rol de embajador de cultura.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd4c92cc7-ce8b-4d75-9f1b-cf23e0096a6d', id, 'Seguir reforzando el conocimiento de la operación sobre principios de cultura', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '93f7a859-3a44-43c9-ab3b-6a74c7bca3da', id, 'Seguir potenciando el rol de embajador de cultura', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('434edd66-4640-4696-bb55-50a14bdd2012', 'H1 2026', 'Gente', 'RECLUTAMIENTO Y SELECCIÓN', '2.1', '¿Qué tan efectivo es el DISTRIBUIDOR para atraer talento?', false, '5', 'SOP de reclutamiento y selección desarrollado. Completaron capacitación de sesgos inconscientes. Perfiles de puestos desarrollados (incluyen EPPs por puesto y detalle de KPIs/PIs). Documentan seguimiento de las contrataciones, incluyendo detalle sobre: puesto a cubrir, fecha de apertura de vacante, fuente de búsqueda, fecha de cierre de vacante, días transcurridos, etc. Implementan seguimiento documental de CVs. Plan de demanda/presupuesto de dotación desarrollado y cruzado con simulador de dimensionamiento. Actividades de marca empleadora ok.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('cfe09095-23d0-48b7-8b68-ce7a2b746bef', 'H1 2026', 'Gente', 'RECOMPENSAS Y RECONOCIMIENTO', '3.1', '¿Qué tan efectiva es la Estrategia de Recompensas y Reconocimientos del DISTRIBUIDOR ?', false, '3', 'Esquema de reconocimientos por cumplimiento de objetivos implementado mensualmente. Cuentan con un pack de beneficios disponible. Política salarial establecida. Objetivos/targets definidos para mandos medios, con seguimiento del avance mensual y PDA ante desvíos del target. Entrevistas ok. Oportunidad: - Documentar seguimiento mensual de la evolución de los indicadores en función a la implementación de 3R, a fin de evidenciar el repago obtenido a partir de su mejora. - Rotar indicadores seleccionados para la dinámica a fin de ir puntualizando sobre aquellos que se deban potenciar (indicadores críticos).', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '02f1e724-731f-4798-8007-d36c4c892681', id, 'Documentar seguimiento mensual de la evolución de los indicadores en función a la implementación de 3R, a fin de evidenciar el repago obtenido a partir de su mejora', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '97e7f5a3-0e0d-47e4-a8f0-1df4b502545b', id, 'Rotar indicadores seleccionados para la dinámica a fin de ir puntualizando sobre aquellos que se deban potenciar (indicadores críticos)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('46a0b46d-6d3e-42c5-8392-5ffc71a54c47', 'H1 2026', 'Gente', 'ESTRATEGIA DEL PAC', '4.1', '¿La Estrategia de Aprendizaje está conectada con la Estrategia de Negocio y activa una Cultura Activa de Aprendizaje?', true, '1', 'El PAC 2026 se encuentra calendarizado. Listado de capacitaciones disponible. Oportunidad: - Reforzar seguimiento del avance del calendarizado de capacitaciones (adherencia al gantt), aspirar a alcanzar el 90% de cumplimiento a final del año. - Incluir relevamiento del porcentaje de avance del calendarizado YTD al seguimiento del PAC. - Disponibilizar recursos y tecnología para el dictado de capacitaciones y acceso del personal al material de dichas capacitaciones.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd12d27a5-17fc-4752-9f26-ff323e7ac09f', id, 'Reforzar seguimiento del avance del calendarizado de capacitaciones (adherencia al gantt), aspirar a alcanzar el 90% de cumplimiento a final del año', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4ad2fb97-62b4-4eee-85d3-21a885e50fa3', id, 'Incluir relevamiento del porcentaje de avance del calendarizado YTD al seguimiento del PAC', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8d854378-6336-44d4-a72a-2c793947fb71', id, 'Disponibilizar recursos y tecnología para el dictado de capacitaciones y acceso del personal al material de dichas capacitaciones', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a2de6138-3758-43f0-8832-b37b54db9744', 'H1 2026', 'Gente', 'SEGUIMIENTO DE LA ASISTENCIA A LAS CAPACITACIONES', '4.2', '¿Existe un seguimiento de asistencia efectivo y acciones antes desvios para asegurar la mejora contínua en la competencia de los colaboradores?', true, '1', 'Se evidencia seguimiento consolidado de la asistencia a capacitaciones. Implementan test de conocimiento. Oportunidad: - Documentar todos los test de validación conceptual e individualizar los resultados, a fin de recapacitar al personal que desapruebe los mismos. - Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador. - Estandarizar gestión de capacitaciones, a fin de consolidar la información del dictado de cada capacitación y garantizar un seguimiento por pilar de su desarrollo.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'db0ef835-3b5a-4e32-b009-f52372fa62fa', id, 'Documentar todos los test de validación conceptual e individualizar los resultados, a fin de recapacitar al personal que desapruebe los mismos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c35181dc-cc02-436e-833e-2c65183ca0bd', id, 'Medir porcentaje de asistencia de manera individualizada por capacitación y aspirar a alcanzar el 90% en dicho indicador', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd9c29cee-c437-4d23-b4e4-cbb5c49618d5', id, 'Estandarizar gestión de capacitaciones, a fin de consolidar la información del dictado de cada capacitación y garantizar un seguimiento por pilar de su desarrollo', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('dec1b3c2-4138-4198-b943-d51d7c2aefc8', 'H1 2026', 'Gente', 'INDUCCIONES', '4.3', '¿Se completó el proceso de inducción tanto para los nuevos miembros como para los que cambiaron de PUESTO DE trabajo para que se integren en la cultura de ABI y entreguen resultados rápidamente?', true, '3', 'SOP de inducciones desarrollado. No tuvieron ingresos en el presente período. Incluyen principios de cultura dentro del onboarding. Dentro de la inducción funcional se repasa la DP y se mapean los indicadores relacionados a su puesto. Oportunidades: - Implementar dinámica de padrinos/buddies en potenciales próximos ingresos. - Implementar feedback entre padrino y ahijado (durante la primera semana y al finalizar el proceso). - Apuntar a alcanzar el nivel 4 de SKAP en potenciales padrinos.', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '86fe5e5f-7e08-45ed-9f17-e4460fde23cc', id, 'Implementar dinámica de padrinos/buddies en potenciales próximos ingresos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cb8214ac-8e84-4bac-ba65-7505ea61008f', id, 'Implementar feedback entre padrino y ahijado (durante la primera semana y al finalizar el proceso)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd6972bed-f134-4757-b990-2a935890a232', id, 'Apuntar a alcanzar el nivel 4 de SKAP en potenciales padrinos', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0a939b97-b6ab-4fd6-a066-53e6d2a39c5b', 'H1 2026', 'Gente', 'SKAP', '4.4', '¿Qué tan bien se utiliza el Proceso de adquisición de habilidades (SKAP) para mejorar a nuestros equipos e impulsar la autonomía y los resultados?', true, '3', 'Implementaron matríz de habilidades para la totalidad de la operación. Se registran PDA ante oportunidades de mejora detectadas en SKAP, incluyendo: detalle, responsable, fecha de cumplimiento y status. Entrevistas ok. Oportunidades: - Se sugiere hacer uso de herramientas digitales a fin de que cada operario pueda acceder a visualizar su status de avance en SKAP (mediante herramienta Linktree, chatbot o similar). - Evidenciar cruce de información con resultados obtenidos en matriz SKAP. - Evidenciar avance en el cumplimiento de los PDA.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '51b14150-10c2-4b03-9db7-7d8ec1e03f07', id, 'Se sugiere hacer uso de herramientas digitales a fin de que cada operario pueda acceder a visualizar su status de avance en SKAP (mediante herramienta Linktree, chatbot o similar)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '25eeaa37-f311-4706-8aad-00415c207a64', id, 'Evidenciar cruce de información con resultados obtenidos en matriz SKAP', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4908c720-1ed3-4c0f-9be7-af007d4f908c', id, 'Evidenciar avance en el cumplimiento de los PDA', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d861f6ad-b8e2-4b76-aa0a-7a28290646e3', 'H1 2026', 'Gente', 'KPI AUSENTISMO', '5.1', '¿El Distribuidor tiene una gestión del ausentismo?', true, '3', 'Se excluyen las licencias prolongadas o planificadas. Se evidencia comparativa vs AA. No contemplan en ausentismo las licencias por ART que ya se estén mapeando dentro del indicador TRI. Oportunidad: - Corregir discrepancias detectadas entre el seguimiento interno y el reporte en planilla de GKPIs del drive (mes de abril). - Reforzar relevamiento de jornada del personal de T1.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8600d226-4bd9-4b74-9a7f-0d1c35667c4d', id, 'Corregir discrepancias detectadas entre el seguimiento interno y el reporte en planilla de GKPIs del drive (mes de abril)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9fd4c01e-e209-4285-94bd-e7b1694aa68d', id, 'Reforzar relevamiento de jornada del personal de T1', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ec5bfc91-8250-4087-a5e9-9962bdc9856a', 'H1 2026', 'Gente', 'ENGAGEMENT', '5.2', '¿Es el Ambiente de Trabajo Seguro e Inclusivo?', true, '3', 'Adheridos a instancias People. 100% logística y 98% total empresa obtenido en última encuesta. Entrevistas ok. Oportunidad: - Reforzar abordaje sobre Seguridad Psicológica (avanzar en cuanto a cursos incluidos en app Humand, capacitaciones internas y reforzar comunicación de los equipos y el rol de los líderes). - Avanzar en el cumplimiento de los PDA derivados de la última encuesta.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '162e9220-0acb-47c0-b324-b3ec9d18df04', id, 'Reforzar abordaje sobre Seguridad Psicológica (avanzar en cuanto a cursos incluidos en app Humand, capacitaciones internas y reforzar comunicación de los equipos y el rol de los líderes)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1659ffb7-46f9-4164-897e-993736f54dd0', id, 'Avanzar en el cumplimiento de los PDA derivados de la última encuesta', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0691111e-5eeb-4ae9-91e9-a9740c7e67c1', 'H1 2026', 'Gente', 'PLAN DE COMUNICACIÓN', '5.3', '¿Qué tan efectivo es el Plan de Comunicación del distribuidor?', false, '3', 'Cuentan con cronograma de comunicaciones documentado. Oportunidad: - Seguir reforzando gestión visual. - Reforzar la participación del personal en cuanto a actualizaciones del plan de comunicación generando instancias de feedback. Potenciar el "Por qué" de cada evento. - Potenciar uso de la herramienta Humand.', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6c2b7193-f063-4695-9a73-9733b8c194f0', id, 'Seguir reforzando gestión visual', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ed46c5d6-c0c5-4a71-81c1-a2bf69362b1e', id, 'Reforzar la participación del personal en cuanto a actualizaciones del plan de comunicación generando instancias de feedback. Potenciar el "Por qué" de cada evento', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd74c505a-c53c-40df-a087-90d47b440e83', id, 'Potenciar uso de la herramienta Humand', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('486586fa-3fb7-44c2-b1e0-cae5ccf446c3', 'H1 2026', 'Gente', 'ENTORNO LABORAL', '5.4', '¿Qué tan bien está empoderando el DISTRIBUIDOR a sus equipos para garantizar que tengan las condiciones adecuadas para hacer su trabajo?', false, '1', 'Se observan condiciones adecuadas en las instalaciones. Cuentan con herramienta de relevamiento y reporte de cuestiones relacionadas a servicios generales a fin de monitorear el avance periódicamente y realizar ajustes previos a las instancias de encuestas (escucha activa). Oportunidad: - Potenciar uso de herramienta de reporte de SSGG. - Lograr consolidar una operación capacitada para abordar los problemas de SSGG de forma autónoma (arreglo de cuestiones simples referidas a SSGG).', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '98e803e2-4ade-4aac-b9d2-a3c17005d4cd', id, 'Potenciar uso de herramienta de reporte de SSGG', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b51bf62e-6927-47fb-a3d3-1e544165cd0a', id, 'Lograr consolidar una operación capacitada para abordar los problemas de SSGG de forma autónoma (arreglo de cuestiones simples referidas a SSGG)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='5.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('381f2e3b-1b4a-4fd2-a9f9-8942852504f9', 'H1 2026', 'Gente', 'NEGOCIACION SINDICAL', '5.5', '¿Qué tan efectivo es el DISTRIBUIDOR al asociarse con Relaciones Laborales (sindicatos) para impulsar la autonomía?', false, '5', 'SOP documentado. Documentan PDA derivados de negociaciones sindicales. Seguir trabajando en forjar relaciones positivas con sindicatos a fin de apalancar los procesos.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('33a5c4f2-58c7-4c29-8557-1078b8ace119', 'H1 2026', 'Gente', 'TALENTO Y CRECIMIENTO', '6.1', '¿Están mejorando los procesos y se ve reflejado en el ambiente laboral?', false, '3', 'Adheridos a instancias People en cuanto a evaluaciones de desempeño. Proceso de OPR desarrollado, dar curso al feedback. Oportunidades: - Realizar seguimiento de trayectoria del personal con posibilidades de ascenso. - Formalizar plan de carrera/mapeo de reemplazos. - Registrar seguimiento y monitoreo mensual o bimestral de los PDA derivados de las evaluaciones de desempeño. - Garantizar que los PDA desarrollados sean medibles. - Reforzar avance de PDA cargados en Humand. - Evidenciar cruce de información con resultados obtenidos en matriz SKAP.', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '81ccc0d7-6495-4b3a-b4b1-d9075398c65a', id, 'Realizar seguimiento de trayectoria del personal con posibilidades de ascenso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '138a1462-4c62-4f70-938a-b33ce346a0f4', id, 'Formalizar plan de carrera/mapeo de reemplazos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f70c36e5-975c-4541-851a-298ffe49fb29', id, 'Registrar seguimiento y monitoreo mensual o bimestral de los PDA derivados de las evaluaciones de desempeño', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '18731f08-12b6-414b-a314-c8548b6e8cee', id, 'Garantizar que los PDA desarrollados sean medibles', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5dc45647-0ebf-4767-8d3e-be4c74130a80', id, 'Reforzar avance de PDA cargados en Humand', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '45ca08bf-f914-40af-aa57-84d525193941', id, 'Evidenciar cruce de información con resultados obtenidos en matriz SKAP', 6 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6af0d91e-fa6b-4c34-8ccf-7899d39341fb', 'H1 2026', 'Gente', 'KPI TURNOVER', '6.2', '¿El Distribuidor tiene una gestión del Turnover?', false, '3', 'Realizan seguimiento del indicador. No consideran re-estructuración ni finalización de contrato dentro de la medición del indicador. Implementan entrevistas de salida por medio de Humand y registran PDA. Oportunidades: - Documentar entrevistas de permanencia e implementar PDA ante potenciales causales de salida detectadas en dicha instancia. - Avanzar en el cumplimiento de los PDA derivados de las entrevistas de salida. - Ajustar Headcount que figura en reporte de SKPIs (36 GKPIs vs 35 seguimiento interno).', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3d1768ec-a8c0-46be-a4e8-11ea71e6c541', id, 'Documentar entrevistas de permanencia e implementar PDA ante potenciales causales de salida detectadas en dicha instancia', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a13b3fe1-830d-417e-9106-3fa1e817c1d1', id, 'Avanzar en el cumplimiento de los PDA derivados de las entrevistas de salida', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3d146b46-2398-4a1e-88f5-0496a12ab2da', id, 'Ajustar Headcount que figura en reporte de SKPIs (36 GKPIs vs 35 seguimiento interno)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('458acaec-cbe4-481e-bb34-03d8b4901478', 'H1 2026', 'Gente', 'EQUIPOS AUTÓNOMOS', '7.1', '¿Qué tan efectivo es el distribuidor para empoderar a los equipos autónomos?', false, '1', 'Se evidencia buena participación de la operación en las rutinas. Se encuentran en fase 3. Entrevistas ok. Oportunidad: - Concluir PDA y fases del cuadro de autonomía segregado por área. - Seguir potenciando autonomía de equipos. - Potenciar la implementación de herramientas como 3R y SKAP a fin de seguir afianzando el perfil del personal. - Reforzar cultura de Seguridad, aumentando el reporte de CS/CS desde la operación.', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '57a7ba83-ca33-42fb-af3d-e7e4cdee8c3d', id, 'Concluir PDA y fases del cuadro de autonomía segregado por área', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1fb192ef-c6dc-4b2b-938d-ed5b375bd045', id, 'Seguir potenciando autonomía de equipos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7fc59cbb-5a09-40be-94d6-7e194b85524b', id, 'Potenciar la implementación de herramientas como 3R y SKAP a fin de seguir afianzando el perfil del personal', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0b56cfbc-6f6d-4b5e-96d5-8bc558eb842f', id, 'Reforzar cultura de Seguridad, aumentando el reporte de CS/CS desde la operación', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e4ebc086-cf4e-4762-a889-e75dce5ed6a7', 'H1 2026', 'Gente', 'COMITÉ DE GENTE LOGISTICO', '7.2', '¿El Comité de Gente Logistico se asegura de que las personas trabajen juntas para permitir y capacitar a los equipos para impulsar los resultados?', true, '3', 'Desde junio-26 implementan rutina de Comité de Gente Logístico según formato estándar cargado en CAMPUS y llevan PDA mediante herramienta digital. Oportunidades: - Dar continuidad a la dinámica. - Profundizar seguimiento del farol de indicadores de los distintos pilares. - Tratar avances sobre evaluaciones de desempeño en dicha instancia. - Llevar PDA mediante herramienta digital (App DPO) e incluir fecha límite de cumplimiento de dichas acciones, visibilizando el semáforo con el status de cumplimiento.', 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e9f4745d-b299-4dec-a053-1461786d9849', id, 'Dar continuidad a la dinámica', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7ad731ee-14b7-4eaf-9718-0c9c7b5c488f', id, 'Profundizar seguimiento del farol de indicadores de los distintos pilares', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0c14aac6-7551-4d17-86ec-11365b8901cf', id, 'Tratar avances sobre evaluaciones de desempeño en dicha instancia', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '71b43f6a-1d70-4b61-aebe-8a76e6c9c9f6', id, 'Llevar PDA mediante herramienta digital (App DPO) e incluir fecha límite de cumplimiento de dichas acciones, visibilizando el semáforo con el status de cumplimiento', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gente' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9bad10fb-80be-4a32-8df9-5992b923719d', 'H1 2026', 'Gestión', 'STRATEGY', '1.1', 'Compliance', true, '5', 'Ok, cuentan con línea ética vigente y los empleados están al tanto de ella.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('623aa6bd-fadc-4b5e-8cf5-c2e323806c61', 'H1 2026', 'Gestión', 'STRATEGY', '1.2', 'Definición del sueño', false, '3', 'Tener como Pis críticos aquellos que los operarios pueden cambiar para mejorar el KPI central. Oportunidad: aperturar KPI de seguridad tanto como almacén como para distribución. Entrega: revisar cascadeo hasta ultimo nivel de operación. Reforzar conocimiento de la operación sobre KPIs criticos y como sus actividades diarias influyen en los objetivos del distribuidor a nivel estrategico.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd834c78a-a896-4fdd-9294-02d7ea6b0c1d', id, 'aperturar KPI de seguridad tanto como almacén como para distribución', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd625766e-b1c6-4f66-9615-170aa5a8a2a3', id, 'Entrega: revisar cascadeo hasta ultimo nivel de operación', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8dcb1ff7-815d-41b0-9cb8-6edf40ec76b6', id, 'Reforzar conocimiento de la operación sobre KPIs criticos y como sus actividades diarias influyen en los objetivos del distribuidor a nivel estrategico', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e4fa2213-1883-458f-a016-5677061a25ba', 'H1 2026', 'Gestión', 'STRATEGY', '1.3', 'Definición de objetivos estratégicos', false, '3', NULL, 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('f510ebeb-736e-479c-aa4f-e2589a2d04e4', 'H1 2026', 'Gestión', 'BUSINESS AND PROCESSES MAPPING', '2.1', 'Descripción de negocio', false, '5', 'Ok, bien desarrollado la descripción de negocio obteniendo KPIs críticos en base a la matriz de criticidad.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('101b88fe-f2a2-424b-9a17-9700e4682f53', 'H1 2026', 'Gestión', 'BUSINESS AND PROCESSES MAPPING', '2.2', 'Mapeo de procesos', false, '3', 'Continuar trabajando en el mapa de procesos, desarrollando todas las tareas de las actividad crítica e identificar la tarea crítica.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '55294657-c0aa-4ae1-a6a1-ebf9323b8ee8', id, 'Continuar trabajando en el mapa de procesos, desarrollando todas las tareas de las actividad crítica e identificar la tarea crítica', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('71f23ab4-6a16-4964-b92d-77fd390dbd2b', 'H1 2026', 'Gestión', 'BUSINESS AND PROCESSES MAPPING', '2.3', 'Indicadores de productos y procesos', true, '0', 'Desarrollar arból de KPIs', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f0b6a20c-61ca-4e9c-bb9b-891f6c8ed9bf', id, 'Desarrollar arból de KPIs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4afdf4da-3a7d-4b3b-bea9-954303a14dc6', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.1', '5S (Standarize)', true, '3', 'Continuar trabajando con la implementación de 5S en las distintas áreas del almacén.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'cbfa82e9-f87a-437d-acae-6994ba21506e', id, 'Continuar trabajando con la implementación de 5S en las distintas áreas del almacén', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6ff4ffff-aeac-4459-9910-a4718dc45221', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.2', 'Estandarización & Entrenamientos (Standarize)', false, '3', 'Seguir con el proceso de estandarización y entrenamientos. Bien desarrollados los SOPs.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3ab3fe3c-735f-4b3d-84d8-602f7a0d00ab', id, 'Seguir con el proceso de estandarización y entrenamientos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('6ad9771c-27db-4663-b2f8-5026b8b3971c', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.3', 'Diagnóstico de Trabajo Operativo (OWD/DTO) (DO)', false, '3', 'Continuar implementando OWDs para los distintos procesos y los distintos operarios. Definir acciones correctivas en caso de incumplimiento.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7058c5e3-33b8-4662-a197-6789e6b3e340', id, 'Continuar implementando OWDs para los distintos procesos y los distintos operarios', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e9ae2e29-59ed-488c-a9a6-3bfd7c0f53eb', id, 'Definir acciones correctivas en caso de incumplimiento', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('45a28a1e-560e-4cda-8a09-788e3a220e82', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.4', 'Sistema de Gestión de Control y Reporte (MCRS) (Check)', true, '3', NULL, 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5676def3-796b-4c25-9fa1-15406c9a09da', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.5', 'Workstations / Estación de trabajo (Check)', true, '1', 'Hacer foco en las estaciones de reempaque y PRI. Oportunidad: añadir una bacha en caso de ser posible en el área de reempaque Entrega: sumar SOPs a la workstation', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1e45682c-6a9e-4f07-9a07-3a3ff5554d38', id, 'Añadir una bacha, en caso de ser posible, en el área de reempaque', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4cdf2ba7-c916-45be-94fb-48509a222cdb', id, 'Sumar SOPs a la workstation', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9b8e5cf0-b683-4226-a4da-30acf8ea8d3a', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.6', 'Team Room (Check)', true, '3', 'Hacer foco en como impactan las tareas de los operarios en los PIs.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a7f1c5f9-a886-42b7-aba3-5754a7889ea8', id, 'Hacer foco en como impactan las tareas de los operarios en los PIs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.6'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('78f49b78-10df-4ac6-8a5a-c54186840b37', 'H1 2026', 'Gestión', 'ROUTINE MANAGEMENT (SDCA)', '3.7', 'Tratamiento de Anomalía', false, '1', 'Sumar valores gatillo para indicadores criticos. Oportunidad de que miembros del equipo ejecuten resoluciones de forma autonoma', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '87b9afad-5970-41a4-831f-ec1f5ab6775b', id, 'Sumar valores gatillo para indicadores criticos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.7'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1e26afce-1f49-4a89-bc49-4aa705d190db', id, 'Oportunidad de que miembros del equipo ejecuten resoluciones de forma autonoma', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='3.7'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8a2e5749-bb3e-4f3c-b233-d3b47fde57bd', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.1', 'Monitoreo de Targets (Do)', false, '1', 'Planificar performance targets', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '9c188cab-f66f-466c-96fc-92ea2fa1bfde', id, 'Planificar performance targets', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a3c19af6-6a70-4c9a-8745-bf51493ae03f', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.2', 'Gestión de Proyectos (Do)', false, '3', 'Seguir relacionando os objetivos estratégicos a sus proyectos. Oportunidad: participación de miembros del equipo en proyectos.', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '78cb9a88-50f9-4190-8710-1f5c18410b48', id, 'participación de miembros del equipo en proyectos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('16f551d4-1179-4fdc-8f76-c3004c905361', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.3', 'PDCA (Do)', false, '0', NULL, 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '7266c09e-8fcf-4ac0-92a9-56c0d5e15082', id, 'Implementar metodología PDCA (nota 0 en auditoría, sin comentario del auditor)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('56456f62-dba2-4987-a15e-a9c39c9228e0', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.4', 'Buenas Prácticas (Act)', false, '3', 'Continuar con el programa de buenas prácticas, con enfoque en mejora de KPI o PI relacionado.', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '62fc0518-9248-42a6-ba8d-1843f96119cb', id, 'Continuar con el programa de buenas prácticas, con enfoque en mejora de KPI o PI relacionado', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('80ce7e10-852c-4e6c-bc7e-1e8758a870f9', 'H1 2026', 'Gestión', 'MANAGEMENT BY OBJECTIVES (MBO)', '4.5', 'GOPs (Act)', false, '3', 'Trabajar adherencia al GOP.', 18)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3ca750dd-590f-4946-84d2-3c116e3dfc44', id, 'Trabajar adherencia al GOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Gestión' AND numero='4.5'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('a57817f5-4e89-4fca-9e9f-cfbfb561f7ba', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.1', 'PRE RUTA', false, 'N/A', 'SOP: realizar correcciones sobre RACI. Corregir desarrollo para explicar bien el proceso. Sumar diagrama de flujo. Hay matinal todos los dias. OWDs ok. Actualizar cambio de cloudfleet a herramienta propia. TML estan dentro de la meta. Hay registro por chofer x dia en herramienta. Objetivo del estandar es 30min. Ver la posibilidad de comenzar a tomar inicio de TML con registro de asistencia a la matinal.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4f8e96e7-057c-4810-8866-e65f3d5856fd', id, 'SOP: realizar correcciones sobre RACI', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '17dbb844-4eff-4884-8d14-a793c54542d0', id, 'Corregir desarrollo para explicar bien el proceso', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '80f1afdc-7f8b-4928-8c72-4ba13f93c865', id, 'Sumar diagrama de flujo', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'db4d7093-6f0d-4de5-a19c-9cea4841e6f2', id, 'Actualizar cambio de cloudfleet a herramienta propia', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ae3f206e-52a0-488f-b8e3-9e5ab4c54adc', id, 'Ver la posibilidad de comenzar a tomar inicio de TML con registro de asistencia a la matinal', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0f521a84-e97a-4ac8-98a1-d51fd0ba078f', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.2', 'EN RUTA', false, 'N/A', 'SOP: Corregir RACI. Sumar diagrama de flujo. OWDs ok. Poseen seguimiento de las rutas con herramienta propia. Siguen adherencia a la secuencia y clickeo en las matinales. Hoy en dia hay objetivo 8 hs. Oportunidad de comenzar a medir desvio sobre tiempo planificado para la ruta asignada y generar PDAs sobre eso. Excelente analisis por PDV.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c7fe96a7-8dda-4530-ac0a-272dffc19960', id, 'Corregir RACI', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c26b6b5b-4859-49c9-bfc5-7cd3a52950c1', id, 'Sumar diagrama de flujo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '87c2c029-7ce5-45a4-8d0d-8a67fe775f40', id, 'Oportunidad de comenzar a medir desvio sobre tiempo planificado para la ruta asignada y generar PDAs sobre eso', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c1c4eb13-ef9d-44f8-9a51-d0ed43aa99ca', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.3', 'POST RUTA', false, 'N/A', 'SOP: Corregir RACI. Sumar diagrama de flujo. Dejar solamente tareas del estandar diario del post ruta.Oportunidad de comenzar el TI con geolocalizacion. Mejorar desvios sobre TI.', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '83f8162e-3baf-4abf-8042-4cde9715b602', id, 'SOP: corregir RACI', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '242a937a-b95a-45a7-8bc6-77080c62d6bb', id, 'SOP: sumar diagrama de flujo', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5adfe7e6-6355-4cad-8fd8-a387f6aca7f3', id, 'SOP: dejar solamente tareas del estándar diario del post ruta', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '202f5c65-d890-4e2f-b16e-cc9e90b1ea0a', id, 'Comenzar el TI con geolocalización', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5a20bc76-ba9b-48ce-9b4d-03e533bb6b03', id, 'Mejorar desvíos sobre TI', 5 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('aa1e14b2-869e-417c-864e-f1eecdd7ee72', 'H1 2026', 'Entrega', 'PROCESOS DE EJECUCIÓN DE ENTREGA', '1.4', 'CALIDAD DE ENTREGA DE LOS PRODUCTOS', false, 'N/A', 'Tienen para reportar las roturas en la workstation.Seguimiento de rotura por SKU, por camion. DQI mal medido. No toman reempaque.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '34f21b58-d59f-4e25-8308-7591e0583631', id, 'Corregir medición de DQI: hoy está mal medido, no toman el reempaque', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e9fc334c-770d-4665-bcf3-6d47309be06a', 'H1 2026', 'Entrega', 'EQUIPOS EMPORDERADOS', '2.1', 'VISIBILIDAD DE RESULTADOS', false, 'N/A', 'Poseen visibilidad de resultados en la herramienta. Objetivos y valores reales de los indcadores (Rechazo,, roturas y demas indicadores), compensacion variable (hs extra y bultos entregados). Es individual.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d31336cf-c3ec-4844-a187-58bad5c807b1', 'H1 2026', 'Entrega', 'EQUIPOS EMPORDERADOS', '2.2', 'PROCESO DE FEEDBACK', false, 'N/A', NULL, 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c42e11d5-3f87-4327-b4b5-bb5334f812ea', 'H1 2026', 'Entrega', 'EFICIENCIA DE PROCESOS', '3.1', 'IMPACTOS FINANCIEROS Y DE PRODUCTIVIDAD', false, 'N/A', 'Realizan presupuesto, el mismo debe ser aprobado por gerencia. Luego se va midiendo el desvio de los gastos por sobre lo presupuestado. Hay seguimiento dde los motivos de los desvios.Seguir trabajando en seguimiento de costos para reducir los desvios. TLP: 31.07 OB: 73', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3f7c1866-6be0-4fb2-adb0-7dfa4ba86989', id, 'Seguir trabajando en seguimiento de costos para reducir los desvíos (TLP 31.07, objetivo 73)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bf0b3eb6-583f-4f44-a186-69899cd02a86', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.1', 'CALIDAD DEL SERVICIO AL CLIENTE', false, 'N/A', 'RMD: 4.99. Buen seguimiento del indicador. Seguimiento de detractores, con PDAs. Hay seguimiento de clientes ¨recuperados¨. Sumar tasa de respuesta. Definir SLA para cierre de casos detractores. Realizar SOP.', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ff9ab7b7-67a4-445c-83d4-f3197b732a2f', id, 'Sumar tasa de respuesta', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '50f09f16-328b-40cb-b582-dc7a72b37c0a', id, 'Definir SLA para cierre de casos detractores', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bc33177c-c1e4-4ba1-886a-2f9cb06f3dfa', id, 'Realizar SOP', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('465e1f79-4bc9-400f-a6a6-42e3e84e4fec', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.2', 'COMUNICACIÓN AL CLIENTE', false, 'N/A', NULL, 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ce8ea090-ff35-4475-bdb6-4f8b492866a6', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.3', 'ENTREGAS INFULL', false, 'N/A', 'SOP rechazo y modulaciones ok. OWDs ok. Ofrecen distintos metodos de pago. Excelente seguimiento del rechazo. Por chofer, motivo, SKU, top clientes. Excelente gestion.', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('26e5a6c2-6f7a-418f-aaa4-d42d37d09ec8', 'H1 2026', 'Entrega', 'SATISFACCIÓN DEL CLIENTE', '4.4', 'ENTREGAS ON TIME', false, 'N/A', 'No hay ruteo centralizado. Tienen reunion semanal con su ruteador.Hay rutina para relevamiento de VH (91,2%). Hay detalle de avances por promotor. Oportunidad de comenzar a medir adherencia a VH. On time fuera de la meta (98,64 % obj 99%).', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4d89f554-cac9-4c95-8503-207e6a99f3f5', id, 'Comenzar a medir adherencia a ventanas horarias (VH)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e26ec82f-c325-4a6d-80b9-9dca164f457f', id, 'Mejorar On Time: 98,64% actual vs objetivo 99%', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9b33c8ec-2db5-4dc4-bfd3-5bad953f35cf', 'H1 2026', 'Entrega', 'MEJORAS DE ENTREGA', '5.1', 'NPS DE ENTREGA', false, 'N/A', 'NPS: 83,2. 11 detractores de entrega. Buen analisis de detractores. Reforzar seguimiento y planes de accion para con los mismos.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6ba08c3d-1535-423f-ac00-0123326506cd', id, 'Reforzar seguimiento y planes de acción sobre los detractores (NPS 83,2 — 11 detractores de entrega)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('9011f783-433c-4e64-ba00-676eec1449a4', 'H1 2026', 'Entrega', 'MEJORAS DE ENTREGA', '5.2', 'BENCHMARK', false, 'N/A', 'Realizaron Bench con Palco un dia antes de la auditoria.. Vieron: TLP, rechazos, RMD. Para H2 mostrar proceso documentado y resultados. Oportunidad de realizar bench interno.', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '97dc4087-009a-440d-90dc-60b73412a6be', id, 'Para H2 mostrar proceso de benchmark documentado y resultados', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '31393294-966e-421d-8423-9eb664060bad', id, 'Realizar bench interno', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Entrega' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c1e94fd3-db90-4e75-adb9-6ff102dd708c', 'H1 2026', 'Flota', 'COMPLIANCE', '1.1', 'Documentos / Habilitaciones', true, '3', '11 camiones T2. 2 AE. Oportunidad de generar tablero como maestro de flota con todos los camiones y los requisitos. Se sigue toda la documentacion en el apartado de requisitos legales, hay avisos de proximos a vencer y existe proceso para bloqueo de los vehiculos en caso de que no cumpla.', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b6b544c2-2d4f-4d88-932a-7a1098d76152', id, 'Oportunidad de generar tablero como maestro de flota con todos los camiones y los requisitos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('042809c6-4a4d-416d-bef5-f3d931cc5a9b', 'H1 2026', 'Flota', 'COMPLIANCE', '1.2', 'Estándares de Flota', true, '3', 'Estandar de camiones ok. Tablero de estandar ok. Se sigue % de cumplimiento por camion. Diferenciar entre mandatorias y excelencia. Sumar OPLs de camiones y AE.', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1d4416f0-add4-499f-aede-5df7f60575d2', id, 'Diferenciar entre mandatorias y excelencia', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c98e571a-0861-46d5-ae7b-aa6d316ba93d', id, 'Sumar OPLs de camiones y AE', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('17015db2-856e-4265-9346-dd7cceefce1a', 'H1 2026', 'Flota', 'COMPLIANCE', '1.3', 'Checklist de Flota', true, '3', 'Check digital.Ok para camiones y AE. Se divide por secotres (carroceria, motor, frenos, luces, neumaticos, seguridad. etc). Define cuales son criticos y cuales no. Buen seguimiento de items que dan nook. Oportunidad de realizar analisis aperturado de las fallas y generar PDAs. Adherencia al check se sigue en la reunion de logisitca, oportunidad de sumarlo a esta solapa. Se sigue KPI de tiempo: trabajar en los desvios. Oportunidad de comenzar a seguir KPI de calidad.', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ac2395d9-ecdc-4d0a-b8b4-0f5576fcaa2d', id, 'Oportunidad de realizar analisis aperturado de las fallas y generar PDAs', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a752de8b-8c2d-426d-a898-e4eed50374ec', id, 'Oportunidad de comenzar a seguir KPI de calidad', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('601627b6-1e3f-4876-b8c0-79d0df49d179', 'H1 2026', 'Flota', 'COMPLIANCE', '1.4', 'Disposición de residuos de Mantenimiento', false, '0', 'Generar SOP.de disposicion de residuos. Cerrar con empresa para disposicion de neumaticos para el futuro y sumar certificados al SOP, mismo para aceite. Generar seguimiento historico para cuando comiencen.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '87240cd1-eeb9-4495-b592-88ace5df93e2', id, 'Generar SOP de disposición de residuos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ad944bb3-3476-4955-be2a-cb6589439989', id, 'Cerrar con empresa la disposición de neumáticos a futuro y sumar certificados al SOP (ídem aceite)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1086e096-0540-44b2-8582-cffd418ecdef', id, 'Generar seguimiento histórico para cuando comiencen', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='1.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('04254661-32ba-4870-9569-becf07ce6576', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.1', 'Clientes de Flota', false, '5', 'Se sigue disponibilidad de flota x mes x dia. Todo gestionado por la herramienta propia. Poseen reunion semanal con el ruteador donde ven disponibilidad de flota, consumo de combustible, motivos por los cuales los camiones estan parados.', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('92547327-8985-4d23-adbe-722b2e19f437', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.2', 'Mantenimiento Preventivo', false, '3', 'Cada camion y AE tiene su plan de mantenimiento cargado y este se gestiona desde el tablero principal ( hay avisos de services pendientes de menos de 30 dias). Hay seguimiento de los mantenimientos que se realizaron. Luego se sigue por cada mantenimiento los trabajos realizados con sus respectivos valores. Oportunidad de comenzar a seguir KPI de % de cumplimiento de plan de mantenimientos preventivos. Mant proactivos ok.', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '70224e70-ad59-4b85-9e07-a158bfde486f', id, 'Oportunidad de comenzar a seguir KPI de % de cumplimiento de plan de mantenimientos preventivos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('fd468e2c-2878-4cb5-8b76-3f09863a24e2', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.3', 'Políticas y Gestión de Piezas de Inventario', false, '1', 'Generar SOP. Poseen inventario, recien mes de julio es el primer conteo de stock que realizan. Generar rutina de conteo de stock, comenzar a seguir un KPI y generar PDAs.', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a022d0a5-620e-4942-8723-4cbd38021fa6', id, 'Generar SOP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '01b16dff-6e0a-442b-b57b-aaf004a33243', id, 'Generar rutina de conteo de stock, comenzar a seguir un KPI y generar PDAs', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('263eed70-b347-4f5a-9827-adea2e908a18', 'H1 2026', 'Flota', 'CONFIABILIDAD DE LA FLOTA', '2.4', 'Mantenimiento Correctivo', false, '1', 'Hay seguimiento de correctivos externos, falta realizar seguimiento de los internos (no estaban mapeados los cambios de foco por ej.) Oportunidad de comenzar a mapearlos cuando un check sale nook, sumar la OT para cerrar el circulo con el descuento en el stock. Oportunidad de generar analisis de incidencias aperturado y tomar acciones. Comenzar a seguir KPI y generar PDA', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a76a025c-2476-45a8-bf8a-74ed2783a7fd', id, 'Oportunidad de generar analisis de incidencias aperturado y tomar acciones', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '775def9b-4179-4e10-9f96-c5eca9e52681', id, 'Comenzar a seguir KPI y generar PDA', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('fdc43cb2-70cb-4316-867d-4ef2c0993d74', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.1', 'Reuniones semanales', false, '1', 'Hay reunion semanal de flota. Realizar ciclo de gestion de flota (desc del negocio y mapeo de procesos). Oportunidad de generar seguimiento de SLAs, KPI y generar PDAs.', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '859bb975-e114-4053-92b9-e0cc91511be0', id, 'Realizar ciclo de gestion de flota (desc del negocio y mapeo de procesos)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f02b0b2c-9f73-4c98-8c34-b389f9bd6bfd', id, 'Oportunidad de generar seguimiento de SLAs, KPI y generar PDAs', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('537cbfdb-3c46-4cff-bef3-defaa455db02', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.2', 'Presupuesto de Gastos de Flota', false, '3', 'Seguimiento de gastos vs presupuestado. Motivos ante desvios. Oportunidad de segregar en motivos (correctivos, preventivos).', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bb3f18f2-7f6f-4145-875c-ffeb348f10ed', id, 'Oportunidad de segregar en motivos (correctivos, preventivos)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('31c5d743-b60a-423a-9f3e-757e7b60b220', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.3', 'Consumo de Combustible', false, '3', 'Beun seguimiento. Se sigue rendimiento km/l de cada camion y generan PDAs. Colocaron limitador de velocidad (julio) por lo que se esta viendo tendencia positiva en los consumos (revisar en H2). Realizar SOP.', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '251a70d0-d9ce-4b6e-85ee-1bf9855a1a20', id, 'Realizar SOP de consumo de combustible', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c05ee854-ce49-4429-afed-a177bb47e3a0', id, 'Revisar en H2 la tendencia de consumos tras el limitador de velocidad (colocado en julio)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('2f9236c4-1dc9-4e05-9a82-a0fdd6fe9f69', 'H1 2026', 'Flota', 'GESTIÓN DE FLOTA', '3.4', 'Políticas y Gestión de Neumáticos', false, '1', 'Buen seguimiento por la herramienta. Poseen marca de fuego. Medicion de mm y calibracion mensual. Comenzar a seguir KPI de consumo de neumaticos. Realizar SOP.', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '769cc6cb-ab77-4b59-89b1-359b0bff4da4', id, 'Comenzar a seguir KPI de consumo de neumaticos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '23b5823f-d8de-4638-912f-6cb9fd29b80f', id, 'Realizar SOP', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bb3af8b3-92c9-4d1d-87b8-a5c7ef659196', 'H1 2026', 'Flota', 'AUTONOMÍA Y MEJORAS DE LA FLOTA', '4.1', 'ATO Formal Program & Cleaning Area Autonomous team operation', false, '0', NULL, 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('354716d4-4fd1-4816-9672-82f0ba2ca76e', 'H1 2026', 'Flota', 'AUTONOMÍA Y MEJORAS DE LA FLOTA', '4.2', 'Maintenance improvements & results', false, '1', 'Generar analisi aperturado de datos historicos. Generar piramide de mantenimientos.', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4393736f-f0fb-4922-b98b-8162f6a9bc57', id, 'Generar analisi aperturado de datos historicos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '40ebf2de-b24a-4f08-9bbf-7c5cea3d91d7', id, 'Generar piramide de mantenimientos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Flota' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('619feb6c-bfbe-4f8b-92d9-7d5eac738ccc', 'H1 2026', 'Flota', 'AUTONOMÍA Y MEJORAS DE LA FLOTA', '4.3', 'Sustainability Goals', false, '0', NULL, 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c162b013-3827-4599-b909-12ea000d4820', 'H1 2026', 'Almacén', 'LAYOUT & CAPACIDAD', '1.1', 'Optimización de Layout', true, '3', 'Oportunidad: continuar trabajando en layout, carteleria, responsables por area, sendas, zona segura de chofer. Foco en 5s en distintas zonas del almacen (ejemplo parque de envases, carga y descarga). Seguridad en clasificacion de envases Continuar trabajando en medicion de adherencia al ABC', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'eb16e9e9-fb86-4061-9fed-d207db04f14e', id, 'Continuar trabajando en layout: cartelería, responsables por área, sendas, zona segura de chofer', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '97d20b30-a6ec-447f-9e35-4975474b9e25', id, 'Foco en 5S en distintas zonas del almacén (ej: parque de envases, carga y descarga)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b5cd0ba9-b054-47a2-aa48-ea8cc8a8e560', id, 'Seguridad en clasificación de envases', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b4c9d6aa-156b-4f0d-8f9b-60c76c528d3c', id, 'Continuar trabajando en medición de adherencia al ABC', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3052ba17-9363-49c4-a146-d0f0ca71491f', 'H1 2026', 'Almacén', 'LAYOUT & CAPACIDAD', '1.2', 'Gestión de la Capacidad', false, '3', 'Revisar calculo de densidad', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2d7ae7d5-9494-4056-b6a1-947107869594', id, 'Revisar calculo de densidad', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3c320169-f1ef-43ea-9ce6-cee6f7165aad', 'H1 2026', 'Almacén', 'CALIDAD', '2.1', 'Fundamentos de la Calidad', true, '1', 'Oportunidad: Foco en analisis de gestion de plagas, mitigacion de las ocurrencias y solidas rutinas de limpieza Continuar trabajando en estaciones de limpieza dentro del almacen y en la disposicion finalo de residuos', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8b677b19-ee47-474e-b956-7e1f2e9aa1d5', id, 'Foco en análisis de gestión de plagas, mitigación de las ocurrencias y sólidas rutinas de limpieza', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bcbe7457-0a76-4ac7-82c9-4df11027f1b5', id, 'Continuar trabajando en estaciones de limpieza dentro del almacén y en la disposición final de residuos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('935e37c4-2180-4028-ac26-6ff6089ecfdf', 'H1 2026', 'Almacén', 'CALIDAD', '2.2', 'Políticas de Calidad', false, '1', 'Oportunidad: continuar trabajando en PRI y reempaque (teniendo en cuenta entandarizacion de las zonas) Foco en ambas estaciones de trabajo, asi como tambien considerar zona de derrame (con responsables, QR del SOP, zona cerrada, carteleria, etc)', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1b0a5230-f7c8-4e2d-8e0e-4f8ae263000f', id, 'Continuar trabajando en PRI y reempaque (estandarización de las zonas)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a583cefc-4113-4372-ba6f-ea921c94601f', id, 'Foco en ambas estaciones de trabajo y considerar zona de derrame (responsables, QR del SOP, zona cerrada, cartelería, etc.)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('39dd0437-db75-4304-a507-5c9764a88b72', 'H1 2026', 'Almacén', 'CALIDAD', '2.3', 'Gestión de Frescura', false, '3', 'Buen analisis de frescura, continuar trabajando en acciones por frescura', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ed626f60-510b-4f04-b2c9-07bd39f67441', id, 'Continuar trabajando en acciones por frescura', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('152d4f76-7023-4567-bccd-e95c7946f697', 'H1 2026', 'Almacén', 'CALIDAD', '2.4', 'Rutinas de Calidad de Packaging', false, '1', 'Oportunidad: Foco en seguimiento de tickets de mercosur pampeana', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '04b11c82-4c81-42c2-b15f-be26946da91d', id, 'Foco en seguimiento de tickets de mercosur pampeana', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1c3b79c0-6a90-4551-975f-132e674b3253', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.1', 'Proceso de Conteo y Resultados de Inventario', true, '3', 'Realizan conteos diarios Foco en correccion del indicador diferencia de inventario (contemplar faltantes de planta) Continuar trabajando en PDA ante desvios de diferencias Revisar ajustes', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'c21e731b-0439-4e87-9228-d60409265ad1', id, 'Corregir el indicador de diferencia de inventario (contemplar faltantes de planta)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b93d0c2a-b558-441d-aab6-698092938b49', id, 'Continuar trabajando en PDA ante desvíos de diferencias', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '3cf67c8b-f405-4ebd-88fc-12f361a9c913', id, 'Revisar ajustes', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('10c58ddd-b4f8-46f0-9678-5afbb5423d03', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.2', 'Trazabilidad del Producto', false, '5', 'Ok, cuentan con WMS y SOPs detallados y actualizados', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('1d46aa1c-53fc-43ee-a4a9-2b9550bc5e60', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.3', 'Gestión de Activos', false, '3', 'Oportunidad: continuar trabajando en el seguimiento del DS de envases Continuar trabajando en la recaudacion de informacion para el proceso de clasificacion de envases y % de descarte del mismo Foco en acciones y revision del valor objetivo para dicha productividad', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '97276b79-3b8d-4503-8be6-e487d8427b41', id, 'Continuar el seguimiento del DS de envases', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0811127b-d184-4e64-93d9-6a13f30680d0', id, 'Continuar la recolección de información para clasificación de envases y % de descarte', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2472fab9-651d-44a2-8bf9-0e9828be6234', id, 'Foco en acciones y revisión del valor objetivo para dicha productividad', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('4af30e0d-dd5b-49e9-8fb4-d1d72082e962', 'H1 2026', 'Almacén', 'GESTIÓN DE INVENTARIO', '3.4', 'Registro y Prevención de Pérdidas', true, '1', 'Oportunidad: continuar trabajando en el analisis de indicadores (WQI: CORREGIR INDICADOR teniendo en cuenta volumen reempacado) Foco en seguimiento de SCL y FGLI. Definir acciones en PDA', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '80ba8ce0-12af-4b6a-b727-88a2f64a429b', id, 'Corregir indicador WQI teniendo en cuenta el volumen reempacado', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6fa51f54-8672-463f-a547-9c2b5da8df4c', id, 'Foco en seguimiento de SCL y FGLI', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b5da54c9-42fd-4b5b-8794-618fa720dd70', id, 'Definir acciones en PDA', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('289d12bd-7a83-4a38-8b22-ecd779caa868', 'H1 2026', 'Almacén', 'PICKING', '4.1', 'Proceso de Picking', false, '5', 'Ok, cuentan con SOP definido y se realizan OWDs. Controlan la carga y ven como afectan los errores al rechazo.', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8573399c-72f5-4cc6-a1bf-1e012f8e807e', 'H1 2026', 'Almacén', 'PICKING', '4.2', 'Reposición del Área de Picking', false, '3', 'Oportunidad: continuar trabajando en el analisis del PI teniendo en cuenta el exceso de reabastecimientos. Revisar si tenemos la cantidad de pallets necesarios para el volumen de picking diario', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1c2ce05c-b622-4f1f-bd12-036899184f15', id, 'continuar trabajando en el analisis del PI teniendo en cuenta el exceso de reabastecimientos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bde588a5-7ce0-4a57-a7f6-766f897ebff2', id, 'Revisar si tenemos la cantidad de pallets necesarios para el volumen de picking diario', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0a7f007a-f73f-49d9-a0a2-5e8087909cc6', 'H1 2026', 'Almacén', 'PICKING', '4.3', 'Precisión de Picking', false, '3', 'Oportunidad: continuar trajando en analisis de eficiencia de picking, teniendo comparar con volumen movido por el operario', 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'b06b0f5e-0264-4e56-b248-5a9e31437afa', id, 'continuar trajando en analisis de eficiencia de picking, teniendo comparar con volumen movido por el operario', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='4.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('98e06850-1423-4768-b1cb-be66755f06a7', 'H1 2026', 'Almacén', 'CARGA Y DESCARGA DE VEHÍCULOS DE DISTRIBUCIÓN', '5.1', 'Proceso de Carga y Descarga T2', false, '5', 'Ok, bien ejecutado el proceso de carga y descarga. Continuar trabajando en layout el area designada para carga y descarga, definir en caso de ser posible zona externa al almacen', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('7fcf5ccd-4250-473c-9288-74d2f74d305b', 'H1 2026', 'Almacén', 'CARGA Y DESCARGA DE VEHÍCULOS DE DISTRIBUCIÓN', '5.2', 'Programación de Cargas Salientes T2', false, '3', 'Cuentan con SLA, continuar trabajando en el seguimiento de la misma y reforzar PDA ante cada NOOK', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e8e7be48-0750-4922-931a-dd0c43e20610', id, 'Continuar el seguimiento de la SLA y reforzar PDA ante cada NOOK', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='5.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('67fa2ab9-c251-48d4-a2ee-32eb2ecaea47', 'H1 2026', 'Almacén', 'CARGA Y DESCARGA DE VEHÍCULOS DE DISTRIBUCIÓN', '5.3', 'Eficiencia de Carga y Descarga', false, '1', 'Analizar histograma de carga y descarga de camiones y definir PDA en base a eso. Continuar con la controlación de % de camiones decargados y cargados para los SLAs definidos.', 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6e756ac5-9988-4e52-b63f-5b97baa9e3fd', id, 'Analizar histograma de carga y descarga de camiones y definir PDA en base a eso', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '08f1b8f2-991a-45a4-bed6-9e63e89abf19', id, 'Continuar con la controlación de % de camiones decargados y cargados para los SLAs definidos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('43f602ec-2049-4e9b-8cf6-3408c61f92b1', 'H1 2026', 'Almacén', 'REAPROVISIONAMIENTO', '6.1', 'Proceso de Recepción T1', false, '5', 'Ok, bien definido y ejecutado el proceso de recepción de carga, seguir trabajando en base a los valores objetivos.', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('bcc30979-a1ec-4c97-bc10-2e15db34f424', 'H1 2026', 'Almacén', 'REAPROVISIONAMIENTO', '6.2', 'Programación de Carga Entrante T1', false, '3', 'Cuentan con SLA definida, continuar trabajando en el seguimiento de la misma.', 18)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'f6b7c616-90c1-45e1-b66c-f07f3ce525af', id, 'Continuar trabajando en el seguimiento de la SLA definida', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='6.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('d781ffa0-42f0-4a19-9951-6a99982eab4e', 'H1 2026', 'Almacén', 'REAPROVISIONAMIENTO', '6.3', 'Tiempo de Ciclo del Camión T1', false, '1', 'Controlar tiempo de ciclo de camión, calcular el WPS y definir acciones de mejora.', 19)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'bf38d9ed-d36b-48cc-baef-c5ea01968122', id, 'Controlar tiempo de ciclo de camión, calcular el WPS y definir acciones de mejora', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='6.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('939585f9-4071-4ec0-8b80-d76e8129906d', 'H1 2026', 'Almacén', 'MEJORAS DE PRODUCTIVIDAD', '7.1', 'Gestión de Productividad de Almacén', false, '3', 'Continuar con seguimiento del WNP en todas las áreas del almacén a nivel individual . Oportunidad: simulador dimensionamiento para mejorar productividad.', 20)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '42a32e1a-2613-40de-a9ed-73962b1fe459', id, 'simulador dimensionamiento para mejorar productividad', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e2240dc6-d4a0-4270-8c0d-8afd0cf581af', 'H1 2026', 'Almacén', 'MEJORAS DE PRODUCTIVIDAD', '7.2', 'Herramienta de Telemetría', false, '1', 'Controlar FNP.', 21)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'fa664a44-33c3-45ed-affb-8f47864bf94b', id, 'Controlar FNP', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('04b1582d-ce00-4ac0-ad53-44f37fa0062c', 'H1 2026', 'Almacén', 'MEJORAS DE PRODUCTIVIDAD', '7.3', 'Iniciativas de Productividad', false, '1', 'Continuar trabajando en la herramienta. Avanzar en los PDA y gestionar acceso a los resultados.', 22)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a761ea11-7b37-4e24-8252-986e8958f71d', id, 'Continuar trabajando en la herramienta', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e3a2f75a-a6d8-4c55-bba2-7e9b77d43353', id, 'Avanzar en los PDA y gestionar acceso a los resultados', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Almacén' AND numero='7.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('27e9bd87-f9ff-458a-bf75-1e439e8ef16e', 'H1 2026', 'Planeamiento', 'GESTIÓN DE PRESUPUESTO', '1.1', 'Proceso y creación de presupuesto', true, '3', 'Revisar y corregir RACI (No deberia aparecer mas de un responsable por fila) Mejorar analisis y cruce entre presupuesto con iniciativas de ahorro Entender impacto de mas SKPIs con el presupuesto (OB - rechazo )', 1)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2a1b739d-8115-4686-a93f-9464549a5fe8', id, 'Revisar y corregir RACI (no debería aparecer más de un responsable por fila)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ee0a07b8-8aa0-43b5-9360-96e11ccfa69a', id, 'Mejorar análisis y cruce entre presupuesto e iniciativas de ahorro', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '99c0368b-05c2-4e76-b110-4c4b86815161', id, 'Entender impacto de más SKPIs con el presupuesto (OB, rechazo)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('db255993-821e-4deb-95d4-09cc6c513584', 'H1 2026', 'Planeamiento', 'GESTIÓN DE PRESUPUESTO', '1.2', 'Monitoreo de costos', false, '3', 'Tienen rutina de dueños de paquetes (Continuar trabajando en evidencia) Analizar acciones Mucho foco en las acciones ante desvios y seguimiento de las mismas Segregar mas cada desvio por paquete (que no se trabaje de manera aislada cada paquete con el presupuesto) Realizaron bench con Palco Continuar trabajando en analisis de costo por PDV', 2)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5e0c2c1e-3544-40c0-bac4-e20632eb0a66', id, 'Continuar trabajando en evidencia de la rutina de dueños de paquetes', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '16d7b27e-76f3-4def-b28b-1eab6e1f5c49', id, 'Foco en acciones ante desvíos y seguimiento de las mismas', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5a88d84d-36fc-41b1-860c-54ada61c78fb', id, 'Segregar más cada desvío por paquete (no trabajar cada paquete aislado del presupuesto)', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a0824e4f-e3bd-4c4d-81bb-e172cc1e4f4d', id, 'Continuar trabajando en análisis de costo por PDV', 4 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='1.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('e71f24d7-a16d-4658-a1d9-a81f087ba838', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.1', 'Permisos y licencias para el derecho a operar', true, '5', 'Completo. Foco en seguimiento de proximos vencimientos', 3)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('20d4aebf-8f43-4935-a0eb-3d8721e2a2ee', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.2', 'Evaluación de riesgos, respuesta y reanudación del negocio', true, '3', 'Reforzar carteleria Reforzar plan de respuesta incluir una matriz de escalamiento con contactos responsables , mano de obra y procedimientos de ajuste de pronóstico para mitigar el riesgo, como mínimo.', 4)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ef1efb34-ac31-4fa7-a70d-491cb5cd81a9', id, 'Reforzar cartelería', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5e3c87c8-40e4-4894-9e2d-62de59fc507e', id, 'Reforzar plan de respuesta: incluir matriz de escalamiento con contactos responsables, mano de obra y procedimientos de ajuste de pronóstico', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0aec12bc-f308-4546-ba5c-c269517bfebc', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.3', 'Recurso del dimensionamiento', false, '1', 'Oportunidad: continuar trabajando en analisis del simulador. Actualmente comparar con volumen real y revisar la ociosidad de flota (cruzado con pilar flota) Utilizar la herramienta de forma dinamica que nos permita tomar decisiones', 5)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e31a9d3a-3ec9-48c1-9e04-4d9bb95cf254', id, 'Continuar el análisis del simulador: comparar con volumen real y revisar ociosidad de flota (cruzado con pilar Flota)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '0ec2a8a0-d767-4a76-8f1f-0589fda0e800', id, 'Utilizar la herramienta de forma dinámica para tomar decisiones', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('649801e2-2ca9-4319-813c-9799f2e253e8', 'H1 2026', 'Planeamiento', 'GESTIÓN DE RIESGOS', '2.4', 'Mantenimiento de instalaciones', false, '3', 'Continuar trabajando en acciones y vinculo con bloque 5', 6)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '748858d5-d134-44ab-81ed-06d9bf185cae', id, 'Continuar trabajando en acciones y vinculo con bloque 5', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='2.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ad76b805-af34-49c8-bef4-c692f137d326', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.1', 'Conectando ventas y operaciones', true, '3', 'Rutina semanal (Todos los martes) Oportunidad Foco en seguimiento de SLA con acciones asociadas Foco en acciones concretas (formato de las acciones en herramienta)', 7)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'd59988a5-f70b-4cbc-bca4-0e71611dc448', id, 'Foco en seguimiento de SLA con acciones asociadas', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '65c5dbed-5774-4548-a2ee-bedd99ce07ba', id, 'Foco en acciones concretas (formato de las acciones en la herramienta)', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('8137713f-25d4-4572-bb98-e6dffdd1352f', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.2', 'Rutina de pronóstico: mitigación del nivel de servicio y los impactos de los costos', true, '5', 'Buen analisis y seguimiento', 8)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('ac8a7bfc-c8d4-45ae-95cf-9fa3ef02fa42', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.3', 'SOP de enrutamiento y matriz de habilidades', false, 'N/A', 'Foco en OWD para ruteador suplente', 9)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'a3d8fbc9-4ffd-41c1-acbd-b2b3e93f617e', id, 'Foco en OWD para ruteador suplente', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.3'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('04ef38ba-c175-4ad2-8d3a-289dac824035', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A CORTO PLAZO', '3.4', 'Periodo Crítico', false, '1', 'Oportunidad: continuar trabajando en analisis de periodos criticos Cascadear y definir incentivo de temporada alta', 10)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'e514d90e-533e-418d-955a-3c4804355f44', id, 'Continuar trabajando en análisis de períodos críticos', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '1ef669f0-bd66-476d-ba0c-f67af4a8f858', id, 'Cascadear y definir incentivo de temporada alta', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='3.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('654a59ac-72e8-4451-ad8a-a3e7f13e438e', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.1', 'Análisis y plan centrado en el cliente', true, '3', 'Oportunidad: Continuar trabajando en analisis de NPS. Definir acciones concretas y dar seguimiento a pasivos Buenos valores de NPS', 11)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '25a546a4-c297-4591-a69f-c54f1711ed09', id, 'Continuar trabajando en análisis de NPS', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '6dbe2c1b-afd7-4e36-836a-50d375aee148', id, 'Definir acciones concretas y dar seguimiento a pasivos', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('759a1fd0-b6a8-4176-ac20-f5d0306babe2', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.2', 'Plan de agrupación de clientes', false, '3', 'Oportunidad: Continuar trabajando en clusterizacion de clientes. Foco en variables definidas. Tener en cuenta variables pasa/no pasa', 12)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '8865cdd7-ab17-475e-ab48-7f038e68c10f', id, 'Continuar trabajando en clusterizacion de clientes', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5c6db14b-bd42-44b7-bef3-cee8df9947fa', id, 'Foco en variables definidas', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '5de2d310-c1a4-49d3-8410-f53ad055d6dc', id, 'Tener en cuenta variables pasa/no pasa', 3 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.2'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('c3a0b674-8060-494e-bb88-ae6145815bdf', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.3', 'Servicio de Entrega Expreso y Flexible', false, '0', NULL, 13)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('5f3eb058-7cce-4b1e-82e4-916f391eb647', 'H1 2026', 'Planeamiento', 'CLIENTE EN EL CENTRO', '4.4', 'Gestión proactiva del nivel de servicio', false, '3', 'Oportunidad: continuar trabajando en impacto de la herramienta en rechazos, TLP, etc. Y reforzar evidencia que los cambios y cancelaciones de pedidos se incluyen en el cálculo OTIF con un código de motivo asignado.', 14)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '64f36503-a43a-49df-a6d7-7787abb3c94c', id, 'continuar trabajando en impacto de la herramienta en rechazos, TLP, etc', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '2912290c-cc69-4684-ba78-070a315a0b1a', id, 'Y reforzar evidencia que los cambios y cancelaciones de pedidos se incluyen en el cálculo OTIF con un código de motivo asignado', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='4.4'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('b082fa78-628b-4108-8541-5e1057160625', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A MEDIANO PLAZO', '5.1', 'Plan Territorial e Implementación', false, '0', 'Oportunidad. Realizar analisis de reestructuracion de rutas en post de la mejora en el costo/HL Teniendo en cuenta nalisis de(relevamiento de ventas horarias, frecuencia de entrega, rechazo, etc)', 15)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '4ad42de1-d4cc-4294-84ca-d264064f4ff0', id, 'Realizar análisis de reestructuración de rutas para mejorar el costo/HL (ventas horarias, frecuencia de entrega, rechazo, etc.)', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='5.1'
  ON CONFLICT (id) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('0275ad61-c1d5-476c-ba6f-18734a5b929d', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A MEDIANO PLAZO', '5.2', 'Rutina de campeones', false, '3', NULL, 16)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;

INSERT INTO devolucion_preguntas (id, periodo, pilar, bloque, numero, pregunta, mandatoria, nota, comentario, orden) VALUES
  ('3a486252-0fd2-450d-b8ee-a013b363848d', 'H1 2026', 'Planeamiento', 'PLANEAMIENTO A MEDIANO PLAZO', '5.3', '3YP & CAPEX', false, '1', 'Cuentan con evidencia. Continuar trabajando con impacto en bloque 1 Foco en año que viene y 2028', 17)
  ON CONFLICT (periodo, pilar, numero) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT '65b29813-25c3-4ffa-8bc0-eff9da1751ac', id, 'Continuar trabajando el 3YP con impacto en bloque 1', 1 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO devolucion_tareas (id, pregunta_id, descripcion, orden)
  SELECT 'ad1c5498-33a5-4f66-9d03-97276245f559', id, 'Foco en 2027 y 2028', 2 FROM devolucion_preguntas WHERE periodo='H1 2026' AND pilar='Planeamiento' AND numero='5.3'
  ON CONFLICT (id) DO NOTHING;
