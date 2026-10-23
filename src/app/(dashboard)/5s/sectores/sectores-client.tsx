"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  Plus,
  TrendingUp,
  Trash2,
  UserCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  borrarTareaSector,
  crearTareaSector,
  getEvidenciaSectorUrl,
  type SectorConEvidencias,
} from "@/actions/s5-mi-sector"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function formatMes(periodo: string) {
  const [y, m] = periodo.split("-")
  return `${MESES[Number(m) - 1]} ${y}`
}

/** "Agosto" a secas, para la etiqueta de las tareas que vienen de otro mes. */
function formatMesCorto(periodo: string) {
  const [, m] = periodo.split("-")
  return MESES[Number(m) - 1].toLowerCase()
}

function formatFechaHora(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

interface Props {
  sectores: SectorConEvidencias[]
  periodo: string
  /** Meses que se pueden mirar, del más nuevo al más viejo. */
  periodos: string[]
  esMesActual: boolean
  puedeEditar: boolean
}

export function SectoresClient({
  sectores,
  periodo,
  periodos,
  esMesActual,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [nuevaTarea, setNuevaTarea] = useState<Record<number, string>>({})
  const [guardando, startGuardar] = useTransition()
  const [cambiandoMes, startCambiarMes] = useTransition()
  const [verFoto, setVerFoto] = useState<string | null>(null)

  // Las tareas nuevas se cargan sólo en el mes en curso; los meses anteriores
  // se miran, no se corrigen.
  const puedeCargar = puedeEditar && esMesActual

  const idx = periodos.indexOf(periodo)
  const mesSiguiente = idx > 0 ? periodos[idx - 1] : null
  const mesAnterior = idx >= 0 && idx < periodos.length - 1 ? periodos[idx + 1] : null
  const opcionesMes: Record<string, string> = {}
  for (const p of periodos) opcionesMes[p] = formatMes(p)

  function irAMes(p: string | null) {
    if (!p || p === periodo) return
    startCambiarMes(() => {
      router.push(`/5s/sectores?periodo=${p.slice(0, 7)}`)
    })
  }

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
      const res = await crearTareaSector({ periodo, sectorNumero: sector, titulo })
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
      <div>
        <Link
          href="/5s"
          className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          Volver a 5S
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tareas y evidencia por sector</h1>
            <p className="text-sm text-muted-foreground">
              {formatMes(periodo)} — quién fue responsable de cada sector ese mes y lo que cargó
              desde su celular. El bonus por documentar se suma solo a la nota al finalizar la
              auditoría del sector.
            </p>
          </div>

          {/* Selector de mes: se recorre con las flechas o eligiendo de la lista */}
          <div className="flex items-center gap-1.5">
            {cambiandoMes && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => irAMes(mesAnterior)}
              disabled={cambiandoMes || !mesAnterior}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Select
              value={periodo}
              onValueChange={(v) => irAMes(v)}
              disabled={cambiandoMes}
              items={opcionesMes}
            >
              <SelectTrigger className="min-w-[170px]">
                <CalendarDays className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodos.map((p) => (
                  <SelectItem key={p} value={p} label={formatMes(p)}>
                    {formatMes(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => irAMes(mesSiguiente)}
              disabled={cambiandoMes || !mesSiguiente}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        {!esMesActual && (
          <p className="mt-2 text-xs text-amber-700">
            Estás mirando un mes cerrado: se ve quién era responsable, las tareas de ese mes y lo
            que cargó. Las tareas nuevas se agregan en el mes en curso.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sectores.map((s) => (
          <Card key={s.sector_numero} className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {s.sector_numero}. {s.sector_nombre}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      s.responsable_nombre
                        ? "border-emerald-300 text-emerald-700"
                        : "text-slate-400"
                    }
                  >
                    <UserCheck className="mr-1 size-3.5" />
                    {s.responsable_nombre ?? "Sin sortear"}
                  </Badge>
                  <Badge className={s.documentacion.bonus > 0 ? "bg-amber-600" : "bg-slate-300"}>
                    <TrendingUp className="mr-1 size-3.5" />
                    +{s.documentacion.bonus}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {s.documentacion.total} carga{s.documentacion.total === 1 ? "" : "s"} ·{" "}
                {s.documentacion.con_antes_despues} con antes y después
              </p>
              <p className="text-xs text-slate-500">
                Check de limpieza:{" "}
                {s.check.dias === 0 ? (
                  <span className="text-slate-400">todavía sin días cerrados</span>
                ) : (
                  <span
                    className={
                      (s.check.pct ?? 0) >= 80 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"
                    }
                  >
                    {s.check.dias_completos} de {s.check.dias} días sin faltas ({s.check.pct}%)
                  </span>
                )}
                {" · "}periódicos sin faltas {s.check.periodicos_hechos}/{s.check.periodicos_total}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tareas */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tareas del sector ({s.tareas.filter((t) => !t.es_libre).length})
                </p>
                {s.tareas.filter((t) => !t.es_libre).length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Sin tareas puntuales. El responsable igual ve el checklist de auditoría.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {s.tareas
                      .filter((t) => !t.es_libre)
                      .map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                        >
                          <span className="flex-1 text-sm text-slate-800">
                            {t.descripcion}
                            {t.mes_origen && (
                              <span className="ml-1.5 text-[11px] text-amber-700">
                                pendiente de {formatMesCorto(t.mes_origen)}
                              </span>
                            )}
                          </span>
                          {t.estado === "cerrada" && (
                            <Badge variant="outline" className="border-slate-300 text-slate-500">
                              cerrada
                            </Badge>
                          )}
                          {t.completas > 0 && (
                            <Badge className="bg-amber-600">{t.completas} A/D</Badge>
                          )}
                          {t.evidencias > 0 && (
                            <Badge className="bg-emerald-600">{t.evidencias} 📸</Badge>
                          )}
                          {puedeCargar && (
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
                      ))}
                  </div>
                )}

                {puedeCargar && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={nuevaTarea[s.sector_numero] ?? ""}
                      onChange={(e) =>
                        setNuevaTarea((p) => ({ ...p, [s.sector_numero]: e.target.value }))
                      }
                      placeholder="Nueva tarea para este sector"
                      className="h-9 flex-1"
                    />
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

              {/* Evidencia */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Evidencia del mes ({s.evidencias.length})
                </p>
                {s.evidencias.length === 0 ? (
                  <p className="text-sm text-slate-400">Todavía no cargaron nada.</p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {s.evidencias.map((e) => {
                      const antes = e.fotos.find((f) => f.momento === "antes")
                      const despues = e.fotos.find((f) => f.momento === "despues")
                      const sueltas = e.fotos.filter((f) => !f.momento)
                      return (
                        <div key={e.id} className="rounded-md border border-slate-100 p-2">
                          <p className="text-sm text-slate-800">{e.comentario}</p>
                          <p className="text-xs text-slate-500">
                            {e.autor_nombre} · {formatFechaHora(e.created_at)}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {[
                              ...(antes ? [{ f: antes, label: "ANTES" }] : []),
                              ...(despues ? [{ f: despues, label: "DESPUÉS" }] : []),
                              ...sueltas.map((f) => ({ f, label: "FOTO" })),
                            ].map(({ f, label }) => (
                              <button
                                key={f.path}
                                type="button"
                                onClick={() => abrirFoto(f.path)}
                                className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                <ImageIcon className="size-3.5" />
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
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
