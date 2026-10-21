"use client"

import type { ReactNode } from "react"
import type { ImagenEtapa, MomentoImagen, RuteroMomento } from "@/actions/plan-territorial"
import { num } from "./formato"

// ==================================================================
// La historia de una etapa de rutas, contada en partes: cómo estaba, qué se
// hizo, cómo viene (lo calcula la tarjeta con la serie) y qué se espera. Es
// lo que antes había que ir a buscar a la presentación.
// ==================================================================

/** Los números del rutero que vale la pena ver al lado del texto. */
const CHIPS: Array<{ k: keyof RuteroMomento; label: string; dec: number }> = [
  { k: "viajes_sem", label: "viajes/sem", dec: 1 },
  { k: "paradas_viaje", label: "paradas/viaje", dec: 1 },
  { k: "pdv", label: "PDV", dec: 0 },
  { k: "promotores", label: "promotores", dec: 0 },
  { k: "rechazo_pct", label: "% rechazo", dec: 2 },
]

export function chipsMomento(m: RuteroMomento | undefined): Array<{ label: string; valor: string }> {
  if (!m) return []
  const out: Array<{ label: string; valor: string }> = []
  for (const c of CHIPS) {
    const v = m[c.k]
    if (v == null || v === "") continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    out.push({ label: c.label, valor: num(n, c.dec).replace(/,0+$/, "") })
  }
  return out
}

export function imagenesDe(imagenes: ImagenEtapa[], momento: MomentoImagen): ImagenEtapa[] {
  return imagenes.filter((i) => i.momento === momento && i.url)
}

export function HistoriaSeccion({
  icono,
  titulo,
  subtitulo,
  texto,
  chips,
  imagenes,
  children,
}: {
  icono: ReactNode
  titulo: string
  subtitulo?: string | null
  texto: string | null
  chips?: Array<{ label: string; valor: string }>
  imagenes?: ImagenEtapa[]
  children?: ReactNode
}) {
  const vacia = !texto && !(imagenes && imagenes.length) && !children
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span className="text-muted-foreground">{icono}</span>
          {titulo}
        </h4>
        {subtitulo && <span className="text-xs text-muted-foreground">{subtitulo}</span>}
        {chips && chips.length > 0 && (
          <span className="ml-auto flex flex-wrap gap-1">
            {chips.map((c) => (
              <span
                key={c.label}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
              >
                <span className="font-semibold">{c.valor}</span> {c.label}
              </span>
            ))}
          </span>
        )}
      </div>
      {vacia ? (
        <p className="text-xs text-muted-foreground">Todavía sin cargar.</p>
      ) : (
        <>
          {texto && <p className="whitespace-pre-wrap text-sm text-slate-800">{texto}</p>}
          {children}
          {imagenes && imagenes.length > 0 && <GaleriaImagenes imagenes={imagenes} />}
        </>
      )}
    </section>
  )
}

function GaleriaImagenes({ imagenes }: { imagenes: ImagenEtapa[] }) {
  return (
    <div className={`grid gap-3 ${imagenes.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {imagenes.map((img) => (
        <figure key={img.path} className="space-y-1">
          <a
            href={img.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir a tamaño completo"
            className="block overflow-hidden rounded-md border border-slate-200 bg-white"
          >
            {/* Es una URL firmada de Supabase Storage, no pasa por el optimizador de Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url ?? undefined}
              alt={img.titulo ?? "Mapa de la etapa"}
              loading="lazy"
              className="h-auto w-full"
            />
          </a>
          {img.titulo && (
            <figcaption className="text-xs text-muted-foreground">{img.titulo}</figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}
