"use client"

// Entrega comprometida por el taller (ANS de flota, cláusula 3: «diagnóstico:
// se informa trabajo, costo estimado y fecha/hora de entrega comprometida»).
// Es el dato que hace medible la puntualidad (meta ≥ 95 % en los acuerdos de
// Bettiolo, Luval y Pagnanini): sin él la OT no entra en el indicador.

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Fecha local + hora (formato datetime-local) dentro de `dias` días. */
function enDias(dias: number, hora: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  // Domingo no se trabaja: pasa al lunes.
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hora)}:00`
}

function esInterno(taller: string): boolean {
  const t = taller.trim().toLowerCase()
  return t === "" || t.startsWith("dep") || t === "casa" || t === "interno"
}

export function CampoEntregaComprometida({
  taller,
  valor,
  onChange,
  salida,
}: {
  taller: string
  valor: string
  onChange: (v: string) => void
  /** Salida del taller cargada (datetime-local), para avisar si fue tarde. */
  salida: string
}) {
  if (esInterno(taller) && !valor) return null
  const tarde = !!valor && !!salida && salida > valor
  const horasTarde = tarde ? Math.round((Date.parse(salida) - Date.parse(valor)) / 3_600_000) : 0

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Entrega comprometida por el taller</Label>
          <Input type="datetime-local" value={valor} onChange={(e) => onChange(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {[
            { label: "Hoy 18 h", v: enDias(0, 18) },
            { label: "Mañana 12 h", v: enDias(1, 12) },
            { label: "Mañana 18 h", v: enDias(1, 18) },
            { label: "+48 h", v: enDias(2, 18) },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => onChange(b.v)}
              className={cn(
                "rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100",
                valor === b.v && "bg-amber-200"
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <p className={cn("mt-1 text-[11px]", tarde ? "font-medium text-red-700" : "text-amber-700")}>
        {tarde
          ? `Entregó ${horasTarde} h después de lo comprometido: cuenta como incumplimiento del ANS.`
          : "Lo que dijo el taller al diagnosticar. Con este dato se mide la puntualidad del ANS (meta ≥ 95 %); sin él, la OT no entra en la medición."}
      </p>
    </div>
  )
}
