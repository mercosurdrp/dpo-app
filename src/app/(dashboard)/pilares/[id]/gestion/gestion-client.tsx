"use client"

import {
  BarChart3,
  ListTodo,
  FileCheck,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Pilar } from "@/types/database"

const tools = [
  {
    title: "Indicadores",
    description: "Metricas clave y KPIs del pilar para seguimiento continuo.",
    icon: TrendingUp,
  },
  {
    title: "Planes de Accion",
    description:
      "Gestiona acciones correctivas y preventivas vinculadas a este pilar.",
    icon: ListTodo,
  },
  {
    title: "Evidencias",
    description:
      "Carga y organiza documentos, fotos y registros como evidencia.",
    icon: FileCheck,
  },
  {
    title: "KPIs",
    description:
      "Define y monitorea indicadores de rendimiento especificos del pilar.",
    icon: BarChart3,
  },
]

export function GestionClient({ pilar }: { pilar: Pilar }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          Gestion - {pilar.nombre}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Herramientas operativas para la gestion continua de este pilar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Card key={tool.title} className="relative opacity-75">
              <CardHeader className="flex-row items-start gap-3 space-y-0">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${pilar.color}15`,
                    color: pilar.color,
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">{tool.title}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      Proximamente
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {tool.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
