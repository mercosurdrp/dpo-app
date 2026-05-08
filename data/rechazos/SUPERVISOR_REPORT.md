# Supervisor Report: Rechazos Indicator for DPO App

**Date**: 2026-04-06
**Project**: /root/dpo-app/

---

## 1. Current App Architecture Summary

### Stack
- **Framework**: Next.js 16.2.1 (App Router) with React 19.2.4
- **Database**: Supabase (PostgreSQL via `@supabase/supabase-js` v2.100.1)
- **Styling**: Tailwind CSS v4 + shadcn components
- **Charts**: Recharts v3.8.1
- **Additional**: OpenAI (exam generation), xlsx (Excel parsing), mammoth (Word docs), pdf-parse, qrcode
- **Deployment**: Vercel (Next.js)

### Architecture Patterns
- **Server Actions** (`"use server"` in `/src/actions/`): All data fetching uses Next.js Server Actions, NOT API routes. There are 17 action files covering audits, plans, attendance, vehicles, capacitaciones, etc.
- **API Routes** (only 2 exist):
  - `POST /api/asistencia/marcas` -- external data sync endpoint (x-api-key auth, upserts attendance clock-in data)
  - `POST /api/generar-examen` -- OpenAI exam generation
- **Supabase clients**:
  - `createClient()` in `server.ts` -- cookie-based, RLS-aware, for authenticated user actions
  - `createAdminClient()` in `admin.ts` -- service-role key, bypasses RLS, used for external sync endpoints
- **Type definitions**: All in `/src/types/database.ts` (382 lines)
- **No `supabase/` directory** -- no local migration files; schema managed externally or via Supabase dashboard

### Existing Indicators Structure
Located at `/src/app/(dashboard)/indicadores/`:

| Indicator | Pattern | Data Source |
|-----------|---------|-------------|
| **TML** (Tiempo Medio de Liberacion) | Server Action + Client component (~400 lines) | `registros_vehiculos` table (manual entry via form) |
| **Asistencia Matinal** | Server Action + Client component (~350 lines) | `asistencia_marcas` table (synced via API route) |
| **Puntualidad Pre-Ruta** | Server Action + Client component (~300 lines) | Same `asistencia_marcas` table |
| **Per-Pilar indicators** | Generic `indicadores` table linked to `preguntas` | Manual entry via audit scoring |

**Common indicator page pattern**:
1. `page.tsx` (server component) -- calls Server Action, handles errors, passes data to client
2. `*-client.tsx` (client component) -- charts via Recharts, date pickers, tables, badges
3. Corresponding Server Action in `/src/actions/` -- queries Supabase, computes aggregates

### Existing Data Import Pattern (Key Reference)
The `POST /api/asistencia/marcas` route is the **closest precedent** for rechazos sync:
- Uses `x-api-key` header authentication (hardcoded fallback: `mercosur-dpo-sync-2026`)
- Uses `createAdminClient()` (service role, bypasses RLS)
- Accepts JSON array of records
- Does upsert with `onConflict` to handle duplicates
- Returns `{ success, insertadas, repetidas, errores, total }`
- Iterates records one-by-one (not batch insert)

---

## 2. Risks and Considerations

### 2.1 Vercel Serverless Function Timeouts
- **Hobby plan**: 10s timeout; **Pro plan**: 60s timeout
- The Chess ERP ventas endpoint returns ~1,743 records per day (~0.2 MB for the filtered sample, but the full detallado response is ~10.8 MB per day based on the sample file)
- If syncing 30 days at once: ~52,000 records, ~325 MB -- **will definitely exceed timeout and memory limits**
- **Recommendation**: Sync one day at a time. Each daily sync should complete well within 10s for the API call + DB upserts if only storing rechazo records (~29/day in the sample, not all 1,743)

### 2.2 Data Volume and Storage
- Full ventas: ~1,743 records/day, ~43,575/month
- Rechazos only: ~29/day (1.7% rejection rate), ~725/month
- **Recommendation**: Only store rechazo records in Supabase, not all ventas. This reduces storage by 98% and keeps queries fast
- For the denominator (% rechazos), store a daily summary row with total deliveries count

### 2.3 Chess ERP API Authentication
- Requires session-based auth (`POST /auth/login` returns `sessionId` cookie)
- Session may expire -- need to handle re-authentication
- Credentials should be stored as Vercel environment variables, never in code
- The API call itself (`GET /ventas/?fechaDesde=...&fechaHasta=...&detallado=true`) returns ALL document types; filtering for rechazos happens client-side/server-side

