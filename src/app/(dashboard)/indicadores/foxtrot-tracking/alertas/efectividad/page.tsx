import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getAlertas, getPreguntasSeguimiento } from "@/actions/foxtrot-alertas";
import { calcularEfectividad } from "@/lib/foxtrot-alertas/efectividad";
import { CATEGORIAS } from "@/lib/foxtrot-alertas/seguimiento";
import type {
  AlertaRechazo,
  ResultadoSeguimiento,
} from "@/lib/foxtrot-alertas/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90] as const;

const RESULTADO_LABEL: Record<ResultadoSeguimiento, string> = {
  evitado: "Evitado",
  reprogramado: "Reprogramado",
  perdido: "Perdido",
  sin_respuesta: "Sin respuesta",
};
const RESULTADO_BADGE: Record<ResultadoSeguimiento, string> = {
  evitado: "bg-emerald-100 text-emerald-800",
  reprogramado: "bg-sky-100 text-sky-800",
  perdido: "bg-red-100 text-red-800",
  sin_respuesta: "bg-slate-100 text-slate-600",
};

const fmtPct = (n: number | null) => (n == null ? "—" : `${n}%`);
const fmtMin = (n: number | null) =>
  n == null
    ? "—"
    : n < 60
      ? `${n} min`
      : `${Math.floor(n / 60)} h ${n % 60} min`;
const categoria = (k: string | null) => (k ? (CATEGORIAS[k] ?? k) : "—");

