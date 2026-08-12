"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  MessageSquare,
  Plus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ESTADO_CLIMA_LABEL,
  PRIORIDAD_CLIMA_LABEL,
  type ClimaOla,
  type ClimaPlan,
  type EstadoClimaPlan,
} from "@/actions/clima-tipos"
import type { UserRole } from "@/types/database"
import { PlanFormDialog } from "./plan-form-dialog"
import { PlanDetalleDialog } from "./plan-detalle-dialog"

export interface FocoInicialPlan {
  dimension?: string
  pregunta?: string
  hallazgo?: string
  foco?: string
  ola_id?: string
}

const TODOS = "__todos__"

const ESTADO_BADGE: Record<EstadoClimaPlan, string> = {
  pendiente: "border-amber-200 bg-amber-100 text-amber-800",
  en_progreso: "border-blue-200 bg-blue-100 text-blue-800",
  completado: "border-emerald-200 bg-emerald-100 text-emerald-800",
}

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "border-red-200 bg-red-100 text-red-800",
  media: "border-amber-200 bg-amber-100 text-amber-800",
  baja: "border-slate-200 bg-slate-100 text-slate-700",
}

const PRIORIDAD_ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 }

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

function fecha(iso: string | null): string {
  if (!iso) return "—"
  try {
    return FMT_DIA.format(new Date(`${iso.slice(0, 10)}T00:00:00`))
  } catch {
    return iso
  }
}

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
}

function estaVencido(p: ClimaPlan, hoy: string): boolean {
  return (
    p.estado !== "completado" &&
    p.fecha_objetivo != null &&
    p.fecha_objetivo < hoy
  )
}

interface Props {
  planes: ClimaPlan[]
  olas: ClimaOla[]
  olaVigente: string | null
  responsables: { id: string; nombre: string }[]
  role: UserRole
  focoInicial: FocoInicialPlan | null
  onFocoConsumido: () => void
}

