"use client"

// Reproduce/muestra un material adentro de la pantalla de la capacitación.
//
// El video NO pasa por /api/archivos/ver a propósito: ese visor bufferea el
// archivo entero en memoria y no propaga los headers Range, así que no se
// podría adelantar y en iOS ni arrancaría. Va directo contra la URL pública del
// bucket, que sí responde Range.

import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { urlVisorOffice } from "@/lib/abrir-archivo"
import { driveEmbedUrl, youtubeId } from "@/lib/campus"
import type { CampusMaterialConUrl } from "@/types/database"

function extensionDe(valor: string): string {
  const limpio = valor.split("?")[0]
  const m = limpio.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"])
const IMAGENES = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"])

/** ¿Se puede mostrar acá adentro, o hay que abrirlo en otra pestaña? */
export function esEmbebible(m: CampusMaterialConUrl): boolean {
  if (m.origen === "link") {
    return youtubeId(m.url) !== null || driveEmbedUrl(m.url) !== null
  }
  const ext = extensionDe(m.nombre_original || m.storage_path || "")
  if (m.tipo === "video" || (m.mime_type ?? "").startsWith("video/")) return true
  return ext === "pdf" || OFFICE.has(ext) || IMAGENES.has(ext)
}

export function MaterialVisor({ material }: { material: CampusMaterialConUrl }) {
  const marco = "w-full overflow-hidden rounded-xl border border-slate-200 bg-black"

  if (material.origen === "link") {
    const yt = youtubeId(material.url)
    if (yt) {
      return (
        <div className={marco}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            title={material.titulo}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full border-0"
          />
        </div>
      )
    }
    const drive = driveEmbedUrl(material.url)
    if (drive) {
      return (
        <div className={marco}>
          <iframe
            src={drive}
            title={material.titulo}
            allowFullScreen
            className="aspect-video w-full border-0"
          />
        </div>
      )
    }
    return <AbrirAfuera url={material.url} texto="Abrir el link" />
  }

  const ext = extensionDe(material.nombre_original || material.storage_path || "")
  const esVideo = material.tipo === "video" || (material.mime_type ?? "").startsWith("video/")

  if (esVideo) {
    return (
      <div className={marco}>
        <video
          src={material.url}
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-black"
        />
      </div>
    )
  }

  if (ext === "pdf") {
    return (
      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
        <iframe
          src={material.url}
          title={material.titulo}
          className="h-[70vh] max-h-[720px] w-full border-0"
        />
      </div>
    )
  }

  if (OFFICE.has(ext)) {
    return (
      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
        <iframe
          src={urlVisorOffice(material.url)}
          title={material.titulo}
          className="h-[70vh] max-h-[720px] w-full border-0"
        />
      </div>
    )
  }

  if (IMAGENES.has(ext)) {
    return (
      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
        {/* Es material subido por RRHH, de tamaño y origen variable: <img> */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={material.url}
          alt={material.titulo}
          className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg"
        />
      </div>
    )
  }

  return <AbrirAfuera url={material.url} texto="Descargar el archivo" />
}

function AbrirAfuera({ url, texto }: { url: string; texto: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm text-slate-600">Este material se abre en una pestaña nueva.</p>
      <Button
        className="mt-3 min-h-10"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      >
        <ExternalLink className="mr-2 size-4" />
        {texto}
      </Button>
    </div>
  )
}
