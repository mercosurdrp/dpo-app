"use client";

/**
 * Editar la ficha de una unidad sin salir de la pantalla donde se vio el error.
 *
 * El maestro de flota mostraba el padrón entero pero era de sólo lectura: para
 * corregir una ciudad mal cargada había que entrar a la ficha de la unidad,
 * editar y volver. Con la tabla a la vista es donde se nota el dato equivocado
 * (tres camiones en Pergamino cuando sólo uno está ahí), así que el lápiz tiene
 * que estar en la fila.
 *
 * Los campos son los mismos de `actualizarFichaVehiculo` (CAMPOS_FICHA), se
 * agrupan igual que las vistas del maestro, y la vista desde la que se abrió va
 * primero: quien toca el lápiz en Asignación quiere cambiar chofer o ubicación,
 * no el VIN.
 *
 * Ciudad, centro de costo y chofer van con sugerencias de lo que ya existe en la
 * flota: los tres son texto libre y una grafía nueva ("Pergamino " con espacio,
 * "A. Cerbin") arma una ubicación o un chofer duplicado que después hay que
 * salir a cazar. Ver `lib/flota/cil-choferes.ts`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { actualizarFichaVehiculo } from "@/actions/vehiculos-ficha";
import type { CampoFicha, VehiculoFicha } from "@/types/database";

export type GrupoFicha = "identificacion" | "asignacion";

type Campo = {
  key: CampoFicha;
  label: string;
  grupo: GrupoFicha;
  sugerencias?: SugerenciaKey;
};
type SugerenciaKey = "ciudad" | "centro_costo" | "chofer_asignado";

const CAMPOS: Campo[] = [
  // Identificación — lo que pide el manual de flota (R1.1.2).
  { key: "numero_asignado", label: "N.º asignado", grupo: "identificacion" },
  { key: "marca", label: "Marca", grupo: "identificacion" },
  { key: "modelo", label: "Modelo", grupo: "identificacion" },
  { key: "anio", label: "Año", grupo: "identificacion" },
  { key: "color", label: "Color", grupo: "identificacion" },
  { key: "tipo_unidad", label: "Tipo de unidad", grupo: "identificacion" },
  { key: "chasis", label: "N° de chasis", grupo: "identificacion" },
  { key: "vin", label: "VIN", grupo: "identificacion" },
  { key: "motor", label: "N° de motor", grupo: "identificacion" },
  {
    key: "capacidad_carga",
    label: "Capacidad de carga",
    grupo: "identificacion",
  },
  { key: "tara_kg", label: "Tara (kg)", grupo: "identificacion" },
  { key: "carroceria", label: "Carrocería", grupo: "identificacion" },
  // Asignación — a quién y a dónde responde la unidad.
  {
    key: "chofer_asignado",
    label: "Chofer asignado",
    grupo: "asignacion",
    sugerencias: "chofer_asignado",
  },
  {
    key: "centro_costo",
    label: "Centro de costo",
    grupo: "asignacion",
    sugerencias: "centro_costo",
  },
  {
    key: "ciudad",
    label: "Ubicación (ciudad)",
    grupo: "asignacion",
    sugerencias: "ciudad",
  },
  { key: "telemetria", label: "Telemetría / GPS", grupo: "asignacion" },
  { key: "combustible", label: "Combustible", grupo: "asignacion" },
  { key: "combustible_aux", label: "Combustible aux.", grupo: "asignacion" },
];

const GRUPO_LABEL: Record<GrupoFicha, string> = {
  identificacion: "Identificación",
  asignacion: "Asignación",
};

export interface SugerenciasFicha {
  ciudad: string[];
  centro_costo: string[];
  chofer_asignado: string[];
}

interface Props {
  /** `null` = cerrado. Al abrir se precargan los valores de esa unidad. */
  unidad: { dominio: string; ficha: VehiculoFicha | null } | null;
  onClose: () => void;
  /** Grupo que se muestra primero: el de la vista desde la que se abrió. */
  foco?: GrupoFicha;
  sugerencias: SugerenciasFicha;
}

export function EditarFichaDialog({
  unidad,
  onClose,
  foco = "identificacion",
  sugerencias,
}: Props) {
  return (
    <Dialog
      open={unidad != null}
      onOpenChange={(abierto) => !abierto && onClose()}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar ficha — {unidad?.dominio ?? ""}</DialogTitle>
        </DialogHeader>
        {/* El formulario se monta por unidad (`key`): así los valores de la ficha
            son el estado inicial y no hay que sincronizarlos cuando se abre el
            lápiz de otra fila sin cerrar el diálogo. */}
        {unidad && (
          <Formulario
            key={unidad.dominio}
            unidad={unidad}
            onClose={onClose}
            foco={foco}
            sugerencias={sugerencias}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  unidad,
  onClose,
  foco,
  sugerencias,
}: {
  unidad: { dominio: string; ficha: VehiculoFicha | null };
  onClose: () => void;
  foco: GrupoFicha;
  sugerencias: SugerenciasFicha;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dominio = unidad.dominio;
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    for (const c of CAMPOS) {
      vals[c.key] = (
        (unidad.ficha?.[c.key] ?? "") as string | number
      ).toString();
    }
    return vals;
  });
  const [notas, setNotas] = useState(unidad.ficha?.notas ?? "");

  const grupos: GrupoFicha[] =
    foco === "asignacion"
      ? ["asignacion", "identificacion"]
      : ["identificacion", "asignacion"];

  function guardar() {
    startTransition(async () => {
      const res = await actualizarFichaVehiculo(dominio, { ...valores, notas });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Ficha de ${dominio} actualizada`);
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      {/* Las listas de sugerencias son del diálogo entero, no de cada input. */}
      {(["ciudad", "centro_costo", "chofer_asignado"] as SugerenciaKey[]).map(
        (k) => (
          <datalist key={k} id={`sug-${k}`}>
            {sugerencias[k].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        ),
      )}

      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GRUPO_LABEL[g]}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CAMPOS.filter((c) => c.grupo === g).map((c) => (
                <div key={c.key} className="space-y-1">
                  <Label className="text-xs" htmlFor={`campo-${c.key}`}>
                    {c.label}
                  </Label>
                  <Input
                    id={`campo-${c.key}`}
                    list={c.sugerencias ? `sug-${c.sugerencias}` : undefined}
                    value={valores[c.key] ?? ""}
                    onChange={(e) =>
                      setValores((prev) => ({
                        ...prev,
                        [c.key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-1">
          <Label className="text-xs" htmlFor="campo-notas">
            Notas
          </Label>
          <Textarea
            id="campo-notas"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </>
  );
}
