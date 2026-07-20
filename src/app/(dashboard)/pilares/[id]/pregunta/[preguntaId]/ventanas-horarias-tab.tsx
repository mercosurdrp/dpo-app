"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, Clock, CalendarRange } from "lucide-react"
import type { CoberturaVh } from "@/lib/mercosur-dashboard"

interface Props {
  cobertura: CoberturaVh | null
  error: string | null
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  // Se corta el string en vez de usar toLocaleDateString sin timeZone, que en
  // ART corre la fecha un día para atrás.
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function VentanasHorariasTab({ cobertura, error }: Props) {
  // La Railway no respondió: se avisa, NUNCA se muestra 0 como si fuera el dato.
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-500" />
          <p className="font-medium text-slate-900">
            No se pudo leer el relevamiento
          </p>
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">
            El dato vive en la base del dashboard Mercosur. Que no responda no
            significa que la cobertura sea 0.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!cobertura) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <CalendarRange className="h-9 w-9 text-slate-300" />
          <p className="font-medium text-slate-900">
            No hay ningún ciclo de relevamiento abierto
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            El R4.4.2 pide una rutina trimestral, como mínimo, para revisar las
            ventanas horarias del PDV. Abrí el ciclo del trimestre en la página
            de Horarios de PDV del dashboard Mercosur.
          </p>
        </CardContent>
      </Card>
    )
  }

  const { cobertura_pct: pct, meta_pct: meta, cumple_meta } = cobertura
  const pctColor = cumple_meta
    ? "text-green-600"
    : pct >= meta - 20
      ? "text-amber-600"
      : "text-red-600"

  return (
    <div className="space-y-4">
      {/* Estado del ciclo */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-slate-900">
              Ciclo {cobertura.ciclo}
            </span>
            <Badge variant={cobertura.estado === "abierto" ? "default" : "secondary"}>
              {cobertura.estado}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {fmtFecha(cobertura.desde)} → {fmtFecha(cobertura.hasta)}
            </span>
            {cobertura.padron_at && (
              <span className="text-xs text-muted-foreground">
                · padrón congelado el {fmtFecha(cobertura.padron_at)}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">
                Cobertura de ventanas horarias
              </p>
              <p className={`text-2xl font-bold ${pctColor}`}>
                {pct.toFixed(1)}%
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {meta}% (R4.4.3)
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PDV relevados</p>
              <p className="text-2xl font-bold text-slate-900">
                {cobertura.relevados.toLocaleString("es-AR")}
                <span className="text-base font-normal text-muted-foreground">
                  /{cobertura.padron.toLocaleString("es-AR")}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-bold text-slate-900">
                {cobertura.pendientes.toLocaleString("es-AR")}
              </p>
            </div>
          </div>

          <Progress value={Math.min(pct, 100)} className="mt-4" />

          {!cumple_meta && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">
                El R4.4.3 exige más del {meta}% de los clientes con ventana
                horaria definida. Faltan{" "}
                <strong>
                  {Math.max(
                    0,
                    Math.ceil((meta / 100) * cobertura.padron) -
                      cobertura.relevados,
                  ).toLocaleString("es-AR")}{" "}
                  PDV
                </strong>{" "}
                para llegar al umbral.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avance por promotor */}
      <Card>
        <CardContent className="pt-6">
          <p className="mb-1 font-medium text-slate-900">Avance por promotor</p>
          <p className="mb-4 text-xs text-muted-foreground">
            El denominador es el padrón <strong>congelado</strong> al abrir el
            ciclo, no la cartera viva: dejar de visitar un PDV no lo saca de la
            cuenta. &quot;Sin cambios&quot; son los que se confirmaron con el
            horario anterior sin tocar un solo campo.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promotor</TableHead>
                  <TableHead className="text-right">Padrón</TableHead>
                  <TableHead className="text-right">Relevados</TableHead>
                  <TableHead className="text-right">Pendientes</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                  <TableHead className="text-right">Sin cambios</TableHead>
                  <TableHead className="text-right">Última carga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobertura.promotores.map((p) => (
                  <TableRow key={p.username ?? p.promotor}>
                    <TableCell className="font-medium">{p.promotor}</TableCell>
                    <TableCell className="text-right">{p.padron}</TableCell>
                    <TableCell className="text-right">{p.relevados}</TableCell>
                    <TableCell className="text-right">{p.pendientes}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        p.cobertura_pct >= meta
                          ? "text-green-600"
                          : p.cobertura_pct > 0
                            ? "text-amber-600"
                            : "text-red-600"
                      }`}
                    >
                      {p.cobertura_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {p.sin_cambios > 0 ? p.sin_cambios : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {fmtFecha(p.ultima_carga)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
