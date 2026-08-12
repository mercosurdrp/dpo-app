"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/session"
import { EMPRESA_RAZON_SOCIAL_CLIMA } from "@/lib/empresa"
import { parseClimaWorkbook } from "@/lib/clima-import"
import {
  borrarPrefijo,
  escribirClave,
  escribirLista,
  leerClave,
} from "@/lib/clima-store"
import type { ClimaImportResumen, ClimaOla } from "@/actions/clima-tipos"

type Result<T> = { data: T } | { error: string }

/** Debajo de esto el archivo no es el export de la encuesta: se aborta. */
const MINIMO_FILAS = 50

function claveOla(codigo: string) {
  return `clima:ola:${codigo}`
}

/**
 * Importa una ola de la Encuesta de Clima desde el Excel de la consultora.
 *
 * Solo se guarda lo de la propia razón social. El parseo y la validación
 * ocurren ANTES de borrar nada: un archivo equivocado no deja la ola vacía.
 */
export async function importarClimaOla(
  formData: FormData,
): Promise<Result<ClimaImportResumen>> {
  try {
    const profile = await requireAuth()
    if (!["admin", "admin_rrhh"].includes(profile.role)) {
      return { error: "Solo RRHH o un administrador puede importar la encuesta" }
    }

    const archivo = formData.get("archivo")
    if (!(archivo instanceof File) || archivo.size === 0) {
      return { error: "Adjuntá el Excel que envió la consultora" }
    }

    const anio = Number(String(formData.get("anio") ?? "").trim())
    const semestre = Number(String(formData.get("semestre") ?? "").trim())
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return { error: "Año inválido" }
    }
    if (semestre !== 1 && semestre !== 2) {
      return { error: "Elegí el semestre (H1 o H2)" }
    }
    const codigo = `H${semestre} ${anio}`

    const respondentesRaw = String(formData.get("respondentes") ?? "").trim()
    const respondentes = respondentesRaw ? Number(respondentesRaw) : null
    if (respondentes != null && !Number.isFinite(respondentes)) {
      return { error: "Respondentes inválido" }
    }

    // ---- 1) parsear y validar ANTES de tocar nada guardado ----
    let parseado
    try {
      parseado = parseClimaWorkbook(
        await archivo.arrayBuffer(),
        EMPRESA_RAZON_SOCIAL_CLIMA,
      )
    } catch (e) {
      return {
        error: `No se pudo leer el Excel: ${
          e instanceof Error ? e.message : "formato desconocido"
        }`,
      }
    }

    if (parseado.resultados.length < MINIMO_FILAS) {
      return {
        error:
          `El archivo trae ${parseado.resultados.length} resultados para ` +
          `${EMPRESA_RAZON_SOCIAL_CLIMA}. Es muy poco: no se importó nada. ` +
          `Revisá que sea el export completo de la consultora.` +
          (parseado.faltantes.length
            ? ` Hojas que no aparecen: ${parseado.faltantes.join(", ")}.`
            : ""),
      }
    }

    // ---- 2) guardar la ola ----
    const existente = await leerClave<ClimaOla>(claveOla(codigo))
    const ola: ClimaOla = {
      id: codigo,
      codigo,
      anio,
      semestre,
      // Si no lo cargan de nuevo, se conserva el que ya estaba.
      respondentes: respondentes ?? existente?.respondentes ?? null,
      archivo_origen: archivo.name,
      notas: existente?.notas ?? null,
      importada_at: new Date().toISOString(),
    }

    const okOla = await escribirClave(claveOla(codigo), ola, profile.id)
    if ("error" in okOla) return { error: okOla.error }

    // ---- 3) resultados y comentarios ----
    const okRes = await escribirLista(
      `clima:res:${codigo}:`,
      parseado.resultados,
      profile.id,
    )
    if ("error" in okRes) return { error: `Guardando resultados: ${okRes.error}` }

    const okCom = await escribirLista(
      `clima:com:${codigo}:`,
      parseado.comentarios,
      profile.id,
    )
    if ("error" in okCom)
      return { error: `Guardando comentarios: ${okCom.error}` }

    revalidatePath("/clima")

    const cortes: Record<string, number> = {}
    for (const r of parseado.resultados) {
      cortes[r.corte_tipo] = (cortes[r.corte_tipo] ?? 0) + 1
    }

    return {
      data: {
        ola_id: ola.id,
        codigo,
        razon_social: EMPRESA_RAZON_SOCIAL_CLIMA,
        reemplazada: !!existente,
        resultados: parseado.resultados.length,
        comentarios: parseado.comentarios.length,
        jefes: parseado.jefes,
        cortes,
        faltantes: parseado.faltantes,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error importando la encuesta",
    }
  }
}

/** Borra una ola con sus resultados y comentarios. Los planes no se tocan. */
export async function eliminarClimaOla(
  olaId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!["admin", "admin_rrhh"].includes(profile.role)) {
      return { error: "Solo RRHH o un administrador puede borrar una ola" }
    }
    if (!olaId) return { error: "ID de ola inválido" }

    for (const prefijo of [
      `clima:res:${olaId}:`,
      `clima:com:${olaId}:`,
      claveOla(olaId),
    ]) {
      const r = await borrarPrefijo(prefijo)
      if ("error" in r) return { error: r.error }
    }

    revalidatePath("/clima")
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando la ola",
    }
  }
}

/** Actualiza el dato que la planilla no publica: cuánta gente respondió. */
export async function actualizarRespondentes(
  olaId: string,
  respondentes: number | null,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!["admin", "admin_rrhh"].includes(profile.role)) {
      return { error: "Solo RRHH o un administrador puede editar la ola" }
    }

    const ola = await leerClave<ClimaOla>(claveOla(olaId))
    if (!ola) return { error: "Ola no encontrada" }

    const r = await escribirClave(
      claveOla(olaId),
      { ...ola, respondentes },
      profile.id,
    )
    if ("error" in r) return { error: r.error }

    revalidatePath("/clima")
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando la ola",
    }
  }
}
