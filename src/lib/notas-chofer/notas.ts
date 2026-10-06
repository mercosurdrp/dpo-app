// Mensajes del cliente al chofer.
//
// El cliente lo deja en «Mi próxima entrega» (mercosur-atiende /mi-entrega,
// después de validar los últimos 4 del CUIT) y llega acá por
// POST /api/notas-chofer. Se busca en Foxtrot la parada de HOY del cliente
// (ruta + chofer), se guarda en `notas_chofer` y se le manda por WhatsApp al
// chofer de esa ruta, con copia a los vendedores del cliente.
//
// Si la ruta todavía no arrancó, la nota queda pendiente y la manda el
// cron-alertas (cada 10 min) cuando el chofer la inicia en Foxtrot. Pasada
// HORA_ENVIO_SIN_INICIO se manda igual: en Pergamino las rutas casi nunca se
// inician en la app y el chofer ya salió.
//
// Mismo archivo en dpo-app (Pampeana) y dpo-distribuciones (Misiones): cada
// deploy mira sus centros de Foxtrot y su propia base.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findRoutesByDate,
  foxtrotDcIds,
  getRoute,
  getRouteWaypoints,
  listDrivers,
  type FoxtrotRouteRaw,
  type FoxtrotWaypoint,
} from "@/lib/foxtrot";
import { foxtrotCustomerToChessId } from "@/lib/foxtrot-alertas/detect";
import { promotoresPorCliente } from "@/lib/foxtrot-alertas/destinatarios";
import { sendText } from "@/lib/wa-bot/evolution";

export const MAX_NOTAS_POR_DIA = 3;
export const MAX_LARGO_NOTA = 300;
const HORA_ENVIO_SIN_INICIO = "09:00";
const PHONE_RE = /^549\d{10}$/;

const ahoraArt = () => new Date(Date.now() - 3 * 3600_000);
export const fechaHoyArt = () => ahoraArt().toISOString().slice(0, 10);
const horaArt = () => ahoraArt().toISOString().slice(11, 16);

export interface NotaChofer {
  id: string;
  fecha: string;
  dc: string;
  route_id: string;
  route_nombre: string | null;
  driver_id: string | null;
  driver_nombre: string | null;
  id_cliente: string;
  cliente_nombre: string | null;
  cliente_localidad: string | null;
  paradas_antes: number | null;
  mensaje: string;
  contacto: string | null;
  estado: "pendiente" | "enviada" | "sin_telefono" | "error";
  envio_detalle: {
    destinatario: string;
    phone: string;
    ok: boolean;
    status?: number;
    error?: string;
  }[];
  enviada_at: string | null;
  created_at: string;
}

export type ResultadoNota =
  | { ok: true; estado: NotaChofer["estado"]; chofer: string | null }
  | {
      ok: false;
      motivo: "limite" | "sin_reparto" | "ya_entregado" | "invalido" | "error";
      error: string;
    };

/** Saca links y espacios de más: el mensaje lo lee un chofer, no tiene que traer nada clickeable. */
export function limpiarMensaje(texto: string): string {
  return texto
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LARGO_NOTA);
}

