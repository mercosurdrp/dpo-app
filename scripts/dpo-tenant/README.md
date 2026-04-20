# Bootstrap de un tenant nuevo (DPO-App)

Esta carpeta contiene las herramientas para levantar una instancia nueva
del manual DPO en un proyecto Supabase + Vercel separado (ej: "Mercosur
Distribuciones" en Misiones, como fork del tenant original Mercosur
DRP).

Scripts:

- `export-master.ts` — corre contra la DB ORIGEN y genera
  `seeds/master_seed.sql` con el catalogo universal (pilares, bloques,
  preguntas, checklist_items, s5_items_catalogo, owd_items,
  capacitaciones, capacitacion_dpo_puntos).
- `bootstrap-tenant.ts` — corre contra la DB DESTINO (nueva) y la deja
  lista para usar: migraciones + limpieza + master_seed + admin +
  buckets + verificacion.

---

## Pasos manuales

### 1. Crear el proyecto Supabase nuevo

1. Entrar al dashboard: <https://supabase.com/dashboard>
2. **New project**, elegir org, nombre (ej: `dpo-mercosur-distribuciones`),
   region (South America - Sao Paulo recomendado para Argentina).
3. Esperar a que termine de provisionar (~2 minutos).
4. Copiar de **Settings > API**:
   - **Project URL** → sera `DEST_SUPABASE_URL`
   - **anon public key** → sera `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel
   - **service_role key** (secreta) → sera `DEST_SUPABASE_SERVICE_ROLE_KEY`
5. Copiar de **Settings > Database > Connection string > URI** (modo
   `Direct connection`, no el pooler):
   - Algo como `postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres`
   - Este sera `DEST_SUPABASE_DB_URL`.
   - El `PASSWORD` es el que Supabase te muestra la primera vez; si lo
     perdiste, resetealo en **Database > Database password**.

### 2. (Opcional pero recomendado) Exportar el master del tenant origen

Este paso genera `seeds/master_seed.sql` a partir del tenant origen
(ej: Mercosur DRP). Necesitas tener las credenciales del origen en
`.env.local` del repo:

```
cd /root/dpo-app
# en .env.local:
#   NEXT_PUBLIC_SUPABASE_URL=https://origen.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...
npx tsx scripts/dpo-tenant/export-master.ts
```

Salida: `scripts/dpo-tenant/seeds/master_seed.sql`.

> Si ya tenes un `master_seed.sql` generado antes, podes saltar este
> paso.

### 3. Correr el bootstrap contra la DB nueva

```bash
export DEST_SUPABASE_URL=https://xxx.supabase.co
export DEST_SUPABASE_SERVICE_ROLE_KEY=eyJ...
export DEST_SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"

cd /root/dpo-app
npx tsx scripts/dpo-tenant/bootstrap-tenant.ts \
  --admin-email admin@mercosurdistribuciones.local \
  --admin-password 'elige-un-pass-seguro-min-8' \
  --admin-nombre "Admin Distribuciones"
