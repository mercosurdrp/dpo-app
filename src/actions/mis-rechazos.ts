"use server"
/**
 * "Mis Rechazos" — rechazos del EMPLEADO (chofer o ayudante), atribuidos a la
 * PERSONA y no al camión: una fila de `rechazos` de la patente P del día D es
 * suya si ese día figuraba en el egreso TML de P (chofer/ayudante1/ayudante2,
 * vía mapeo_empleado_chofer) o si P está en su mapeo estático de fletero
 * (mapeo_empleado_fletero). Igual criterio que bultos-empleado.ts: métrica de
 * camión — chofer y ayudantes ven los mismos rechazos, sin prorrateo — pero el
 * historial lo sigue a él aunque cambie de unidad.
 *
 * Las filas de Gestión (`GESTION-<código>`) se traducen a la patente del día
 * con la misma lib que el resto de los indicadores.
 */
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { hoyAR } from "@/lib/herramientas-gestion"
import {
  loadResolucionGescom,
  traducirFilasGescom,
} from "@/lib/gescom/ventas-patente"

// ---------- Types ----------

export interface MisRechazosResumen {
  /** "YYYY-MM" */
  mes: string
  bultos_rechazados: number
  bultos_entregados: number
  /** % = rechazados / entregados × 100. null si no hubo entregas. */
  pct_rechazo: number | null
  /** Visitas con rechazo (clientes distintos por día). */
  clientes_afectados: number
  dias_con_rechazo: number
}

export interface RechazoPorCliente {
  nombre_cliente: string
  bultos: number
  /** Días distintos con rechazo de este cliente. */
  veces: number
  ultima_fecha: string
  motivo_principal: string | null
}

export interface RechazoPorMotivo {
  motivo: string
  bultos: number
  filas: number
}

export interface RechazoPorPatente {
  patente: string
  bultos_rechazados: number
  bultos_entregados: number
  pct_rechazo: number | null
  dias: number
}

export interface RechazoDia {
  fecha: string
  patentes: string[]
  bultos: number
  clientes: number
}

export interface MisRechazosData {
  vinculado: boolean
  nombre_chofer: string | null
  mes_actual: MisRechazosResumen
  mes_anterior: MisRechazosResumen
  /** Mes actual, ordenado por bultos desc. */
  por_cliente: RechazoPorCliente[]
  /** Mes actual, ordenado por bultos desc. */
  por_motivo: RechazoPorMotivo[]
  /** Mes actual + anterior: para comparar cuando cambia de camión. */
  por_patente: RechazoPorPatente[]
  /** Últimos 30 días con rechazo, descendente. */
  por_dia: RechazoDia[]
}

// ---------- Helpers ----------

function norm(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, " ").trim()
}

const PAGE = 1000

async function fetchTodo<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return rows
}

function mesDe(fecha: string): string {
  return fecha.slice(0, 7)
}

// ---------- Action ----------