// "PEREZ GUSTAVO" → "Gustavo" (Foxtrot guarda APELLIDO NOMBRE).
function nombreDePila(completo: string | null | undefined) {
  const w = (completo ?? "").trim().split(/\s+/).filter(Boolean);
  const n = w.length > 1 ? w[1] : w[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : null;
}

/** Parada de hoy del cliente en Foxtrot. Si aparece dos veces (dos vueltas), la pendiente. */
async function ubicarCliente(idCliente: string): Promise<{
  dc: string;
  route: FoxtrotRouteRaw;
  waypoint: FoxtrotWaypoint;
} | null> {
  const hoy = fechaHoyArt();
  const porDc = await Promise.all(
    foxtrotDcIds().map(async (dc) => {
      const rs = await findRoutesByDate(dc, hoy);
      if ("error" in rs) return [];
      const hits = await Promise.all(
        rs.data.map(async (route) => {
          const w = await getRouteWaypoints(dc, route.id);
          if ("error" in w) return [];
          return w.data
            .filter(
              (x) => foxtrotCustomerToChessId(x.customer_id) === idCliente,
            )
            .map((waypoint) => ({ dc, route, waypoint }));
        }),
      );
      return hits.flat();
    }),
  );
  const todas = porDc.flat();
  return (
    todas.find(
      (h) => h.waypoint.status === "PENDING" && !h.route.finalized_timestamp,
    ) ??
    todas.find((h) => h.waypoint.status === "PENDING") ??
    todas[0] ??
    null
  );
}

/** Guarda la nota y, si la ruta ya salió, la manda en el momento. */
export async function recibirNota(
  supabase: SupabaseClient,
  input: { idCliente: string; mensaje: string; contacto: string | null },
): Promise<ResultadoNota> {
  const mensaje = limpiarMensaje(input.mensaje);
  if (mensaje.length < 3)
    return {
      ok: false,
      motivo: "invalido",
      error: "Escribí el mensaje para el chofer.",
    };
  const contacto =
    (input.contacto ?? "").replace(/\D/g, "").slice(0, 15) || null;
  const hoy = fechaHoyArt();

  const { count } = await supabase
    .from("notas_chofer")
    .select("id", { count: "exact", head: true })
    .eq("fecha", hoy)
    .eq("id_cliente", input.idCliente);
  if ((count ?? 0) >= MAX_NOTAS_POR_DIA)
    return {
      ok: false,
      motivo: "limite",
      error: `Ya dejaste ${MAX_NOTAS_POR_DIA} mensajes hoy. Si es urgente, llamá a tu vendedor.`,
    };

  const hit = await ubicarCliente(input.idCliente);
  if (!hit)
    return {
      ok: false,
      motivo: "sin_reparto",
      error: "Hoy no encontramos tu pedido en un camión.",
    };
  if (hit.waypoint.status === "COMPLETED" || hit.waypoint.status === "SKIPPED")
    return {
      ok: false,
      motivo: "ya_entregado",
      error: "El chofer ya pasó por tu comercio hoy.",
    };

  const [drivers, cliente] = await Promise.all([
    listDrivers(hit.dc),
    supabase
      .from("bot_clientes_cache")
      .select("nombre_cliente, localidad")
      .eq("id_cliente", input.idCliente)
      .maybeSingle(),
  ]);
  const driverId = hit.route.assigned_driver_id ?? null;
  const driverNombre =
    driverId && !("error" in drivers)
      ? (drivers.data.find((d) => d.id === driverId)?.name ?? null)
      : null;

  const { data: nota, error } = await supabase
    .from("notas_chofer")
    .insert({
      fecha: hoy,
      dc: hit.dc,
      route_id: hit.route.id,
      route_nombre: hit.route.name ?? null,
      driver_id: driverId,
      driver_nombre: driverNombre,
      id_cliente: input.idCliente,
      cliente_nombre: cliente.data?.nombre_cliente ?? null,
      cliente_localidad: cliente.data?.localidad ?? null,
      paradas_antes: hit.waypoint.waypoints_ahead ?? null,
      mensaje,
      contacto,
    })
    .select("*")
    .single();
  if (error || !nota) {
    console.error(`[notas-chofer] insert: ${error?.message}`);
    return {
      ok: false,
      motivo: "error",
      error: "No pudimos guardar el mensaje. Probá en un rato.",
    };
  }

  const estado = await procesarNota(supabase, nota as NotaChofer, hit.route);
  return { ok: true, estado, chofer: nombreDePila(driverNombre) };
}

function textoChofer(n: NotaChofer) {
  const cliente = n.cliente_nombre
    ? `*${n.cliente_nombre}* (cod. ${n.id_cliente})`
    : `Cliente cod. ${n.id_cliente}`;
  return [
    "📝 *MENSAJE DE UN CLIENTE*",
    `🏪 ${cliente}${n.cliente_localidad ? ` — ${n.cliente_localidad}` : ""}`,
    `💬 «${n.mensaje}»`,
    n.contacto ? `📞 Contacto: ${n.contacto}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function textoVendedor(n: NotaChofer) {
  const cliente = n.cliente_nombre
    ? `*${n.cliente_nombre}* (cod. ${n.id_cliente})`
    : `cod. ${n.id_cliente}`;
  const chofer = nombreDePila(n.driver_nombre);
  return [
    `📝 Tu cliente ${cliente} le dejó un mensaje al chofer${chofer ? ` (${chofer})` : ""}:`,
    `💬 «${n.mensaje}»`,
    n.contacto ? `📞 Contacto: ${n.contacto}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Manda la nota si corresponde (ruta iniciada o ya pasó la hora límite) y
 * deja el estado en la base. Devuelve el estado final.
 */
export async function procesarNota(
  supabase: SupabaseClient,
  nota: NotaChofer,
  ruta?: FoxtrotRouteRaw,
): Promise<NotaChofer["estado"]> {
  let route = ruta;
  if (!route) {
    const r = await getRoute(nota.dc, nota.route_id);
    if (!("error" in r)) route = r.data;
  }
  const salio = !!route?.started_timestamp;
  if (!salio && horaArt() < HORA_ENVIO_SIN_INICIO) return "pendiente";

  // La ruta pudo cambiar de chofer desde que se dejó la nota.
  const driverId = route?.assigned_driver_id ?? nota.driver_id;
  const detalle: NotaChofer["envio_detalle"] = [];

  const { data: chofer } = driverId
    ? await supabase
        .from("bot_choferes_wa")
        .select("phone_number, activo")
        .eq("dc", nota.dc)
        .eq("foxtrot_driver_id", driverId)
        .maybeSingle()
    : { data: null };
  const phoneChofer =
    chofer?.activo && PHONE_RE.test(chofer.phone_number)
      ? chofer.phone_number
      : null;

  const enviar = async (destinatario: string, phone: string, texto: string) => {
    try {
      const s = await sendText(phone, texto);
      detalle.push({ destinatario, phone, ok: s.ok, status: s.status });
    } catch (e) {
      detalle.push({
        destinatario,
        phone,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (phoneChofer) await enviar("chofer", phoneChofer, textoChofer(nota));

  // Copia a los vendedores del cliente (preventista + repositor), sin repetir número.
  const ids =
    (await promotoresPorCliente(nota.fecha)).get(nota.id_cliente) ?? [];
  if (ids.length) {
    const { data: vendedores } = await supabase
      .from("bot_vendedores_wa")
      .select("phone_number, activo")
      .in("id_promotor", ids);
    const phones = new Set(
      (vendedores ?? [])
        .filter(
          (v) =>
            v.activo &&
            PHONE_RE.test(v.phone_number) &&
            v.phone_number !== phoneChofer,
        )
        .map((v) => v.phone_number as string),
    );
    for (const phone of phones)
      await enviar("vendedor", phone, textoVendedor(nota));
  }

  const estado: NotaChofer["estado"] = !phoneChofer
    ? "sin_telefono"
    : detalle.some((d) => d.destinatario === "chofer" && d.ok)
      ? "enviada"
      : "error";
  await supabase
    .from("notas_chofer")
    .update({
      estado,
      envio_detalle: detalle,
      enviada_at: new Date().toISOString(),
      driver_id: driverId,
    })
    .eq("id", nota.id);
  return estado;
}

/** Para el cron-alertas: manda las notas de hoy que esperaban que saliera la ruta. */
export async function enviarNotasPendientes(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("notas_chofer")
    .select("*")
    .eq("fecha", fechaHoyArt())
    .eq("estado", "pendiente");
  let enviadas = 0;
  for (const n of (data ?? []) as NotaChofer[]) {
    const estado = await procesarNota(supabase, n);
    if (estado !== "pendiente") enviadas++;
  }
  return { pendientes: data?.length ?? 0, enviadas };
}

/** ¿Este número es de un chofer? (para el webhook: le contesta «Recibido»). */
export async function esChofer(supabase: SupabaseClient, phone: string) {
  const { data } = await supabase
    .from("bot_choferes_wa")
    .select("nombre")
    .eq("phone_number", phone)
    .limit(1)
    .maybeSingle();
  return data ? { nombre: data.nombre as string } : null;
}
