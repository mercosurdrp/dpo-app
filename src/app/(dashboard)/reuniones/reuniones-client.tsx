"use client"

import { useState } from "react"
import { Presentation } from "lucide-react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { LogisticaTab } from "@/components/reuniones/logistica-tab"
import { LogisticaVentasTab } from "@/components/reuniones/logistica-ventas-tab"
import { MatinalDistribucionTab } from "@/components/reuniones/matinal-distribucion-tab"
import { WarehouseTab } from "@/components/reuniones/warehouse-tab"
import { PresupuestoTab } from "@/components/reuniones/presupuesto-tab"
import { MantenimientoTab } from "@/components/reuniones/mantenimiento-tab"
import { IS_MISIONES } from "@/lib/empresa"

export function ReunionesClient() {
  const [tab, setTab] = useState<string>("logistica")

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Presentation className="size-6 text-slate-700" />
          Reuniones
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Espacio de gestión de las reuniones operativas y comerciales.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v: string | null) => setTab(v ?? "logistica")}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="logistica" className="flex-none">
            Logística
          </TabsTrigger>
          <TabsTrigger value="logistica-ventas" className="flex-none">
            Logística-Ventas
          </TabsTrigger>
          <TabsTrigger value="matinal-distribucion" className="flex-none">
            Matinal Distribución
          </TabsTrigger>
          <TabsTrigger value="warehouse" className="flex-none">
            Warehouse
          </TabsTrigger>
          {!IS_MISIONES && (
            <TabsTrigger value="presupuesto" className="flex-none">
              Presupuesto
            </TabsTrigger>
          )}
          {!IS_MISIONES && (
            <TabsTrigger value="mantenimiento" className="flex-none">
              Mantenimiento
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="logistica" className="mt-4">
          <LogisticaTab />
        </TabsContent>
        <TabsContent value="logistica-ventas" className="mt-4">
          <LogisticaVentasTab />
        </TabsContent>
        <TabsContent value="matinal-distribucion" className="mt-4">
          <MatinalDistribucionTab />
        </TabsContent>
        <TabsContent value="warehouse" className="mt-4">
          <WarehouseTab />
        </TabsContent>
        {!IS_MISIONES && (
          <TabsContent value="presupuesto" className="mt-4">
            <PresupuestoTab />
          </TabsContent>
        )}
        {!IS_MISIONES && (
          <TabsContent value="mantenimiento" className="mt-4">
            <MantenimientoTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
