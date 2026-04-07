export const maxDuration = 60

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = file.name.toLowerCase().split(".").pop()

    // Extract text from document
    let text = ""

    if (ext === "docx" || ext === "doc") {
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (ext === "pdf") {
      // For PDF, convert to base64 and let OpenAI read it directly
      // We'll handle this in the OpenAI call below
      text = "__PDF_BASE64__"
    } else {
      text = buffer.toString("utf-8")
    }

    if (text !== "__PDF_BASE64__" && text.trim().length < 50) {
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

    const systemPrompt = `Sos un experto en capacitacion laboral para distribuidoras de bebidas en Argentina.
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
donde respuesta_correcta es el indice (0-3) de la opcion correcta.`

    const userPrompt = `Capacitacion: "${titulo}" (Pilar: ${pilar})\n\nGenera 10 preguntas de examen basadas en el material adjunto.`

    // Build OpenAI request body manually to avoid type issues
    const OpenAI = (await import("openai")).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    let requestBody: Record<string, unknown>

    if (text === "__PDF_BASE64__") {
      // Send PDF as base64 to OpenAI vision
      const base64 = buffer.toString("base64")
      const dataUrl = `data:application/pdf;base64,${base64}`

      requestBody = {
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: file.name,
                  file_data: dataUrl,
                },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
      }
    } else {
      // Truncate text
      if (text.length > 12000) text = text.substring(0, 12000)

      requestBody = {
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `${userPrompt}\n\nMaterial de estudio:\n${text}`,
          },
        ],
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completion = await (openai.chat.completions.create as any)(requestBody)

    const content = (completion as { choices: { message: { content: string } }[] }).choices[0]?.message?.content ?? ""

    // Parse JSON response
    let preguntas: {
      texto: string
      opciones: string[]
      respuesta_correcta: number
    }[]

    try {
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

    // Upload file to storage
    const storagePath = `capacitaciones/${capacitacionId}/material.${ext}`
    await adminClient.storage
      .from("evidencias")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

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