```

Qué hace, en orden:

1. Aplica **todas** las migraciones de `supabase/migrations/*.sql`
   (001 → 032) contra la DB nueva.
2. Vacia `empleados`, `capacitaciones`, `catalogo_vehiculos` y sus
   tablas hijas via `TRUNCATE ... CASCADE` (las migraciones 007 y 031
   tienen INSERT fijos con datos operativos del tenant original).
3. Aplica `seeds/master_seed.sql` (catalogo del manual).
4. Crea el usuario admin (auth) + eleva el profile a `role='admin'`.
5. Crea 4 slots vacios de responsables 5S para el mes corriente (se
   **omite** si la columna `empleado_id` sigue siendo `NOT NULL`, que
   es el caso con el esquema actual — mirar ambiguedades abajo).
6. Crea (idempotente) los 6 buckets de storage.
7. Imprime una tabla de conteos de verificacion:

```
  v pilares                 7
  v preguntas             168
  v checklist_items        30
  v s5_items_catalogo      49
  v capacitaciones         XX
  v empleados               0 (vacio - admin debe cargar)
  v catalogo_vehiculos      0 (vacio - admin debe cargar)
  v profiles                1
  v admin                   admin@mercosurdistribuciones.local
```

Si alguna migracion falla, el script aborta con el nombre del archivo
y el error de Postgres.

### 4. Verificar los 6 buckets de storage

El bootstrap los crea automaticamente via admin API. Verificar en
**Storage** del dashboard que existan:

- `sops` (publico)
- `evidencias` (publico)
- `dpo-evidencia` (publico)
- `reportes-seguridad` (publico)
- `linea-etica` (publico)
- `capacitaciones` (publico — reservado para material de examenes)

Si alguno falta, crear manualmente con mismo nombre y *Public bucket*
activado.

### 5. Crear el proyecto Vercel nuevo

1. Entrar a <https://vercel.com/new>.
2. Importar repo `github.com/mercosurdrp/dpo-app` (o el fork que
   corresponda), branch `main`.
3. En **Environment variables**, setear:
   - `NEXT_PUBLIC_SUPABASE_URL` = `DEST_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = el anon key del paso 1
   - `SUPABASE_SERVICE_ROLE_KEY` = el service_role del paso 1
   - `NEXT_PUBLIC_EMPRESA_NOMBRE` = `Mercosur Distribuciones`
   - `NEXT_PUBLIC_EMPRESA_NOMBRE_CORTO` = `Distribuciones`
4. Framework preset: **Next.js** (lo detecta solo).
5. Build command y output dir: dejar los defaults.

### 6. Deploy

Vercel dispara el primer build solo despues de guardar la config.
Esperar a que termine. La URL resultante la usas para el login admin.

### 7. Primera carga de datos operativos

Entrar con el admin creado en el paso 3 y:

- **Vehiculos**: cargar la flota del tenant en `/vehiculos` (desde la
  UI) o via SQL editor de Supabase. El campo `sector` acepta
  `distribucion` o `deposito`.
- **Empleados**: cargar el padron en `/admin/mapeo-empleados` (CSV o
  UI). Recordar que `legajo` es UNIQUE.
- **Capacitaciones**: las filas ya estan en la DB con `fecha`,
  `instructor`, `lugar` en valores placeholder (ver ambiguedades). El
  admin las edita desde `/capacitaciones` y setea fechas reales.
- **Responsables 5S**: una vez cargados los empleados, asignar uno
  por sector (1..4) en la UI de 5S.

---

## Qué NO está configurado

El tenant nuevo queda funcional para el manual DPO, pero las
integraciones externas quedan **apagadas por default**. Se activan
agregando env vars a Vercel (y re-deployando):

- **Chess ERP / GESCOM** (modulo de rechazos y pedidos): requiere
  `CHESS_API_URL`, `CHESS_USERNAME`, `CHESS_PASSWORD`, `CHESS_TOKEN_URL`,
  `CHESS_CODIGO_SEDE`. Sin estas variables, el modulo de rechazos
  funciona solo contra la tabla `rechazos` cargada manualmente.
- **Foxtrot API** (telematica de camiones): requiere `FOXTROT_API_URL`
  y credenciales. Si no se setea, las tablas `foxtrot_*` quedan
  vacias y la pestaña de sync no trae nada.
- **OpenAI** (generacion automatica de examenes a partir de material):
  requiere `OPENAI_API_KEY`. Sin esta key, el boton "Generar examen"
  en capacitaciones devuelve error; se puede seguir cargando
  preguntas a mano.

Para agregarlas despues: **Vercel > Project > Settings > Environment
Variables**, redeploy.

---

## Ambigüedades detectadas

1. **`s5_sector_responsables.empleado_id` es `NOT NULL`** en la
   migracion 028. El bootstrap detecta esto y **omite** la creacion
   de slots vacios (paso 5). Cuando el admin asigna el primer
   responsable de cada sector desde la UI, se crea la fila
   correctamente.
2. **`capacitaciones.fecha`/`instructor` son `NOT NULL`** en la
   migracion 007, pero `export-master.ts` emite filas con esos campos
   en `NULL`. El INSERT puede fallar contra la DB nueva. Workarounds
   posibles:
   - Relajar las constraints con una migracion nueva (preferible).
   - Que `export-master.ts` emita valores placeholder (`fecha =
     CURRENT_DATE`, `instructor = 'Por definir'`) en lugar de `NULL`.
   - Correr `ALTER TABLE capacitaciones ALTER COLUMN fecha DROP NOT
     NULL; ALTER TABLE capacitaciones ALTER COLUMN instructor DROP
     NOT NULL;` antes del paso 3 y aceptar que la DB destino queda
     con un esquema levemente distinto al origen.
   Verificar al correr el paso 3: si falla con `null value in
   column "fecha"`, este es el motivo.
3. **Buckets: el requerimiento pide "6 buckets"** pero el codebase
   solo referencia 5 (`sops`, `evidencias`, `dpo-evidencia`,
   `reportes-seguridad`, `linea-etica`). Se incluye `capacitaciones`
   como sexto por reservado para material de examenes; si no se
   necesita, el admin puede borrarlo sin impacto.
4. **No podemos inferir `DEST_SUPABASE_DB_URL` desde
   `DEST_SUPABASE_URL` + service_role**: el password de la DB es un
   secreto separado. Por eso el bootstrap exige los dos env vars.
