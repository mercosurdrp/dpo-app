"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { crearAuditoriaAlmacen } from "@/actions/s5"
import type { S5SectorResponsableFull } from "@/types/database"

function hoyISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function NuevaAlmacenDialog({
  open,
  onOpenChange,
  responsables,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  responsables: S5SectorResponsableFull[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    fecha: hoyISO(),
    sectorNumero: "1",
  })

  function respBySector(n: number): S5SectorResponsableFull | undefined {
    return responsables.find((r) => r.sector_numero === n)
  }

  function reset() {
    setForm({ fecha: hoyISO(), sectorNumero: "1" })
  }

  function handleSubmit() {
    const n = parseInt(form.sectorNumero, 10)
    if (!Number.isFinite(n) || n < 1 || n > 4) {
      toast.error("Sector inválido")
      return
    }
    if (!form.fecha) {
      toast.error("Ingresá la fecha")
      return
    }
    startTransition(async () => {
      const res = await crearAuditoriaAlmacen({
        fecha: form.fecha,
        sectorNumero: n,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Auditoría creada")
      reset()
      onOpenChange(false)
      router.push(`/5s/auditoria/${res.data.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva auditoría de almacén</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Fecha *</Label>
            <Input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            />
          </div>

          <div>
            <Label>Sector *</Label>
            <Select
              value={form.sectorNumero}
              onValueChange={(v) =>
                setForm({ ...form, sectorNumero: v ?? "1" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => {
                  const r = respBySector(n)
                  const label = r?.nombre
                    ? `Sector ${n} — ${r.nombre}`
                    : `Sector ${n}`
                  return (
                    <SelectItem key={n} value={String(n)} label={label}>
                      {label}
                      {r && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · Resp: {r.empleado_nombre}
                        </span>
                      )}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Creando..." : "Crear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
