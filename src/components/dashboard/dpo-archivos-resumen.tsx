"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FolderOpen, Search, Clock, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  if (diff < 0) return "hoy"
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) {
    if (hours <= 0) {
      if (minutes <= 1) return "hace instantes"
      return `hace ${minutes} min`
    }
    return `hace ${hours} h`
  }
  if (days === 1) return "ayer"
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  if (months === 1) return "hace 1 mes"
  if (months < 12) return `hace ${months} meses`
  const years = Math.floor(months / 12)
  return years === 1 ? "hace 1 año" : `hace ${years} años`
}

function puntoToSlug(punto_codigo: string): string {
  return punto_codigo.replace(/\./g, "-")
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

export function DpoArchivosResumen({
  resumenPuntos,
}: {
  resumenPuntos: DpoPuntoResumen[]
}) {
  const [search, setSearch] = useState("")

  const stats = useMemo(() => {
    let totalArchivos = 0
    let puntosConArchivos = 0
    let ultimoArchivo: string | null = null
    for (const p of resumenPuntos) {
      totalArchivos += p.total_archivos
      if (p.total_archivos > 0) puntosConArchivos++
      ultimoArchivo = maxIso(ultimoArchivo, p.ultimo_archivo)
    }
    return { totalArchivos, puntosConArchivos, ultimoArchivo }
  }, [resumenPuntos])

  const filteredTop = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? resumenPuntos.filter(
          (p) =>
            p.titulo.toLowerCase().includes(q) ||
            p.punto_codigo.toLowerCase().includes(q) ||
            p.pilar_codigo.toLowerCase().includes(q),
        )
      : resumenPuntos
    return [...filtered]
      .sort((a, b) => {
        if (b.total_archivos !== a.total_archivos) {
          return b.total_archivos - a.total_archivos
        }
        const aDate = a.ultimo_archivo ? new Date(a.ultimo_archivo).getTime() : 0
        const bDate = b.ultimo_archivo ? new Date(b.ultimo_archivo).getTime() : 0
        return bDate - aDate
      })
      .slice(0, 10)
  }, [resumenPuntos, search])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4 text-slate-500" />
            Archivos DPO por punto
          </CardTitle>
          <Link
            href="/evidencia"
            className="text-xs text-blue-600 hover:underline"
          >
            Ver todos
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Total archivos</p>
            <p className="text-lg font-bold text-slate-900">
              {stats.totalArchivos}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Puntos con archivos</p>
            <p className="text-lg font-bold text-slate-900">
              {stats.puntosConArchivos}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {resumenPuntos.length}
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Último archivo</p>
            <p className="text-lg font-bold text-slate-900">
              {relativeTime(stats.ultimoArchivo)}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar punto o título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Top 10 list */}
        {filteredTop.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
            {search.trim()
              ? "Sin resultados para la búsqueda."
              : "Aún no hay archivos cargados."}
          </div>
        ) : (
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {filteredTop.map((p) => {
              const href = `/evidencia/${p.pilar_codigo}/${puntoToSlug(p.punto_codigo)}`
              const isEmpty = p.total_archivos === 0
              const tituloCorto = p.titulo.replace(/^[^—]+— /, "")
              return (
                <li key={`${p.pilar_codigo}-${p.punto_codigo}`}>
                  <Link
                    href={href}
                    className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-slate-400 hover:bg-slate-50 ${
                      isEmpty
                        ? "border-slate-200 bg-slate-50/40 text-slate-500"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] font-medium ${
                        PILAR_COLORS[p.pilar_codigo] ??
                        "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {PILAR_LABELS[p.pilar_codigo] ?? p.pilar_codigo}
                    </Badge>
                    <span className="font-mono text-xs font-bold text-slate-700 shrink-0">
                      {p.punto_codigo}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        isEmpty ? "text-slate-500" : "text-slate-800"
                      }`}
                      title={tituloCorto}
                    >
                      {tituloCorto}
                    </span>
                    <Badge
                      variant={isEmpty ? "outline" : "secondary"}
                      className="shrink-0 text-[10px]"
                    >
                      {p.total_archivos}{" "}
                      {p.total_archivos === 1 ? "archivo" : "archivos"}
                    </Badge>
                    <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground sm:flex">
                      <Clock className="size-3" />
                      {relativeTime(p.ultimo_archivo)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {/* Footer link */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" render={<Link href="/evidencia" />}>
            Ver todos los puntos
            <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
