"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ImageIcon, PackageCheck, PackageOpen, Plus, Refrigerator, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NuevoMovimientoHeladeraDialog } from "@/components/heladeras/nuevo-movimiento-heladera-dialog"
import { deleteMovimientoHeladera } from "@/actions/heladeras"
import {
  HELADERA_ESTADO_LABELS,
  HELADERA_TIPO_LABELS_CORTO,
  type HeladeraEstado,
  type HeladeraMovimientoConDetalle,
  type HeladeraTipoMov,
} from "@/types/heladeras"

const TIPO_COLOR: Record<HeladeraTipoMov, string> = {
  colocacion: "bg-emerald-100 text-emerald-800",
  retiro: "bg-amber-100 text-amber-800",
}

const ESTADO_COLOR: Record<HeladeraEstado, string> = {
  registrado: "bg-slate-100 text-slate-700",
  validado: "bg-blue-100 text-blue-800",
  observado: "bg-rose-100 text-rose-800",
}

function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y}`
}

export function MisHeladerasClient({
  patentes,
  movimientos,
}: {
  patentes: string[]
  movimientos: HeladeraMovimientoConDetalle[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm("¿Borrar este movimiento de heladera?")) return
    startTransition(async () => {
      const res = await deleteMovimientoHeladera(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Movimiento borrado")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-2.5">
            <Refrigerator className="size-6 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Heladeras</h1>
            <p className="text-sm text-muted-foreground">
              Registrá la heladera que dejaste en un cliente o que levantaste al camión, con la foto.
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Registrar
        </Button>
      </div>

      {movimientos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Todavía no registraste ninguna heladera. Tocá <strong>Registrar</strong> para cargar la primera.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {movimientos.map((m) => (
            <Card key={m.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{fmtFecha(m.fecha)}</CardTitle>
                  <Badge className={TIPO_COLOR[m.tipo]}>
                    {m.tipo === "colocacion" ? (
                      <PackageCheck className="mr-1 size-3.5" />
                    ) : (
                      <PackageOpen className="mr-1 size-3.5" />
                    )}
                    {HELADERA_TIPO_LABELS_CORTO[m.tipo]}
                  </Badge>
                  <Badge variant="outline" className="font-mono">{m.id_cliente}</Badge>
                  {m.patente && (
                    <Badge variant="outline" className="font-mono">{m.patente}</Badge>
                  )}
                  <Badge className={ESTADO_COLOR[m.estado]}>{HELADERA_ESTADO_LABELS[m.estado]}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(m.id)}
                  disabled={isPending}
                  aria-label="Borrar movimiento"
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    {m.nombre_cliente ?? `Cliente ${m.id_cliente}`}
                  </p>
                  {m.localidad && <p className="text-muted-foreground">📍 {m.localidad}</p>}
                </div>

                {(m.cod_activo || m.descripcion) && (
                  <p className="text-sm text-muted-foreground">
                    {m.cod_activo && (
                      <>
                        Activo <span className="font-mono text-slate-900">{m.cod_activo}</span>
                      </>
                    )}
                    {m.cod_activo && m.descripcion && " · "}
                    {m.descripcion}
                  </p>
                )}

                {m.observaciones && <p className="text-sm">{m.observaciones}</p>}

                {m.comentario_gestion && (
                  <p className="rounded-md bg-slate-50 p-2 text-sm">
                    <span className="font-medium">Respuesta: </span>
                    {m.comentario_gestion}
                  </p>
                )}

                {m.adjuntos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {m.adjuntos.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block size-20 overflow-hidden rounded-md border bg-muted"
                      >
                        {a.mime_type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt="Foto de la heladera" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <ImageIcon className="size-6 text-muted-foreground" />
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-rose-600">Sin foto cargada</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NuevoMovimientoHeladeraDialog open={open} onOpenChange={setOpen} patentes={patentes} />
    </div>
  )
}
