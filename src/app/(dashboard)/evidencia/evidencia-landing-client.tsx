"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FolderOpen, Clock, Activity, Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { DpoPuntoResumen } from "@/types/database"

const PILAR_LABELS: Record<string, string> = {
  seguridad: "Seguridad",
  gente: "Gente",
  gestion: "Gestión",
  entrega: "Entrega",
  flota: "Flota",
  almacen: "Almacén",
  planeamiento: "Planeamiento",
}

const PILAR_COLORS: Record<string, string> = {
  seguridad: "bg-red-100 text-red-700",
  gente: "bg-blue-100 text-blue-700",
  gestion: "bg-slate-100 text-slate-700",
  entrega: "bg-amber-100 text-amber-700",
  flota: "bg-indigo-100 text-indigo-700",
  almacen: "bg-teal-100 text-teal-700",
  planeamiento: "bg-purple-100 text-purple-700",
}

function relativeTime(iso: string | null): string {
  if (!iso) return "sin actividad"
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours <= 0) return "hace minutos"
    return `hace ${hours} h`
  }
  if (days === 1) return "hace 1 día"
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  if (months === 1) return "hace 1 mes"
  return `hace ${months} meses`
}

function puntoToSlug(punto_codigo: string): string {
  return punto_codigo.replace(/\./g, "-")
}

export function EvidenciaLandingClient({ puntos }: { puntos: DpoPuntoResumen[] }) {
  const [search, setSearch] = useState("")
  const [pilarFilter, setPilarFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return puntos.filter((p) => {
      if (pilarFilter !== "all" && p.pilar_codigo !== pilarFilter) return false
      if (!q) return true
      return (
        p.titulo.toLowerCase().includes(q) ||
        p.punto_codigo.toLowerCase().includes(q) ||
        p.pilar_codigo.toLowerCase().includes(q)
      )
    })
  }, [puntos, search, pilarFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, DpoPuntoResumen[]>()
    for (const p of filtered) {
      if (!map.has(p.pilar_codigo)) map.set(p.pilar_codigo, [])
      map.get(p.pilar_codigo)!.push(p)
    }
    return Array.from(map.entries())
  }, [filtered])

  const pilaresUnicos = useMemo(() => {
    const s = new Set(puntos.map((p) => p.pilar_codigo))
    return Array.from(s).sort()
  }, [puntos])

  const totalArchivos = puntos.reduce((acc, p) => acc + p.total_archivos, 0)
  const totalEventos = puntos.reduce((acc, p) => acc + p.total_actividad, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Evidencia DPO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestión documental por punto del manual DPO 2.0 · {puntos.length} puntos ·{" "}
            {totalArchivos} archivos · {totalEventos} eventos
          </p>
        </div>
        <Link href="/evidencia/timeline">
          <Button variant="outline">
            <Activity className="mr-2 size-4" />
            Ver timeline global
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar punto o título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={pilarFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setPilarFilter("all")}
          >
            Todos
          </Button>
          {pilaresUnicos.map((p) => (
            <Button
              key={p}
              variant={pilarFilter === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPilarFilter(p)}
            >
              {PILAR_LABELS[p] ?? p}
            </Button>
          ))}
        </div>
      </div>

      {puntos.length === 0 && (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          Cargando puntos del DPO... Si no aparecen, verificá que las tablas `pilares` y
          `preguntas` tengan datos.
        </Card>
      )}

      {filtered.length === 0 && puntos.length > 0 && (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          Sin resultados para los filtros aplicados.
        </Card>
      )}

      <div className="space-y-6">
        {grouped.map(([pilarCod, lista]) => (
          <div key={pilarCod}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {PILAR_LABELS[pilarCod] ?? pilarCod}
              </h2>
              <Badge variant="outline" className="text-[10px]">
                {lista.length} puntos
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {lista.map((p) => {
                const href = `/evidencia/${p.pilar_codigo}/${puntoToSlug(p.punto_codigo)}`
                const hasActivity = p.total_archivos > 0 || p.total_actividad > 0
                return (
                  <Link key={`${p.pilar_codigo}-${p.punto_codigo}`} href={href}>
                    <Card
                      className={`h-full p-4 transition-all hover:shadow-md hover:border-slate-400 ${
                        hasActivity ? "border-slate-300" : "border-dashed"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`rounded-lg p-2 ${
                            PILAR_COLORS[p.pilar_codigo] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <FolderOpen className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {p.punto_codigo}
                            </span>
                          </div>
                          <h3 className="mt-1 line-clamp-2 text-sm font-medium text-slate-800">
                            {p.titulo.replace(/^[^—]+— /, "")}
                          </h3>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {p.total_archivos} archivos · {p.total_actividad} eventos
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        {relativeTime(p.ultima_actividad ?? p.ultimo_archivo)}
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
