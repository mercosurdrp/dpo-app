"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, UserMinus, UserPlus } from "lucide-react"
import type { CatalogoChofer } from "@/types/database"
import {
  setTmlExclusionChofer,
  type TmlChoferExcluido,
} from "@/actions/tml-exclusiones"

interface Props {
  excluidos: TmlChoferExcluido[]
  choferes: CatalogoChofer[]
}

/** Primer día del mes en curso (hora Argentina), "YYYY-MM-DD". */
function primerDiaMesAR(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())
  const y = p.find((x) => x.type === "year")!.value
  const m = p.find((x) => x.type === "month")!.value
  return `${y}-${m}-01`
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

/**
 * Choferes que no computan para el TML. Caso típico: un chofer que entra y
 * sale antes de las 07:00 (cae en la franja de las 06:00 y le queda un "TML"
 * de 40-57 min que no es demora de liberación). El egreso se sigue cargando
 * igual: sólo deja de sumar al promedio.
 */
export function TmlExclusionesCard({ excluidos, choferes }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [chofer, setChofer] = useState("")
  const [motivo, setMotivo] = useState("")
  const [desde, setDesde] = useState(primerDiaMesAR())

  const yaExcluidos = new Set(excluidos.map((e) => e.chofer))
  const candidatos = choferes.filter((c) => !yaExcluidos.has(c.nombre.trim().toUpperCase()))

  const excluir = () => {
    if (!chofer) {
      toast.error("Elegí un chofer")
      return
    }
    startTransition(async () => {
      const res = await setTmlExclusionChofer({ chofer, excluir: true, motivo, desde })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        `${chofer} excluido del TML desde el ${formatFecha(desde)} · ${res.data.egresosAfectados} egreso(s) recalculado(s)`,
      )
      setChofer("")
      setMotivo("")
      router.refresh()
    })
  }

  const incluir = (nombre: string) => {
    startTransition(async () => {
      const res = await setTmlExclusionChofer({ chofer: nombre, excluir: false })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        `${nombre} vuelve a contar en el TML · ${res.data.egresosAfectados} egreso(s) recalculado(s)`,
      )
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-slate-100 p-3">
              <UserMinus className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Choferes excluidos del TML</p>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                Un chofer que entra y sale antes de las 07:00 cae en la franja de las
                06:00 y le queda un TML de 40–57 min que no es demora de liberación.
                Excluirlo saca sus egresos del promedio (quedan sin TML) sin borrarlos:
                sigue contando para camiones, FTE y la salida del día.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {excluidos.length === 0 ? "ninguno" : `${excluidos.length} excluido(s)`}
          </Badge>
        </div>

        {excluidos.length > 0 && (
          <ul className="mt-4 divide-y rounded-md border">
            {excluidos.map((e) => (
              <li key={e.chofer} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-900">{e.chofer}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    desde el {formatFecha(e.desde)}
                    {e.motivo ? ` · ${e.motivo}` : ""}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => incluir(e.chofer)}
                >
                  {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1 h-3.5 w-3.5" />}
                  Volver a incluir
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="tml-excl-chofer" className="text-xs">Chofer</Label>
            <select
              id="tml-excl-chofer"
              value={chofer}
              onChange={(e) => setChofer(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Elegir chofer…</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.nombre.trim().toUpperCase()}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tml-excl-motivo" className="text-xs">Motivo</Label>
            <Input
              id="tml-excl-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: entra antes de las 07:00"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tml-excl-desde" className="text-xs">Desde</Label>
            <Input
              id="tml-excl-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={excluir} disabled={pending || !chofer} className="h-9">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
            Excluir del TML
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
