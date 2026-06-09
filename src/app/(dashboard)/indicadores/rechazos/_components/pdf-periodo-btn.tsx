"use client"

import { useSearchParams } from "next/navigation"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Abre el PDF del período mostrado (respeta los filtros activos en la URL).
 * El endpoint /api/rechazos/periodo-pdf devuelve el PDF inline → abrimos en
 * una pestaña nueva en vez de descargar como blob.
 */
export function PdfPeriodoBtn({
  defaultDesde,
  defaultHasta,
}: {
  defaultDesde: string
  defaultHasta: string
}) {
  const searchParams = useSearchParams()

  const onClick = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (!params.get("desde")) params.set("desde", defaultDesde)
    if (!params.get("hasta")) params.set("hasta", defaultHasta)
    window.open(`/api/rechazos/periodo-pdf?${params.toString()}`, "_blank", "noopener")
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      className="h-8 gap-1.5"
      title="Descargar PDF del período mostrado"
    >
      <FileText className="h-3.5 w-3.5" />
      PDF período
    </Button>
  )
}
