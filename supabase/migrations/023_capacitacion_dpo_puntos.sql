-- Vincular capacitaciones con puntos específicos del checklist DPO (M:N)
CREATE TABLE capacitacion_dpo_puntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacitacion_id UUID NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
  pregunta_id UUID NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  UNIQUE(capacitacion_id, pregunta_id),
  created_at TIMESTAMPTZ DEFAULT now()
);
