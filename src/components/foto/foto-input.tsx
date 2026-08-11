"use client"

import { useRef, useState } from "react"
import { Camera, CheckCircle2, Image as ImageIcon, X } from "lucide-react"
import { CamaraFoto } from "./camara-foto"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { cn } from "@/lib/utils"

/**
 * Dos formas de adjuntar una foto: sacarla con la cámara de la app o elegirla de
 * la galería.
 *
 * 🚨 «Sacar foto» abre `CamaraFoto` (getUserMedia), no un `<input capture>`: ese
 * atributo es sólo una sugerencia y varios navegadores abren la galería igual,
 * que es el problema que se venía arrastrando. La galería queda como segundo
 * botón, nunca como única opción.
 *
 * La foto siempre sale comprimida: la del celular pesa varios MB y la subida
 * desde el depósito no termina.
 */
export function FotoInput({
  foto,
  onFoto,
  nombreBase = "foto",
  className,
}: {
  foto: File | null
  onFoto: (file: File | null) => void
  nombreBase?: string
  className?: string
}) {
  const galeriaRef = useRef<HTMLInputElement>(null)
  const [camaraAbierta, setCamaraAbierta] = useState(false)
  const [procesando, setProcesando] = useState(false)

  async function desdeGaleria(file: File | undefined) {
    if (!file) return
    setProcesando(true)
    try {
      onFoto(await comprimirImagen(file))
    } catch {
      // Si no se pudo comprimir (formato raro), va el original: mejor una foto
      // pesada que ninguna.
      onFoto(file)
    } finally {
      setProcesando(false)
      if (galeriaRef.current) galeriaRef.current.value = ""
    }
  }

  return (
    <div className={className}>
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void desdeGaleria(e.target.files?.[0])}
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setCamaraAbierta(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent"
        >
          <Camera className="size-5" /> Sacar foto
        </button>
        <button
          type="button"
          disabled={procesando}
          onClick={() => galeriaRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <ImageIcon className="size-5" /> {procesando ? "Preparando…" : "De la galería"}
        </button>
      </div>

      {foto && (
        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-800",
            "dark:bg-emerald-950/30 dark:text-emerald-300",
          )}
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="flex-1 truncate">Foto lista ({pesoLegible(foto.size)})</span>
          <button
            type="button"
            onClick={() => onFoto(null)}
            aria-label="Quitar la foto"
            className="shrink-0 rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {camaraAbierta && (
        <CamaraFoto
          nombreBase={nombreBase}
          onFoto={onFoto}
          onCerrar={() => setCamaraAbierta(false)}
        />
      )}
    </div>
  )
}

function pesoLegible(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
