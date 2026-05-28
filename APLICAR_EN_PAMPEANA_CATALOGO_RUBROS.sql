-- =============================================
-- 081_presupuesto_catalogo_rubros.sql
-- Catálogo de rubros para clasificar tipo_costo (fijo/variable)
-- y asignar responsable por defecto al generar tareas desde el EERR.
-- =============================================

BEGIN;

-- ---------------------------------------------------------------
-- 1) Tabla catálogo de rubros (sin columna generada — índice funcional)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuesto_rubros_catalogo (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubro                    text NOT NULL,
  categoria                text NOT NULL,
  tipo_costo               text NOT NULL CHECK (tipo_costo IN ('fijo','variable')),
  responsable_default_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  activo                   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rubros_catalogo_norm
  ON presupuesto_rubros_catalogo (UPPER(BTRIM(rubro)));

CREATE INDEX IF NOT EXISTS idx_rubros_catalogo_categoria
  ON presupuesto_rubros_catalogo(categoria);

COMMENT ON TABLE presupuesto_rubros_catalogo IS
  'Catálogo de rubros del EERR. Cada rubro tiene tipo_costo y responsable default.';

-- ---------------------------------------------------------------
-- 2) Columna tipo_costo en presupuestos_tareas
-- ---------------------------------------------------------------
ALTER TABLE presupuestos_tareas
  ADD COLUMN IF NOT EXISTS tipo_costo text
    CHECK (tipo_costo IS NULL OR tipo_costo IN ('fijo','variable'));

