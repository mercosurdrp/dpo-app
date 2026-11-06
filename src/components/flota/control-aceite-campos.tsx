"use client"

/**
 * Campos del control de aceite del CIL (DPO Flota 4.1, R4.1.4). Aparecen
 * cuando se marca la I del CIL, en `/mi-cil` y en la carga del supervisor.
 *
 * 🚨 Botones y no un Select de Radix: lo usa el chofer desde el celular, con
 * guantes y apurado; tres botones grandes se tocan sin abrir nada.
 */

import { Droplet } from "lucide-react"
import { CIRCUITOS_ACEITE, NIVELES_ACEITE } from "@/lib/flota/cil-aceite"
import { cn } from "@/lib/utils"

export interface ControlAceiteForm {
  nivel: string
  litros: string
  /** "si" | "no" | "" (sin contestar). */
  perdida: string
  ubicacion: string
  circuito: string
}

export const CONTROL_ACEITE_VACIO: ControlAceiteForm = {
  nivel: "",
  litros: "",
  perdida: "",
  ubicacion: "",
  circuito: "",
}

/** ¿Está contestado lo obligatorio? (el server valida igual). */
export function controlAceiteCompleto(c: ControlAceiteForm, elegirCircuito: boolean): boolean {
  if (!c.nivel || !c.perdida) return false
  if (c.perdida === "si" && !c.ubicacion.trim()) return false
  if (elegirCircuito && !c.circuito) return false
  return true
}

/** Lo vuelca al FormData con los nombres que lee `leerControlAceite`. */
export function appendControlAceite(fd: FormData, c: ControlAceiteForm) {
  fd.set("aceite_nivel", c.nivel)
  fd.set("aceite_litros", c.litros)
  fd.set("perdida_detectada", c.perdida)
  fd.set("perdida_ubicacion", c.ubicacion)
  fd.set("aceite_circuito", c.circuito)
}

function Opcion({
  activa,
  onClick,
  children,
  tono = "neutro",
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
  tono?: "neutro" | "alerta"
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        activa
          ? tono === "alerta"
            ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
            : "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
          : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}

export function ControlAceiteCampos({
  valor,
  onChange,
  elegirCircuito,
}: {
  valor: ControlAceiteForm
  onChange: (v: ControlAceiteForm) => void
  /** Autoelevadores: motor o hidráulico. En camiones es siempre motor. */
  elegirCircuito: boolean
}) {
  const set = (parcial: Partial<ControlAceiteForm>) => onChange({ ...valor, ...parcial })

  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900 dark:text-sky-200">
        <Droplet className="size-4" /> Control de aceite
      </p>

      {elegirCircuito && (
        <div>
          <p className="text-xs font-medium text-foreground">¿Qué aceite controlaste?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CIRCUITOS_ACEITE.filter((c) => c.id === "motor" || c.id === "hidraulico").map((c) => (
              <Opcion key={c.id} activa={valor.circuito === c.id} onClick={() => set({ circuito: c.id })}>
                {c.label}
              </Opcion>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-foreground">¿Cómo estaba el nivel?</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {NIVELES_ACEITE.map((n) => (
            <Opcion
              key={n.id}
              activa={valor.nivel === n.id}
              tono={n.id === "ok" ? "neutro" : "alerta"}
              onClick={() => set({ nivel: n.id })}
            >
              {n.label}
            </Opcion>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">
          ¿Agregaste aceite? <span className="text-muted-foreground">(litros, si no agregaste dejalo vacío)</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={valor.litros}
          onChange={(e) => set({ litros: e.target.value.replace(/[^0-9.,]/g, "") })}
          placeholder="Ej.: 2,5"
          className="mt-1.5 w-32 rounded-lg border bg-background p-2 text-sm"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">¿Viste alguna pérdida de aceite?</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Opcion activa={valor.perdida === "no"} onClick={() => set({ perdida: "no", ubicacion: "" })}>
            No
          </Opcion>
          <Opcion activa={valor.perdida === "si"} tono="alerta" onClick={() => set({ perdida: "si" })}>
            Sí, hay pérdida
          </Opcion>
        </div>
        {valor.perdida === "si" && (
          <input
            type="text"
            value={valor.ubicacion}
            onChange={(e) => set({ ubicacion: e.target.value })}
            placeholder="¿Dónde? Ej.: debajo del cárter, retén de la caja, manguera hidráulica"
            className="mt-2 w-full rounded-lg border bg-background p-2 text-sm"
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Con el motor frío y la unidad en lo plano. Si el nivel estaba bajo o hay pérdida, el
        Supervisor de Flota lo ve en el tablero y abre la OT.
      </p>
    </div>
  )
}
