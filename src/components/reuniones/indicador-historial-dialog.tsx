"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  ListTodo,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getHistorialIndicador,
  type IndicadorHistorial,
} from "@/actions/reuniones-indicadores-observaciones";
import type { EstadoReunionActividad, TipoReunion } from "@/types/database";

export interface IndicadorHistorialRef {
  id: string;
  nombre: string;
  unidad?: string | null;
  meta?: number | null;
  gatillo?: number | null;
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

function formatValor(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

const ESTADO_LABEL: Record<EstadoReunionActividad, string> = {
  no_comenzada: "No comenzada",
  en_curso: "En curso",
  cerrada: "Cerrada",
};
const ESTADO_CLASE: Record<EstadoReunionActividad, string> = {
  no_comenzada:
    "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  en_curso: "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100",
  cerrada:
    "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

/**
 * Historial de un indicador del Tablero de control: todas las observaciones
 * y las actividades del Action Log atadas a él, en cualquier reunión del
 * mismo tipo. Se abre al hacer clic en el nombre del indicador en el cuadro.
 */
export function IndicadorHistorialDialog({
  open,
  onOpenChange,
  reunionTipo,
  reunionId,
  indicador,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reunionTipo: TipoReunion;
  /** Reunión desde la que se abre (sus filas no llevan link). */
  reunionId: string;
  indicador: IndicadorHistorialRef | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {indicador?.nombre ?? "Indicador"}
            {indicador?.unidad && (
              <span className="text-sm font-normal text-muted-foreground">
                ({indicador.unidad})
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {indicador &&
            (indicador.meta != null || indicador.gatillo != null) ? (
              <>
                Target {formatValor(indicador.meta)}
                {indicador.gatillo != null && (
                  <>
                    {" "}
                    · Gatillo{" "}
                    <span className="text-rose-600">
                      {formatValor(indicador.gatillo)}
                    </span>
                  </>
                )}
                {" · "}
              </>
            ) : null}
            Observaciones y acciones registradas para este indicador en todas
            las reuniones.
          </DialogDescription>
        </DialogHeader>

        {indicador && (
          <HistorialContenido
            key={indicador.id}
            reunionTipo={reunionTipo}
            reunionId={reunionId}
            indicadorId={indicador.id}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cuerpo del modal. Va con `key={indicador.id}` para que cada indicador
 * arranque con estado limpio: el efecto sólo dispara la carga y el estado se
 * fija cuando llega la respuesta.
 */
function HistorialContenido({
  reunionTipo,
  reunionId,
  indicadorId,
}: {
  reunionTipo: TipoReunion;
  reunionId: string;
  indicadorId: string;
}) {
  const [data, setData] = useState<IndicadorHistorial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getHistorialIndicador(reunionTipo, indicadorId).then((res) => {
      if (!vivo) return;
      if ("error" in res) setError(res.error);
      else setData(res.data);
    });
    return () => {
      vivo = false;
    };
  }, [reunionTipo, indicadorId]);

  const cargando = data === null && error === null;
  const obs = data?.observaciones ?? [];
  const acts = data?.actividades ?? [];
  const abiertas = acts.filter((a) => a.estado !== "cerrada").length;

  return (
    <>
      {cargando ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando historial…
        </div>
      ) : error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <MessageSquareText className="size-4 text-blue-600" />
              Observaciones
              <span className="font-normal text-muted-foreground">
                ({obs.length})
              </span>
            </h3>
            {obs.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Todavía no hay observaciones para este indicador.
              </p>
            ) : (
              <ul className="mt-2 divide-y rounded-md border">
                {obs.map((o) => (
                  <li key={o.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-slate-700">
                        {formatFecha(o.reunion_fecha)}
                      </span>
                      <span>· {o.autor_nombre ?? "—"}</span>
                      {o.reunion_id !== reunionId && (
                        <Link
                          href={`/reuniones/${o.reunion_id}`}
                          className="ml-auto inline-flex items-center gap-1 text-blue-700 hover:underline"
                          title="Ir a esa reunión"
                        >
                          Ver reunión
                          <ExternalLink className="size-3" />
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
                      {o.texto}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <ListTodo className="size-4 text-emerald-600" />
              Acciones
              <span className="font-normal text-muted-foreground">
                ({acts.length}
                {abiertas > 0 ? `, ${abiertas} abiertas` : ""})
              </span>
            </h3>
            {acts.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Sin acciones del Action Log atadas a este indicador. Se crean
                desde «Crear acción» debajo del tablero.
              </p>
            ) : (
              <ul className="mt-2 divide-y rounded-md border">
                {acts.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            a.estado === "cerrada"
                              ? "text-slate-500 line-through"
                              : "text-slate-900",
                          )}
                        >
                          {a.descripcion}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>
                            Reunión {formatFecha(a.reunion_origen_fecha)}
                          </span>
                          <span>
                            {a.responsable_nombre
                              ? `Resp: ${a.responsable_nombre}`
                              : "Sin responsable"}
                          </span>
                          {a.fecha_compromiso && (
                            <span>
                              Vence: {formatFecha(a.fecha_compromiso)}
                            </span>
                          )}
                          {a.completado_at && (
                            <span>
                              Cerrada:{" "}
                              {formatFecha(a.completado_at.slice(0, 10))}
                            </span>
                          )}
                        </div>
                        {a.observaciones && (
                          <p className="mt-0.5 text-xs text-slate-600">
                            {a.observaciones}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={ESTADO_CLASE[a.estado]}>
                          {ESTADO_LABEL[a.estado]}
                        </Badge>
                        {a.reunion_origen_id !== reunionId && (
                          <Link
                            href={`/reuniones/${a.reunion_origen_id}`}
                            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                            title="Ir a la reunión donde se creó"
                          >
                            Ver reunión
                            <ExternalLink className="size-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
