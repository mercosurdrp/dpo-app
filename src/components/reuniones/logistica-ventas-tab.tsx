"use client"

import { IS_MISIONES } from "@/lib/empresa"
import { ReunionesTabContent } from "./reuniones-tab-content"
import { TorBookActas } from "./tor-book-actas"
import { ProximosPeriodosCriticos } from "./proximos-periodos-criticos"

export function LogisticaVentasTab() {
  return (
    <>
      {/* Alerta de próximos períodos críticos a anticipar — solo Misiones (R3.4) */}
      {IS_MISIONES && <ProximosPeriodosCriticos />}
      {/* TOR (Book de Actas) — solo Misiones, cumple R3.4.2 del manual DPO */}
      {IS_MISIONES && <TorBookActas tipo="logistica-ventas" />}
      <ReunionesTabContent
        tipo="logistica-ventas"
        tipoLabel="Reunión Logística-Ventas"
      />
    </>
  )
}
