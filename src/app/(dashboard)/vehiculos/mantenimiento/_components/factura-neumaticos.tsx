"use client"

// Adjuntos de facturas del módulo de neumáticos (compra de cubiertas y facturas
// de recapado). Vivían adentro de `neumaticos-module.tsx`; se sacaron acá para
// que el panel de recapados use exactamente el mismo campo y el mismo subidor,
// sin copiarlo.

import { toast } from "sonner"
import { FileDown, Paperclip } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { subirFacturasMantenimiento } from "@/actions/mantenimiento-vehiculos"
import { comprimirImagen } from "@/lib/comprimir-imagen"

export const ACCEPT_FACTURA_NEU = "image/*,application/pdf,.pdf"

/** Sube las facturas al bucket (imágenes comprimidas client-side por el 413
 *  de Vercel). Devuelve las URLs, o null si falló (ya tosteado). */
export async function subirFacturasNeumaticos(files: File[]): Promise<string[] | null> {
  if (files.length === 0) return []
  const fd = new FormData()
  fd.append("dominio", "NEUMATICOS")
  for (const f of files) {
    let archivo = f
    if (f.type.startsWith("image/")) {
      try {
        archivo = await comprimirImagen(f)
      } catch {
        archivo = f
      }
    }
    fd.append("facturas", archivo)
  }
  const res = await subirFacturasMantenimiento(fd)
  if ("error" in res) {
    toast.error(res.error)
    return null
  }
  return res.data
}

export function FacturaField({
  files,
  onChange,
  label = "Factura de compra (foto o PDF, opcional)",
}: {
  files: File[]
  onChange: (files: File[]) => void
  label?: string
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="file"
        accept={ACCEPT_FACTURA_NEU}
        multiple
        onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? [])])}
      />
      {files.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="text-destructive hover:underline"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Link para bajar un adjunto como PDF (si es una foto, el endpoint la mete en
// una página A4; si ya es PDF lo pasa tal cual).
export function LinkFacturaPdf({ url }: { url: string }) {
  return (
    <a
      href={`/api/vehiculos/neumaticos/factura-pdf?url=${encodeURIComponent(url)}`}
      target="_blank"
      rel="noreferrer"
      title="Descargar en PDF"
      className="inline-flex items-center gap-0.5 text-red-600 hover:underline"
    >
      <FileDown className="size-3" /> PDF
    </a>
  )
}

export function nombreDeFacturaUrl(url: string): string {
  try {
    const last = url.split("/").pop() || "factura"
    return decodeURIComponent(last.replace(/^\d+-\d+-/, ""))
  } catch {
    return "factura"
  }
}
