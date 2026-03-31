export const maxDuration = 60

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import OpenAI from "openai"
import * as pdfParse from "pdf-parse"
import * as mammoth from "mammoth"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop()

  if (ext === "pdf") {
    const parsePdf = (pdfParse as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default ?? pdfParse
    const data = await (parsePdf as (buf: Buffer) => Promise<{ text: string }>)(buffer)
    return data.text
  }

  if (ext === "docx" || ext === "doc") {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // Plain text fallback
  return buffer.toString("utf-8")
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    // Check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "auditor"].includes(profile.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const capacitacionId = formData.get("capacitacion_id") as string | null

    if (!file || !capacitacionId) {
      return NextResponse.json(
        { error: "Falta archivo o capacitacion_id" },
        { status: 400 }
      )
    }

    // Extract text from document
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    let text = await extractText(buffer, file.name)

    // Truncate to ~12000 chars to fit in context
    if (text.length > 12000) {
      text = text.substring(0, 12000)
    }

    if (text.trim().length < 50) {
      return NextResponse.json(
        { error: "No se pudo extraer texto suficiente del documento" },
        { status: 400 }
      )
    }

    // Get capacitacion title for context
    const { data: cap } = await supabase
      .from("capacitaciones")
      .select("titulo, pilar")
      .eq("id", capacitacionId)
      .single()

    const titulo = cap?.titulo ?? "Capacitacion"
    const pilar = cap?.pilar ?? ""

    // Generate questions with OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `Sos un experto en capacitacion laboral para distribuidoras de bebidas en Argentina.
Genera exactamente 10 preguntas de multiple choice basadas en el material proporcionado.
Cada pregunta debe tener exactamente 4 opciones (A, B, C, D) y una sola respuesta correcta.
Las preguntas deben evaluar comprension del material, no solo memoria.
Responde UNICAMENTE con un JSON array valido, sin markdown ni texto adicional.
Formato exacto:
[
  {
    "texto": "¿Pregunta aqui?",
    "opciones": ["Opcion A", "Opcion B", "Opcion C", "Opcion D"],
    "respuesta_correcta": 0
  }
]
donde respuesta_correcta es el indice (0-3) de la opcion correcta.`,
        },
        {
          role: "user",
          content: `Capacitacion: "${titulo}" (Pilar: ${pilar})

Material de estudio:
${text}

Genera 10 preguntas de examen basadas en este material.`,
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ""

    // Parse JSON response
    let preguntas: {
      texto: string
      opciones: string[]
      respuesta_correcta: number
    }[]

    try {
      // Try to extract JSON from response (might have markdown wrapping)
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error("No JSON found")
      preguntas = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json(
        { error: "La IA no genero un formato valido. Intenta de nuevo." },
        { status: 500 }
      )
    }

    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return NextResponse.json(
        { error: "No se generaron preguntas" },
        { status: 500 }
      )
    }

    // Save questions to database
    const adminClient = createAdminClient()
    const rows = preguntas.map((p, idx) => ({
      capacitacion_id: capacitacionId,
      texto: p.texto,
      opciones: JSON.stringify(p.opciones),
      respuesta_correcta: p.respuesta_correcta,
      orden: idx,
    }))

    const { data: saved, error: saveError } = await adminClient
      .from("capacitacion_preguntas")
      .insert(rows)
      .select()

    if (saveError) {
      return NextResponse.json(
        { error: "Error guardando preguntas: " + saveError.message },
        { status: 500 }
      )
    }

    // Also upload file to storage for reference
    const ext = file.name.split(".").pop()
    const storagePath = `capacitaciones/${capacitacionId}/material.${ext}`
    await adminClient.storage
      .from("evidencias")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    // Save material URL on capacitacion
    const { data: urlData } = adminClient.storage
      .from("evidencias")
      .getPublicUrl(storagePath)

    await adminClient
      .from("capacitaciones")
      .update({ material_url: urlData.publicUrl })
      .eq("id", capacitacionId)

    return NextResponse.json({
      success: true,
      preguntas_generadas: saved?.length ?? preguntas.length,
    })
  } catch (err) {
    console.error("Error generating exam:", err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Error generando examen",
      },
      { status: 500 }
    )
  }
}
