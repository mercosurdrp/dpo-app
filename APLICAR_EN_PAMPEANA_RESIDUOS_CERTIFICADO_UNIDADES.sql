-- ============================================================================
-- Contador del certificado de disposición final
-- ----------------------------------------------------------------------------
-- 🚨 CORRER ESTO ANTES DE USAR EL PANEL DE DESECHO con la versión nueva: sin la
-- columna, registrar un retiro falla.
--
-- El operador no entrega un certificado por retiro: entrega uno que ampara una
-- cantidad de unidades y se va descontando. Con esta columna el panel lleva la
-- cuenta ("6 de 300 usadas · quedan 294") y avisa cuándo pedir el próximo.
-- ============================================================================

alter table mantenimiento_residuos
  add column if not exists certificado_unidades integer;

comment on column mantenimiento_residuos.certificado_unidades is
  'Unidades que declara cubrir el certificado de disposición final. Se carga una vez, en el retiro que sube el archivo, y sirve de tope para los retiros que reusan el mismo certificado.';

-- ----------------------------------------------------------------------------
-- El certificado que ya está cargado (21/08/2026, Kumen Co S.A., 4 cubiertas):
-- ponele el tope que declara el papel. Dejé 300 porque es lo que me dijiste,
-- CAMBIALO por el número exacto del certificado antes de correr.
-- ----------------------------------------------------------------------------
update mantenimiento_residuos
set certificado_unidades = 300
where id = 'da361f73-5618-4048-9e24-9abc761e1fc2';

-- Verificación: el retiro del 21/08 con su tope, y el resumen del certificado.
select fecha, proveedor, cantidad, certificado_unidades, certificado_path
from mantenimiento_residuos
where material = 'neumaticos'
order by fecha desc;
