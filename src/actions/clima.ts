"use server"

import { requireAuth } from "@/lib/session"
import { leerLista, leerObjetos } from "@/lib/clima-store"
import type {
  ClimaAnalisis,
  ClimaComentario,
  ClimaOla,
  CorteResumen,
  EstadoComparacion,
  FilaComparada,
} from "@/actions/clima-tipos"
import {
  DIMENSION_DISCONTINUADA,
  DIM_ENGAGEMENT,
  ORDEN_DIMENSIONES,
  PREGUNTAS_RENOMBRADAS,
  UMBRAL_VARIACION,
  dimensionNombre,
  normalizarPregunta,
  preguntaCorta,
} from "@/lib/clima-vocabulario"

type Result<T> = { data: T } | { error: string }

interface ResultadoRow {
  ambito: string
  corte_tipo: string
  corte: string
  dimension: string
  pregunta: string
  valor: number
}

function estadoDe(
  valor: number | null,
  anterior: number | null,
  dimension: string,
): EstadoComparacion {
  if (valor == null) return "discontinuada"
  if (anterior == null) {
    return dimension === DIMENSION_DISCONTINUADA ? "discontinuada" : "nueva"
  }
  const delta = valor - anterior
  if (delta >= UMBRAL_VARIACION) return "mejora"
  if (delta <= -UMBRAL_VARIACION) return "retroceso"
  return "estable"
}

/**
 * Empareja una fila de la ola vigente con la ola anterior. Siete preguntas
 * cambiaron de redacción entre olas: el cruce va por el mapa de renombradas y,
 * si no, por texto normalizado. Nunca por igualdad literal.
 */
function buscarAnterior(
  texto: string,
  indiceAnterior: Map<string, number>,
): number | null {
  const directo = indiceAnterior.get(normalizarPregunta(texto))
  if (directo != null) return directo
  for (const [vieja, nueva] of Object.entries(PREGUNTAS_RENOMBRADAS)) {
    if (normalizarPregunta(nueva) === normalizarPregunta(texto)) {
      const v = indiceAnterior.get(normalizarPregunta(vieja))
      if (v != null) return v
    }
  }
  return null
}

function comparar(
  filas: ResultadoRow[],
  filasAnterior: ResultadoRow[],
  esDimension: boolean,
): FilaComparada[] {
  const indiceAnterior = new Map<string, number>()
  for (const f of filasAnterior) {
    if (esDimension === (f.pregunta === "")) {
      indiceAnterior.set(
        normalizarPregunta(esDimension ? f.dimension : f.pregunta),
        Number(f.valor),
      )
    }
  }

  const out: FilaComparada[] = []
  for (const f of filas) {
    if (esDimension !== (f.pregunta === "")) continue
    const texto = esDimension ? f.dimension : f.pregunta
    const valor = Number(f.valor)
    const anterior = buscarAnterior(texto, indiceAnterior)
    out.push({
      texto,
      etiqueta: esDimension ? dimensionNombre(f.dimension) : preguntaCorta(texto),
      dimension: f.dimension,
      dimensionNombre: dimensionNombre(f.dimension),
      valor,
      anterior,
      delta: anterior == null ? null : valor - anterior,
      estado: estadoDe(valor, anterior, f.dimension),
    })
  }

  // Dimensiones que existían y ya no se miden (SERVICIOS GENERALES): se
  // declaran para que no parezca que desaparecieron sin explicación.
  if (esDimension) {
    const vigentes = new Set(out.map((d) => normalizarPregunta(d.dimension)))
    for (const f of filasAnterior) {
      if (f.pregunta !== "") continue
      if (vigentes.has(normalizarPregunta(f.dimension))) continue
      out.push({
        texto: f.dimension,
        etiqueta: dimensionNombre(f.dimension),
        dimension: f.dimension,
        dimensionNombre: dimensionNombre(f.dimension),
        valor: null,
        anterior: Number(f.valor),
        delta: null,
        estado: "discontinuada",
      })
    }
    out.sort(
      (a, b) =>
        ORDEN_DIMENSIONES.indexOf(a.dimension) -
        ORDEN_DIMENSIONES.indexOf(b.dimension),
    )
  } else {
    out.sort((a, b) => (a.valor ?? 0) - (b.valor ?? 0))
  }
  return out
}