-- ---------------------------------------------------------------
-- 3) Seed inicial (152 rubros, clasificados desde el EERR Pampeana 2026)
-- ---------------------------------------------------------------
INSERT INTO presupuesto_rubros_catalogo (rubro, categoria, tipo_costo, responsable_default_id)
VALUES
  ('SUTIAGA- DESCUENTO OBTENIDO POR CMQ', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SUELDO BRUTO', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('HORAS EXTRAS', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('ANTIGÜEDAD', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('PRESENTISMO', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ADIC POR BULTOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ADICIONAL POR ACTIVIDAD', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ADICIONAL POR COBRANZA', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('VARIABLE POR ALCANCE DE OBJETIVOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SAC', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('VACACIONES  Y PLUS VACACIONAL', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('GRATIFICACIONES', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('CARGAS SOCIALES', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('CONTRIBUCIONES GREMIALES', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ART', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SEGURO DE VIDA', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('OTROS CONCEPTOS NO REMUNERATIVOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('OTROS CONCEPTOS REMUNERATIVOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('PREPAGA', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SOBRECARGAS', 'ENTREGA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('AJUSTES CONCEPTOS SALARIOS', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SERVICIOS EXTERNOS', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ELEMENTOS DE SEGURIDAD PARA EL PERSONAL', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('CONSUMO PERSONAL', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('GASTOS MÉDICOS', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ROPA DE TRABAJO', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('CAPACITACIONES', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ATENCIONES AL PERSONAL Y REFRIGERIOS', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SELECCIÓN DE PERSONAL', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('RECONOCIMIENTO ADICIONAL DE PERSONAL', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('INCENTIVO AL PERSONAL', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('RECONOCIMIENTO HABITUAL DE MOVILIDAD Y VIÁTICOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('PASAJES Y TASAS DE EMBARQUE', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('REMISES', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('PEAJES', 'ENTREGA', 'variable', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('OTROS PEAJES', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('HOTELES', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('RECONOCIMIENTO EVENTUAL DE MOVILIDAD Y VIÁTICOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('INDEMNIZACIONES', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('PREAVISO', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('JUICIOS LABORALES', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('OTROS JUICIOS', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ESTUDIO JURÍDICO', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ESTUDIO LABORAL Y PREVISIONAL', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('ESTUDIO CONTABLE E IMPOSITIVO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('ESCRIBANÍA', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SERVICIOS DE CONSULTORÍA', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('OTROS HONORARIOS', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('COSTOS DE SUBCONTRATACIÓN DE FLOTA', 'ACARREO', 'variable', '41d38555-7a9b-454d-ae47-9afa3a7e5aa7'),
  ('RDF- DESC POR POSICION', 'ACARREO', 'variable', '41d38555-7a9b-454d-ae47-9afa3a7e5aa7'),
  ('PERSONAL TERCERIZADO', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('SERV DE LIMP Y DESINFECCIÓN', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('TRANSPORTE DE CAUDALES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SERVICIOS DE ALARMAS Y SEGURIDAD', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('RASTREO SATELITAL', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('SEGURIDAD PRIVADA', 'GENTE', 'variable', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('FLETES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SERVICIOS ADMINISTRATIVOS INTERCOMPAÑIA', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('CUOTA MENSUAL DE SISTEMAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('MANTENIMIENTO DE SISTEMAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('DESARROLLO Y PROGRAMACIÓN DE TERCEROS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('LICENCIAS DE SOFTWARE', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('INSUMOS DE COMPUTACIÓN Y TECNOLOGIAS', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('TELEFONÍA FIJA', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('TELEFONÍA MÓVIL', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('INTERNET', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('ELECTRICIDAD', 'INSTALACIONES', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('AGUA', 'INSTALACIONES', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('GAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('OTROS SERVICIOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('ALQUILERES DE INMUEBLES', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('ALQUILERES DE RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('ALQUILERES DE AUTOELEVADORES', 'ALMACEN', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('ALQUILERES DE MUEBLES Y ÚTILES', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE INMUEBLES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE ENVASES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE EQUIPOS DE FRÍO Y POP PESADO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE RODADOS', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE MAQUINARIAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE MUEBLES Y ÚTILES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES DE SISTEMAS Y TECNOLOGÍAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACIONES OTROS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('AMORTIZACION DE INSTALACIONES', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('REPAR. Y MANT. DE INSTALACIONES', 'INSTALACIONES', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('REPARACIÓN Y MANTENIMIENTO DE RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('ACCESORIOS DE SEGURIDAD PARA CAMIONES', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('STOCK DE TALLER', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('VTV VERIFICACION TECNICA', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('REPARACIÓN Y MANTENIMIENTO DE AUTOELEVADORES', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('REPAR. Y MANT. DE MUEBLES Y UTILES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('NEUMÁTICOS DE RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('NEUMÁTICOS DE AUTOELEVADORES', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('LAVADO DE RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('ELEMENTO DE SEGURIDAD RODADO', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('ELEMENTO DE SEGURIDAD INFRAESTRUCTURA', 'INSTALACIONES', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('REPARACIÓN Y MANTENIMIENTO DE VEHÍCULO', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('PUBLICIDAD Y MARKETING RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('COMBUSTIBLES - GASOIL', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('COMBUSTIBLE - UREA', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('COMBUSTIBLE - NAFTA', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('COMBUSTIBLE - VEHÍCULOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('LUBRICANTES Y ACEITES', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('SEGURO INTEGRAL', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SEGURO RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('SEGURO DE MERCADERÍAS EN TRÁNSITO', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SEGURO CONTRA ROBO DE EFECTIVO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SEGURO CONTRA INCENDIOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SEGURO DE MERCADERÍAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('OTROS SEGUROS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('PATENTES RODADOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('PATENTES DE VEHÍCULOS', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('SEGURO DE AUTOELEVADOR', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('IMPUESTO DE CUENTAS CORRIENTES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('IMPUESTO INMOBILIARIO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('TASA DE SEGURIDAD E HIGIENE', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('TASA DE ABASTO', 'ENTREGA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('OTRAS TASAS MUNICIPALES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('ABL', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('IMPUESTO A LOS INGRESOS BRUTOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('MULTAS DE TRÁNSITO DISTRIBUCIÓN', 'ENTREGA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('INTERESES IMPOSITIVOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('MULTAS VEHICULOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('IMPUESTO POR ACC Y PARTICIPAC EN SOC', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('OTROS IMPUESTOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('IMPUESTO DEBITOS Y CREDITOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('SENASA', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('IMPUESTO A LAS GANANCIAS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('GASTOS BANCARIOS', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('GASTOS ADM CHEQ RECHAZADO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('INTERESES BANCARIOS', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('INTERESES POR FINANCIACIÓN- PRESTAMOS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('DIFERENCIA DE CAMBIO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('COMISIÓN GTIA FINANCIERA', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('INTERESES POR FINANCIACIÓN-PLANES DE PAGO', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('ENVASE NO ACREDITABLE', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('DIFERENCIAS DE INVENTARIO', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('ROTURAS Y DERRAMES', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('PRODUCTO VENCIDO', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('FALTANTE DE ACARREO', 'ALMACEN', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('PAPELERÍA/LIBRERÍA', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('MENSAJERÍA Y ENCOMIENDAS', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('CARGOS POR BIENES NO ACTIVABLES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('GASTOS EN RELACIONES', 'GENTE', 'fijo', '03ae6cd9-58e8-4512-be8d-48102cc165d8'),
  ('OTROS', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('INSUMOS LOGISTICOS', 'ALMACEN', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('ELEMENTOS DE SEGURIDAD DEPOSITO', 'ALMACEN', 'fijo', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('SER LIMP Y DESINFECCIÓN ALMACEN', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('CUOTA MENSUAL DE SISTEMAS FLOTA', 'FLOTA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('CUOTA MENSUAL DE SISTEMAS ALMACEN', 'ALMACEN', 'variable', 'abde2766-605c-41de-a734-71f9e27cea69'),
  ('CUOTA MENSUAL DE SISTEMAS ENTREGA', 'ENTREGA', 'fijo', 'e579be0a-64ef-4572-8a55-c0fbfe03e57f'),
  ('ROBO EFECTIVO Y CHEQUES', 'ADMINISTRACION', 'fijo', '58b73552-4e3a-415c-bd6d-444a5e656a15'),
  ('BILLETES FALSOS', 'ADMINISTRACION', 'variable', '58b73552-4e3a-415c-bd6d-444a5e656a15')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------
ALTER TABLE presupuesto_rubros_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rubros_catalogo_select_auth" ON presupuesto_rubros_catalogo;
CREATE POLICY "rubros_catalogo_select_auth"
  ON presupuesto_rubros_catalogo FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rubros_catalogo_write_editors" ON presupuesto_rubros_catalogo;
CREATE POLICY "rubros_catalogo_write_editors"
  ON presupuesto_rubros_catalogo FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---------------------------------------------------------------
-- 5) GRANT explícito (cache PostgREST)
-- ---------------------------------------------------------------
GRANT ALL ON presupuesto_rubros_catalogo TO anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 6) Trigger updated_at
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_presupuesto_rubros_catalogo_updated_at
  ON presupuesto_rubros_catalogo;
CREATE TRIGGER trg_presupuesto_rubros_catalogo_updated_at
  BEFORE UPDATE ON presupuesto_rubros_catalogo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
