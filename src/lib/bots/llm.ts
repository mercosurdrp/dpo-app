// Capa mínima para el modelo de los bots. Hoy OpenAI (la key ya está en el
// proyecto); cualquier proveedor compatible con la API de OpenAI entra
// cambiando env vars, sin tocar código:
//   - Grok (xAI):  BOTS_LLM_BASE_URL=https://api.x.ai/v1  BOTS_LLM_API_KEY=xai-...
//   - BOTS_LLM_MODEL elige el modelo (default gpt-5.4-mini).

const MODELO_DEFAULT = "gpt-5.4-mini"

export function modeloBots(): string {
  return (process.env.BOTS_LLM_MODEL ?? "").trim() || MODELO_DEFAULT
}

/**
 * Pide al modelo una respuesta JSON que cumpla `schema` (JSON Schema estricto)
 * y la devuelve parseada. Tira error si el modelo no responde JSON válido.
 */
export async function generarJson<T>(opts: {
  sistema: string
  usuario: string
  nombreSchema: string
  schema: Record<string, unknown>
}): Promise<T> {
  const apiKey = (process.env.BOTS_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim()
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY (o BOTS_LLM_API_KEY)")
  const baseURL = (process.env.BOTS_LLM_BASE_URL ?? "").trim() || undefined

  const OpenAI = (await import("openai")).default
  const client = new OpenAI({ apiKey, baseURL })
  const completion = await client.chat.completions.create({
    model: modeloBots(),
    messages: [
      { role: "system", content: opts.sistema },
      { role: "user", content: opts.usuario },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.nombreSchema, strict: true, schema: opts.schema },
    },
  })
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("El modelo no devolvió contenido")
  return JSON.parse(content) as T
}
