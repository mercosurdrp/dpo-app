"use client"

import Link from "next/link"
import { Trophy, Medal, Brain, Settings, Play } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { RankingFila } from "@/lib/types/trivia"

const NOMBRE_MES = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "America/Argentina/Buenos_Aires",
}).format(new Date())

export function RankingClient({
  mes,
  historico,
  esAdmin,
}: {
  mes: RankingFila[]
  historico: RankingFila[]
  esAdmin: boolean
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Trophy className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Ranking · Trivia MERCOSUR</h1>
            <p className="text-xs text-slate-500">Conocimiento de los procesos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/trivia">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Play className="mr-1 size-4" />
              Jugar
            </Button>
          </Link>
          {esAdmin && (
            <Link href="/trivia/admin">
              <Button size="sm" variant="outline">
                <Settings className="size-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs defaultValue="mes">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mes">🏆 Campeones de {NOMBRE_MES}</TabsTrigger>
          <TabsTrigger value="historico">📊 Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="mes">
          <Tabla filas={mes} />
        </TabsContent>
        <TabsContent value="historico">
          <Tabla filas={historico} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Tabla({ filas }: { filas: RankingFila[] }) {
  if (filas.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-slate-400">
          <Brain className="size-10 text-slate-300" />
          <p>Todavía nadie jugó. ¡Sé el primero!</p>
          <Link href="/trivia">
            <Button className="mt-2 bg-blue-600 hover:bg-blue-700">Jugar ahora</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const podio = filas.slice(0, 3)
  const resto = filas.slice(3)

  return (
    <div className="mt-4 space-y-4">
      {/* Podio */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 0, 2].map((pos) => {
          const f = podio[pos]
          if (!f) return <div key={pos} />
          const colores = [
            "from-amber-400 to-yellow-500", // 1º
            "from-slate-300 to-slate-400", // 2º
            "from-orange-400 to-orange-600", // 3º
          ]
          const alturas = ["h-28", "h-24", "h-20"]
          return (
            <div key={pos} className="flex flex-col items-center justify-end">
              <Medal
                className={`mb-1 size-6 ${
                  f.posicion === 1
                    ? "text-amber-500"
                    : f.posicion === 2
                      ? "text-slate-400"
                      : "text-orange-500"
                }`}
              />
              <p
                className={`max-w-full truncate text-center text-xs font-semibold ${
                  f.esYo ? "text-blue-700" : "text-slate-700"
                }`}
                title={f.nombre}
              >
                {f.nombre}
              </p>
              <p className="text-sm font-black text-slate-900">{f.puntos}</p>
              <div
                className={`mt-1 w-full rounded-t-lg bg-gradient-to-b ${colores[f.posicion - 1]} ${
                  alturas[f.posicion - 1]
                } flex items-start justify-center pt-1 text-lg font-black text-white`}
              >
                {f.posicion}º
              </div>
            </div>
          )
        })}
      </div>

      {/* Resto */}
      {resto.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {resto.map((f) => (
              <div
                key={f.empleadoId}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                  f.esYo ? "bg-blue-50" : ""
                }`}
              >
                <span className="w-6 text-center font-bold text-slate-400">{f.posicion}</span>
                <span className={`flex-1 truncate ${f.esYo ? "font-semibold text-blue-700" : "text-slate-700"}`}>
                  {f.nombre}
                  {f.esYo && <span className="ml-1 text-xs text-blue-500">(vos)</span>}
                  {f.sector && <span className="ml-1 text-xs text-slate-400">· {f.sector}</span>}
                </span>
                <span className="text-xs text-slate-400">{f.correctas} ✓</span>
                <span className="w-14 text-right font-bold text-slate-900">{f.puntos}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
