"use server"

import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import type {
  RrhhInasistenciaRow,
  RrhhTotalHorasRow,
  RrhhPausaRow,
} from "@/types/database"

// Cómo interpretar las marcas almacenadas:
// - false (default): la marca está en UTC verdadero (ej: 10:03 UTC = 07:03 Argentina).
// - true: el reloj guardó hora Argentina pero la etiquetó como UTC (caso histórico
//   en algunos tenants). En ese caso hay que sumar 3hs para obtener UTC verdadero
//   antes de pasarla al frontend, que aplica timeZone "America/Argentina/Buenos_Aires".
const MARCAS_EN_HORA_ARGENTINA = process.env.MARCAS_EN_HORA_ARGENTINA === "true"

// Devuelve un timestamp ISO en UTC verdadero, normalizado para que el frontend
// lo pueda mostrar correctamente con toLocaleTimeString({ timeZone: "...Argentina..." }).
function normalizarUtc(fecha: string): string {
  if (!MARCAS_EN_HORA_ARGENTINA) return fecha
  const d = new Date(fecha)
  d.setTime(d.getTime() + 3 * 3600 * 1000)
  return d.toISOString()
}

// Hora Argentina (UTC-3, sin DST) extraída de la marca.
function horaArgentina(fecha: string): { hh: number; mm: number } {
  const d = new Date(normalizarUtc(fecha))
  const hh = (d.getUTCHours() - 3 + 24) % 24
  return { hh, mm: d.getUTCMinutes() }
}

// ---------- Types ----------

export interface MarcaAsistencia {
  id: string
  codigo_empresa: string
  legajo: number
  fecha_marca: string
  tipo_marca: "E" | "S"
  reloj_marca: string | null
  created_at: string
  origen?: "biometrica" | "manual"
}

export type TipoNovedad = "vacaciones" | "licencia_medica" | "ausente" | "pergamino" | "licencia_gremial"

export interface NovedadAsistencia {
  id: string
  legajo: number
  fecha: string
  tipo: TipoNovedad
  observaciones: string | null
  created_at: string
}

export interface ResumenDiarioEmpleado {
  legajo: number
  nombre: string
  sector: string
  fecha: string
  primera_entrada: string | null
  ultima_salida: string | null
  horas_trabajadas: number | null
  novedad: TipoNovedad | null
  marcas: MarcaAsistencia[]
  /** true si la primera entrada del día fue cargada manualmente (reloj caído). */
  entrada_manual: boolean
}

export interface ResumenMensualEmpleado {
  legajo: number
  nombre: string
  sector: string
  dias_trabajados: number
  horas_totales: number
  promedio_horas: number
  tardanzas: number
  ausencias: number
}

// ---------- getMarcasDiarias ----------

