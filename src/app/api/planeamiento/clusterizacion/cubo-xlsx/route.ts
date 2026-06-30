export const maxDuration = 60

import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { getClusterizacion } from "@/actions/clusterizacion"
import { getPlanesCubo } from "@/actions/clusterizacion-planes"
import {
  CLUSTER_LABELS,
  CUADRANTE_LABELS,
  CUBO_META,
  type ClusterId,
  type CuadranteId,
  type CuboId,
  type ClienteClusterizado,
} from "@/actions/clusterizacion-tipos"

export const dynamic = "force-dynamic"

const isCubo = (s: string): s is CuboId => s in CUBO_META
const isCluster = (s: string): s is ClusterId => s in CLUSTER_LABELS
const isCuadrante = (s: string): s is CuadranteId => s in CUADRANTE_LABELS

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const cubo = sp.get("cubo")
  const cluster = sp.get("cluster")
  const cuadrante = sp.get("cuadrante")

  let res
  try {
    res = await getClusterizacion()
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Error", { status: 500 })
  }
  if ("error" in res) return new NextResponse(res.error, { status: 500 })

  // Solo PDV con costo (los que entran al diagrama).
  let filas = res.data.clientes.filter((c) => c.cubo != null)
  let titulo = "Todos"
  let archivo = "diagrama_todos"
  if (cubo && isCubo(cubo)) {
    filas = filas.filter((c) => c.cubo === cubo); titulo = CUBO_META[cubo].label; archivo = `cubo_${cubo}`
  } else if (cluster && isCluster(cluster)) {
    filas = filas.filter((c) => c.cluster === cluster); titulo = CLUSTER_LABELS[cluster]; archivo = `cluster_${cluster}`
  } else if (cuadrante && isCuadrante(cuadrante)) {
    filas = filas.filter((c) => c.cuadrante === cuadrante); titulo = CUADRANTE_LABELS[cuadrante]; archivo = `cuadrante_${cuadrante}`
  }
  filas.sort(
    (a, b) =>
      (a.supervisor ?? "").localeCompare(b.supervisor ?? "") || b.ingresos_actual - a.ingresos_actual,
  )

  const plan = cubo && isCubo(cubo) ? (await getPlanesCubo()).find((p) => p.cubo === cubo) ?? null : null

  const wb = XLSX.utils.book_new()

  // Hoja 1: plan / contexto.
  const info: (string | number)[][] = [
    ["Grupo", titulo],
    ...(cubo && isCubo(cubo) ? [["Combinación", CUBO_META[cubo].combo]] : []),
    ["PDV", filas.length],
    [""],
    ["Plan de acción", plan ? plan.descripcion : "(sin plan cargado)"],
    ["Responsable", plan?.responsable ?? ""],
    ["Fecha límite", plan?.fecha_limite ?? ""],
    ["Estado", plan?.estado ?? ""],
  ]
  const wsInfo = XLSX.utils.aoa_to_sheet(info)
  wsInfo["!cols"] = [{ wch: 18 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsInfo, "Plan")

  // Hoja 2: clientes.
  const HEADER = [
    "Cliente", "ID", "Localidad", "Supervisor", "Promotor", "Cluster",
    "Facturación YTD", "$/HL año", "Crecimiento %", "Rechazo (45d)", "Equipos frío", "Modelos frío",
  ]
  const rows = filas.map((c: ClienteClusterizado) => ({
    Cliente: c.nombre ?? `Cliente ${c.id_cliente}`,
    ID: c.id_cliente,
    Localidad: c.localidad ?? "",
    Supervisor: c.supervisor ?? "",
    Promotor: c.promotor ?? "",
    Cluster: CLUSTER_LABELS[c.cluster],
    "Facturación YTD": Math.round(c.ingresos_actual),
    "$/HL año": c.costo_x_hl_ytd == null ? "" : Math.round(c.costo_x_hl_ytd),
    "Crecimiento %": c.crecimiento_pct == null ? "nuevo" : Math.round(c.crecimiento_pct * 100),
    "Rechazo (45d)": c.estado === "no_pasa" ? `No pasa (${c.rechazos_culpa})` : "Pasa",
    "Equipos frío": c.equipos_frio_n,
    "Modelos frío": c.equipos_frio_tipos ?? "",
  }))
  const wsCli = rows.length
    ? XLSX.utils.json_to_sheet(rows, { header: HEADER })
    : XLSX.utils.aoa_to_sheet([HEADER])
  wsCli["!cols"] = [
    { wch: 36 }, { wch: 8 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, wsCli, "Clientes")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
