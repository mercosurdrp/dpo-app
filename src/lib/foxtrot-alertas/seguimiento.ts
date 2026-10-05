// Seguimiento de las alertas de rechazo por WhatsApp.
//
// Una hora después de avisar un rechazo, el bot le pregunta a cada vendedor
// del cliente si se pudo evitar (1 evitado / 2 reprogramado / 3 perdido) y
// cómo lo solucionaron (o por qué no se pudo). Reglas:
//   - Vale la PRIMERA respuesta: las preguntas de los otros vendedores de la
//     misma alerta se cierran (`cerrada_por_otro`) y se les avisa.
//   - Un vendedor tiene UNA pregunta abierta a la vez; el resto espera en cola
//     (si no, "1" no dice de qué cliente habla).
//   - Si no contesta en `demoraMin` se le recuerda una vez; si tampoco, queda
//     `sin_respuesta` y pasa a la siguiente.
//   - El "cómo" puede venir por audio: se transcribe con Whisper.
//   - El "cómo" se clasifica en CATEGORIAS para los indicadores.
//
// Lo usan el cron /api/foxtrot/cron-alertas (programar + despachar) y el
// webhook /api/wa-bot/webhook (respuestas). Escribe con service-role.

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import { getMediaBase64, sendText } from "@/lib/wa-bot/evolution";
import type { ResultadoSeguimiento } from "./types";

export const RESULTADO_POR_OPCION: Record<
  1 | 2 | 3,
  Exclude<ResultadoSeguimiento, "sin_respuesta">
> = {
  1: "evitado",
  2: "reprogramado",
  3: "perdido",
};

// Las claves se guardan en la base: no renombrarlas, solo agregar.
// Soluciones: para evitado / reprogramado.
export const SOLUCIONES: Record<string, string> = {
  cliente_consiguio_dinero: "El cliente consiguió el dinero (efectivo)",
  pago_otro_medio: "Pagó por otro medio (transferencia / QR)",
  pedido_corregido: "Se corrigió el pedido o la factura",
  envases_conseguidos: "Se consiguieron los envases",
  otro_horario: "Se coordinó otro horario o día",
  cliente_convencido: "Se habló con el cliente y aceptó",
  producto_reemplazado: "Se cambió el producto",
  otro: "Otro",
};

// Causas: para perdido.
export const CAUSAS: Record<string, string> = {
  cliente_sin_dinero: "Cliente sin dinero",
  cliente_cerrado: "Comercio cerrado",
  no_hizo_pedido: "El cliente dice que no pidió",
  error_pedido: "Error de pedido o de precio",
  sin_envases: "Sin envases",
  producto_no_apto: "Producto no apto (vencido, roto)",
  sin_contacto: "No se pudo contactar al cliente",
  otro: "Otro",
};

export const CATEGORIAS: Record<string, string> = { ...SOLUCIONES, ...CAUSAS };

const ESTADOS_ABIERTOS = ["en_cola", "preguntada", "esperando_como"] as const;

interface AlertaCtx {
  cliente_nombre: string | null;
  id_cliente: string | null;
  motivos: string[] | null;
  rechazo_ts: string | null;
  ruta: string | null;
  seguimiento_resultado: ResultadoSeguimiento | null;
  seguimiento_por_nombre: string | null;
}

interface PreguntaRow {
  id: string;
  alerta_id: string;
  fecha: string;
  id_promotor: string;
  nombre: string | null;
  phone: string;
  estado: string;
  preguntada_at: string | null;
  recordada_at: string | null;
  respondida_at: string | null;
  opcion: 1 | 2 | 3 | null;
  alerta: AlertaCtx | null;
}

const SELECT_PREGUNTA =
  "id, alerta_id, fecha, id_promotor, nombre, phone, estado, preguntada_at, recordada_at, respondida_at, opcion, " +
  "alerta:foxtrot_alertas_rechazo(cliente_nombre, id_cliente, motivos, rechazo_ts, ruta, seguimiento_resultado, seguimiento_por_nombre)";

// ─── Mensajes ────────────────────────────────────────────────────────────────

function horaArt(iso: string | null): string {
  if (!iso) return "s/d";
  return new Date(new Date(iso).getTime() - 3 * 3600_000)
    .toISOString()
    .slice(11, 16);
}

function cliente(a: AlertaCtx | null): string {
  if (!a) return "el cliente";
  return a.cliente_nombre
    ? `*${a.cliente_nombre}*${a.id_cliente ? ` (cod. ${a.id_cliente})` : ""}`
    : `cliente cod. ${a.id_cliente ?? "s/d"}`;
}

