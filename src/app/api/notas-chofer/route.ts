/**
 * Recibe el mensaje que un cliente le deja al chofer desde «Mi próxima
 * entrega» (mercosur-atiende /mi-entrega). La validación del cliente (número
 * + últimos 4 del CUIT) la hace mercosur-atiende; acá se confía en el secreto
 * compartido NOTAS_CHOFER_SECRET (header x-api-key).
 *
 * Body: { id_cliente: number | string, mensaje: string, contacto?: string }
 * Respuesta: ResultadoNota (lib/notas-chofer/notas.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recibirNota } from "@/lib/notas-chofer/notas";

export const maxDuration = 60;

const SECRET = process.env.NOTAS_CHOFER_SECRET?.trim() || null;

export async function POST(request: NextRequest) {
  if (!SECRET || request.headers.get("x-api-key") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    id_cliente?: number | string;
    mensaje?: string;
    contacto?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const idCliente = String(body.id_cliente ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (!idCliente || typeof body.mensaje !== "string") {
    return NextResponse.json(
      { ok: false, motivo: "invalido", error: "Faltan datos." },
      { status: 400 },
    );
  }

  try {
    const r = await recibirNota(createAdminClient(), {
      idCliente,
      mensaje: body.mensaje,
      contacto: body.contacto ?? null,
    });
    console.log(
      `[notas-chofer] cliente=${idCliente} ${r.ok ? `estado=${r.estado}` : `motivo=${r.motivo}`}`,
    );
    return NextResponse.json(r);
  } catch (e) {
    console.error(
      `[notas-chofer] cliente=${idCliente}: ${e instanceof Error ? e.message : e}`,
    );
    return NextResponse.json(
      {
        ok: false,
        motivo: "error",
        error: "No pudimos mandar el mensaje. Probá en un rato.",
      },
      { status: 500 },
    );
  }
}
