/**
 * Aviso de las 07:00 del Radar de Rechazos por WhatsApp.
 *
 * Toma la foto del radar del PRÓXIMO día de reparto (la armó el cron de ayer a
 * 2 días vista), se queda con los clientes CRÍTICOS (criterio único de
 * `criterio.ts`) y le manda:
 *   * a cada vendedor que atiende al cliente (preventista + repositor, desde
 *     las rutas de venta de Chess; fallback el promotor de la foto) su lista;
 *   * a cada supervisor el resumen de su equipo. Los críticos sin vendedor con
 *     WhatsApp van al resumen de TODOS los supervisores, para que no se pierdan.
 * A quien no tiene críticos ese día no le llega nada.
 *
 * Teléfonos y jerarquía: `bot_vendedores_wa` (la misma tabla del bot de
 * rechazos Foxtrot). Envíos registrados en `radar_rechazos_envios`: re-correr
 * el cron no le vuelve a escribir a quien ya lo recibió OK.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) o header x-api-key=CRON_SECRET.
 * Query:
 *   ?dry=1          arma los mensajes y los devuelve, no envía ni registra
 *   ?fecha=YYYY-MM-DD  foto a usar (default: próximo día de reparto)
 *   ?solo=549...    manda TODO a ese número (prueba), sin registrar
 * Domingos y feriados no corre: el día anterior ya avisó por el siguiente.
 */
import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import { esPersonalExcluido, promotoresPorCliente } from "@/lib/foxtrot-alertas/destinatarios"
import type { VendedorWa } from "@/lib/foxtrot-alertas/types"
import { hayReparto, hoyART, proximoDiaRepartoART } from "@/lib/radar-rechazos/build"
import {
  mensajeSupervisor,
  mensajeVendedor,
  soloCriticos,
  type ClienteCritico,
  type GrupoVendedor,
} from "@/lib/radar-rechazos/whatsapp"

export const maxDuration = 120
export const dynamic = "force-dynamic"

const CRON_SECRET = process.env.CRON_SECRET
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const PHONE_RE = /^\d{8,15}$/

interface Envio {
  destinatario: "vendedor" | "supervisor"
  id_promotor: string
  nombre: string | null
  phone: string
  clientes: number
  texto: string
}

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

