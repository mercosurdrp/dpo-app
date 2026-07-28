"use client"

import { ExpositorDelDiaCard } from "./expositor-del-dia-card"
import { ReunionesTabContent } from "./reuniones-tab-content"

export function WarehouseTab() {
  return (
    <div className="space-y-4">
      <ExpositorDelDiaCard />
      <ReunionesTabContent tipo="warehouse" tipoLabel="Reunión Warehouse" />
    </div>
  )
}
