import Link from "next/link"
import { FileText, GraduationCap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getOplsDeUnidad } from "@/actions/flota-opl"

/**
 * Las OPL que le aplican a esta unidad, resueltas por su tipo.
 *
 * Es lo que ve el que escanea el QR pegado en la cabina: la lección de un punto
 * que necesita en el momento en que la necesita. El SOP completo sigue estando,
 * pero nadie lo abre parado al lado de la rueda.
 */
export async function OplUnidad({ tipo }: { tipo: string | null }) {
  const res = await getOplsDeUnidad(tipo)
  const opls = "data" in res ? res.data : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-4 text-muted-foreground" />
          OPL de esta unidad
        </CardTitle>
      </CardHeader>
      <CardContent>
        {opls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay lecciones de un punto cargadas para este tipo de unidad. Se cargan
            en{" "}
            <Link href="/vehiculos/opl" className="text-sky-600 hover:underline">
              Vehículos → OPL
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {opls.map((o) => (
              <li key={o.id} className="rounded-md border border-border p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{o.titulo}</p>
                    {o.descripcion && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{o.descripcion}</p>
                    )}
                  </div>
                  {o.punto_dpo && (
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      DPO {o.punto_dpo}
                    </Badge>
                  )}
                </div>
                {o.archivo_url && (
                  <a
                    href={o.archivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
                  >
                    <FileText className="size-3" />
                    {o.archivo_nombre || "Ver la hoja"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
