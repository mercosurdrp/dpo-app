/**
 * PDF del aviso a Ventas de un día con pedidos pospuestos (DPO Entrega 4.2).
 *
 * GET ?fecha=YYYY-MM-DD&tipo=logistico|comercial
 *  - logistico: el mismo PDF «Clientes a reprogramar» que sale de Planeamiento →
 *    Priorización de Entrega, regenerado desde la foto guardada del corte.
 *  - comercial: lista de pedidos retenidos por crédito de ese día.
 */
import { NextResponse, type NextRequest } from "next/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getCorteDelDia } from "@/actions/priorizacion-entrega"
import { ciudadDeLocalidad } from "@/lib/priorizacion/score"
import { leerPospuestos } from "@/lib/comunicacion-cliente/pospuestos"
import { renderReprogramadosPdf, type GrupoPdf } from "@/app/api/planeamiento/priorizacion-entrega/pdf/_render"
import { renderRetenidosCreditoPdf } from "./_render-credito"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function pdfResponse(pdf: Buffer, nombre: string) {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

const err = (status: number, message: string) => NextResponse.json({ error: message, message }, { status })

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return err(401, "unauthorized")
  }
  if (IS_MISIONES) return err(400, "Solo disponible en Pampeana.")

  const fecha = req.nextUrl.searchParams.get("fecha") ?? ""
  const tipo = req.nextUrl.searchParams.get("tipo") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || (tipo !== "logistico" && tipo !== "comercial")) {
    return err(400, "Parámetros inválidos (fecha YYYY-MM-DD y tipo logistico|comercial).")
  }

  try {
    if (tipo === "logistico") {
      const res = await getCorteDelDia(fecha)
      if ("error" in res) return err(500, res.error)
      const corte = res.data
      if (corte.filas.length === 0) return err(404, "No hay corte registrado ese día.")
      // Mismo armado que el panel de cortes registrados: agrupa por CIUDAD.
      const porCiudad = new Map<string, typeof corte.filas>()
      for (const f of corte.filas) {
        const k = ciudadDeLocalidad(f.localidad)
        const prev = porCiudad.get(k)
        if (prev) prev.push(f)
        else porCiudad.set(k, [f])
      }
      const grupos: GrupoPdf[] = [...porCiudad.entries()].map(([ciudad, filas]) => ({
        ciudad,
        filas: filas.map((f) => ({
          id_cliente: f.id_cliente,
          nombre: f.nombre_cliente,
          localidad: f.localidad,
          bultos: f.bultos,
          hl: f.hl,
          monto: f.monto,
          score: f.score,
          comportamiento: f.comportamiento,
          rmd_prom: null,
          rechazos_45d: 0,
          veces_pospuesto: f.veces_previas,
          posicion: f.posicion,
          motivo: f.motivo,
        })),
        bultos: filas.reduce((s, f) => s + f.bultos, 0),
        hl: filas.reduce((s, f) => s + f.hl, 0),
        monto: filas.reduce((s, f) => s + f.monto, 0),
      }))
      const pdf = await renderReprogramadosPdf({
        fecha,
        nota: corte.nota ?? "",
        total: { clientes: corte.total_clientes, bultos: corte.total_bultos, hl: corte.total_hl, monto: corte.total_monto },
        grupos,
      })
      return pdfResponse(pdf, `reprogramados-${fecha}.pdf`)
    }

    const res = await leerPospuestos(fecha, fecha)
    if ("error" in res) return err(500, res.error)
    if (res.vrcError) return err(502, res.vrcError)
    const dia = res.dias.find((d) => d.tipo === "comercial")
    if (!dia) return err(404, "No hay pedidos retenidos por crédito ese día.")
    return pdfResponse(await renderRetenidosCreditoPdf(dia), `retenidos-credito-${fecha}.pdf`)
  } catch (e) {
    return err(500, e instanceof Error ? e.message : "Error generando el PDF")
  }
}
