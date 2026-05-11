"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBultos } from "@/lib/format/rechazos"

interface TooManyResponse {
  error: "too_many_rows"
  total: number
  max: number
}

export function ExportCsvBtn({
  defaultDesde,
  defaultHasta,
}: {
  defaultDesde: string
  defaultHasta: string
}) {
  const searchParams = useSearchParams()
  const [pending, setPending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [tooMany, setTooMany] = useState<TooManyResponse | null>(null)

  const buildExportUrl = (): string => {
    const params = new URLSearchParams(searchParams.toString())
    // Forzar desde/hasta — si la URL no los trae explícitos, usamos los del período actual
    if (!params.get("desde")) params.set("desde", defaultDesde)
    if (!params.get("hasta")) params.set("hasta", defaultHasta)
    return `/api/rechazos/export?${params.toString()}`
  }

  const onClick = async () => {
    setPending(true)
    setErrorMsg(null)
    setTooMany(null)
    try {
      const res = await fetch(buildExportUrl(), { method: "GET", credentials: "same-origin" })

      if (res.status === 413) {
        const data = (await res.json()) as TooManyResponse
        setTooMany(data)
        return
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        setErrorMsg(`Error ${res.status}: ${body.slice(0, 200) || "fallo al generar CSV"}`)
        return
      }

      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "rechazos.csv"
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        className="h-8 gap-1.5"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Export CSV
      </Button>

      {tooMany && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 max-w-[300px]">
          <div className="font-medium">Demasiadas filas: {formatBultos(tooMany.total)}</div>
          <div className="text-amber-700">
            Máximo {formatBultos(tooMany.max)} por export. Achicá el rango o aplicá más filtros antes de descargar.
          </div>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 max-w-[300px]">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
