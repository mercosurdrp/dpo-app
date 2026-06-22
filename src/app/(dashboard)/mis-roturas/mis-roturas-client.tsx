"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PackageX, Plus, Trash2, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { NuevaRoturaDialog } from "@/components/roturas/nueva-rotura-dialog"
import { deleteRotura } from "@/actions/roturas-calle"
import {
  ROTURA_MOTIVO_LABELS,
  ROTURA_ESTADO_LABELS,
  type RoturaConDetalle,
  type RoturaEstado,
  type RoturaSkuOption,
} from "@/types/roturas"

const ESTADO_COLOR: Record<RoturaEstado, string> = {
  reportada: "bg-amber-100 text-amber-800",
  en_revision: "bg-blue-100 text-blue-800",
  cerrada: "bg-emerald-100 text-emerald-800",
}

function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y}`
}

export function MisRoturasClient({
  patentes,
  skus,
  roturas,
}: {
  patentes: string[]
  skus: RoturaSkuOption[]
  roturas: RoturaConDetalle[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm("¿Borrar esta rotura?")) return
    startTransition(async () => {
      const res = await deleteRotura(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Rotura borrada")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-2.5">
            <PackageX className="size-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Roturas en la calle</h1>
            <p className="text-sm text-muted-foreground">
              Reportá los productos que se rompieron durante el reparto.
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Reportar rotura
        </Button>
      </div>

      {roturas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Todavía no reportaste ninguna rotura. Tocá <strong>Reportar rotura</strong> para cargar la primera.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {roturas.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{fmtFecha(r.fecha)}</CardTitle>
                  {r.hora && <span className="text-sm text-muted-foreground">{r.hora.slice(0, 5)}</span>}
                  <Badge variant="outline" className="font-mono">{r.patente}</Badge>
                  <Badge variant="secondary">{ROTURA_MOTIVO_LABELS[r.motivo]}</Badge>
                  <Badge className={ESTADO_COLOR[r.estado]}>{ROTURA_ESTADO_LABELS[r.estado]}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(r.id)}
                  disabled={isPending}
                  aria-label="Borrar rotura"
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {r.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{it.id_articulo}</span>
                      <span className="flex-1 truncate">{it.des_articulo}</span>
                      <span className="font-medium">{it.cantidad}</span>
                    </li>
                  ))}
                </ul>

                {r.localidad && (
                  <p className="text-sm text-muted-foreground">📍 {r.localidad}</p>
                )}
                {r.observaciones && (
                  <p className="text-sm">{r.observaciones}</p>
                )}

                {r.adjuntos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.adjuntos.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block size-20 overflow-hidden rounded-md border bg-muted"
                      >
                        {a.mime_type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt="Foto de la rotura" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <ImageIcon className="size-6 text-muted-foreground" />
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NuevaRoturaDialog open={open} onOpenChange={setOpen} patentes={patentes} skus={skus} />
    </div>
  )
}
