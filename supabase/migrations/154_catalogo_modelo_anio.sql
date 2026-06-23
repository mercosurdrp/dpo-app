-- 154: modelo y año en el catálogo de vehículos (para el Seguimiento de flota).
alter table catalogo_vehiculos
  add column if not exists modelo text,
  add column if not exists anio  integer;

-- Carga inicial de la flota de camiones (datos de la planilla de disponibilidad).
update catalogo_vehiculos set modelo='OF-1720',             anio=2014 where dominio='OJA403';
update catalogo_vehiculos set modelo='Iveco Vertis 130V19', anio=2018 where dominio='AC165AJ';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2022 where dominio='AF664NY';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2021 where dominio='AE591EI';
update catalogo_vehiculos set modelo='Accelo 1016/39',      anio=2023 where dominio='AE908DF';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2021 where dominio='AE908DH';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2021 where dominio='AF028YB';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2021 where dominio='AE908DG';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2021 where dominio='AF399KY';
update catalogo_vehiculos set modelo='MB-1721 Atego',       anio=2022 where dominio='AF588SU';
update catalogo_vehiculos set modelo='MB-1727 Atego',       anio=2021 where dominio='AF469UR';
update catalogo_vehiculos set modelo='Sola y Brusa (acoplado)'        where dominio='AF516JB';