const phoneDe = (v: VendedorWa | undefined): string | null =>
  v && v.activo && PHONE_RE.test(v.phone_number ?? "") ? v.phone_number : null

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? ""
  const apiKey = request.headers.get("x-api-key") ?? ""
  if (!CRON_SECRET || (authHeader !== `Bearer ${CRON_SECRET}` && apiKey !== CRON_SECRET)) {
    return NextResponse.json({ error: "CRON_SECRET inválido o faltante" }, { status: 401 })
  }
  // El radar solo existe en Pampeana.
  if (IS_MISIONES) return NextResponse.json({ success: true, skipped: "not-pampeana" })

  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "1"
  const qFecha = url.searchParams.get("fecha")
  const solo = url.searchParams.get("solo")?.trim() || null
  if (solo && !PHONE_RE.test(solo)) {
    return NextResponse.json({ error: "?solo= tiene que ser un número 549..." }, { status: 400 })
  }

  const hoy = hoyART()
  if (!qFecha && !hayReparto(hoy)) {
    return NextResponse.json({ success: true, skipped: "hoy-sin-reparto", hoy })
  }
  const fecha = qFecha && FECHA_RE.test(qFecha) ? qFecha : proximoDiaRepartoART(hoy)

  try {
    const supabase = createAdminClient()

    // ---- Foto + críticos ----
    const { data: filas, error: fErr } = await supabase
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, id_promotor, nombre_promotor, bultos_pedido, monto_pedido, cerrado_mes, sin_dinero_mes, cerrado_anio, sin_dinero_anio",
      )
      .eq("fecha_entrega", fecha)
    if (fErr) throw new Error(`leer foto: ${fErr.message}`)
    if (!filas?.length) {
      return NextResponse.json({ success: true, fecha, skipped: "sin-foto" })
    }
    const criticos = soloCriticos(filas as Omit<ClienteCritico, "criticidad">[])

    // ---- Equipo ----
    const { data: equipoRaw, error: eErr } = await supabase.from("bot_vendedores_wa").select("*")
    if (eErr) throw new Error(`leer equipo: ${eErr.message}`)
    const equipo = (equipoRaw ?? []) as VendedorWa[]
    const porId = new Map(equipo.map((v) => [v.id_promotor, v]))
    const supervisores = equipo.filter((v) => v.rol === "supervisor" && phoneDe(v))
    const rutas = criticos.length ? await promotoresPorCliente(hoy) : new Map<string, string[]>()

    // ---- Cliente → vendedores con WhatsApp ----
    const porVendedor = new Map<string, ClienteCritico[]>()
    const sinVendedor: ClienteCritico[] = []
    for (const c of criticos) {
      const ids = (c.id_cliente != null && rutas.get(String(c.id_cliente))) ||
        (c.id_promotor ? [c.id_promotor] : [])
      const conWa = [...new Set(ids)].filter(
        (id) => !esPersonalExcluido(id) && porId.get(id)?.rol === "promotor" && phoneDe(porId.get(id)),
      )
      if (!conWa.length) sinVendedor.push(c)
      for (const id of conWa) porVendedor.set(id, [...(porVendedor.get(id) ?? []), c])
    }

    const envios: Envio[] = []
    for (const [id, clientes] of porVendedor) {
      const v = porId.get(id)!
      envios.push({
        destinatario: "vendedor",
        id_promotor: id,
        nombre: v.nombre,
        phone: phoneDe(v)!,
        clientes: clientes.length,
        texto: mensajeVendedor(v.nombre, clientes, fecha, hoy),
      })
    }
    for (const s of supervisores) {
      const grupos: GrupoVendedor[] = [...porVendedor]
        .filter(([id]) => porId.get(id)?.supervisor_id === s.id_promotor)
        .map(([id, clientes]) => ({ nombre: porId.get(id)!.nombre ?? id, clientes }))
      if (sinVendedor.length) {
        grupos.push({ nombre: "Sin vendedor con WhatsApp cargado", clientes: sinVendedor })
      }
      if (!grupos.length) continue
      envios.push({
        destinatario: "supervisor",
        id_promotor: s.id_promotor,
        nombre: s.nombre,
        phone: phoneDe(s)!,
        clientes: grupos.reduce((n, g) => n + g.clientes.length, 0),
        texto: mensajeSupervisor(s.nombre, grupos, fecha, hoy),
      })
    }

    const resumen = {
      success: true,
      fecha,
      hoy,
      clientes_foto: filas.length,
      criticos: criticos.length,
      sin_vendedor: sinVendedor.map((c) => `${c.nombre_cliente} (${c.id_cliente}) promotor ${c.id_promotor}`),
    }
    if (dry) return NextResponse.json({ ...resumen, dry: true, envios })

    // ---- Envío (idempotente por fecha + teléfono) ----
    const { data: previos } = solo
      ? { data: [] as { phone: string }[] }
      : await supabase.from("radar_rechazos_envios").select("phone").eq("fecha_entrega", fecha).eq("ok", true)
    const yaEnviados = new Set((previos ?? []).map((p) => p.phone))

    const resultados = []
    for (const e of envios) {
      if (yaEnviados.has(e.phone)) {
        resultados.push({ nombre: e.nombre, destinatario: e.destinatario, ok: true, ya_enviado: true })
        continue
      }
      let ok = false
      let status: number | null = null
      let error: string | null = null
      try {
        const r = await sendText(solo ?? e.phone, e.texto)
        ok = r.ok
        status = r.status
        if (!r.ok) error = JSON.stringify(r.body).slice(0, 500)
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      if (!solo) {
        const { error: lErr } = await supabase.from("radar_rechazos_envios").upsert(
          {
            fecha_entrega: fecha,
            destinatario: e.destinatario,
            id_promotor: e.id_promotor,
            nombre: e.nombre,
            phone: e.phone,
            clientes: e.clientes,
            ok,
            status,
            error,
            created_at: new Date().toISOString(),
          },
          { onConflict: "fecha_entrega,phone" },
        )
        if (lErr) console.error(`[radar-wa] registrar envío ${e.phone}: ${lErr.message}`)
      }
      resultados.push({ nombre: e.nombre, destinatario: e.destinatario, clientes: e.clientes, ok, status, error })
    }

    console.log(
      `[radar-wa] fecha=${fecha} criticos=${criticos.length} envios=${envios.length} ` +
      `ok=${resultados.filter((r) => r.ok).length}${solo ? ` solo=${solo}` : ""}`,
    )
    return NextResponse.json({ ...resumen, solo, resultados })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en el aviso del radar"
    console.error(`[radar-wa] fatal: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
