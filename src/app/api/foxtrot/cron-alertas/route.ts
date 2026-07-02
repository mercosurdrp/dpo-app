/**
 * Cron de alertas WhatsApp de rechazos en reparto (Foxtrot).
 *
 * Corre cada 5 min en ventana de reparto (vercel.json). Cada corrida:
 *   1. Detecta los rechazos del día en Foxtrot (detectDia, fetch liviano).
 *   2. Persiste los nuevos en `foxtrot_alertas_rechazo` (dedup por clave única).
 *   3. Resuelve cliente → promotor (`bot_clientes_cache`) → teléfonos
 *      (`bot_vendedores_wa`) y envía el WhatsApp vía Evolution (sendText)
 *      al promotor y a su supervisor.
 *   4. Re-evalúa el outcome automático de alertas abiertas: recuperado el
 *      mismo día / próxima entrega OK / reincidió / sin nueva entrega.
 *
 * Config runtime en `foxtrot_alertas_config` (single-row): dry_run,
 * envios_activos, ventana horaria ART. Deploy seguro: arranca en dry-run
 * con envíos apagados.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) o header x-api-key=CRON_SECRET
 * (disparo externo, ej. n8n). Query: ?dry_run=1 fuerza simulación,
 * ?fecha=YYYY-MM-DD reprocesa un día puntual.
 * Solo Pampeana (no-op en Misiones).
 */
import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { foxtrotDcIds } from "@/lib/foxtrot"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import {
  detectDia,
  foxtrotCustomerToChessId,
  type RechazoDetectado,
} from "@/lib/foxtrot-alertas/detect"
import {
  formatAlertaPromotor,
  formatAlertaSupervisor,
  type AlertaParaMensaje,
} from "@/lib/foxtrot-alertas/mensaje"
import type { EnvioDetalle, VendedorWa } from "@/lib/foxtrot-alertas/types"

export const maxDuration = 300
export const dynamic = "force-dynamic"

const CRON_SECRET = process.env.CRON_SECRET
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const PHONE_RE = /^\d{8,15}$/

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

function fechaHoyArt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function horaArt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 19)
}

function fechaMenosDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

function horaArtDeMs(tsMs: number): string {
  const d = new Date(tsMs - 3 * 3600_000)
  return d.toISOString().slice(11, 16)
}

function phoneValido(v: VendedorWa | null | undefined): string | null {
  if (!v || !v.activo || !v.recibe_alertas_rechazo) return null
  return PHONE_RE.test(v.phone_number) ? v.phone_number : null
}

