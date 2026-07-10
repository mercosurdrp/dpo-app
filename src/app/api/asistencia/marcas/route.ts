import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

const API_KEY = process.env.ASISTENCIA_API_KEY

interface MarcaInput {
  codigo_empresa: string
  legajo_marca: string
  fecha_marca: string
  tipo_marca: string
  reloj_marca: string
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Integración asistencia no configurada (falta ASISTENCIA_API_KEY)." },
      { status: 503 }
    )
  }
  // Validate API key
  const authHeader = request.headers.get("x-api-key")
  if (authHeader !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const marcas: MarcaInput[] = Array.isArray(body) ? body : [body]

    // Log de diagnóstico del sync YAM→DPO: sin esto los pushes del reloj son
    // invisibles (la respuesta 200 no queda registrada en ningún lado y el
    // PHP remoto no reporta errores). No loguear el x-api-key.
    console.log(
      `[asistencia/marcas] recibidas=${marcas.length} primera=${JSON.stringify(marcas[0] ?? null)} ultima=${JSON.stringify(marcas[marcas.length - 1] ?? null)}`
    )

    if (marcas.length === 0) {
      return NextResponse.json({ error: "No marcas provided" }, { status: 400 })
    }

    const supabase = createAdminClient()

    let insertadas = 0
    let repetidas = 0
    const errores: string[] = []

    for (const marca of marcas) {
      const legajo = parseInt(marca.legajo_marca, 10)
      if (isNaN(legajo)) {
        errores.push(`Legajo inválido: ${marca.legajo_marca}`)
        continue
      }

      const { error } = await supabase
        .from("asistencia_marcas")
        .upsert(
          {
            codigo_empresa: marca.codigo_empresa || "MPAMP",
            legajo: legajo,
            fecha_marca: marca.fecha_marca,
            tipo_marca: marca.tipo_marca,
            reloj_marca: marca.reloj_marca || null,
          },
          { onConflict: "codigo_empresa,legajo,fecha_marca" }
        )

      if (error) {
        if (error.code === "23505") {
          repetidas++
        } else {
          errores.push(`Legajo ${legajo}: ${error.message}`)
        }
      } else {
        insertadas++
      }
    }

    console.log(
      `[asistencia/marcas] resultado insertadas=${insertadas} repetidas=${repetidas} errores=${errores.length > 0 ? JSON.stringify(errores.slice(0, 5)) : "ninguno"}`
    )

    return NextResponse.json({
      success: true,
      insertadas,
      repetidas,
      errores: errores.length > 0 ? errores : undefined,
      total: marcas.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error processing marcas" },
      { status: 500 }
    )
  }
}

// GET: health check
export async function GET() {
  return NextResponse.json({ status: "ok", service: "asistencia-marcas" })
}
