import { NextResponse } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// GET — promedio general por proveedor (ranking comparativo).
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const sb = g.supabase

  const provq = await sb.from("mant_proveedores").select("id, nombre, tipo_servicio").order("nombre")
  if (provq.error) return NextResponse.json({ error: provq.error.message }, { status: 500 })

  const evq = await sb
    .from("mant_eval_evaluaciones")
    .select("proveedor_id, fecha, puntajes:mant_eval_puntajes(puntaje)")
  if (evq.error) return NextResponse.json({ error: evq.error.message }, { status: 500 })

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const porProv = new Map<number, { valores: number[]; fechas: string[]; n: number }>()
  for (const ev of (evq.data ?? []) as any[]) {
    const acc = porProv.get(ev.proveedor_id) ?? { valores: [], fechas: [], n: 0 }
    acc.n += 1
    acc.fechas.push(ev.fecha)
    for (const pt of ev.puntajes ?? []) if (pt.puntaje != null) acc.valores.push(pt.puntaje)
    porProv.set(ev.proveedor_id, acc)
  }

  const out = (provq.data ?? []).map((p) => {
    const acc = porProv.get(p.id)
    const prom = acc && acc.valores.length
      ? Math.round((acc.valores.reduce((a, b) => a + b, 0) / acc.valores.length) * 100) / 100
      : null
    const ultima = acc && acc.fechas.length ? acc.fechas.sort().slice(-1)[0] : null
    return {
      proveedor_id: p.id,
      proveedor_nombre: p.nombre,
      tipo_servicio: p.tipo_servicio,
      evaluaciones: acc?.n ?? 0,
      promedio: prom,
      ultima_fecha: ultima,
    }
  })
  return NextResponse.json(out)
}
