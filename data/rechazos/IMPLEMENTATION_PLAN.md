# Rechazos Indicator - Implementation Plan

## 1. Context & Goal

Add a "Rechazos" (delivery rejections/returns) KPI indicator to the DPO app. The data source is Chess ERP's `/ventas/` endpoint, which returns sales documents including credit notes with rejection reasons. The goal is to track rejection rates per chofer (delivery driver) with daily/monthly views and trend analysis.

---

## 2. Data Source Analysis

### Chess API - Ventas Endpoint

**URL**: `GET /ventas/?fechaDesde={yyyy-MM-dd}&fechaHasta={yyyy-MM-dd}&detallado=true`
**Base**: `https://mercosurpampeana.chesserp.com/AR910/web/api/chess/v1`

From `data/rechazos/sample_ventas_chess.json`, rejection records are identified by:

| Field | Description | Example |
|---|---|---|
| `idDocumento` | Document type | `"DVVTA"` (Nota de Credito) |
| `dsDocumento` | Document description | `"NOTA DE CREDITO"` |
| `idRechazo` | Rejection reason ID | `9` (0 = no rejection) |
| `dsRechazo` | Rejection reason text | `"PRODUCTO NO APTO"` |
| `cantidadesRechazo` | Rejected quantity | `0.0833333333` |
| `idFleteroCarga` | Driver/vehicle ID | `21` |
| `dsFleteroCarga` | Vehicle plate (patente) | `"AF588SU"` |
| `planillaCarga` | Load sheet number | `"0000 - 00016485"` |
| `idCliente` / `nombreCliente` | Customer | |
| `idArticulo` / `dsArticulo` | Product | |
| `subtotalNeto` | Net amount (negative for credits) | `-1886.057` |
| `fechaComprobate` | Document date | `"2026-04-01"` |
| `fechaLiquidacion` | Settlement date | |
| `dsVendedor` | Salesperson | |
| `dsSucursal` | Branch | |
| `dsDeposito` | Warehouse | |
| `dsArea` | Product area (ALCOHOL, etc.) | |

**Key logic**: A record is a rejection when `idRechazo > 0` (or `dsRechazo` is not empty). The `cantidadesRechazo` field holds the rejected quantity. Credit notes (`DVVTA`) with rejection reasons represent goods returned during delivery.

---

## 3. Database Design

### Migration: `013_rechazos.sql`

```sql
-- =============================================
-- Rechazos: delivery rejections from Chess ERP
-- =============================================

CREATE TABLE rechazos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Document identification (from Chess)
  id_documento TEXT NOT NULL,          -- "DVVTA"
  ds_documento TEXT NOT NULL,          -- "NOTA DE CREDITO"
  letra TEXT,                          -- "A", "B"
  serie INT,
  nrodoc INT NOT NULL,
  
  -- Rejection info
  id_rechazo INT NOT NULL,            -- Chess rejection reason ID
  ds_rechazo TEXT NOT NULL,            -- "PRODUCTO NO APTO", "DEVOLUCION", etc.
  
  -- Dates
  fecha_comprobante DATE NOT NULL,
  fecha_liquidacion DATE,
  
  -- Driver/Vehicle (fletero)
  id_fletero INT NOT NULL,            -- Chess fletero ID
  ds_fletero TEXT NOT NULL,            -- Vehicle plate "AF588SU"
  planilla_carga TEXT,                -- "0000 - 00016485"
  
  -- Customer
  id_cliente INT NOT NULL,
  nombre_cliente TEXT NOT NULL,
  
  -- Product
  id_articulo INT NOT NULL,
  ds_articulo TEXT NOT NULL,
  ds_area TEXT,                       -- "ALCOHOL", etc.
  
  -- Seller/Supervisor
  id_vendedor INT,
  ds_vendedor TEXT,
  id_supervisor INT,
  ds_supervisor TEXT,
  
  -- Quantities & amounts
  cantidad_rechazo NUMERIC(14,6) NOT NULL DEFAULT 0,
  unidades_solicitadas NUMERIC(14,6),
  subtotal_neto NUMERIC(14,4),
  subtotal_final NUMERIC(14,4),
  
  -- Metadata
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicates: same document can't be inserted twice
  UNIQUE(id_documento, letra, serie, nrodoc, id_articulo)
);

-- Indexes for common queries
CREATE INDEX idx_rechazos_fecha ON rechazos(fecha_comprobante);
CREATE INDEX idx_rechazos_fletero ON rechazos(id_fletero);
CREATE INDEX idx_rechazos_ds_fletero ON rechazos(ds_fletero);
CREATE INDEX idx_rechazos_rechazo ON rechazos(id_rechazo);
CREATE INDEX idx_rechazos_cliente ON rechazos(id_cliente);
CREATE INDEX idx_rechazos_fecha_fletero ON rechazos(fecha_comprobante, id_fletero);

-- RLS
ALTER TABLE rechazos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read rechazos"
  ON rechazos FOR SELECT
  TO authenticated
  USING (true);

-- Only service role / API can insert (no user inserts)
CREATE POLICY "Service can insert rechazos"
  ON rechazos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================
-- Lookup table: rejection reason catalog
-- Populated automatically from synced data
-- =============================================

CREATE TABLE catalogo_rechazos (
  id INT PRIMARY KEY,                 -- idRechazo from Chess
  descripcion TEXT NOT NULL,          -- dsRechazo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE catalogo_rechazos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read catalogo_rechazos"
  ON catalogo_rechazos FOR SELECT TO authenticated USING (true);
```

