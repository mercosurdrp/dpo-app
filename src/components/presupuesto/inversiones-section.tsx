"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Pencil,
  Trash2,
  Info,
  TrendingUp,
  Wallet,
  CheckCircle2,
  CalendarClock,
  FileDown,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { getSignedUrl } from "@/actions/presupuesto"
import { eliminarInversion } from "@/actions/presupuesto-inversiones"
import { leerObservaciones, MARCA_ORIGEN } from "@/lib/inversiones-origen"
import type {
  HorizonteInversion,
  InversionConDetalle,
} from "@/types/database"
import {
  CATEGORIA_LABEL,
  ESTADO_INVERSION_BADGE_CLASS,
  ESTADO_INVERSION_LABEL,
  HORIZONTE_BADGE_CLASS,
  HORIZONTE_LABEL,
  HORIZONTE_OPCIONES,
} from "./inversiones-constantes"
import { InversionFormDialog } from "./inversion-form-dialog"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  anio: number
  inversiones: InversionConDetalle[]
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

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// Desvío del costo real vs. estimado (+ = se pasó del estimado)
function DesvioMonto({
  estimado,
  real,
}: {
  estimado: number | null
  real: number | null
}) {
  if (estimado === null || real === null || estimado === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const pct = ((real - estimado) / estimado) * 100
  const abs = Math.abs(pct)
  const sign = pct > 0 ? "+" : ""
  let cls = "border-emerald-200 bg-emerald-100 text-emerald-700"
  if (abs >= 15) cls = "border-red-200 bg-red-100 text-red-700"
  else if (abs >= 5) cls = "border-amber-200 bg-amber-100 text-amber-800"
  return (
    <Badge className={`${cls} hover:opacity-100`}>
      {sign}
      {pct.toFixed(1)}%
    </Badge>
  )
}

/**
 * Marca de dónde vino la inversión cuando la cargó Plan de Mantenimiento
 * Edilicio. Las filas siguen siendo editables acá, pero el próximo push del
 * origen pisa título, montos, fechas, estado y proveedor.
 */
function OrigenExterno({ inversion }: { inversion: InversionConDetalle }) {
  const { origen } = leerObservaciones(inversion.observaciones)
  if (!origen) return null
  const detalle = [origen.rubro, origen.responsable].filter(Boolean).join(" · ")
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-blue-700">
      <ExternalLink className="size-3 shrink-0" />
      {origen.url ? (
        <a
          href={origen.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          title="Abrir el plan de acción en Plan de Mantenimiento Edilicio"
        >
          {MARCA_ORIGEN}
        </a>
      ) : (
        <span>{MARCA_ORIGEN}</span>
      )}
      {detalle && <span className="text-muted-foreground">· {detalle}</span>}
    </p>
  )
}

/** Avance % del plan de acción; sólo lo mantiene la app de mantenimiento. */
function AvanceOrigen({ inversion }: { inversion: InversionConDetalle }) {
  const { origen } = leerObservaciones(inversion.observaciones)
  if (!origen || origen.avancePct === null) return null
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      avance {origen.avancePct}%
    </p>
  )
}

