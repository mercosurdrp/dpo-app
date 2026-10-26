-- =============================================================================
-- Bots por pilar: bot de Flota
-- =============================================================================
-- Flota no tiene grilla de reunión: reunion_tipo = 'flota' es una fuente
-- virtual que lee el bloque de Flota y Ruteo (getFlotaRuteoReunion) y la
-- adherencia al checklist (ver src/lib/bots/contexto-flota.ts). Le escribe a
-- Ezequiel Teves.
-- =============================================================================

INSERT INTO bots_pilar (key, nombre, emoji, reunion_tipo, indicadores, encargado_profile_id, telefono, prompt_extra)
VALUES (
  'flota',
  'Flota',
  '🔧',
  'flota',
  '{}',
  'e681193d-812e-4c16-82bc-19220b20bd21',       -- Ezequiel Teves
  '5493364521741',
  'Indicadores del tablero de Flota, todos acumulados del mes (no hay racha diaria): Disponibilidad = % de días-unidad en servicio; Utilización = % de días-unidad disponibles que salieron a reparto; Rendimiento de combustible = km/l de las cargas registradas; Services vencidos = services preventivos pasados de km o de fecha; Adherencia al checklist = % de camión-día con checklist de liberación y de retorno. Como comentario de cada línea usá el acumulado del mes o la novedad del día que lo explique (no inventes rachas ni tendencias). Las novedades del día (unidades paradas, services próximos, checklists que faltaron, cargas sin registrar) las agrega el sistema debajo: NO las repitas en las líneas, pero usalas para los planes. Los roles posibles son Jefe de Flota, Encargado de Taller, Administrativo de Flota y Supervisor de Distribución.'
)
ON CONFLICT (key) DO NOTHING;
