import { NextResponse, type NextRequest } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Plan de Agrupación de Clientes (DPO Planeamiento 4.2).
// Calcula los 4 clústeres (Ganador / Crecimiento / Básico / Ventas Bajas) por
// movimiento de clase ABC de Pareto entre dos períodos, y los cruza con RMD y
// rechazo (In Full). Toda la lógica vive en la función SQL
// `cluster_clientes_misiones`; acá sólo validamos params y agregamos.

interface FilaRpc {
  id_cliente: number
  razon_social: string | null
  des_localidad: string | null
  des_canal_mkt: string | null
  u1: number
  u2: number
  m1: number
  m2: number
  cl1: string | null
  cl2: string | null
  cluster: string
  rmd_prom: number | null
  rmd_n: number
  rmd_bajos: number
  bultos_rech: number
  bultos_entr: number
  lat: number | null
  lng: number | null
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })

  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const p1d = sp.get("p1d")
  const p1h = sp.get("p1h")
  const p2d = sp.get("p2d")
  const p2h = sp.get("p2h")
  if (![p1d, p1h, p2d, p2h].every((f) => f && RE_FECHA.test(f)))
    return NextResponse.json({ ok: false, error: "Fechas inválidas" }, { status: 400 })

  const abcA = Math.min(0.99, Math.max(0.5, Number(sp.get("abcA") ?? "0.80")))
  const abcB = Math.min(0.999, Math.max(abcA + 0.01, Number(sp.get("abcB") ?? "0.95")))
  const metrica = sp.get("metrica") === "monto" ? "monto" : "unidades"

  try {
    const supabase = await createClient()
    // PostgREST corta en 1000 filas por respuesta; paginamos con .range() hasta
    // traer todos los clientes (la función ya viene ordenada por id_cliente).
    const filas: FilaRpc[] = []
    const PAGE = 1000
    for (let from = 0; from < 50_000; from += PAGE) {
      const { data, error } = await supabase
        .rpc("cluster_clientes_misiones", {
          p1_desde: p1d,
          p1_hasta: p1h,
          p2_desde: p2d,
          p2_hasta: p2h,
          abc_a: abcA,
          abc_b: abcB,
          metrica,
        })
        .range(from, from + PAGE - 1)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      const pagina = (data ?? []) as FilaRpc[]
      filas.push(...pagina)
      if (pagina.length < PAGE) break
    }

    // Agregados por clúster.
    const CLUSTERS = [
      "Ganador",
      "Crecimiento",
      "Básico",
      "Ventas Bajas",
      "Nuevo",
      "Perdido",
    ] as const
    const agg = CLUSTERS.map((c) => {
      const xs = filas.filter((f) => f.cluster === c)
      const conRmd = xs.filter((f) => f.rmd_n > 0 && f.rmd_prom != null)
      const rech = xs.reduce((a, f) => a + Number(f.bultos_rech || 0), 0)
      const entr = xs.reduce((a, f) => a + Number(f.bultos_entr || 0), 0)
      return {
        cluster: c,
        clientes: xs.length,
        unidades: Math.round(xs.reduce((a, f) => a + Number(f.u1 || 0) + Number(f.u2 || 0), 0)),
        monto: Math.round(xs.reduce((a, f) => a + Number(f.m1 || 0) + Number(f.m2 || 0), 0)),
        rmd_prom:
          conRmd.length > 0
            ? Number(
                (conRmd.reduce((a, f) => a + Number(f.rmd_prom), 0) / conRmd.length).toFixed(2),
              )
            : null,
        rmd_bajos: xs.reduce((a, f) => a + Number(f.rmd_bajos || 0), 0),
        bultos_rech: Math.round(rech),
        bultos_entr: Math.round(entr),
        infull_pct: rech + entr > 0 ? Number((100 * (1 - rech / (rech + entr))).toFixed(2)) : null,
      }
    })

    // Matriz de transición ABC (clase período 1 → clase período 2).
    const clases = ["A", "B", "C"] as const
    const matriz = clases.map((c1) => ({
      c1,
      celdas: clases.map((c2) => ({
        c2,
        n: filas.filter((f) => f.cl1 === c1 && f.cl2 === c2).length,
      })),
    }))

    const total = filas.length
    const clasificados = filas.filter((f) =>
      ["Ganador", "Crecimiento", "Básico", "Ventas Bajas"].includes(f.cluster),
    ).length

    // Ordenamos por volumen total desc para la tabla.
    filas.sort((a, b) => Number(b.u1) + Number(b.u2) - (Number(a.u1) + Number(a.u2)))

    return NextResponse.json({
      ok: true,
      params: { p1d, p1h, p2d, p2h, abcA, abcB, metrica },
      total,
      clasificados,
      agg,
      matriz,
      filas,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message || e) },
      { status: 502 },
    )
  }
}
