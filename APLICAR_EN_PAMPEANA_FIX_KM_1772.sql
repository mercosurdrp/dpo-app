-- ============================================================================
-- OT 1772 (EI, cambio de las 4 traseras): el km va de 125.012 a 125.009
-- ----------------------------------------------------------------------------
-- La OT se cargó con 125.012 (la lectura del 16/09, lo único que había). El
-- odómetro real al momento del cambio es 125.009. Se corrige en los 17 lugares
-- donde viaja el mismo número: la OT, el km_instalacion de las 4 cubiertas
-- nuevas, los 8 movimientos, las 4 mediciones de montaje y las observaciones.
--
-- Sentencias sueltas, sin BEGIN/COMMIT y sin UNION.
-- ============================================================================

update mantenimiento_realizados set odometro = 125009, updated_at = now()
where id = 'f642d349-10b0-4c91-b783-b6ff158b40ef';

update mantenimiento_neumaticos set km_instalacion = 125009, updated_at = now()
where id in (
  'dc340731-61a9-493b-bc2b-27b25d93463f',   -- N° 80, 2DE
  'cb1807e6-60f3-47e8-ba3f-35ecc4c1c38d',   -- N° 81, 2DI
  'f88af699-a8cc-4ba5-b660-aad6e920fa1d',   -- N° 82, 2IE
  '5c1be8b4-197c-478d-a085-28f92dafbeb3'    -- N° 83, 2II
);

update mantenimiento_neumatico_movimientos set km = 125009
where fecha = '2026-09-15' and dominio = 'AE591EI' and km = 125012;

update mantenimiento_neumatico_mediciones set km = 125009
where fecha = '2026-09-15' and km = 125012
  and neumatico_id in (
    'dc340731-61a9-493b-bc2b-27b25d93463f',
    'cb1807e6-60f3-47e8-ba3f-35ecc4c1c38d',
    'f88af699-a8cc-4ba5-b660-aad6e920fa1d',
    '5c1be8b4-197c-478d-a085-28f92dafbeb3'
  );

-- La observación de las 4 que salieron también menciona el km
update mantenimiento_neumaticos
set observaciones = replace(observaciones, '125.012 km', '125.009 km'), updated_at = now()
where id in (
  '69b36634-c96a-44b2-bac3-f1af08acc863',   -- 27R
  '6bf19a2e-d509-4ec5-a837-ca267f76a9ad',   -- 28R
  'da2bb2aa-36e5-4445-ac4b-be0de8bed24e',   -- 29R
  '63af129f-7199-4bd9-a031-327c0a3a7c91'    -- 1131R
);


-- ============================================================================
-- VERIFICACIONES — correlas una por una. Tiene que decir 125009 en todas.
-- ============================================================================

-- A) La OT
select numero_ot, fecha, dominio, odometro, costo, costo_mano_obra
from mantenimiento_realizados
where id = 'f642d349-10b0-4c91-b783-b6ff158b40ef';

-- B) Las 4 cubiertas nuevas
select numero, posicion, marca, km_instalacion, profundidad_actual_mm
from mantenimiento_neumaticos
where numero in ('80','81','82','83')
order by numero;

-- C) Los 8 movimientos del día
select tipo, numero, posicion, km
from mantenimiento_neumatico_movimientos
where fecha = '2026-09-15' and dominio = 'AE591EI'
order by tipo, posicion;

-- D) Las 4 mediciones de montaje
select neumatico_id, profundidad_mm, presion_psi, km, origen
from mantenimiento_neumatico_mediciones
where fecha = '2026-09-15'
  and neumatico_id in (
    'dc340731-61a9-493b-bc2b-27b25d93463f',
    'cb1807e6-60f3-47e8-ba3f-35ecc4c1c38d',
    'f88af699-a8cc-4ba5-b660-aad6e920fa1d',
    '5c1be8b4-197c-478d-a085-28f92dafbeb3'
  );
