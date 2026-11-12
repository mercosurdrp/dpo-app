"use server"

// Cumplimiento de los ANS con proveedores de flota (DPO Flota 2.3, R2.3.2a).
// Junta el dato crudo (OT, pedidos de repuestos, padrón de matafuegos, recargas)
// y lo pasa por la lib pura `calcularCumplimientoAns`. Encima vive lo humano que
// pide la cláusula 6 de los acuerdos: el plan de acción por escrito cuando un
// indicador del mes no llega al 100 %.

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { getMantenimientos } from "@/actions/mantenimiento-vehiculos"
import {
  calcularCumplimientoAns,
  esDelProveedor,
  ymSumar,
  type AnsProveedorCumplimiento,
  type AnsProveedorIn,
  type AnsTipo,
  type ExtintorAnsIn,
  type PedidoAnsIn,
  type RecargaAnsIn,
} from "@/lib/flota/ans-cumplimiento"

const PATH = "/vehiculos/mantenimiento"

function faltaTabla(error: { code?: string | null; message?: string | null }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    /relation .* does not exist|could not find the table|column .* does not exist/i.test(error.message ?? "")
  )
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

export interface PlanAns {
  id: string
  ansId: string
  year: number
  mes: number
  indicador: string
  valor: number | null
  meta: number | null
  causa: string | null
  accion: string
  responsable: string | null
  fechaCompromiso: string | null
  estado: "abierto" | "cerrado"
  fechaCierre: string | null
  resultado: string | null
  createdAt: string
}

export interface RecargaMatafuegos extends RecargaAnsIn {
  reemplazoDejado: boolean | null
  observaciones: string | null
}

/**
 * Una OT hecha con el proveedor del acuerdo (R2.3.2a: trazabilidad).
 *
 * Los indicadores sólo muestran las OT que entran en SU cuenta —puntualidad
 * mira las que tienen fecha comprometida, retrabajo las que volvieron—, así que
 * un proveedor podía tener seis trabajos en el mes y el tablero no nombraba
 * ninguno. Esto es el respaldo del semáforo: contra qué trabajos se midió.
 */
export interface TrabajoAns {
  id: string
  numeroOt: string | null
  fecha: string
  dominio: string
  tipo: string
  estado: string
  costo: number | null
  /** null = el acuerdo no pedía fecha, o todavía no se cargó. */
  salidaComprometida: string | null
  salidaTaller: string | null
  /** true/false sólo cuando hay compromiso Y salida: si no, no se puede juzgar. */
  enFecha: boolean | null
  descripcion: string | null
}

export interface CumplimientoAnsRespuesta {
  ym: string
  hoy: string
  cumplimientos: AnsProveedorCumplimiento[]
  planes: PlanAns[]
  recargas: RecargaMatafuegos[]
  /** Todas las OT del período por acuerdo (`ansId`), de la más nueva a la más vieja. */
  trabajos: Record<string, TrabajoAns[]>
  /** Falta aplicar APLICAR_EN_PAMPEANA_ANS_PROVEEDORES.sql. */
  sqlPendiente: boolean
}

/** ANS por proveedor (para badges en otras pantallas). */
export interface AnsMin {
  proveedorId: string
  nombre: string
  tipo: AnsTipo
  fechaFirma: string | null
}

