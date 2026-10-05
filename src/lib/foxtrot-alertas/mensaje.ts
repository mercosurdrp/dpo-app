// Templates de los WhatsApp de alerta de rechazo (formato *negrita* de WA).

import type { RechazoItemAlerta } from "./types";

export interface AlertaParaMensaje {
  cliente_nombre: string | null;
  id_cliente: string | null;
  cliente_telefono: string | null;
  cliente_localidad: string | null;
  chofer_nombre: string | null;
  ruta: string | null;
  motivos: string[];
  bultos: number;
  parcial: boolean;
  items: RechazoItemAlerta[];
  rechazo_ts_ms: number;
  promotor_nombre: string | null;
}

const MAX_ITEMS = 5;

// Hora ART sin depender del TZ del server (ART = UTC-3 fijo, sin DST).
function horaArt(tsMs: number): string {
  if (!tsMs) return "s/d";
  const d = new Date(tsMs - 3 * 3600_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}

function cuerpo(a: AlertaParaMensaje): string {
  const cliente = a.cliente_nombre
    ? `*${a.cliente_nombre}*${a.id_cliente ? ` (cod. ${a.id_cliente})` : ""}`
    : `Cliente cod. ${a.id_cliente ?? "s/d"}`;
  const lineas = [
    "🚨 *RECHAZO EN REPARTO*",
    "",
    `🏪 ${cliente}${a.cliente_localidad ? ` — ${a.cliente_localidad}` : ""}`,
    `🕐 Rechazo: ${horaArt(a.rechazo_ts_ms)} hs`,
    `🚚 Chofer: ${a.chofer_nombre ?? "s/d"} · Ruta ${a.ruta ?? "s/d"}`,
    // En un parcial Foxtrot no informa cuántos bultos volvieron.
    a.bultos > 0
      ? `📦 Bultos: ${a.bultos}${a.parcial ? " (más un rechazo parcial)" : ""}`
      : `📦 Rechazo parcial`,
    `📝 Motivo: ${a.motivos.length ? a.motivos.join(" / ") : "Sin motivo"}`,
  ];
  for (const i of a.items.slice(0, MAX_ITEMS)) {
    lineas.push(
      i.cantidad > 0
        ? `  • ${i.producto} x${i.cantidad}`
        : `  • ${i.producto} (parcial${i.pedido ? `, de ${i.pedido} pedidos` : ""})`,
    );
  }
  if (a.items.length > MAX_ITEMS) {
    lineas.push(`  • … y ${a.items.length - MAX_ITEMS} producto(s) más`);
  }
  // La nota viene repetida en cada ítem del mismo intento: una sola vez cada texto.
  const notas = Array.from(
    new Set(
      a.items.map((i) => i.notas?.trim()).filter((n): n is string => !!n),
    ),
  );
  if (notas.length) lineas.push(`💬 Nota del chofer: ${notas.join(" / ")}`);
  return lineas.join("\n");
}

export function formatAlertaPromotor(a: AlertaParaMensaje): string {
  const tel = a.cliente_telefono ? ` (Tel ${a.cliente_telefono})` : "";
  return (
    cuerpo(a) +
    `\n\n⚡ El camión sigue en zona: llamá YA al cliente${tel} para revertir el rechazo y coordinar la re-entrega con el chofer.`
  );
}

export function formatAlertaSupervisor(a: AlertaParaMensaje): string {
  return (
    cuerpo(a) +
    `\n\n👤 Promotor a cargo: ${a.promotor_nombre ?? "sin promotor asignado"}` +
    `\n📋 Seguimiento en la app: Indicadores → Foxtrot Tracking → Alertas de rechazo.`
  );
}
