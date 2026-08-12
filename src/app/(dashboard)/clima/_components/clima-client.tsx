"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ClipboardList, FileSpreadsheet, Thermometer } from "lucide-react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ClimaAnalisis, ClimaPlan } from "@/actions/clima-tipos"
import type { UserRole } from "@/types/database"
import { ResultadosBloque } from "./resultados-bloque"
import { PlanesBloque, type FocoInicialPlan } from "./planes/planes-bloque"
import { ImportarBloque } from "./importar-bloque"

interface Props {
  empresa: string
  analisis: ClimaAnalisis | null
  planes: ClimaPlan[]
  responsables: { id: string; nombre: string }[]
  role: UserRole
}

export function ClimaClient({
  empresa,
  analisis,
  planes,
  responsables,
  role,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState(analisis ? "resultados" : "importar")
  const [focoInicial, setFocoInicial] = useState<FocoInicialPlan | null>(null)

  const puedeImportar = role === "admin" || role === "admin_rrhh"
  // El resultado por equipo lleva el nombre del líder: se muestra a RRHH y a
  // quienes tienen gente a cargo, no a toda la empresa.
  const puedeVerEquipos = ["admin", "admin_rrhh", "supervisor"].includes(role)

  /** Desde un hallazgo se salta al alta de plan con los campos precargados. */
  const crearDesdeHallazgo = (foco: FocoInicialPlan) => {
    setFocoInicial(foco)
    setTab("planes")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Thermometer className="size-6 text-blue-600" />
            Clima
          </h1>
          <p className="text-sm text-slate-500">
            Encuesta de Clima de {empresa}. Se toma dos veces al año.
          </p>
        </div>

        {analisis && analisis.olas.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-slate-500">
              Ola
            </span>
            <Select
              value={analisis.ola.id}
              onValueChange={(v) => v && router.push(`/clima?ola=${v}`)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {analisis.olas.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="resultados">
            <Thermometer className="mr-1.5 size-4" />
            Resultados
          </TabsTrigger>
          <TabsTrigger value="planes">
            <ClipboardList className="mr-1.5 size-4" />
            Planes de acción
            {planes.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-700">
                {planes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="importar" disabled={!puedeImportar}>
            <FileSpreadsheet className="mr-1.5 size-4" />
            Importar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resultados" className="mt-4">
          {analisis ? (
            <ResultadosBloque
              analisis={analisis}
              planes={planes}
              onCrearPlan={crearDesdeHallazgo}
              puedeVerEquipos={puedeVerEquipos}
            />
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Todavía no se importó ninguna ola de la encuesta.{" "}
              {puedeImportar
                ? "Subí el Excel de la consultora desde la pestaña «Importar»."
                : "Pedile a RRHH que suba el Excel de la consultora."}
            </p>
          )}
        </TabsContent>

        <TabsContent value="planes" className="mt-4">
          <PlanesBloque
            planes={planes}
            olas={analisis?.olas ?? []}
            olaVigente={analisis?.ola.id ?? null}
            responsables={responsables}
            role={role}
            focoInicial={focoInicial}
            onFocoConsumido={() => setFocoInicial(null)}
          />
        </TabsContent>

        <TabsContent value="importar" className="mt-4">
          {puedeImportar ? (
            <ImportarBloque olas={analisis?.olas ?? []} />
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              La importación la hace RRHH.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
