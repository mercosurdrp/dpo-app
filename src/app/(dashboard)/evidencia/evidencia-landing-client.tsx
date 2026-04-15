"use client"

import Link from "next/link"
import { FolderOpen, Clock, Activity } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { DpoPuntoResumen } from "@/types/database"

const PUNTOS_CONOCIDOS: Array<{
  pilar_codigo: string
  punto_codigo: string
  titulo: string
}> = [
  { pilar_codigo: "entrega", punto_codigo: "1.1", titulo: "Entrega 1.1 — PRE RUTA" },
  { pilar_codigo: "entrega", punto_codigo: "1.2", titulo: "Entrega 1.2 — EN RUTA" },
]

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
  return punto_codigo.replace(".", "-")
}

export function EvidenciaLandingClient({ puntos }: { puntos: DpoPuntoResumen[] }) {
  const map = new Map<string, DpoPuntoResumen>()
  for (const p of puntos) {
    map.set(`${p.pilar_codigo}|${p.punto_codigo}`, p)
  }
  for (const k of PUNTOS_CONOCIDOS) {
    const key = `${k.pilar_codigo}|${k.punto_codigo}`
    if (!map.has(key)) {
      map.set(key, {
        pilar_codigo: k.pilar_codigo,
        punto_codigo: k.punto_codigo,
        titulo: k.titulo,
        total_archivos: 0,
        total_actividad: 0,
        ultimo_archivo: null,
        ultima_actividad: null,
      })
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => {
    if (a.pilar_codigo !== b.pilar_codigo) return a.pilar_codigo.localeCompare(b.pilar_codigo)
    return a.punto_codigo.localeCompare(b.punto_codigo)
  })

  const isEmpty = puntos.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Evidencia DPO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestión documental por punto del manual DPO 2.0
          </p>
        </div>
        <Link href="/evidencia/timeline">
          <Button variant="outline">
            <Activity className="mr-2 size-4" />
            Ver timeline global
          </Button>
        </Link>
      </div>

      {isEmpty && (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          Sin archivos cargados. Subí el primero a{" "}
          <Link href="/evidencia/entrega/1-1" className="font-medium text-slate-900 underline">
            /evidencia/entrega/1-1
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => {
          const href = `/evidencia/${p.pilar_codigo}/${puntoToSlug(p.punto_codigo)}`
          return (
            <Link key={`${p.pilar_codigo}-${p.punto_codigo}`} href={href}>
              <Card className="h-full p-5 transition-colors hover:border-slate-400">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                    <FolderOpen className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900">{p.titulo}</h3>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                      {p.pilar_codigo} · {p.punto_codigo}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Archivos</div>
                    <div className="font-semibold text-slate-900">{p.total_archivos}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Eventos</div>
                    <div className="font-semibold text-slate-900">{p.total_actividad}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {relativeTime(p.ultima_actividad ?? p.ultimo_archivo)}
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
