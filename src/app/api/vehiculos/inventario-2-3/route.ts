// Planilla oficial DPO Flota 2.3 "Gestión de Inventario", armada desde la app.
//
// La hoja `campusbap_evidencia/02_Pilar_Flota/2.3-Gestion-de-Inventario.xlsx`
// es lo que el auditor espera encontrar: Seguimiento Repuestos con la
// criticidad calculada, Repuestos Criticidad Alta, Pedidos, Listado de
// Proveedores y el Lay Out del pañol. Esta ruta la genera con los datos reales
// para que la evidencia sea la misma que la pantalla y no una copia a mano.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  analizarPolitica,
  CAUSA_DIFERENCIA_LABEL,
  ESTADO_STOCK_LABEL,
  type CausaDiferencia,
  type RepuestoPolitica,
} from "@/lib/flota/inventario-politica"

const fmtFecha = (f: string | null | undefined) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "")
const siNo = (v: boolean | null | undefined) => (v ? "SI" : "NO")

function reposicionTexto(lt: number | null | undefined): string {
  if (lt == null) return "Sin dato"
  if (lt < 7) return "Menor a 1 semana"
  if (lt <= 30) return "1 semana a 1 mes"
  return "Más de 1 mes"
}

export async function GET() {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (IS_MISIONES) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)

  const [repRes, movRes, provRes, pedRes, conteosRes] = await Promise.all([
    supabase.from("mantenimiento_repuestos").select("*").order("nombre"),
    supabase
      .from("mantenimiento_repuestos_movimientos")
      .select("repuesto_id, tipo, cantidad, fecha, motivo")
      .order("fecha", { ascending: true })
      .limit(5000),
    supabase.from("mantenimiento_proveedores").select("*").eq("activo", true).order("nombre"),
    supabase
      .from("mantenimiento_pedidos")
      .select("*, items:mantenimiento_pedido_items(repuesto_id, descripcion, cantidad, repuesto:mantenimiento_repuestos(nombre, unidad, codigo))")
      .order("fecha", { ascending: false })
      .limit(500),
    supabase
      .from("mantenimiento_conteos")
      .select("fecha, realizado_por, ajustado, observaciones, items:mantenimiento_conteo_items(stock_sistema, stock_contado, causa, nota, repuesto:mantenimiento_repuestos(nombre))")
      .order("fecha", { ascending: false })
      .limit(24),
  ])
  if (repRes.error) return NextResponse.json({ error: repRes.error.message }, { status: 500 })
  // Sin la migración 20261105120000 no existen causa/nota: se leen los conteos igual.
  let conteosData: unknown = conteosRes.data
  if (conteosRes.error) {
    const sinCausa = await supabase
      .from("mantenimiento_conteos")
      .select("fecha, realizado_por, ajustado, observaciones, items:mantenimiento_conteo_items(stock_sistema, stock_contado, repuesto:mantenimiento_repuestos(nombre))")
      .order("fecha", { ascending: false })
      .limit(24)
    conteosData = sinCausa.data
  }

  type Rep = RepuestoPolitica & {
    codigo: string | null
    unidad: string | null
    ubicacion: string | null
    proveedor_id?: string | null
  }
  const todos = (repRes.data || []) as unknown as Rep[]
  const panol = todos.filter((r) => r.en_panol !== false)
  const movimientos = ((movRes.data || []) as unknown as Array<{
    repuesto_id: string
    tipo: "ingreso" | "egreso"
    cantidad: number
    fecha: string
    motivo: string | null
  }>).map((m) => ({ ...m, cantidad: Number(m.cantidad), fecha: m.fecha.slice(0, 10) }))
  const politica = analizarPolitica({ repuestos: panol, movimientos, hoy })
  const proveedores = (provRes.data || []) as Array<Record<string, unknown> & { id: string; nombre: string }>
  const provNombre = new Map(proveedores.map((p) => [p.id, p.nombre]))

  // --- Hoja 1: Seguimiento Repuestos (columnas de la planilla + las de la app)
  const h1: (string | number | null)[][] = [
    ["Distribuidor", "Mercosur Región Pampeana — pañol de flota", "", "", "", "", "", "", "", "", "", "", "", "", "", `Generado ${fmtFecha(hoy)}`],
    [],
    [
      "Código",
      "Descripción del material",
      "Cantidad Actual",
      "Precio Unitario (ARS)",
      "Valor Total",
      "Cantidad Maxima",
      "Cantidad Minima",
      "Punto de Reposicion",
      "Tipo de Repuesto",
      "Valor Según Tipo de Repuesto",
      "Menor a cantidad Mínima",
      "Parada por falta de repuesto",
      "Tiempo de Reposición",
      "Calculo Criticidad",
      "Criticidad",
      "Stock objetivo",
      "Días de cobertura",
      "Consumo 90 d",
      "Cobertura real (d)",
      "Estado",
      "ABC sugerido",
      "Mín sugerido",
      "Obj sugerido",
      "Máx sugerido",
      "Ubicación",
      "Proveedor",
      "Lead time (d)",
      "Política revisada",
    ],
  ]
  for (const r of panol) {
    const p = politica.porItem.get(r.id)!
    h1.push([
      r.codigo ?? "",
      r.nombre,
      Number(r.stock_actual),
      r.precio_unitario != null ? Number(r.precio_unitario) : null,
      p.valor,
      r.stock_max != null ? Number(r.stock_max) : null,
      r.stock_min != null ? Number(r.stock_min) : null,
      p.puntoReposicion,
      r.clase_abc ?? "",
      p.criticidad.tipo,
      siNo(p.estado === "fuera"),
      siNo(!!r.parada_por_falta),
      reposicionTexto(r.lead_time_dias),
      p.criticidad.total,
      p.criticidad.nivel,
      r.stock_objetivo != null ? Number(r.stock_objetivo) : null,
      r.dias_stock ?? null,
      p.consumo,
      p.coberturaDias,
      ESTADO_STOCK_LABEL[p.estado],
      p.claseSugerida,
      p.minSugerido,
      p.objetivoSugerido,
      p.maxSugerido,
      r.ubicacion ?? "",
      r.proveedor_id ? (provNombre.get(r.proveedor_id) ?? "") : "",
      r.lead_time_dias ?? null,
      fmtFecha(r.politica_actualizada_at ?? null),
    ])
  }
  h1.push([])
  h1.push(["Criticidad equipo", "Valor", "", "Cantidad Real < Cantidad Mínima", "Valor", "", "Parada por falta de repuesto", "Valor", "", "Reposición de stock", "Valor"])
  h1.push(["A", 10, "", "SI", 0, "", "SI", 10, "", "Menor a 1 semana", 0])
  h1.push(["B", 5, "", "NO", 10, "", "NO", 0, "", "1 semana a 1 mes", 5])
  h1.push(["C", 0, "", "", "", "", "", "", "", "Más de 1 mes", 10])
  h1.push(["ALTA ≥ 30 · MEDIA ≥ 15 · BAJA"])

  // --- Hoja 2: Repuestos Criticidad Alta
  const h2: (string | number | null)[][] = [["Código", "Repuesto", "Cantidad Actual", "Modelo de Maquina", "Comentarios"]]
  for (const r of panol) {
    const p = politica.porItem.get(r.id)!
    if (p.criticidad.nivel !== "ALTA") continue
    h2.push([
      r.codigo ?? "",
      r.nombre,
      Number(r.stock_actual),
      "",
      `${ESTADO_STOCK_LABEL[p.estado]} · ${p.criticidad.total} pts · lead time ${r.lead_time_dias ?? "s/d"} d${r.parada_por_falta ? " · paró una unidad" : ""}`,
    ])
  }
  if (h2.length === 1) h2.push(["", "Ningún repuesto con criticidad ALTA hoy", "", "", ""])

  // --- Hoja 3: Pedidos
  const h3: (string | number | null)[][] = [
    ["Código", "Repuesto", "Proveedor", "Cantidad", "Unidad", "Pedido", "Precio UN ARS", "Total ARS", "N° Orden de Compra", "Entregado", "Fecha retiro", "Días de espera", "Unidad / OT", "Prioridad", "Estado"],
  ]
  for (const pe of (pedRes.data || []) as unknown as Array<{
    fecha: string
    fecha_retiro: string | null
    proveedor: string | null
    prioridad: string
    estado: string
    monto: number | null
    descripcion: string | null
    dominio: string | null
    ot_id: string | null
    items: Array<{ descripcion: string | null; cantidad: number | null; repuesto: { nombre: string; unidad: string | null; codigo: string | null } | null }>
  }>) {
    if (pe.estado === "anulado") continue
    const hasta = pe.fecha_retiro ?? hoy
    const dias = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(pe.fecha)) / 86_400_000))
    for (const it of pe.items.length > 0 ? pe.items : [{ descripcion: pe.descripcion ?? "(sin detalle)", cantidad: null, repuesto: null }]) {
      h3.push([
        it.repuesto?.codigo ?? "",
        it.repuesto?.nombre ?? it.descripcion ?? "",
        pe.proveedor ?? "",
        it.cantidad != null ? Number(it.cantidad) : null,
        it.repuesto?.unidad ?? "",
        fmtFecha(pe.fecha),
        null,
        pe.monto != null ? Number(pe.monto) : null,
        "",
        pe.estado === "retirado" ? "Si" : "No",
        fmtFecha(pe.fecha_retiro),
        dias,
        pe.dominio ?? "",
        pe.prioridad,
        pe.estado,
      ])
    }
  }

  // --- Hoja 4: Listado de Proveedores
  const h4: (string | number | null)[][] = [["Nombre", "Razon Social", "CUIT", "Telefono", "Mail", "Localidad", "Tipo de Vehículo", "Repuestos", "Taller", "Lead time acordado (d)", "Notas"]]
  for (const p of proveedores) {
    // Sin la migración no hay rol: van todos los activos.
    const sinRol = p.es_repuestos === undefined && p.es_taller === undefined
    if (!sinRol && !(p.es_repuestos || p.es_taller)) continue
    h4.push([
      p.nombre,
      (p.razon_social as string) ?? "",
      (p.cuit as string) ?? "",
      (p.telefono as string) ?? "",
      (p.email as string) ?? "",
      (p.localidad as string) ?? "",
      (p.tipo_vehiculo as string) ?? "",
      siNo(p.es_repuestos as boolean),
      siNo(p.es_taller as boolean),
      (p.lead_time_dias as number) ?? null,
      (p.notas as string) ?? "",
    ])
  }

  // --- Hoja 5: Lay Out (ubicación física por ítem, agrupada)
  const h5: (string | number | null)[][] = [["Ubicación", "Código", "Repuesto", "Cantidad", "Clase ABC"]]
  const porUbic = new Map<string, Rep[]>()
  for (const r of panol) {
    const u = r.ubicacion?.trim() || "(sin ubicación cargada)"
    const arr = porUbic.get(u) ?? []
    arr.push(r)
    porUbic.set(u, arr)
  }
  for (const [u, arr] of [...porUbic.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))) {
    for (const r of arr) h5.push([u, r.codigo ?? "", r.nombre, Number(r.stock_actual), r.clase_abc ?? ""])
  }

  // --- Hoja 6: Conteos (rutina y exactitud)
  const h6: (string | number | null)[][] = [["Fecha", "Realizado por", "Ítems contados", "Con diferencia", "Exactitud %", "Ajustado", "Repuesto", "Sistema", "Contado", "Diferencia", "Causa", "Nota", "Observaciones"]]
  for (const c of (conteosData || []) as unknown as Array<{
    fecha: string
    realizado_por: string
    ajustado: boolean
    observaciones: string | null
    items: Array<{ stock_sistema: number; stock_contado: number; causa?: CausaDiferencia | null; nota?: string | null; repuesto: { nombre: string } | null }>
  }>) {
    const conDif = c.items.filter((i) => Number(i.stock_sistema) !== Number(i.stock_contado))
    const exact = c.items.length > 0 ? Math.round(((c.items.length - conDif.length) / c.items.length) * 100) : null
    h6.push([fmtFecha(c.fecha), c.realizado_por, c.items.length, conDif.length, exact, siNo(c.ajustado), "", null, null, null, "", "", c.observaciones ?? ""])
    for (const i of conDif) {
      h6.push([
        "", "", null, null, null, "",
        i.repuesto?.nombre ?? "",
        Number(i.stock_sistema),
        Number(i.stock_contado),
        Number(i.stock_contado) - Number(i.stock_sistema),
        i.causa ? CAUSA_DIFERENCIA_LABEL[i.causa] : "",
        i.nota ?? "",
        "",
      ])
    }
  }

  const wb = XLSX.utils.book_new()
  const hoja = (nombre: string, filas: (string | number | null)[][], anchos: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(filas)
    ws["!cols"] = anchos.map((w) => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, nombre)
  }
  hoja("Seguimiento Repuestos", h1, [10, 32, 10, 12, 12, 10, 10, 10, 9, 9, 10, 12, 18, 9, 10, 9, 9, 9, 9, 20, 8, 8, 8, 8, 18, 22, 8, 12])
  hoja("Repuestos Criticidad Alta", h2, [10, 32, 12, 18, 60])
  hoja("Pedidos", h3, [10, 32, 22, 9, 8, 11, 12, 12, 12, 10, 11, 10, 14, 10, 10])
  hoja("Listado de Proveedores", h4, [24, 28, 14, 16, 26, 16, 14, 9, 8, 12, 30])
  hoja("Lay Out", h5, [26, 10, 32, 10, 9])
  hoja("Conteos", h6, [11, 16, 8, 8, 8, 8, 28, 8, 8, 9, 30, 30, 50])

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DPO-2.3-Gestion-de-Inventario-Mercosur-${hoy}.xlsx"`,
    },
  })
}
