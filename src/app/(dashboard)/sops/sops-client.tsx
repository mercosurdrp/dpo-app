"use client"

import { useMemo, useState } from "react"
import { ExternalLink, FileText, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { PilarSops } from "@/actions/sops-empleado"

const TODOS = "todos"

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

export function SopsClient({ pilares }: { pilares: PilarSops[] }) {
  const [pilar, setPilar] = useState(TODOS)
  const [busqueda, setBusqueda] = useState("")

  const total = pilares.reduce((n, p) => n + p.sops.length, 0)

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return pilares
      .filter((p) => pilar === TODOS || p.codigo === pilar)
      .map((p) => ({
        ...p,
        sops: q ? p.sops.filter((s) => normalizar(`${s.punto ?? ""} ${s.titulo}`).includes(q)) : p.sops,
      }))
      // Buscando, los pilares sin resultados no suman nada.
      .filter((p) => !q || p.sops.length > 0)
  }, [pilares, pilar, busqueda])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <FileText className="size-6 text-indigo-600" />
          SOPs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los procedimientos vigentes de todos los pilares ({total}). Tocá uno para leerlo.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un SOP (ej: rechazo, checklist, picking)"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip activo={pilar === TODOS} onClick={() => setPilar(TODOS)}>
          Todos
        </Chip>
        {pilares.map((p) => (
          <Chip key={p.codigo} activo={pilar === p.codigo} color={p.color} onClick={() => setPilar(p.codigo)}>
            {p.nombre} <span className="opacity-60">({p.sops.length})</span>
          </Chip>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ningún SOP coincide con la búsqueda.</p>
      ) : (
        visibles.map((p) => (
          <section key={p.codigo} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.nombre}
            </h2>
            {p.sops.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                Todavía no hay SOPs cargados en este pilar.
              </p>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {p.sops.map((s) => (
                    <a
                      key={`${s.origen}-${s.id}`}
                      href={`/api/sops-empleado/${s.origen}/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100"
                    >
                      {s.punto && (
                        <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-slate-500">{s.punto}</span>
                      )}
                      <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{s.titulo}</span>
                      {s.ext && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          {s.ext}
                        </span>
                      )}
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        ))
      )}
    </div>
  )
}

function Chip({
  activo,
  color,
  onClick,
  children,
}: {
  activo: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        activo ? "border-transparent text-white" : "bg-white text-slate-700 hover:bg-slate-50",
      )}
      style={activo ? { backgroundColor: color ?? "#0f172a" } : undefined}
    >
      {children}
    </button>
  )
}
