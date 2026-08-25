// Completa los gatillos del tablero de la reunión de logística (y el DQI de la
// matinal) en reuniones_indicadores_config. Mismo mecanismo que el botón de
// gatillo del diálogo de indicadores (setGatilloIndicador): update si la fila
// de config existe, insert de una fila "solo gatillo" (orden 999) si no.
// Los valores se pueden ajustar acá antes de correr, o después desde la app.
// Correr desde la raíz del repo:  node scripts/completar-gatillos-logistica.mjs
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { Client } = require("pg")

// [tipo, nombre exacto de la fila, gatillo, unidad, mejor_si]
// Fundamento (60 días al 13/08/2026):
//  - Rechazos %: meta 1,7 · p80 real 1,69 → gatillo 2 (el clásico "rechazo 2%").
//  - TML: meta 25 · p80 real 25,4 → gatillo 30 (estándar SOP de liberación).
//  - Bultos vendidos: p20 real 1.759 → gatillo 1.800 (día flojo de venta).
//  - HL vendidos: p20 real 177,5 → gatillo 180.
//  - Ocupación de Bodega: p20 real 68,7% → gatillo 70 (meta 100).
//  - Tiempo en ruta: mismo gatillo que ya usa la matinal (250 min, meta 300).
//  - DQI: MTD de agosto ~89-99 PPM → gatillo 150 (en ambas reuniones).
const GATILLOS = [
  ["logistica", "Rechazos %", 2, "%", "menor"],
  ["logistica", "TML", 30, "min", "menor"],
  ["logistica", "Bultos vendidos", 1800, "bultos", "mayor"],
  ["logistica", "HL vendidos", 180, "HL", "mayor"],
  ["logistica", "Ocupación de Bodega", 70, "%", "mayor"],
  ["logistica", "Tiempo en ruta", 250, "min", "mayor"],
  ["logistica", "DQI · roturas en ruta", 150, "PPM", "menor"],
  ["matinal-distribucion", "DQI · roturas en ruta", 150, "PPM", "menor"],
]

const envLine = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL"))
if (!envLine) throw new Error("No hay DATABASE_URL en .env.local")
const url = envLine.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

for (const [tipo, nombre, gatillo, unidad, mejorSi] of GATILLOS) {
  const { rows } = await client.query(
    "select id, gatillo from reuniones_indicadores_config where tipo = $1 and lower(trim(nombre)) = lower($2)",
    [tipo, nombre],
  )
  if (rows.length > 0) {
    await client.query(
      "update reuniones_indicadores_config set gatillo = $1, updated_at = now() where id = $2",
      [gatillo, rows[0].id],
    )
    console.log(`✓ ${tipo} · ${nombre}: gatillo ${rows[0].gatillo ?? "—"} → ${gatillo} (update)`)
  } else {
    await client.query(
      `insert into reuniones_indicadores_config
         (tipo, nombre, unidad, meta, gatillo, mejor_si, orden, activo, agregacion)
       values ($1, $2, $3, null, $4, $5, 999, true, 'promedio')`,
      [tipo, nombre, unidad, gatillo, mejorSi],
    )
    console.log(`✓ ${tipo} · ${nombre}: gatillo ${gatillo} (fila solo-gatillo nueva)`)
  }
}

const { rows: check } = await client.query(
  "select tipo, nombre, gatillo, mejor_si from reuniones_indicadores_config where tipo in ('logistica','matinal-distribucion') and gatillo is not null order by tipo, nombre",
)
console.table(check)
await client.end()
console.log("Listo. Los gatillos quedan editables desde el diálogo de indicadores de la reunión.")
