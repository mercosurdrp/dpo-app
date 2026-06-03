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

/** El día siguiente a `fechaISO` (YYYY-MM-DD). */
function diaSiguiente(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Lista todos los checklists en [desde, hasta] (YYYY-MM-DD, filtro por
 * checklistDate). Pagina de a 50 (page=N) hasta agotar.
 *
 * 🚨 El parámetro `checklistDateTo` de Cloudfleet es EXCLUSIVO: el día indicado
 * NO se incluye (igual que el `fechahasta` de GESCOM). Para que `hasta` sea
 * inclusivo —en particular para traer el día de HOY, sin lo cual los checks no
 * aparecían hasta el cron de la madrugada siguiente (~24h de retraso)— se pide
 * el día siguiente como tope.
 */
export async function fetchChecklists(
  desde: string,
  hasta: string,
): Promise<CloudfleetChecklist[]> {
  const key = apiKey()
  const hastaExclusivo = diaSiguiente(hasta)
  const out: CloudfleetChecklist[] = []
  for (let page = 1; page <= 200; page++) {
    const url =
      `${BASE_URL}/checklist/?checklistDateFrom=${desde}` +
      `&checklistDateTo=${hastaExclusivo}&page=${page}`
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
      // 404 con "No Checklists found" = rango sin checklists (típico en días
      // sin reparto o antes de la primera liberación del día). Lista vacía,
      // no error.
      if (res.status === 404 && body.includes("No Checklists found")) break
      throw new Error(`Cloudfleet checklist ${res.status}: ${body.slice(0, 200)}`)
    }
    const chunk = (await res.json()) as CloudfleetChecklist[]
    if (!Array.isArray(chunk) || chunk.length === 0) break
    out.push(...chunk)
    if (chunk.length < 50) break
  }
  return out
}
