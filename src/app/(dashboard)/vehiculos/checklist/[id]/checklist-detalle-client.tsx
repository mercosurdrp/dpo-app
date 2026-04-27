"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ChecklistVehiculoConRespuestas } from "@/types/database"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Truck,
  Clock,
  User,
  Calendar,
} from "lucide-react"

interface Props {
  checklist: ChecklistVehiculoConRespuestas
}

function formatHora(isoStr: string) {
  const d = new Date(isoStr)
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

function formatTiempoRuta(minutos: number) {
  const hh = Math.floor(minutos / 60)
  const mm = minutos % 60
  return `${hh}h ${mm.toString().padStart(2, "0")}m`
}

export function ChecklistDetalleClient({ checklist }: Props) {
  const esRechazado = checklist.resultado === "rechazado"

  // Group respuestas by category
  const groups: { categoria: string; respuestas: typeof checklist.respuestas }[] = []
  const catMap = new Map<string, typeof checklist.respuestas>()
  for (const r of checklist.respuestas) {
    const cat = r.item.categoria
    if (!catMap.has(cat)) {
      catMap.set(cat, [])
      groups.push({ categoria: cat, respuestas: catMap.get(cat)! })
    }
    catMap.get(cat)!.push(r)
  }

  const totalOk = checklist.respuestas.filter(
    (r) => r.valor === "ok" || r.valor === "bueno"
  ).length
  const totalNook = checklist.respuestas.filter(
    (r) => r.valor === "nook" || r.valor === "malo"
  ).length
  const totalRegular = checklist.respuestas.filter(
    (r) => r.valor === "regular"
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Checklist de {checklist.tipo === "liberacion" ? "Liberación" : "Retorno"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" /> {checklist.fecha}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {formatHora(checklist.hora)}
            </span>
            <span className="flex items-center gap-1">
              <Truck className="h-4 w-4" /> {checklist.dominio}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" /> {checklist.chofer}
            </span>
          </div>
        </div>
        <Badge
          className={`text-base px-3 py-1 ${
            esRechazado
              ? "bg-red-100 text-red-700 hover:bg-red-100"
              : "bg-green-100 text-green-700 hover:bg-green-100"
          }`}
        >
          {esRechazado ? "RECHAZADO" : "APROBADO"}
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aprobados</p>
                <p className="text-3xl font-bold text-green-600">{totalOk}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Regulares</p>
                <p className="text-3xl font-bold text-amber-600">{totalRegular}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">No Aprobados</p>
                <p className="text-3xl font-bold text-red-600">{totalNook}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
        {checklist.tiempo_ruta_minutos != null && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tiempo en Ruta</p>
                  <p className={`text-3xl font-bold ${
                    checklist.tiempo_ruta_minutos <= 480
                      ? "text-green-600"
                      : checklist.tiempo_ruta_minutos <= 540
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}>
                    {formatTiempoRuta(checklist.tiempo_ruta_minutos)}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-slate-200" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ 8h</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Items by category */}
      {groups.map((group) => (
        <Card key={group.categoria}>
          <CardHeader>
            <CardTitle className="text-base">{group.categoria}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.respuestas.map((r) => {
              const esNook = r.valor === "nook" || r.valor === "malo"
              const esRegular = r.valor === "regular"
              const esCriticoRechazado = r.item.critico && esNook

              return (
                <div
                  key={r.id}
                  className={`flex items-start justify-between rounded-lg border p-3 ${
                    esCriticoRechazado
                      ? "border-red-300 bg-red-50"
                      : esNook
                      ? "border-red-200 bg-red-50/50"
                      : esRegular
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-green-200 bg-green-50/50"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {esNook ? (
                        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                      ) : esRegular ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      )}
                      <span className="text-sm font-medium">{r.item.nombre}</span>
                      {r.item.critico && (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px] px-1.5">
                          CRÍTICO
                        </Badge>
                      )}
                    </div>
                    {r.comentario && (
                      <p className="mt-1 ml-6 text-xs text-muted-foreground italic">
                        {r.comentario}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={`shrink-0 ${
                      esNook
                        ? "bg-red-100 text-red-700 hover:bg-red-100"
                        : esRegular
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        : "bg-green-100 text-green-700 hover:bg-green-100"
                    }`}
                  >
                    {r.valor === "ok"
                      ? "OK"
                      : r.valor === "nook"
                      ? "NO OK"
                      : r.valor === "bueno"
                      ? "Bueno"
                      : r.valor === "regular"
                      ? "Regular"
                      : "Malo"}
                  </Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Observaciones */}
      {checklist.observaciones && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{checklist.observaciones}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
