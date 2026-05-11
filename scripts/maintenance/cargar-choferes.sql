-- =====================================================================
-- Cargar chofer_id en las 11 patentes activas de Pampeana.
-- Generado 2026-05-11 después del backfill marzo→hoy (PR 1).
-- Pegar en https://supabase.com/dashboard/project/tpafgmbhnucdiavvxbcg/sql/new
-- =====================================================================
--
-- Pasos:
--   1. Descomentá el SELECT de abajo y corré para listar los choferes
--      disponibles con su UUID + nombre.
--   2. Para cada UPDATE: copiá el UUID que corresponda en el campo
--      `chofer_id`. Si no sabés quién maneja una patente, dejá el
--      UPDATE sin tocar (chofer_id queda NULL → el dashboard cae a
--      la patente vía COALESCE).
--   3. Corré los UPDATE que completaste.
--   4. Verificá:
--        SELECT mpc.patente, cc.nombre
--          FROM mapeo_patente_chofer mpc
--          LEFT JOIN catalogo_choferes cc ON cc.id = mpc.chofer_id;
--
-- =====================================================================
-- Catálogo de choferes (descomentar para listar)
-- =====================================================================

-- SELECT id, nombre FROM catalogo_choferes WHERE active = true ORDER BY nombre;

/* Snapshot 2026-05-11 (referencia rápida):
   78c8c7b7-cf44-442f-8e45-a32f39efcaac  ACOSTA ANGEL
   d42531f0-c033-4fc2-beb9-f5b1bc949714  ACOSTA JOEL
   e708df35-1469-4612-a111-e6e3216e743a  ALEJO BIASOLI
   71f2291b-2c0b-4771-ab48-cd1f3810a4e9  CERBIN ADRIAN EUCEBIO
   af0810ea-1e9e-4bca-8446-888c437498c4  CORDONE LUIS DARIO
   bb5674e2-69bc-4207-b5b7-a8b013eb26e8  DAVALOS PABLO
   d755950e-f182-4459-80ea-d887272f161d  ESCOBAR ROBERTO
   f128691e-0b0f-4ed9-9e33-9ac1415e4d0d  FERNANDEZ LUCAS
   8b322ad1-6f80-41a1-ae7c-28752f417b42  FRIAS ANGEL ERMINDO
   617b929e-7c4c-4a58-af79-6dadb78b88f4  OLAZAGOITIA GABRIEL
   df0d5998-bbdf-4475-9f07-b7d3f192c758  RIVERO EZEQUIEL
   c69b6641-69d1-40fe-98ee-084e61498298  RIVERO FEDERICO
   7489cac5-a48b-412f-8e1e-d9fe028c573b  RIVERO LAUREANO
   145660a3-50a6-470d-88f9-c05438b80e30  RODRIGUEZ MARCELO
   bf1fdb49-8418-4725-992d-f0d139d7f2d5  RODRIGUEZ WALTER
   d22494b3-ceb5-4f21-a2da-81c34f7bdca4  SANDOVAL ANTONIO
   5ad81452-c6c3-47fd-9c05-e88777819ec8  SEQUEIRA HUMBERTO
   1fa2821a-9ee2-469b-80eb-6137b75caf6b  SEQUEIRA WALTER
   c6fb3a82-ea2e-4c04-b89e-746ab8b7b2fe  TESEIRA HECTOR
   096c3a70-57c8-4967-a5f0-2533e108107c  ZACARIAS JUAN CARLO
   fd7cda39-6f72-4c74-9056-286ca0b16428  ZARATE ADRIAN
*/

-- =====================================================================
-- UPDATE statements — completar chofer_id por patente
-- =====================================================================

-- AF028YB · 207 rechazos abril · 22 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AF028YB';

-- AF469UR · 161 rechazos abril · 21 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AF469UR';

-- OJA403 · 168 rechazos abril · 24 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'OJA403';

-- AF664NY · 170 rechazos abril · 30 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AF664NY';

-- AE908DG · 110 rechazos abril · 31 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AE908DG';

-- AE908DH · 121 rechazos abril · 24 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AE908DH';

-- AE908DF · 116 rechazos abril · 21 viajes · (no aparece en catalogo_vehiculos)
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AE908DF';

-- AF399KY · 109 rechazos abril · 23 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AF399KY';

-- AE591EI · 29 rechazos abril · 3 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AE591EI';

-- AF588SU · 58 rechazos abril · 27 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AF588SU';

-- AC165AJ · 1 rechazo abril · 3 viajes · camion/distribucion
UPDATE mapeo_patente_chofer
   SET chofer_id = ''  -- pegar UUID acá
 WHERE patente = 'AC165AJ';

-- =====================================================================
-- Verificación
-- =====================================================================

SELECT mpc.patente,
       cc.nombre AS chofer
  FROM mapeo_patente_chofer mpc
  LEFT JOIN catalogo_choferes cc ON cc.id = mpc.chofer_id
 ORDER BY mpc.patente;
