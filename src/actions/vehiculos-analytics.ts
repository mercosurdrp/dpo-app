"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  AlertaVehiculo,
  AlertaSeveridad,
  CatalogoVehiculo,
  KmFlotaResumen,
  VehiculoDetalle,
  VehiculoKmDia,
  VehiculoTimelineEvento,
} from "@/types/database"

type Fuente = "registros" | "checklist" | "combustible"

interface Lectura {
  dominio: string
  fecha: string
  hora: string
  odometro: number
  fuente: Fuente
  tipo?: string | null
  chofer?: string | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(fecha: string, days: number): string {
  const d = new Date(fecha + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function startOfMonth(fecha: string): string {
  return fecha.slice(0, 7) + "-01"
}

function startOfYear(fecha: string): string {
  return fecha.slice(0, 4) + "-01-01"
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime()
  const db = new Date(b + "T12:00:00").getTime()
  return Math.round((db - da) / 86400000)
}

function normalizeHora(hora: string | null | undefined): string {
  if (!hora) return "00:00:00"
  // checklist hora is TIMESTAMPTZ; registros hora is TIME HH:MM:SS
  if (hora.includes("T") || hora.includes(" ")) {
    const d = new Date(hora)
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(11, 19)
    }
  }
  return hora.length >= 8 ? hora.slice(0, 8) : (hora + ":00").slice(0, 8)
}

function toFecha(fecha: string | null | undefined, hora: string | null | undefined): string {
  if (fecha) return fecha
  if (hora && (hora.includes("T") || hora.includes(" "))) {
    const d = new Date(hora)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return today()
}

async function fetchLecturas(filters?: {
  dominio?: string
  fechaDesde?: string
  fechaHasta?: string
}): Promise<Lectura[]> {
  const supabase = await createClient()

  let qReg = supabase
    .from("registros_vehiculos")
    .select("dominio, fecha, hora, odometro, tipo, chofer")
    .not("odometro", "is", null)
  let qChk = supabase
    .from("checklist_vehiculos")
    .select("dominio, fecha, hora, odometro, tipo, chofer")
    .not("odometro", "is", null)
  let qCom = supabase
    .from("registro_combustible")
    .select("dominio, fecha, odometro, chofer")
    .not("odometro", "is", null)

  if (filters?.dominio) {
    qReg = qReg.eq("dominio", filters.dominio)
    qChk = qChk.eq("dominio", filters.dominio)
    qCom = qCom.eq("dominio", filters.dominio)
  }
  if (filters?.fechaDesde) {
    qReg = qReg.gte("fecha", filters.fechaDesde)
    qChk = qChk.gte("fecha", filters.fechaDesde)
    qCom = qCom.gte("fecha", filters.fechaDesde)
  }
  if (filters?.fechaHasta) {
    qReg = qReg.lte("fecha", filters.fechaHasta)
    qChk = qChk.lte("fecha", filters.fechaHasta)
    qCom = qCom.lte("fecha", filters.fechaHasta)
  }

  const [reg, chk, com] = await Promise.all([qReg, qChk, qCom])

  const lecturas: Lectura[] = []

  for (const r of (reg.data || []) as Array<{
    dominio: string
    fecha: string
    hora: string
    odometro: number | null
    tipo: string | null
    chofer: string | null
  }>) {
    if (r.odometro == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: r.fecha,
      hora: normalizeHora(r.hora),
      odometro: Number(r.odometro),
      fuente: "registros",
      tipo: r.tipo,
      chofer: r.chofer,
    })
  }

  for (const r of (chk.data || []) as Array<{
    dominio: string
    fecha: string
    hora: string
    odometro: number | null
    tipo: string | null
    chofer: string | null
  }>) {
    if (r.odometro == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: toFecha(r.fecha, r.hora),
      hora: normalizeHora(r.hora),
      odometro: Number(r.odometro),
      fuente: "checklist",
      tipo: r.tipo,
      chofer: r.chofer,
    })
  }

  for (const r of (com.data || []) as Array<{
    dominio: string
    fecha: string
    odometro: number | null
    chofer: string | null
  }>) {
    if (r.odometro == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: r.fecha,
      hora: "12:00:00",
      odometro: Number(r.odometro),
      fuente: "combustible",
      chofer: r.chofer,
    })
  }

