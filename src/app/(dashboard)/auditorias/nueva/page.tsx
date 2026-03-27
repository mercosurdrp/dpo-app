"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createAuditoria } from "@/actions/auditorias"

export default function NuevaAuditoriaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState("")
  const [fechaInicio, setFechaInicio] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [fechaFin, setFechaFin] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    if (!fechaInicio) {
      toast.error("La fecha de inicio es obligatoria")
      return
    }

    setLoading(true)
    const result = await createAuditoria({
      nombre: nombre.trim(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || undefined,
    })

    if ("error" in result) {
      toast.error(result.error)
      setLoading(false)
    } else {
      toast.success("Auditoria creada")
      router.push(`/auditorias/${result.data.id}`)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/auditorias" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">Nueva Auditoria</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                placeholder="Ej: Auditoria DPO Q1 2026"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha_inicio">Fecha inicio</Label>
              <Input
                id="fecha_inicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha_fin">Fecha fin (opcional)</Label>
              <Input
                id="fecha_fin"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creando..." : "Crear Auditoria"}
              </Button>
              <Button
                type="button"
                variant="outline"
                render={<Link href="/auditorias" />}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
