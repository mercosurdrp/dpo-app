"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { FileText, Printer, Plus, Trash2, QrCode } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { VEHICULO_TIPO_LABELS, type FlotaOpl, type VehiculoTipo } from "@/types/database"
import { createOpl, deleteOpl, setOplActivo } from "@/actions/flota-opl"

const TIPOS = Object.keys(VEHICULO_TIPO_LABELS) as VehiculoTipo[]

/**
 * OPL de flota + la planilla de QR que las pone al alcance de la mano.
 *
 * La OPL es una hoja sola que explica UNA cosa, y sirve donde se hace el
 * trabajo: el QR pegado en la unidad abre su ficha en la app y ahi aparecen las
 * que le corresponden por tipo. El SOP completo sigue existiendo; esto es lo
 * que se lee parado al lado de la rueda.
 */
export function OplClient({
  opls,
  puedeEditar,
  puedeBorrar,
}: {
  opls: FlotaOpl[]
  puedeEditar: boolean
  puedeBorrar: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [tipos, setTipos] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  async function guardar(fd: FormData) {
    fd.set("tipos", [...tipos].join(","))
    const res = await createOpl(fd)
    if ("error" in res) return toast.error(res.error)
    toast.success("OPL cargada")
    setAbierto(false)
    setTipos(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OPL de flota</h1>
          <p className="text-sm text-muted-foreground">
            Lecciones de un punto por tipo de unidad. Se llega a ellas escaneando el QR pegado
            en la unidad.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<a href="/api/vehiculos/qr-pdf" target="_blank" />}>
            <Printer className="mr-2 size-4" /> Imprimir QR de todas las unidades
          </Button>
          <Button
            variant="outline"
            render={<a href="/api/vehiculos/qr-pdf?sector=deposito" target="_blank" />}
          >
            <QrCode className="mr-2 size-4" /> Solo deposito
          </Button>
          {puedeEditar && (
            <Button onClick={() => setAbierto((v) => !v)}>
              <Plus className="mr-2 size-4" /> Nueva OPL
            </Button>
          )}
        </div>
      </div>

      {abierto && puedeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nueva OPL</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" action={(fd) => start(() => void guardar(fd))}>
              <div>
                <Label htmlFor="titulo">Titulo</Label>
                <Input
                  id="titulo"
                  name="titulo"
                  required
                  placeholder="Control del dibujo de la cubierta"
                />
              </div>
              <div>
                <Label htmlFor="descripcion">Para que sirve</Label>
                <Textarea
                  id="descripcion"
                  name="descripcion"
                  rows={2}
                  placeholder="Como se mide el dibujo con el calibre y en que canal de la banda"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <Label>Aplica a</Label>
                  <p className="mb-1 text-xs text-muted-foreground">
                    Sin marcar ninguno, aplica a todas las unidades.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {TIPOS.map((t) => (
                      <label key={t} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={tipos.has(t)}
                          onCheckedChange={(v) =>
                            setTipos((prev) => {
                              const next = new Set(prev)
                              if (v === true) next.add(t)
                              else next.delete(t)
                              return next
                            })
                          }
                        />
                        {VEHICULO_TIPO_LABELS[t]}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="punto_dpo">Punto DPO</Label>
                  <Input id="punto_dpo" name="punto_dpo" placeholder="1.3" className="w-24" />
                </div>
                <div>
                  <Label htmlFor="orden">Orden</Label>
                  <Input id="orden" name="orden" type="number" defaultValue={0} className="w-20" />
                </div>
              </div>
              <div>
                <Label htmlFor="archivo">La hoja (PDF o imagen)</Label>
                <Input id="archivo" name="archivo" type="file" accept=".pdf,image/*" />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando..." : "Guardar OPL"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cargadas ({opls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {opls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavia no hay ninguna. Una OPL por control del checklist es un buen arranque:
              luces, lona, fluidos y carroceria.
            </p>
          ) : (
            <ul className="space-y-2">
              {opls.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {o.titulo}
                      {!o.activo && (
                        <span className="ml-2 text-xs text-muted-foreground">(inactiva)</span>
                      )}
                    </p>
                    {o.descripcion && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{o.descripcion}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {o.tipos.length === 0 ? (
                        <Badge variant="outline" className="text-[11px]">
                          Todas las unidades
                        </Badge>
                      ) : (
                        o.tipos.map((t) => (
                          <Badge key={t} variant="outline" className="text-[11px]">
                            {VEHICULO_TIPO_LABELS[t as VehiculoTipo] ?? t}
                          </Badge>
                        ))
                      )}
                      {o.punto_dpo && (
                        <Badge variant="outline" className="text-[11px]">
                          DPO {o.punto_dpo}
                        </Badge>
                      )}
                      {o.archivo_url && (
                        <a
                          href={o.archivo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
                        >
                          <FileText className="size-3" />
                          {o.archivo_nombre || "hoja"}
                        </a>
                      )}
                    </div>
                  </div>
                  {puedeEditar && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await setOplActivo(o.id, !o.activo)
                            if ("error" in res) toast.error(res.error)
                          })
                        }
                      >
                        {o.activo ? "Desactivar" : "Activar"}
                      </Button>
                      {puedeBorrar && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pending}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            start(async () => {
                              const res = await deleteOpl(o.id)
                              if ("error" in res) toast.error(res.error)
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
