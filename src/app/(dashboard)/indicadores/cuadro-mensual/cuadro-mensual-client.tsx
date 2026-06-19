"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  PILARES_ORDEN,
  PILAR_COLOR,
  nombreMes,
  colorCelda,
  formatValor,
  type CuadroMensual,
  type FilaIndicador,
} from "@/lib/indicadores/cuadro-mensual"
import { BultosDetalleDialog } from "@/components/indicadores/bultos-detalle-dialog"

// Indicador cuyas celdas son clickeables (abren el modal de detalle).
const INDICADOR_DETALLE = "bultos_vendidos"

interface Props {
  data: CuadroMensual
}

export function CuadroMensualClient({ data }: Props) {
  const { meses, mesActual, filas, generadoEn } = data
  const [detalle, setDetalle] = useState<{ mes: string; bultos: number | null } | null>(
    null,
  )

  async function exportar() {
    const XLSX = await import("xlsx")
    const cab = [
      "Pilar",
      "Indicador",
      "Unidad",
      ...meses.map((m) => nombreMes(m)),
      "Resumen",
    ]
    const rows: (string | number | null)[][] = [cab]
    for (const pilar of PILARES_ORDEN) {
      for (const fila of filas.filter((f) => f.def.pilar === pilar)) {
        rows.push([
          pilar,
          fila.def.nombre,
          fila.def.unidad,
          ...meses.map((m) => {
            const v = fila.celdas[m]?.valor
            return v === null || v === undefined ? null : Number(v.toFixed(2))
          }),
          fila.resumen === null ? null : Number(fila.resumen.toFixed(2)),
        ])
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws["!cols"] = [
      { wch: 12 },
      { wch: 26 },
      { wch: 8 },
      ...meses.map(() => ({ wch: 9 })),
      { wch: 10 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Cuadro Mensual")
    XLSX.writeFile(wb, `cuadro-mensual-indicadores_${mesActual}.xlsx`)
  }

  const fechaGen = new Date(generadoEn).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Cuadro Mensual de Indicadores
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumen mensual por pilar — Enero {meses[0]?.slice(0, 4)} al mes en
            curso · Generado {fechaGen}
          </p>
        </div>
        <Button onClick={exportar} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold">
                Indicador
              </th>
              {meses.map((m) => (
                <th
                  key={m}
                  className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${
                    m === mesActual ? "text-blue-600" : ""
                  }`}
                >
                  {nombreMes(m)}
                  {m === mesActual && (
                    <span className="block text-[10px] font-normal text-blue-400">
                      parcial
                    </span>
                  )}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Resumen
              </th>
            </tr>
          </thead>
          <tbody>
            {PILARES_ORDEN.map((pilar) => {
              const filasPilar = filas.filter((f) => f.def.pilar === pilar)
              const color = PILAR_COLOR[pilar]
              return (
                <PilarBloque
                  key={pilar}
                  pilar={pilar}
                  color={color}
                  filas={filasPilar}
                  meses={meses}
                  totalCols={meses.length + 2}
                  onBultosClick={(mes, bultos) => setDetalle({ mes, bultos })}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <BultosDetalleDialog
        open={detalle !== null}
        onOpenChange={(o) => !o && setDetalle(null)}
        mes={detalle?.mes ?? null}
        bultosCelda={detalle?.bultos ?? null}
      />

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-emerald-50 ring-1 ring-emerald-200" />
          Cumple meta
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-50 ring-1 ring-red-200" />
          No cumple
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-slate-50 ring-1 ring-slate-200" />
          Sin dato
        </span>
        <span>
          Pasá el cursor sobre cada indicador para ver su definición y fuente.
        </span>
      </div>
    </div>
  )
}

function PilarBloque({
  pilar,
  color,
  filas,
  meses,
  totalCols,
  onBultosClick,
}: {
  pilar: string
  color: string
  filas: FilaIndicador[]
  meses: string[]
  totalCols: number
  onBultosClick: (mes: string, bultos: number | null) => void
}) {
  return (
    <>
      <tr>
        <td
          colSpan={totalCols}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: color }}
        >
          {pilar}
        </td>
      </tr>
      {filas.map((fila) => {
        const metaDefault = fila.def.meta
        const esDetalle = fila.def.id === INDICADOR_DETALLE
        return (
          <tr
            key={fila.def.id}
            className="border-t border-slate-100 hover:bg-slate-50/60"
          >
            <td
              className="sticky left-0 z-10 bg-white px-3 py-2 text-left"
              title={fila.def.nota}
            >
              <span className="font-medium text-slate-800">
                {fila.def.nombre}
              </span>
              <span className="ml-1 text-xs text-slate-400">
                ({fila.def.unidad})
              </span>
            </td>
            {meses.map((m) => {
              const celda = fila.celdas[m]
              const valor = celda?.valor ?? null
              const meta = celda?.meta ?? metaDefault
              const clickeable = esDetalle && valor !== null
              return (
                <td
                  key={m}
                  className={`px-3 py-2 text-right tabular-nums ${colorCelda(
                    valor,
                    meta,
                    fila.def.mejor_si,
                  )} ${
                    clickeable
                      ? "cursor-pointer font-medium text-blue-700 underline decoration-dotted underline-offset-2 hover:bg-blue-50"
                      : ""
                  }`}
                  onClick={
                    clickeable ? () => onBultosClick(m, valor) : undefined
                  }
                  title={clickeable ? "Ver desglose del mes" : undefined}
                >
                  {formatValor(valor, fila.def.unidad)}
                </td>
              )
            })}
            <td className="border-l border-slate-200 bg-slate-50/50 px-3 py-2 text-right font-semibold tabular-nums text-slate-700">
              {formatValor(fila.resumen, fila.def.unidad)}
            </td>
          </tr>
        )
      })}
    </>
  )
}
