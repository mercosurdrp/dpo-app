"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ClipboardCheck, Settings, Plus, CalendarCheck, CalendarDays } from "lucide-react"
import type { OwdTemplateResumen } from "@/types/database"

interface Props {
  templates: OwdTemplateResumen[]
  isAdmin: boolean
  canAgenda: boolean
}

function pctColor(pct: number) {
  if (pct >= 90) return "text-green-600"
  if (pct >= 75) return "text-amber-600"
  return "text-red-600"
}

export function OwdLandingClient({ templates, isAdmin, canAgenda }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OWD</h1>
          <p className="text-sm text-muted-foreground">
            Observación en el puesto de trabajo. Cada punto del manual DPO con plantilla aparece acá.
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {canAgenda && (
            <Link href="/owd/calendario">
              <Button variant="outline">
                <CalendarDays className="mr-2 h-4 w-4" /> Calendario
              </Button>
            </Link>
          )}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                      {t.pilar_nombre === "Almacén"
                        ? `${t.obs_mes} este mes`
                        : `${t.obs_mes}/${t.template.meta_mensual} este mes`}
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
