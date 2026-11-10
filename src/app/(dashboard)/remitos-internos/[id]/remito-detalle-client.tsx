"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, CheckCircle2, Pencil, Printer } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { marcarDescarga, setRemitoAnulado } from "@/actions/remitos-internos"
import type { DescargaEstado, RemitoInterno } from "@/types/remitos-internos"
import { EstadoRemitoBadge, fmtCantidad, fmtFecha, fmtFechaHora } from "../formato"

export function RemitoDetalleClient({ remito: r, puedeEditar }: { remito: RemitoInterno; puedeEditar: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [comentario, setComentario] = useState("")

  const confirmar = (estado: DescargaEstado | null) => {
    if (estado === "con_novedad" && !comentario.trim()) {
      toast.error("Contá en el comentario qué pasó (faltante, rotura, sobrante…)")
      return
    }
    if (estado === null && !window.confirm("¿Deshacer la confirmación de descarga?")) return
    startTransition(async () => {
      const res = await marcarDescarga(r.id, estado, comentario)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        estado === "ok" ? "Descarga confirmada" : estado === "con_novedad" ? "Descarga registrada con novedad" : "Descarga deshecha",
      )
      setComentario("")
      router.refresh()
    })
  }

  const anular = () => {
    if (!r.anulado && !window.confirm(`¿Anular el remito N° ${r.numero}? El número no se reutiliza.`)) return
    startTransition(async () => {
      const res = await setRemitoAnulado(r.id, !r.anulado)
      if ("error" in res) toast.error(res.error)
      else router.refresh()
    })
  }

  const pendiente = !r.anulado && !r.descarga_estado

  return (
    <div className="space-y-4">
      <Link href={`/remitos-internos?op=${r.operacion_id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline">
        <ArrowLeft className="size-4" /> {r.operacion_nombre}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Remito interno</div>
          <h1 className="text-3xl font-bold text-slate-900">Viaje N° {r.numero}</h1>
        </div>
        <EstadoRemitoBadge remito={r} className="px-4 py-1.5 text-sm" />
      </div>

      {pendiente && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="space-y-3">
            <p className="font-medium text-slate-900">¿Llegó y se descargó?</p>
            <div className="space-y-1">
              <Label htmlFor="comentario">Comentario (opcional si está todo OK)</Label>
              <Textarea
                id="comentario"
                rows={2}
                value={comentario}
                placeholder="Ej.: faltó 1 pallet de Quilmes 1 L, llegó un cajón roto…"
                onChange={(e) => setComentario(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                size="lg"
                className="h-12 bg-emerald-600 text-base text-white hover:bg-emerald-700"
                disabled={pending}
                onClick={() => confirmar("ok")}
              >
                <CheckCircle2 className="size-5" /> Descargado OK
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="h-12 text-base"
                disabled={pending}
                onClick={() => confirmar("con_novedad")}
              >
                <AlertTriangle className="size-5" /> Descargado con novedad
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {r.descarga_estado && (
        <Card
          className={cn(
            r.descarga_estado === "ok" ? "border-emerald-300 bg-emerald-50/50" : "border-red-300 bg-red-50/50",
          )}
        >
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium text-slate-900">
              {r.descarga_estado === "ok" ? "Descargado OK" : "Descargado con novedad"}
              {r.descargado_at && ` · ${fmtFechaHora(r.descargado_at)}`}
              {r.descargado_por_nombre && ` · ${r.descargado_por_nombre}`}
            </p>
            {r.descarga_comentario && <p className="whitespace-pre-wrap text-slate-700">{r.descarga_comentario}</p>}
            {puedeEditar && (
              <button
                type="button"
                className="text-xs text-slate-500 hover:underline"
                disabled={pending}
                onClick={() => confirmar(null)}
              >
                Deshacer confirmación
              </button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Dato label="Fecha" valor={fmtFecha(r.fecha)} />
          <Dato label="Operación" valor={r.operacion_nombre} />
          <Dato label="Origen" valor={r.origen ?? "—"} />
          <Dato label="Destino" valor={r.destino ?? "—"} />
          <Dato label="Camión" valor={r.patente + (r.vehiculo_id ? "" : " (externo)")} />
          <Dato label="Chofer" valor={r.chofer_nombre} />
          {r.observaciones && (
            <div className="sm:col-span-2">
              <Dato label="Observaciones" valor={r.observaciones} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2">#</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i, idx) => (
                <tr key={i.id ?? idx} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2">{i.descripcion}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {fmtCantidad(i.cantidad)} {i.unidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/remitos-internos/${r.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          <Printer /> Imprimir remito
        </a>
        {puedeEditar && pendiente && (
          <Link href={`/remitos-internos/${r.id}/editar`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            <Pencil /> Editar
          </Link>
        )}
        {puedeEditar && !r.descarga_estado && (
          <Button variant="ghost" size="lg" onClick={anular} disabled={pending}>
            {r.anulado ? "Reactivar remito" : "Anular remito"}
          </Button>
        )}
      </div>

      {r.creado_por_nombre && (
        <p className="text-xs text-slate-400">
          Cargado por {r.creado_por_nombre} el {fmtFechaHora(r.created_at)}
        </p>
      )}
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{valor}</div>
    </div>
  )
}
