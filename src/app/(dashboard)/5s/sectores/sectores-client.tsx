"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  borrarTareaSector,
  crearTareaSector,
  getEvidenciaSectorUrl,
  type SectorConEvidencias,
} from "@/actions/s5-mi-sector"
import {
  S5_CATEGORIA_COLORS,
  S5_CATEGORIA_ORDEN,
  S5_CATEGORIA_LABELS,
  type S5Categoria,
} from "@/types/database"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function formatMes(periodo: string) {
  const [y, m] = periodo.split("-")
  return `${MESES[Number(m) - 1]} ${y}`
}

function formatFechaHora(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

interface Props {
  sectores: SectorConEvidencias[]
  periodo: string
  puedeEditar: boolean
}

export function SectoresClient({ sectores, periodo, puedeEditar }: Props) {
  const router = useRouter()
  const [nuevaTarea, setNuevaTarea] = useState<Record<number, string>>({})
  const [categoria, setCategoria] = useState<Record<number, S5Categoria | "">>({})
  const [guardando, startGuardar] = useTransition()
  const [verFoto, setVerFoto] = useState<string | null>(null)

  async function abrirFoto(path: string) {
    const res = await getEvidenciaSectorUrl(path)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setVerFoto(res.data.url)
  }

  function handleAgregar(sector: number) {
    const titulo = (nuevaTarea[sector] ?? "").trim()
    if (!titulo) {
      toast.error("Escribí la tarea")
      return
    }
    startGuardar(async () => {
      const res = await crearTareaSector({
        periodo,
        sectorNumero: sector,
        titulo,
        categoria: categoria[sector] || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setNuevaTarea((p) => ({ ...p, [sector]: "" }))
      toast.success("Tarea agregada")
      router.refresh()
    })
  }

  function handleBorrar(id: string) {
    startGuardar(async () => {
      const res = await borrarTareaSector(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Tarea quitada")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/5s" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" />
            Volver a 5S
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Tareas y evidencia por sector</h1>
          <p className="text-sm text-muted-foreground">
            {formatMes(periodo)} — lo que carga cada responsable desde su celular.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sectores.map((s) => (
          <Card key={s.sector_numero} className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {s.sector_numero}. {s.sector_nombre}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={s.responsable_nombre ? "border-emerald-300 text-emerald-700" : "text-slate-400"}
                >
                  <UserCheck className="mr-1 size-3.5" />
                  {s.responsable_nombre ?? "Sin sortear"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tareas del mes */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tareas del mes ({s.tareas.length})
                </p>
                {s.tareas.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Sin tareas puntuales. El responsable igual ve el checklist de auditoría.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {s.tareas.map((t) => {
                      const hecho = s.evidencias.filter((e) => e.tarea_id === t.id).length
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                        >
                          <span className="flex-1 text-sm text-slate-800">{t.titulo}</span>
                          {t.categoria && (
                            <span
                              className="text-[10px] font-semibold uppercase"
                              style={{ color: S5_CATEGORIA_COLORS[t.categoria] }}
                            >
                              {S5_CATEGORIA_LABELS[t.categoria]}
                            </span>
                          )}
                          {hecho > 0 && <Badge className="bg-emerald-600">{hecho} 📸</Badge>}
                          {puedeEditar && (
                            <button
                              type="button"
                              onClick={() => handleBorrar(t.id)}
                              className="text-slate-400 hover:text-red-600"
                              aria-label="Quitar tarea"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {puedeEditar && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Input
                      value={nuevaTarea[s.sector_numero] ?? ""}
                      onChange={(e) =>
                        setNuevaTarea((p) => ({ ...p, [s.sector_numero]: e.target.value }))
                      }
                      placeholder="Nueva tarea para este sector"
                      className="h-9 flex-1 min-w-[180px]"
                    />
                    <select
                      value={categoria[s.sector_numero] ?? ""}
                      onChange={(e) =>
                        setCategoria((p) => ({
                          ...p,
                          [s.sector_numero]: e.target.value as S5Categoria | "",
                        }))
                      }
                      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    >
                      <option value="">S —</option>
                      {S5_CATEGORIA_ORDEN.map((c) => (
                        <option key={c} value={c}>
                          {S5_CATEGORIA_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => handleAgregar(s.sector_numero)}
                      disabled={guardando}
                    >
                      {guardando ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Evidencia cargada */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Evidencia cargada ({s.evidencias.length})
                </p>
                {s.evidencias.length === 0 ? (
                  <p className="text-sm text-slate-400">Todavía no cargaron nada.</p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {s.evidencias.map((e) => (
                      <div
                        key={e.id}
                        className="flex gap-2 rounded-md border border-slate-100 p-2"
                      >
                        {e.storage_path ? (
                          <button
                            type="button"
                            onClick={() => abrirFoto(e.storage_path!)}
                            className="flex size-12 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"
                            aria-label="Ver foto"
                          >
                            <ImageIcon className="size-5" />
                          </button>
                        ) : (
                          <div className="size-12 shrink-0 rounded bg-slate-50" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800">{e.comentario}</p>
                          <p className="text-xs text-slate-500">
                            {e.autor_nombre} · {formatFechaHora(e.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {verFoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVerFoto(null)}
        >
          <Image
            src={verFoto}
            alt="Evidencia 5S"
            width={1200}
            height={900}
            unoptimized
            className="max-h-full w-auto max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}
