// Resumen diario por WhatsApp para cada supervisor: cómo terminaron los
// rechazos de su equipo en el día (lo lanza /api/foxtrot/cron-resumen).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertaRechazo, EnvioDetalle, VendedorWa } from "./types";

const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

function apellido(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0] ?? nombre;
  return p.charAt(0) + p.slice(1).toLowerCase();
}

export interface ResumenSupervisor {
  supervisor: VendedorWa;
  texto: string;
  rechazos: number;
}

export async function armarResumenes(
  supabase: SupabaseClient,
  fecha: string,
  equipo: VendedorWa[],
): Promise<ResumenSupervisor[]> {
  const { data } = await supabase
    .from("foxtrot_alertas_rechazo")
    .select("*")
    .eq("fecha", fecha)
    .in("estado_envio", ["enviada", "parcial"]);
  const alertas = (data ?? []) as AlertaRechazo[];

  const porPhone = new Map(equipo.map((v) => [v.phone_number, v]));
  const porId = new Map(equipo.map((v) => [v.id_promotor, v]));
  const supervisores = equipo.filter(
    (v) => v.rol === "supervisor" && v.activo && v.recibe_alertas_rechazo,
  );

  // Vendedores avisados en cada alerta (preventista + repositor).
  const vendedoresDe = (a: AlertaRechazo): VendedorWa[] => {
    const vs = (a.envio_detalle as EnvioDetalle[])
      .filter((d) => d.destinatario === "promotor" && d.ok && d.phone)
      .map((d) => porPhone.get(d.phone!))
      .filter((v): v is VendedorWa => !!v);
    if (vs.length) return vs;
    const v = a.id_promotor ? porId.get(a.id_promotor) : undefined;
    return v ? [v] : [];
  };

  return supervisores.map((sup) => {
    const delEquipo = alertas.filter(
      (a) =>
        vendedoresDe(a).some((v) => v.supervisor_id === sup.id_promotor) ||
        a.supervisor_id === sup.id_promotor,
    );
    const n = (f: (a: AlertaRechazo) => boolean) => delEquipo.filter(f).length;
    const lineas = [
      `📊 *Resumen de rechazos — ${fechaLarga(fecha)}*`,
      `Equipo de ${apellido(sup.nombre)}`,
      "",
    ];

    if (delEquipo.length === 0) {
      lineas.push("Hoy no hubo rechazos avisados en tu equipo 🎉");
      return { supervisor: sup, texto: lineas.join("\n"), rechazos: 0 };
    }

    const confirmados = n((a) => a.outcome === "recuperado_mismo_dia");
    const bultos = delEquipo
      .filter((a) => a.outcome === "recuperado_mismo_dia")
      .reduce((s, a) => s + (Number(a.bultos) || 0), 0);
    lineas.push(
      `🚨 Rechazos avisados: *${delEquipo.length}*`,
      `✅ Evitados (según el vendedor): ${n((a) => a.seguimiento_resultado === "evitado")}`,
      `🚚 Re-entregados (confirmado por Foxtrot): ${confirmados}${bultos ? ` · ${bultos} bultos` : ""}`,
      `🔁 Reprogramados: ${n((a) => a.seguimiento_resultado === "reprogramado")}`,
      `❌ Perdidos: ${n((a) => a.seguimiento_resultado === "perdido")}`,
      `🤐 Sin respuesta: ${n((a) => a.seguimiento_resultado === "sin_respuesta")}`,
    );
    const pendientes = n((a) => !a.seguimiento_resultado);
    if (pendientes)
      lineas.push(
        `⏳ Todavía sin preguntar o esperando respuesta: ${pendientes}`,
      );

    // Por vendedor del equipo.
    const stats = new Map<
      string,
      { nombre: string; avisos: number; resp: number; evit: number }
    >();
    for (const a of delEquipo) {
      for (const v of vendedoresDe(a).filter(
        (x) => x.supervisor_id === sup.id_promotor,
      )) {
        const s = stats.get(v.id_promotor) ?? {
          nombre: v.nombre,
          avisos: 0,
          resp: 0,
          evit: 0,
        };
        s.avisos++;
        if (a.seguimiento_por_id === v.id_promotor) {
          s.resp++;
          if (a.seguimiento_resultado === "evitado") s.evit++;
        }
        stats.set(v.id_promotor, s);
      }
    }
    if (stats.size) {
      lineas.push("", "*Por vendedor*");
      for (const s of [...stats.values()].sort((a, b) => b.avisos - a.avisos)) {
        lineas.push(
          `• ${apellido(s.nombre)}: ${s.avisos} aviso${s.avisos === 1 ? "" : "s"} · ${s.resp} respondido${s.resp === 1 ? "" : "s"} · ${s.evit} evitado${s.evit === 1 ? "" : "s"}`,
        );
      }
    }

    const sinResp = delEquipo.filter(
      (a) => a.seguimiento_resultado === "sin_respuesta",
    );
    if (sinResp.length) {
      lineas.push("", "*Sin respuesta*");
      for (const a of sinResp.slice(0, 8)) {
        const quienes = vendedoresDe(a)
          .map((v) => apellido(v.nombre))
          .join(" / ");
        lineas.push(
          `• ${a.cliente_nombre ?? `cod. ${a.id_cliente}`}${quienes ? ` (${quienes})` : ""}`,
        );
      }
      if (sinResp.length > 8) lineas.push(`• … y ${sinResp.length - 8} más`);
    }

    lineas.push("", "📋 Detalle: app DPO → Alertas de rechazo → Efectividad");
    return {
      supervisor: sup,
      texto: lineas.join("\n"),
      rechazos: delEquipo.length,
    };
  });
}
