import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina (lo consume la cartelera del Depósito Esteban).
// Devuelve el podio 5S de ayudantes (área Depósito) ya confirmado para el
// último período cargado en /5s/ayudantes. Bearer propio + service role.

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function etiquetaPeriodo(periodoDesde: string, ventana: number): string {
  const [y, m] = periodoDesde.split("-").map(Number)
  if (!y || !m) return ""
  if (ventana <= 1) return `${MESES[m - 1]} ${y}`
  const hastaMesIdx = (m - 1 + ventana - 1) % 12
  const hastaAnio = y + Math.floor((m - 1 + ventana - 1) / 12)
  const finLabel = hastaAnio === y ? MESES[hastaMesIdx] : `${MESES[hastaMesIdx]} ${hastaAnio}`
  return `${MESES[m - 1]}–${finLabel} ${y}`
}

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }

  const expected = process.env.TV_DPO_READ_TOKEN
  const auth = request.headers.get("authorization")
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase
    .from("s5_ayudantes_premios")
    .select("periodo_desde, area, posicion, nombre, score")
    .eq("area", "deposito")
    .order("periodo_desde", { ascending: false })
    .order("posicion", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  if (rows.length === 0) {
    return NextResponse.json({ ranking: [], periodo_label: "" })
  }

  // Último período cargado
  const ultimo = rows[0].periodo_desde
  const delPeriodo = rows.filter((r) => r.periodo_desde === ultimo)

  // Ventana de meses (para la etiqueta) desde la config; default bimestral
  let ventana = 2
  const { data: cfg } = await supabase
    .from("s5_ayudantes_config")
    .select("meses_ventana")
    .eq("id", 1)
    .maybeSingle()
  if (cfg?.meses_ventana) ventana = Number(cfg.meses_ventana)

  const ranking = delPeriodo
    .sort((a, b) => (a.posicion ?? 99) - (b.posicion ?? 99))
    .map((r) => ({
      nombre: r.nombre,
      score: r.score != null ? Math.round(Number(r.score)) : null,
      posicion: r.posicion,
    }))

  return NextResponse.json({
    ranking,
    periodo_label: etiquetaPeriodo(ultimo, ventana),
  })
}
