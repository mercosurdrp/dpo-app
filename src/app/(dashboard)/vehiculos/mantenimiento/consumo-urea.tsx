"use client"

import { useEffect, useState } from "react"
import { Droplet, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getConsumoUrea, type ConsumoUreaUnidad } from "@/actions/urea"

/**
 * Cada cuántos kilómetros pide urea cada camión.
 *
 * 🚨 La lectura útil NO son los litros totales sino los **km entre cargas**: si
 * una unidad venía cargando cada 5.000 km y pasa a cargar cada 1.500, algo está
 * pasando (fuga, dosificación forzada, sistema con falla). Los litros solos no
 * lo muestran, porque dependen de cuánto rodó.
 */

const fmt = (n: number) => new Intl.NumberFormat("es-AR").format(n)
const fmtFecha = (f: string) => f.slice(0, 10).split("-").reverse().join("/")

export function ConsumoUrea() {
  const [data, setData] = useState<ConsumoUreaUnidad[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    void (async () => {
      const res = await getConsumoUrea(6)
      if ("error" in res) setError(res.error)
      else setData(res.data)
      setCargando(false)
    })()
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Droplet className="size-4 text-muted-foreground" /> Consumo de urea
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            últimos 6 meses
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Cada cuántos kilómetros pide urea cada camión. Lo carga el chofer desde
          «Carga de Urea» en su Inicio.
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando…
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : !data || data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Todavía no hay cargas de urea registradas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Unidad</th>
                  <th className="py-2 pr-3 text-right font-medium">Cargas</th>
                  <th className="py-2 pr-3 text-right font-medium">km entre cargas</th>
                  <th className="py-2 pr-3 text-right font-medium">Litros / 1.000 km</th>
                  <th className="py-2 pr-3 text-right font-medium">Litros totales</th>
                  <th className="py-2 font-medium">Última</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.dominio} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">
                      {u.dominio}
                      {u.numero && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          N° {u.numero}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{u.cargas}</td>
                    <td className="py-2 pr-3 text-right">
                      {/* 🚨 Con una sola carga no hay tramo que medir: va un guion,
                          no un cero — un cero se leería como "carga a cada rato". */}
                      {u.kmPromedioEntreCargas != null ? (
                        <span className="font-semibold">{fmt(u.kmPromedioEntreCargas)}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          — <span className="text-xs">(1ª carga)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {u.litrosPor1000Km != null ? u.litrosPor1000Km : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {u.litrosTotales}
                    </td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">
                      {u.ultimaFecha ? fmtFecha(u.ultimaFecha) : "—"}
                      {u.kmDesdeUltima != null && (
                        <span className="block text-xs">
                          hace {fmt(u.kmDesdeUltima)} km
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              El promedio se calcula sobre los tramos entre cargas, así que una unidad
              con una sola carga todavía no tiene número. La urea no entra en el km/l
              ni en el costo de combustible: es un consumo aparte.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