export function textoPregunta(
  a: AlertaCtx | null,
  recordatorio = false,
): string {
  const motivo = a?.motivos?.length ? a.motivos.join(" / ") : "Sin motivo";
  return [
    recordatorio
      ? "🔔 *Recordatorio — seguimiento de rechazo*"
      : "⏱️ *Seguimiento de rechazo*",
    "",
    `🏪 ${cliente(a)}`,
    `📝 ${motivo} · ${horaArt(a?.rechazo_ts ?? null)} hs · Ruta ${a?.ruta ?? "s/d"}`,
    "",
    "¿Se pudo evitar el rechazo? Respondé con el número:",
    "*1* – Sí, se entregó",
    "*2* – No, se reprograma",
    "*3* – No, se perdió la venta",
  ].join("\n");
}

const TEXTO_COMO: Record<1 | 2 | 3, string> = {
  1: "¡Bien ahí! 💪 ¿Cómo lo solucionaron? Contalo en un mensaje (podés mandar un audio).",
  2: "Dale. ¿Qué se acordó con el cliente? Contalo en un mensaje (podés mandar un audio).",
  3: "Entendido. ¿Qué pasó, por qué no se pudo? Contalo en un mensaje (podés mandar un audio).",
};

// ─── Parseo ──────────────────────────────────────────────────────────────────

export function parseOpcion(texto: string): 1 | 2 | 3 | null {
  const t = texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = t.match(/^\*?([123])\b/);
  if (m) return Number(m[1]) as 1 | 2 | 3;
  if (/^(si|se entrego|entregado|entregamos|evitado)\b/.test(t)) return 1;
  if (/reprogram/.test(t)) return 2;
  if (/^(no,? se perdio|se perdio|perdid)/.test(t)) return 3;
  return null;
}

// Mensajes que son del bot de pedidos y no una respuesta al seguimiento.
const COMANDO_PEDIDOS = /^\s*(pedidos?|top)\s*$/i;

// ─── OpenAI: clasificación y audios ──────────────────────────────────────────

let openaiClient: OpenAI | null = null;
function openai(): OpenAI | null {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) return null;
  openaiClient ??= new OpenAI({ apiKey: key });
  return openaiClient;
}

export async function clasificarComo(input: {
  motivo: string;
  resultado: Exclude<ResultadoSeguimiento, "sin_respuesta">;
  como: string;
}): Promise<{ categoria: string; resumen: string | null }> {
  const ai = openai();
  if (!ai) return { categoria: "otro", resumen: null };
  // Cada resultado elige solo de su lista: una solución no puede ser una causa.
  const lista = input.resultado === "perdido" ? CAUSAS : SOLUCIONES;
  const que =
    input.resultado === "perdido"
      ? "la CAUSA de que se perdiera la venta"
      : "la SOLUCIÓN que encontraron";
  try {
    const r = await ai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "clasificacion",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["categoria", "resumen"],
              properties: {
                categoria: { type: "string", enum: Object.keys(lista) },
                resumen: { type: "string" },
              },
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "Sos analista de una distribuidora de bebidas en Argentina. Un vendedor cuenta qué pasó con un rechazo de entrega. " +
              `Elegí la categoría que mejor describe ${que}, guiándote SOLO por lo que dice el vendedor: ` +
              "el motivo original del rechazo es contexto y no decide la categoría (ej.: rechazo por SIN DINERO que se resolvió " +
              "con una transferencia = pago por otro medio; si el vendedor dice que estaba cerrado = comercio cerrado; " +
              "si se pasó para otro día u horario = otro horario). " +
              "Usá 'otro' solo si ninguna aplica. Resumen: máximo 12 palabras, en español rioplatense, sin nombres propios, " +
              "contando qué hizo o qué pasó (no repitas el motivo).\n\n" +
              "Categorías:\n" +
              Object.entries(lista)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join("\n"),
          },
          {
            role: "user",
            content: `Motivo del rechazo: ${input.motivo}\nResultado: ${input.resultado}\nLo que dijo el vendedor: ${input.como}`,
          },
        ],
      },
      { timeout: 15_000 },
    );
    const d = JSON.parse(r.choices[0]?.message?.content ?? "{}") as {
      categoria?: string;
      resumen?: string;
    };
    return {
      categoria: d.categoria && d.categoria in lista ? d.categoria : "otro",
      resumen: d.resumen?.trim() || null,
    };
  } catch (err) {
    console.error(
      `[seguimiento] clasificación falló: ${err instanceof Error ? err.message : err}`,
    );
    return { categoria: "otro", resumen: null };
  }
}

