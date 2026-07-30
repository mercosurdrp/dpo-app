/**
 * Verificación sin login de la rama WNP del Árbol del Sueño: ejercita el código
 * real (`resolverValoresExternos` + `estadoSemaforo` + la topología) contra la
 * API de producción del depósito. Correr con `npx tsx`.
 */
import { ARBOL_SUENO } from "../src/lib/sueno/arbol-config"
import { KPI_EXTERNOS, resolverValoresExternos } from "../src/lib/sueno/externos"
import { estadoSemaforo } from "../src/lib/sueno/semaforo"

const METAS_2026: Record<string, { meta: number; gatillo: number | null }> = {
  wnp: { meta: 6, gatillo: null },
  prod_picking: { meta: 290, gatillo: 250 },
  precision_picking: { meta: 99.8, gatillo: 99.5 },
  wqi: { meta: 2200, gatillo: 2800 },
}

function hijos(parent: string | null) {
  return ARBOL_SUENO.filter((n) => n.parentKey === parent)
}

async function main() {
  const anio = 2026
  const t0 = Date.now()
  const externos = await resolverValoresExternos(anio)
  const ms = Date.now() - t0

  console.log(`resolverValoresExternos: ${ms} ms · claves: ${[...externos.keys()].join(", ")}\n`)

  function imprimir(key: string, sangria = 0) {
    const nodo = ARBOL_SUENO.find((n) => n.key === key)!
    const val = externos.get(key)
    const { meta, gatillo } = METAS_2026[key] ?? { meta: nodo.metaDefault ?? 0, gatillo: null }
    const estado = estadoSemaforo(val ?? null, meta, gatillo, nodo.mejorSi)
    const pad = "  ".repeat(sangria)
    console.log(
      `${pad}${nodo.label.padEnd(20 - sangria * 2)} ${String(val ?? "SIN DATO").padStart(9)} ${nodo.unidad.padEnd(8)} meta ${String(meta).padStart(6)}  ${estado}${esExternoOk(key)}`,
    )
    for (const h of hijos(key)) imprimir(h.key, sangria + 1)
  }

  function esExternoOk(key: string) {
    if (!(key in KPI_EXTERNOS)) return "  (no externo)"
    return externos.get(key) == null ? "  ⚠️ el depósito no respondió" : ""
  }

  imprimir("wnp")

  const fuera = ARBOL_SUENO.filter((n) => n.key === "hs_extras")
  console.log(`\nhs_extras en el árbol: ${fuera.length === 0 ? "NO (correcto)" : "SÍ ⚠️"}`)
  console.log(`hs_extras en KPI_EXTERNOS: ${"hs_extras" in KPI_EXTERNOS ? "SÍ ⚠️" : "NO (correcto)"}`)

  // Detalle mensual tal como lo arma getSuenoDetalle para un KPI externo.
  for (const key of ["precision_picking", "wqi"]) {
    const r = await KPI_EXTERNOS[key].resumen(anio)
    console.log(
      `\n${key}: ${r?.meses.length ?? 0} meses · YTD ${r?.promedio_anual ?? "—"} · ` +
        `${KPI_EXTERNOS[key].detalleLabel} / ${KPI_EXTERNOS[key].detalle2Label}`,
    )
    for (const m of r?.meses ?? []) {
      console.log(`   mes ${m.mes}: ${m.valor}  (${m.registros} / ${m.bultos})`)
    }
  }
}

main()