export async function getMisRechazos(): Promise<
  { data: MisRechazosData } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: empleado } = await supabase
      .from("empleados")
      .select("id, nombre")
      .eq("profile_id", profile.id)
      .single()
    if (!empleado) return { error: "No se encontró tu legajo" }

    const admin = createAdminClient()
    const [choferRes, fleteroRes] = await Promise.all([
      admin
        .from("mapeo_empleado_chofer")
        .select("nombre_chofer")
        .eq("empleado_id", empleado.id)
        .limit(1)
        .maybeSingle(),
      admin
        .from("mapeo_empleado_fletero")
        .select("ds_fletero_carga")
        .eq("empleado_id", empleado.id),
    ])
    const nombreChofer = choferRes.data?.nombre_chofer ?? null
    const fleteros = new Set(
      (fleteroRes.data ?? [])
        .map((f) => norm(f.ds_fletero_carga))
        .filter(Boolean),
    )

    const vacio = (mes: string): MisRechazosResumen => ({
      mes,
      bultos_rechazados: 0,
      bultos_entregados: 0,
      pct_rechazo: null,
      clientes_afectados: 0,
      dias_con_rechazo: 0,
    })

    // Rango: mes anterior completo + mes actual hasta hoy (hora argentina).
    const hoy = hoyAR()
    const anio = Number(hoy.slice(0, 4))
    const mes = Number(hoy.slice(5, 7))
    const mesActual = hoy.slice(0, 7)
    const primerDiaMesAnterior = new Date(Date.UTC(anio, mes - 2, 1))
      .toISOString()
      .slice(0, 10)
    const mesAnterior = primerDiaMesAnterior.slice(0, 7)
    const desde = primerDiaMesAnterior
    const hasta = hoy

    if (!nombreChofer && fleteros.size === 0) {
      return {
        data: {
          vinculado: false,
          nombre_chofer: null,
          mes_actual: vacio(mesActual),
          mes_anterior: vacio(mesAnterior),
          por_cliente: [],
          por_motivo: [],
          por_patente: [],
          por_dia: [],
        },
      }
    }

    interface RegistroRow {
      fecha: string
      dominio: string | null
      chofer: string | null
      ayudante1: string | null
      ayudante2: string | null
    }
    interface RechazoRow {
      fecha: string
      ds_fletero_carga: string | null
      bultos_rechazados: number | null
      nombre_cliente: string | null
      id_cliente: number | null
      ds_rechazo: string | null
    }
    interface VentaRow {
      fecha: string
      ds_fletero_carga: string | null
      total_bultos: number | null
    }

    const [registros, rechazosCrudos, ventasCrudas, resolucion] = await Promise.all([
      fetchTodo<RegistroRow>((a, b) =>
        admin
          .from("registros_vehiculos")
          .select("fecha, dominio, chofer, ayudante1, ayudante2")
          .eq("tipo", "egreso")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(a, b),
      ),
      fetchTodo<RechazoRow>((a, b) =>
        admin
          .from("rechazos")
          .select("fecha, ds_fletero_carga, bultos_rechazados, nombre_cliente, id_cliente, ds_rechazo")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(a, b),
      ),
      fetchTodo<VentaRow>((a, b) =>
        admin
          .from("ventas_diarias")
          .select("fecha, ds_fletero_carga, total_bultos")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(a, b),
      ),
      loadResolucionGescom(admin, desde, hasta),
    ])

    // Días-patente del empleado: egresos TML donde figura como chofer O ayudante.
    const clavesEmpleado = new Set<string>() // "fecha|PATENTE"
    const nombreNorm = nombreChofer ? norm(nombreChofer) : null
    if (nombreNorm) {
      for (const r of registros) {
        if (!r.dominio) continue
        if ([r.chofer, r.ayudante1, r.ayudante2].some((n) => norm(n) === nombreNorm)) {
          clavesEmpleado.add(`${r.fecha}|${norm(r.dominio)}`)
        }
      }
    }

    // Filas de Gestión → patente del día; venta directa afuera.
    const rechazos = traducirFilasGescom(rechazosCrudos, resolucion)
    const ventas = traducirFilasGescom(ventasCrudas, resolucion)

    const esMio = (fecha: string, dsFletero: string | null): string | null => {
      const patente = norm(dsFletero)
      if (!patente) return null
      if (fleteros.has(patente)) return patente // mapeo estático: todos los días
      return clavesEmpleado.has(`${fecha}|${patente}`) ? patente : null
    }

    // ---- Agregaciones ----
    const resumen = new Map<string, MisRechazosResumen>([
      [mesActual, vacio(mesActual)],
      [mesAnterior, vacio(mesAnterior)],
    ])
    const clientesPorMes = new Map<string, Set<string>>() // mes → "fecha|cliente"
    const diasPorMes = new Map<string, Set<string>>()

    const porCliente = new Map<
      string,
      { bultos: number; fechas: Set<string>; ultima: string; motivos: Map<string, number> }
    >()
    const porMotivo = new Map<string, { bultos: number; filas: number }>()
    const porPatente = new Map<
      string,
      { rech: number; entr: number; dias: Set<string> }
    >()
    const porDia = new Map<string, { patentes: Set<string>; bultos: number; clientes: Set<string> }>()

    for (const r of rechazos) {
      const patente = esMio(r.fecha, r.ds_fletero_carga)
      if (!patente) continue
      const bultos = Math.abs(Number(r.bultos_rechazados) || 0)
      const m = mesDe(r.fecha)
      const cliente = (r.nombre_cliente ?? "").trim() || `Cliente ${r.id_cliente ?? "s/d"}`
      const claveCliente = `${r.fecha}|${r.id_cliente ?? cliente}`
      const motivo = (r.ds_rechazo ?? "").trim() || "Sin motivo"

      const res = resumen.get(m)
      if (res) {
        res.bultos_rechazados += bultos
        let cs = clientesPorMes.get(m)
        if (!cs) clientesPorMes.set(m, (cs = new Set()))
        cs.add(claveCliente)
        let ds = diasPorMes.get(m)
        if (!ds) diasPorMes.set(m, (ds = new Set()))
        ds.add(r.fecha)
      }

      // Detalles: solo mes actual (por_patente y por_dia usan el rango entero).
      if (m === mesActual) {
        const c = porCliente.get(cliente) ?? {
          bultos: 0,
          fechas: new Set<string>(),
          ultima: r.fecha,
          motivos: new Map<string, number>(),
        }
        c.bultos += bultos
        c.fechas.add(r.fecha)
        if (r.fecha > c.ultima) c.ultima = r.fecha
        c.motivos.set(motivo, (c.motivos.get(motivo) ?? 0) + bultos)
        porCliente.set(cliente, c)

        const mo = porMotivo.get(motivo) ?? { bultos: 0, filas: 0 }
        mo.bultos += bultos
        mo.filas += 1
        porMotivo.set(motivo, mo)
      }

      const p = porPatente.get(patente) ?? { rech: 0, entr: 0, dias: new Set<string>() }
      p.rech += bultos
      p.dias.add(r.fecha)
      porPatente.set(patente, p)

      const d = porDia.get(r.fecha) ?? { patentes: new Set<string>(), bultos: 0, clientes: new Set<string>() }
      d.patentes.add(patente)
      d.bultos += bultos
      d.clientes.add(String(r.id_cliente ?? cliente))
      porDia.set(r.fecha, d)
    }

    // Denominador: bultos entregados del empleado (mismas claves).
    for (const v of ventas) {
      const patente = esMio(v.fecha, v.ds_fletero_carga)
      if (!patente) continue
      const bultos = Number(v.total_bultos) || 0
      const res = resumen.get(mesDe(v.fecha))
      if (res) res.bultos_entregados += bultos
      const p = porPatente.get(patente) ?? { rech: 0, entr: 0, dias: new Set<string>() }
      p.entr += bultos
      porPatente.set(patente, p)
    }

    for (const [m, res] of resumen) {
      res.clientes_afectados = clientesPorMes.get(m)?.size ?? 0
      res.dias_con_rechazo = diasPorMes.get(m)?.size ?? 0
      res.bultos_rechazados = Math.round(res.bultos_rechazados)
      res.bultos_entregados = Math.round(res.bultos_entregados)
      res.pct_rechazo =
        res.bultos_entregados > 0
          ? Math.round((res.bultos_rechazados / res.bultos_entregados) * 10000) / 100
          : null
    }

    const clientesOrdenados: RechazoPorCliente[] = [...porCliente.entries()]
      .map(([nombre_cliente, c]) => {
        let motivoPrincipal: string | null = null
        let max = -1
        for (const [mot, b] of c.motivos) {
          if (b > max) {
            max = b
            motivoPrincipal = mot
          }
        }
        return {
          nombre_cliente,
          bultos: Math.round(c.bultos),
          veces: c.fechas.size,
          ultima_fecha: c.ultima,
          motivo_principal: motivoPrincipal,
        }
      })
      .sort((a, b) => b.bultos - a.bultos)

    const motivosOrdenados: RechazoPorMotivo[] = [...porMotivo.entries()]
      .map(([motivo, m]) => ({ motivo, bultos: Math.round(m.bultos), filas: m.filas }))
      .sort((a, b) => b.bultos - a.bultos)

    const patentesOrdenadas: RechazoPorPatente[] = [...porPatente.entries()]
      .map(([patente, p]) => ({
        patente,
        bultos_rechazados: Math.round(p.rech),
        bultos_entregados: Math.round(p.entr),
        pct_rechazo: p.entr > 0 ? Math.round((p.rech / p.entr) * 10000) / 100 : null,
        dias: p.dias.size,
      }))
      .sort((a, b) => b.bultos_rechazados - a.bultos_rechazados)

    const hace30 = new Date(`${hoy}T00:00:00Z`)
    hace30.setUTCDate(hace30.getUTCDate() - 30)
    const corte30 = hace30.toISOString().slice(0, 10)
    const dias: RechazoDia[] = [...porDia.entries()]
      .filter(([fecha]) => fecha >= corte30)
      .map(([fecha, d]) => ({
        fecha,
        patentes: [...d.patentes].sort(),
        bultos: Math.round(d.bultos),
        clientes: d.clientes.size,
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

    return {
      data: {
        vinculado: true,
        nombre_chofer: nombreChofer,
        mes_actual: resumen.get(mesActual) ?? vacio(mesActual),
        mes_anterior: resumen.get(mesAnterior) ?? vacio(mesAnterior),
        por_cliente: clientesOrdenados,
        por_motivo: motivosOrdenados,
        por_patente: patentesOrdenadas,
        por_dia: dias,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando rechazos" }
  }
}
