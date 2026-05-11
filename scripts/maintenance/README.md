# scripts/maintenance/

Scripts operativos para backfills y rescates manuales. **No se importan desde el código de la app** y están excluidos del deploy a Vercel (`.vercelignore` los anchea).

## `sync-rechazos-local.ts`

Replica EXACTO la lógica de `POST /api/rechazos/sync` pero corre local desde CLI usando el `service_role` del `.env.local`. Bypassea el endpoint Vercel (que requiere sesión Supabase o `CRON_SECRET`) porque para backfills históricos:

- es más rápido (no hay HTTP, no hay límite de `maxDuration`),
- no rota el secret de cron por accidente,
- permite parar/reanudar día por día,
- escribe directo a la Supabase a la que apunte `.env.local` — **ojo con el tenant**.

### Pre-requisitos

`.env.local` debe tener seteado contra el tenant correcto:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CHESS_API_BASE_URL`, `CHESS_API_USER`, `CHESS_API_PASS`
- `chofer` se resuelve desde la tabla `mapeo_patente_chofer` (manual). Si la patente no está mapeada o el chofer_id queda NULL, el campo `rechazos.chofer` queda en NULL y el dashboard cae al display de patente vía COALESCE.

Antes de correrlo, **confirmá a qué Supabase apunta**:

```bash
grep ^NEXT_PUBLIC_SUPABASE_URL .env.local
# Pampeana: tpafgmbhnucdiavvxbcg.supabase.co
# Misiones: bvqmsrnrdrxprbggfziu.supabase.co
```

### Uso

```bash
cd /root/dpo-app

# Test idempotencia: corre el sync para un día ya sincronizado.
# Imprime conteos antes/después y verifica que created_at se preserve.
npx tsx scripts/maintenance/sync-rechazos-local.ts test 2026-04-29

# Backfill rango (inclusivo en ambos extremos)
npx tsx scripts/maintenance/sync-rechazos-local.ts backfill 2026-04-30 2026-05-11

# Día puntual (rango de 1)
npx tsx scripts/maintenance/sync-rechazos-local.ts backfill 2026-05-09 2026-05-09
```

### Salida típica del backfill

```
2026-04-30: R=36/36 V=9
2026-05-01: sin datos                ← feriado/domingo, Chess no devolvió ventas
2026-05-02: R=158/158 V=9
...
=== RESUMEN ===
Rechazos upsert total:        433
Ventas_diarias upsert total:  68
Días con error: (ninguno)
```

`R=A/B` significa "A upserts realizados sobre B rechazos válidos que devolvió Chess". `A < B` indica errores parciales (verá el detalle del último error en la línea).

### Cuándo usar el endpoint Vercel vs este script

| Caso | Usar |
|---|---|
| Sync diario automático | Cron Vercel → `POST /api/rechazos/sync` con header `Authorization: Bearer $CRON_SECRET` (Vercel lo agrega solo) |
| Script externo invocando el endpoint | `POST /api/rechazos/sync` con `Authorization: Bearer $CRON_SECRET` **o** `x-api-key: $CRON_SECRET` (cualquiera funciona) |
| Botón "Sincronizar" en la UI | Server action → endpoint con sesión Supabase |
| Backfill > 1 mes / históricos | **Este script** (más rápido, sin `maxDuration`) |
| Rescate cuando el endpoint está caído | **Este script** |

### Ojo

- Es destructivo de `created_at` solo para filas nuevas; las existentes se preservan (upsert por `(serie, nrodoc, id_articulo)` en rechazos y `(fecha, ds_fletero_carga)` en ventas_diarias).
- No corre `calcularKpisConClient` al final como sí hace el endpoint (que escribe `dpo_kpis`). Si necesitás recalcular KPIs después del backfill, corré el sync manual desde la UI para los meses tocados, o sumá esa lógica acá.
- Las filas con `bultos_rechazados = 0` del motivo `DEV X TRAMITES INTER` son ruido conocido — se filtran en el sync pero algunas histórico previas pueden quedar. Esto se limpia en queries del dashboard (V1).

## `CRON_SECRET` — para qué sirve

Es el secret que el cron de Vercel (`vercel.json`) usa para autenticarse contra `/api/rechazos/sync` cuando corre el sync diario. **No** es necesario para este script — el script usa `SUPABASE_SERVICE_ROLE_KEY` directo.

Para rotarlo:

```bash
openssl rand -hex 32
# pegá el output en Vercel env vars (Production + Preview) bajo CRON_SECRET
# y reemplazá el valor en .env.local si lo necesitás para invocar el endpoint manualmente.
```
