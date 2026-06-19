"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  Target,
  Wallet,
  CheckCircle2,
  Info,
  LineChart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { getSignedUrl } from "@/actions/presupuesto"
import { eliminarIniciativa } from "@/actions/presupuesto-iniciativas"
import type { IniciativaAhorroConDetalle } from "@/types/database"
import {
  AREA_BADGE_CLASS,
  AREA_LABEL,
  ESTADO_BADGE_CLASS,
  ESTADO_LABEL,
  TIPO_LABEL,
  TRIMESTRES,
} from "./iniciativas-constantes"
import { IniciativaFormDialog } from "./iniciativa-form-dialog"
import { SeguimientoIniciativaDialog } from "./seguimiento-iniciativa-dialog"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  anio: number
  iniciativas: IniciativaAhorroConDetalle[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatNum(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)
}

// Fracción de cumplimiento del KPI (0 = sin avance, 1 = objetivo alcanzado).
// Puede dar negativo si la métrica empeoró respecto de la línea base.
function cumplimientoKpi(
  base: number | null,
  objetivo: number | null,
  valor: number | null,
  mejorSi: "menor" | "mayor",
): number | null {
  if (base === null || objetivo === null || valor === null) return null
  const span = mejorSi === "menor" ? base - objetivo : objetivo - base
  if (span === 0) return null
  const avance = mejorSi === "menor" ? base - valor : valor - base
  return avance / span
}

function SemaforoBadge({ frac }: { frac: number | null }) {
  if (frac === null) {
    return <span className="text-xs text-muted-foreground">Sin datos</span>
  }
  const pct = Math.round(frac * 100)
  if (frac >= 1) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Cumplido · {pct}%
      </Badge>
    )
  }
  if (frac >= 0.5) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En progreso · {pct}%
      </Badge>
    )
  }
  if (frac >= 0) {
    return (
      <Badge className="border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100">
        Bajo · {pct}%
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      Empeoró · {pct}%
    </Badge>
  )
}

function barColor(frac: number | null): string {
  if (frac === null) return "bg-slate-300"
  if (frac >= 1) return "bg-emerald-500"
  if (frac >= 0.5) return "bg-amber-500"
  if (frac >= 0) return "bg-orange-500"
  return "bg-red-500"
}

