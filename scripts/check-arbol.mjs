/**
 * Guardián del árbol: falla si se está por deployar código MÁS VIEJO que el que
 * ya está en producción.
 *
 * Existe por lo que se encontró el 04/08/2026. El repo tiene 59 worktrees y
 * cuatro de ellos habían quedado congelados meses atrás, con la rama `main`
 * apuntando 173 commits atrás y el árbol de trabajo todavía más viejo que eso:
 *
 *   /root/dpo-ruteo-sla      931 archivos ≠ producción — 168.869 líneas de menos
 *   /root/dpo-app-skap       443 archivos ≠ producción
 *   /root/dpo-flota-excluir  420 archivos ≠ producción
 *   /root/dpo-app             38 archivos ≠ producción (rama arbol-principal)
 *
 * Como `vercel` sube el directorio donde uno parado está, deployar desde
 * cualquiera de esos cuatro no rompía nada visible: simplemente hacía RETROCEDER
 * producción. Se iban, entre otras cosas, la separación mandatorio/excelencia de
 * los estándares de flota (evidencia del DPO 1.2), el fix del minificador de
 * Next 16 en el criterio del radar y el pase de productividad a minutos por
 * camión. Nada avisa: el build compila igual, porque el código viejo es código
 * válido.
 *
 * Dos modos:
 *   node scripts/check-arbol.mjs            → corre en `prebuild`, sin red.
 *   node scripts/check-arbol.mjs --fetch    → baja origin/main antes de comparar.
 *
 * En el build remoto de Vercel no hay `.git`, así que sale sin hacer nada: la
 * protección de verdad es `npm run deploy:prod`, que corre acá con la red.
 */

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

const CON_FETCH = process.argv.includes("--fetch")
// En estas ramas el árbol TIENE que estar igual a producción. Una rama de
// trabajo puede estar atrás legítimamente; `main` no.
const RAMAS_DE_PRODUCCION = ["main", "arbol-principal"]

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

// Build remoto de Vercel: sube el código sin la carpeta .git. No hay nada que
// comparar y, sobre todo, no es el lugar donde frenar nada: si el clone es
// shallow, `rev-list` falla y este script tiraría abajo un deploy legítimo.
// Ante la duda, no molestar.
if (process.env.VERCEL || process.env.CI || !existsSync(".git")) {
  console.log("· check-arbol: build remoto, se omite (la verificación va en `npm run deploy:prod`)")
  process.exit(0)
}

let rama
try {
  rama = git("rev-parse", "--abbrev-ref", "HEAD")
} catch {
  console.log("· check-arbol: no es un repo git, se omite")
  process.exit(0)
}

if (CON_FETCH) {
  try {
    git("fetch", "--quiet", "origin", "main")
  } catch {
    console.error("✗ check-arbol: no se pudo bajar origin/main. Sin eso no se puede saber si el árbol está al día.")
    process.exit(1)
  }
}

let atras, adelante
try {
  const conteo = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/)
  atras = Number(conteo[0])
  adelante = Number(conteo[1])
} catch {
  console.error("✗ check-arbol: no existe origin/main. Corré `git fetch origin` y volvé a intentar.")
  process.exit(1)
}

const sucios = git("status", "--porcelain", "--untracked-files=no")
  .split("\n")
  .filter(Boolean)

const esDeProduccion = RAMAS_DE_PRODUCCION.includes(rama)
const problemas = []

if (atras > 0) {
  const archivos = git("diff", "--name-only", "origin/main").split("\n").filter(Boolean).length
  problemas.push(
    `la rama "${rama}" está ${atras} commit(s) ATRÁS de origin/main ` +
    `(${archivos} archivo(s) distintos de producción)`
  )
}
if (sucios.length > 0) {
  problemas.push(`hay ${sucios.length} archivo(s) versionados modificados sin commitear`)
}

if (problemas.length === 0) {
  const extra = adelante > 0 ? ` (${adelante} commit(s) propios sin pushear)` : ""
  console.log(`✓ check-arbol: "${rama}" al día con origin/main${extra}`)
  process.exit(0)
}

// En una rama de trabajo estar atrás es normal: se avisa y se sigue. En `main`
// es el error que este script existe para frenar.
const nivel = esDeProduccion || CON_FETCH ? "✗" : "·"
console.error(`\n${nivel} check-arbol:`)
problemas.forEach((p) => console.error(`  - ${p}`))

if (esDeProduccion || CON_FETCH) {
  console.error(
    "\nDeployar así HACE RETROCEDER producción: el build no falla, simplemente\n" +
    "vuelve el código viejo. Antes de deployar:\n\n" +
    "  git stash push -m \"pre-sync\"   # si hay cambios sin commitear\n" +
    "  git merge --ff-only origin/main\n\n" +
    "Si el árbol tiene trabajo propio, commiteálo y pusheálo primero.\n"
  )
  process.exit(1)
}

console.error("  (rama de trabajo: se avisa nomás. `npm run deploy:prod` sí lo frena.)\n")
process.exit(0)
