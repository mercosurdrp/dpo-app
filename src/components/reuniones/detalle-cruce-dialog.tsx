"use client"

import { useEffect, useState } from "react"
import { Camera, Handshake, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSignedUrl } from "@/actions/reuniones"
import { labelDeFoto } from "@/lib/participacion-cruzada-fotos"
import {
  PARTICIPACION_CRUZADA_SENTIDO_LABELS,
  type ParticipacionCruzada,
} from "@/types/database"

function formatFechaCorta(s: string | null): string {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Ficha de una participación: lo que se planificó (tema y quiénes debían ir)
 * contra lo que efectivamente pasó, con las fotos a la vista. Se abre desde el
 * calendario o desde el listado del plan.
 */
export function DetalleCruceDialog({
  cruce,
  puedeEditar,
  onClose,
  onEditar,
  onRegistrar,
  onVerReunion,
}: {
  cruce: ParticipacionCruzada | null
  puedeEditar: boolean
  onClose: () => void
  onEditar: (c: ParticipacionCruzada) => void
  onRegistrar: (c: ParticipacionCruzada) => void
  onVerReunion: (reunionId: string) => void
}) {
  // El padre remonta el diálogo con `key` por cruce, así que el estado arranca
  // limpio en cada apertura y el efecto sólo tiene que pedir las URLs firmadas.
  const [urls, setUrls] = useState<{ path: string; url: string | null }[]>([])
  const [cargandoFotos, setCargandoFotos] = useState(
    (cruce?.fotos.length ?? 0) > 0,
  )

  const fotosKey = cruce?.fotos.join("|") ?? ""

  useEffect(() => {
    if (!cruce || cruce.fotos.length === 0) return
    let cancelado = false
    void Promise.all(
      cruce.fotos.map(async (path) => {
        const result = await getSignedUrl(path)
        return { path, url: "error" in result ? null : result.data.url }
      }),
    ).then((res) => {
      if (cancelado) return
      setUrls(res)
      setCargandoFotos(false)
    })
    return () => {
      cancelado = true
    }
    // `fotosKey` alcanza: si cambian las fotos, cambia la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotosKey])

  if (!cruce) return null

  const realizada = cruce.estado === "realizada"

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Handshake className="size-5 text-emerald-600" />
            {PARTICIPACION_CRUZADA_SENTIDO_LABELS[cruce.sentido]}
            <Badge
              variant="outline"
              className={
                realizada
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : cruce.estado === "no_realizada"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-amber-300 bg-amber-50 text-amber-800"
              }
            >
              {realizada
                ? "Realizada"
                : cruce.estado === "no_realizada"
                  ? "No realizada"
                  : "Programada"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* El CHECK de la tabla garantiza al menos una de las dos. */}
            {cruce.fecha_plan && (
              <Dato
                label="Fecha planificada"
                valor={formatFechaCorta(cruce.fecha_plan)}
              />
            )}
            {cruce.fecha_real && (
              <Dato
                label="Fecha en que se hizo"
                valor={formatFechaCorta(cruce.fecha_real)}
              />
            )}
            <Dato label="Reunión" valor={cruce.destino ?? "—"} />
          </div>

          <div className="rounded-lg border bg-slate-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lo planificado
            </p>
            <div className="mt-2 space-y-2">
              <Dato
                label="Tema a tratar"
                valor={cruce.tema ?? "—"}
                multilinea
              />
              <Dato
                label="Deberían participar"
                valor={cruce.participantes_previstos ?? "—"}
              />
            </div>
          </div>

          {realizada ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Lo que pasó
              </p>
              <div className="mt-2 space-y-2">
                <Dato
                  label="Participaron"
                  valor={cruce.participantes ?? "—"}
                />
                <Dato
                  label="Minuta"
                  valor={cruce.minuta ?? "—"}
                  multilinea
                />
              </div>
            </div>
          ) : cruce.estado === "no_realizada" ? (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                No se hizo
              </p>
              <p className="mt-1 whitespace-pre-wrap">{cruce.motivo ?? "—"}</p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-muted-foreground">
              Todavía no se registró. Cuando pase, se carga con «Marcar hecha» y
              queda la evidencia.
            </p>
          )}

          {/* Evidencia */}
          {cruce.fotos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Evidencia ({cruce.fotos.length})
              </p>
              {cargandoFotos ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Cargando fotos…
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {urls.map(({ path, url }) => (
                    <figure
                      key={path}
                      className="overflow-hidden rounded-lg border bg-white"
                    >
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={labelDeFoto(path)}
                            className="aspect-square w-full cursor-zoom-in object-cover"
                          />
                        </a>
                      ) : (
                        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                          No se pudo cargar
                        </div>
                      )}
                      <figcaption className="border-t px-2 py-1 text-xs text-slate-700">
                        {labelDeFoto(path)}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {cruce.reunion_id && (
            <Button
              variant="outline"
              onClick={() => onVerReunion(cruce.reunion_id as string)}
            >
              Ver la reunión
            </Button>
          )}
          {puedeEditar && cruce.estado === "programada" && (
            <>
              <Button variant="outline" onClick={() => onEditar(cruce)}>
                <Pencil className="mr-2 size-4" />
                Editar
              </Button>
              <Button onClick={() => onRegistrar(cruce)}>
                <Camera className="mr-2 size-4" />
                Marcar hecha
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Dato({
  label,
  valor,
  multilinea,
}: {
  label: string
  valor: string
  multilinea?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={multilinea ? "whitespace-pre-wrap" : undefined}>{valor}</p>
    </div>
  )
}
