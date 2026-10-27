"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ExternalLink,
  ListTodo,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  actualizarObservacionIndicador,
  crearObservacionIndicador,
  eliminarObservacionIndicador,
} from "@/actions/reuniones-indicadores-observaciones";
import {
  slaIndicadorId,
  TIPO_REUNION_LABEL,
} from "@/lib/reuniones-sla-observaciones";
import { ActividadFormDialog } from "./actividad-form-dialog";
import { formatFechaHora } from "./tablero-observaciones";
import type {
  ReunionIndicadorObservacionConAutor,
  S5SectorAlmacen,
  TipoReunion,
} from "@/types/database";

interface SlaOpt {
  codigo: string;
  nombre: string;
}

interface ResponsableOpt {
  id: string;
  nombre: string;
  email: string;
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Observaciones de la sección "Cumplimiento de SLA". Mismo esquema que las
 * observaciones del Tablero de control (Etapa 3): se elige el SLA, se escribe
 * qué pasó y queda registrado; desde acá también nace una acción del Action
 * Log atada al SLA. Lo que se carga en una reunión se ve en todas las que
 * revisan ese SLA (Logística, Ventas-Logística, Warehouse): las de otras
 * reuniones vienen con la etiqueta de dónde se cargaron y un link.
 */
export function SlaObservaciones({
  reunionId,
  reunionTipo,
  slas,
  observaciones,
  responsables,
  sectoresAlmacen,
  vehiculos,
  rubrosMantenimiento,
  puedeEditar,
  seccion,
  onChanged,
  onVerHistorial,
}: {
  reunionId: string;
  reunionTipo: TipoReunion;
  /** SLA que se ven en esta reunión (los elegibles para la observación). */
  slas: SlaOpt[];
  observaciones: ReunionIndicadorObservacionConAutor[];
  responsables: ResponsableOpt[];
  sectoresAlmacen?: S5SectorAlmacen[];
  vehiculos?: { id: string; dominio: string }[];
  rubrosMantenimiento?: { id: string; nombre: string }[];
  puedeEditar: boolean;
  /** Sección del Action Log donde queda la acción creada desde acá. */
  seccion: string;
  onChanged: () => void;
  onVerHistorial: (indicadorId: string) => void;
}) {
  const [codigo, setCodigo] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const [openAccion, setOpenAccion] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  const slaSel = slas.find((s) => s.codigo === codigo) ?? null;

  function handleGuardar() {
    if (!slaSel) {
      toast.error("Elegí a qué SLA corresponde la observación.");
      return;
    }
    if (!texto.trim()) {
      toast.error("Escribí la observación.");
      return;
    }
    startTransition(async () => {
      const res = await crearObservacionIndicador({
        reunionId,
        indicadorId: slaIndicadorId(slaSel.codigo),
        indicadorNombre: slaSel.nombre,
        texto,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setTexto("");
      toast.success("Observación registrada.");
      onChanged();
    });
  }

  function handleGuardarEdicion(id: string) {
    if (!editTexto.trim()) {
      toast.error("Escribí la observación.");
      return;
    }
    startTransition(async () => {
      const res = await actualizarObservacionIndicador(id, editTexto);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setEditandoId(null);
      onChanged();
    });
  }

  function handleBorrar(obs: ReunionIndicadorObservacionConAutor) {
    if (
      !confirm(
        `¿Eliminar la observación sobre ${obs.indicador_nombre}?\n\n"${obs.texto.slice(0, 80)}${
          obs.texto.length > 80 ? "…" : ""
        }"`,
      )
    )
      return;
    setBorrandoId(obs.id);
    startTransition(async () => {
      const res = await eliminarObservacionIndicador(obs.id);
      setBorrandoId(null);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <MessageSquareText className="size-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-violet-900">
          Observaciones de SLA
        </h3>
        <span className="text-xs text-muted-foreground">
          ({observaciones.length})
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Si un SLA no cumplió o pasó algo, dejalo acotado acá eligiendo el SLA.
        Las observaciones y las acciones se comparten con las otras reuniones
        que revisan ese SLA. Haciendo clic en el nombre del SLA en el cuadro se
        ve todo su historial.
      </p>

      {puedeEditar && (
        <div className="mt-3 rounded-md border border-violet-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
            <div className="space-y-1.5">
              <Label>SLA</Label>
              <Select
                value={slaSel ? codigo : ""}
                onValueChange={(v: string | null) => setCodigo(v ?? "")}
                disabled={pending || slas.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí el SLA…" />
                </SelectTrigger>
                <SelectContent>
                  {slas.map((s) => (
                    <SelectItem key={s.codigo} value={s.codigo}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sla_obs_texto">Observación</Label>
              <Textarea
                id="sla_obs_texto"
                rows={2}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Qué pasó, por qué no cumplió, qué se decidió…"
                disabled={pending}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !slaSel}
              onClick={() => setOpenAccion(true)}
              title={
                slaSel
                  ? `Crear una actividad del Action Log atada a ${slaSel.nombre}`
                  : "Elegí primero el SLA"
              }
            >
              <ListTodo className="mr-2 size-4" />
              Crear acción
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleGuardar}
              disabled={pending || !slaSel || !texto.trim()}
            >
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Registrar observación
            </Button>
          </div>
        </div>
      )}

      {observaciones.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          Sin observaciones de SLA en el período.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border bg-white">
          {observaciones.map((obs) => {
            const propia = obs.reunion_id === reunionId;
            return (
              <li key={obs.id} className="flex items-start gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onVerHistorial(obs.indicador_id)}
                  className="mt-0.5 shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                  title="Ver el historial del SLA"
                >
                  {obs.indicador_nombre}
                </button>
                <div className="min-w-0 flex-1">
                  {editandoId === obs.id ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        value={editTexto}
                        onChange={(e) => setEditTexto(e.target.value)}
                        disabled={pending}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditandoId(null)}
                          disabled={pending}
                        >
                          <X className="mr-1 size-3.5" />
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleGuardarEdicion(obs.id)}
                          disabled={pending || !editTexto.trim()}
                        >
                          Guardar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {obs.texto}
                    </p>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span>
                      {obs.autor_nombre ?? "—"} · {formatFechaHora(obs.created_at)}
                    </span>
                    {!propia && (
                      <Link
                        href={`/reuniones/${obs.reunion_id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 text-slate-700 hover:underline"
                        title="Ir a la reunión donde se cargó"
                      >
                        {obs.reunion_tipo
                          ? TIPO_REUNION_LABEL[obs.reunion_tipo]
                          : "Otra reunión"}{" "}
                        {formatFecha(obs.reunion_fecha)}
                        <ExternalLink className="size-3" />
                      </Link>
                    )}
                  </p>
                </div>
                {puedeEditar && propia && editandoId !== obs.id && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        setEditandoId(obs.id);
                        setEditTexto(obs.texto);
                      }}
                      title="Editar"
                      disabled={pending}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-red-600 hover:text-red-700"
                      onClick={() => handleBorrar(obs)}
                      title="Eliminar"
                      disabled={pending || borrandoId === obs.id}
                    >
                      {borrandoId === obs.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {slaSel && (
        <ActividadFormDialog
          open={openAccion}
          onOpenChange={setOpenAccion}
          reunionId={reunionId}
          reunionTipo={reunionTipo}
          responsables={responsables}
          sectoresAlmacen={sectoresAlmacen}
          vehiculos={vehiculos}
          rubrosMantenimiento={rubrosMantenimiento}
          seccion={seccion}
          indicador={{ id: slaIndicadorId(slaSel.codigo), nombre: slaSel.nombre }}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