### Why this schema

- **Flat denormalized table**: Follows the same pattern as `asistencia_marcas` -- store the raw data with enough context to avoid joins. Driver name (plate), customer name, product name are all stored directly.
- **UNIQUE constraint on document+article**: Prevents duplicate imports when re-syncing overlapping date ranges.
- **`id_fletero` + `ds_fletero`**: Maps to the chofer/vehicle. In Chess, `dsFleteroCarga` is the vehicle plate (patente), and `idFleteroCarga` is the numeric ID. The app already has `catalogo_choferes` and `catalogo_vehiculos` with plates, so we can cross-reference if needed.
- **`catalogo_rechazos`**: Small lookup table for rejection reason types, auto-populated during sync.

---

## 4. Data Ingestion - Recommended Approach

### Recommendation: **Option D (API route)** + **Option A (on-demand server action)**

A hybrid approach:

### 4a. Primary: API Route `/api/rechazos/sync` (for automation)

Create a Next.js API route that:
1. Receives a POST with `{ fechaDesde, fechaHasta }` (or defaults to yesterday/today)
2. Authenticates via `x-api-key` header (same pattern as `/api/asistencia/marcas`)
3. Calls Chess ERP API directly from the server:
   - `POST /auth/login` to get session
   - `GET /ventas/?fechaDesde=...&fechaHasta=...&detallado=true`
4. Filters records where `idRechazo > 0`
5. Upserts into `rechazos` table via Supabase admin client
6. Auto-populates `catalogo_rechazos`

**Why this is best**:
- No external Python script needed -- the app itself fetches from Chess
- Can be called by Vercel Cron (daily at 6am Argentina) or manually
- The Chess API credentials are already known and documented
- Follows the existing `/api/asistencia/marcas` pattern for external data ingestion
- Uses `createAdminClient()` (service role) to bypass RLS

### 4b. Secondary: Server action for on-demand sync from UI

A "Sync Now" button on the dashboard that triggers the same logic as the API route but through a server action. This lets admins manually re-sync if needed.

