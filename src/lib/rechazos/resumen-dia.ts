/**
 * Resumen del día para el detalle de "Rechazos %" en el tablero de reuniones.
 * Lectura pura: recibe el cliente Supabase y la fecha, devuelve KPIs +
 * top 10 clientes / motivos / productos + breakdown por patente.
 */
import type { SupaClient } from "./comparado"

export interface RechazosResumenDiaKPIs {
  bultos_rechazados: number
  ventas_total_bultos: number
  tasa: number | null
  eventos: number
  monto_neto: number
  monto_bruto: number
  patentes_con_rechazo: number
}

export interface RechazosResumenClienteRow {
  id_cliente: number | null
  nombre_cliente: string
  bultos: number
  monto_neto: number
  eventos: number
  motivo_principal: string | null
}

export interface RechazosResumenMotivoRow {
  id_rechazo: number
  ds_rechazo: string
  categoria: string
  bultos: number
  eventos: number
}

export interface RechazosResumenProductoRow {
  id_articulo: number
  ds_articulo: string
  bultos: number
  monto_neto: number
}

export interface RechazosResumenPatenteRow {
  patente: string
  chofer_nombre: string | null
  bultos: number
  eventos: number
  monto_neto: number
}

export interface RechazosResumenDia {
  fecha: string
  kpis: RechazosResumenDiaKPIs
  top_clientes: RechazosResumenClienteRow[]
  top_motivos: RechazosResumenMotivoRow[]
  top_productos: RechazosResumenProductoRow[]
  por_patente: RechazosResumenPatenteRow[]
}

interface RawRechazoRow {
  ds_fletero_carga: string
  id_rechazo: number
  ds_rechazo: string | null
  id_cliente: number | null
  nombre_cliente: string | null
  id_articulo: number
  ds_articulo: string | null
  bultos_rechazados: number | null
  monto_neto: number | null
  monto_bruto: number | null
}

interface CatalogoEntry {
  id_rechazo: number
  ds_rechazo: string
  categoria: string
}

const SIN_CLIENTE = "(Sin cliente)"
const SIN_ARTICULO = "(Sin descripción)"

