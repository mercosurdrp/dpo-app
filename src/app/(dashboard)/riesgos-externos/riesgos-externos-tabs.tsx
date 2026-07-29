"use client"

import { ListChecks, PhoneCall, ShieldAlert } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { RiesgosExternosClient } from "./riesgos-externos-client"
import { ContactosClient } from "./contactos-client"
import { PlanRespuestaClient } from "./plan-respuesta-client"
import type {
  Profile,
  RiesgoExternoAccionConResponsable,
  RiesgoExternoConfig,
  RiesgoExternoContacto,
  RiesgoExternoEscalamiento,
} from "@/types/database"

interface Props {
  acciones: RiesgoExternoAccionConResponsable[]
  responsables: Pick<Profile, "id" | "nombre" | "email">[]
  contactos: RiesgoExternoContacto[]
  config: RiesgoExternoConfig[]
  escalamiento: RiesgoExternoEscalamiento[]
  /** Solapa a abrir: la fija el QR del pizarrón (`?tab=plan`). */
  tabInicial?: string
  /** Riesgo al que viene apuntado el QR (`?riesgo=corte_de_luz`). */
  riesgoInicial?: string
  puedeEditar: boolean
}

const TABS_VALIDAS = new Set(["sucesos", "contactos", "plan"])

export function RiesgosExternosTabs({
  acciones,
  responsables,
  contactos,
  config,
  escalamiento,
  tabInicial,
  riesgoInicial,
  puedeEditar,
}: Props) {
  const tabPorDefecto =
    tabInicial && TABS_VALIDAS.has(tabInicial) ? tabInicial : "sucesos"
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ShieldAlert className="size-6 text-slate-700" />
          Riesgos Externos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Matriz de sucesos y directorio de contactos por riesgo (DPO
          Planeamiento 2.2).
        </p>
      </div>

      <Tabs defaultValue={tabPorDefecto}>
        <TabsList>
          <TabsTrigger value="sucesos">
            <ShieldAlert className="mr-2 size-4" />
            Matriz de sucesos
          </TabsTrigger>
          <TabsTrigger value="contactos">
            <PhoneCall className="mr-2 size-4" />
            A quién llamar
          </TabsTrigger>
          <TabsTrigger value="plan">
            <ListChecks className="mr-2 size-4" />
            Plan de respuesta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sucesos">
          <RiesgosExternosClient
            acciones={acciones}
            responsables={responsables}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        <TabsContent value="contactos">
          <ContactosClient
            contactos={contactos}
            config={config}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        <TabsContent value="plan">
          <PlanRespuestaClient
            escalamiento={escalamiento}
            config={config}
            contactos={contactos}
            riesgoInicial={riesgoInicial}
            puedeEditar={puedeEditar}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
