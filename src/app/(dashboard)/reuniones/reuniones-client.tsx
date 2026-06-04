"use client"

import { useState } from "react"
import { Presentation, Truck, Handshake, Sunrise, Warehouse } from "lucide-react"
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
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger
            value="logistica"
            className="flex-none gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium [&_svg]:text-sky-600 data-active:border-sky-300 data-active:bg-sky-100 data-active:text-sky-900 data-active:shadow-sm"
          >
            <Truck className="size-4" /> Logística Diaria
          </TabsTrigger>
          <TabsTrigger
            value="logistica-ventas"
            className="flex-none gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium [&_svg]:text-violet-600 data-active:border-violet-300 data-active:bg-violet-100 data-active:text-violet-900 data-active:shadow-sm"
          >
            <Handshake className="size-4" /> Logística-Ventas
          </TabsTrigger>
          <TabsTrigger
            value="matinal-distribucion"
            className="flex-none gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium [&_svg]:text-amber-600 data-active:border-amber-300 data-active:bg-amber-100 data-active:text-amber-900 data-active:shadow-sm"
          >
            <Sunrise className="size-4" /> Matinal Distribución
          </TabsTrigger>
          <TabsTrigger
            value="warehouse"
            className="flex-none gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium [&_svg]:text-emerald-600 data-active:border-emerald-300 data-active:bg-emerald-100 data-active:text-emerald-900 data-active:shadow-sm"
          >
            <Warehouse className="size-4" /> Cambio de Turno Warehouse
          </TabsTrigger>
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
      </Tabs>
    </div>
  )
}