export async function getRechazosResumenDia(
  supa: SupaClient,
  fecha: string,
): Promise<RechazosResumenDia> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida (esperado YYYY-MM-DD)")
  }

  const [rechazosRaw, ventasRaw, catalogoRaw, mapeoRaw] = await Promise.all([
    supa
      .from("rechazos")
      .select(
        "ds_fletero_carga,id_rechazo,ds_rechazo,id_cliente,nombre_cliente,id_articulo,ds_articulo,bultos_rechazados,monto_neto,monto_bruto",
      )
      .eq("fecha", fecha),
    supa
      .from("ventas_diarias")
      .select("total_bultos")
      .eq("fecha", fecha),
    supa
      .from("catalogo_rechazos")
      .select("id_rechazo,ds_rechazo,categoria"),
    supa
      .from("mapeo_patente_chofer")
      .select("patente, catalogo_choferes(nombre)"),
  ])

  if (rechazosRaw.error) {
    throw new Error(`rechazos: ${rechazosRaw.error.message}`)
  }
  if (ventasRaw.error) {
    throw new Error(`ventas_diarias: ${ventasRaw.error.message}`)
  }

  const rechazos = (rechazosRaw.data ?? []) as RawRechazoRow[]
  const ventas = (ventasRaw.data ?? []) as Array<{ total_bultos: number | null }>
  const catalogo = (catalogoRaw.data ?? []) as CatalogoEntry[]
  type MapeoRow = {
    patente: string
    catalogo_choferes: { nombre: string | null } | null
  }
  const mapeo = (mapeoRaw.data ?? []) as unknown as MapeoRow[]

  const catalogoIdx = new Map<number, CatalogoEntry>()
  for (const c of catalogo) catalogoIdx.set(c.id_rechazo, c)

  const choferIdx = new Map<string, string | null>()
  for (const m of mapeo) {
    choferIdx.set(m.patente, m.catalogo_choferes?.nombre ?? null)
  }

  // KPIs
  const ventasTotalBultos = ventas.reduce(
    (acc, v) => acc + Number(v.total_bultos ?? 0),
    0,
  )
  let bultosRechazados = 0
  let montoNetoTotal = 0
  let montoBrutoTotal = 0
  const patentesSet = new Set<string>()

  // Agregadores
  type ClienteAgg = {
    nombre_cliente: string
    bultos: number
    monto_neto: number
    eventos: number
    motivosBultos: Map<string, number>
  }
  type MotivoAgg = {
    id_rechazo: number
    ds_rechazo: string
    categoria: string
    bultos: number
    eventos: number
  }
  type ProductoAgg = {
    ds_articulo: string
    bultos: number
    monto_neto: number
  }
  type PatenteAgg = {
    chofer_nombre: string | null
    bultos: number
    eventos: number
    monto_neto: number
  }

  const clientes = new Map<number, ClienteAgg>()
  const motivos = new Map<number, MotivoAgg>()
  const productos = new Map<number, ProductoAgg>()
  const patentes = new Map<string, PatenteAgg>()

  for (const r of rechazos) {
    const b = Number(r.bultos_rechazados ?? 0)
    const mn = Number(r.monto_neto ?? 0)
    const mb = Number(r.monto_bruto ?? 0)
    if (!Number.isFinite(b)) continue

    bultosRechazados += b
    montoNetoTotal += mn
    montoBrutoTotal += mb
    if (r.ds_fletero_carga) patentesSet.add(r.ds_fletero_carga)

    // Cliente (key: id_cliente; null id -> -1 placeholder)
    const idC = r.id_cliente ?? -1
    const nombreC = (r.nombre_cliente ?? "").trim() || SIN_CLIENTE
    const dsR = (r.ds_rechazo ?? "").trim() || "(Sin motivo)"
    const cExist = clientes.get(idC)
    if (cExist) {
      cExist.bultos += b
      cExist.monto_neto += mn
      cExist.eventos += 1
      cExist.motivosBultos.set(
        dsR,
        (cExist.motivosBultos.get(dsR) ?? 0) + b,
      )
    } else {
      const m = new Map<string, number>()
      m.set(dsR, b)
      clientes.set(idC, {
        nombre_cliente: nombreC,
        bultos: b,
        monto_neto: mn,
        eventos: 1,
        motivosBultos: m,
      })
    }

    // Motivo
    const cat = catalogoIdx.get(r.id_rechazo)
    const motivoLabel = cat?.ds_rechazo ?? (r.ds_rechazo ?? "(Sin motivo)")
    const mExist = motivos.get(r.id_rechazo)
    if (mExist) {
      mExist.bultos += b
      mExist.eventos += 1
    } else {
      motivos.set(r.id_rechazo, {
        id_rechazo: r.id_rechazo,
        ds_rechazo: motivoLabel,
        categoria: cat?.categoria ?? "POR_CLASIFICAR",
        bultos: b,
        eventos: 1,
      })
    }

    // Producto
    const dsA = (r.ds_articulo ?? "").trim() || SIN_ARTICULO
    const pExist = productos.get(r.id_articulo)
    if (pExist) {
      pExist.bultos += b
      pExist.monto_neto += mn
    } else {
      productos.set(r.id_articulo, {
        ds_articulo: dsA,
        bultos: b,
        monto_neto: mn,
      })
    }

    // Patente
    const pat = r.ds_fletero_carga
    if (pat) {
      const patExist = patentes.get(pat)
      if (patExist) {
        patExist.bultos += b
        patExist.eventos += 1
        patExist.monto_neto += mn
      } else {
        patentes.set(pat, {
          chofer_nombre: choferIdx.get(pat) ?? null,
          bultos: b,
          eventos: 1,
          monto_neto: mn,
        })
      }
    }
  }

  const tasa =
    ventasTotalBultos > 0 ? (bultosRechazados / ventasTotalBultos) * 100 : null

  // Top 10 clientes por bultos
  const top_clientes: RechazosResumenClienteRow[] = [...clientes.entries()]
    .map(([id, agg]) => {
      let motivoPrincipal: string | null = null
      let mejor = -1
      for (const [m, b] of agg.motivosBultos) {
        if (b > mejor) {
          mejor = b
          motivoPrincipal = m
        }
      }
      return {
        id_cliente: id === -1 ? null : id,
        nombre_cliente: agg.nombre_cliente,
        bultos: agg.bultos,
        monto_neto: agg.monto_neto,
        eventos: agg.eventos,
        motivo_principal: motivoPrincipal,
      }
    })
    .sort((a, b) => b.bultos - a.bultos)
    .slice(0, 10)

  const top_motivos: RechazosResumenMotivoRow[] = [...motivos.values()]
    .sort((a, b) => b.bultos - a.bultos)
    .slice(0, 10)

  const top_productos: RechazosResumenProductoRow[] = [...productos.entries()]
    .map(([id, agg]) => ({
      id_articulo: id,
      ds_articulo: agg.ds_articulo,
      bultos: agg.bultos,
      monto_neto: agg.monto_neto,
    }))
    .sort((a, b) => b.bultos - a.bultos)
    .slice(0, 10)

  const por_patente: RechazosResumenPatenteRow[] = [...patentes.entries()]
    .map(([pat, agg]) => ({
      patente: pat,
      chofer_nombre: agg.chofer_nombre,
      bultos: agg.bultos,
      eventos: agg.eventos,
      monto_neto: agg.monto_neto,
    }))
    .sort((a, b) => b.bultos - a.bultos)

  return {
    fecha,
    kpis: {
      bultos_rechazados: bultosRechazados,
      ventas_total_bultos: ventasTotalBultos,
      tasa,
      eventos: rechazos.length,
      monto_neto: montoNetoTotal,
      monto_bruto: montoBrutoTotal,
      patentes_con_rechazo: patentesSet.size,
    },
    top_clientes,
    top_motivos,
    top_productos,
    por_patente,
  }
}