export function PlanesBloque({
  planes,
  olas,
  olaVigente,
  responsables,
  role,
  focoInicial,
  onFocoConsumido,
}: Props) {
  const router = useRouter()
  const [abiertoManual, setAbiertoManual] = useState(false)
  const [editando, setEditando] = useState<ClimaPlan | null>(null)
  /** Cada apertura remonta el formulario: así arranca con los datos frescos. */
  const [aperturas, setAperturas] = useState(0)
  const [detalle, setDetalle] = useState<ClimaPlan | null>(null)
  const [filtroEstado, setFiltroEstado] = useState(TODOS)
  const [filtroPrioridad, setFiltroPrioridad] = useState(TODOS)

  const puedeEditar = ["admin", "supervisor", "admin_rrhh"].includes(role)
  const hoy = hoyISO()

  // Un hallazgo tocado en la solapa de Resultados abre el alta ya precargada:
  // el foco que baja por props alcanza para tener el formulario abierto.
  const formAbierto = abiertoManual || !!focoInicial

  const filtrados = useMemo(() => {
    return planes
      .filter(
        (p) =>
          (filtroEstado === TODOS || p.estado === filtroEstado) &&
          (filtroPrioridad === TODOS || p.prioridad === filtroPrioridad),
      )
      .sort(
        (a, b) =>
          PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad] ||
          a.created_at.localeCompare(b.created_at),
      )
  }, [planes, filtroEstado, filtroPrioridad])

  const resumen = useMemo(
    () => ({
      pendientes: planes.filter((p) => p.estado === "pendiente").length,
      enProgreso: planes.filter((p) => p.estado === "en_progreso").length,
      completados: planes.filter((p) => p.estado === "completado").length,
      vencidos: planes.filter((p) => estaVencido(p, hoy)).length,
    }),
    [planes, hoy],
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Pendientes",
            valor: resumen.pendientes,
            clase: "text-amber-600",
          },
          {
            label: "En progreso",
            valor: resumen.enProgreso,
            clase: "text-blue-600",
          },
          {
            label: "Completados",
            valor: resumen.completados,
            clase: "text-emerald-600",
          },
          { label: "Vencidos", valor: resumen.vencidos, clase: "text-red-600" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4">
              <p className="text-xs font-medium uppercase text-slate-500">
                {k.label}
              </p>
              <p className={`text-3xl font-bold ${k.clase}`}>{k.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filtroEstado}
          onValueChange={(v) => v && setFiltroEstado(v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {(
              ["pendiente", "en_progreso", "completado"] as EstadoClimaPlan[]
            ).map((e) => (
              <SelectItem key={e} value={e}>
                {ESTADO_CLIMA_LABEL[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filtroPrioridad}
          onValueChange={(v) => v && setFiltroPrioridad(v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Toda prioridad</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/api/clima/planes/export"
            }}
          >
            <Download className="mr-1.5 size-4" />
            Exportar a Excel
          </Button>
          {puedeEditar && (
            <Button
              onClick={() => {
                setEditando(null)
                setAperturas((n) => n + 1)
                setAbiertoManual(true)
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Nuevo plan
            </Button>
          )}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center">
          <ClipboardList className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-600">
            {planes.length
              ? "Ningún plan coincide con los filtros."
              : "Todavía no hay planes de acción cargados."}
          </p>
          {!planes.length && (
            <p className="mt-1 text-xs text-slate-500">
              En la solapa «Resultados», el botón + de cada ítem abre un plan con
              el hallazgo ya escrito.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Prioridad</th>
                <th className="px-3 py-2 font-semibold">Foco</th>
                <th className="px-3 py-2 font-semibold">Eje / Driver</th>
                <th className="px-3 py-2 font-semibold">Hallazgo</th>
                <th className="px-3 py-2 font-semibold">Acción concreta</th>
                <th className="px-3 py-2 font-semibold">Responsable</th>
                <th className="px-3 py-2 font-semibold">Plazo</th>
                <th className="px-3 py-2 font-semibold">
                  Indicador de éxito / Meta
                </th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const vencido = estaVencido(p, hoy)
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetalle(p)}
                    className="cursor-pointer border-t border-slate-100 align-top transition-colors hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Badge className={PRIORIDAD_BADGE[p.prioridad]}>
                        {PRIORIDAD_CLIMA_LABEL[p.prioridad]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {p.foco ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{p.eje ?? "—"}</td>
                    <td className="max-w-72 px-3 py-2 text-slate-600">
                      {p.hallazgo ?? "—"}
                      {p.ola_codigo && (
                        <span className="ml-1 text-[11px] text-slate-400">
                          ({p.ola_codigo})
                        </span>
                      )}
                    </td>
                    <td className="max-w-80 px-3 py-2 font-medium text-slate-900">
                      {p.accion}
                      {p.avances_count > 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                          <MessageSquare className="size-3" />
                          {p.avances_count}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {p.responsable_nombre ?? p.responsable_texto ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {p.plazo ?? "—"}
                      {p.fecha_objetivo && (
                        <span
                          className={`block text-[11px] ${
                            vencido ? "font-semibold text-red-600" : "text-slate-400"
                          }`}
                        >
                          {vencido && (
                            <AlertTriangle className="mr-0.5 inline size-3" />
                          )}
                          {fecha(p.fecha_objetivo)}
                        </span>
                      )}
                    </td>
                    <td className="max-w-64 px-3 py-2 text-slate-600">
                      {p.indicador_exito ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={ESTADO_BADGE[p.estado]}>
                        {p.estado === "completado" && (
                          <CheckCircle2 className="mr-1 size-3" />
                        )}
                        {ESTADO_CLIMA_LABEL[p.estado]}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PlanFormDialog
        key={`${editando?.id ?? "nuevo"}-${aperturas}`}
        open={formAbierto}
        onOpenChange={(o) => {
          setAbiertoManual(o)
          if (!o) {
            setEditando(null)
            onFocoConsumido()
          }
        }}
        olas={olas}
        olaVigente={olaVigente}
        responsables={responsables}
        planExistente={editando}
        focoInicial={focoInicial}
        onSaved={() => {
          setAbiertoManual(false)
          setEditando(null)
          onFocoConsumido()
          router.refresh()
        }}
      />

      {detalle && (
        <PlanDetalleDialog
          key={detalle.id}
          plan={detalle}
          open
          onOpenChange={(o) => !o && setDetalle(null)}
          puedeEditar={puedeEditar}
          onEditar={(p) => {
            setDetalle(null)
            setEditando(p)
            setAperturas((n) => n + 1)
            setAbiertoManual(true)
          }}
          onCambio={() => router.refresh()}
        />
      )}
    </div>
  )
}
