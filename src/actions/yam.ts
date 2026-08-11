"use server"

import { requireRole } from "@/lib/session"
import {
  yamAusentismos,
  yamDetalleDiario,
  yamListarPersonal,
  yamResumenAsistencia,
  type YamAsistenciaDia,
  type YamAusentismo,
  type YamPersona,
  type YamResumenAsistencia,
} from "@/lib/yam"

type Result<T> = { data: T } | { error: string }

const ROLES: Parameters<typeof requireRole>[0] = ["admin", "admin_rrhh"]

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Error consultando YAM"
}

export async function getNominaYam(): Promise<Result<YamPersona[]>> {
  try {
    await requireRole(ROLES)
    return { data: await yamListarPersonal() }
  } catch (err) {
    return { error: msg(err) }
  }
}

export async function getAsistenciaDiaYam(
  fecha: string
): Promise<Result<YamAsistenciaDia[]>> {
  try {
    await requireRole(ROLES)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida" }
    return { data: await yamDetalleDiario(fecha) }
  } catch (err) {
    return { error: msg(err) }
  }
}

export async function getAusentismosYam(
  fechaDesde: string,
  fechaHasta: string
): Promise<Result<YamAusentismo[]>> {
  try {
    await requireRole(ROLES)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)
    ) {
      return { error: "Fecha inválida" }
    }
    return { data: await yamAusentismos(fechaDesde, fechaHasta) }
  } catch (err) {
    return { error: msg(err) }
  }
}

export async function getResumenAsistenciaYam(
  legajo: string,
  fechaDesde: string,
  fechaHasta: string
): Promise<Result<YamResumenAsistencia>> {
  try {
    await requireRole(ROLES)
    if (
      !legajo.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)
    ) {
      return { error: "Parámetros inválidos" }
    }
    return { data: await yamResumenAsistencia(legajo.trim(), fechaDesde, fechaHasta) }
  } catch (err) {
    return { error: msg(err) }
  }
}