export async function getAnsProveedores(): Promise<{ data: AnsMin[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_ans")
      .select("proveedor_id, tipo, fecha_firma, activo, proveedor:mantenimiento_proveedores(nombre)")
      .eq("activo", true)
    if (error) {
      if (faltaTabla(error)) return { data: [] }
      return { error: error.message }
    }
    return {
      data: ((data || []) as unknown as Array<{
        proveedor_id: string
        tipo: AnsTipo
        fecha_firma: string | null
        proveedor: { nombre: string } | null
      }>).map((r) => ({
        proveedorId: r.proveedor_id,
        nombre: r.proveedor?.nombre ?? "",
        tipo: r.tipo,
        fechaFirma: r.fecha_firma,
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getCumplimientoAns(
  ymPedido?: string
): Promise<{ data: CumplimientoAnsRespuesta } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArgentina()
    const ym = /^\d{4}-\d{2}$/.test(ymPedido ?? "") ? (ymPedido as string) : hoy.slice(0, 7)
    // 6 meses de historia + 90 días de garantía hacia atrás para el retrabajo.
    const desde = `${ymSumar(ym, -9)}-01`
    const hasta = `${ymSumar(ym, 1)}-01`

    const ansRes = await supabase
      .from("flota_ans")
      .select(
        "id, proveedor_id, tipo, fecha_firma, fecha_vencimiento, activo, sla_adjunto_id, proveedor:mantenimiento_proveedores(nombre, email, telefono), adjunto:sla_adjuntos(storage_path)"
      )
      .eq("activo", true)
    if (ansRes.error) {
      if (faltaTabla(ansRes.error))
        return { data: { ym, hoy, cumplimientos: [], planes: [], recargas: [], trabajos: {}, sqlPendiente: true } }
      return { error: ansRes.error.message }
    }

    const [otRes, pedRes, extRes, recRes, planRes] = await Promise.all([
      getMantenimientos({ fechaDesde: desde, fechaHasta: hasta }),
      supabase
        .from("mantenimiento_pedidos")
        .select(
          "id, proveedor, fecha, fecha_compra, fecha_retiro, fecha_comprometida, entrega_completa, es_critico, disponible_al_pedir, estado, descripcion"
        )
        .gte("fecha", desde),
      supabase
        .from("extintores")
        .select("id, numero, sede, sector, ubicacion, vencimiento_carga")
        .eq("activo", true),
      supabase
        .from("extintor_recargas")
        .select("*")
        .gte("fecha_retiro", desde)
        .order("fecha_retiro", { ascending: false }),
      supabase.from("flota_ans_planes").select("*").order("created_at", { ascending: false }),
    ])
    if ("error" in otRes) return { error: otRes.error }
    for (const r of [pedRes, extRes, recRes, planRes]) {
      if (r.error) {
        if (faltaTabla(r.error))
          return { data: { ym, hoy, cumplimientos: [], planes: [], recargas: [], trabajos: {}, sqlPendiente: true } }
        return { error: r.error.message }
      }
    }

    const proveedores: AnsProveedorIn[] = ((ansRes.data || []) as unknown as Array<{
      id: string
      proveedor_id: string
      tipo: AnsTipo
      fecha_firma: string | null
      fecha_vencimiento: string | null
      proveedor: { nombre: string; email: string | null; telefono: string | null } | null
      adjunto: { storage_path: string } | null
    }>)
      .map((a) => ({
        ansId: a.id,
        proveedorId: a.proveedor_id,
        nombre: a.proveedor?.nombre ?? "(sin nombre)",
        tipo: a.tipo,
        fechaFirma: a.fecha_firma,
        fechaVencimiento: a.fecha_vencimiento,
        adjuntoUrl: a.adjunto?.storage_path
          ? supabase.storage.from("sla").getPublicUrl(a.adjunto.storage_path).data.publicUrl
          : null,
        email: a.proveedor?.email ?? null,
        telefono: a.proveedor?.telefono ?? null,
      }))
      .sort((a, b) => {
        const orden: AnsTipo[] = ["taller", "carroceria", "repuestos", "matafuegos"]
        return orden.indexOf(a.tipo) - orden.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre, "es")
      })

    const pedidos: PedidoAnsIn[] = ((pedRes.data || []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      proveedor: (p.proveedor as string | null) ?? null,
      fecha: String(p.fecha).slice(0, 10),
      fechaCompra: p.fecha_compra ? String(p.fecha_compra).slice(0, 10) : null,
      fechaRetiro: p.fecha_retiro ? String(p.fecha_retiro).slice(0, 10) : null,
      fechaComprometida: p.fecha_comprometida ? String(p.fecha_comprometida).slice(0, 10) : null,
      entregaCompleta: (p.entrega_completa as boolean | null) ?? null,
      esCritico: !!p.es_critico,
      disponibleAlPedir: (p.disponible_al_pedir as boolean | null) ?? null,
      estado: String(p.estado),
      descripcion: (p.descripcion as string | null) ?? null,
    }))

    const extintores: ExtintorAnsIn[] = ((extRes.data || []) as Array<{
      id: string
      numero: string
      sede: string | null
      sector: string | null
      ubicacion: string | null
      vencimiento_carga: string | null
    }>).map((e) => ({
      id: e.id,
      numero: e.numero,
      ubicacion: [e.sede, e.sector, e.ubicacion].filter(Boolean).join(" · ") || "—",
      vencimientoCarga: e.vencimiento_carga ? e.vencimiento_carga.slice(0, 10) : null,
    }))

    const recargas: RecargaMatafuegos[] = ((recRes.data || []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      proveedor: (r.proveedor as string | null) ?? null,
      fechaRetiro: String(r.fecha_retiro).slice(0, 10),
      fechaDevolucion: r.fecha_devolucion ? String(r.fecha_devolucion).slice(0, 10) : null,
      cantidad: Number(r.cantidad ?? 1),
      reemplazoDejado: (r.reemplazo_dejado as boolean | null) ?? null,
      observaciones: (r.observaciones as string | null) ?? null,
    }))

    const planes: PlanAns[] = ((planRes.data || []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      ansId: p.ans_id as string,
      year: Number(p.year),
      mes: Number(p.mes),
      indicador: String(p.indicador),
      valor: p.valor == null ? null : Number(p.valor),
      meta: p.meta == null ? null : Number(p.meta),
      causa: (p.causa as string | null) ?? null,
      accion: String(p.accion),
      responsable: (p.responsable as string | null) ?? null,
      fechaCompromiso: p.fecha_compromiso ? String(p.fecha_compromiso).slice(0, 10) : null,
      estado: p.estado === "cerrado" ? "cerrado" : "abierto",
      fechaCierre: p.fecha_cierre ? String(p.fecha_cierre).slice(0, 10) : null,
      resultado: (p.resultado as string | null) ?? null,
      createdAt: String(p.created_at),
    }))

    const cumplimientos = calcularCumplimientoAns({
      ym,
      proveedores,
      ots: otRes.data,
      pedidos,
      extintores,
      recargas,
      planes,
      hoy,
      ahoraIso: new Date().toISOString(),
    })

    // Trazabilidad (R2.3.2a): todas las OT del proveedor en la ventana que
    // muestra el tablero, no sólo las que entran en algún indicador. Se usa el
    // mismo `esDelProveedor` del cálculo, así la lista no puede discrepar del
    // semáforo que está al lado.
    const desdeHistoria = `${ymSumar(ym, -5)}-01`
    const trabajos: Record<string, TrabajoAns[]> = {}
    for (const prov of proveedores) {
      trabajos[prov.ansId] = otRes.data
        .filter(
          (m) =>
            m.fecha >= desdeHistoria &&
            m.fecha < hasta &&
            m.estado !== "cancelado" &&
            esDelProveedor(m.taller, prov.nombre)
        )
        .map((m) => {
          const comp = m.salida_comprometida ?? null
          const salida = m.salida_taller ?? null
          return {
            id: m.id,
            numeroOt: m.numero_ot ?? null,
            fecha: m.fecha,
            dominio: m.dominio,
            tipo: m.tipo,
            estado: m.estado,
            costo: m.costo ?? null,
            salidaComprometida: comp,
            salidaTaller: salida,
            enFecha: comp && salida ? salida <= comp : null,
            descripcion: m.observaciones ?? null,
          }
        })
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    }

    return { data: { ym, hoy, cumplimientos, planes, recargas, trabajos, sqlPendiente: false } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function crearPlanAns(input: {
  ansId: string
  year: number
  mes: number
  indicador: string
  valor: number | null
  meta: number | null
  causa: string
  accion: string
  responsable: string
  fechaCompromiso: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.accion.trim()) return { error: "Escribí la acción" }
    const supabase = await createClient()
    const { error } = await supabase.from("flota_ans_planes").insert({
      ans_id: input.ansId,
      year: input.year,
      mes: input.mes,
      indicador: input.indicador,
      valor: input.valor,
      meta: input.meta,
      causa: input.causa.trim() || null,
      accion: input.accion.trim(),
      responsable: input.responsable.trim() || null,
      fecha_compromiso: input.fechaCompromiso || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function cerrarPlanAns(
  id: string,
  resultado: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_ans_planes")
      .update({ estado: "cerrado", fecha_cierre: hoyArgentina(), resultado: resultado.trim() || null })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarPlanAns(id: string): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase.from("flota_ans_planes").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function guardarRecargaMatafuegos(input: {
  id?: string
  proveedor: string | null
  fechaRetiro: string
  fechaDevolucion: string | null
  cantidad: number
  reemplazoDejado: boolean | null
  observaciones: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.fechaRetiro) return { error: "Falta la fecha de retiro" }
    if (input.fechaDevolucion && input.fechaDevolucion < input.fechaRetiro)
      return { error: "La devolución no puede ser anterior al retiro" }
    const supabase = await createClient()
    const fila = {
      proveedor: input.proveedor?.trim() || null,
      fecha_retiro: input.fechaRetiro,
      fecha_devolucion: input.fechaDevolucion || null,
      cantidad: Math.max(1, Math.round(input.cantidad || 1)),
      reemplazo_dejado: input.reemplazoDejado,
      observaciones: input.observaciones?.trim() || null,
    }
    const { error } = input.id
      ? await supabase.from("extintor_recargas").update(fila).eq("id", input.id)
      : await supabase.from("extintor_recargas").insert({ ...fila, created_by: profile.id })
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarRecargaMatafuegos(id: string): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase.from("extintor_recargas").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