function fechaArtMenosDias(dias: number): string {
  return new Date(Date.now() - 3 * 3600_000 - dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function Kpi({
  titulo,
  valor,
  detalle,
  tono,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={`text-2xl font-semibold tabular-nums ${tono ?? "text-slate-900"}`}
        >
          {valor}
        </p>
        {detalle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function EfectividadBotPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireAuth();
  const { dias: diasParam } = await searchParams;
  const dias = PERIODOS.find((p) => String(p) === diasParam) ?? 30;
  const desde = fechaArtMenosDias(dias - 1);

  const [alertasRes, preguntasRes] = await Promise.all([
    getAlertas({ desde }),
    getPreguntasSeguimiento({ desde }),
  ]);
  const alertas = "data" in alertasRes ? alertasRes.data : [];
  const preguntas = "data" in preguntasRes ? preguntasRes.data : [];
  const ef = calcularEfectividad(alertas, preguntas);
  const k = ef.kpis;

  const respuestas = alertas
    .filter(
      (
        a,
      ): a is AlertaRechazo & { seguimiento_resultado: ResultadoSeguimiento } =>
        !!a.seguimiento_resultado &&
        a.seguimiento_resultado !== "sin_respuesta",
    )
    .slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/indicadores/foxtrot-tracking/alertas"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a alertas
        </Link>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`?dias=${p}`}
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                p === dias
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p} días
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h1 className="text-xl font-semibold">
          Efectividad del bot de rechazos
        </h1>
        <p className="text-sm text-muted-foreground">
          Desde el {desde.split("-").reverse().join("/")}.{" "}
          <strong>Recuperado</strong> = Foxtrot registró una entrega OK del
          cliente después del rechazo. <strong>Evitado</strong> = lo que
          respondió el vendedor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Kpi titulo="Rechazos avisados" valor={String(k.avisados)} />
        <Kpi
          titulo="Clientes recuperados"
          valor={String(k.recuperados)}
          detalle={`${fmtPct(k.pctRecuperados)} · confirmado por Foxtrot`}
          tono="text-emerald-700"
        />
        <Kpi
          titulo="Bultos recuperados"
          valor={String(k.bultosRecuperados)}
          detalle="sin contar parciales"
        />
        <Kpi
          titulo="Tiempo aviso → re-entrega"
          valor={fmtMin(k.medianaMinRecupero)}
          detalle="mediana"
        />
        <Kpi
          titulo="Respuesta de vendedores"
          valor={fmtPct(k.pctRespuesta)}
          detalle={`${k.sinRespuesta} sin respuesta`}
        />
        <Kpi
          titulo="Evitados sin confirmar"
          valor={String(k.evitadosSinConfirmar)}
          detalle="dicen evitado, Foxtrot no lo ve"
          tono={k.evitadosSinConfirmar ? "text-amber-700" : undefined}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi
          titulo="Evitados (vendedor)"
          valor={String(k.evitados)}
          tono="text-emerald-700"
        />
        <Kpi
          titulo="Reprogramados"
          valor={String(k.reprogramados)}
          tono="text-sky-700"
        />
        <Kpi titulo="Perdidos" valor={String(k.perdidos)} tono="text-red-700" />
        <Kpi titulo="Sin respuesta" valor={String(k.sinRespuesta)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Promotores</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promotor</TableHead>
                <TableHead className="text-right">Preguntas</TableHead>
                <TableHead className="text-right">% respuesta</TableHead>
                <TableHead className="text-right">
                  Tiempo de respuesta
                </TableHead>
                <TableHead className="text-right">Evitados</TableHead>
                <TableHead className="text-right">Reprog.</TableHead>
                <TableHead className="text-right">Perdidos</TableHead>
                <TableHead className="text-right">
                  Recuperados (Foxtrot)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ef.promotores.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Todavía no hay preguntas de seguimiento en el período.
                  </TableCell>
                </TableRow>
              )}
              {ef.promotores.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.preguntas}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(p.pctRespuesta)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMin(p.medianaMinRespuesta)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.evitados}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.reprogramados}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.perdidos}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.recuperadosFoxtrot}{" "}
                    <span className="text-muted-foreground">
                      ({fmtPct(p.pctRecuperados)})
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Choferes</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chofer</TableHead>
                  <TableHead className="text-right">Rechazos</TableHead>
                  <TableHead className="text-right">Bultos</TableHead>
                  <TableHead className="text-right">Con nota</TableHead>
                  <TableHead className="text-right">Recuperados</TableHead>
                  <TableHead>Motivo principal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ef.choferes.map((c) => (
                  <TableRow key={c.chofer}>
                    <TableCell className="font-medium">{c.chofer}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.rechazos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.bultos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(c.pctConNota)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.recuperados}{" "}
                      <span className="text-muted-foreground">
                        ({fmtPct(c.pctRecuperados)})
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.motivoPrincipal ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              «Con nota»: rechazos donde el chofer cargó una nota en Foxtrot.
              Sin nota el vendedor no sabe qué pasó.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por motivo</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Rechazos</TableHead>
                  <TableHead className="text-right">Recuperados</TableHead>
                  <TableHead className="text-right">Perdidos</TableHead>
                  <TableHead>Solución más usada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ef.motivos.map((m) => (
                  <TableRow key={m.motivo}>
                    <TableCell className="font-medium">{m.motivo}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.rechazos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.recuperados}{" "}
                      <span className="text-muted-foreground">
                        ({fmtPct(m.pctRecuperados)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.perdidos}
                    </TableCell>
                    <TableCell className="text-xs">
                      {categoria(m.solucionPrincipal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            ["Qué funcionó (evitados y reprogramados)", ef.soluciones],
            ["Por qué se perdieron", ef.causas],
          ] as const
        ).map(([titulo, filas]) => (
          <Card key={titulo}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{titulo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {filas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin respuestas todavía.
                </p>
              )}
              {filas.map((f) => (
                <div
                  key={f.categoria}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{categoria(f.categoria)}</span>
                  <span className="tabular-nums font-medium">{f.casos}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimas respuestas</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Respondió</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Cómo</TableHead>
                <TableHead>Foxtrot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respuestas.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Sin respuestas en el período.
                  </TableCell>
                </TableRow>
              )}
              {respuestas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {a.fecha.split("-").reverse().join("/")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.cliente_nombre ?? `cod. ${a.id_cliente}`}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.motivos.join(" / ")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.seguimiento_por_nombre ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={RESULTADO_BADGE[a.seguimiento_resultado]}>
                      {RESULTADO_LABEL[a.seguimiento_resultado]}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-xs text-xs"
                    title={a.seguimiento_como ?? undefined}
                  >
                    {a.seguimiento_resumen ?? a.seguimiento_como ?? "—"}
                    {a.seguimiento_categoria && (
                      <span className="block text-muted-foreground">
                        {categoria(a.seguimiento_categoria)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.outcome === "recuperado_mismo_dia" ? (
                      <span className="text-emerald-700">✓ Re-entregado</span>
                    ) : a.seguimiento_resultado === "evitado" ? (
                      <span className="text-amber-700">⚠ Sin confirmar</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
