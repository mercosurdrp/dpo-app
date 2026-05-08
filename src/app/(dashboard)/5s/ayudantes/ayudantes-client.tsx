"use client"

import { useMemo, useState, useTransition } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Trophy,
  AlertTriangle,
  Loader2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getS5RankingAyudantes } from "@/actions/s5"
import {
  S5_CATEGORIA_LABELS,
  S5_CATEGORIA_ORDEN,
  type S5RankingAyudanteRow,
  type S5Categoria,
} from "@/types/database"

const MESES_LARGOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

function formatPeriodo(periodo: string): string {
  const [y, m] = periodo.split("-")
  const idx = Number(m) - 1
  return `${MESES_LARGOS[idx] ?? m} ${y}`
}

function shiftMes(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${yy}-${mm}-01`
}

function notaColor(n: number): string {
  if (n >= 90) return "text-emerald-600"
  if (n >= 75) return "text-amber-600"
  return "text-red-600"
}

function notaBg(n: number): string {
  if (n >= 90) return "bg-emerald-50 border-emerald-200"
  if (n >= 75) return "bg-amber-50 border-amber-200"
  return "bg-red-50 border-red-200"
}

interface Props {
  rankingInicial: S5RankingAyudanteRow[]
  alcanceInicial: "global" | "mes"
  periodoInicial: string
  periodoActual: string
}

export function AyudantesClient({
  rankingInicial,
  alcanceInicial,
  periodoInicial,
  periodoActual,
}: Props) {
  const [alcance, setAlcance] = useState<"global" | "mes">(alcanceInicial)
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [ranking, setRanking] = useState(rankingInicial)
  const [pending, startTransition] = useTransition()

  function recargar(nextAlcance: "global" | "mes", nextPeriodo: string) {
    startTransition(async () => {
      const res = await getS5RankingAyudantes(
        nextAlcance === "mes" ? nextPeriodo : undefined
      )
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setRanking(res.data)
    })
  }

  const totalAuditorias = useMemo(
    () => ranking.reduce((acc, r) => acc + r.cantidad_audits, 0),
    [ranking]
  )

  const promedioGeneral = useMemo(() => {
    if (ranking.length === 0) return 0
    const total = ranking.reduce(
      (acc, r) => acc + r.nota_total_promedio * r.cantidad_audits,
      0
    )
    return total / Math.max(totalAuditorias, 1)
  }, [ranking, totalAuditorias])

  const top = ranking[0]
  const peor = ranking[ranking.length - 1]
  const porCategoria = useMemo(() => {
    const r: Record<S5Categoria, { sum: number; n: number }> = {} as never
    for (const cat of S5_CATEGORIA_ORDEN) r[cat] = { sum: 0, n: 0 }
    for (const row of ranking) {
      for (const cat of S5_CATEGORIA_ORDEN) {
        const v = row.notas_por_s_promedio[cat]
        if (typeof v === "number" && row.cantidad_audits > 0) {
          r[cat].sum += v * row.cantidad_audits
          r[cat].n += row.cantidad_audits
        }
      }
    }
    return S5_CATEGORIA_ORDEN.map((cat) => ({
      categoria: cat,
      promedio: r[cat].n ? r[cat].sum / r[cat].n : 0,
    }))
  }, [ranking])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Ranking de ayudantes 5S
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El programa 5S de flota se mide por persona — foco en el ayudante
            de reparto.
          </p>
        </div>
      </div>

      <Tabs
        value={alcance}
        onValueChange={(v) => {
          if (v !== "global" && v !== "mes") return
          setAlcance(v)
          recargar(v, periodo)
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="global">Histórico</TabsTrigger>
            <TabsTrigger value="mes">Por mes</TabsTrigger>
          </TabsList>
          {alcance === "mes" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={pending}
                onClick={() => {
                  const p = shiftMes(periodo, -1)
                  setPeriodo(p)
                  recargar("mes", p)
                }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Badge variant="secondary" className="text-sm">
                {formatPeriodo(periodo)}
              </Badge>
              <Button
                variant="outline"
                size="icon"
                disabled={pending || periodo >= periodoActual}
                onClick={() => {
                  const p = shiftMes(periodo, 1)
                  setPeriodo(p)
                  recargar("mes", p)
                }}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
          {pending && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <TabsContent value="global" />
        <TabsContent value="mes" />
      </Tabs>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Ayudantes evaluados
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-bold">{ranking.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Auditorías totales
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-bold">{totalAuditorias}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Promedio general
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className={`text-2xl font-bold ${notaColor(promedioGeneral)}`}>
              {promedioGeneral.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Brecha top vs cola
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-bold">
              {top && peor
                ? `${(top.nota_total_promedio - peor.nota_total_promedio).toFixed(1)} pts`
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Promedio por categoría 5S */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" /> Promedio por categoría 5S
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {porCategoria.map((c) => (
              <div
                key={c.categoria}
                className={`rounded-md border p-3 ${notaBg(c.promedio)}`}
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {S5_CATEGORIA_LABELS[c.categoria]}
                </div>
                <div className={`mt-1 text-xl font-bold ${notaColor(c.promedio)}`}>
                  {c.promedio.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top y peor */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-emerald-600" /> Mejor ayudante
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top ? (
              <div>
                <div className="text-lg font-semibold">{top.nombre}</div>
                <div className="text-sm text-muted-foreground">
                  {top.cantidad_audits} auditoría
                  {top.cantidad_audits === 1 ? "" : "s"}
                </div>
                <div className="mt-2 text-2xl font-bold text-emerald-700">
                  {top.nota_total_promedio.toFixed(1)}%
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-red-600" /> A reforzar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {peor && peor !== top ? (
              <div>
                <div className="text-lg font-semibold">{peor.nombre}</div>
                <div className="text-sm text-muted-foreground">
                  {peor.cantidad_audits} auditoría
                  {peor.cantidad_audits === 1 ? "" : "s"}
                </div>
                <div className="mt-2 text-2xl font-bold text-red-700">
                  {peor.nota_total_promedio.toFixed(1)}%
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking detallado</CardTitle>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay auditorías en este alcance.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Ayudante</TableHead>
                    <TableHead className="text-right"># audits</TableHead>
                    <TableHead className="text-right">Promedio</TableHead>
                    {S5_CATEGORIA_ORDEN.map((cat) => (
                      <TableHead key={cat} className="text-right">
                        {S5_CATEGORIA_LABELS[cat]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((r, i) => (
                    <TableRow key={r.empleado_id ?? r.nombre}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-right">
                        {r.cantidad_audits}
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold ${notaColor(
                          r.nota_total_promedio
                        )}`}
                      >
                        {r.nota_total_promedio.toFixed(1)}%
                      </TableCell>
                      {S5_CATEGORIA_ORDEN.map((cat) => {
                        const v = r.notas_por_s_promedio[cat] ?? 0
                        return (
                          <TableCell
                            key={cat}
                            className={`text-right ${notaColor(v)}`}
                          >
                            {v.toFixed(0)}%
                          </TableCell>
                        )
                      })}
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
