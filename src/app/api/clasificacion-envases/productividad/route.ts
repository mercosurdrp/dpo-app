import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"
import {
  agregarProductividad,
  type ClasificacionEnvaseRow,
} from "@/lib/clasificacion-envases"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina (lo consume el dashboard de Depósito Esteban).
// No usa sesión de cookie: valida un Bearer propio y lee con service role.
// Devuelve la productividad agregada (throughput + % rotura) del rango pedido.
// Default: mes actual (hora ARG). Params opcionales: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD

function rangoMesActualARG(): { desde: string; hasta: string } {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const desde = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const hasta = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
  return { desde, hasta }
}

const esFecha = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(request: NextRequest) {
  // En el deploy compartido de Misiones esta tabla no existe.
  if (IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }

  const expected = process.env.CLASIF_ENVASES_READ_TOKEN
  const auth = request.headers.get("authorization")
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const url = request.nextUrl
  const def = rangoMesActualARG()
  const desde = esFecha(url.searchParams.get("desde")) ? url.searchParams.get("desde")! : def.desde
  const hasta = esFecha(url.searchParams.get("hasta")) ? url.searchParams.get("hasta")! : def.hasta

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase
    .from("clasificacion_envases")
    .select(
      "fecha, hora_inicio, hora_fin, pallets_total, pallets_rotos, cajones_total, cajones_rotos, botellas_rotas"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const productividad = agregarProductividad(
    (data ?? []) as ClasificacionEnvaseRow[],
    desde,
    hasta
  )
  return NextResponse.json(productividad)
}
