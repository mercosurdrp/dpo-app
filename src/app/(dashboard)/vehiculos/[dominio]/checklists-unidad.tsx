import Link from "next/link"
import { ClipboardCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ChecklistVehiculo } from "@/types/database"

function formatFecha(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

/**
 * Historial de checklists de la unidad dentro de su ficha: el listado general
 * de /vehiculos mezcla toda la flota, acá se ve sólo esta unidad (camiones,
 * camionetas y autoelevadores por igual).
 */
export function ChecklistsUnidad({
  checklists,
}: {
  checklists: ChecklistVehiculo[]
}) {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-blue-600" />
          Checklists de la unidad
          <span className="text-xs font-normal text-muted-foreground">
            ({checklists.length} registrados)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {checklists.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Esta unidad todavía no tiene checklists cargados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Fecha</th>
                  <th className="py-2 text-left font-medium">Hora</th>
                  <th className="py-2 text-left font-medium">Tipo</th>
                  <th className="py-2 text-left font-medium">Resultado</th>
                  <th className="py-2 text-right font-medium">Km / hs</th>
                  <th className="py-2 text-left font-medium">Chofer</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {checklists.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 whitespace-nowrap">
                      {formatFecha(c.fecha)}
                    </td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">
                      {formatHora(c.hora)}
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className="font-normal">
                        {c.tipo === "liberacion" ? "Liberación" : "Retorno"}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <Badge
                        variant={
                          c.resultado === "aprobado" ? "secondary" : "destructive"
                        }
                        className="font-normal"
                      >
                        {c.resultado === "aprobado" ? "Aprobado" : "Rechazado"}
                      </Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {c.odometro != null
                        ? c.odometro.toLocaleString("es-AR")
                        : "—"}
                    </td>
                    <td className="py-2 truncate max-w-[180px]">{c.chofer}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/vehiculos/checklist/${c.id}`}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
