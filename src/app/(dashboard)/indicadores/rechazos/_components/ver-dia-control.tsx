"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { CalendarDays, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Atajo "ver un día": setea el rango desde=hasta=día elegido (deja que el
 * modo de comparación se infiera) y permite bajar el PDF de ese día puntual
 * reutilizando el generador existente (/api/reuniones/rechazos-dia-pdf).
 */
export function VerDiaControl({ defaultHasta }: { defaultHasta: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [dia, setDia] = useState(defaultHasta)

  const verDia = () => {
    if (!dia) return
    const params = new URLSearchParams()
    params.set("desde", dia)
    params.set("hasta", dia)
    router.push(`${pathname}?${params.toString()}`)
  }

  const pdfDia = () => {
    if (!dia) return
    window.open(
      `/api/reuniones/rechazos-dia-pdf?fecha=${encodeURIComponent(dia)}`,
      "_blank",
      "noopener",
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        value={dia}
        onChange={(e) => setDia(e.target.value)}
        className="h-8 w-[8.5rem]"
        aria-label="Ver un día puntual"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={verDia}
        className="h-8 gap-1.5"
        title="Filtrar a este día"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Ver día
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={pdfDia}
        className="h-8 gap-1.5"
        title="PDF del día elegido"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF día
      </Button>
    </div>
  )
}
