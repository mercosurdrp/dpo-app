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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AlertTriangle, Clock, CalendarRange, CheckCircle2 } from "lucide-react"
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

export function VentanasHorariasPanel({ cobertura, error }: Props) {
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
                PDV con ventana horaria definida
              </p>
              <p className={`text-2xl font-bold ${pctColor}`}>
                {pct.toFixed(1)}%
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / &gt;{meta}% (R4.4.3)
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {cobertura.con_vh.toLocaleString("es-AR")} de{" "}
                {cobertura.padron.toLocaleString("es-AR")} del padrón
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sin ventana horaria</p>
              <p className="text-2xl font-bold text-slate-900">
                {cobertura.sin_vh.toLocaleString("es-AR")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Avance del ciclo {cobertura.ciclo} (R4.4.2)
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {cobertura.ciclo_relevados.toLocaleString("es-AR")}
                <span className="text-base font-normal text-muted-foreground">
                  /{cobertura.padron.toLocaleString("es-AR")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {cobertura.ciclo_pct.toFixed(1)}% del trimestre en curso
              </p>
            </div>
          </div>

          <Progress value={Math.min(pct, 100)} className="mt-4" />

          {cumple_meta ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <p className="text-sm text-green-900">
                Se cumple el R4.4.3: más del {meta}% de los clientes tiene
                ventana horaria definida. La ventana vigente de cada PDV es la
                del último relevamiento, aunque sea de un trimestre anterior.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">
                El R4.4.3 exige más del {meta}% de los clientes con ventana
                horaria definida. Faltan{" "}
                <strong>
                  {Math.max(
                    0,
                    Math.ceil((meta / 100) * cobertura.padron) -
                      cobertura.con_vh,
                  ).toLocaleString("es-AR")}{" "}
                  PDV
                </strong>{" "}
                para llegar al umbral.
              </p>
            </div>
          )}

          {/* Rutina trimestral (R4.4.2): un ciclo por trimestre. */}
          {cobertura.por_ciclo.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Rutina trimestral — PDV del padrón relevados en cada ciclo
              </p>
              <div className="flex flex-wrap gap-2">
                {cobertura.por_ciclo.map((c) => (
                  <Badge
                    key={c.ciclo}
                    variant={c.ciclo === cobertura.ciclo ? "default" : "secondary"}
                  >
                    {c.ciclo}: {c.relevados.toLocaleString("es-AR")}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apertura por ciudad de ruteo — misma agrupación que Priorización de
          Entrega: las localidades que van en el mismo camión son una sola solapa. */}
      {cobertura.ciudades.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 font-medium text-slate-900">Por ciudad de ruteo</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Las mismas ciudades que usa Priorización de Entrega: cada solapa
              agrupa las localidades que se reparten desde ahí. La asignación es
              por <strong>ruta</strong>, no por partido.
            </p>
            <Tabs defaultValue={cobertura.ciudades[0].ciudad}>
              <TabsList variant="line" className="w-full flex-wrap">
                {cobertura.ciudades.map((cd) => (
                  <TabsTrigger key={cd.ciudad} value={cd.ciudad}>
                    {cd.ciudad}
                    <span
                      className={`ml-1 text-[10px] ${
                        cd.cobertura_pct >= meta
                          ? "text-green-600"
                          : "text-amber-600"
                      }`}
                    >
                      {cd.cobertura_pct.toFixed(0)}%
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {cobertura.ciudades.map((cd) => (
                <TabsContent key={cd.ciudad} value={cd.ciudad}>
                  <div className="mb-3 grid gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Cobertura</p>
                      <p
                        className={`text-xl font-bold ${
                          cd.cobertura_pct >= meta
                            ? "text-green-600"
                            : "text-amber-600"
                        }`}
                      >
                        {cd.cobertura_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Padrón</p>
                      <p className="text-xl font-bold text-slate-900">
                        {cd.padron.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Con VH</p>
                      <p className="text-xl font-bold text-slate-900">
                        {cd.con_vh.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sin VH</p>
                      <p className="text-xl font-bold text-slate-900">
                        {cd.sin_vh.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Localidad</TableHead>
                          <TableHead className="text-right">Padrón</TableHead>
                          <TableHead className="text-right">Con VH</TableHead>
                          <TableHead className="text-right">Sin VH</TableHead>
                          <TableHead className="text-right">Cobertura</TableHead>
                          <TableHead className="text-right">
                            {cobertura.ciclo}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cd.localidades.map((l) => (
                          <TableRow key={l.localidad}>
                            <TableCell className="font-medium">
                              {l.localidad}
                            </TableCell>
                            <TableCell className="text-right">
                              {l.padron}
                            </TableCell>
                            <TableCell className="text-right">
                              {l.con_vh}
                            </TableCell>
                            <TableCell className="text-right">
                              {l.sin_vh}
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                l.cobertura_pct >= meta
                                  ? "text-green-600"
                                  : l.cobertura_pct > 0
                                    ? "text-amber-600"
                                    : "text-red-600"
                              }`}
                            >
                              {l.cobertura_pct.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right">
                              {l.ciclo_relevados > 0 ? l.ciclo_relevados : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Avance por promotor */}
      <Card>
        <CardContent className="pt-6">
          <p className="mb-1 font-medium text-slate-900">Avance por promotor</p>
          <p className="mb-4 text-xs text-muted-foreground">
            El denominador es el padrón <strong>congelado</strong> al abrir el
            ciclo, no la cartera viva: dejar de visitar un PDV no lo saca de la
            cuenta. <strong>Con VH</strong> es el último relevamiento de cada
            PDV, de cualquier trimestre; <strong>{cobertura.ciclo}</strong> es lo
            cargado en el ciclo en curso. &quot;Sin cambios&quot; son los
            confirmados con el horario anterior sin tocar un solo campo.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promotor</TableHead>
                  <TableHead className="text-right">Padrón</TableHead>
                  <TableHead className="text-right">Con VH</TableHead>
                  <TableHead className="text-right">Sin VH</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                  <TableHead className="text-right">{cobertura.ciclo}</TableHead>
                  <TableHead className="text-right">Sin cambios</TableHead>
                  <TableHead className="text-right">Última carga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobertura.promotores.map((p) => (
                  <TableRow key={p.username ?? p.promotor}>
                    <TableCell className="font-medium">{p.promotor}</TableCell>
                    <TableCell className="text-right">{p.padron}</TableCell>
                    <TableCell className="text-right">{p.con_vh}</TableCell>
                    <TableCell className="text-right">{p.sin_vh}</TableCell>
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
                      {p.ciclo_relevados > 0 ? p.ciclo_relevados : "—"}
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
