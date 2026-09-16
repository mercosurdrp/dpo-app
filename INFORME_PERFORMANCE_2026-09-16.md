# Por qué anda lenta la dpo-app — informe del 16/09/2026

Todo lo que sigue está **medido** sobre producción y sobre la base real
(`pg_stat_statements`, `pg_stat_user_tables`, `EXPLAIN ANALYZE` y curl contra
`dpo-app-self.vercel.app`). No hay estimaciones a ojo: donde digo "tanto a
tanto", corrí las dos versiones.

**Titular:** el problema no es Next.js ni el front. Son tres cosas, en este
orden: (1) la app le pregunta a Supabase "quién sos" millones de veces, (2) la
instancia de Postgres es chica y está sin CPU, (3) varias consultas obligan a
leer tablas enteras. La región equivocada suma un impuesto parejo encima de
todo.

---

## El ranking real: qué consume la base

Del `pg_stat_statements`, tiempo acumulado por tipo de consulta:

| # | Qué es | Llamadas | Tiempo acumulado |
|---|---|---:|---:|
| 1 | `set_config(...)` — PostgREST armando el contexto de cada request | **1.801.995** | **3.654 s** |
| 2 | `SELECT sessions` (parte de `getUser`) | 1.307.405 | 800 s |
| 3 | `SELECT users` (parte de `getUser`) | 1.292.967 | 915 s |
| 4 | `SELECT mfa_amr_claims` (parte de `getUser`) | 1.306.371 | 475 s |
| 5 | `SELECT identities` (parte de `getUser`) | 1.296.148 | 291 s |
| 6 | `SELECT mfa_factors` (parte de `getUser`) | 1.296.289 | 231 s |
| 7 | `get_costo_por_pdv_json(anio, mes)` | 791 | 1.677 s |
| 8 | `SELECT name FROM pg_timezone_names` | 668 | 699 s |

Sumá las filas 2 a 6: **~2.710 segundos (45 minutos de CPU de la base) sólo
para responder "quién sos"**. Con los `set_config` de arriba, la autenticación
se come más tiempo de base que cualquier consulta del negocio. La primera
consulta de datos reales aparece recién en el puesto 7.

### Por qué pasaba

Cada `auth.getUser()` es un round-trip HTTP al servidor de Auth, y ese servidor
resuelve cada pedido con **cinco SELECT**. La app lo llamaba en el layout del
dashboard y otra vez en cada server action: una pantalla como `/reuniones/[id]`
encadena ~10 acciones, o sea ~10 `getUser` = ~50 queries sólo de identidad.
El `cache()` de React memoiza por request, pero cada server action **es** una
request distinta, así que no compartían nada.

### Qué hice

El proyecto firma los JWT con clave **asimétrica ES256** (lo verifiqué en
`/auth/v1/.well-known/jwks.json`). Eso habilita `getClaims()`, que valida la
firma **localmente con WebCrypto** y cachea el JWKS: cero round-trips, cero
queries.

`src/lib/session.ts` ahora usa `getClaims()` y deja `getUser()` sólo como
fallback. El fallback es importante: si por lo que sea `getClaims()` no puede
resolver, el código hace **exactamente lo que hacía antes**, con el mismo
reintento ante fallas transitorias. No hay forma de que quede peor que hoy.

Probado sin sesión: responde en 0 ms, devuelve null y redirige a `/login`.

Bonus: `getEmpleadoIdFromAuth()` hacía un segundo `SELECT` a `profiles` para
leer una columna que `getProfile()` ya había traído con su `select("*")`.

---

## La instancia de Postgres está chica y sin CPU

| Parámetro | Valor | Qué significa |
|---|---|---|
| `shared_buffers` | 224 MB | instancia **Micro (~1 GB RAM)** |
| `effective_cache_size` | 384 MB | idem |
| `max_connections` | 60 | idem |
| `max_parallel_workers` | 2 | casi sin paralelismo |
| cache hit ratio | 99,99 % | los datos **sí** entran en memoria |

Benchmark de CPU pura, sin tocar tablas: contar 3.000.000 de filas en memoria
tardó **834 ms**. Una instancia sana hace eso en 200-300 ms.

El cache hit de 99,99 % es la prueba de que **no es falta de RAM: es falta de
CPU**. Se ve en los planes: un index scan que devuelve 3.373 filas con todos
los buffers en caché tarda 350 ms, y el *planner* solo tarda 245 ms en armar el
plan de `get_costo_por_pdv`.

