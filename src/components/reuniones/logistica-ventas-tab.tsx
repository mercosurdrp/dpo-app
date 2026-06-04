"use client"

import { IS_MISIONES } from "@/lib/empresa"
import { ReunionesTabContent } from "./reuniones-tab-content"
import { TorBookActas } from "./tor-book-actas"
import { ProximosPeriodosCriticos } from "./proximos-periodos-criticos"
import { TemarioReunion } from "./temario-reunion"

export function LogisticaVentasTab() {
  return (
    <>
      {/* Tablero de indicadores (se mantiene) */}
      <ReunionesTabContent
        tipo="logistica-ventas"
        tipoLabel="Reunión Logística-Ventas"
      />
      {IS_MISIONES && (
        <>
          {/* Temario de la reunión (R2.1.5.3) con accesos directos a las herramientas */}
          <TemarioReunion />
          {/* Períodos críticos: un tema más, traído acá (R3.4) */}
          <ProximosPeriodosCriticos />
          {/* TOR (Book de Actas) — R3.4.2 del manual DPO */}
          <TorBookActas tipo="logistica-ventas" />
        </>
      )}
    </>
  )
}
