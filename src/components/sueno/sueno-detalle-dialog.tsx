"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSuenoDetalle, type SuenoDetalle } from "@/actions/sueno"
import { RAMA_COLOR, type SuenoNodo } from "@/lib/sueno/arbol-config"
import { SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/sueno/semaforo"
import { formatValor } from "./sueno-kpi-card"

const nfAR = new Intl.NumberFormat("es-AR")

/** Contenido del modal; se remonta por `key={nodo.key}` → estado fresco por KPI. */
function DetalleContent({ nodo }: { nodo: SuenoNodo }) {
  const [pending, startTransition] = useTransition()
  const [detalle, setDetalle] = useState<SuenoDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const res = await getSuenoDetalle(nodo.key, nodo.anio)
      if (cancelled) return
      if ("error" in res) setError(res.error)
      else setDetalle(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [nodo.key, nodo.anio, startTransition])

  const maxValor =
    detalle && detalle.meses.length > 0
      ? Math.max(...detalle.meses.map((m) => Math.abs(m.valor)), 1)
      : 1
  const hayBultos = detalle?.meses.some((m) => m.detalle != null) ?? false

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: RAMA_COLOR[nodo.rama] }}
          />
          {nodo.label} · {nodo.anio}
        </DialogTitle>
        <DialogDescription>
          Detalle mensual que compone el número del año.
        </DialogDescription>
      </DialogHeader>

      <div className="mb-1 flex items-center gap-4 rounded-md bg-slate-50 px-3 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">YTD</p>
          <p
            className="text-2xl font-bold tabular-nums"
            style={{
              color: nodo.valorYtd == null ? "#94A3B8" : SEMAFORO_COLOR[nodo.estado],
            }}
          >
            {formatValor(nodo.valorYtd, nodo.unidad)}
          </p>
        </div>
        <div className="text-sm text-slate-500">
          <p>
            Meta:{" "}
            <span className="font-medium text-slate-700">
              {nodo.meta == null ? "—" : formatValor(nodo.meta, nodo.unidad)}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: SEMAFORO_COLOR[nodo.estado] }}
            />
            {SEMAFORO_LABEL[nodo.estado]}
          </p>
        </div>
      </div>

      {detalle && !pending && (
        <p className="text-sm leading-snug text-slate-600">{detalle.explicacion}</p>
      )}

      {pending && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Cargando detalle…
        </div>
      )}

      {error && !pending && <p className="py-4 text-sm text-red-500">{error}</p>}

      {detalle && !pending && detalle.meses.length > 0 && (
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1.5 font-medium">Mes</th>
              <th className="py-1.5 text-right font-medium">Valor</th>
              <th className="w-1/3 py-1.5 font-medium" />
              <th className="py-1.5 text-right font-medium">
                {hayBultos ? "Bultos rech." : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {detalle.meses.map((m) => (
              <tr key={m.mes} className="border-b border-slate-100">
                <td className="py-1.5 font-medium text-slate-700">{m.etiqueta}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">
                  {formatValor(m.valor, detalle.unidad)}
                </td>
                <td className="py-1.5 pl-3">
                  <span className="block h-2 rounded-full bg-slate-100">
                    <span
                      className="block h-2 rounded-full"
                      style={{
                        width: `${Math.max(4, (Math.abs(m.valor) / maxValor) * 100)}%`,
                        backgroundColor: RAMA_COLOR[nodo.rama],
                      }}
                    />
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">
                  {m.detalle == null ? "" : nfAR.format(m.detalle)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detalle && !pending && detalle.fuente === "manual" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Este indicador se carga manualmente; todavía no tiene detalle mensual
          automático.
        </p>
      )}

      {detalle && !pending && detalle.fuente === "auto" && detalle.meses.length === 0 && (
        <p className="py-4 text-sm text-slate-500">
          Sin datos cargados para este año.
        </p>
      )}
    </>
  )
}

export function SuenoDetalleDialog({
  nodo,
  open,
  onOpenChange,
}: {
  nodo: SuenoNodo | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {nodo && <DetalleContent key={nodo.key} nodo={nodo} />}
      </DialogContent>
    </Dialog>
  )
}
