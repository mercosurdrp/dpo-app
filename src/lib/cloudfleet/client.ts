// Cliente mínimo de la API REST de Cloudfleet (gestión de flota) para Misiones.
// Solo lo que necesitamos hoy: listar checklists (inspecciones de
// liberación/retorno/AE) por rango de fecha.
//
// 🚨 Cloudflare delante de la API banea el User-Agent por defecto de fetch/Node
// (responde 403 "error code: 1010"). Hay que mandar un UA de navegador.
// La API key vive en CLOUDFLEET_API_KEY (env del proyecto Vercel de Misiones).

const BASE_URL = "https://fleet.cloudfleet.com/api/v1"
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

export interface CloudfleetChecklist {
  number: number
  checklistDate: string // ISO UTC (Z)
  type?: { name?: string } | null
  status?: { name?: string } | null
  vehicle?: { id?: number; code?: string } | null
  costCenter?: { name?: string } | null
  statistics?: {
    qtyVariablesApproved?: number
    qtyVariablesRejected?: number
    qtyVariablesCritical?: number
    qtyTotalVariables?: number
  } | null
}

function apiKey(): string {
  const key = process.env.CLOUDFLEET_API_KEY
  if (!key) throw new Error("CLOUDFLEET_API_KEY no está configurada")
  return key
}

/**
 * Lista todos los checklists en [desde, hasta] (YYYY-MM-DD, filtro por
 * checklistDate). Pagina de a 50 (page=N) hasta agotar.
 */
export async function fetchChecklists(
  desde: string,
  hasta: string,
): Promise<CloudfleetChecklist[]> {
  const key = apiKey()
  const out: CloudfleetChecklist[] = []
  for (let page = 1; page <= 200; page++) {
    const url =
      `${BASE_URL}/checklist/?checklistDateFrom=${desde}` +
      `&checklistDateTo=${hasta}&page=${page}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Cloudfleet checklist ${res.status}: ${body.slice(0, 200)}`)
    }
    const chunk = (await res.json()) as CloudfleetChecklist[]
    if (!Array.isArray(chunk) || chunk.length === 0) break
    out.push(...chunk)
    if (chunk.length < 50) break
  }
  return out
}
