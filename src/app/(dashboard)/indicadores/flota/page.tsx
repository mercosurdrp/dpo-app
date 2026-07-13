import Link from "next/link"
import { ArrowLeft, Activity } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { IS_MISIONES } from "@/lib/empresa"
import { FlotaIndicadoresClient } from "./flota-client"

export default function FlotaIndicadoresPage() {
  // El tablero de flota de Misiones no aplica a Pampeana; acá la sección es la
  // puerta a los indicadores de flota propios.
  if (!IS_MISIONES) {
    return (
      <div className="space-y-4">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores de Flota</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/indicadores/flota/tiempo-ruta">
            <Card className="group cursor-pointer transition-all hover:border-purple-300 hover:shadow-md">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl bg-purple-100 p-3 text-purple-600 transition-colors group-hover:bg-purple-200">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Tiempo promedio en ruta</p>
                  <p className="text-sm text-muted-foreground">
                    Foxtrot, rutas cerradas en el día — va al Árbol del Sueño
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    )
  }

  return <FlotaIndicadoresClient />
}
