-- ============================================================================
-- Índices de performance — 16/09/2026
--
-- Salen de medir `pg_stat_user_tables` y `pg_stat_statements` sobre la base de
-- producción: son las dos tablas que más filas leen de más. Cada índice se
-- probó con EXPLAIN ANALYZE dentro de una transacción con ROLLBACK, así que
-- los números de abajo son medidos, no estimados.
--
-- Las dos tablas son chicas (58k y 2.4k filas): el CREATE INDEX tarda menos de
-- un segundo. Si preferís no bloquear escrituras ni ese instante, usá la
-- variante CONCURRENTLY del final, corriendo UNA sentencia por vez (no admite
-- transacción, así que no se puede pegar todo junto en el SQL editor).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) checklist_respuestas — defectos de checklist
--
-- Quién la usa: `getFlotaIndicadores()` en src/actions/flota-indicadores.ts,
-- que pagina los defectos de checklist para los indicadores de flota.
--
-- El problema: la condición es `valor not in ('ok','bueno')`. Al ser una
-- negación sobre una columna sin índice, Postgres resolvía CADA página con un
-- seq scan completo de la tabla. Acumulado hasta hoy: 19.436 seq scans y
-- 672.519.008 filas leídas sobre una tabla de 58.258 filas.
--
-- El índice es PARCIAL: sólo indexa las filas que son defecto (una minoría),
-- así que ocupa poco y se mantiene barato en los INSERT del checklist diario.
--
-- Medido:  637,5 ms  ->  2,2 ms   (284x)
-- ----------------------------------------------------------------------------
create index if not exists idx_chk_resp_defectos
  on public.checklist_respuestas (checklist_id)
  where valor not in ('ok', 'bueno');


-- ----------------------------------------------------------------------------
-- 2) radar_rechazos_cliente — feed del Radar de Rechazos
--
-- Quién la usa: /api/radar-rechazos/feed (el JSON público que consume la otra
-- app) y la pantalla del radar. Ambos filtran por `fecha_entrega`.
--
-- El problema: los únicos índices de la tabla son por `snapshot_id`, así que
-- todo filtro por `fecha_entrega` caía en seq scan.
--
-- Medido:  70,6 ms  ->  3,3 ms   (21x)
--
-- Ojo: el 16/09 ese endpoint tardó 102 s en la primera llamada del día y bajó
-- a 0,99 s recién en la cuarta. El seq scan explica la parte de la base; el
-- resto era la instancia leyendo de disco con la CPU agotada.
-- ----------------------------------------------------------------------------
create index if not exists idx_radar_cliente_fecha
  on public.radar_rechazos_cliente (fecha_entrega);


-- Refrescar las estadísticas para que el planner use los índices nuevos ya.
analyze public.checklist_respuestas;
analyze public.radar_rechazos_cliente;


-- ============================================================================
-- Variante sin bloqueo (una sentencia por vez, fuera de transacción):
--
--   create index concurrently if not exists idx_chk_resp_defectos
--     on public.checklist_respuestas (checklist_id)
--     where valor not in ('ok', 'bueno');
--
--   create index concurrently if not exists idx_radar_cliente_fecha
--     on public.radar_rechazos_cliente (fecha_entrega);
--
-- Para verificar que quedaron y que se están usando:
--
--   select indexrelname, idx_scan
--   from pg_stat_user_indexes
--   where indexrelname in ('idx_chk_resp_defectos', 'idx_radar_cliente_fecha');
-- ============================================================================
