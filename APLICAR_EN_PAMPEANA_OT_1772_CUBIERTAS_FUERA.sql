-- OT 1772 (AE591EI, 15/09/2026): las 4 cubiertas Dayton estaban contadas dos veces.
--
-- La OT traía DOS comprobantes: Marsilli $1.847.933 (las 4 cubiertas) y Pozzi
-- $100.000 (la mano de obra del cambio), y además las mismas 4 cubiertas como
-- repuestos. Como el costo de cabecera sale de la suma de comprobantes, la OT
-- quedó en $1.947.933 — pero esas mismas 4 cubiertas ya tienen su costo unitario
-- en `mantenimiento_neumaticos` (N° 80 a 83, $461.983,25 cada una), que es de
-- donde lo lee el módulo de Neumáticos.
--
-- Criterio que queda: el FIERRO (cubierta nueva y recapado) se imputa en
-- Neumáticos; la OT de mantenimiento se queda con la MANO DE OBRA. Así los dos
-- totales se pueden sumar sin pisarse. El EI era el único caso: las cubiertas
-- del AE908DF (OT 1744) y de la AF199RE (OT 1745) ya estaban así, con la OT
-- cargada sólo con el montaje.
--
-- La factura de Marsilli no se pierde: pasa a las 4 cubiertas, que es donde
-- ahora vive su costo.

begin;

-- 1) La factura de Marsilli queda adjunta a las 4 cubiertas que pagó.
update mantenimiento_neumaticos
   set factura_urls = array[
         'https://tpafgmbhnucdiavvxbcg.supabase.co/storage/v1/object/public/mantenimiento-evidencias/AE591EI/1789657518858-0-FA-A_00012-00034496__1_.pdf'
       ]
 where dominio = 'AE591EI'
   and numero in ('80', '81', '82', '83');

-- 2) Las cubiertas dejan de ser repuestos de la OT (no tenían movimiento de
--    pañol asociado, así que no hay stock que reponer).
delete from mantenimiento_realizado_repuestos
 where mantenimiento_id = 'f642d349-10b0-4c91-b783-b6ff158b40ef'
   and descripcion like 'Cubierta Dayton 275/80R22.5 N°%';

-- 3) Y el comprobante de Marsilli sale de la OT.
delete from mantenimiento_realizado_facturas
 where id = '5172b21b-2ad5-4807-af4c-3f7d3a5a9705';

-- 4) La OT queda con la mano de obra de Pozzi.
update mantenimiento_realizados
   set costo = 100000,
       observaciones = concat_ws(
         E'\n',
         nullif(observaciones, ''),
         'Las 4 cubiertas Dayton 275/80R22.5 (N° 80 a 83, factura Marsilli FA-A 00012-00034496, $1.847.933) se imputan en el módulo de Neumáticos, no en esta OT: acá queda la mano de obra del cambio (Pozzi, $100.000). Antes estaban en los dos lados y el costo se contaba dos veces.'
       )
 where id = 'f642d349-10b0-4c91-b783-b6ff158b40ef';

commit;