### 2.4 GESCOM Integration
- GESCOM uses OAuth2 password grant (different auth flow)
- GESCOM ventas have a different structure (`estado`, `codigoMotivoCambio` instead of `idRechazo`)
- The sample GESCOM file is empty (`[]`) -- may not have rechazo data in the same format
- **Recommendation**: Start with Chess ERP only; GESCOM integration can be added later if needed

### 2.5 Supabase RLS
- The existing `asistencia_marcas` sync route uses `createAdminClient()` to bypass RLS
- Rechazos data should follow the same pattern for sync
- For reading data in the indicator page, use `createClient()` (cookie-based) with appropriate RLS policies
- Need to create RLS policies that allow authenticated users to read rechazos data

### 2.6 Sync Strategy
- **Daily sync** is the most practical approach, matching the Chess ERP data granularity
- Options:
  1. **Manual trigger**: Button in admin panel (simplest, follows existing patterns)
  2. **Cron job**: Vercel Cron or external scheduler hitting the API route daily
  3. **On-demand**: User navigates to rechazos page, system checks if today's data exists, fetches if not
- **Recommendation**: Start with a manual sync button + API route (matching the asistencia pattern), add cron later
- Include a `last_synced_at` tracking mechanism

### 2.7 Idempotency
- The existing pattern uses `upsert` with `onConflict` -- rechazos should do the same
- Natural key for rechazos: `(serie, nrodoc, idArticulo)` or `(idDocumento, serie, nrodoc, idArticulo)` -- each credit note line item is unique
- Must handle the case where a rechazo is later annulled (`anulado = "SI"`)

---

## 3. Recommendations for the Team

### 3.1 Database Schema
Create two tables:
1. **`rechazos`** -- one row per rejected line item (article per credit note)
   - Key fields: fecha, serie, nrodoc, id_rechazo, ds_rechazo, id_cliente, nombre_cliente, id_articulo, ds_articulo, cantidades_rechazo, subtotal_neto, id_vendedor, ds_vendedor, id_fletero, ds_fletero, planilla_carga, anulado
   - Natural key for upsert: `(serie, nrodoc, id_articulo)`
2. **`rechazos_resumen_diario`** -- one row per day with aggregates
   - Fields: fecha, total_entregas, total_rechazos, monto_total_rechazos
   - Enables fast % calculation without scanning all records

### 3.2 API Route Pattern
Follow the `/api/asistencia/marcas` pattern exactly:
- `POST /api/rechazos/sync` -- accepts `{ fechaDesde, fechaHasta }`, calls Chess API, upserts into Supabase
- Use `createAdminClient()` for DB operations
- Use `x-api-key` authentication
- Add Chess ERP credentials as env vars: `CHESS_API_URL`, `CHESS_API_USER`, `CHESS_API_PASSWORD`

### 3.3 Indicator Page
Follow the TML/Puntualidad pattern:
- Server Action in `/src/actions/rechazos.ts`
- Page at `/src/app/(dashboard)/indicadores/rechazos/page.tsx`
- Client component `rechazos-client.tsx` with:
  - Daily % rechazos chart (line or bar)
  - Breakdown by reason (pie/bar chart)
  - Breakdown by fletero/chofer (table)
  - Detail table with individual rechazos
- Add card to `indicadores-landing-client.tsx` in the "KPIs Operativos" section

### 3.4 Implementation Order
1. Database tables + RLS policies (Supabase dashboard)
2. Type definitions in `database.ts`
3. API route for sync (`/api/rechazos/sync`)
4. Server Action for data retrieval (`/src/actions/rechazos.ts`)
5. Indicator page + client component
6. Landing page card
7. (Future) Cron job for daily auto-sync

### 3.5 Things to Avoid
- Do NOT fetch all ventas and store them -- only store rechazos
- Do NOT use batch inserts of 1,743+ records in a single Supabase call -- use chunked upserts (the existing pattern iterates one-by-one, but batches of 50-100 would be better)
- Do NOT hardcode Chess credentials -- use environment variables
- Do NOT create a separate `supabase/` migrations directory -- the project doesn't use one; manage schema via Supabase dashboard

---

## 4. Open Questions for Francisco

1. **Scope**: Chess ERP only, or also GESCOM? (Recommendation: Chess first)
2. **KPI definition**: Is the % rechazos calculated as `rechazos / total entregas` or `rechazos / total facturas`? Need to confirm the denominator
3. **Historical data**: How far back should we sync? (Recommendation: start with current month, backfill as needed)
4. **Meta (target)**: What is the target % for rechazos? This is needed for the indicator display
5. **Pilar assignment**: Which DPO pilar does this indicator belong to? Likely "Entrega" based on the existing structure
6. **Access control**: Who should see rechazos data? All users or only admin/auditor roles?