Esto explica el caso más feo que medí. `/api/radar-rechazos/feed` — un endpoint
que hace **dos** consultas — dio:

| llamada | tiempo |
|---|---:|
| 1ª (fría) | **102,6 s** |
| 2ª | 16,8 s |
| 3ª | 7,9 s |
| 4ª (caliente) | 0,99 s |

Las cuatro fueron seguidas, así que **no es cold start de la función**: es la
base leyendo de disco con la CPU agotada y acelerando a medida que las páginas
entran en el buffer pool.

**Esto no lo puedo arreglar desde el código: hay que subir el compute de
Supabase.** Es la palanca más grande que queda, y la más cara.

---

## Consultas que leen tablas enteras

De `pg_stat_user_tables` — filas leídas de más, acumuladas:

| tabla | seq scans | filas leídas | filas por scan |
|---|---:|---:|---|
| `ventas_diarias_camion_sku` | 11.031 | **1.030.207.872** | 93.392 de 111.480 |
| `checklist_respuestas` | 19.436 | **672.519.008** | 34.601 de 58.258 |
| `ventas_diarias_cliente` | 2.119 | 91.031.805 | 42.959 de 52.654 |
| `rechazos` | 7.937 | 55.631.816 | 7.009 de 8.399 |

Mil millones de filas leídas sobre una tabla que tiene 111 mil. Cada consulta
se llevaba la tabla entera puesta.

### Causa A — paginar ordenando por una columna sin índice útil

El patrón estaba repetido por todo el repo:

```ts
.gte("fecha", desde).lte("fecha", hasta)
.order("id", { ascending: true })     // <-- el problema
.range(from, from + 999)
```

El comentario del código explicaba que se ordenaba por `id` "para que la
paginación sea estable". La intención era correcta, pero el efecto es que el
índice de `fecha` **no sirve para ordenar**, así que Postgres resolvía cada
página con un seq scan + sort de la tabla entera. Y como se paginan ~7.000
filas de a 1.000, eso son **7 escaneos completos por pantalla**.

**Arreglo:** ordenar por la misma columna de fecha que filtra el WHERE, y
desempatar con el `id`. Sale ordenado del índice, y la paginación sigue siendo
estable porque el `id` es único.

```ts
.order("fecha", { ascending: true })
.order("id", { ascending: true })
```

Medido, con los datos reales:

| consulta | antes | después | |
|---|---:|---:|---|
| `rechazos` (rango ene→sep) | 628 ms | **27 ms** | 23× |
| `ventas_diarias_sku` | 274 ms | **90 ms** | 3× |

Aplicado en 18 paginaciones de 7 archivos: `cuadro-mensual.ts` (6),
`mis-rechazos.ts` (4), `arbol-kpi.ts` (2), `mi-entrega.ts` (2),
`tiempo-interno.ts` (3), `mapeo-empleados.ts` (1).

### Causa B — dos índices que faltan (requiere SQL)

**`checklist_respuestas`** — la usa `getFlotaIndicadores()`. Filtra con
`valor not in ('ok','bueno')`: una negación sobre columna sin índice, o sea seq
scan garantizado en cada página. Un índice **parcial** (sólo las filas que son
defecto, que son minoría) lo resuelve:

> **637,5 ms → 2,2 ms — 284×**

**`radar_rechazos_cliente`** — filtra por `fecha_entrega`, pero los únicos
índices de la tabla son por `snapshot_id`:

> **70,6 ms → 3,3 ms — 21×**

Ambos los probé creándolos dentro de una transacción y haciendo `ROLLBACK`, así
que **la base quedó intacta** y los números son medidos de verdad.

Quedaron en `APLICAR_EN_PAMPEANA_PERF_INDICES.sql`, listos para correr.

---

## La región: un impuesto sobre cada consulta

- Las funciones de Vercel corren en **`iad1`** (Virginia). Se ve en el header:
  `x-vercel-id: gru1::iad1::...` — entra por São Paulo, ejecuta en Virginia.
- Supabase está en **`us-west-2`** (Oregón). Lo confirmé resolviendo el pooler:
  `aws-0-us-west-2.pooler.supabase.com` → `44.238.118.41`.
- `vercel.json` no tenía `regions`, así que tomaba el default `iad1`.

Son ~70 ms de ida y vuelta **por consulta**. Una pantalla con 15 consultas en
fila paga **un segundo entero sólo de cable**, sin hacer ningún trabajo útil.

