"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Ban, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { liberarCamionBloqueado } from "@/actions/bloqueo-critico"
import { fechaHoraAR, type CamionBloqueado } from "@/lib/vehiculos/bloqueo-critico-tipos"

const PLAN: Record<string, string> = {
  sin_plan: "sin plan de acción",
  pendiente: "plan pendiente",
  en_proceso: "plan en proceso",
}

/** Cartel rojo de portería: la unidad elegida tiene un crítico sin resolver. */
export function BloqueoCriticoBanner({
  bloqueo,
  puedeLiberar,
  onLiberado,
}: {
  bloqueo: CamionBloqueado
  puedeLiberar: boolean
  onLiberado: (dominio: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function liberar() {
    setEnviando(true)
    try {
      const r = await liberarCamionBloqueado({ dominio: bloqueo.dominio, motivo })
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(`${bloqueo.dominio} liberado para salir`)
      onLiberado(bloqueo.dominio)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div role="alert" className="rounded-xl border-2 border-red-400 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <Ban className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1 space-y-2">
          <p className="font-bold uppercase tracking-wide text-red-700">
            {bloqueo.dominio} no puede salir
          </p>
          <p className="text-sm text-red-700">
            El checklist tiene ítems críticos en NO OK sin resolver. Se libera cuando
            mantenimiento resuelve el plan de acción.
          </p>
          <ul className="space-y-1 text-sm text-red-800">
            {bloqueo.items.map((i) => (
              <li key={i.respuestaId}>
                <span className="font-semibold">{i.item}</span>
                {i.comentario && <> — “{i.comentario}”</>}
                <span className="text-red-600">
                  {" "}
                  · {fechaHoraAR(i.hora)} · {PLAN[i.planEstado]}
                </span>
              </li>
            ))}
          </ul>
          {puedeLiberar && !abierto && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
              Liberar igual
            </Button>
          )}
          {puedeLiberar && abierto && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="¿Por qué sale sin reparar? (ej.: el chofer marcó mal, ya se cambió el foco)"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={enviando || motivo.trim().length < 5}
                  onClick={liberar}
                >
                  {enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Liberar {bloqueo.dominio}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
