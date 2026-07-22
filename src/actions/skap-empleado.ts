"use server"

// Vista SKAP del PROPIO evaluado (DPO Entrega R2.1.4 — visibilidad
// individualizada). Nunca acepta un empleado por parámetro: siempre resuelve
// la identidad desde la sesión, igual que `visibilidad-resultados.ts`.

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { calcularCelda } from "@/lib/skap/gap"
import { ROLES_SKAP } from "@/lib/skap/roles"
import type {
  SkapRol,
  SkapHabilidad,
  SkapHabilidadEmpleado,
  SkapRolEmpleado,
  SkapEmpleadoData,
} from "@/types/database"

/**
 * Las habilidades del usuario logueado, con su nivel, el estándar de su rol,
 * el gap y la evolución histórica de cada una.
 *
 * Devuelve `null` (y NO un error) cuando no hay nada que mostrar — usuario sin
 * legajo vinculado o sin asignación en la matriz — para que la sección
 * simplemente no aparezca en vez de ensuciar la pantalla.
 */
export async function getMisHabilidades(): Promise<SkapEmpleadoData | null> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: empleado } = await supabase
      .from("empleados")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle()
    if (!empleado) return null

    // Una persona puede tener más de un rol y se la evalúa en todos.
    const { data: asigRaw } = await supabase
      .from("skap_asignaciones")
      .select("rol")
      .eq("empleado_id", empleado.id)
      .eq("activo", true)

    const roles = [...new Set(((asigRaw || []) as { rol: SkapRol }[]).map((a) => a.rol))]
    if (roles.length === 0) return null

    const { data: habsRaw } = await supabase
      .from("skap_habilidades")
      .select("*")
      .in("rol", roles)
      .eq("activo", true)
      .order("orden", { ascending: true })
    const habilidades = (habsRaw || []) as SkapHabilidad[]
    if (habilidades.length === 0) return null

    // Historial completo de esta persona: la primera de cada habilidad es la
    // vigente (vienen desc), el resto arma la evolución.
    const { data: evalRaw } = await supabase
      .from("skap_evaluaciones")
      .select("habilidad_id, nivel, estandar_individual, fecha_evaluacion")
      .eq("empleado_id", empleado.id)
      .in(
        "habilidad_id",
        habilidades.map((h) => h.id),
      )
      .order("fecha_evaluacion", { ascending: false })

    type EvalRow = {
      habilidad_id: string
      nivel: number | null
      estandar_individual: number | null
      fecha_evaluacion: string
    }
    const porHabilidad = new Map<string, EvalRow[]>()
    for (const e of (evalRaw || []) as EvalRow[]) {
      const lista = porHabilidad.get(e.habilidad_id)
      if (lista) lista.push(e)
      else porHabilidad.set(e.habilidad_id, [e])
    }

    const rolesData: SkapRolEmpleado[] = roles
      .map((rol) => {
        const delRol = habilidades.filter((h) => h.rol === rol)
        const items: SkapHabilidadEmpleado[] = delRol.map((h) => {
          const historial = porHabilidad.get(h.id) || []
          const celda = calcularCelda(h, historial[0])
          return {
            habilidad_id: h.id,
            bloque: h.bloque,
            criticidad: h.criticidad,
            habilidad: h.habilidad,
            nivel: celda.nivel,
            estandar: celda.estandar,
            gap: celda.gap,
            estado: celda.estado,
            fecha_evaluacion: celda.fecha_evaluacion,
            historial: [...historial]
              .reverse()
              .map((e) => ({ fecha: e.fecha_evaluacion, nivel: e.nivel })),
          }
        })

        const evaluadas = items.filter(
          (i) => i.estado !== "sin_evaluar" && i.estado !== "no_aplica",
        )
        const criticasEval = evaluadas.filter((i) => i.criticidad === "A")

        return {
          rol,
          label: ROLES_SKAP.find((r) => r.rol === rol)?.label ?? rol,
          habilidades: items,
          pct_criticas:
            criticasEval.length > 0
              ? (criticasEval.filter((i) => i.estado === "cumple").length / criticasEval.length) * 100
              : null,
          evaluadas: evaluadas.length,
          total: items.length,
          gaps: evaluadas.filter((i) => i.estado === "critico" || i.estado === "brecha").length,
        }
      })
      .filter((r) => r.habilidades.length > 0)

    if (rolesData.length === 0) return null
    return { roles: rolesData }
  } catch (err) {
    console.error("[skap-empleado] getMisHabilidades", err)
    return null
  }
}