async function handle(request: NextRequest) {
  const startedAt = Date.now()

  const authHeader = request.headers.get("authorization") ?? ""
  const apiKey = request.headers.get("x-api-key") ?? ""
  const isAuthorized =
    !!CRON_SECRET && (authHeader === `Bearer ${CRON_SECRET}` || apiKey === CRON_SECRET)
  if (!isAuthorized) {
    return NextResponse.json({ error: "CRON_SECRET inválido o faltante" }, { status: 401 })
  }

  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "solo Pampeana" })
  }

  const url = new URL(request.url)
  const qFecha = url.searchParams.get("fecha")
  const fecha = qFecha && FECHA_RE.test(qFecha) ? qFecha : fechaHoyArt()
  const hoy = fechaHoyArt()

  try {
    const supabase = createAdminClient()

    // ---- Config ----
    const { data: config } = await supabase
      .from("foxtrot_alertas_config")
      .select("*")
      .eq("id", 1)
      .single()
    const enviosActivos = config?.envios_activos ?? false
    const evolutionConfigurado =
      !!process.env.EVOLUTION_BASE_URL &&
      !!process.env.EVOLUTION_INSTANCE &&
      !!process.env.EVOLUTION_API_KEY
    const dryRun =
      (config?.dry_run ?? true) ||
      url.searchParams.get("dry_run") === "1" ||
      !evolutionConfigurado
    const maxIntentos = config?.max_intentos_envio ?? 3
    const diasSeguimiento = config?.dias_seguimiento_outcome ?? 14
    const ventanaDesde: string = config?.ventana_desde ?? "07:00:00"
    const ventanaHasta: string = config?.ventana_hasta ?? "18:30:00"
    const ahoraArt = horaArt()
    const dentroVentana = ahoraArt >= ventanaDesde && ahoraArt <= ventanaHasta

    // ---- 1. Detección ----
    const dcs = foxtrotDcIds()
    const { rechazos, entregasOk } = await detectDia(dcs, fecha)

    // ---- 2. Resolución de destinatarios + upsert ----
    const { data: equipoRaw } = await supabase.from("bot_vendedores_wa").select("*")
    const equipo = (equipoRaw ?? []) as VendedorWa[]
    const porPromotor = new Map(equipo.map((v) => [v.id_promotor, v]))

    const idsClientes = Array.from(
      new Set(
        rechazos
          .map((r) => foxtrotCustomerToChessId(r.cliente_id_foxtrot))
          .filter((x): x is string => !!x),
      ),
    )
    const clientesCache = new Map<
      string,
      { nombre_cliente: string | null; telefono: string | null; localidad: string | null; id_promotor: string | null }
    >()
    if (idsClientes.length > 0) {
      const { data: clientes } = await supabase
        .from("bot_clientes_cache")
        .select("id_cliente, nombre_cliente, telefono, localidad, id_promotor")
        .in("id_cliente", idsClientes)
      for (const c of clientes ?? []) clientesCache.set(c.id_cliente, c)
    }

    const rows = rechazos.map((r) => {
      const idCliente = foxtrotCustomerToChessId(r.cliente_id_foxtrot)
      const cache = idCliente ? clientesCache.get(idCliente) : undefined
      // "0" en el cache = promotor sin resolver (cliente sin ruta asignada)
      const idPromotorCache =
        cache?.id_promotor && cache.id_promotor !== "0" ? cache.id_promotor : null
      const promotor = idPromotorCache ? porPromotor.get(idPromotorCache) : undefined
      const supervisor = promotor?.supervisor_id
        ? porPromotor.get(promotor.supervisor_id)
        : undefined
      return {
        dedup_key: `${r.dc}|${r.fecha}|${r.cliente_id_foxtrot ?? "sin-cliente"}|${r.waypoint_id}`,
        dc: r.dc,
        fecha: r.fecha,
        route_id: r.route_id,
        waypoint_id: r.waypoint_id,
        cliente_id_foxtrot: r.cliente_id_foxtrot,
        id_cliente: idCliente,
        cliente_nombre: cache?.nombre_cliente ?? null,
        cliente_telefono: cache?.telefono ?? null,
        cliente_localidad: cache?.localidad ?? null,
        chofer_nombre: r.chofer_nombre,
        ruta: r.ruta,
        motivos: r.motivos,
        bultos: r.bultos,
        parcial: r.parcial,
        items: r.items,
        rechazo_ts: r.rechazo_ts_ms ? new Date(r.rechazo_ts_ms).toISOString() : null,
        id_promotor: promotor?.id_promotor ?? idPromotorCache,
        promotor_nombre: promotor?.nombre ?? null,
        promotor_phone: phoneValido(promotor),
        supervisor_id: supervisor?.id_promotor ?? null,
        supervisor_nombre: supervisor?.nombre ?? null,
        supervisor_phone: phoneValido(supervisor),
      }
    })

    let nuevas = 0
    if (rows.length > 0) {
      const { data: insertadas, error: upsertError } = await supabase
        .from("foxtrot_alertas_rechazo")
        .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true })
        .select("id")
      if (upsertError) throw new Error(`upsert alertas: ${upsertError.message}`)
      nuevas = insertadas?.length ?? 0
    }

    // ---- 3. Envíos (solo del día operativo actual) ----
    let enviadas = 0
    let errores = 0
    let simuladas = 0
    const textosDryRun: { cliente: string | null; texto: string }[] = []

    // Alertas viejas que quedaron pendientes (fuera de ventana / envíos
    // apagados en su momento): se cierran para no mandar avisos viejos.
    await supabase
      .from("foxtrot_alertas_rechazo")
      .update({ estado_envio: "desactivada" })
      .lt("fecha", hoy)
      .in("estado_envio", ["pendiente", "error"])

    if (fecha === hoy) {
      const { data: pendientes } = await supabase
        .from("foxtrot_alertas_rechazo")
        .select("*")
        .eq("fecha", fecha)
        .in("estado_envio", ["pendiente", "error"])
        .lt("intentos_envio", maxIntentos)

      for (const a of pendientes ?? []) {
        const msg: AlertaParaMensaje = {
          cliente_nombre: a.cliente_nombre,
          id_cliente: a.id_cliente,
          cliente_telefono: a.cliente_telefono,
          cliente_localidad: a.cliente_localidad,
          chofer_nombre: a.chofer_nombre,
          ruta: a.ruta,
          motivos: a.motivos ?? [],
          bultos: Number(a.bultos) || 0,
          parcial: !!a.parcial,
          items: a.items ?? [],
          rechazo_ts_ms: a.rechazo_ts ? new Date(a.rechazo_ts).getTime() : 0,
          promotor_nombre: a.promotor_nombre,
        }
        const destinos: { destinatario: "promotor" | "supervisor"; phone: string | null; texto: string }[] = [
          { destinatario: "promotor", phone: a.promotor_phone, texto: formatAlertaPromotor(msg) },
          { destinatario: "supervisor", phone: a.supervisor_phone, texto: formatAlertaSupervisor(msg) },
        ]
        const conPhone = destinos.filter((d) => d.phone)

        if (dryRun) {
          const detalle: EnvioDetalle[] = destinos.map((d) => ({
            destinatario: d.destinatario,
            phone: d.phone,
            ok: !!d.phone,
            status: null,
            ts: new Date().toISOString(),
            texto: d.texto,
          }))
          await supabase
            .from("foxtrot_alertas_rechazo")
            .update({ estado_envio: "dry_run", envio_detalle: detalle })
            .eq("id", a.id)
          simuladas++
          textosDryRun.push({ cliente: a.cliente_nombre ?? a.id_cliente, texto: destinos[0].texto })
          continue
        }
        if (!enviosActivos) continue // quedan pendientes hasta prender envíos
        if (!dentroVentana) continue // se envían en la próxima corrida dentro de ventana
        if (conPhone.length === 0) {
          await supabase
            .from("foxtrot_alertas_rechazo")
            .update({ estado_envio: "sin_telefono" })
            .eq("id", a.id)
          continue
        }

        const detalle: EnvioDetalle[] = []
        let oks = 0
        for (const d of conPhone) {
          try {
            const res = await sendText(d.phone!, d.texto)
            detalle.push({
              destinatario: d.destinatario,
              phone: d.phone,
              ok: res.ok,
              status: res.status,
              ts: new Date().toISOString(),
              ...(res.ok ? {} : { error: JSON.stringify(res.body).slice(0, 300) }),
            })
            if (res.ok) oks++
          } catch (err) {
            detalle.push({
              destinatario: d.destinatario,
              phone: d.phone,
              ok: false,
              status: null,
              ts: new Date().toISOString(),
              error: err instanceof Error ? err.message : "error de envío",
            })
          }
        }
        const estado =
          oks === conPhone.length ? "enviada" : oks > 0 ? "parcial" : "error"
        await supabase
          .from("foxtrot_alertas_rechazo")
          .update({
            estado_envio: estado,
            envio_detalle: detalle,
            intentos_envio: (a.intentos_envio ?? 0) + 1,
            ...(oks > 0 ? { enviada_at: new Date().toISOString() } : {}),
          })
          .eq("id", a.id)
        if (estado === "error") errores++
        else enviadas++
      }
    }

    // ---- 4. Outcomes automáticos ----
    let outcomes = 0
    const okPorCliente = new Map<string, { ts_ms: number; ruta: string }>()
    for (const e of entregasOk) {
      const prev = okPorCliente.get(e.cliente_id_foxtrot)
      if (!prev || e.ts_ms > prev.ts_ms) {
        okPorCliente.set(e.cliente_id_foxtrot, { ts_ms: e.ts_ms, ruta: e.ruta })
      }
    }
    const rechazoClientesHoy = new Set(
      rechazos.map((r) => r.cliente_id_foxtrot).filter(Boolean) as string[],
    )

    // (a) Recuperado el mismo día: entrega OK del cliente posterior al rechazo.
    const { data: abiertasHoy } = await supabase
      .from("foxtrot_alertas_rechazo")
      .select("id, cliente_id_foxtrot, rechazo_ts")
      .eq("fecha", fecha)
      .eq("outcome", "pendiente")
    for (const a of abiertasHoy ?? []) {
      if (!a.cliente_id_foxtrot) continue
      const ok = okPorCliente.get(a.cliente_id_foxtrot)
      const rechazoMs = a.rechazo_ts ? new Date(a.rechazo_ts).getTime() : 0
      if (ok && ok.ts_ms > rechazoMs) {
        await supabase
          .from("foxtrot_alertas_rechazo")
          .update({
            outcome: "recuperado_mismo_dia",
            outcome_at: new Date().toISOString(),
            outcome_detalle: `Entrega OK ${horaArtDeMs(ok.ts_ms)} hs (ruta ${ok.ruta})`,
            proxima_entrega_fecha: fecha,
          })
          .eq("id", a.id)
          .eq("outcome", "pendiente")
        outcomes++
      }
    }

    // (b) Días anteriores: el cliente apareció hoy → reincidió o entrega OK.
    if (fecha === hoy) {
      const { data: abiertasPrevias } = await supabase
        .from("foxtrot_alertas_rechazo")
        .select("id, cliente_id_foxtrot")
        .eq("outcome", "pendiente")
        .gte("fecha", fechaMenosDias(hoy, diasSeguimiento))
        .lt("fecha", hoy)
      for (const a of abiertasPrevias ?? []) {
        if (!a.cliente_id_foxtrot) continue
        if (rechazoClientesHoy.has(a.cliente_id_foxtrot)) {
          await supabase
            .from("foxtrot_alertas_rechazo")
            .update({
              outcome: "reincidio",
              outcome_at: new Date().toISOString(),
              outcome_detalle: `Nuevo rechazo el ${hoy}`,
              proxima_entrega_fecha: hoy,
            })
            .eq("id", a.id)
            .eq("outcome", "pendiente")
          outcomes++
        } else if (okPorCliente.has(a.cliente_id_foxtrot)) {
          await supabase
            .from("foxtrot_alertas_rechazo")
            .update({
              outcome: "proxima_entrega_ok",
              outcome_at: new Date().toISOString(),
              outcome_detalle: `Entrega OK el ${hoy}`,
              proxima_entrega_fecha: hoy,
            })
            .eq("id", a.id)
            .eq("outcome", "pendiente")
          outcomes++
        }
      }

      // (c) Vencimiento: sin nueva entrega dentro de la ventana de seguimiento.
      const { count: vencidas } = await supabase
        .from("foxtrot_alertas_rechazo")
        .update(
          {
            outcome: "sin_nueva_entrega",
            outcome_at: new Date().toISOString(),
            outcome_detalle: `Sin nueva entrega en ${diasSeguimiento} días`,
          },
          { count: "exact" },
        )
        .eq("outcome", "pendiente")
        .lt("fecha", fechaMenosDias(hoy, diasSeguimiento))
      outcomes += vencidas ?? 0
    }

    const durationMs = Date.now() - startedAt
    console.log(
      `[foxtrot-cron-alertas] fecha=${fecha} detectados=${rechazos.length} nuevas=${nuevas} ` +
        `enviadas=${enviadas} simuladas=${simuladas} errores=${errores} outcomes=${outcomes} ` +
        `dry_run=${dryRun} envios_activos=${enviosActivos} ventana=${dentroVentana} duration_ms=${durationMs}`,
    )

    return NextResponse.json({
      success: true,
      fecha,
      detectados: rechazos.length,
      nuevas,
      enviadas,
      simuladas,
      errores,
      outcomes,
      dry_run: dryRun,
      envios_activos: enviosActivos,
      dentro_ventana: dentroVentana,
      evolution_configurado: evolutionConfigurado,
      ...(dryRun && textosDryRun.length > 0 ? { preview: textosDryRun.slice(0, 5) } : {}),
      duration_ms: durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en cron de alertas"
    console.error(`[foxtrot-cron-alertas] error: ${message}`)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
