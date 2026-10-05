// Indicadores de efectividad del bot de rechazos: por bot, promotor, chofer
// y motivo. Cálculo puro sobre alertas + preguntas (lo usa la página
// /indicadores/foxtrot-tracking/alertas/efectividad).
//
// "Recuperado" = lo confirma Foxtrot (entrega OK del cliente después del
// rechazo, outcome recuperado_mismo_dia). "Evitado" = lo declara el vendedor.
// Un evitado sin confirmación de Foxtrot queda marcado para revisar.

import type { AlertaRechazo, PreguntaSeguimiento } from "./types";

const recuperado = (a: AlertaRechazo) => a.outcome === "recuperado_mismo_dia";
const conNota = (a: AlertaRechazo) => a.items.some((i) => !!i.notas?.trim());
const pct = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 100) : null;

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const minutos = (desde: string | null, hasta: string | null) =>
  desde && hasta
    ? Math.max(
        0,
        Math.round(
          (new Date(hasta).getTime() - new Date(desde).getTime()) / 60_000,
        ),
      )
    : null;

export interface KpisBot {
  avisados: number;
  recuperados: number;
  pctRecuperados: number | null;
  bultosRecuperados: number;
  evitados: number;
  reprogramados: number;
  perdidos: number;
  sinRespuesta: number;
  pctRespuesta: number | null;
  evitadosSinConfirmar: number;
  medianaMinRecupero: number | null;
}

export interface FilaPromotor {
  id: string;
  nombre: string;
  preguntas: number;
  respondidas: number;
  pctRespuesta: number | null;
  medianaMinRespuesta: number | null;
  evitados: number;
  reprogramados: number;
  perdidos: number;
  recuperadosFoxtrot: number;
  pctRecuperados: number | null;
}

export interface FilaChofer {
  chofer: string;
  rechazos: number;
  bultos: number;
  pctConNota: number | null;
  recuperados: number;
  pctRecuperados: number | null;
  evitados: number;
  motivoPrincipal: string | null;
}

export interface FilaMotivo {
  motivo: string;
  rechazos: number;
  recuperados: number;
  pctRecuperados: number | null;
  evitados: number;
  perdidos: number;
  solucionPrincipal: string | null;
}

export interface Efectividad {
  kpis: KpisBot;
  promotores: FilaPromotor[];
  choferes: FilaChofer[];
  motivos: FilaMotivo[];
  soluciones: { categoria: string; casos: number }[];
  causas: { categoria: string; casos: number }[];
}

function masFrecuente(xs: (string | null | undefined)[]): string | null {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function contar(xs: (string | null | undefined)[]) {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c]
    .map(([categoria, casos]) => ({ categoria, casos }))
    .sort((a, b) => b.casos - a.casos);
}

