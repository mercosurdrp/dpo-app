// Resumen diario por WhatsApp (lo lanza /api/foxtrot/cron-resumen):
//   - a cada supervisor, cómo terminaron los rechazos de SU equipo;
//   - a los destinatarios de `foxtrot_alertas_config.resumen_general_destinatarios`
//     (gerencia), el general de Pampeana con el detalle por supervisor y vendedor.

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

// Nombre completo: en Chess el orden no es parejo ("MARTINEZ JOSE" pero
// "KEVIN BASSAN"), así que quedarse con la primera palabra a veces da el nombre.
function nombreLindo(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

export interface DestinatarioResumen {
  nombre: string;
  phone: string;
}

export interface ResumenArmado {
  tipo: "supervisor" | "general";
  destinatario: DestinatarioResumen;
  texto: string;
  rechazos: number;
}

export async function armarResumenes(
  supabase: SupabaseClient,
  fecha: string,
  equipo: VendedorWa[],
  generales: DestinatarioResumen[] = [],
): Promise<ResumenArmado[]> {
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
  const esDelEquipo = (a: AlertaRechazo, supId: string) =>
    vendedoresDe(a).some((v) => v.supervisor_id === supId) ||
    a.supervisor_id === supId;

  const contar = (as: AlertaRechazo[]) => {
    const n = (f: (a: AlertaRechazo) => boolean) => as.filter(f).length;
    const recuperadas = as.filter((a) => a.outcome === "recuperado_mismo_dia");
    return {
      total: as.length,
      evitados: n((a) => a.seguimiento_resultado === "evitado"),
      reprogramados: n((a) => a.seguimiento_resultado === "reprogramado"),
      perdidos: n((a) => a.seguimiento_resultado === "perdido"),
      sinRespuesta: n((a) => a.seguimiento_resultado === "sin_respuesta"),
      respondidos: n(
        (a) =>
          !!a.seguimiento_resultado &&
          a.seguimiento_resultado !== "sin_respuesta",
      ),
      pendientes: n((a) => !a.seguimiento_resultado),
      recuperados: recuperadas.length,
      bultos: recuperadas.reduce((s, a) => s + (Number(a.bultos) || 0), 0),
    };
  };

  // Bloques comunes de los dos tipos de resumen.
  const totales = (as: AlertaRechazo[]) => {
    const c = contar(as);
    const l = [
      `🚨 Rechazos avisados: *${c.total}*`,
      `✅ Evitados (según el vendedor): ${c.evitados}`,
      `🚚 Re-entregados (confirmado por Foxtrot): ${c.recuperados}${c.bultos ? ` · ${c.bultos} bultos` : ""}`,
      `🔁 Reprogramados: ${c.reprogramados}`,
      `❌ Perdidos: ${c.perdidos}`,
      `🤐 Sin respuesta: ${c.sinRespuesta}`,
    ];
    if (c.pendientes)
      l.push(`⏳ Todavía sin preguntar o esperando respuesta: ${c.pendientes}`);
    return l;
  };

  const porVendedor = (
    as: AlertaRechazo[],
    incluir: (v: VendedorWa) => boolean,
  ) => {
    const stats = new Map<
      string,
      { nombre: string; avisos: number; resp: number; evit: number }
    >();
    for (const a of as) {
      for (const v of vendedoresDe(a).filter(incluir)) {
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
    if (!stats.size) return [];
    return [
      "",
      "*Por vendedor*",
      ...[...stats.values()]
        .sort((a, b) => b.avisos - a.avisos)
        .map(
          (s) =>
            `• ${nombreLindo(s.nombre)}: ${plural(s.avisos, "aviso")} · ${plural(s.resp, "respondido")} · ${plural(s.evit, "evitado")}`,
        ),
    ];
  };

  const sinRespuesta = (as: AlertaRechazo[]) => {
    const sr = as.filter((a) => a.seguimiento_resultado === "sin_respuesta");
    if (!sr.length) return [];
    const l = ["", "*Sin respuesta*"];
    for (const a of sr.slice(0, 8)) {
      const quienes = vendedoresDe(a)
        .map((v) => nombreLindo(v.nombre))
        .join(" / ");
      l.push(
        `• ${a.cliente_nombre ?? `cod. ${a.id_cliente}`}${quienes ? ` (${quienes})` : ""}`,
      );
    }
    if (sr.length > 8) l.push(`• … y ${sr.length - 8} más`);
    return l;
  };

  const encabezado = (subtitulo: string) => [
    `📊 *Resumen de rechazos — ${fechaLarga(fecha)}*`,
    subtitulo,
    "",
  ];
  const pie = ["", "📋 Detalle: app DPO → Alertas de rechazo → Efectividad"];
  // Sin festejo: puede ser que no hubo rechazos o que las rutas no se
  // registraron en Foxtrot (Pergamino todavía no usa la app).
  const SIN_REGISTRO = "sin rechazos registrados en Foxtrot";

  const resumenes: ResumenArmado[] = supervisores.map((sup) => {
    const delEquipo = alertas.filter((a) => esDelEquipo(a, sup.id_promotor));
    const lineas = encabezado(`Equipo de ${nombreLindo(sup.nombre)}`);
    if (!delEquipo.length) {
      lineas.push(
        `Hoy no hubo rechazos registrados en Foxtrot para tu equipo.`,
      );
    } else {
      lineas.push(
        ...totales(delEquipo),
        ...porVendedor(delEquipo, (v) => v.supervisor_id === sup.id_promotor),
        ...sinRespuesta(delEquipo),
        ...pie,
      );
    }
    return {
      tipo: "supervisor",
      destinatario: { nombre: sup.nombre, phone: sup.phone_number },
      texto: lineas.join("\n"),
      rechazos: delEquipo.length,
    };
  });

  if (generales.length) {
    const lineas = encabezado("General Pampeana");
    if (!alertas.length) {
      lineas.push("Hoy no hubo rechazos registrados en Foxtrot.");
    } else {
      lineas.push(...totales(alertas), "", "*Por supervisor*");
      for (const sup of supervisores) {
        const c = contar(
          alertas.filter((a) => esDelEquipo(a, sup.id_promotor)),
        );
        lineas.push(
          c.total
            ? `• ${nombreLindo(sup.nombre)}: ${plural(c.total, "rechazo")} · ${c.recuperados} re-entregados · ${c.respondidos} respondidos`
            : `• ${nombreLindo(sup.nombre)}: ${SIN_REGISTRO}`,
        );
      }
      lineas.push(
        ...porVendedor(alertas, () => true),
        ...sinRespuesta(alertas),
        ...pie,
      );
    }
    const texto = lineas.join("\n");
    for (const g of generales) {
      resumenes.push({
        tipo: "general",
        destinatario: g,
        texto,
        rechazos: alertas.length,
      });
    }
  }
  return resumenes;
}