export function InversionesSection({
  anio,
  inversiones,
  responsables,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [openForm, setOpenForm] = useState(false)
  const [editando, setEditando] = useState<InversionConDetalle | null>(null)
  // Filtro por horizonte: null = todas
  const [horizonte, setHorizonte] = useState<HorizonteInversion | null>(null)

  const filtradas = useMemo(
    () =>
      horizonte === null
        ? inversiones
        : inversiones.filter((i) => i.horizonte_anios === horizonte),
    [inversiones, horizonte],
  )

  // Cuántas hay y cuánto suman por horizonte (sin canceladas), para los chips
  const porHorizonte = useMemo(() => {
    const acc = new Map<HorizonteInversion, { n: number; monto: number }>()
    for (const o of HORIZONTE_OPCIONES) acc.set(o.value, { n: 0, monto: 0 })
    for (const inv of inversiones) {
      if (inv.estado === "cancelada") continue
      const h = acc.get(inv.horizonte_anios)
      if (!h) continue
      h.n++
      h.monto += inv.monto_estimado ?? 0
    }
    return acc
  }, [inversiones])

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

  function handleEliminar(inv: InversionConDetalle) {
    if (
      !confirm(
        `¿Eliminar la inversión "${inv.titulo}"? No se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarInversion(inv.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  const resumen = useMemo(() => {
    let estimadoTotal = 0
    let realizadasMonto = 0
    let realizadas = 0
    let pendientes = 0
    for (const inv of filtradas) {
      if (inv.estado !== "cancelada") estimadoTotal += inv.monto_estimado ?? 0
      if (inv.estado === "realizada") {
        realizadas++
        realizadasMonto += inv.monto_real ?? 0
      } else if (inv.estado !== "cancelada") {
        pendientes++
      }
    }
    return { estimadoTotal, realizadasMonto, realizadas, pendientes }
  }, [filtradas])

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="size-5 shrink-0 text-blue-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Inversiones</p>
            <p className="mt-1">
              Cargá las inversiones futuras con su{" "}
              <strong>fecha programada</strong>, <strong>monto estimado</strong>{" "}
              y el <strong>beneficio esperado</strong>. Al concretarse, marcá el
              estado y registrá <strong>cuánto salió</strong> realmente. Cada
              inversión lleva su <strong>horizonte</strong>: del año, o a 2, 3 o
              5 años, para separar lo inmediato de lo que se planifica a largo
              plazo.
            </p>
          </div>
        </div>
      </div>

      {/* Filtro por horizonte */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Horizonte:
        </span>
        <button
          type="button"
          onClick={() => setHorizonte(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            horizonte === null
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Todas ({inversiones.filter((i) => i.estado !== "cancelada").length})
        </button>
        {HORIZONTE_OPCIONES.map((o) => {
          const h = porHorizonte.get(o.value)
          const activo = horizonte === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setHorizonte(activo ? null : o.value)}
              title={`${o.label}: ${formatMoney(h?.monto ?? 0)} estimados`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activo
                  ? "border-slate-900 bg-slate-900 text-white"
                  : `${HORIZONTE_BADGE_CLASS[o.value]} hover:opacity-80`
              }`}
            >
              {o.label} ({h?.n ?? 0})
              {h && h.monto > 0 && (
                <span className="ml-1 font-normal opacity-80">
                  · {formatMoney(h.monto)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Wallet className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Inversión estimada</p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatMoney(resumen.estimadoTotal)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Ejecutado (realizadas)
              </p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatMoney(resumen.realizadasMonto)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <CalendarClock className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.pendientes}
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
              <p className="text-xs text-muted-foreground">Realizadas</p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.realizadas}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acción */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Inversiones {anio}
          {horizonte !== null && (
            <span className="ml-2 font-normal text-muted-foreground">
              · {HORIZONTE_LABEL[horizonte].toLowerCase()}
            </span>
          )}
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
            Nueva inversión
          </Button>
        )}
      </div>

      {/* Tabla */}
      {filtradas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {horizonte === null
              ? `Sin inversiones cargadas para ${anio}.`
              : `Sin inversiones ${HORIZONTE_LABEL[horizonte].toLowerCase()} en ${anio}.`}
            {puedeEditar && horizonte === null && (
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
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inversión</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Horizonte</TableHead>
                <TableHead>Programada</TableHead>
                <TableHead className="text-right">Estimado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead>Desvío</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {inv.titulo}
                    {inv.cantidad ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ×{inv.cantidad}
                      </span>
                    ) : null}
                    {inv.beneficio_esperado && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {inv.beneficio_esperado}
                      </p>
                    )}
                    <OrigenExterno inversion={inv} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {CATEGORIA_LABEL[inv.categoria]}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${HORIZONTE_BADGE_CLASS[inv.horizonte_anios]} hover:opacity-100`}
                    >
                      {HORIZONTE_LABEL[inv.horizonte_anios]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(inv.fecha_programada)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {formatMoney(inv.monto_estimado)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${ESTADO_INVERSION_BADGE_CLASS[inv.estado]} hover:opacity-100`}
                    >
                      {ESTADO_INVERSION_LABEL[inv.estado]}
                    </Badge>
                    {inv.fecha_realizada && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(inv.fecha_realizada)}
                      </p>
                    )}
                    <AvanceOrigen inversion={inv} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {formatMoney(inv.monto_real)}
                  </TableCell>
                  <TableCell>
                    <DesvioMonto
                      estimado={inv.monto_estimado}
                      real={inv.monto_real}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {inv.evidencia_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => abrirArchivo(inv.evidencia_url)}
                          title={`Ver cotización/factura${inv.evidencia_nombre ? `: ${inv.evidencia_nombre}` : ""}`}
                        >
                          <FileDown className="size-3.5" />
                        </Button>
                      )}
                      {puedeEditar && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditando(inv)
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
                            onClick={() => handleEliminar(inv)}
                            title="Eliminar"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Diálogo */}
      {puedeEditar && (
        <InversionFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          anio={anio}
          inversion={editando}
          responsables={responsables}
          onSaved={refrescar}
          onAbrirArchivo={abrirArchivo}
        />
      )}
    </div>
  )
}
