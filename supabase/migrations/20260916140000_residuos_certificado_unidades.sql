-- Certificado de disposición final: cuántas unidades cubre.
--
-- El operador no entrega un certificado por retiro: entrega uno que ampara una
-- cantidad de unidades (el de Kumen Co S.A. del 21/08/2026 cubre varios cientos
-- de cubiertas) y se van descontando retiro a retiro. Sin esto, cada retiro
-- nuevo aparecía "sin certificado" y no había forma de saber cuánto queda del
-- que ya está cargado.
--
-- El certificado se identifica por su archivo (`certificado_path`): los retiros
-- que comparten ese path están amparados por el mismo papel. La capacidad se
-- guarda en el retiro que lo cargó y vale para todos los que lo reusan.

alter table mantenimiento_residuos
  add column if not exists certificado_unidades integer;

comment on column mantenimiento_residuos.certificado_unidades is
  'Unidades que declara cubrir el certificado de disposición final. Se carga una vez, en el retiro que sube el archivo, y sirve de tope para los retiros que reusan el mismo certificado.';
