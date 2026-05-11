# TODO lunes 2026-05-12 (o cuando retomemos)

Sesión cerrada 2026-05-11 con PR 0.5 + PR 1 mergeados y backfill marzo→hoy completo.

## 1. Verificar que el cron real corrió OK (sábado y domingo)

El cron de Vercel está agendado para **06:00 UTC = 03:00 ART todos los días**. Hasta el lunes debería haber 2 ejecuciones (sábado y domingo).

```sql
-- SQL editor Pampeana
SELECT ran_at, source, date_from, date_to, rechazos_upserted, ventas_upserted,
       jsonb_array_length(errors) AS error_count, duration_ms
  FROM sync_log
 WHERE source = 'cron'
 ORDER BY ran_at DESC
 LIMIT 10;
```

**Resultado esperado:** filas con `source='cron'`, fecha aproximada 06:00 UTC, `rechazos_upserted >= 0`, `error_count = 0`. Si **no aparece ninguna fila con source='cron'** entre 2026-05-11 03:00 ART y la fecha del lunes, hay que escalar:

- Verificar en Vercel UI → dpo-app → Settings → Crons que `/api/rechazos/sync` está habilitado.
- Si está habilitado pero no se ejecutó: chequear logs Vercel filtrando por `path:/api/rechazos/sync` los días en cuestión.
- Si no aparece en Settings → Crons: re-deploy a producción (Vercel re-registra crons en cada deploy productivo).

## 2. Si Fausto cargó los chofer_id

Si el SQL `scripts/maintenance/cargar-choferes.sql` se aplicó (alguna de las 11 patentes ahora tiene `chofer_id` no NULL), correr un backfill liviano para que los rechazos históricos hereden el nombre del chofer vía COALESCE en queries:

```bash
cd /root/dpo-app
# Verificar primero que .env.local sigue apuntando a Pampeana
grep "^NEXT_PUBLIC_SUPABASE_URL" .env.local
# Debe imprimir: NEXT_PUBLIC_SUPABASE_URL="https://tpafgmbhnucdiavvxbcg.supabase.co"

# Re-correr el backfill — idempotente, ~17 min, pisa chofer NULL con el del mapeo
npx tsx scripts/maintenance/sync-rechazos-local.ts backfill 2026-03-01 $(date -u +%Y-%m-%d)
```

Después verificar:
```sql
SELECT count(*) FILTER (WHERE chofer IS NOT NULL) AS con_chofer,
       count(*) AS total
  FROM rechazos
 WHERE fecha >= '2026-03-01';
```

Debería pasar de ~3 (mapeo=0 en último backfill) a un % alto.

## 3. Arrancar PR 3: server action getRechazosComparado + mock visual

**Objetivo:** dashboard ejecutivo V1 con KPIs cards + evolución + Pareto motivos + ranking choferes/clientes + top productos + filtros + export. Antes de codear, mock ASCII para que Fausto valide el diseño.

**Pre-condiciones que ya están listas:**
- Schema con monto $, localidad/canal/supervisor → KPI "monto rechazado", "ticket promedio", filtros ✓
- `catalogo_rechazos` con categoría + controlable → KPI "% controlable" ✓
- `mapeo_patente_chofer` con chofer (si se completó en el paso 2) → ranking nominal ✓
- `sync_log` para mostrar última actualización en el header ✓
- 3.179 filas históricas con campos poblados ✓

**Scope V1 (confirmado en sesión):**
- DENTRO: KPI cards (6), evolución temporal, top motivos (Pareto), ranking patentes, ranking clientes, top productos, filtros básicos (fecha, fletero, cliente, motivo, producto), export CSV, monto $.
- FUERA / V2: heatmap por zona, tiempo de reposición, filtros zona/canal/supervisor, comparativa vs año anterior.

**Período anterior:** mes en curso vs mismo tramo del mes anterior; mes cerrado vs mes calendario anterior; rango custom vs rango de igual duración inmediatamente anterior. Toggle "vs año anterior" deshabilitado (gris + tooltip "Sin data suficiente") hasta que haya >= 6 meses comparables.

**Server action a escribir:** `getRechazosComparado(desde, hasta)` que devuelve en una sola pasada: período actual + período anterior alineado + deltas. Para no recalcular en cliente.

**Entregable previo a codear UI:** mock visual ASCII de la pantalla, con datos reales del histórico de Pampeana. Pause antes de escribir TSX.

## 4. Datos útiles para retomar contexto

```
Tenant: Pampeana
Supabase: https://tpafgmbhnucdiavvxbcg.supabase.co
Vercel: dpo-app (mercosurdrps-projects) → https://dpo-app-self.vercel.app
Cron: 0 6 * * * → /api/rechazos/sync (Bearer CRON_SECRET)
Total filas rechazos: 3.179 (marzo: 1.417, abril: 1.313, mayo al 11: 449)
Cobertura campos nuevos: 96% (128 NULL son SEGUNDA VUELTA / MOSTRADOR RAMALLO, esperado)
Foxtrot: desactivado en sync de rechazos (no aplica al caso)
```
