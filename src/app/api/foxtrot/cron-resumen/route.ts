/**
 * Resumen diario por WhatsApp a los supervisores: cómo terminaron los
 * rechazos de su equipo (lib/foxtrot-alertas/resumen.ts).
 *
 * Corre 18:45 ART de lunes a sábado (vercel.json). Una vez por día:
 * `foxtrot_alertas_config.resumen_ultima_fecha` evita duplicados si el cron
 * se dispara dos veces. Respeta envios_activos / dry_run / resumen_diario_activo.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) o header x-api-key=CRON_SECRET.
 * Query: ?preview=1 devuelve los textos sin mandar ni marcar nada;
 * ?fecha=YYYY-MM-DD arma el de otro día (solo con preview).
 * Solo Pampeana.
 */
import { NextRequest, NextResponse } from "next/server";
import { IS_MISIONES } from "@/lib/empresa";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/wa-bot/evolution";
import { armarResumenes } from "@/lib/foxtrot-alertas/resumen";
import type { VendedorWa } from "@/lib/foxtrot-alertas/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^\d{8,15}$/;

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (
    !CRON_SECRET ||
    (authHeader !== `Bearer ${CRON_SECRET}` && apiKey !== CRON_SECRET)
  ) {
    return NextResponse.json(
      { error: "CRON_SECRET inválido o faltante" },
      { status: 401 },
    );
  }
  if (IS_MISIONES)
    return NextResponse.json({ success: true, skipped: "solo Pampeana" });

  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const qFecha = url.searchParams.get("fecha");
  const fecha = preview && qFecha && FECHA_RE.test(qFecha) ? qFecha : hoy;

  try {
    const supabase = createAdminClient();
    const { data: config } = await supabase
      .from("foxtrot_alertas_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!preview) {
      if (
        !config?.envios_activos ||
        config?.dry_run ||
        config?.resumen_diario_activo === false
      ) {
        return NextResponse.json({
          success: true,
          skipped: "envíos o resumen apagados",
        });
      }
      if (config?.resumen_ultima_fecha === fecha) {
        return NextResponse.json({ success: true, skipped: "ya enviado hoy" });
      }
    }

    const { data: equipoRaw } = await supabase
      .from("bot_vendedores_wa")
      .select("*");
    const resumenes = await armarResumenes(
      supabase,
      fecha,
      (equipoRaw ?? []) as VendedorWa[],
    );

    if (preview) {
      return NextResponse.json({
        success: true,
        fecha,
        resumenes: resumenes.map((r) => ({
          supervisor: r.supervisor.nombre,
          texto: r.texto,
        })),
      });
    }

    // Se marca ANTES de mandar: un reintento del cron no duplica mensajes.
    await supabase
      .from("foxtrot_alertas_config")
      .update({ resumen_ultima_fecha: fecha })
      .eq("id", 1);

    const envios = [];
    for (const r of resumenes) {
      const phone = r.supervisor.phone_number;
      if (!PHONE_RE.test(phone)) {
        envios.push({
          supervisor: r.supervisor.nombre,
          ok: false,
          error: "sin teléfono",
        });
        continue;
      }
      try {
        const res = await sendText(phone, r.texto);
        envios.push({
          supervisor: r.supervisor.nombre,
          ok: res.ok,
          status: res.status,
        });
      } catch (err) {
        envios.push({
          supervisor: r.supervisor.nombre,
          ok: false,
          error: err instanceof Error ? err.message : "error",
        });
      }
    }
    console.log(
      `[foxtrot-cron-resumen] fecha=${fecha} envios=${JSON.stringify(envios)}`,
    );
    return NextResponse.json({ success: true, fecha, envios });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error en el resumen diario";
    console.error(`[foxtrot-cron-resumen] error: ${message}`);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
