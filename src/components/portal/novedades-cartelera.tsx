"use client"

import { useState } from "react"
import { Megaphone, Pin } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { Novedad } from "@/lib/novedades"

/**
 * Cartelera de Novedades del Inicio del empleado: cumpleaños, feriados y
 * comunicados de la empresa. Tocar una imagen la abre en grande.
 */
export function NovedadesCartelera({ novedades }: { novedades: Novedad[] }) {
  const [abierta, setAbierta] = useState<Novedad | null>(null)
  if (novedades.length === 0) return null

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
        <Megaphone className="size-4 text-emerald-600" />
        Novedades
      </h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {novedades.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setAbierta(n)}
            className="w-64 shrink-0 snap-start overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md md:w-auto"
          >
            {n.imagen_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.imagen_url} alt={n.titulo} className="h-44 w-full bg-slate-100 object-cover object-top" />
            )}
            <div className="p-3">
              <p className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                {n.fijada && <Pin className="size-3.5 text-amber-500" />}
                {n.titulo}
              </p>
              {n.texto && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{n.texto}</p>}
            </div>
          </button>
        ))}
      </div>

      <Dialog open={abierta != null} onOpenChange={(o) => !o && setAbierta(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>{abierta?.titulo}</DialogTitle>
          {abierta?.imagen_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={abierta.imagen_url} alt={abierta.titulo} className="w-full rounded-lg" />
          )}
          {abierta?.texto && <p className="whitespace-pre-line text-sm text-slate-700">{abierta.texto}</p>}
        </DialogContent>
      </Dialog>
    </section>
  )
}
