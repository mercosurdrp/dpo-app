// Cliente → TODOS los vendedores que lo atienden (preventista + repositor),
// desde las rutas de venta vigentes de Chess.
//
// `bot_clientes_cache` guarda un solo promotor por cliente (el de la primera
// fuerza no anulada), pero un mismo cliente puede estar en la ruta del
// preventista y en la del repositor, y los dos reciben la alerta (pedido de
// Fausto 5/10/2026). `/rutasVenta` trae los clientes de cada ruta en
// `eClientesRutas`, así que una sola consulta alcanza.

import { unstable_cache } from "next/cache";
import { chessLogin } from "@/lib/wa-bot/chess";

// Personal de Chess que no es una persona: no recibe alertas.
//   50 = "VTA. MOSTRADOR" (temporada, 26 centro, 31 periferia, sin ruta).
const PERSONAL_EXCLUIDO = new Set(["50"]);

interface RutaVentaConClientes {
  idPersonal: number;
  anulado?: boolean | string;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  eClientesRutas?: { idCliente: number }[] | null;
}

async function fetchPromotoresPorCliente(
  hoy: string,
): Promise<Record<string, string[]>> {
  const baseUrl = (process.env.CHESS_API_BASE_URL ?? "").trim();
  const user = (process.env.CHESS_API_USER ?? "").trim();
  const pass = (process.env.CHESS_API_PASS ?? "").trim();
  if (!baseUrl || !user || !pass) return {};

  const sessionId = await chessLogin({ baseUrl, user, pass });
  const https = await import("node:https");
  const r = await fetch(`${baseUrl}/rutasVenta/?anulada=false`, {
    headers: { Accept: "application/json", Cookie: sessionId },
    // @ts-expect-error Node fetch supports agent option (Chess usa cert propio)
    agent: new https.Agent({ rejectUnauthorized: false }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Chess GET /rutasVenta: ${r.status}`);
  const d = (await r.json()) as {
    RutasVenta?: { eRutasVenta?: RutaVentaConClientes[] };
  };

  const porCliente: Record<string, string[]> = {};
  for (const ruta of d?.RutasVenta?.eRutasVenta ?? []) {
    if (String(ruta.anulado ?? "").toLowerCase() === "true") continue;
    if (ruta.fechaDesde && ruta.fechaDesde > hoy) continue;
    if (ruta.fechaHasta && ruta.fechaHasta < hoy) continue;
    const idPersonal = String(ruta.idPersonal);
    if (PERSONAL_EXCLUIDO.has(idPersonal)) continue;
    for (const c of ruta.eClientesRutas ?? []) {
      const id = String(c.idCliente);
      const lista = (porCliente[id] ??= []);
      if (!lista.includes(idPersonal)) lista.push(idPersonal);
    }
  }
  return porCliente;
}

/**
 * Mapa id_cliente Chess → ids de promotor. Cacheado 6 h por día: el cron
 * corre cada 10 min y las rutas de venta cambian muy de vez en cuando.
 * Si Chess falla devuelve {} y el cron cae al promotor de `bot_clientes_cache`.
 */
export async function promotoresPorCliente(
  hoy: string,
): Promise<Map<string, string[]>> {
  try {
    const obj = await unstable_cache(
      () => fetchPromotoresPorCliente(hoy),
      ["foxtrot-alertas-promotores-por-cliente", hoy],
      { revalidate: 6 * 3600 },
    )();
    return new Map(Object.entries(obj));
  } catch (err) {
    console.error(
      `[foxtrot-alertas] rutasVenta de Chess falló, uso bot_clientes_cache: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return new Map();
  }
}

export const esPersonalExcluido = (idPromotor: string | null | undefined) =>
  !!idPromotor && PERSONAL_EXCLUIDO.has(idPromotor);
