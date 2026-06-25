-- 159_mantenimiento_gastos.sql
-- Libro de gastos de flota / mantenimiento: facturas, boletas y caja chica.
-- Centraliza lo que hoy se lleva en un Excel + mail manual a contaduría.
-- Cada gasto guarda su mes de imputación para el seguimiento mensual y un
-- aviso automático (mail) al cargarse, para que contaduría lo registre/impute.
-- Módulo solo Pampeana (la flota de Misiones se gestiona en Cloudfleet).

BEGIN;

CREATE TABLE IF NOT EXISTS mantenimiento_gastos (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('factura', 'boleta', 'caja_chica')),
  fecha             date not null,                 -- fecha del comprobante
  mes_imputacion    text not null,                 -- 'YYYY-MM' al que se imputa
  proveedor         text,
  rubro             text,                          -- repuestos, combustible, taller, peajes, libreria, varios...
  monto             numeric(14,2) not null default 0,
  medio_pago        text check (medio_pago in ('efectivo', 'transferencia', 'tarjeta', 'cuenta_corriente')),
  numero_comprobante text,
  cuenta_contable   text,                          -- imputación contable
  centro_costo      text,
  dominio           text,                          -- opcional: unidad de la flota
  estado_pago       text not null default 'pendiente' check (estado_pago in ('pendiente', 'pagado')),
  estado_imputacion text not null default 'pendiente' check (estado_imputacion in ('pendiente', 'imputado')),
  mail_enviado      boolean not null default false,
  mail_enviado_at   timestamptz,
  mail_error        text,
  adjunto_urls      text[] not null default '{}',  -- foto/PDF del comprobante
  observaciones     text,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_mant_gastos_mes     ON mantenimiento_gastos (mes_imputacion);
CREATE INDEX IF NOT EXISTS idx_mant_gastos_tipo    ON mantenimiento_gastos (tipo);
CREATE INDEX IF NOT EXISTS idx_mant_gastos_dominio ON mantenimiento_gastos (dominio);
CREATE INDEX IF NOT EXISTS idx_mant_gastos_fecha   ON mantenimiento_gastos (fecha);

-- ───────────────────────── RLS (mismo patrón que mig 115) ─────────────────────────
-- Lectura: cualquier usuario autenticado. Escritura: admin / supervisor.
ALTER TABLE mantenimiento_gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mantenimiento_gastos_read ON mantenimiento_gastos;
CREATE POLICY mantenimiento_gastos_read ON mantenimiento_gastos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS mantenimiento_gastos_write ON mantenimiento_gastos;
CREATE POLICY mantenimiento_gastos_write ON mantenimiento_gastos
  FOR ALL TO authenticated
  USING (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin', 'supervisor'])))
  WITH CHECK (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin', 'supervisor'])));

-- ───────────────────────── Bucket de comprobantes ─────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('gastos-mantenimiento', 'gastos-mantenimiento', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "gastos_mant_storage_read" ON storage.objects;
CREATE POLICY "gastos_mant_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gastos-mantenimiento');

DROP POLICY IF EXISTS "gastos_mant_storage_insert" ON storage.objects;
CREATE POLICY "gastos_mant_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gastos-mantenimiento');

DROP POLICY IF EXISTS "gastos_mant_storage_delete" ON storage.objects;
CREATE POLICY "gastos_mant_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gastos-mantenimiento');

COMMIT;