async function transcribirAudio(messageId: string): Promise<string | null> {
  const ai = openai();
  if (!ai) return null;
  const media = await getMediaBase64(messageId);
  if (!media) return null;
  try {
    const ext = media.mimetype.includes("mpeg")
      ? "mp3"
      : media.mimetype.includes("mp4")
        ? "m4a"
        : "ogg";
    const file = await toFile(
      Buffer.from(media.base64, "base64"),
      `audio.${ext}`,
      {
        type: media.mimetype.split(";")[0],
      },
    );
    const r = await ai.audio.transcriptions.create(
      { file, model: "whisper-1", language: "es" },
      { timeout: 30_000 },
    );
    return r.text?.trim() || null;
  } catch (err) {
    console.error(
      `[seguimiento] transcripción falló: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

// ─── Envío ───────────────────────────────────────────────────────────────────

async function enviar(phone: string, texto: string): Promise<boolean> {
  try {
    const r = await sendText(phone, texto);
    if (!r.ok)
      console.error(`[seguimiento] envío a ${phone} status=${r.status}`);
    return r.ok;
  } catch (err) {
    console.error(
      `[seguimiento] envío a ${phone}: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

/** Manda la próxima pregunta en cola de un número, si no tiene otra abierta. */
async function enviarSiguiente(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("foxtrot_alertas_preguntas")
    .select(SELECT_PREGUNTA)
    .eq("phone", phone)
    .in("estado", ESTADOS_ABIERTOS)
    .order("created_at", { ascending: true });
  const abiertas = (data ?? []) as unknown as PreguntaRow[];
  if (abiertas.some((p) => p.estado !== "en_cola")) return false;
  const proxima = abiertas[0];
  if (!proxima) return false;
  if (!(await enviar(phone, textoPregunta(proxima.alerta)))) return false;
  await supabase
    .from("foxtrot_alertas_preguntas")
    .update({ estado: "preguntada", preguntada_at: new Date().toISOString() })
    .eq("id", proxima.id)
    .eq("estado", "en_cola");
  return true;
}

/** La alerta queda "sin_respuesta" cuando todas sus preguntas se cerraron sin opción. */
async function cerrarAlertasSinRespuesta(
  supabase: SupabaseClient,
  alertaIds: string[],
) {
  if (alertaIds.length === 0) return;
  const { data } = await supabase
    .from("foxtrot_alertas_preguntas")
    .select("alerta_id, estado, opcion")
    .in("alerta_id", alertaIds);
  const porAlerta = new Map<string, { abiertas: number; conOpcion: number }>();
  for (const p of data ?? []) {
    const g = porAlerta.get(p.alerta_id) ?? { abiertas: 0, conOpcion: 0 };
    if ((ESTADOS_ABIERTOS as readonly string[]).includes(p.estado))
      g.abiertas++;
    if (p.opcion != null) g.conOpcion++;
    porAlerta.set(p.alerta_id, g);
  }
  const sinRespuesta = [...porAlerta]
    .filter(([, g]) => g.abiertas === 0 && g.conOpcion === 0)
    .map(([id]) => id);
  if (sinRespuesta.length === 0) return;
  await supabase
    .from("foxtrot_alertas_rechazo")
    .update({
      seguimiento_resultado: "sin_respuesta",
      seguimiento_at: new Date().toISOString(),
    })
    .in("id", sinRespuesta)
    .is("seguimiento_resultado", null);
}

// ─── Cron ────────────────────────────────────────────────────────────────────

export interface SeguimientoCronResult {
  programadas: number;
  preguntas_enviadas: number;
  recordatorios: number;
  sin_respuesta: number;
}

/**
 * Paso del cron: (1) crea las preguntas de las alertas avisadas hace
 * `demoraMin`, (2) recuerda / vence las que no contestaron y (3) manda la
 * siguiente pregunta en cola de cada vendedor. Envía solo dentro de la ventana.
 */
export async function correrSeguimiento(
  supabase: SupabaseClient,
  opts: {
    hoy: string;
    demoraMin: number;
    dentroVentana: boolean;
    equipoPorPhone: Map<string, { id_promotor: string; nombre: string }>;
  },
): Promise<SeguimientoCronResult> {
  const res: SeguimientoCronResult = {
    programadas: 0,
    preguntas_enviadas: 0,
    recordatorios: 0,
    sin_respuesta: 0,
  };
  const ahora = Date.now();
  const demoraMs = opts.demoraMin * 60_000;
  const corte = new Date(ahora - demoraMs).toISOString();

  // (1) Programar. Solo alertas de hoy ya enviadas: una de ayer no tiene sentido preguntarla.
  const { data: alertas } = await supabase
    .from("foxtrot_alertas_rechazo")
    .select("id, envio_detalle")
    .eq("fecha", opts.hoy)
    .in("estado_envio", ["enviada", "parcial"])
    .lte("enviada_at", corte)
    .is("seguimiento_resultado", null);
  if (alertas?.length) {
    const { data: existentes } = await supabase
      .from("foxtrot_alertas_preguntas")
      .select("alerta_id")
      .in(
        "alerta_id",
        alertas.map((a) => a.id),
      );
    const yaProgramadas = new Set((existentes ?? []).map((p) => p.alerta_id));
    const filas = alertas
      .filter((a) => !yaProgramadas.has(a.id))
      .flatMap((a) => {
        const phones = new Set(
          (
            (a.envio_detalle ?? []) as {
              destinatario: string;
              phone: string | null;
              ok: boolean;
            }[]
          )
            .filter((d) => d.destinatario === "promotor" && d.ok && d.phone)
            .map((d) => d.phone!),
        );
        return [...phones]
          .map((phone) => ({ phone, v: opts.equipoPorPhone.get(phone) }))
          .filter((x) => x.v)
          .map(({ phone, v }) => ({
            alerta_id: a.id,
            fecha: opts.hoy,
            id_promotor: v!.id_promotor,
            nombre: v!.nombre,
            phone,
          }));
      });
    if (filas.length) {
      const { data: insertadas } = await supabase
        .from("foxtrot_alertas_preguntas")
        .upsert(filas, {
          onConflict: "alerta_id,id_promotor",
          ignoreDuplicates: true,
        })
        .select("id");
      res.programadas = insertadas?.length ?? 0;
    }
  }

  // (2) Días anteriores: lo que quedó abierto se cierra (sin mandar nada).
  // Lo que nunca se llegó a preguntar (rechazo tarde, fuera de ventana) se
  // borra: no es culpa del vendedor y no tiene que contar como sin respuesta.
  await supabase
    .from("foxtrot_alertas_preguntas")
    .delete()
    .lt("fecha", opts.hoy)
    .eq("estado", "en_cola");
  const { data: viejas } = await supabase
    .from("foxtrot_alertas_preguntas")
    .select("id, alerta_id, estado")
    .lt("fecha", opts.hoy)
    .in("estado", ["preguntada", "esperando_como"]);
  const alertasTocadas = new Set<string>();
  for (const p of viejas ?? []) {
    await supabase
      .from("foxtrot_alertas_preguntas")
      .update({
        estado: p.estado === "esperando_como" ? "respondida" : "sin_respuesta",
      })
      .eq("id", p.id);
    alertasTocadas.add(p.alerta_id);
  }

  // (3) Hoy: recordatorios y vencimientos de las que ya se preguntaron.
  const { data: abiertasRaw } = await supabase
    .from("foxtrot_alertas_preguntas")
    .select(SELECT_PREGUNTA)
    .eq("fecha", opts.hoy)
    .in("estado", ["preguntada", "esperando_como"]);
  const abiertas = (abiertasRaw ?? []) as unknown as PreguntaRow[];
  const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  for (const p of abiertas) {
    if (p.estado === "esperando_como") {
      // Contestó la opción pero no el "cómo": vale igual, se cierra.
      if (ahora - ms(p.respondida_at) >= demoraMs) {
        await supabase
          .from("foxtrot_alertas_preguntas")
          .update({ estado: "respondida" })
          .eq("id", p.id);
      }
      continue;
    }
    if (!p.recordada_at && ahora - ms(p.preguntada_at) >= demoraMs) {
      if (!opts.dentroVentana) continue;
      if (await enviar(p.phone, textoPregunta(p.alerta, true))) {
        await supabase
          .from("foxtrot_alertas_preguntas")
          .update({ recordada_at: new Date().toISOString() })
          .eq("id", p.id);
        res.recordatorios++;
      }
    } else if (p.recordada_at && ahora - ms(p.recordada_at) >= demoraMs) {
      await supabase
        .from("foxtrot_alertas_preguntas")
        .update({ estado: "sin_respuesta" })
        .eq("id", p.id);
      alertasTocadas.add(p.alerta_id);
      res.sin_respuesta++;
    }
  }
  await cerrarAlertasSinRespuesta(supabase, [...alertasTocadas]);

  // (4) A cada vendedor libre, su próxima pregunta.
  if (opts.dentroVentana) {
    const { data: enCola } = await supabase
      .from("foxtrot_alertas_preguntas")
      .select("phone")
      .eq("fecha", opts.hoy)
      .eq("estado", "en_cola");
    for (const phone of new Set((enCola ?? []).map((p) => p.phone))) {
      if (await enviarSiguiente(supabase, phone)) res.preguntas_enviadas++;
    }
  }
  return res;
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * El vendedor escribe sin pregunta abierta, típicamente contestándole al
 * aviso ("ya lo llamé"). Si tiene una pregunta en cola se la adelantamos; si
 * el aviso es de hace poco, le decimos que en un rato le preguntamos. Si no
 * tiene nada del día, null: es un mensaje para el bot de pedidos.
 */
async function responderAntesDeLaPregunta(
  supabase: SupabaseClient,
  phone: string,
): Promise<{ accion: string; respuesta: string | null; texto: string } | null> {
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { data: enCola } = await supabase
    .from("foxtrot_alertas_preguntas")
    .select("id")
    .eq("phone", phone)
    .eq("fecha", hoy)
    .eq("estado", "en_cola")
    .limit(1);
  if (enCola?.length && (await enviarSiguiente(supabase, phone))) {
    return {
      accion: "pregunta_adelantada",
      respuesta: "(pregunta de seguimiento)",
      texto: "",
    };
  }

  const { data: avisos } = await supabase
    .from("foxtrot_alertas_rechazo")
    .select("id, cliente_nombre")
    .eq("fecha", hoy)
    .in("estado_envio", ["enviada", "parcial"])
    .is("seguimiento_resultado", null)
    .gte("enviada_at", new Date(Date.now() - 3 * 3600_000).toISOString())
    .contains("envio_detalle", [{ phone, destinatario: "promotor" }])
    .order("enviada_at", { ascending: false })
    .limit(1);
  const aviso = avisos?.[0];
  if (!aviso) return null;
  const r = `👍 Recibido. En un rato te pregunto cómo terminó lo de *${aviso.cliente_nombre ?? "ese cliente"}*.`;
  await enviar(phone, r);
  return { accion: "antes_de_la_pregunta", respuesta: r, texto: "" };
}

/**
 * Procesa un mensaje entrante si el número tiene una pregunta de seguimiento
 * abierta. Devuelve null si no le corresponde (sigue el bot de pedidos) o lo
 * que se le respondió al vendedor, para el log.
 */
export async function procesarRespuesta(
  supabase: SupabaseClient,
  msg: {
    phone: string;
    texto: string;
    messageId: string | null;
    esAudio: boolean;
  },
): Promise<{ accion: string; respuesta: string | null; texto: string } | null> {
  const { data } = await supabase
    .from("foxtrot_alertas_preguntas")
    .select(SELECT_PREGUNTA)
    .eq("phone", msg.phone)
    .in("estado", ["preguntada", "esperando_como"])
    .order("preguntada_at", { ascending: false })
    .limit(1);
  const p = (data?.[0] ?? null) as unknown as PreguntaRow | null;
  if (!msg.esAudio && COMANDO_PEDIDOS.test(msg.texto)) return null;
  if (!p) return responderAntesDeLaPregunta(supabase, msg.phone);

  let texto = msg.texto;
  if (msg.esAudio && msg.messageId) {
    texto = (await transcribirAudio(msg.messageId)) ?? "";
    if (!texto) {
      const r = "No pude escuchar el audio 😕. ¿Me lo escribís?";
      await enviar(msg.phone, r);
      return { accion: "audio_ilegible", respuesta: r, texto: "" };
    }
  }
  const ahora = new Date().toISOString();

  if (p.estado === "preguntada") {
    const opcion = parseOpcion(texto);
    if (!opcion) {
      // Una sola aclaración cada 30 min: con un autorresponder de WhatsApp
      // Business del otro lado, contestar siempre arma un loop de mensajes.
      const { count } = await supabase
        .from("bot_conversaciones_log")
        .select("id", { count: "exact", head: true })
        .eq("phone_number", msg.phone)
        .like("mensaje_out", "No te entendí%")
        .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString());
      if (count)
        return { accion: "opcion_invalida_silencio", respuesta: null, texto };
      const r = `No te entendí 🤔. Sobre ${cliente(p.alerta)}, respondé *1* (se entregó), *2* (se reprograma) o *3* (se perdió).`;
      await enviar(msg.phone, r);
      return { accion: "opcion_invalida", respuesta: r, texto };
    }
    // Vale la primera respuesta: solo se graba si nadie respondió antes.
    const { data: ganada } = await supabase
      .from("foxtrot_alertas_rechazo")
      .update({
        seguimiento_resultado: RESULTADO_POR_OPCION[opcion],
        seguimiento_por_id: p.id_promotor,
        seguimiento_por_nombre: p.nombre,
        seguimiento_at: ahora,
      })
      .eq("id", p.alerta_id)
      .is("seguimiento_resultado", null)
      .select("id");
    if (!ganada?.length) {
      await supabase
        .from("foxtrot_alertas_preguntas")
        .update({ estado: "cerrada_por_otro" })
        .eq("id", p.id);
      const r = `✅ ${p.alerta?.seguimiento_por_nombre ?? "Otro vendedor"} ya respondió por ${cliente(p.alerta)}. ¡Gracias!`;
      await enviar(msg.phone, r);
      await enviarSiguiente(supabase, msg.phone);
      return { accion: "ya_respondido", respuesta: r, texto };
    }
    await supabase
      .from("foxtrot_alertas_preguntas")
      .update({ estado: "esperando_como", opcion, respondida_at: ahora })
      .eq("id", p.id);
    // Los otros vendedores de la alerta ya no tienen que contestar.
    const { data: otras } = await supabase
      .from("foxtrot_alertas_preguntas")
      .update({ estado: "cerrada_por_otro" })
      .eq("alerta_id", p.alerta_id)
      .neq("id", p.id)
      .in("estado", ["en_cola", "preguntada"])
      .select("phone, preguntada_at");
    for (const o of otras ?? []) {
      if (o.preguntada_at) {
        await enviar(
          o.phone,
          `✅ ${p.nombre ?? "Otro vendedor"} ya respondió por ${cliente(p.alerta)}. No hace falta que contestes.`,
        );
      }
      await enviarSiguiente(supabase, o.phone);
    }
    // "2, quiere reprogramar para el miércoles": el cómo vino en el mismo
    // mensaje, no se repregunta.
    const explicacion = textoDespuesDeLaOpcion(texto);
    if (explicacion) {
      return registrarComo(supabase, msg.phone, { ...p, opcion }, explicacion);
    }
    const r = TEXTO_COMO[opcion];
    await enviar(msg.phone, r);
    return { accion: `opcion_${opcion}`, respuesta: r, texto };
  }

  // esperando_como: este mensaje es el "cómo".
  return registrarComo(supabase, msg.phone, p, texto);
}

/** Lo que sigue a la opción ("2, quiere reprogramar…"), si dice algo. */
export function textoDespuesDeLaOpcion(texto: string): string | null {
  const resto = texto
    .trim()
    .replace(/^\*?[123]\*?\s*[-–.,:;)]*\s*/, "")
    .trim();
  if (resto === texto.trim()) return null; // no empezaba con el número
  return resto.length >= 8 ? resto : null;
}

async function registrarComo(
  supabase: SupabaseClient,
  phone: string,
  p: PreguntaRow,
  texto: string,
): Promise<{ accion: string; respuesta: string | null; texto: string }> {
  await supabase
    .from("foxtrot_alertas_preguntas")
    .update({ estado: "respondida", como: texto })
    .eq("id", p.id);
  const resultado = RESULTADO_POR_OPCION[p.opcion ?? 1];
  const { categoria, resumen } = await clasificarComo({
    motivo: p.alerta?.motivos?.join(" / ") || "Sin motivo",
    resultado,
    como: texto,
  });
  await supabase
    .from("foxtrot_alertas_rechazo")
    .update({
      seguimiento_como: texto,
      seguimiento_categoria: categoria,
      seguimiento_resumen: resumen,
    })
    .eq("id", p.alerta_id);
  const r = "¡Gracias! Quedó registrado ✅";
  await enviar(phone, r);
  await enviarSiguiente(supabase, phone);
  return { accion: "como_registrado", respuesta: r, texto };
}
