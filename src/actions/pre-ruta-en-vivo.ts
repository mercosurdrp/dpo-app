"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { PreRutaEnVivo, PreRutaEquipoLive } from "@/types/database"

const META_MIN = 30

interface EmpleadoRow {
  id: string
  legajo: number
  nombre: string
  sector: string | null
  activo: boolean
}

interface MarcaRow {
  legajo: number
  fecha_marca: string
  tipo_marca: "E" | "S"
}

interface ReunionRow {
  legajo: number
  hora_checkin: string
}

interface ChecklistRow {
  id: string
  tipo: string
  fecha: string
  dominio: string
  chofer: string
  hora: string
  resultado: "aprobado" | "rechazado"
}

interface MapeoRow {
  empleado_id: string
  nombre_chofer: string
}

function hhmm(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toTimeString().slice(0, 5)
}

function diffMinutes(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000)
}

function normaliza(s: string): string {
  return s.trim().toUpperCase()
}

export async function getPreRutaEnVivo(
  fecha?: string,
): Promise<{ data: PreRutaEnVivo } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const f = fecha ?? new Date().toISOString().slice(0, 10)
    const desde = `${f}T00:00:00`
    const hasta = `${f}T23:59:59`
    const isHoy = f === new Date().toISOString().slice(0, 10)
    const nowIso = new Date().toISOString()

    const [empRes, marcasRes, reunionRes, checklistRes, mapeoRes] = await Promise.all([
      supabase.from("empleados").select("id,legajo,nombre,sector,activo").eq("activo", true),
      supabase
        .from("asistencia_marcas")
        .select("legajo,fecha_marca,tipo_marca")
        .gte("fecha_marca", desde)
        .lte("fecha_marca", hasta),
      supabase
        .from("reunion_preruta")
        .select("legajo,hora_checkin")
        .eq("fecha", f),
      supabase
        .from("checklist_vehiculos")
        .select("id,tipo,fecha,dominio,chofer,hora,resultado")
        .eq("fecha", f)
        .eq("tipo", "liberacion"),
      supabase.from("mapeo_empleado_chofer").select("empleado_id,nombre_chofer"),
    ])

    if (empRes.error) return { error: empRes.error.message }
    if (marcasRes.error) return { error: marcasRes.error.message }
    if (reunionRes.error) return { error: reunionRes.error.message }
    if (checklistRes.error) return { error: checklistRes.error.message }
    if (mapeoRes.error) return { error: mapeoRes.error.message }

    const empleados = (empRes.data || []) as EmpleadoRow[]
    const marcas = (marcasRes.data || []) as MarcaRow[]
    const reuniones = (reunionRes.data || []) as ReunionRow[]
    const checklists = (checklistRes.data || []) as ChecklistRow[]
    const mapeos = (mapeoRes.data || []) as MapeoRow[]

    // Filtrar set del día: sector reparto. Si no hay sector confiable, heurística por mapeo.
    const mapeoByEmp = new Map<string, string>()
    for (const m of mapeos) mapeoByEmp.set(m.empleado_id, normaliza(m.nombre_chofer))

    const sectorOk = (e: EmpleadoRow) =>
      !e.sector ||
      ["DISTRIBUCIÓN", "DISTRIBUCION", "REPARTO"].includes(normaliza(e.sector))

    let setDia = empleados.filter(sectorOk)
    if (setDia.length === 0) {
      setDia = empleados.filter((e) => mapeoByEmp.has(e.id))
    }

    // Index marcas por legajo: primera entrada del día
    const entradasByLeg = new Map<number, string>()
    for (const m of marcas) {
      if (m.tipo_marca !== "E") continue
      const prev = entradasByLeg.get(m.legajo)
      if (!prev || new Date(m.fecha_marca) < new Date(prev)) {
        entradasByLeg.set(m.legajo, m.fecha_marca)
      }
    }

    const reunionByLeg = new Map<number, string>()
    for (const r of reuniones) reunionByLeg.set(r.legajo, r.hora_checkin)

    // Index checklist liberacion por nombre chofer normalizado
    const checklistByChofer = new Map<string, ChecklistRow>()
    for (const c of checklists) {
      const key = normaliza(c.chofer)
      const prev = checklistByChofer.get(key)
      if (!prev || new Date(c.hora) < new Date(prev.hora)) {
        checklistByChofer.set(key, c)
      }
    }

    const equipos: PreRutaEquipoLive[] = setDia.map((e) => {
      const horaIngresoIso = entradasByLeg.get(e.legajo) ?? null
      const presente = !!horaIngresoIso

      const horaMatinalIso = reunionByLeg.get(e.legajo) ?? null
      const matinalMarcada = !!horaMatinalIso

      const nombreNorm = normaliza(e.nombre)
      let chk = checklistByChofer.get(nombreNorm) ?? null
      if (!chk) {
        const alias = mapeoByEmp.get(e.id)
        if (alias) chk = checklistByChofer.get(alias) ?? null
      }

      const checklistHecho = !!chk
      const horaLiberacionIso = chk?.hora ?? null

      let tmlMin: number | null = null
      if (horaIngresoIso && horaLiberacionIso) {
        tmlMin = diffMinutes(horaIngresoIso, horaLiberacionIso)
      } else if (horaIngresoIso && isHoy) {
        // proyectado en vivo
        tmlMin = diffMinutes(horaIngresoIso, nowIso)
      }

      let estado: PreRutaEquipoLive["tml_estado"] = "pendiente"
      if (!presente) {
        estado = "pendiente"
      } else if (checklistHecho && tmlMin != null) {
        if (tmlMin <= META_MIN) estado = "ok"
        else estado = "fuera_meta"
      } else if (tmlMin != null) {
        if (tmlMin > META_MIN) estado = "fuera_meta"
        else if (tmlMin >= 20) estado = "en_riesgo"
        else estado = "ok"
      }

      return {
        dominio: chk?.dominio ?? null,
        chofer: e.nombre,
        legajo: e.legajo,
        presente,
        hora_ingreso: hhmm(horaIngresoIso),
        matinal_marcada: matinalMarcada,
        hora_matinal: hhmm(horaMatinalIso),
        checklist_liberacion_hecho: checklistHecho,
        hora_liberacion: hhmm(horaLiberacionIso),
        resultado_checklist: chk?.resultado ?? null,
        tml_minutos: tmlMin,
        tml_estado: estado,
      }
    })

    const ordenEstado: Record<PreRutaEquipoLive["tml_estado"], number> = {
      fuera_meta: 0,
      en_riesgo: 1,
      pendiente: 2,
      ok: 3,
    }
    equipos.sort((a, b) => {
      const d = ordenEstado[a.tml_estado] - ordenEstado[b.tml_estado]
      if (d !== 0) return d
      return a.chofer.localeCompare(b.chofer)
    })

    const total = equipos.length
    const presentes = equipos.filter((e) => e.presente).length
    const matinalOk = equipos.filter((e) => e.matinal_marcada).length
    const checklistsOk = equipos.filter((e) => e.checklist_liberacion_hecho).length
    const salidos = checklistsOk
    const enRiesgo = equipos.filter((e) => e.tml_estado === "en_riesgo").length
    const fueraMeta = equipos.filter((e) => e.tml_estado === "fuera_meta").length
    const okOrRiesgo = equipos.filter(
      (e) => e.tml_estado === "ok" || e.tml_estado === "en_riesgo",
    ).length
    const ventanaPct = total === 0 ? 0 : Math.round((okOrRiesgo / total) * 100)

    return {
      data: {
        fecha: f,
        resumen: {
          total_esperados: total,
          presentes,
          matinal_ok: matinalOk,
          checklists_ok: checklistsOk,
          salidos,
          en_riesgo: enRiesgo,
          fuera_meta: fueraMeta,
        },
        equipos,
        meta_minutos: META_MIN,
        ventana_pct: ventanaPct,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
