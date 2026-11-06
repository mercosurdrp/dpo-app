"use client"

// Aviso en la OT correctiva: la unidad tuvo rechazos «ROTURA DE CAMION» cerca
// de la fecha de la orden. Si fue auxilio en ruta, la OT es la punta de la
// pirámide de mantenimiento (DPO 4.2) y hay que marcarlo; si no, el motivo del
// rechazo está mal elegido en Chess.

import { useEffect, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getRechazosRoturaCerca } from "@/actions/piramide-flota"

export function AvisoRechazoRotura({
  dominio,
  fecha,
  tipo,
  auxilio,
  onMarcar,
}: {
  dominio: string
  fecha: string
  tipo: string
  auxilio: boolean
  onMarcar: () => void
}) {
  const [rechazos, setRechazos] = useState<Array<{ fecha: string; docs: number }>>([])
  useEffect(() => {
    let vigente = true
    if (tipo !== "correctivo" || !dominio || !fecha) {
      setRechazos([])
      return
    }
    getRechazosRoturaCerca(dominio, fecha).then((r) => {
      if (vigente) setRechazos("data" in r ? r.data : [])
    })
    return () => {
      vigente = false
    }
  }, [dominio, fecha, tipo])

  if (tipo !== "correctivo" || rechazos.length === 0 || auxilio) return null
  const total = rechazos.reduce((a, r) => a + r.docs, 0)
  const fechas = rechazos.map((r) => r.fecha.slice(8, 10) + "/" + r.fecha.slice(5, 7)).join(", ")
  return (
    <div className="col-span-2 flex flex-wrap items-start gap-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <TriangleAlert className="mt-px size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>{dominio}</strong> tuvo {total} rechazo(s) por «ROTURA DE CAMION» en Chess ({fechas}). ¿La unidad
        quedó parada en ruta? Si fue así, marcá el auxilio: es la punta de la pirámide de mantenimiento. Si no, el
        motivo del rechazo está mal cargado.
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onMarcar}>
        Sí, fue auxilio en ruta
      </Button>
    </div>
  )
}
