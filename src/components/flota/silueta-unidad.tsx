import { cn } from "@/lib/utils"
import {
  POSICION_AUXILIO,
  filasDelLayout,
  type PosicionNeumatico,
} from "@/lib/vehiculos/neumaticos-layout"
import type { VehiculoTipo } from "@/types/database"

// Esquema de la unidad para ubicar una cubierta. Vive acá y no dentro del módulo
// de neumáticos porque lo usan las dos pantallas: el módulo del supervisor
// (/vehiculos/mantenimiento) y la carga mensual del chofer (/mis-neumaticos).
// Es el MISMO dibujo en las dos: si cada pantalla tuviera el suyo, el chofer
// mediría contra un esquema y el supervisor leería contra otro.

// Color de la línea de eje según su función: amarillo = direccional,
// verde = tracción, gris = eje libre.
export const EJE_LINEA: Record<string, string> = {
  direccional: "border-amber-400",
  traccion: "border-emerald-500",
  libre: "border-border",
}

// La misma convención, pero como barra sólida (vista por eje).
export const EJE_BARRA: Record<string, string> = {
  direccional: "bg-amber-400",
  traccion: "bg-emerald-500",
  libre: "bg-border",
}

export const EJE_NOMBRE: Record<string, string> = {
  direccional: "Direccional",
  traccion: "Tracción",
  libre: "Libre",
}

/**
 * Bastidor esquemático: dos largueros, tres travesaños y una línea por eje.
 *
 * Antes se dibujaba la unidad entera (cabina con parabrisas, caja, lanza). Nunca
 * terminaba de parecerse a los Atego de la flota —salía un camioncito de
 * juguete— y para reconocer la unidad ya está su foto en la ficha. Acá lo único
 * que importa es ubicar la posición: frente arriba, lados a los costados.
 */
export function SiluetaUnidad({
  layout,
  tipo,
  /** Rotula los costados con IZQUIERDA / DERECHA (pantalla del chofer). */
  conLados = false,
}: {
  layout: PosicionNeumatico[]
  tipo: VehiculoTipo | null
  conLados?: boolean
}) {
  const filas = filasDelLayout(layout)
  const conCabina = tipo !== "acoplado"
  const top = 6
  const bottom = Math.min((filas[filas.length - 1]?.y ?? 84) + 12, 97)
  const travesanos = [0, 0.5, 1]
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Frente de la unidad */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-0.5">
        <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {conCabina ? "Frente" : "Lanza"}
        </span>
        <span className="h-[3px] w-10 rounded-full bg-muted-foreground/60" />
      </div>
      {/* Largueros del chasis */}
      <div
        className="absolute w-[3px] rounded-full bg-border"
        style={{ left: "43%", top: `${top}%`, height: `${bottom - top}%` }}
      />
      <div
        className="absolute w-[3px] rounded-full bg-border"
        style={{ right: "43%", top: `${top}%`, height: `${bottom - top}%` }}
      />
      {/* Travesaños */}
      {travesanos.map((f) => (
        <div
          key={f}
          className="absolute h-[2px] bg-border"
          style={{ left: "43%", right: "43%", top: `${top + (bottom - top) * f}%` }}
        />
      ))}
      {/* Línea de eje por fila de ruedas, coloreada por función */}
      {filas
        .filter((f) => f.posiciones.some((p) => p.code !== POSICION_AUXILIO))
        .map((f) => (
          <div
            key={f.y}
            className={cn(
              "absolute -translate-y-1/2 border-t-[3px] border-dashed",
              EJE_LINEA[f.eje ?? "libre"]
            )}
            style={{ top: `${f.y}%`, left: `${f.x1}%`, width: `${f.x2 - f.x1}%` }}
          />
        ))}
      {/* Costados rotulados: es lo que el chofer no tiene cómo deducir */}
      {conLados && (
        <>
          <span className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Izquierda
          </span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 rotate-90 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Derecha
          </span>
        </>
      )}
    </div>
  )
}
