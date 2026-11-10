"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Truck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { crearOperacion, setOperacionActiva } from "@/actions/remitos-internos"
import type { RemitoInterno, RemitoOperacion } from "@/types/remitos-internos"
import { EstadoRemitoBadge, fmtFecha, resumenItems } from "./formato"

export function RemitosClient({
  operaciones,
  operacionActual,
  remitos,
  puedeEditar,
}: {
  operaciones: RemitoOperacion[]
  operacionActual: RemitoOperacion | null
  remitos: RemitoInterno[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nuevaOp, setNuevaOp] = useState(false)
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "novedad">("todos")

  const vigentes = remitos.filter((r) => !r.anulado)
  const pendientes = vigentes.filter((r) => !r.descarga_estado).length
  const ok = vigentes.filter((r) => r.descarga_estado === "ok").length
  const novedad = vigentes.filter((r) => r.descarga_estado === "con_novedad").length

  const visibles = remitos.filter((r) => {
    if (filtro === "pendientes") return !r.anulado && !r.descarga_estado
    if (filtro === "novedad") return r.descarga_estado === "con_novedad"
    return true
  })

  const crearOp = (fd: FormData) => {
    startTransition(async () => {
      const res = await crearOperacion({
        nombre: String(fd.get("nombre") ?? ""),
        origen: String(fd.get("origen") ?? ""),
        destino: String(fd.get("destino") ?? ""),
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Operación creada: sus remitos arrancan en el N° 1")
      setNuevaOp(false)
      router.push(`/remitos-internos?op=${res.data.id}`)
    })
  }

  const toggleActiva = () => {
    if (!operacionActual) return
    startTransition(async () => {
      const res = await setOperacionActiva(operacionActual.id, !operacionActual.activa)
      if ("error" in res) toast.error(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 space-y-1">
          <Label htmlFor="op">Operación</Label>
          <select
            id="op"
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={operacionActual?.id ?? ""}
            onChange={(e) => router.push(`/remitos-internos?op=${e.target.value}`)}
          >
            {operaciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
                {o.activa ? "" : " (cerrada)"}
              </option>
            ))}
          </select>
        </div>
        {puedeEditar && operacionActual?.activa && (
          <Link
            href={`/remitos-internos/nuevo?op=${operacionActual.id}`}
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <Plus /> Nuevo remito
          </Link>
        )}
        {puedeEditar && (
          <Button variant="outline" size="lg" onClick={() => setNuevaOp((v) => !v)}>
            Nueva operación
          </Button>
        )}
      </div>

      {nuevaOp && (
        <Card>
          <CardContent>
            <form action={crearOp} className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" placeholder="Ej.: Traslado de envases a San Nicolás" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="origen">Origen por defecto</Label>
                <Input id="origen" name="origen" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="destino">Destino por defecto</Label>
                <Input id="destino" name="destino" />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={pending}>
                  Crear
                </Button>
                <Button type="button" variant="ghost" onClick={() => setNuevaOp(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!operacionActual ? (
        <p className="text-sm text-muted-foreground">Todavía no hay operaciones. Creá la primera.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            {(operacionActual.origen || operacionActual.destino) && (
              <span>
                {operacionActual.origen ?? "—"} → {operacionActual.destino ?? "—"}
              </span>
            )}
            <span>
              <b>{vigentes.length}</b> viajes · <b className="text-amber-700">{pendientes}</b> en viaje ·{" "}
              <b className="text-emerald-700">{ok}</b> descargados OK ·{" "}
              <b className="text-red-700">{novedad}</b> con novedad
            </span>
            {puedeEditar && (
              <button
                type="button"
                className="text-xs text-slate-500 underline-offset-2 hover:underline"
                onClick={toggleActiva}
                disabled={pending}
              >
                {operacionActual.activa ? "Cerrar operación" : "Reabrir operación"}
              </button>
            )}
          </div>

          <div className="flex gap-1">
            {(
              [
                ["todos", "Todos"],
                ["pendientes", "En viaje"],
                ["novedad", "Con novedad"],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={filtro === k ? "secondary" : "ghost"}
                onClick={() => setFiltro(k)}
              >
                {label}
              </Button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay remitos para mostrar.</p>
          ) : (
            <div className="space-y-2">
              {visibles.map((r) => (
                <Link key={r.id} href={`/remitos-internos/${r.id}`} className="block">
                  <Card className={cn("transition-colors hover:bg-slate-50", r.anulado && "opacity-60")}>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="w-20 shrink-0">
                        <div className="text-[11px] uppercase text-slate-500">Viaje</div>
                        <div className="text-2xl font-bold tabular-nums text-slate-900">N° {r.numero}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 text-sm font-medium text-slate-900">
                          <span className="inline-flex items-center gap-1">
                            <Truck className="size-4 text-slate-400" /> {r.patente}
                          </span>
                          <span>{r.chofer_nombre}</span>
                          <span className="text-slate-500">{fmtFecha(r.fecha)}</span>
                        </div>
                        <div className="truncate text-xs text-slate-500">{resumenItems(r.items)}</div>
                        {r.descarga_comentario && (
                          <div className="truncate text-xs text-slate-700">Comentario: {r.descarga_comentario}</div>
                        )}
                      </div>
                      <EstadoRemitoBadge remito={r} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
