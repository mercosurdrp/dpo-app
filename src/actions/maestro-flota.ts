"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { fetchLecturas, kmActualPorDominio, today, daysBetween } from "@/lib/vehiculos/lecturas"
import type {
  CatalogoVehiculo,
  MaestroFlota,
  MaestroFlotaUnidad,
  VehiculoDocumento,
  VehiculoFicha,
} from "@/types/database"

/**
 * Maestro de flota — el padrón completo del parque, en una sola lectura.
 *
 * Punto 1 de la auditoría del gestor de flota: el maestro tiene que estar en la
 * pantalla de inicio. Los datos ya existían (`vehiculos_ficha`), pero sólo se
 * llegaba a ellos de a UNA unidad por vez entrando a `/vehiculos/[dominio]`: el
 * auditor entraba a Vehículos y no veía el parque por ningún lado.
 *
 * Junta las cuatro cosas que definen a una unidad:
 *  - identificación (marca, modelo, año, chasis, VIN, motor, capacidad…)
 *  - asignación (chofer responsable, centro de costo, ciudad)
 *  - documentación con sus vencimientos
 *  - estado operativo (km actual, fuera de servicio, último checklist)
 */

const DIAS_POR_VENCER = 30

/** Campos sin los que la ficha no sirve como maestro ante una auditoría. */
const CAMPOS_CLAVE = ["marca", "modelo", "anio", "chasis", "motor"] as const

/**
 * Categorías de /requisitos-legales que son documentación DE LA UNIDAD.
 * El estado documentario del maestro (R1.1.2) sale de ahí, no de los adjuntos
 * sueltos de la ficha: es el lugar donde el control documentario ya lleva las
 * fechas de vencimiento y el archivo de cada papel.
 */
const CATEGORIAS_DE_UNIDAD = [
  "VTV",
  "Seguro vehicular",
  "SENASA",
  "Extintores camiones",
  "Extintores de autoelevadores",
]

/**
 * En `requisitos_legales` la unidad se identifica por el `nombre` del requisito,
 * que es la patente pero tipeada a mano: aparece "HELI 1" por HELI1 y
 * "AE TOYOTA 3" por TOYOTA3. Se compara sin espacios y, si no hay match exacto,
 * por contención (los dominios son largos, no se pisan entre sí).
 */
function normalizar(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase()
}

