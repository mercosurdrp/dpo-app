-- =====================================================================
-- CONSTANCIA — YA EJECUTADO el 07/10/2026 contra Pampeana. NO correr de nuevo.
-- Imputacion al certificado de disposicion final de Kumen Co S.A. de las
-- cubiertas que fueron a disposicion sin amparo (DPO Flota 1.4 / R1.4.2).
-- =====================================================================
--
-- POR QUE: R1.4.2 exige seguimiento electronico de la eliminacion de neumaticos
-- con fecha, material y proveedor, y el "como verificar" pide el certificado de
-- descarte con el numero de fuego de cada cubierta. Habia 4 cubiertas dadas de
-- baja el 24/09/2026 como "enviada a la desechadora" sin ningun retiro asociado
-- -o sea, salieron del CD sin evidencia- y 1 esperando en la bandeja.
--
-- El certificado de Kumen Co S.A. ampara 300 unidades y se va descontando, asi
-- que lo que correspondia era imputarlas, no pedir un papel nuevo.
--
-- DOS retiros y no uno, a proposito: la fecha de eliminacion tiene que ser el
-- dia en que salio el material. Las 4 salieron el 24/09 y la 1131 sale el 08/10
-- (indicacion del Gestor de Flota el 07/10). Las 4 conservan su fecha de baja
-- original: el dia en que se fue la goma no lo reescribe el dia en que se carga
-- el papel.
--
-- Hecho con un script node contra PostgREST, replicando exactamente lo que hace
-- `registrarRetiroRecicladora` (residuo + residuo_id en la cubierta + movimiento
-- 'retiro_reciclado'). Queda como SQL para dejar asentado que se toco.
-- =====================================================================

-- Retiro 1 — 24/09/2026, 4 cubiertas (residuo 9615e182-9bdc-43d8-8ca1-8d58975393cd)
--   1131R  PIRELLI recauchutada 275/80R22.5
--   28R    PIRELLI recauchutada 275/80R22.5
--   s/n    PIRELLI FR:01        235/75R17.5
--   s/n    Fate DR              275/80R22.5
-- Las dos sin numerar quedaron descritas en la observacion del retiro, porque
-- `numeros_fuego` solo puede listar las que tienen numero.

-- Retiro 2 — 08/10/2026, 1 cubierta (residuo c2ee33a7-da3f-45ef-abbe-408e8391f28d)
--   1131   Pirelli TR 88 275/80R22.5 — estaba en la bandeja "para desechar"
--          (2,10 mm, sin goma para recapar). Paso a baja con fecha 08/10/2026.

-- ---------------------------------------------------------------------
-- Estado resultante (verificado el 07/10/2026)
-- ---------------------------------------------------------------------
-- Registro de disposicion de residuos:
--   2026-08-21   3 un   Kumen Co S.A.   fuego: TMP_19, 9, 29R
--   2026-09-24   4 un   Kumen Co S.A.   fuego: 1131R, 28R (+2 sin numerar)
--   2026-10-08   1 un   Kumen Co S.A.   fuego: 1131
-- Certificado de Kumen: 8 de 300 unidades usadas, quedan 292.
-- Cubiertas a disposicion sin certificado: 0.

-- Control para volver a verificar en cualquier momento:
select
  (select count(*) from mantenimiento_neumaticos
    where estado in ('baja', 'para_desecho')
      and residuo_id is null
      and coalesce(motivo_baja, '') not ilike '%Misiones%')      as sin_certificado,
  (select coalesce(sum(cantidad), 0) from mantenimiento_residuos
    where certificado_path = 'residuos/20260821-cdf_Mercosur.pdf') as usadas_del_certificado;