**Arreglo:** `"regions": ["pdx1"]` en `vercel.json`. `pdx1` es Portland — la
misma región de AWS que la base. La latencia entre la función y Postgres pasa a
ser prácticamente cero.

Es una línea, y le pega a **todas** las pantallas a la vez.

---

## Lo que reviso y NO era el problema

Lo pongo para que no se pierda tiempo ahí:

- **Source maps en la lambda.** `.next/server` pesa 175 MB, de los cuales 107 MB
  son source maps. Me pareció sospechoso, pero al leer los `.nft.json` (que son
  los que deciden qué entra en la función) hay **0 source maps trazados**: no
  viajan a la lambda. Inflan el build local y el deploy, nada más.
- **El tamaño de las funciones.** `vercel inspect` muestra 10,25 MB por lambda
  sobre ~556 outputs. Suena mucho, pero la home traza sólo 3 MB y no hay código
  pesado corriendo en import-time. No es lo que explica los tiempos.
- **`foxtrot_routes`.** Aparecía con 16.525 seq scans, pero al medirla ya usa
  índice y tarda 3,3 ms. Le probé un índice compuesto: bajaba a 0,5 ms, mejora
  irrelevante en términos absolutos. Descartado, era ruido.
- **El N+1 de la home** (`src/actions/dashboard.ts`). Es real: 6 consultas en
  fila, una consulta por auditoría dentro de un `for`, un cruce O(n²) y un
  `.in()` con ~167 UUID metidos en la URL de un GET. **Pero** el módulo DPO hoy
  tiene 1 auditoría, 167 preguntas y 7 pilares, así que el loop da una sola
  vuelta y hoy pesa milisegundos. Lo arreglé igual porque escala pésimo (con 10
  auditorías son 10 round-trips en fila), no porque sea el cuello de hoy.
- **Doble librería de gráficos.** `recharts` (43 archivos, estático) y `echarts`
  (1 archivo, dinámico) conviven, y `echarts` genera un chunk SSR de 1 MB que no
  hace falta. Es peso de descarga del browser, no de servidor: no explica los
  tiempos que estás viendo. Lo dejo anotado como limpieza futura.

---

## Lo aplicado, y lo que falta

### Ya hecho (branch `perf/optimizacion-velocidad`, sin commitear, sin deployar)

| # | Cambio | Archivo | Impacto |
|---|---|---|---|
| 1 | JWT validado localmente con `getClaims()` | `src/lib/session.ts` | saca ~6,5 M de queries y ~45 min de CPU de la base |
| 2 | Función en la misma región que la base | `vercel.json` | −70 ms por consulta, en todas las pantallas |
| 3 | 18 paginaciones ordenan por la columna indexada | 7 archivos de `src/actions/` | 23× en `rechazos`, 3× en `ventas_diarias_sku` |
| 4 | Home: consultas en paralelo, sin N+1, sin O(n²), sin `select("*")` | `src/actions/dashboard.ts` | chico hoy, evita que escale mal |
| 5 | Se elimina un `SELECT` redundante a `profiles` | `src/lib/session.ts` | 1 round-trip menos por llamada |

`npm run build` pasa (exit 0, compilado en 13,2 s) y `tsc --noEmit` no tira un
solo error.

### Falta — en orden de impacto

1. **Subir el compute de Supabase.** Es la palanca más grande que queda. Con
   834 ms para contar 3 M de filas en memoria, la base está ahogada de CPU y
   eso enlentece absolutamente todo. Requiere el dashboard y cuesta plata.
2. **Correr `APLICAR_EN_PAMPEANA_PERF_INDICES.sql`.** 284× y 21×, medidos.
   Dijiste que lo aplicás vos.
3. **Activar Fluid Compute** en el proyecto de Vercel, si no está. Reduce cold
   starts reusando instancias entre invocaciones. No lo pude verificar: el
   token del CLI no estaba accesible (y está bien que así sea).
4. **Probar el login** antes de deployar el cambio de auth. Es el cambio de
   mayor impacto y toca la sesión. Tiene fallback al comportamiento viejo, así
   que el riesgo es bajo, pero conviene verlo funcionando una vez.

### Dato de negocio que apareció de paso

`costo_logistico_mensual` **no tiene fila para 2026-09**. La función
`get_costo_por_pdv` la busca, no la encuentra, y devuelve todos los costos en
cero — pero igual hace los 507 ms de trabajo. La pantalla de costo por PDV del
mes actual está mostrando ceros. No es un problema de performance, pero
convenía que lo supieras.
