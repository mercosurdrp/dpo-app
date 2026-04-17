"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { NuevoReporteDialog } from "@/components/reportes-seguridad/nuevo-reporte-dialog"
import { useState } from "react"

export function ReportarSeguridadClient() {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      router.push("/mis-capacitaciones")
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/mis-capacitaciones">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="size-4" />
          Volver
        </Button>
      </Link>

      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="rounded-xl bg-red-100 p-3">
            <AlertTriangle className="size-6 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Reportar incidente / acto inseguro</p>
            <p className="text-sm text-red-600">Completá el formulario para registrar el evento.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-red-600 hover:bg-red-700">
            Abrir formulario
          </Button>
        </CardContent>
      </Card>

      <NuevoReporteDialog open={open} onOpenChange={handleOpenChange} />
    </div>
  )
}
