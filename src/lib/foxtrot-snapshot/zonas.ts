import { createClient } from "@/lib/supabase/server"
import type { ZonasConfig } from "./types"

const ZONAS_CACHE_TTL = 60_000

let cached: { ts: number; data: ZonasConfig } | null = null

const DEFAULT_ZONAS: ZonasConfig = {
  Norte: {
    color: "#ef4444",
    coords: [
      [-25.4, -54.68],
      [-25.45, -54.22],
      [-25.82, -54.22],
      [-25.88, -54.68],
    ],
  },
  Central: {
    color: "#f59e0b",
    coords: [
      [-25.88, -54.68],
      [-25.95, -54.4],
      [-26.75, -54.42],
      [-26.78, -54.9],
    ],
  },
  Este: {
    color: "#2dd4bf",
    coords: [
      [-25.4, -54.22],
      [-25.4, -53.62],
      [-27.45, -53.78],
      [-27.45, -54.4],
      [-25.95, -54.4],
    ],
  },
}

export async function loadZonas(): Promise<ZonasConfig> {
  const now = Date.now()
  if (cached && now - cached.ts < ZONAS_CACHE_TTL) return cached.data
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("foxtrot_zonas")
      .select("zonas")
      .eq("id", 1)
      .maybeSingle()
    const zonas = (data?.zonas as ZonasConfig | null) ?? DEFAULT_ZONAS
    cached = { ts: now, data: zonas }
    return zonas
  } catch {
    return DEFAULT_ZONAS
  }
}

export function invalidateZonasCache() {
  cached = null
}

export function pointInPoly(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false
  const n = poly.length
  let j = n - 1
  for (let i = 0; i < n; i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside
    }
    j = i
  }
  return inside
}

export function zoneOfEldorado(lat: number, lng: number, zonas: ZonasConfig): string | null {
  for (const name of ["Central", "Este"]) {
    const z = zonas[name]
    if (z && pointInPoly(lat, lng, z.coords)) return name
  }
  return null
}

export { DEFAULT_ZONAS }
