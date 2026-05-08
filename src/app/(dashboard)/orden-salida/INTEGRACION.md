# Orden de Salida Diario — guía operativa

Módulo en producción. Modelo: **una fila por camión por día** + tabla aparte de **personal que no sale**.

## Rutas

| Ruta | Acceso | Para qué |
|---|---|---|
| `/orden-salida` | `admin`, `admin_rrhh`, `supervisor` | Carga diaria de tripulación, zona, métricas. Auto-balance Iguazú, exportar XLSX, planilla imprimible. |
| `/mi-orden-del-dia` | cualquier usuario autenticado linkeado a un empleado | El empleado ve su asignación. Antes de las 19hs (ARG) muestra HOY; desde las 19hs muestra MAÑANA. |

## Tablas (migración `041_orden_salida.sql`)

- `empleados.sucursal` (text, NULL/`ELDORADO`/`IGUAZU`) — columna nueva.
- `orden_salida_flota` (`vehiculo_id` PK → `catalogo_vehiculos`, `sucursal`, `capacidad_kg`, `numero_unidad`, `activo`).
- `orden_salida_titulares` (`empleado_id` PK, `camion_id`).
- `orden_salida_camion_diario` (PK `(fecha, camion_id)`).
- `orden_salida_personal_no_sale` (PK `(fecha, empleado_id)`).
- RLS: lectura libre para `authenticated`; escritura para `admin`, `admin_rrhh`, `supervisor`.

Capacidades de la flota tomadas de la hoja `LISTAS` columnas K (patente) y M (KG) del Sheet maestro.

## Histórico

Migración `042_orden_salida_historico.sql` carga 1447 asignaciones (2025-12-24 → 2026-05-04) y 360 registros de "no sale". Idempotente (`ON CONFLICT DO UPDATE`). Mapea por `upper(empleados.nombre)` y `catalogo_vehiculos.dominio`.

Si algún empleado del seed no existe en la base, sus filas quedan **descartadas silenciosamente** por el `JOIN` interno. Para verificar después del seed:

```sql
-- Cuántas filas no se importaron por falta de empleado:
SELECT COUNT(*) FROM (VALUES
  -- (mismos VALUES del seed)
) AS s(empleado_mock, fecha, motivo, detalle)
LEFT JOIN _emp_map em ON em.mock_id = s.empleado_mock
WHERE em.empleado_id IS NULL;
```

## Server actions (`src/actions/orden-salida.ts`)

| Función | Descripción |
|---|---|
| `listarEmpleadosOrdenSalida()` | Empleados con `sucursal` cargada + flag titularidad. |
| `listarFlota()` | Camiones activos con sucursal/capacidad/número. |
| `obtenerAsignaciones(fecha)` / `obtenerAsignacionesEnRango(desde, hasta)` | Lectura. |
| `obtenerNoSale(fecha)` / `obtenerNoSaleEnRango(desde, hasta)` | Lectura. |
| `upsertAsignacion(input)` / `eliminarAsignacion(fecha, camion)` | Escritura roles editor. |
| `upsertNoSale(input)` / `quitarNoSale(fecha, empleado)` | Escritura. Al bajar a la lista, también limpia las asignaciones del día. |
| `agregarEmpleado(input)` / `setEmpleadoActivo(id, activo)` | Padrón. |
| `obtenerMiOrdenSalida()` | Vista empleado, usa `fechaQueVeElEmpleado()`. |
| `fechaQueVeElEmpleado()` | Helper puro: aplica regla 19hs en `America/Argentina/Buenos_Aires`. |

## Frontend

- `page.tsx` precarga rango de **45 días para atrás + 7 hacia adelante** (cubre balance Iguazú y SC del mes). Si el usuario navega fuera del rango, el cliente hace fetch on-demand.
- `orden-salida-client.tsx` mantiene el state local + persiste cada mutación con `useTransition` (optimistic). Si una mutación falla, el state queda divergido del backend hasta el próximo re-fetch.

## Pendientes / mejoras futuras

1. **Pampeana**: replicar el módulo en la Supabase de Pampeana. Las migraciones son las mismas; el seed de flota/titulares es distinto (sin Iguazú/Eldorado).
2. **Validar que los 37 empleados Misiones están cargados** en `empleados` con sus legajos antes de ejecutar el seed `042`. El seed solo afecta a los que existan.
3. **Toast de error**: hoy las fallas en server actions se silencian (el state queda divergido). Agregar un toaster para feedback visible al editor.
4. **Bloqueo de cierre**: opcional, no permitir editar fechas anteriores a `hoy - N` salvo `admin`.
5. **Notificación push al empleado** a las 19hs con su asignación del día siguiente.
