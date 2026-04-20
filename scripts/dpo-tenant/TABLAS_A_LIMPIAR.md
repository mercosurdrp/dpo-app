# Tablas con seed operativo en migraciones (a limpiar en bootstrap)

Catalogo de `INSERT INTO` presentes en `supabase/migrations/*.sql`,
separando *catalogo del manual* (se conserva / lo repone master_seed)
de *datos operativos del tenant origen* (se vacia en paso 2 del
bootstrap-tenant.ts).

## Catalogo del manual DPO (SE CONSERVA via master_seed.sql)

| Migracion | Tabla | Filas | Notas |
|-----------|-------|-------|-------|
| 002 | `pilares` | 7 | 7 pilares fijos |
| 002 | `bloques` | 62 | Bloques por pilar |
| 003 | `preguntas` | 168 | Preguntas de auditoria |
| 015 | `checklist_items` | 30 | Checklist de vehiculos |
| 017 | `owd_items` | variable | Items de OWD pre-ruta |
| 028 | `s5_items_catalogo` | 49 | Items de auditoria 5S |

## Datos operativos del tenant origen (SE LIMPIAN en paso 2)

| Migracion | Tabla | Filas | Motivo |
|-----------|-------|-------|--------|
| 007 | `empleados` | ~25 | Empleados de Mercosur DRP (legajos, nombres, DNIs hardcoded) |
| 031 | `catalogo_vehiculos` | 4 | Autoelevadores + camionetas del deposito original |
| 026 | `examen_intentos` | variable | Back-fill desde `asistencias` originales |

## Datos operativos generados por triggers / sistema

Estas tablas reciben datos durante las migraciones pero via triggers
o inserts internos que dependen de filas ya borradas:

| Migracion | Tabla | Cascadea desde |
|-----------|-------|----------------|
| - | `asistencias` | `empleados` (FK CASCADE) |
| - | `capacitacion_respuestas` | `empleados` |
| - | `s5_sector_responsables` | `empleados` (FK RESTRICT — se limpia con TRUNCATE CASCADE) |
| - | `mapeo_empleado_fletero` | `empleados` |
| - | `mapeo_empleado_chofer` | `empleados` |
| - | `sop_certificaciones` | `empleados` |
| - | `foxtrot_driver_mapping` | `empleados` (SET NULL) |

## Tablas de capacitaciones repobladas por master_seed.sql

| Tabla | Paso 2 | Paso 3 |
|-------|--------|--------|
| `capacitaciones` | TRUNCATE CASCADE | INSERT desde export |
| `capacitacion_dpo_puntos` | (via cascade) | INSERT desde export |

## Tablas de storage (buckets)

Se INSERT-ean en las migraciones 004, 005, 021, 025, 030 contra
`storage.buckets`. El bootstrap complementa con el admin API de
Supabase Storage por idempotencia (paso 6).

## Notificaciones

Migracion 025 y 030 definen TRIGGERS que insertan en
`notificaciones` al crear reportes/denuncias. No tienen INSERT
directo de datos; no hay nada que limpiar.

## Profiles

Migracion 001 define el trigger `on_auth_user_created` que auto-crea
profiles al registrarse usuarios en `auth.users`. En una DB nueva no
hay usuarios todavia, asi que `profiles` arranca vacio. El paso 4
del bootstrap crea el unico admin.