export function calcularEfectividad(
  todas: AlertaRechazo[],
  preguntas: PreguntaSeguimiento[],
): Efectividad {
  // Solo lo que de verdad se avisó por WhatsApp.
  const alertas = todas.filter(
    (a) => a.estado_envio === "enviada" || a.estado_envio === "parcial",
  );
  const porId = new Map(alertas.map((a) => [a.id, a]));
  const conResultado = alertas.filter((a) => a.seguimiento_resultado);
  const respondidas = conResultado.filter(
    (a) => a.seguimiento_resultado !== "sin_respuesta",
  );

  const kpis: KpisBot = {
    avisados: alertas.length,
    recuperados: alertas.filter(recuperado).length,
    pctRecuperados: pct(alertas.filter(recuperado).length, alertas.length),
    bultosRecuperados: alertas
      .filter(recuperado)
      .reduce((s, a) => s + (Number(a.bultos) || 0), 0),
    evitados: alertas.filter((a) => a.seguimiento_resultado === "evitado")
      .length,
    reprogramados: alertas.filter(
      (a) => a.seguimiento_resultado === "reprogramado",
    ).length,
    perdidos: alertas.filter((a) => a.seguimiento_resultado === "perdido")
      .length,
    sinRespuesta: alertas.filter(
      (a) => a.seguimiento_resultado === "sin_respuesta",
    ).length,
    pctRespuesta: pct(respondidas.length, conResultado.length),
    evitadosSinConfirmar: alertas.filter(
      (a) => a.seguimiento_resultado === "evitado" && !recuperado(a),
    ).length,
    medianaMinRecupero: mediana(
      alertas
        .filter(recuperado)
        .map((a) => minutos(a.enviada_at, a.outcome_at))
        .filter((m): m is number => m != null),
    ),
  };

  // Promotores: desde las preguntas (cada vendedor avisado tiene la suya).
  const promo = new Map<
    string,
    { nombre: string; ps: PreguntaSeguimiento[] }
  >();
  for (const p of preguntas) {
    if (!porId.has(p.alerta_id)) continue;
    const g = promo.get(p.id_promotor) ?? {
      nombre: p.nombre ?? p.id_promotor,
      ps: [],
    };
    g.ps.push(p);
    promo.set(p.id_promotor, g);
  }
  const promotores: FilaPromotor[] = [...promo].map(([id, g]) => {
    // Las que le tocaba contestar: no cuentan las que respondió otro antes.
    const suyas = g.ps.filter(
      (p) => p.estado !== "cerrada_por_otro" && p.estado !== "en_cola",
    );
    const contesto = g.ps.filter((p) => p.opcion != null);
    const alertasSuyas = [...new Set(g.ps.map((p) => p.alerta_id))].map((x) =>
      porId.get(x)!,
    );
    const recup = alertasSuyas.filter(recuperado).length;
    return {
      id,
      nombre: g.nombre,
      preguntas: suyas.length,
      respondidas: contesto.length,
      pctRespuesta: pct(contesto.length, suyas.length),
      medianaMinRespuesta: mediana(
        contesto
          .map((p) => minutos(p.preguntada_at, p.respondida_at))
          .filter((m): m is number => m != null),
      ),
      evitados: contesto.filter((p) => p.opcion === 1).length,
      reprogramados: contesto.filter((p) => p.opcion === 2).length,
      perdidos: contesto.filter((p) => p.opcion === 3).length,
      recuperadosFoxtrot: recup,
      pctRecuperados: pct(recup, alertasSuyas.length),
    };
  });
  promotores.sort(
    (a, b) =>
      b.preguntas - a.preguntas ||
      (b.pctRecuperados ?? -1) - (a.pctRecuperados ?? -1),
  );

  const agrupar = <K extends string>(clave: (a: AlertaRechazo) => K) => {
    const m = new Map<K, AlertaRechazo[]>();
    for (const a of alertas) {
      const k = clave(a);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m];
  };

  const choferes: FilaChofer[] = agrupar(
    (a) => a.chofer_nombre ?? "(sin chofer)",
  )
    .map(([chofer, as]) => ({
      chofer,
      rechazos: as.length,
      bultos: as.reduce((s, a) => s + (Number(a.bultos) || 0), 0),
      pctConNota: pct(as.filter(conNota).length, as.length),
      recuperados: as.filter(recuperado).length,
      pctRecuperados: pct(as.filter(recuperado).length, as.length),
      evitados: as.filter((a) => a.seguimiento_resultado === "evitado").length,
      motivoPrincipal: masFrecuente(as.flatMap((a) => a.motivos)),
    }))
    .sort((a, b) => b.rechazos - a.rechazos);

  const motivos: FilaMotivo[] = agrupar((a) => a.motivos[0] ?? "Sin motivo")
    .map(([motivo, as]) => ({
      motivo,
      rechazos: as.length,
      recuperados: as.filter(recuperado).length,
      pctRecuperados: pct(as.filter(recuperado).length, as.length),
      evitados: as.filter((a) => a.seguimiento_resultado === "evitado").length,
      perdidos: as.filter((a) => a.seguimiento_resultado === "perdido").length,
      solucionPrincipal: masFrecuente(
        as
          .filter(
            (a) =>
              a.seguimiento_resultado === "evitado" ||
              a.seguimiento_resultado === "reprogramado",
          )
          .map((a) => a.seguimiento_categoria),
      ),
    }))
    .sort((a, b) => b.rechazos - a.rechazos);

  return {
    kpis,
    promotores,
    choferes,
    motivos,
    soluciones: contar(
      respondidas
        .filter((a) => a.seguimiento_resultado !== "perdido")
        .map((a) => a.seguimiento_categoria),
    ),
    causas: contar(
      respondidas
        .filter((a) => a.seguimiento_resultado === "perdido")
        .map((a) => a.seguimiento_categoria),
    ),
  };
}
