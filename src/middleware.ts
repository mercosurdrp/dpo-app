import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/seguridad", "/linea-etica"]

// Cuánto antes del vencimiento del access token vale la pena refrescar.
// Debajo de este margen se hace el round-trip a Supabase; por encima, no.
const MARGEN_REFRESH_S = 120

// El middleware de Vercel se corta a los 25s (MIDDLEWARE_INVOCATION_TIMEOUT).
// Cortamos muy por debajo: si Auth no contesta en 3s, seguimos sin refrescar
// en vez de arrastrar la request hasta el límite de la plataforma.
const TIMEOUT_AUTH_MS = 3000

/**
 * Lee el vencimiento del access token directamente de la cookie, sin tocar la
 * red. `@supabase/ssr` guarda la sesión en `sb-<ref>-auth-token`, partida en
 * chunks `.0`, `.1`, ... cuando no entra en una cookie, y con prefijo
 * `base64-` cuando está codificada.
 *
 * Devuelve `null` si no hay cookie de sesión (nadie logueado) y `undefined` si
 * hay cookie pero no se pudo interpretar — dos casos que se resuelven distinto.
 */
function vencimientoDeCookie(request: NextRequest): number | null | undefined {
  const chunks = request.cookies
    .getAll()
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))

  if (chunks.length === 0) return null

  try {
    // Los chunks se concatenan en orden numérico; el que no tiene sufijo va primero.
    const orden = (nombre: string) => {
      const m = nombre.match(/\.(\d+)$/)
      return m ? Number(m[1]) : -1
    }
    let raw = chunks
      .sort((a, b) => orden(a.name) - orden(b.name))
      .map((c) => c.value)
      .join("")

    if (raw.startsWith("base64-")) {
      const bin = atob(raw.slice("base64-".length))
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
      raw = new TextDecoder().decode(bytes)
    }

    const expiresAt = JSON.parse(raw)?.expires_at
    return typeof expiresAt === "number" ? expiresAt : undefined
  } catch {
    // Cookie presente pero ilegible (formato nuevo, chunk faltante, truncada).
    return undefined
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static files, auth API, external API routes, and Vercel cron endpoints
  // (los crons validan su propio Bearer token; no deben pasar por auth de cookie)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/asistencia") ||
    pathname === "/api/rechazos/sync" ||
    pathname === "/api/gescom/rechazos-sync" ||
    pathname === "/api/reuniones/cron-crear-diarias" ||
    pathname === "/api/requisitos-legales/cron-alertas" ||
    pathname === "/api/orden-salida/cron-sync" ||
    pathname === "/api/clasificacion-envases/productividad" ||
    pathname === "/api/tv/piramide-seguridad" ||
    pathname === "/api/tv/ranking-5s" ||
    pathname === "/api/tv/reunion-logistica-ventas" ||
    pathname === "/api/tv/planes-comerciales" ||
    pathname === "/api/foxtrot/cron-sync" ||
    pathname === "/api/foxtrot/cron-alertas" ||
    pathname === "/api/cloudfleet/cron-sync" ||
    pathname === "/api/vehiculos/flota-kpi-cron" ||
    pathname === "/api/planeamiento/periodos-criticos/volumen/cron-sync" ||
    pathname === "/api/radar-rechazos/cron" ||
    pathname === "/api/radar-rechazos/feed" ||
    pathname === "/api/wa-bot/sync-clientes" ||
    pathname === "/api/wa-bot/webhook" ||
    pathname === "/api/indicadores/sync-familias"
  ) {
    return NextResponse.next()
  }

  const alLogin = () => {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(url)
  }

  // Chequeo optimista: sin cookie de sesión no hay nada que validar y no hace
  // falta preguntarle a Supabase.
  const vence = vencimientoDeCookie(request)
  if (vence === null) return alLogin()

  // Hay sesión y al access token le queda cuerda: seguimos sin tocar la red.
  // Esto cubre la enorme mayoría de las requests — el middleware corre en
  // TODAS, incluidos los prefetch de Next, y una llamada a Auth por cada una
  // era lo que saturaba el límite de 25s y disparaba refrescos concurrentes.
  // Quien valida de verdad es `requireAuth()` en el layout del dashboard.
  if (vence !== undefined && vence > Date.now() / 1000 + MARGEN_REFRESH_S) {
    return NextResponse.next({ request })
  }

  // El token está por vencer (o la cookie no se pudo leer): acá sí se refresca.
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    const { data, error } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_AUTH_MS)
      ),
    ])

    // Sólo mandamos al login cuando Supabase efectivamente dice que la sesión
    // no vale: sin error y sin usuario, o un rechazo explícito de credenciales.
    // Un 504, un ECONNRESET o el 409 de "too many concurrent token refresh"
    // son fallas transitorias — desloguear por eso echaba a gente con la
    // sesión intacta y la dejaba rebotando contra el login.
    const rechazoExplicito = error?.status === 401 || error?.status === 403
    if (rechazoExplicito || (!error && !data.user)) {
      return alLogin()
    }
  } catch {
    // Timeout nuestro: seguimos con la sesión que ya traía la request.
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