export function IniciativasAhorroSection({
  anio,
  iniciativas,
  responsables,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [openForm, setOpenForm] = useState(false)
  const [editando, setEditando] =
    useState<IniciativaAhorroConDetalle | null>(null)
  const [seguimientoDe, setSeguimientoDe] =
    useState<IniciativaAhorroConDetalle | null>(null)
  const [trimestreInicial, setTrimestreInicial] = useState<number>(1)

  function refrescar() {
    router.refresh()
  }

  async function abrirArchivo(url: string | null) {
    if (!url) return
    const result = await getSignedUrl(url)
    if ("error" in result) {
      alert(`Error abriendo archivo: ${result.error}`)
      return
    }
    abrirArchivoEnVisor(result.data.url)
  }

  function handleEliminar(ini: IniciativaAhorroConDetalle) {
    if (
      !confirm(
        `¿Eliminar la iniciativa "${ini.titulo}"? Se borran también sus avances trimestrales. No se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarIniciativa(ini.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function abrirSeguimiento(ini: IniciativaAhorroConDetalle, q: number) {
    setTrimestreInicial(q)
    setSeguimientoDe(ini)
  }

  // Totales para las tarjetas resumen
  const resumen = useMemo(() => {
    let comprometido = 0
    let realAcum = 0
    let implementadas = 0
    for (const ini of iniciativas) {
      comprometido += ini.ahorro_comprometido_anual ?? 0
      for (const s of ini.seguimientos) realAcum += s.ahorro_real ?? 0
      if (ini.estado === "implementada") implementadas++
    }
    return { comprometido, realAcum, implementadas }
  }, [iniciativas])

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="size-5 shrink-0 text-blue-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Rutina de Campeones — Iniciativas de Ahorro (5.2)
            </p>
            <p className="mt-1">
              Cargá las iniciativas comprometidas y seguí{" "}
              <strong>trimestralmente</strong> el ahorro real y la métrica
              comprometida para ver si realmente funcionaron. El ahorro debería
              estar reflejado en el presupuesto del año (bloque 1).
            </p>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <LineChart className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Iniciativas</p>
              <p className="text-lg font-bold text-slate-900">
                {iniciativas.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Target className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Ahorro comprometido
              </p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatMoney(resumen.comprometido)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <Wallet className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Ahorro real acumulado
              </p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatMoney(resumen.realAcum)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Implementadas</p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.implementadas}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acción */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Iniciativas {anio}
        </h2>
        {puedeEditar && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditando(null)
              setOpenForm(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Nueva iniciativa
          </Button>
        )}
      </div>

      {/* Lista de iniciativas */}
      {iniciativas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin iniciativas de ahorro cargadas para {anio}.
            {puedeEditar && (
              <>
                {" "}
                <button
                  className="font-medium text-blue-600 hover:underline"
                  onClick={() => {
                    setEditando(null)
                    setOpenForm(true)
                  }}
                >
                  Cargá la primera
                </button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {iniciativas.map((ini) => {
            const realAcum = ini.seguimientos.reduce(
              (acc, s) => acc + (s.ahorro_real ?? 0),
              0,
            )
            const ahorroFrac =
              ini.ahorro_comprometido_anual && ini.ahorro_comprometido_anual > 0
                ? realAcum / ini.ahorro_comprometido_anual
                : null
            // último valor de KPI (mayor trimestre con dato)
            const conKpi = [...ini.seguimientos]
              .filter((s) => s.kpi_valor !== null)
              .sort((a, b) => b.trimestre - a.trimestre)
            const ultimoKpi = conKpi.length > 0 ? conKpi[0].kpi_valor : null
            const kpiFrac = cumplimientoKpi(
              ini.kpi_linea_base,
              ini.kpi_objetivo,
              ultimoKpi,
              ini.kpi_mejor_si,
            )
            const tipoLabel =
              ini.tipo === "otro" && ini.tipo_otro
                ? ini.tipo_otro
                : TIPO_LABEL[ini.tipo]

            return (
              <Card key={ini.id}>
                <CardContent className="space-y-4 py-4">
                  {/* Cabecera */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {ini.area && (
                          <Badge
                            className={`${AREA_BADGE_CLASS[ini.area]} hover:opacity-100`}
                          >
                            {AREA_LABEL[ini.area]}
                          </Badge>
                        )}
                        <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {tipoLabel}
                        </Badge>
                        <Badge
                          className={`${ESTADO_BADGE_CLASS[ini.estado]} hover:opacity-100`}
                        >
                          {ESTADO_LABEL[ini.estado]}
                        </Badge>
                        {ini.incluida_en_presupuesto && (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            En presupuesto
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 font-semibold text-slate-900">
                        {ini.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ini.responsable_nombre ?? "Sin responsable"}
                        {ini.fecha_implementacion &&
                          ` · Implementación: ${ini.fecha_implementacion}`}
                        {ini.inversion_capex != null &&
                          ` · CAPEX: ${formatMoney(ini.inversion_capex)}`}
                        {ini.nivel_impacto != null &&
                          ` · Impacto: ${ini.nivel_impacto}%`}
                      </p>
                      {ini.descripcion && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {ini.descripcion}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {puedeEditar && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => abrirSeguimiento(ini, 1)}
                            title="Cargar avance trimestral"
                          >
                            <TrendingUp className="mr-1 size-3.5" />
                            Avance
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditando(ini)
                              setOpenForm(true)
                            }}
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEliminar(ini)}
                            title="Eliminar"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ahorro + KPI */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Ahorro */}
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Ahorro (real acum. / comprometido)</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {formatMoney(realAcum)} /{" "}
                        {formatMoney(ini.ahorro_comprometido_anual)}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full ${barColor(ahorroFrac)}`}
                          style={{
                            width: `${Math.max(0, Math.min(100, (ahorroFrac ?? 0) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* KPI */}
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {ini.kpi_nombre
                            ? ini.kpi_nombre +
                              (ini.kpi_unidad ? ` (${ini.kpi_unidad})` : "")
                            : "KPI comprometido"}
                        </span>
                        <SemaforoBadge frac={kpiFrac} />
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        Base {formatNum(ini.kpi_linea_base)} → Obj{" "}
                        {formatNum(ini.kpi_objetivo)}
                        <span className="text-muted-foreground">
                          {" "}
                          · Últ. {formatNum(ultimoKpi)}
                        </span>
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full ${barColor(kpiFrac)}`}
                          style={{
                            width: `${Math.max(0, Math.min(100, (kpiFrac ?? 0) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tira de trimestres */}
                  <div className="grid grid-cols-4 gap-2">
                    {TRIMESTRES.map((q) => {
                      const s = ini.seguimientos.find((x) => x.trimestre === q)
                      const fracQ = s
                        ? cumplimientoKpi(
                            ini.kpi_linea_base,
                            ini.kpi_objetivo,
                            s.kpi_valor,
                            ini.kpi_mejor_si,
                          )
                        : null
                      return (
                        <button
                          key={q}
                          type="button"
                          disabled={!puedeEditar}
                          onClick={() => abrirSeguimiento(ini, q)}
                          className={`rounded-lg border p-2 text-left transition-colors ${
                            puedeEditar
                              ? "hover:border-blue-300 hover:bg-blue-50/40"
                              : ""
                          } ${s ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/50"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">
                              Q{q}
                            </span>
                            <span
                              className={`size-2 rounded-full ${s ? barColor(fracQ) : "bg-slate-300"}`}
                            />
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-700">
                            KPI: {formatNum(s?.kpi_valor ?? null)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s?.ahorro_real != null
                              ? formatMoney(s.ahorro_real)
                              : "—"}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Diálogos */}
      {puedeEditar && (
        <IniciativaFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          anio={anio}
          iniciativa={editando}
          responsables={responsables}
          onSaved={refrescar}
        />
      )}

      {puedeEditar && seguimientoDe && (
        <SeguimientoIniciativaDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setSeguimientoDe(null)
          }}
          iniciativa={seguimientoDe}
          defaultTrimestre={trimestreInicial}
          onSaved={refrescar}
          onAbrirArchivo={abrirArchivo}
        />
      )}
    </div>
  )
}