### 4c. Vercel Cron (daily automation)

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/rechazos/sync",
    "schedule": "0 9 * * *"
  }]
}
```
(9:00 UTC = 6:00 Argentina time, after the previous day's data is settled)

The cron hits the API route with a special cron secret for auth. This is Vercel's built-in cron support -- no external scheduler needed.

### Why NOT the other options

- **Option B (external cron)**: Unnecessary complexity when Vercel has built-in crons
- **Option C (Excel upload)**: Manual, error-prone, defeats the automation goal
- **Option D only (Python pushes)**: Would work but adds a dependency on running the Python script somewhere. Better to have the app pull directly.

---

## 5. Server Actions

File: `src/actions/rechazos.ts`

```typescript
// Types
interface RechazoResumen {
  id_fletero: number
  ds_fletero: string       // plate
  total_rechazos: number   // count of rejection documents
  cantidad_total: number   // sum of cantidadRechazo
  monto_total: number      // sum of subtotalNeto (absolute)
  por_motivo: { id_rechazo: number; ds_rechazo: string; count: number }[]
}

interface RechazosDiario {
  fecha: string
  total_rechazos: number
  cantidad_total: number
  monto_total: number
  por_fletero: RechazoResumen[]
}

interface RechazosMensual {
  fecha: string  // day
  total_rechazos: number
  monto_total: number
}
```

### Actions needed:

| Action | Purpose |
|---|---|
| `getRechazosKpis(filters?)` | Global KPIs: total rechazos, monto, top motivos, top fleteros, trend |
| `getRechazosDiario(fecha)` | Detail for one day: breakdown by fletero with product-level detail |
| `getRechazosMensual(mes, anio)` | Daily totals for the month (for the bar chart) |
| `getRechazosPorFletero(idFletero, mes, anio)` | Drill-down: one driver's rejection history |
| `syncRechazosFromChess(fechaDesde, fechaHasta)` | Calls Chess API, upserts data. Used by both API route and UI button |
| `getMotivosRechazo()` | List all rejection reason types from catalogo_rechazos |

All follow the existing pattern: `"use server"`, `createClient()`, return `{ data } | { error }`.

---

## 6. API Route

File: `src/app/api/rechazos/sync/route.ts`

```
POST /api/rechazos/sync
Headers: x-api-key: {RECHAZOS_API_KEY}
Body (optional): { fechaDesde?: string, fechaHasta?: string }
```

Logic:
1. Validate API key (env var `RECHAZOS_API_KEY`)
2. For Vercel Cron: also accept `Authorization: Bearer {CRON_SECRET}`
3. Default date range: yesterday to today
4. Login to Chess ERP, fetch ventas
5. Filter where `idRechazo > 0` and `anulado === "NO"`
6. Map to `rechazos` table schema
7. Upsert via `createAdminClient()`
8. Return `{ insertadas, actualizadas, errores }`

### Environment variables needed:
- `CHESS_API_BASE_URL` (already known)
- `CHESS_API_USER` (already known: `dcepeda1`)
- `CHESS_API_PASSWORD` (already known: `1234`)
- `RECHAZOS_API_KEY` (new, for sync endpoint auth)
- `CRON_SECRET` (Vercel provides this automatically for cron jobs)

---

## 7. UI Design

### Page: `/indicadores/rechazos/`

Files:
- `src/app/(dashboard)/indicadores/rechazos/page.tsx` (server component)
- `src/app/(dashboard)/indicadores/rechazos/rechazos-client.tsx` (client component)

### Layout (follows puntualidad/tml pattern):

**Back link** -> "Volver a Indicadores"

**KPI Cards row** (4 cards):
1. **Rechazos Hoy**: count + monto, color-coded vs meta
2. **Promedio Mes**: average daily rejections
3. **Top Motivo**: most frequent rejection reason
4. **Tendencia**: up/down/stable based on last 5 days

**Bar Chart**: Daily rejection count for the month (with month navigator)
- Red bars for days above threshold, green for below
- Reference line at target (meta)

**Pie/Donut Chart**: Breakdown by rejection reason (`dsRechazo`)

**Table: Ranking por Fletero** (the main deliverable):
| Patente | Rechazos | Cantidad | Monto | Principal Motivo | % del Total |
|---------|----------|----------|-------|------------------|-------------|

**Drill-down**: Click a fletero row to see their detailed rejection list (dates, customers, products, amounts)

### Landing page update

Add to `indicadores-landing-client.tsx` in the "KPIs Operativos" section:
```tsx
<Link href="/indicadores/rechazos">
  <Card>
    <PackageX icon /> // or RotateCcw
    "% Rechazos"
    "Devoluciones por Chofer -- Pilar Entrega"
  </Card>
