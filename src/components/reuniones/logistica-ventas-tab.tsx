"use client"

import { IS_MISIONES } from "@/lib/empresa"
import { ReunionesTabContent } from "./reuniones-tab-content"
import { ProximosPeriodosCriticos } from "./proximos-periodos-criticos"

export function LogisticaVentasTab() {
  return (
    <div className="space-y-4">
      {/* La TOR (Book de Actas) y el Temario del día ahora viven DENTRO de
          cada reunión (ver /reuniones/[id]), igual que la diaria de logística. */}
      {/* Tablero de indicadores (se mantiene) */}
      <ReunionesTabContent
        tipo="logistica-ventas"
        tipoLabel="Reunión Logística-Ventas"
      />
      {IS_MISIONES && (
        <>
          {/* Períodos críticos: un tema más, traído acá (R3.4) */}
          <ProximosPeriodosCriticos />
        </>
      )}
    </div>
  )
}
