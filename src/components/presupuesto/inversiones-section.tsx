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
import type { InversionConDetalle } from "@/types/database"
import {
  CATEGORIA_LABEL,
  ESTADO_INVERSION_BADGE_CLASS,
  ESTADO_INVERSION_LABEL,
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
    for (const inv of inversiones) {
      if (inv.estado !== "cancelada") estimadoTotal += inv.monto_estimado ?? 0
      if (inv.estado === "realizada") {
        realizadas++
        realizadasMonto += inv.monto_real ?? 0
      } else if (inv.estado !== "cancelada") {
        pendientes++
      }
    }
    return { estimadoTotal, realizadasMonto, realizadas, pendientes }
  }, [inversiones])

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
              estado y registrá <strong>cuánto salió</strong> realmente.
            </p>
          </div>
        </div>
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
      {inversiones.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin inversiones cargadas para {anio}.
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
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inversión</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Programada</TableHead>
                <TableHead className="text-right">Estimado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead>Desvío</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inversiones.map((inv) => (
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
                  </TableCell>
                  <TableCell className="text-sm">
                    {CATEGORIA_LABEL[inv.categoria]}
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