  return lecturas
}

export async function getKmPorVehiculo(filters?: {
  dominio?: string
  fechaDesde?: string
  fechaHasta?: string
}): Promise<{ data: VehiculoKmDia[] } | { error: string }> {
  try {
    await requireAuth()
    const lecturas = await fetchLecturas(filters)

    const grupos = new Map<string, Lectura[]>()
    for (const l of lecturas) {
      const key = `${l.dominio}|${l.fecha}`
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(l)
    }

    const result: VehiculoKmDia[] = []
    for (const [key, lects] of grupos) {
      lects.sort((a, b) => a.hora.localeCompare(b.hora))
      // Filter out retrocesos (readings lower than previous same-day reading)
      const limpias: number[] = []
      let prev = -Infinity
      for (const l of lects) {
        if (l.odometro >= prev) {
          limpias.push(l.odometro)
          prev = l.odometro
        }
      }
      if (limpias.length === 0) continue
      const min = Math.min(...limpias)
      const max = Math.max(...limpias)
      const km = max - min
      if (km <= 0) continue
      const [dominio, fecha] = key.split("|")
      result.push({
        dominio,
        fecha,
        km,
        lecturas: limpias.length,
        odometro_min: min,
        odometro_max: max,
      })
    }

    result.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.dominio.localeCompare(b.dominio)))
    return { data: result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getKmFlotaResumen(): Promise<{ data: KmFlotaResumen } | { error: string }> {
  try {
    await requireAuth()
    const hoy = today()
    const ayer = addDays(hoy, -1)
    const inicioMes = startOfMonth(hoy)
    const hace30 = addDays(hoy, -29)
    const desde = inicioMes < hace30 ? inicioMes : hace30

    const res = await getKmPorVehiculo({ fechaDesde: desde, fechaHasta: hoy })
    if ("error" in res) return { error: res.error }
    const dias = res.data

    const kmHoy = dias.filter((d) => d.fecha === hoy).reduce((a, b) => a + b.km, 0)
    const kmAyer = dias.filter((d) => d.fecha === ayer).reduce((a, b) => a + b.km, 0)
    const diasMes = dias.filter((d) => d.fecha >= inicioMes)
    const kmMesActual = diasMes.reduce((a, b) => a + b.km, 0)
    const fechasConActividadMes = new Set(diasMes.map((d) => d.fecha))
    const promedioDiarioMes =
      fechasConActividadMes.size > 0 ? Math.round(kmMesActual / fechasConActividadMes.size) : 0

    const porDominioMes = new Map<string, number>()
    for (const d of diasMes) {
      porDominioMes.set(d.dominio, (porDominioMes.get(d.dominio) || 0) + d.km)
    }
    const rankedMes = Array.from(porDominioMes.entries())
      .map(([dominio, km]) => ({ dominio, km }))
      .sort((a, b) => b.km - a.km)
    const topVehiculosMes = rankedMes.slice(0, 5)
    const bottomVehiculosMes = rankedMes.filter((v) => v.km > 0).slice(-5).reverse()

    const serieMap = new Map<string, number>()
    for (let i = 29; i >= 0; i--) {
      const f = addDays(hoy, -i)
      serieMap.set(f, 0)
    }
    for (const d of dias) {
      if (serieMap.has(d.fecha)) {
        serieMap.set(d.fecha, (serieMap.get(d.fecha) || 0) + d.km)
      }
    }
    const serieDiariaMes = Array.from(serieMap.entries()).map(([fecha, km]) => ({ fecha, km }))

    return {
      data: {
        kmHoy,
        kmAyer,
        kmMesActual,
        promedioDiarioMes,
        topVehiculosMes,
        bottomVehiculosMes,
        serieDiariaMes,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getVehiculoDetalle(
  dominio: string
): Promise<{ data: VehiculoDetalle } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: vehData, error: vehErr } = await supabase
      .from("catalogo_vehiculos")
      .select("*")
      .eq("dominio", dominio)
      .maybeSingle()
    if (vehErr) return { error: vehErr.message }
    if (!vehData) return { error: "Vehículo no encontrado" }
    const vehiculo = vehData as CatalogoVehiculo

    const hoy = today()
    const inicioMes = startOfMonth(hoy)
    const inicioAnio = startOfYear(hoy)
    const hace30 = addDays(hoy, -29)

    const [kmAllRes, kmMesRes, km30Res, combRes, regRes, chkRes] = await Promise.all([
      getKmPorVehiculo({ dominio }),
      getKmPorVehiculo({ dominio, fechaDesde: inicioMes, fechaHasta: hoy }),
      getKmPorVehiculo({ dominio, fechaDesde: hace30, fechaHasta: hoy }),
      supabase
        .from("registro_combustible")
        .select("*")
        .eq("dominio", dominio)
        .order("fecha", { ascending: false }),
      supabase
        .from("registros_vehiculos")
        .select("*")
        .eq("dominio", dominio)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false })
        .limit(60),
      supabase
        .from("checklist_vehiculos")
        .select("*")
        .eq("dominio", dominio)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false })
        .limit(60),
    ])

    if ("error" in kmAllRes) return { error: kmAllRes.error }
    if ("error" in kmMesRes) return { error: kmMesRes.error }
    if ("error" in km30Res) return { error: km30Res.error }

    const kmAll = kmAllRes.data
    const kmMes = kmMesRes.data.reduce((a, b) => a + b.km, 0)
    const kmYTD = kmAll.filter((d) => d.fecha >= inicioAnio).reduce((a, b) => a + b.km, 0)
    const kmHistorico = kmAll.reduce((a, b) => a + b.km, 0)

    const km30Map = new Map<string, number>()
    for (let i = 29; i >= 0; i--) km30Map.set(addDays(hoy, -i), 0)
    for (const d of km30Res.data) {
      if (km30Map.has(d.fecha)) km30Map.set(d.fecha, d.km)
    }
    const kmUltimos30Dias = Array.from(km30Map.entries()).map(([fecha, km]) => ({ fecha, km }))

    const combustibles = (combRes.data || []) as Array<{
      id: string
      fecha: string
      rendimiento: number | null
      km_recorridos: number | null
      litros: number
      costo_total: number | null
    }>

    const cargasConRend = combustibles.filter(
      (c) => c.rendimiento != null && c.km_recorridos != null
    )
    const rendimientoUltimas10Cargas = cargasConRend.slice(0, 10).map((c) => ({
      fecha: c.fecha,
      rendimiento: Number(c.rendimiento),
      km: Number(c.km_recorridos),
      litros: Number(c.litros),
    }))
    const rendimientoPromedio =
      cargasConRend.length > 0
        ? Math.round(
            (cargasConRend.reduce((a, b) => a + Number(b.rendimiento), 0) / cargasConRend.length) *
              100
          ) / 100
        : 0

    const costoMes = combustibles
      .filter((c) => c.fecha >= inicioMes)
      .reduce((a, b) => a + Number(b.costo_total || 0), 0)
    const costoTotalHistorico = combustibles.reduce((a, b) => a + Number(b.costo_total || 0), 0)

    const registros = (regRes.data || []) as Array<{
      id: string
      tipo: string
      fecha: string
      hora: string
      chofer: string | null
      odometro: number | null
      tml_minutos: number | null
    }>
    const checklists = (chkRes.data || []) as Array<{
      id: string
      tipo: string
      fecha: string
      hora: string
      chofer: string | null
      odometro: number | null
      resultado: string
      observaciones: string | null
    }>

    const egresosMes = registros.filter((r) => r.tipo === "egreso" && r.fecha >= inicioMes)
    const totalEgresosMes = egresosMes.length
    const tmlVals = egresosMes.map((r) => r.tml_minutos).filter((v): v is number => v != null)
    const tmlPromedio =
      tmlVals.length > 0 ? Math.round(tmlVals.reduce((a, b) => a + b, 0) / tmlVals.length) : 0

    let ultimoOdometro: number | null = null
    let ultimaActividad: string | null = null
    for (const l of [...kmAll]) {
      // kmAll already sorted desc by fecha
      if (ultimoOdometro == null) {
        ultimoOdometro = l.odometro_max
        ultimaActividad = l.fecha
        break
      }
    }

    const timeline: VehiculoTimelineEvento[] = []
    for (const r of registros) {
      const hora = normalizeHora(r.hora)
      if (r.tipo === "egreso") {
        timeline.push({
          tipo: "egreso",
          fecha: r.fecha,
          hora,
          descripcion: "Egreso del depósito",
          chofer: r.chofer,
          odometro: r.odometro,
          link: null,
        })
      } else if (r.tipo === "ingreso") {
        timeline.push({
          tipo: "retorno",
          fecha: r.fecha,
          hora,
          descripcion: "Ingreso al depósito",
          chofer: r.chofer,
          odometro: r.odometro,
          link: null,
        })
      }
    }
    for (const c of checklists) {
      const hora = normalizeHora(c.hora)
      const fechaC = toFecha(c.fecha, c.hora)
      if (c.tipo === "liberacion") {
        timeline.push({
          tipo: "liberacion",
          fecha: fechaC,
          hora,
          descripcion: `Liberación (${c.resultado})`,
          chofer: c.chofer,
          odometro: c.odometro,
          link: null,
        })
      } else if (c.tipo === "retorno") {
        timeline.push({
          tipo: "retorno_chk",
          fecha: fechaC,
          hora,
          descripcion: `Retorno checklist (${c.resultado})`,
          chofer: c.chofer,
          odometro: c.odometro,
          link: null,
        })
      }
      if (c.resultado === "rechazado") {
        timeline.push({
          tipo: "checklist_nook",
          fecha: fechaC,
          hora,
          descripcion: `Checklist rechazado${c.observaciones ? `: ${c.observaciones}` : ""}`,
          chofer: c.chofer,
          odometro: c.odometro,
          link: null,
        })
      }
    }
    for (const c of combustibles.slice(0, 30)) {
      timeline.push({
        tipo: "combustible",
        fecha: c.fecha,
        hora: "12:00:00",
        descripcion: `Carga de combustible${
          c.litros ? ` - ${Number(c.litros)} L` : ""
        }${c.rendimiento ? ` - ${Number(c.rendimiento)} km/l` : ""}`,
        chofer: null,
        odometro: null,
        link: null,
      })
    }

    timeline.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
      return a.hora < b.hora ? 1 : -1
    })
    const timelineTrim = timeline.slice(0, 30)

    const alertasRes = await getAlertasVehiculos()
    const proximaAlerta =
      "data" in alertasRes ? alertasRes.data.find((a) => a.dominio === dominio) || null : null

    return {
      data: {
        vehiculo,
        kpis: {
          kmMes,
          kmYTD,
          kmHistorico,
          rendimientoPromedio,
          costoMes: Math.round(costoMes * 100) / 100,
          costoTotalHistorico: Math.round(costoTotalHistorico * 100) / 100,
          tmlPromedio,
          totalEgresosMes,
          ultimoOdometro,
          ultimaActividad,
        },
        kmUltimos30Dias,
        rendimientoUltimas10Cargas,
        timeline: timelineTrim,
        proximaAlerta,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getAlertasVehiculos(): Promise<
  { data: AlertaVehiculo[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: vehData, error: vehErr } = await supabase
      .from("catalogo_vehiculos")
      .select("*")
      .eq("active", true)
    if (vehErr) return { error: vehErr.message }
    const vehiculos = (vehData || []) as CatalogoVehiculo[]

    const lecturas = await fetchLecturas()
    const porDominio = new Map<string, Lectura[]>()
    for (const l of lecturas) {
      if (!porDominio.has(l.dominio)) porDominio.set(l.dominio, [])
      porDominio.get(l.dominio)!.push(l)
    }
    for (const arr of porDominio.values()) {
      arr.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
        return a.hora < b.hora ? -1 : 1
      })
    }

    const hoy = today()
    const alertas: AlertaVehiculo[] = []

    for (const v of vehiculos) {
      const arr = porDominio.get(v.dominio) || []
      if (arr.length === 0) {
        alertas.push({
          id: `sm-${v.dominio}`,
          tipo: "sin_movimiento",
          severidad: "danger",
          dominio: v.dominio,
          titulo: "Sin actividad registrada",
          descripcion: "El vehículo no tiene lecturas de odómetro en ninguna fuente",
        })
        continue
      }
      const ultima = arr[arr.length - 1]
      const diff = daysBetween(ultima.fecha, hoy)
      if (diff >= 3) {
        const sev: AlertaSeveridad = diff >= 7 ? "danger" : "warning"
        alertas.push({
          id: `sm-${v.dominio}`,
          tipo: "sin_movimiento",
          severidad: sev,
          dominio: v.dominio,
          titulo: `Sin movimiento hace ${diff} días`,
          descripcion: `Última lectura: ${ultima.fecha}`,
          valor: diff,
          fecha: ultima.fecha,
        })
      }
    }

    for (const [dominio, arr] of porDominio) {
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1]
        const cur = arr[i]
        if (cur.odometro < prev.odometro) {
          alertas.push({
            id: `ro-${dominio}-${cur.fecha}-${cur.hora}`,
            tipo: "retroceso_odometro",
            severidad: "danger",
            dominio,
            titulo: "Retroceso de odómetro",
            descripcion: `De ${prev.odometro} (${prev.fecha}) a ${cur.odometro} (${cur.fecha})`,
            valor: prev.odometro - cur.odometro,
            fecha: cur.fecha,
          })
          break
        }
      }
    }

    const { data: combData, error: combErr } = await supabase
      .from("registro_combustible")
      .select("dominio, fecha, rendimiento")
      .not("rendimiento", "is", null)
      .order("fecha", { ascending: false })
    if (combErr) return { error: combErr.message }
    const seenComb = new Set<string>()
    for (const c of (combData || []) as Array<{
      dominio: string
      fecha: string
      rendimiento: number | null
    }>) {
      if (seenComb.has(c.dominio)) continue
      seenComb.add(c.dominio)
      const rend = Number(c.rendimiento)
      if (rend < 2 && rend > 0) {
        alertas.push({
          id: `rb-${c.dominio}`,
          tipo: "rendimiento_bajo",
          severidad: "warning",
          dominio: c.dominio,
          titulo: "Rendimiento bajo",
          descripcion: `Última carga con rendimiento ${rend} km/l`,
          valor: rend,
          fecha: c.fecha,
        })
      }
    }

    const dow = new Date(hoy + "T12:00:00").getDay() // 0 dom, 6 sab
    if (dow >= 1 && dow <= 6) {
      const { data: libData, error: libErr } = await supabase
        .from("checklist_vehiculos")
        .select("dominio")
        .eq("tipo", "liberacion")
        .eq("fecha", hoy)
      if (libErr) return { error: libErr.message }
      const conLiberacion = new Set(
        ((libData || []) as Array<{ dominio: string }>).map((r) => r.dominio)
      )
      for (const v of vehiculos) {
        if (!conLiberacion.has(v.dominio)) {
          alertas.push({
            id: `sl-${v.dominio}`,
            tipo: "sin_liberacion",
            severidad: "info",
            dominio: v.dominio,
            titulo: "Sin liberación hoy",
            descripcion: "No se registró checklist de liberación en el día",
            fecha: hoy,
          })
        }
      }
    }

    const sevOrder: Record<AlertaSeveridad, number> = { danger: 3, warning: 2, info: 1 }
    alertas.sort((a, b) => {
      const s = sevOrder[b.severidad] - sevOrder[a.severidad]
      if (s !== 0) return s
      return a.dominio.localeCompare(b.dominio)
    })

    return { data: alertas }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
