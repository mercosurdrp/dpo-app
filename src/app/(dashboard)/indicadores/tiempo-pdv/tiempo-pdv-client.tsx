"use client"

import { useCallback, useState } from "react"
import {
  ClientesTiempo,
  type FocoPlanPdv,
} from "../tiempo-ruta/_components/clientes-tiempo"
import { PlanesAccionBloque } from "./_components/planes/planes-accion-bloque"
import type { TiempoPdvPlan } from "@/actions/tiempo-pdv-planes"
import type { TiempoRutaClientesData } from "@/actions/tiempo-ruta-cliente"

interface Props {
  datos: TiempoRutaClientesData
  planesIniciales: TiempoPdvPlan[]
}

/**
 * Une el ranking de PDV con los planes de acción: desde cada fila se abre un plan
 * ya apuntado a ese cliente. Es lo que convierte el indicador en gestión
 * documentada en vez de una tabla para mirar.
 *
 * El formulario y la carga de responsables viven dentro de `PlanesAccionBloque`
 * (heredado del patrón del TLP); acá solo se le pasa el foco con el que abrirlo.
 */
export function TiempoPdvClient({ datos, planesIniciales }: Props) {
  const [foco, setFoco] = useState<FocoPlanPdv | null>(null)

  const armarPlan = useCallback((f: FocoPlanPdv) => {
    // Objeto nuevo en cada clic: si se toca dos veces el mismo PDV, el efecto
    // del bloque tiene que volver a dispararse.
    setFoco({ ...f })
  }, [])

  const ciudades = datos.ciudades.map((c) => c.ciudad)

  return (
    <div className="space-y-6">
      <ClientesTiempo
        clientes={datos.clientes}
        ciudades={datos.ciudades}
        paradas={datos.paradas}
        desde={datos.desde}
        hasta={datos.hasta}
        onArmarPlan={armarPlan}
      />

      <PlanesAccionBloque
        planesIniciales={planesIniciales}
        ciudades={ciudades}
        patentes={[]}
        abrirConFoco={foco}
      />
    </div>
  )
}
