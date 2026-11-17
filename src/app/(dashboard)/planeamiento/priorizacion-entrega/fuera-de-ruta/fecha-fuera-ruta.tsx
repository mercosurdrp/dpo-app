"use client"

import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"

/** Selector de fecha: recarga la página con `?fecha=`. */
export function FechaFueraRuta({ fecha }: { fecha: string }) {
  const router = useRouter()
  return (
    <div>
      <label className="text-xs text-muted-foreground">Fecha de entrega</label>
      <Input
        type="date"
        defaultValue={fecha}
        className="w-40"
        onChange={(e) => e.target.value && router.push(`?fecha=${e.target.value}`)}
      />
    </div>
  )
}
