"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ClipboardCheck, Plus, ExternalLink, Settings, Loader2 } from "lucide-react"
import type { OwdTemplate } from "@/types/database"
import { createOwdTemplate } from "@/actions/owd"

export interface OwdKpisMini {
  totalObservaciones: number
  promedioCumplimiento: number
  obsMesActual: number
  metaMensual: number
  metaCumplimiento: number
}

interface Props {
  preguntaId: string
  template: OwdTemplate | null
  kpis: OwdKpisMini | null
  isAdmin: boolean
}

export function OwdTab({ preguntaId, template, kpis, isAdmin }: Props) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    setCreating(true)
    const res = await createOwdTemplate({ preguntaId })
    setCreating(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plantilla OWD creada")
    router.push(`/owd/admin/${res.data.id}`)
  }

  // Sin plantilla todavía
  if (!template) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <ClipboardCheck className="h-9 w-9 text-slate-300" />
          <div>
            <p className="font-medium text-slate-900">Este punto no tiene OWD configurada</p>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Creá la plantilla y definí el checklist de observación en el puesto."
                : "Pedile a un administrador que configure la plantilla OWD de este punto."}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Crear plantilla OWD
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const meta = kpis?.metaCumplimiento ?? 90
  const pct = kpis?.promedioCumplimiento ?? 0
  const pctColor = pct >= meta ? "text-green-600" : pct >= meta - 15 ? "text-amber-600" : "text-red-600"

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">% Cumplimiento</p>
            <p className={`text-2xl font-bold ${pctColor}`}>{pct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Obs. del mes</p>
            <p className="text-2xl font-bold text-slate-900">
              {kpis?.obsMesActual ?? 0}
              <span className="text-base font-normal text-muted-foreground">
                /{kpis?.metaMensual ?? template.meta_mensual}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total acumulado</p>
            <p className="text-2xl font-bold text-slate-900">{kpis?.totalObservaciones ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href={`/owd/${template.id}/nueva`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Cargar OWD
          </Button>
        </Link>
        <Link href={`/owd/${template.id}`}>
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" /> Ver módulo completo
          </Button>
        </Link>
        {isAdmin && (
          <Link href={`/owd/admin/${template.id}`}>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" /> Editar plantilla
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
