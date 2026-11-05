/**
 * Aviso de las 15:00 del Radar de Rechazos por WhatsApp, el DÍA QUE SE CARGA EL
 * PEDIDO, para la entrega a 2 días de reparto (Fausto 5/11/2026: el aviso al
 * promotor tiene que salir junto con la vespertina de los supervisores, que ya
 * trabaja esos clientes, y no un día después con el pedido emitido y ruteado.
 * Antes: 27/10 a las 07:00 del día de entrega; 27/10 tarde, 15:00 del día
 * anterior). Ejemplo: el jueves avisa por la entrega del sábado.
 *
 * Primero REARMA la foto de esa entrega desde Chess (la de las 09:30 no tiene
 * los pedidos que entraron durante el día) y la guarda, así la pantalla del
 * radar y el WhatsApp muestran lo mismo. Se queda con los clientes CRÍTICOS
 * (criterio único de `criterio.ts`) y le manda:
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
 *   ?fecha=YYYY-MM-DD  entrega a avisar (default: 2 días de reparto vista)
 *   ?sin_rearmar=1  usa la foto guardada tal cual, sin volver a Chess
 *   ?solo=549...    manda TODO a ese número (prueba), sin registrar
 * Domingos y feriados no corre (no se cargan pedidos). El viernes avisa por el
 * lunes y el sábado por el martes, igual que la foto del radar.
 */
import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import { esPersonalExcluido, promotoresPorCliente } from "@/lib/foxtrot-alertas/destinatarios"
import type { VendedorWa } from "@/lib/foxtrot-alertas/types"
import { buildRadarRechazos, fechaObjetivoART, hayReparto, hoyART } from "@/lib/radar-rechazos/build"
import { persistRadarSnapshot } from "@/lib/radar-rechazos/persist"
import { detallePedidos, type DetallePedido } from "@/lib/radar-rechazos/pedido-cliente"
import {
  RESUMEN_TOTAL_RADAR,
  mensajeCliente,
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
  /** Mensajes aparte, uno por cliente, para copiar y reenviar. */
  extras?: string[]
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
  const sinRearmar = url.searchParams.get("sin_rearmar") === "1"
  if (solo && !PHONE_RE.test(solo)) {
    return NextResponse.json({ error: "?solo= tiene que ser un número 549..." }, { status: 400 })
  }

  const hoy = hoyART()
  if (!qFecha && !hayReparto(hoy)) {
    return NextResponse.json({ success: true, skipped: "hoy-sin-reparto", hoy })
  }
  const fecha = qFecha && FECHA_RE.test(qFecha) ? qFecha : fechaObjetivoART(hoy)

  try {
    const supabase = createAdminClient()
    const creds = {
      baseUrl: (process.env.CHESS_API_BASE_URL ?? "").trim(),
      user: (process.env.CHESS_API_USER ?? "").trim(),
      pass: (process.env.CHESS_API_PASS ?? "").trim(),
    }

    // ---- Foto actualizada con los pedidos cargados hasta ahora ----
    // La del cron de las 09:30 se arma antes de que entre la preventa del día.
    // En ?dry=1 se arma pero no se guarda. Si Chess falla se sigue con la foto
    // guardada: es mejor avisar con la de la mañana que no avisar.
    let rearmada: { clientes: number; guardada: boolean } | string = "no"
    if (!sinRearmar && creds.baseUrl && creds.user && creds.pass) {
      try {
        const snap = await buildRadarRechazos(supabase, creds, fecha)
        if (!dry) await persistRadarSnapshot(supabase, snap)
        rearmada = { clientes: snap.clientes.length, guardada: !dry }
      } catch (err) {
        rearmada = `error: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[radar-wa] rearmar foto ${fecha}: ${rearmada}`)
      }
    }

    // ---- Foto + críticos ----
    const { data: filas, error: fErr } = await supabase
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, id_promotor, nombre_promotor, bultos_pedido, monto_pedido, cerrado_mes, sin_dinero_mes, cerrado_anio, sin_dinero_anio",
      )
      .eq("fecha_entrega", fecha)
    if (fErr) throw new Error(`leer foto: ${fErr.message}`)
    if (!filas?.length) {
      return NextResponse.json({ success: true, fecha, rearmada, skipped: "sin-foto" })
    }
    const criticos = soloCriticos(filas as Omit<ClienteCritico, "criticidad">[])

    // ---- Detalle del pedido (productos + total estimado) ----
    // Si Chess falla, los avisos salen igual, sin el mensaje para el cliente.
    let detalles = new Map<number, DetallePedido>()
    if (criticos.length && creds.baseUrl && creds.user && creds.pass) {
      try {
        detalles = await detallePedidos(
          creds,
          fecha,
          criticos.flatMap((c) => (c.id_cliente != null ? [Number(c.id_cliente)] : [])),
        )
      } catch (err) {
        console.error(`[radar-wa] detalle pedidos: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // Total aproximado con impuestos (el pedido todavía no está facturado). La
    // foto ya lo trae; el detalle lo recalcula con el pedido recién leído.
    for (const c of criticos) {
      const det = c.id_cliente != null ? detalles.get(Number(c.id_cliente)) : undefined
      if (det?.total) c.monto_pedido = det.total
    }

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
      const extras = clientes.flatMap((c) => {
        const det = c.id_cliente != null ? detalles.get(Number(c.id_cliente)) : undefined
        return det ? [mensajeCliente(c, det, fecha)] : []
      })
      envios.push({
        destinatario: "vendedor",
        id_promotor: id,
        nombre: v.nombre,
        phone: phoneDe(v)!,
        clientes: clientes.length,
        texto: mensajeVendedor(v.nombre, clientes, fecha, hoy, extras.length > 0),
        extras,
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
    // Jefe de ventas + Fausto: todos los vendedores juntos. Se registra como
    // "supervisor" (el check de radar_rechazos_envios solo admite
    // vendedor | supervisor); la idempotencia es por teléfono igual.
    if (criticos.length) {
      const todos: GrupoVendedor[] = [...porVendedor]
        .map(([id, clientes]) => ({ nombre: porId.get(id)!.nombre ?? id, clientes }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
      if (sinVendedor.length) {
        todos.push({ nombre: "Sin vendedor con WhatsApp cargado", clientes: sinVendedor })
      }
      for (const j of RESUMEN_TOTAL_RADAR) {
        if (envios.some((e) => e.phone === j.phone)) continue
        envios.push({
          destinatario: "supervisor",
          id_promotor: "resumen_total",
          nombre: j.nombre,
          phone: j.phone,
          clientes: criticos.length,
          texto: mensajeSupervisor(j.nombre, todos, fecha, hoy, "todos"),
        })
      }
    }

    const resumen = {
      success: true,
      fecha,
      hoy,
      rearmada,
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
        // Un mensaje aparte por cliente: así se copia entero con un toque.
        for (const extra of ok ? e.extras ?? [] : []) {
          const rx = await sendText(solo ?? e.phone, extra)
          if (!rx.ok) error = `extra: ${JSON.stringify(rx.body).slice(0, 400)}`
        }
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
