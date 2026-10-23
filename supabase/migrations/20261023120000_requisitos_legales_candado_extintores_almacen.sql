-- =============================================
-- Requisitos Legales · Candado para las categorías de Almacén
-- (Extintores depósito y Extintores de autoelevadores) — sólo Pampeana
-- =============================================
-- El 22/10/2026 un script con la clave de servicio volcó el padrón
-- `extintores` (copia congelada de julio) sobre requisitos_legales y creó
-- 13 extintores de depósito "vencidos" al lado de los 14 ya renovados el
-- 07/09/2026. Los de depósito y autoelevadores los renueva Almacén desde la
-- pantalla de Requisitos Legales; nadie más tiene que escribirlos.
--
-- Dos reglas, sólo para esas dos categorías:
--   1) Alta, cambio o baja únicamente por un usuario logueado en la app
--      (auth.uid() presente). La clave de servicio, un script o el editor
--      SQL no tienen uid → rebotan con un mensaje que explica el porqué.
--   2) No se admite un segundo requisito con el mismo nombre (normalizado:
--      sin "N°", sin "(Pampeana)", sin acentos ni signos) dentro de la
--      categoría. "N°N°1 · Oficinas delanteras (Pampeana)" es el mismo que
--      "N°1 Oficinas delanteras".
--
-- Para una carga excepcional (p. ej. desde esta misma PC con la service
-- role) se desactiva y reactiva el trigger:
--   ALTER TABLE requisitos_legales DISABLE TRIGGER trg_req_legales_candado_almacen;
--   ALTER TABLE requisitos_legales ENABLE  TRIGGER trg_req_legales_candado_almacen;
--
-- Aditiva e idempotente. Sólo DDL (función + trigger), no toca datos.
-- =============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.requisitos_legales_nombre_norm(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p_nombre, '')), 'áéíóúñü', 'aeiounu'),
               '\((pampeana|misiones)\)', '', 'g'),          -- sufijo de sede
             '(n[°º]\s*)+', 'n', 'g'),                       -- "N°N° 1" → "n1"
           '[^a-z0-9]', '', 'g');                            -- sólo letras y números
$$;

COMMENT ON FUNCTION public.requisitos_legales_nombre_norm(text) IS
  'Nombre comparable de un requisito legal: minúsculas, sin acentos, sin "N°", sin "(Pampeana)", sólo alfanumérico.';


CREATE OR REPLACE FUNCTION public.requisitos_legales_candado_almacen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug   text;
  v_nombre text := coalesce(NEW.nombre, OLD.nombre);
  v_dup    text;
BEGIN
  SELECT slug INTO v_slug
    FROM requisitos_legales_categorias
   WHERE id = coalesce(NEW.categoria_id, OLD.categoria_id);

  -- Sólo las categorías de Almacén
  IF v_slug IS NULL OR v_slug NOT IN ('extintores-depo', 'extintores-auto') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- 1) Sólo un usuario logueado en la app
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'Requisitos Legales: "%" (categoría %) pertenece a Almacén y se carga sólo desde la pantalla de Requisitos Legales de dpo-app por un usuario logueado. No se admite importación desde el padrón de extintores ni desde Excel (operación: %).',
      v_nombre, v_slug, TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- 2) Sin duplicados por nombre dentro de la categoría
  SELECT r.nombre INTO v_dup
    FROM requisitos_legales r
   WHERE r.categoria_id = NEW.categoria_id
     AND r.id <> NEW.id
     AND requisitos_legales_nombre_norm(r.nombre) = requisitos_legales_nombre_norm(NEW.nombre)
   LIMIT 1;

  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Requisitos Legales: "%" ya existe en la categoría % como "%". Renová ese requisito en lugar de crear otro.',
      NEW.nombre, v_slug, v_dup
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_req_legales_candado_almacen ON requisitos_legales;
CREATE TRIGGER trg_req_legales_candado_almacen
  BEFORE INSERT OR UPDATE OR DELETE ON requisitos_legales
  FOR EACH ROW EXECUTE FUNCTION public.requisitos_legales_candado_almacen();

COMMIT;