export async function listarOlas(): Promise<Result<ClimaOla[]>> {
  try {
    await requireAuth()
    const res = await leerObjetos<ClimaOla>("clima:ola:")
    if ("error" in res) return res
    const olas = [...res.data].sort(
      (a, b) => b.anio - a.anio || b.semestre - a.semestre,
    )
    return { data: olas }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

/**
 * Análisis completo de una ola contra la anterior. Todos los valores son los
 * PUBLICADOS por la consultora: el Índice de Engagement no se recalcula desde
 * sus preguntas (la herramienta lo computa sobre respuestas individuales).
 */
export async function getClimaAnalisis(
  olaId?: string,
): Promise<Result<ClimaAnalisis | null>> {
  try {
    await requireAuth()

    const olasRes = await listarOlas()
    if ("error" in olasRes) return olasRes
    const olas = olasRes.data
    if (!olas.length) return { data: null }

    const ola = (olaId && olas.find((o) => o.id === olaId)) || olas[0]
    const idx = olas.findIndex((o) => o.id === ola.id)
    const olaAnterior = idx >= 0 && idx + 1 < olas.length ? olas[idx + 1] : null

    const traerResultados = (codigo: string) =>
      leerLista<ResultadoRow>(`clima:res:${codigo}:`)

    const actualRes = await traerResultados(ola.codigo)
    if ("error" in actualRes) return actualRes
    const anteriorRes = olaAnterior
      ? await traerResultados(olaAnterior.codigo)
      : { data: [] as ResultadoRow[] }
    if ("error" in anteriorRes) return anteriorRes

    const actual = actualRes.data
    const anterior = anteriorRes.data

    const delTotal = (rows: ResultadoRow[]) =>
      rows.filter((r) => r.corte_tipo === "total")

    const dimensiones = comparar(delTotal(actual), delTotal(anterior), true)
    const preguntas = comparar(delTotal(actual), delTotal(anterior), false)

    // ---- cortes (sector, posición, género, jefe) ----
    const claves = new Map<string, { corte_tipo: string; corte: string }>()
    for (const r of actual) {
      if (r.corte_tipo === "total") continue
      claves.set(`${r.corte_tipo}|${r.corte}`, {
        corte_tipo: r.corte_tipo,
        corte: r.corte,
      })
    }

    const cortes: CorteResumen[] = []
    for (const { corte_tipo, corte } of claves.values()) {
      const filtro = (rows: ResultadoRow[]) =>
        rows.filter((r) => r.corte_tipo === corte_tipo && r.corte === corte)
      const dims = comparar(filtro(actual), filtro(anterior), true)
      const pregs = comparar(filtro(actual), filtro(anterior), false)
      const eng = dims.find((d) => d.dimension === DIM_ENGAGEMENT)
      cortes.push({
        corte_tipo,
        corte,
        engagement: eng?.valor ?? null,
        engagementAnterior: eng?.anterior ?? null,
        engagementDelta: eng?.delta ?? null,
        dimensiones: dims,
        preguntas: pregs,
      })
    }
    cortes.sort(
      (a, b) =>
        a.corte_tipo.localeCompare(b.corte_tipo) ||
        (b.engagement ?? 0) - (a.engagement ?? 0),
    )

    // ---- comentarios de la ola ----
    const comentariosRes = await leerLista<ClimaComentario>(
      `clima:com:${ola.codigo}:`,
    )
    if ("error" in comentariosRes) return comentariosRes

    // ---- resumen ----
    const comparables = preguntas.filter((p) => p.delta != null)
    const engagement = dimensiones.find((d) => d.dimension === DIM_ENGAGEMENT)
    const conValor = preguntas.filter((p) => p.valor != null)

    return {
      data: {
        olas,
        ola,
        olaAnterior,
        dimensiones,
        preguntas,
        cortes,
        comentarios: comentariosRes.data,
        resumen: {
          engagement: engagement?.valor ?? null,
          engagementAnterior: engagement?.anterior ?? null,
          engagementDelta: engagement?.delta ?? null,
          suben: comparables.filter((p) => (p.delta ?? 0) > 0).length,
          bajan: comparables.filter((p) => (p.delta ?? 0) < 0).length,
          estables: comparables.filter((p) => p.delta === 0).length,
          comparables: comparables.length,
          masBajas: conValor.slice(0, 5),
          masCaen: comparables
            .filter((p) => (p.delta ?? 0) < 0)
            .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
            .slice(0, 5),
          masSuben: comparables
            .filter((p) => (p.delta ?? 0) > 0)
            .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
            .slice(0, 5),
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}
