"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClipboardCheck, Settings, Plus, CalendarCheck, Loader2 } from "lucide-react"
import { getOwdTemplates } from "@/actions/owd"
import type { OwdTemplateResumen } from "@/types/database"

interface Props {
  templates: OwdTemplateResumen[]
  periodos: string[]
  periodoInicial: string
  isAdmin: boolean
}

function pctColor(pct: number) {
  if (pct >= 90) return "text-green-600"
  if (pct >= 75) return "text-amber-600"
  return "text-red-600"
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

// "YYYY-MM" -> "Junio 2026"
function periodoLabel(periodo: string): string {
  const [year, mes] = periodo.split("-").map(Number)
  const nombre = MESES[mes - 1] ?? periodo
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${year}`
}

export function OwdLandingClient({
  templates: templatesIniciales,
  periodos,
  periodoInicial,
  isAdmin,
}: Props) {
  const [templates, setTemplates] = useState(templatesIniciales)
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [pending, startTransition] = useTransition()

  function handlePeriodoChange(nuevo: string | null) {
    if (!nuevo) return
    setPeriodo(nuevo)
    startTransition(async () => {
      const res = await getOwdTemplates(nuevo)
      if ("data" in res) setTemplates(res.data)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OWD</h1>
          <p className="text-sm text-muted-foreground">
            Observación en el puesto de trabajo. Cada punto del manual DPO con plantilla aparece acá.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={handlePeriodoChange}>
            <SelectTrigger className="w-[180px]">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              )}
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              {periodos.map((p) => (
                <SelectItem key={p} value={p}>
                  {periodoLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Link href="/owd/admin">
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" /> Administrar plantillas
              </Button>
            </Link>
          )}
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-slate-300" />
            <p className="text-muted-foreground">
              Todavía no hay plantillas OWD. {isAdmin ? "Creá la primera para un punto del manual." : "Pedile a un admin que configure las plantillas."}
            </p>
            {isAdmin && (
              <Link href="/owd/admin">
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Crear plantilla
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
            pending ? "opacity-50" : ""
          }`}
        >
          {templates.map((t) => (
            <Link key={t.template.id} href={`/owd/${t.template.id}`} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: t.pilar_color }}
                    />
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t.pilar_nombre}
                    </span>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {t.pregunta_numero}
                    </Badge>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 group-hover:text-slate-700">
                      {t.template.nombre}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.pregunta_texto}</p>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <CalendarCheck className="h-4 w-4" />
                      {t.obs_mes}/{t.template.meta_mensual} en {MESES[Number(periodo.split("-")[1]) - 1]}
                    </span>
                    <span className={`font-bold ${pctColor(t.pct_cumplimiento_mes)}`}>
                      {t.obs_mes > 0 ? `${t.pct_cumplimiento_mes.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.total_items} ítems en el checklist</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
