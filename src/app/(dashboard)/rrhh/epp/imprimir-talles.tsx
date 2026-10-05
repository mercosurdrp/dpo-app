"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { TALLE_CAMPOS, tallesCompletos } from "@/lib/epp"
import type { EmpleadoConTalles } from "@/types/database"

interface Props {
  empleados: EmpleadoConTalles[]
  onClose: () => void
}

/**
 * Planilla imprimible de talles para preparar la ropa: arriba el resumen por
 * prenda y talle (cuántas unidades juntar de cada una), abajo la lista por
 * empleado agrupada por sector con casillero de "preparado" y "entregado".
 * Mismo patrón que la planilla de orden de salida: portal a <body> y CSS de
 * print que esconde el resto del DOM.
 */
export function ImprimirTalles({ empleados, onClose }: Props) {
  const resumen = useMemo(
    () =>
      TALLE_CAMPOS.map((c) => {
        const counts = new Map<string, number>()
        let sinTalle = 0
        for (const e of empleados) {
          const v = e.talles?.[c.campo]
          if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
          else sinTalle++
        }
        const orden = [...counts.entries()].sort((a, b) =>
          a[0].localeCompare(b[0], undefined, { numeric: true })
        )
        return { ...c, orden, sinTalle }
      }),
    [empleados]
  )

  // Agrupado por sector para que el que arma las bolsas vaya sector por sector.
  const porSector = useMemo(() => {
    const grupos = new Map<string, EmpleadoConTalles[]>()
    for (const e of empleados) {
      const k = e.sector?.trim() || "Sin sector"
      const lista = grupos.get(k) ?? []
      lista.push(e)
      grupos.set(k, lista)
    }
    return [...grupos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([sector, lista]) => ({
        sector,
        lista: [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      }))
  }, [empleados])

  const incompletos = empleados.filter((e) => !tallesCompletos(e.talles)).length
  const fechaTxt = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  const contenido = (
    <div
      className="talles-modal fixed inset-0 z-50 overflow-auto bg-slate-100/95"
      role="dialog"
      aria-modal="true"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              html, body {
                background: white !important;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
              }
              body > *:not(.talles-modal) { display: none !important; }
              .talles-modal {
                position: static !important;
                inset: auto !important;
                background: white !important;
                overflow: visible !important;
                height: auto !important;
                min-height: 0 !important;
                display: block !important;
              }
              .talles-no-print { display: none !important; }
              .talles-wrap { padding: 0 !important; margin: 0 !important; max-width: none !important; }
              .talles-page {
                width: auto !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
              }
              .talles-page thead { display: table-header-group; }
              .talles-page tr { page-break-inside: avoid; break-inside: avoid; }
            }
          `,
        }}
      />

      {/* Toolbar (oculta al imprimir) */}
      <div className="talles-no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div className="text-sm text-slate-700">
          <span className="font-semibold">Planilla de talles para preparar</span>{" "}
          <span className="text-slate-500">
            — {empleados.length} empleados activos · {fechaTxt}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Imprimir / Guardar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div className="talles-wrap mx-auto p-4 print:p-0">
        <section
          className="talles-page bg-white text-slate-900 shadow-sm"
          style={{ width: "210mm", padding: "10mm" }}
        >
          {/* Encabezado */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-2">
            <div>
              <h1 className="text-lg font-bold leading-tight">Ropa y EPP — Talles del personal</h1>
              <p className="text-[11px] text-slate-600">
                Planilla para preparar la entrega · {empleados.length} empleados activos
                {incompletos > 0 && (
                  <>
                    {" "}· <span className="font-semibold">{incompletos} con talles incompletos</span>
                  </>
                )}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-600">
              <p>Impreso el {fechaTxt}</p>
              <p>Preparó: ______________________</p>
            </div>
          </div>

          {/* Resumen por prenda y talle */}
          <h2 className="mt-3 text-[12px] font-bold uppercase tracking-wide text-slate-700">
            1. Cantidades a preparar por prenda y talle
          </h2>
          <table className="mt-1 w-full border-collapse text-[11px]">
            <tbody>
              {resumen.map((r) => (
                <tr key={r.campo} className="border-b border-slate-300">
                  <td className="w-24 py-1.5 pr-2 align-top font-semibold">{r.label}</td>
                  <td className="py-1.5">
                    {r.orden.length === 0 ? (
                      <span className="text-slate-400">Sin talles cargados</span>
                    ) : (
                      <div className="flex flex-wrap gap-x-1.5 gap-y-1">
                        {r.orden.map(([talle, count]) => (
                          <span
                            key={talle}
                            className="inline-flex items-center gap-1 rounded border border-slate-400 px-1.5 py-0.5 tabular-nums"
                          >
                            <span className="inline-block h-2.5 w-2.5 border border-slate-500" />
                            <span className="font-semibold">{talle}</span>
                            <span>× {count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="w-24 py-1.5 pl-2 text-right align-top tabular-nums text-slate-600">
                    {r.sinTalle > 0 ? `${r.sinTalle} sin cargar` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Detalle por empleado */}
          <h2 className="mt-4 text-[12px] font-bold uppercase tracking-wide text-slate-700">
            2. Detalle por empleado
          </h2>
          <table className="mt-1 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">Leg.</th>
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">Nombre</th>
                {TALLE_CAMPOS.map((c) => (
                  <th
                    key={c.campo}
                    className="border border-slate-400 px-1.5 py-1 text-center font-semibold"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="border border-slate-400 px-1.5 py-1 text-center font-semibold">
                  Prep.
                </th>
                <th className="border border-slate-400 px-1.5 py-1 text-center font-semibold">
                  Entreg.
                </th>
              </tr>
            </thead>
            {porSector.map((g) => (
              <tbody key={g.sector}>
                <tr>
                  <td
                    colSpan={TALLE_CAMPOS.length + 4}
                    className="border border-slate-400 bg-slate-50 px-1.5 py-0.5 font-bold"
                  >
                    {g.sector}{" "}
                    <span className="font-normal text-slate-500">({g.lista.length})</span>
                  </td>
                </tr>
                {g.lista.map((e) => (
                  <tr key={e.id}>
                    <td className="border border-slate-400 px-1.5 py-1 tabular-nums">{e.legajo}</td>
                    <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap font-medium">
                      {e.nombre}
                    </td>
                    {TALLE_CAMPOS.map((c) => {
                      const v = e.talles?.[c.campo]
                      return (
                        <td
                          key={c.campo}
                          className={`border border-slate-400 px-1.5 py-1 text-center tabular-nums ${
                            v ? "font-semibold" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {v ?? "—"}
                        </td>
                      )
                    })}
                    <td className="border border-slate-400 px-1.5 py-1 text-center">
                      <span className="inline-block h-3.5 w-3.5 border border-slate-600 align-middle" />
                    </td>
                    <td className="border border-slate-400 px-1.5 py-1 text-center">
                      <span className="inline-block h-3.5 w-3.5 border border-slate-600 align-middle" />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>

          <p className="mt-3 text-[10px] text-slate-500">
            Los talles los carga cada empleado en &ldquo;Mi ropa&rdquo; y se pueden corregir en RRHH
            &rarr; Ropa y EPP &rarr; Talles del personal. Las celdas marcadas (—) no tienen talle
            cargado: consultar antes de preparar.
          </p>
        </section>
      </div>
    </div>
  )

  // Se abre con un click en el cliente; el guard es por si alguna vez se renderiza en el servidor.
  if (typeof document === "undefined") return null
  return createPortal(contenido, document.body)
}