export async function getMaestroFlota(): Promise<
  { data: MaestroFlota } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = today()

    const [catRes, fichasRes, docsRes, otRes, checkRes, legalesRes, lecturas] = await Promise.all([
      // El catálogo trae TAMBIÉN las de baja: el maestro tiene que poder mostrar
      // el parque histórico, no sólo lo que anda hoy.
      supabase.from("catalogo_vehiculos").select("*").order("dominio"),
      supabase.from("vehiculos_ficha").select("*"),
      supabase.from("vehiculos_documentos").select("*").order("vencimiento", { nullsFirst: false }),
      // Fuera de servicio vigente: OT no cancelada cuyo rango incluye hoy.
      supabase
        .from("mantenimiento_realizados")
        .select("dominio, fuera_servicio_desde, fuera_servicio_hasta, observaciones, numero_ot")
        .neq("estado", "cancelado")
        .not("fuera_servicio_desde", "is", null)
        .lte("fuera_servicio_desde", hoy)
        .or(`fuera_servicio_hasta.gte.${hoy},fuera_servicio_hasta.is.null`),
      supabase
        .from("checklist_vehiculos")
        .select("dominio, fecha")
        .order("fecha", { ascending: false }),
      // Estado documentario: sale del control documentario (/requisitos-legales),
      // que es donde están cargadas las fechas de vencimiento de VTV, seguro,
      // SENASA y extintores.
      supabase
        .from("requisitos_legales")
        .select(
          "nombre, fecha_vencimiento, archivo_url, categoria:requisitos_legales_categorias!inner(nombre)"
        ),
      fetchLecturas(undefined, supabase),
    ])

    if (catRes.error) return { error: catRes.error.message }

    const catalogo = (catRes.data ?? []) as CatalogoVehiculo[]
    const fichas = (fichasRes.data ?? []) as VehiculoFicha[]
    const documentos = (docsRes.data ?? []) as VehiculoDocumento[]

    const fichaPorDominio = new Map(fichas.map((f) => [f.dominio, f]))

    const docsPorDominio = new Map<string, VehiculoDocumento[]>()
    for (const d of documentos) {
      const lista = docsPorDominio.get(d.dominio) ?? []
      lista.push(d)
      docsPorDominio.set(d.dominio, lista)
    }

    // Una unidad puede tener más de una OT abierta: se toma la que arrancó antes.
    const fueraPorDominio = new Map<
      string,
      { desde: string; hasta: string | null; numero_ot: string | null; motivo: string | null }
    >()
    for (const ot of (otRes.data ?? []) as Array<{
      dominio: string
      fuera_servicio_desde: string
      fuera_servicio_hasta: string | null
      observaciones: string | null
      numero_ot: string | null
    }>) {
      const previa = fueraPorDominio.get(ot.dominio)
      if (previa && previa.desde <= ot.fuera_servicio_desde) continue
      fueraPorDominio.set(ot.dominio, {
        desde: ot.fuera_servicio_desde,
        hasta: ot.fuera_servicio_hasta,
        numero_ot: ot.numero_ot,
        motivo: ot.observaciones,
      })
    }

    // Papeles de la unidad, indexados por el nombre normalizado del requisito.
    const legales = ((legalesRes.data ?? []) as Array<{
      nombre: string
      fecha_vencimiento: string | null
      archivo_url: string | null
      categoria: { nombre: string } | { nombre: string }[] | null
    }>)
      .map((r) => ({
        nombre: r.nombre,
        clave: normalizar(r.nombre ?? ""),
        vencimiento: r.fecha_vencimiento,
        tieneArchivo: !!r.archivo_url,
        categoria: Array.isArray(r.categoria)
          ? (r.categoria[0]?.nombre ?? "")
          : (r.categoria?.nombre ?? ""),
      }))
      .filter((r) => CATEGORIAS_DE_UNIDAD.includes(r.categoria))

    // Ya viene ordenado por fecha desc: la primera de cada dominio es la última.
    const ultimoCheck = new Map<string, string>()
    for (const c of (checkRes.data ?? []) as Array<{ dominio: string; fecha: string }>) {
      if (!ultimoCheck.has(c.dominio)) ultimoCheck.set(c.dominio, c.fecha)
    }

    const kmPorDominio = kmActualPorDominio(lecturas)

    const unidades: MaestroFlotaUnidad[] = catalogo.map((c) => {
      const ficha = fichaPorDominio.get(c.dominio) ?? null
      const docs = docsPorDominio.get(c.dominio) ?? []
      const km = kmPorDominio.get(c.dominio) ?? null

      const faltantes = ficha
        ? CAMPOS_CLAVE.filter((campo) => !ficha[campo]).map((campo) => campo as string)
        : [...CAMPOS_CLAVE].map((campo) => campo as string)

      // Papeles de esta unidad: match exacto y, si no, por contención
      // ("AE TOYOTA 3" → TOYOTA3).
      const clave = normalizar(c.dominio)
      const propios = legales.filter((r) => r.clave === clave)
      const papeles = (propios.length > 0 ? propios : legales.filter((r) => r.clave.includes(clave)))
        .map((r) => ({
          categoria: r.categoria,
          vencimiento: r.vencimiento,
          tieneArchivo: r.tieneArchivo,
          estado:
            r.vencimiento == null
              ? ("sin_fecha" as const)
              : r.vencimiento < hoy
                ? ("vencido" as const)
                : daysBetween(hoy, r.vencimiento) <= DIAS_POR_VENCER
                  ? ("por_vencer" as const)
                  : ("vigente" as const),
        }))
        .sort((a, b) => (a.vencimiento ?? "9999") < (b.vencimiento ?? "9999") ? -1 : 1)

      const docsVencidos = papeles.filter((p) => p.estado === "vencido").length
      const docsPorVencer = papeles.filter((p) => p.estado === "por_vencer").length
      const docsSinArchivo = papeles.filter((p) => !p.tieneArchivo).length

      return {
        dominio: c.dominio,
        descripcion: c.descripcion,
        tipo: c.tipo ?? ficha?.tipo_unidad ?? null,
        sector: c.sector,
        activo: c.active !== false,
        ficha,
        documentos: docs,
        papeles,
        docsVencidos,
        docsPorVencer,
        docsSinArchivo,
        camposFaltantes: faltantes,
        kmActual: km?.odometro ?? null,
        kmFecha: km?.fecha ?? null,
        fueraServicio: fueraPorDominio.get(c.dominio) ?? null,
        ultimoChecklist: ultimoCheck.get(c.dominio) ?? null,
      }
    })

    const activas = unidades.filter((u) => u.activo)
    const porTipo: Record<string, number> = {}
    for (const u of activas) {
      const t = u.tipo ?? "sin tipo"
      porTipo[t] = (porTipo[t] ?? 0) + 1
    }

    return {
      data: {
        unidades,
        resumen: {
          total: unidades.length,
          activas: activas.length,
          bajas: unidades.length - activas.length,
          porTipo,
          sinFicha: activas.filter((u) => !u.ficha).length,
          fichasIncompletas: activas.filter((u) => u.ficha && u.camposFaltantes.length > 0).length,
          docsVencidos: activas.reduce((a, u) => a + u.docsVencidos, 0),
          docsPorVencer: activas.reduce((a, u) => a + u.docsPorVencer, 0),
          sinPapeles: activas.filter((u) => u.papeles.length === 0).length,
          fueraServicio: activas.filter((u) => u.fueraServicio).length,
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
