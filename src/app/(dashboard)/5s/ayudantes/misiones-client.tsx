"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Trophy,
  Medal,
  Award,
  Loader2,
  Truck,
  Warehouse,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MisionesRankingData } from "@/actions/s5-ayudantes-misiones"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

function mesLabel(periodo: string): { mes: string; y: string } {
  const [y, m] = periodo.split("-")
  return { mes: MESES[Number(m) - 1] ?? m, y }
}

function bimestreLabel(meses: string[]): string {
  if (meses.length === 0) return "—"
  const a = mesLabel(meses[0])
  const b = mesLabel(meses[meses.length - 1])
  if (meses.length === 1) return `${a.mes} ${a.y}`
  return a.y === b.y
    ? `${a.mes} – ${b.mes} ${b.y}`
    : `${a.mes} ${a.y} – ${b.mes} ${b.y}`
}

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

const MEDAL = [
  { icon: Trophy, color: "text-amber-500", bg: "border-amber-200 bg-amber-50/60", label: "1° puesto" },
  { icon: Medal, color: "text-slate-400", bg: "border-slate-200 bg-slate-50", label: "2° puesto" },
  { icon: Award, color: "text-orange-500", bg: "border-orange-200 bg-orange-50/60", label: "3° puesto" },
]

interface Props {
  data: MisionesRankingData
}

export function MisionesClient({ data }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const ventana = data.meses.length || 2

  function navegar(delta: number) {
    const next = addMonths(data.periodo_desde, delta * ventana)
    startTransition(() => router.push(`/5s/ayudantes?periodo=${next}`))
  }

  const podioFlota = data.flota.slice(0, 3)

  return (
    <div className="space-y-5">
      {/* Header + selector bimestre */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Trophy className="size-6 text-amber-500" /> Ranking de ayudantes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada 2 meses · ordenado por nota 5S. Distribución/Flota por ayudante
            y Almacén por sector.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={pending} onClick={() => navegar(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Badge variant="secondary" className="text-sm">
            {bimestreLabel(data.meses)}
          </Badge>
          <Button variant="outline" size="icon" disabled={pending} onClick={() => navegar(1)}>
            <ChevronRight className="size-4" />
          </Button>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Podio Distribución / Flota */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4 text-emerald-600" /> Distribución / Flota — Top 3 ayudantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {podioFlota.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay auditorías de flota con ayudantes en este bimestre.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {[1, 2, 3].map((pos) => {
                const m = MEDAL[pos - 1]
                const Icon = m.icon
                const r = podioFlota[pos - 1]
                return (
                  <div key={pos} className={`rounded-lg border p-4 ${m.bg}`}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      <Icon className={`size-4 ${m.color}`} /> {m.label}
                    </span>
                    <div className="mt-2 text-lg font-bold text-slate-900">
                      {r?.nombre ?? <span className="text-muted-foreground">—</span>}
                    </div>
                    {r && (
                      <div className="text-sm text-muted-foreground">
                        {r.nota_5s.toFixed(1)}% · {r.auditorias} aud.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tabla completa de ayudantes de flota */}
          {data.flota.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ayudante</TableHead>
                    <TableHead className="text-right">Nota 5S</TableHead>
                    <TableHead className="text-right">Auditorías</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.flota.map((r, i) => (
                    <TableRow key={r.nombre} className={r.posicion ? "bg-amber-50/40" : ""}>
                      <TableCell className="text-muted-foreground">
                        {r.posicion ? (
                          <Badge className="bg-amber-500 hover:bg-amber-500">{r.posicion}°</Badge>
                        ) : (
                          i + 1
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-right font-bold">{r.nota_5s.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.auditorias}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Almacén por sector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Warehouse className="size-4 text-blue-600" /> Almacén — Ranking por sector
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.almacen.every((s) => s.nota_5s == null) ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay auditorías 5S de almacén cargadas en este bimestre.
              El ranking por sector se completa cuando se realicen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Nota 5S</TableHead>
                    <TableHead className="text-right">Auditorías</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.almacen.map((r, i) => (
                    <TableRow key={r.sector_numero} className={r.posicion ? "bg-amber-50/40" : ""}>
                      <TableCell className="text-muted-foreground">
                        {r.posicion ? (
                          <Badge className="bg-amber-500 hover:bg-amber-500">{r.posicion}°</Badge>
                        ) : (
                          i + 1
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-right font-bold">
                        {r.nota_5s != null ? `${r.nota_5s.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.auditorias}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
