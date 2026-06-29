export const maxDuration = 60

import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getClusterizacion } from "@/actions/clusterizacion"
import {
  CLUSTER_LABELS,
  CUADRANTE_LABELS,
  type CuadranteId,
  type ClienteClusterizado,
} from "@/actions/clusterizacion-tipos"

export const dynamic = "force-dynamic"

const HEADER = [
  "Supervisor",
  "Promotor",
  "Cliente",
  "ID",
  "Localidad",
  "Cluster",
  "Facturación YTD",
  "$/HL año",
  "Acción recomendada",
  "Estado",
  "Salud",
]

const COLS = [
  { wch: 22 }, { wch: 22 }, { wch: 38 }, { wch: 8 }, { wch: 18 }, { wch: 14 },
  { wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 10 }, { wch: 10 },
]

function fila(c: ClienteClusterizado): Record<string, string | number> {
  return {
    Supervisor: c.supervisor ?? "",
    Promotor: c.promotor ?? "",
    Cliente: c.nombre ?? `Cliente ${c.id_cliente}`,
    ID: c.id_cliente,
    Localidad: c.localidad ?? "",
    Cluster: CLUSTER_LABELS[c.cluster],
    "Facturación YTD": Math.round(c.ingresos_actual),
    "$/HL año": c.costo_x_hl_ytd == null ? "" : Math.round(c.costo_x_hl_ytd),
    "Acción recomendada": c.cuadrante ? CUADRANTE_LABELS[c.cuadrante] : "(sin costo)",
    Estado: c.estado === "no_pasa" ? "No pasa" : "Pasa",
    Salud: c.salud === "atencion" ? "Atención" : "Sano",
  }
}

function sheet(rows: Record<string, string | number>[]): XLSX.WorkSheet {
  const ws = rows.length
    ? XLSX.utils.json_to_sheet(rows, { header: HEADER })
    : XLSX.utils.aoa_to_sheet([HEADER])
  ws["!cols"] = COLS
  return ws
}

export async function GET() {
  // El middleware ya verificó sesión; getClusterizacion vuelve a chequear auth.
  let res
  try {
    res = await getClusterizacion()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al calcular la clusterización." },
      { status: 500 },
    )
  }
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 500 })

  const { clientes } = res.data
  const orden = (a: ClienteClusterizado, b: ClienteClusterizado) =>
    (a.supervisor ?? "").localeCompare(b.supervisor ?? "") || b.ingresos_actual - a.ingresos_actual
  const porCuad = (q: CuadranteId) =>
    clientes.filter((c) => c.cuadrante === q).sort(orden).map(fila)
  const todos = [...clientes].sort(orden).map(fila)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet(porCuad("revisar")), "Revisar (bajo valor-caro)")
  XLSX.utils.book_append_sheet(wb, sheet(porCuad("optimizar")), "Optimizar (caros)")
  XLSX.utils.book_append_sheet(wb, sheet(porCuad("proteger")), "Proteger")
  XLSX.utils.book_append_sheet(wb, sheet(porCuad("mantener")), "Mantener")
  XLSX.utils.book_append_sheet(wb, sheet(todos), "Todos")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clusterizacion_valor_costo.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
