"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Loader2, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ActividadFormDialog } from "./actividad-form-dialog";
import { DetalleActividadDialog } from "./detalle-actividad-dialog";
import { eliminarActividad } from "@/actions/reuniones";
import type {
  EstadoReunionActividad,
  ReunionActividadConResponsable,
  TipoReunion,
} from "@/types/database";

interface ResponsableOpt {
  id: string;
  nombre: string;
  email: string;
}

function EstadoBadge({ estado }: { estado: EstadoReunionActividad }) {
  if (estado === "cerrada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Cerrada
      </Badge>
    );
  }
  if (estado === "en_curso") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En curso
      </Badge>
    );
  }
  return (
    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
      No comenzada
    </Badge>
  );
}

type FiltroEstado = "todas" | EstadoReunionActividad;

const FILTROS: {
  key: FiltroEstado;
  label: string;
  activo: string;
}[] = [
  {
    key: "todas",
    label: "Todas",
    activo: "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700",
  },
  {
    key: "no_comenzada",
    label: "No comenzadas",
    activo: "border-slate-500 bg-slate-100 font-semibold text-slate-800",
  },
  {
    key: "en_curso",
    label: "En curso",
    activo: "border-amber-500 bg-amber-50 font-semibold text-amber-700",
  },
  {
    key: "cerrada",
    label: "Cerradas",
    activo: "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700",
  },
];

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Action Log embebido y acotado a una sección de la reunión. Reutiliza el
 * mismo formulario y diálogo de detalle del action log general, pero solo
 * lista/crea compromisos de la sección indicada (los nuevos quedan etiquetados
 * con `seccion`).
 */
export function ActionLogSeccion({
  reunionId,
  reunionTipo,
  seccion,
  titulo,
  actividades,
  responsables,
  puedeEditar,
  onChanged,
  indicador,
  ocultarNuevo,
  onVerIndicador,
  vacioTexto,
}: {
  reunionId: string;
  reunionTipo: TipoReunion;
  seccion: string;
  titulo: string;
  actividades: ReunionActividadConResponsable[];
  responsables: ResponsableOpt[];
  puedeEditar: boolean;
  onChanged: () => void;
  /** Tablero de control: el compromiso nuevo queda atado a este indicador. */
  indicador?: { id: string; nombre: string } | null;
  /** Oculta el botón «Compromiso» del encabezado (la sección tiene el suyo). */
  ocultarNuevo?: boolean;
  /** Si viene, cada compromiso muestra su indicador como chip clickeable. */
  onVerIndicador?: (indicadorId: string) => void;
  vacioTexto?: string;
}) {
  const [openForm, setOpenForm] = useState(false);
  const [editando, setEditando] =
    useState<ReunionActividadConResponsable | null>(null);
  const [detalle, setDetalle] = useState<ReunionActividadConResponsable | null>(
    null,
  );
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas");

  const conteos = useMemo(() => {
    const c = { no_comenzada: 0, en_curso: 0, cerrada: 0 };
    for (const a of actividades) {
      if (a.estado in c) c[a.estado as keyof typeof c]++;
    }
    return c;
  }, [actividades]);

  const actividadesFiltradas = useMemo(() => {
    if (filtroEstado === "todas") return actividades;
    return actividades.filter((a) => a.estado === filtroEstado);
  }, [actividades, filtroEstado]);

  function handleBorrar(act: ReunionActividadConResponsable) {
    if (
      !confirm(
        `¿Eliminar el compromiso "${act.descripcion.slice(0, 60)}${
          act.descripcion.length > 60 ? "…" : ""
        }"?`,
      )
    )
      return;
    setBorrandoId(act.id);
    startDelete(async () => {
      const res = await eliminarActividad(act.id);
      setBorrandoId(null);
      if (res && "error" in res) {
        alert(res.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <ListTodo className="size-4 text-emerald-600" />
          Action Log — {titulo}
          <span className="font-normal text-muted-foreground">
            ({actividades.length})
          </span>
        </div>
        {puedeEditar && !ocultarNuevo && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setEditando(null);
              setOpenForm(true);
            }}
          >
            <Plus className="mr-1 size-3.5" />
            Compromiso
          </Button>
        )}
      </div>

      {actividades.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          {vacioTexto ?? "Sin compromisos en esta sección."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2 text-xs">
            <span className="mr-1 font-medium text-slate-600">Estado:</span>
            {FILTROS.map((f) => {
              const n = f.key === "todas" ? actividades.length : conteos[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFiltroEstado(f.key)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition",
                    filtroEstado === f.key
                      ? f.activo
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {f.label} ({n})
                </button>
              );
            })}
          </div>
          {actividadesFiltradas.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">
                Ningún compromiso coincide con este filtro.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => setFiltroEstado("todas")}
              >
                Ver todas
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {actividadesFiltradas.map((act) => (
                <li
                  key={act.id}
                  className="flex items-start justify-between gap-3 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {onVerIndicador &&
                      act.indicador_id &&
                      act.indicador_nombre && (
                        <button
                          type="button"
                          onClick={() => onVerIndicador(act.indicador_id!)}
                          className="mt-0.5 shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                          title="Ver el historial del indicador"
                        >
                          {act.indicador_nombre}
                        </button>
                      )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDetalle(act)}
                    >
                      <p className="text-sm text-slate-800">
                        {act.descripcion}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {act.responsable_nombre ?? "Sin responsable"} ·{" "}
                        {formatFecha(act.fecha_compromiso)}
                      </p>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <EstadoBadge estado={act.estado} />
                    {puedeEditar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleBorrar(act)}
                        disabled={borrandoId === act.id}
                        title="Eliminar compromiso"
                      >
                        {borrandoId === act.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Crear / editar (etiqueta seccion al crear) */}
      <ActividadFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        reunionId={reunionId}
        reunionTipo={reunionTipo}
        actividad={editando}
        responsables={responsables}
        seccion={seccion}
        indicador={indicador}
        onSaved={() => {
          setOpenForm(false);
          setEditando(null);
          onChanged();
        }}
      />

      {/* Detalle / avances / cambio de estado */}
      {detalle && (
        <DetalleActividadDialog
          open={!!detalle}
          onOpenChange={(o) => !o && setDetalle(null)}
          actividad={detalle}
          puedeResponder={puedeEditar}
          onSaved={() => {
            setDetalle(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
