import Link from "next/link"
import { ArrowLeft, Shield, ArrowRight } from "lucide-react"
import { getArchivos } from "@/actions/dpo-evidencia"
import { getDenuncias } from "@/actions/linea-etica"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EvidenciaPuntoClient } from "./evidencia-punto-client"

export default async function EvidenciaPuntoPage({
  params,
}: {
  params: Promise<{ pilar: string; punto: string }>
}) {
  const { pilar, punto } = await params
  const puntoCodigo = punto.replace("-", ".")
  const res = await getArchivos({
    pilar_codigo: pilar,
    punto_codigo: puntoCodigo,
    archivado: false,
  })
  const archivos = "data" in res ? res.data : []

  const esCompliance11 =
    pilar.toLowerCase() === "gestion" && puntoCodigo === "1.1"

  let denunciasStats: { total: number; abiertas: number; nuevas: number } | null =
    null
  if (esCompliance11) {
    const resDen = await getDenuncias()
    if ("data" in resDen) {
      const total = resDen.data.length
      const abiertas = resDen.data.filter((d) => d.estado !== "cerrada").length
      const nuevas = resDen.data.filter((d) => d.estado === "nueva").length
      denunciasStats = { total, abiertas, nuevas }
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href="/evidencia"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Evidencia
      </Link>

      {esCompliance11 && (
        <Card className="border-slate-300 bg-slate-50">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-900 p-2 text-white">
                  <Shield className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Línea Ética</p>
                  <p className="text-sm text-muted-foreground">
                    Canal de denuncias de compliance (R1.1.2 / R1.1.3). QR en
                    comedor → formulario anónimo.
                  </p>
                  {denunciasStats && (
                    <p className="mt-1 text-xs text-slate-700">
                      <span className="font-semibold">
                        {denunciasStats.total}
                      </span>{" "}
                      denuncia{denunciasStats.total === 1 ? "" : "s"} total
                      {denunciasStats.nuevas > 0 && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          {denunciasStats.nuevas} nueva
                          {denunciasStats.nuevas === 1 ? "" : "s"}
                        </span>
                      )}
                      {denunciasStats.abiertas > 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {denunciasStats.abiertas} abierta
                          {denunciasStats.abiertas === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <Link href="/compliance/linea-etica">
                <Button>
                  Ver denuncias
                  <ArrowRight className="ml-1 size-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <EvidenciaPuntoClient
        pilarCodigo={pilar}
        puntoCodigo={puntoCodigo}
        archivos={archivos}
      />
    </div>
  )
}