</Link>
```

---

## 8. Types

Add to `src/types/database.ts`:

```typescript
export interface Rechazo {
  id: string
  id_documento: string
  ds_documento: string
  letra: string | null
  serie: number | null
  nrodoc: number
  id_rechazo: number
  ds_rechazo: string
  fecha_comprobante: string
  fecha_liquidacion: string | null
  id_fletero: number
  ds_fletero: string
  planilla_carga: string | null
  id_cliente: number
  nombre_cliente: string
  id_articulo: number
  ds_articulo: string
  ds_area: string | null
  id_vendedor: number | null
  ds_vendedor: string | null
  id_supervisor: number | null
  ds_supervisor: string | null
  cantidad_rechazo: number
  unidades_solicitadas: number | null
  subtotal_neto: number | null
  subtotal_final: number | null
  synced_at: string
}

export interface CatalogoRechazo {
  id: number
  descripcion: string
  created_at: string
}
```

---

## 9. Chess API Integration Module

Create a reusable module since this is the first Chess API integration in the codebase:

File: `src/lib/chess-api.ts`

```typescript
// Chess ERP API client
// Handles authentication and common endpoints

interface ChessSession {
  sessionId: string
  expiresAt: number
}

let cachedSession: ChessSession | null = null

export async function getChessSession(): Promise<string> { ... }
export async function fetchVentas(fechaDesde: string, fechaHasta: string): Promise<VentaChess[]> { ... }
```

This module is valuable because other indicators may need Chess data in the future (e.g., efectividad de entrega, cobertura).

---

## 10. Implementation Order

| Step | Files | Effort |
|------|-------|--------|
| 1. Migration | `supabase/migrations/013_rechazos.sql` | Small |
| 2. Types | `src/types/database.ts` (add interfaces) | Small |
| 3. Chess API lib | `src/lib/chess-api.ts` | Medium |
| 4. API route | `src/app/api/rechazos/sync/route.ts` | Medium |
| 5. Server actions | `src/actions/rechazos.ts` | Medium |
| 6. UI - page | `src/app/(dashboard)/indicadores/rechazos/page.tsx` | Small |
| 7. UI - client | `src/app/(dashboard)/indicadores/rechazos/rechazos-client.tsx` | Large |
| 8. Landing update | `src/app/(dashboard)/indicadores/indicadores-landing-client.tsx` | Small |
| 9. Vercel cron | `vercel.json` | Small |
| 10. Env vars | Vercel dashboard | Small |

**Total estimated effort**: 1 session of focused work.

---

## 11. Key Decisions & Notes

1. **Fletero = Vehicle plate, not driver name**: In Chess, `dsFleteroCarga` is the patente (e.g., "AF588SU"). The existing `catalogo_vehiculos` table has plates. We can join to get a human-friendly name if `catalogo_choferes` is linked, but the primary key for grouping is the plate number.

2. **Rejection filter logic**: `idRechazo > 0` AND `anulado === "NO"`. Documents with `idRechazo === 0` are normal sales. Anulado documents should be excluded.

3. **Amounts are negative**: Credit notes in Chess have negative `subtotalNeto`. Store as-is but display absolute values in the UI.

4. **Idempotent sync**: The UNIQUE constraint on `(id_documento, letra, serie, nrodoc, id_articulo)` ensures re-running the sync for the same date range doesn't create duplicates. Use `upsert` with `onConflict`.

5. **No dependency on `empleados` table**: Rechazos uses `idFleteroCarga/dsFleteroCarga` from Chess, not the `empleados.legajo` system used for attendance. These are different identifiers. Cross-referencing could be added later via `catalogo_choferes`.

6. **Vercel cron limitations**: Free tier gets 1 cron, Pro gets unlimited. The cron runs daily and syncs the previous day's data. For historical backfill, use the manual sync button with a custom date range.