export async function getMarcasDiarias(
  fecha: string
): Promise<{ data: ResumenDiarioEmpleado[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get all marcas for the date
    const fechaDesde = `${fecha}T00:00:00`
    const fechaHasta = `${fecha}T23:59:59`

    const { data: marcas, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .gte("fecha_marca", fechaDesde)
      .lte("fecha_marca", fechaHasta)
      .order("fecha_marca")

    if (marcasErr) return { error: marcasErr.message }

    const marcasArr = (marcas ?? []) as MarcaAsistencia[]

    // Get all empleados
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre")

    const empleadosArr = (empleados ?? []) as { legajo: number; nombre: string; sector: string }[]

    // Get novedades for the date
    const { data: novedades } = await supabase
      .from("asistencia_novedades")
      .select("*")
      .eq("fecha", fecha)

    const novedadMap = new Map<number, TipoNovedad>()
    for (const n of (novedades ?? []) as NovedadAsistencia[]) {
      novedadMap.set(n.legajo, n.tipo)
    }

    // Group marcas by legajo
    const marcasPorLegajo = new Map<number, MarcaAsistencia[]>()
    for (const m of marcasArr) {
      const list = marcasPorLegajo.get(m.legajo) ?? []
      list.push(m)
      marcasPorLegajo.set(m.legajo, list)
    }

    // Build resumen for each empleado
    const result: ResumenDiarioEmpleado[] = empleadosArr.map((emp) => {
      const marcasEmp = marcasPorLegajo.get(emp.legajo) ?? []
      const entradas = marcasEmp.filter((m) => m.tipo_marca === "E")
      const salidas = marcasEmp.filter((m) => m.tipo_marca === "S")

      const primeraEntrada = entradas.length > 0 ? normalizarUtc(entradas[0].fecha_marca) : null
      const ultimaSalida = salidas.length > 0 ? normalizarUtc(salidas[salidas.length - 1].fecha_marca) : null

      let horasTrabajadas: number | null = null
      if (primeraEntrada && ultimaSalida) {
        const diff = new Date(ultimaSalida).getTime() - new Date(primeraEntrada).getTime()
        horasTrabajadas = Math.round((diff / 3600000) * 100) / 100
      }

      return {
        legajo: emp.legajo,
        nombre: emp.nombre,
        sector: emp.sector ?? "Distribución",
        fecha,
        primera_entrada: primeraEntrada,
        ultima_salida: ultimaSalida,
        horas_trabajadas: horasTrabajadas,
        novedad: novedadMap.get(emp.legajo) ?? null,
        marcas: marcasEmp.map((m) => ({ ...m, fecha_marca: normalizarUtc(m.fecha_marca) })),
        entrada_manual: entradas.length > 0 && entradas[0].origen === "manual",
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading marcas" }
  }
}

// ---------- getResumenMensual ----------

export async function getResumenMensual(
  mes: number,
  anio: number,
  horaEntradaEsperada: number = 7 // hora esperada de entrada (7:00 estricto, hora Argentina UTC-3)
): Promise<{ data: ResumenMensualEmpleado[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const fechaDesde = `${anio}-${String(mes).padStart(2, "0")}-01T00:00:00`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const fechaHasta = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}T23:59:59`

    // Get all marcas for the month
    const { data: marcas, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .gte("fecha_marca", fechaDesde)
      .lte("fecha_marca", fechaHasta)
      .order("fecha_marca")

    if (marcasErr) return { error: marcasErr.message }

    const marcasArr = (marcas ?? []) as MarcaAsistencia[]

    // Get all empleados
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre")

    const empleadosArr = (empleados ?? []) as { legajo: number; nombre: string; sector: string }[]

    // Count business days in the month (Mon-Sat)
    let diasLaborales = 0
    for (let d = 1; d <= ultimoDia; d++) {
      const dayOfWeek = new Date(anio, mes - 1, d).getDay()
      if (dayOfWeek !== 0) diasLaborales++ // exclude Sundays
    }

    // Group marcas by legajo then by date
    const marcasPorLegajo = new Map<number, Map<string, MarcaAsistencia[]>>()
    for (const m of marcasArr as MarcaAsistencia[]) {
      const fecha = m.fecha_marca.slice(0, 10)
      if (!marcasPorLegajo.has(m.legajo)) {
        marcasPorLegajo.set(m.legajo, new Map())
      }
      const porFecha = marcasPorLegajo.get(m.legajo)!
      const list = porFecha.get(fecha) ?? []
      list.push(m)
      porFecha.set(fecha, list)
    }

    const result: ResumenMensualEmpleado[] = empleadosArr.map((emp) => {
      const porFecha = marcasPorLegajo.get(emp.legajo) ?? new Map()

      let diasTrabajados = 0
      let diasConHoras = 0
      let horasTotales = 0
      let tardanzas = 0

      for (const [, marcasDia] of porFecha) {
        const entradas = marcasDia.filter((m: MarcaAsistencia) => m.tipo_marca === "E")
        const salidas = marcasDia.filter((m: MarcaAsistencia) => m.tipo_marca === "S")

        if (entradas.length > 0) {
          diasTrabajados++

          // Check tardanza estricta (cualquier entrada > 7:00 hora Argentina, UTC-3)
          const { hh, mm } = horaArgentina(entradas[0].fecha_marca)
          if (hh > horaEntradaEsperada || (hh === horaEntradaEsperada && mm > 0)) {
            tardanzas++
          }

          // Calculate hours (la diff entre dos timestamps es independiente de la TZ)
          if (salidas.length > 0) {
            const primeraEntrada = new Date(entradas[0].fecha_marca)
            const ultimaSalida = new Date(salidas[salidas.length - 1].fecha_marca)
            const diff = ultimaSalida.getTime() - primeraEntrada.getTime()
            horasTotales += diff / 3600000
            diasConHoras++
          }
        }
      }

      return {
        legajo: emp.legajo,
        nombre: emp.nombre,
        sector: emp.sector ?? "Distribución",
        dias_trabajados: diasTrabajados,
        horas_totales: Math.round(horasTotales * 100) / 100,
        promedio_horas: diasConHoras > 0
          ? Math.round((horasTotales / diasConHoras) * 100) / 100
          : 0,
        tardanzas,
        ausencias: Math.max(0, diasLaborales - diasTrabajados),
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading resumen" }
  }
}

// ---------- getUltimasMarcas ----------

export async function getUltimasMarcas(
  limit: number = 50
): Promise<{ data: (MarcaAsistencia & { nombre_empleado: string })[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: marcas, error } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .order("fecha_marca", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message }

    const marcasArr = (marcas ?? []) as MarcaAsistencia[]

    // Get employee names
    const legajos = [...new Set(marcasArr.map((m) => m.legajo))]
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre")
      .in("legajo", legajos)

    const nombreMap = new Map<number, string>()
    for (const e of empleados ?? []) {
      nombreMap.set(e.legajo, e.nombre)
    }

    const result = marcasArr.map((m) => ({
      ...m,
      fecha_marca: normalizarUtc(m.fecha_marca),
      nombre_empleado: nombreMap.get(m.legajo) ?? `Legajo ${m.legajo}`,
    }))

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading ultimas marcas" }
  }
}

// ---------- Novedades CRUD ----------

export async function setNovedad(data: {
  legajo: number
  fecha: string
  tipo: TipoNovedad
  observaciones?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("asistencia_novedades")
      .upsert(
        {
          legajo: data.legajo,
          fecha: data.fecha,
          tipo: data.tipo,
          observaciones: data.observaciones ?? null,
        },
        { onConflict: "legajo,fecha" }
      )

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error saving novedad" }
  }
}

export async function removeNovedad(
  legajo: number,
  fecha: string
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("asistencia_novedades")
      .delete()
      .eq("legajo", legajo)
      .eq("fecha", fecha)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error removing novedad" }
  }
}

// ===================================================
// Marca de presente MANUAL (admin / admin_rrhh)
// Para días en que el reloj biométrico no funcionó. Inserta una marca
// de Entrada con origen='manual' a las 12:00 del día (simbólico, NO se
// usa para horas trabajadas: una marca sin salida tiene horas=null).
// ===================================================

export async function setPresenteManual(
  legajo: number,
  fecha: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    // 12:00 ARG del día, formato ISO. La convención de timestamps del
    // tenant (UTC verdadero vs ARG disfrazada UTC) la respeta el resto
    // del código al leer; al insertar usamos el mismo string-format que
    // tienen las marcas de la sync para no inventar otra convención.
    const fechaMarca = `${fecha}T12:00:00.000Z`

    const { error } = await supabase
      .from("asistencia_marcas")
      .insert({
        codigo_empresa: "MPAMP",
        legajo,
        fecha_marca: fechaMarca,
        tipo_marca: "E",
        reloj_marca: "MANUAL",
        origen: "manual",
        creado_por: profile.id,
        creado_en: new Date().toISOString(),
      })

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error marcando presente" }
  }
}

export async function quitarPresenteManual(
  legajo: number,
  fecha: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    // Borra solo las marcas manuales del día — nunca las biométricas.
    const desde = `${fecha}T00:00:00.000Z`
    const hasta = `${fecha}T23:59:59.999Z`
    const { error } = await supabase
      .from("asistencia_marcas")
      .delete()
      .eq("legajo", legajo)
      .eq("origen", "manual")
      .gte("fecha_marca", desde)
      .lte("fecha_marca", hasta)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error quitando presente manual" }
  }
}

// ===================================================
// Ausentismo: serie diaria + detalle por persona del mes
// Para el indicador "Ausentismo" en la reunión de logística (Depósito +
// Distribución). Cuenta empleados con novedad 'ausente' o 'licencia_medica'
// — sin marca biométrica NI manual cuenta como ausente implícito sólo si
// no es fin de semana y no hay otra novedad.
// ===================================================

export interface AusentismoPersona {
  legajo: number
  nombre: string
  sector: string
  /** 'licencia_medica' | 'ausente' (incluye implícitos por no fichar). */
  tipo: "licencia_medica" | "ausente"
  observaciones: string | null
}

export interface AusentismoSerie {
  /** Sectores incluidos en el cálculo (info, para la UI). */
  sectores: string[]
  /** Por fecha YYYY-MM-DD → cantidad de ausentes + licencias médicas. null si
   *  la fecha es futura (no hay info aún). */
  por_fecha: Record<string, number | null>
  /** Detalle por fecha para el drill-down. */
  detalle_por_fecha: Record<string, AusentismoPersona[]>
}

export async function getAusentismoDelDia(
  fecha: string,
  sectores: string[] = ["Depósito", "Distribución"],
): Promise<{ data: AusentismoPersona[] } | { error: string }> {
  const partes = fecha.split("-").map((s) => parseInt(s, 10))
  if (partes.length !== 3 || !partes.every(Number.isFinite)) {
    return { error: "Fecha inválida" }
  }
  const res = await getAusentismoSerie(partes[1], partes[0], sectores)
  if ("error" in res) return res
  return { data: res.data.detalle_por_fecha[fecha] ?? [] }
}

export async function getAusentismoSerie(
  mes: number,
  anio: number,
  sectores: string[] = ["Depósito", "Distribución"],
): Promise<{ data: AusentismoSerie } | { error: string }> {
  try {
    const supabase = await createClient()

    const ultimoDia = new Date(anio, mes, 0).getDate()
    const mm = String(mes).padStart(2, "0")
    const fechaDesde = `${anio}-${mm}-01`
    const fechaHasta = `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}`

    const [empleadosRes, novedadesRes, marcasRes] = await Promise.all([
      supabase
        .from("empleados")
        .select("legajo, nombre, sector")
        .eq("activo", true)
        .in("sector", sectores),
      // Traemos TODAS las novedades del mes para los empleados (no sólo
      // ausente/licencia): vacaciones y pergamino justifican la ausencia
      // implícita y NO deben sumar al indicador.
      supabase
        .from("asistencia_novedades")
        .select("legajo, fecha, tipo, observaciones")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta),
      supabase
        .from("asistencia_marcas")
        .select("legajo, fecha_marca")
        .eq("tipo_marca", "E")
        .gte("fecha_marca", `${fechaDesde}T00:00:00`)
        .lte("fecha_marca", `${fechaHasta}T23:59:59`),
    ])

    if (empleadosRes.error) return { error: empleadosRes.error.message }
    if (novedadesRes.error) return { error: novedadesRes.error.message }
    if (marcasRes.error) return { error: marcasRes.error.message }

    const empleados = (empleadosRes.data ?? []) as Array<{
      legajo: number
      nombre: string
      sector: string
    }>
    const empleadoByLegajo = new Map(empleados.map((e) => [e.legajo, e]))

    // Set de empleado|fecha con marca de entrada (= vino, ya sea biométrica o manual).
    const conMarca = new Set<string>()
    for (const m of (marcasRes.data ?? []) as Array<{ legajo: number; fecha_marca: string }>) {
      const f = m.fecha_marca.slice(0, 10)
      if (empleadoByLegajo.has(m.legajo)) conMarca.add(`${m.legajo}|${f}`)
    }

    // Novedades del mes (todas: ausente, licencia, vacaciones, pergamino).
    const novedadByEmpFecha = new Map<
      string,
      { tipo: TipoNovedad; observaciones: string | null }
    >()
    for (const n of (novedadesRes.data ?? []) as Array<{
      legajo: number
      fecha: string
      tipo: TipoNovedad
      observaciones: string | null
    }>) {
      novedadByEmpFecha.set(`${n.legajo}|${n.fecha}`, {
        tipo: n.tipo,
        observaciones: n.observaciones,
      })
    }

    // Recorrer día por día del mes y armar el detalle.
    const por_fecha: Record<string, number | null> = {}
    const detalle_por_fecha: Record<string, AusentismoPersona[]> = {}
    const hoyIso = new Date().toISOString().slice(0, 10)

    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = `${anio}-${mm}-${String(d).padStart(2, "0")}`
      // Futuro: no hay info aún.
      if (fecha > hoyIso) {
        por_fecha[fecha] = null
        continue
      }
      // Domingo: no laborable en Pampeana, no se cuenta ausentismo
      // (igual que el cálculo de días laborales en /asistencia).
      const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay()
      if (diaSemana === 0) {
        por_fecha[fecha] = null
        continue
      }
      const personas: AusentismoPersona[] = []
      for (const emp of empleados) {
        const nov = novedadByEmpFecha.get(`${emp.legajo}|${fecha}`)
        const tieneMarca = conMarca.has(`${emp.legajo}|${fecha}`)

        if (nov?.tipo === "licencia_medica") {
          personas.push({
            legajo: emp.legajo,
            nombre: emp.nombre,
            sector: emp.sector,
            tipo: "licencia_medica",
            observaciones: nov.observaciones,
          })
        } else if (nov?.tipo === "ausente") {
          personas.push({
            legajo: emp.legajo,
            nombre: emp.nombre,
            sector: emp.sector,
            tipo: "ausente",
            observaciones: nov.observaciones,
          })
        } else if (!nov && !tieneMarca) {
          // Sin marca + sin ninguna novedad: ausente implícito. El admin
          // puede revertirlo cargando una marca manual ("Marcar presente")
          // o una novedad de vacaciones/pergamino, según corresponda.
          personas.push({
            legajo: emp.legajo,
            nombre: emp.nombre,
            sector: emp.sector,
            tipo: "ausente",
            observaciones: null,
          })
        }
        // vacaciones / pergamino: justifican la ausencia, no suman.
      }
      por_fecha[fecha] = personas.length
      detalle_por_fecha[fecha] = personas
    }

    return {
      data: {
        sectores,
        por_fecha,
        detalle_por_fecha,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error calculando ausentismo",
    }
  }
}

// ===================================================
// Reportes RRHH derivados (cruzan marcas × jornadas × novedades)
// ===================================================

interface ReporteFiltros {
  desde: string // YYYY-MM-DD
  hasta: string
  legajo?: number
}

// Inasistencias: días laborables (jornada esperada vigente, no_laborable=false)
// sin marca de entrada y sin novedad justificada.
export async function reporteInasistenciasMes(
  filtros: ReporteFiltros
): Promise<{ data: RrhhInasistenciaRow[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Empleados activos (filtrados opcionalmente por legajo).
    let qEmpleados = supabase
      .from("empleados")
      .select("id, legajo, nombre")
      .eq("activo", true)
    if (filtros.legajo) qEmpleados = qEmpleados.eq("legajo", filtros.legajo)
    const { data: empleados, error: errEmp } = await qEmpleados
    if (errEmp) return { error: errEmp.message }

    // Marcas E del rango (días con presencia).
    let qMarcas = supabase
      .from("asistencia_marcas")
      .select("legajo, fecha_marca, tipo_marca")
      .eq("tipo_marca", "E")
      .gte("fecha_marca", `${filtros.desde}T00:00:00Z`)
      .lte("fecha_marca", `${filtros.hasta}T23:59:59Z`)
    if (filtros.legajo) qMarcas = qMarcas.eq("legajo", filtros.legajo)
    const { data: marcas, error: errMar } = await qMarcas
    if (errMar) return { error: errMar.message }

    const presenteSet = new Set<string>()
    for (const m of (marcas ?? []) as { legajo: number; fecha_marca: string }[]) {
      const d = new Date(normalizarUtc(m.fecha_marca))
      // Para fecha local Argentina, restamos 3h y tomamos YYYY-MM-DD UTC.
      d.setTime(d.getTime() - 3 * 3600 * 1000)
      const fechaStr = d.toISOString().slice(0, 10)
      presenteSet.add(`${m.legajo}_${fechaStr}`)
    }

    // Novedades del rango.
    let qNov = supabase
      .from("asistencia_novedades")
      .select("legajo, fecha, tipo")
      .gte("fecha", filtros.desde)
      .lte("fecha", filtros.hasta)
    if (filtros.legajo) qNov = qNov.eq("legajo", filtros.legajo)
    const { data: novedades, error: errNov } = await qNov
    if (errNov) return { error: errNov.message }

    const novMap = new Map<string, string>()
    for (const n of (novedades ?? []) as { legajo: number; fecha: string; tipo: string }[]) {
      novMap.set(`${n.legajo}_${n.fecha}`, n.tipo)
    }

    // Iterar días en el rango y consultar jornada esperada (RPC).
    const out: RrhhInasistenciaRow[] = []
    const empleadosArr = (empleados ?? []) as { id: string; legajo: number; nombre: string }[]

    const desde = new Date(filtros.desde + "T00:00:00Z")
    const hasta = new Date(filtros.hasta + "T00:00:00Z")

    for (const emp of empleadosArr) {
      for (
        let d = new Date(desde);
        d.getTime() <= hasta.getTime();
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const fechaStr = d.toISOString().slice(0, 10)
        const key = `${emp.legajo}_${fechaStr}`
        const nov = novMap.get(key)
        const presente = presenteSet.has(key)

        // Saltamos días con marca presente y sin novedad — todo OK.
        if (presente && !nov) continue

        // Consultamos la jornada esperada del día.
        const { data: jor } = await supabase.rpc("rrhh_jornada_esperada", {
          p_empleado_id: emp.id,
          p_fecha: fechaStr,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = ((jor ?? []) as any[])[0]

        // Sin jornada vigente o explícitamente no_laborable → no inasistencia.
        if (!row || row.no_laborable) continue

        if (nov) {
          out.push({
            legajo: emp.legajo,
            nombre: emp.nombre,
            fecha: fechaStr,
            motivo: "novedad",
            novedad_tipo: nov,
          })
        } else if (!presente) {
          out.push({
            legajo: emp.legajo,
            nombre: emp.nombre,
            fecha: fechaStr,
            motivo: "sin_marca",
            novedad_tipo: null,
          })
        }
      }
    }

    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando reporte" }
  }
}

// Total horas: por empleado en el rango, suma horas trabajadas (parejas E/S
// del mismo día) vs horas esperadas según jornada.
export async function reporteTotalHoras(
  filtros: ReporteFiltros
): Promise<{ data: RrhhTotalHorasRow[] } | { error: string }> {
  try {
    const supabase = await createClient()

    let qEmpleados = supabase
      .from("empleados")
      .select("id, legajo, nombre")
      .eq("activo", true)
    if (filtros.legajo) qEmpleados = qEmpleados.eq("legajo", filtros.legajo)
    const { data: empleados, error: errEmp } = await qEmpleados
    if (errEmp) return { error: errEmp.message }

    let qMarcas = supabase
      .from("asistencia_marcas")
      .select("legajo, fecha_marca, tipo_marca")
      .gte("fecha_marca", `${filtros.desde}T00:00:00Z`)
      .lte("fecha_marca", `${filtros.hasta}T23:59:59Z`)
      .order("fecha_marca", { ascending: true })
    if (filtros.legajo) qMarcas = qMarcas.eq("legajo", filtros.legajo)
    const { data: marcas, error: errMar } = await qMarcas
    if (errMar) return { error: errMar.message }

    // Agrupar marcas por legajo+fecha local y sumar horas E→S.
    type Bucket = { legajoNombre: string; horas: number; dias: Set<string> }
    const buckets = new Map<number, Bucket>()
    const empleadosMap = new Map<number, { id: string; nombre: string }>(
      (empleados ?? []).map((e) => [e.legajo, { id: e.id, nombre: e.nombre }])
    )

    // Index por legajo → array de marcas en orden.
    const porLegajo = new Map<
      number,
      { fechaMs: number; fechaLocal: string; tipo: "E" | "S" }[]
    >()
    for (const m of (marcas ?? []) as {
      legajo: number
      fecha_marca: string
      tipo_marca: "E" | "S"
    }[]) {
      const utc = normalizarUtc(m.fecha_marca)
      const d = new Date(utc)
      const local = new Date(d.getTime() - 3 * 3600 * 1000)
      const fechaLocal = local.toISOString().slice(0, 10)
      if (!porLegajo.has(m.legajo)) porLegajo.set(m.legajo, [])
      porLegajo.get(m.legajo)!.push({
        fechaMs: d.getTime(),
        fechaLocal,
        tipo: m.tipo_marca,
      })
    }

    for (const [legajo, ms] of porLegajo.entries()) {
      const emp = empleadosMap.get(legajo)
      if (!emp) continue
      const bucket: Bucket = { legajoNombre: emp.nombre, horas: 0, dias: new Set() }
      // Empareja E→S consecutivo el mismo día.
      let abierto: { fechaMs: number; fechaLocal: string } | null = null
      for (const ev of ms) {
        if (ev.tipo === "E") {
          abierto = { fechaMs: ev.fechaMs, fechaLocal: ev.fechaLocal }
        } else if (abierto && ev.tipo === "S" && ev.fechaLocal === abierto.fechaLocal) {
          const diffH = (ev.fechaMs - abierto.fechaMs) / (1000 * 3600)
          bucket.horas += diffH
          bucket.dias.add(abierto.fechaLocal)
          abierto = null
        }
      }
      buckets.set(legajo, bucket)
    }

    // Calcular horas esperadas: días laborables × horas_esperadas (asume 8 si no hay jornada vigente).
    const out: RrhhTotalHorasRow[] = []
    for (const emp of (empleados ?? []) as { id: string; legajo: number; nombre: string }[]) {
      const bucket = buckets.get(emp.legajo) ?? {
        legajoNombre: emp.nombre,
        horas: 0,
        dias: new Set<string>(),
      }
      // Estimación rápida: mismo cálculo que asistencia diaria, 8h × días con jornada NO no_laborable.
      let horasEsperadas = 0
      const desde = new Date(filtros.desde + "T00:00:00Z")
      const hasta = new Date(filtros.hasta + "T00:00:00Z")
      for (
        let d = new Date(desde);
        d.getTime() <= hasta.getTime();
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const fechaStr = d.toISOString().slice(0, 10)
        const { data: jor } = await supabase.rpc("rrhh_jornada_esperada", {
          p_empleado_id: emp.id,
          p_fecha: fechaStr,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = ((jor ?? []) as any[])[0]
        if (!row) continue
        if (row.no_laborable) continue
        // Diff hora_salida - hora_entrada.
        if (row.hora_entrada && row.hora_salida) {
          const [eh, em] = (row.hora_entrada as string).split(":").map(Number)
          const [sh, sm] = (row.hora_salida as string).split(":").map(Number)
          horasEsperadas += sh + sm / 60 - (eh + em / 60)
        } else {
          horasEsperadas += 8
        }
      }

      out.push({
        legajo: emp.legajo,
        nombre: emp.nombre,
        dias_trabajados: bucket.dias.size,
        horas_trabajadas: Math.round(bucket.horas * 100) / 100,
        horas_esperadas: Math.round(horasEsperadas * 100) / 100,
        diferencia_horas: Math.round((bucket.horas - horasEsperadas) * 100) / 100,
      })
    }

    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando reporte" }
  }
}

// Pausas: pares S→E del mismo día con duración > 30 minutos.
export async function reportePausasLaborales(
  filtros: ReporteFiltros
): Promise<{ data: RrhhPausaRow[] } | { error: string }> {
  try {
    const supabase = await createClient()
    let q = supabase
      .from("asistencia_marcas")
      .select("legajo, fecha_marca, tipo_marca")
      .gte("fecha_marca", `${filtros.desde}T00:00:00Z`)
      .lte("fecha_marca", `${filtros.hasta}T23:59:59Z`)
      .order("fecha_marca", { ascending: true })
    if (filtros.legajo) q = q.eq("legajo", filtros.legajo)
    const { data, error } = await q
    if (error) return { error: error.message }

    const porLegajo = new Map<
      number,
      { fechaMs: number; fechaLocal: string; tipo: "E" | "S"; iso: string }[]
    >()
    for (const m of (data ?? []) as {
      legajo: number
      fecha_marca: string
      tipo_marca: "E" | "S"
    }[]) {
      const utc = normalizarUtc(m.fecha_marca)
      const d = new Date(utc)
      const local = new Date(d.getTime() - 3 * 3600 * 1000)
      const fechaLocal = local.toISOString().slice(0, 10)
      if (!porLegajo.has(m.legajo)) porLegajo.set(m.legajo, [])
      porLegajo.get(m.legajo)!.push({
        fechaMs: d.getTime(),
        fechaLocal,
        tipo: m.tipo_marca,
        iso: utc,
      })
    }

    const out: RrhhPausaRow[] = []
    for (const [legajo, ms] of porLegajo.entries()) {
      for (let i = 0; i < ms.length - 1; i++) {
        const a = ms[i]
        const b = ms[i + 1]
        if (a.tipo === "S" && b.tipo === "E" && a.fechaLocal === b.fechaLocal) {
          const dur = (b.fechaMs - a.fechaMs) / (1000 * 60)
          if (dur > 30) {
            out.push({
              legajo,
              fecha: a.fechaLocal,
              pausa_inicio: a.iso,
              pausa_fin: b.iso,
              duracion_minutos: Math.round(dur),
            })
          }
        }
      }
    }
    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando reporte" }
  }
}
