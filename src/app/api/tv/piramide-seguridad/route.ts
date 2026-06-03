import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina (lo consume la cartelera del Depósito Esteban).
// No usa sesión de cookie: valida un Bearer propio y lee con service role.
// Devuelve los conteos de la pirámide de seguridad del MES en curso (igual que
// la Etapa 1 de las reuniones) + días sin accidentes + etiqueta del período.

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const SIGLAS = ["fat", "lti", "mdi", "mti", "fai", "sio", "sho"] as const

function ahoraARG(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000)
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
    .from("reportes_seguridad")
    .select("tipo, tipo_accidente, fecha")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = ahoraARG()
  const anio = now.getUTCFullYear()
  const mes = now.getUTCMonth() + 1 // 1-12

  const conteos: Record<string, number> = {
    fat: 0, lti: 0, mdi: 0, mti: 0, fai: 0, sio: 0, sho: 0,
  }
  let ultimoAccidente: string | null = null

  for (const r of data ?? []) {
    const fecha: string | null = r.fecha
    if (!fecha) continue
    // Días sin accidente: último reporte tipo "accidente" (cualquier período)
    if (r.tipo === "accidente" && (ultimoAccidente === null || fecha > ultimoAccidente)) {
      ultimoAccidente = fecha
    }
    // Conteos de la pirámide: solo mes en curso y clasificados
    const sigla = r.tipo_accidente as string | null
    if (!sigla || !(sigla in conteos)) continue
    const y = Number(fecha.slice(0, 4))
    const m = Number(fecha.slice(5, 7))
    if (y !== anio || m !== mes) continue
    conteos[sigla] += 1
  }

  let diasSinAccidente: number | null = null
  if (ultimoAccidente) {
    const [y, m, d] = ultimoAccidente.split("-").map(Number)
    const lastUTC = Date.UTC(y, m - 1, d)
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    diasSinAccidente = Math.max(0, Math.floor((todayUTC - lastUTC) / 86_400_000))
  }

  return NextResponse.json({
    conteos,
    periodo_label: `${MESES[mes - 1]} ${anio}`,
    dias_sin_accidente: diasSinAccidente,
    siglas: SIGLAS,
  })
}
