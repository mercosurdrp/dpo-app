"use client";

import { useState, useTransition } from "react";
import {
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
import { ActividadFormDialog } from "./actividad-form-dialog";
import { ActionLogSeccion } from "./action-log-seccion";
import type {
  ReunionActividadConResponsable,
  ReunionIndicadorObservacionConAutor,
  S5SectorAlmacen,
  TipoReunion,
} from "@/types/database";

/**
 * Sección de las actividades que nacen del Tablero de control. Quedan en su
 * propio Action Log debajo del tablero (no en el general de la Etapa 2) y en
 * el historial del indicador.
 */
export const SECCION_TABLERO = "tablero";

interface IndicadorOpt {
  id: string;
  nombre: string;
}

interface ResponsableOpt {
  id: string;
  nombre: string;
  email: string;
}

/** Fecha y hora de carga de la observación (dd/mm/aa hh:mm, hora Argentina). */
export function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fecha = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${fecha} ${hora}`;
}

/**
 * Observaciones del Tablero de control (Etapa 3). Van debajo del cuadro de
 * indicadores: se elige el indicador, se escribe qué pasó (no cumplió, hubo
 * un evento) y queda registrado en la reunión. Desde acá también se abre
 * una acción del Action Log ya atada al indicador. Todo lo que se carga acá
 * se vuelve a ver en el historial del indicador (clic en su nombre).
 */
export function TableroObservaciones({
  reunionId,
  reunionTipo,
  indicadores,
  observaciones,
  actividades,
  responsables,
  sectoresAlmacen,
  vehiculos,
  rubrosMantenimiento,
  puedeEditar,
  onChanged,
  onVerHistorial,
}: {
  reunionId: string;
  reunionTipo: TipoReunion;
  indicadores: IndicadorOpt[];
  observaciones: ReunionIndicadorObservacionConAutor[];
  /** Actividades de la sección «tablero» (las que nacieron acá). */
  actividades: ReunionActividadConResponsable[];
  responsables: ResponsableOpt[];
  sectoresAlmacen?: S5SectorAlmacen[];
  vehiculos?: { id: string; dominio: string }[];
  rubrosMantenimiento?: { id: string; nombre: string }[];
  puedeEditar: boolean;
  onChanged: () => void;
  onVerHistorial: (indicadorId: string) => void;
}) {
  const [indicadorId, setIndicadorId] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const [openAccion, setOpenAccion] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  // Si el indicador elegido desaparece del tablero (cambió la config), el
  // selector vuelve a "elegir" solo: se deriva, no se sincroniza.
  const indicadorSel = indicadores.find((i) => i.id === indicadorId) ?? null;

  function handleGuardar() {
    if (!indicadorSel) {
      toast.error("Elegí a qué indicador corresponde la observación.");
      return;
    }
    if (!texto.trim()) {
      toast.error("Escribí la observación.");
      return;
    }
    startTransition(async () => {
      const res = await crearObservacionIndicador({
        reunionId,
        indicadorId: indicadorSel.id,
        indicadorNombre: indicadorSel.nombre,
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
    <div className="border-t px-4 pt-3">
      <div className="flex items-center gap-2">
        <MessageSquareText className="size-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-blue-900">
          Observaciones del tablero
        </h3>
        <span className="text-xs text-muted-foreground">
          ({observaciones.length})
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Si un indicador no cumplió o pasó algo, dejalo acotado acá eligiendo el
        indicador. Las acciones que salen del tablero quedan en el Action Log de
        abajo. Haciendo clic en el nombre del indicador en el cuadro se ve todo
        su historial.
      </p>

      {puedeEditar && (
        <div className="mt-3 rounded-md border border-blue-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
            <div className="space-y-1.5">
              <Label>Indicador</Label>
              <Select
                value={indicadorSel ? indicadorId : ""}
                onValueChange={(v: string | null) => setIndicadorId(v ?? "")}
                disabled={pending || indicadores.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí el indicador…" />
                </SelectTrigger>
                <SelectContent>
                  {indicadores.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tablero_obs_texto">Observación</Label>
              <Textarea
                id="tablero_obs_texto"
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
              disabled={pending || !indicadorSel}
              onClick={() => setOpenAccion(true)}
              title={
                indicadorSel
                  ? `Crear una actividad del Action Log atada a ${indicadorSel.nombre}`
                  : "Elegí primero el indicador"
              }
            >
              <ListTodo className="mr-2 size-4" />
              Crear acción
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleGuardar}
              disabled={pending || !indicadorSel || !texto.trim()}
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
          Sin observaciones en esta reunión.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border bg-white">
          {observaciones.map((obs) => (
            <li key={obs.id} className="flex items-start gap-3 px-3 py-2">
              <button
                type="button"
                onClick={() => onVerHistorial(obs.indicador_id)}
                className="mt-0.5 shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                title="Ver el historial del indicador"
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
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {obs.autor_nombre ?? "—"} · {formatFechaHora(obs.created_at)}
                </p>
              </div>
              {puedeEditar && editandoId !== obs.id && (
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
          ))}
        </ul>
      )}

      <div className="mt-4 pb-1">
        <ActionLogSeccion
          reunionId={reunionId}
          reunionTipo={reunionTipo}
          seccion={SECCION_TABLERO}
          titulo="Tablero de control"
          actividades={actividades}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onChanged={onChanged}
          ocultarNuevo
          onVerIndicador={onVerHistorial}
          vacioTexto="Sin acciones del tablero. Elegí un indicador arriba y tocá «Crear acción»."
        />
      </div>

      {indicadorSel && (
        <ActividadFormDialog
          open={openAccion}
          onOpenChange={setOpenAccion}
          reunionId={reunionId}
          reunionTipo={reunionTipo}
          responsables={responsables}
          sectoresAlmacen={sectoresAlmacen}
          vehiculos={vehiculos}
          rubrosMantenimiento={rubrosMantenimiento}
          seccion={SECCION_TABLERO}
          indicador={{ id: indicadorSel.id, nombre: indicadorSel.nombre }}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
