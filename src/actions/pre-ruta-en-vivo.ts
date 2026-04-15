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

interface RegistroRow {
  fecha: string
  dominio: string
  chofer: string
  ayudante1: string | null
  ayudante2: string | null
}

const AR_TZ = "America/Argentina/Buenos_Aires"
const hhmmFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: AR_TZ,
})

// Para timestamps reales en UTC (reunion_preruta, checklist_vehiculos)
function hhmm(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return hhmmFormatter.format(d)
}

// Para asistencia_marcas.fecha_marca: el valor se importó como hora AR
// etiquetada como "+00:00" naive. Tomamos HH:MM directo del string ISO.
function hhmmNaive(iso: string | null): string | null {
  if (!iso) return null
  const match = iso.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : null
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

    const [empRes, marcasRes, reunionRes, checklistRes, mapeoRes, registrosRes] = await Promise.all([
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
      supabase
        .from("registros_vehiculos")
        .select("fecha,dominio,chofer,ayudante1,ayudante2")
        .gte("fecha", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .lte("fecha", f)
        .eq("tipo", "egreso")
        .order("fecha", { ascending: false }),
    ])

    if (empRes.error) return { error: empRes.error.message }
    if (marcasRes.error) return { error: marcasRes.error.message }
    if (reunionRes.error) return { error: reunionRes.error.message }
    if (checklistRes.error) return { error: checklistRes.error.message }
    if (mapeoRes.error) return { error: mapeoRes.error.message }
    if (registrosRes.error) return { error: registrosRes.error.message }

    const empleados = (empRes.data || []) as EmpleadoRow[]
    const marcas = (marcasRes.data || []) as MarcaRow[]
    const reuniones = (reunionRes.data || []) as ReunionRow[]
    const checklists = (checklistRes.data || []) as ChecklistRow[]
    const mapeos = (mapeoRes.data || []) as MapeoRow[]
    const registros = (registrosRes.data || []) as RegistroRow[]

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

    // Asignación por persona desde registros_vehiculos tipo egreso.
    // Se intenta primero con el registro de hoy; si no hay, se usa el último
    // egreso de los últimos 14 días (equipos suelen mantenerse estables).
    // `registros` viene ordenado por fecha desc, así que la primera asignación
    // que se setea para cada persona es la más reciente.
    const asignacionByPersona = new Map<string, { dominio: string; chofer: string }>()
    function setIfAbsent(key: string, info: { dominio: string; chofer: string }) {
      if (!asignacionByPersona.has(key)) asignacionByPersona.set(key, info)
    }
    for (const r of registros) {
      const info = { dominio: r.dominio, chofer: r.chofer }
      if (r.chofer) setIfAbsent(normaliza(r.chofer), info)
      if (r.ayudante1) setIfAbsent(normaliza(r.ayudante1), info)
      if (r.ayudante2) setIfAbsent(normaliza(r.ayudante2), info)
    }

    const equipos: PreRutaEquipoLive[] = setDia.map((e) => {
      const horaIngresoIso = entradasByLeg.get(e.legajo) ?? null
      const presente = !!horaIngresoIso

      const horaMatinalIso = reunionByLeg.get(e.legajo) ?? null
      const matinalMarcada = !!horaMatinalIso

      const nombreNorm = normaliza(e.nombre)
      const alias = mapeoByEmp.get(e.id) ?? null

      // Chofer directo: match exacto o vía mapeo
      let chk = checklistByChofer.get(nombreNorm) ?? null
      if (!chk && alias) chk = checklistByChofer.get(alias) ?? null

      // Ayudante o chofer sin checklist propio: heredar del chofer asignado hoy
      const asignacion =
        asignacionByPersona.get(nombreNorm) ??
        (alias ? asignacionByPersona.get(alias) : undefined) ??
        null
      if (!chk && asignacion) {
        chk = checklistByChofer.get(normaliza(asignacion.chofer)) ?? null
      }

      const dominioAsignado = chk?.dominio ?? asignacion?.dominio ?? null
      const checklistHecho = !!chk
      const horaLiberacionIso = chk?.hora ?? null

      // horaIngresoIso viene de asistencia_marcas: hora AR guardada con sufijo +00:00 (naive).
      // Para comparar contra timestamps UTC reales (liberación / now), compenso +3h.
      const ingresoShifted = horaIngresoIso
        ? new Date(new Date(horaIngresoIso).getTime() + 3 * 60 * 60 * 1000).toISOString()
        : null

      let tmlMin: number | null = null
      if (ingresoShifted && horaLiberacionIso) {
        tmlMin = diffMinutes(ingresoShifted, horaLiberacionIso)
      } else if (ingresoShifted && isHoy) {
        tmlMin = diffMinutes(ingresoShifted, nowIso)
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
        dominio: dominioAsignado,
        chofer: e.nombre,
        legajo: e.legajo,
        presente,
        hora_ingreso: hhmmNaive(horaIngresoIso),
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
