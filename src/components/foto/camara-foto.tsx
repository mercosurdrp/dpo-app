"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, RefreshCw, RotateCcw, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"

/**
 * Cámara dentro de la app (`getUserMedia`), no el selector del sistema.
 *
 * 🚨 Existe porque `<input type="file" capture="environment">` NO garantiza nada:
 * el atributo es una *sugerencia* y varios navegadores lo ignoran — sobre todo
 * los WebView (abrir el link desde WhatsApp) y algunos Android, que abren el
 * selector de archivos igual. En el depósito eso se ve como "el botón Sacar foto
 * me abre la galería", que es exactamente lo que impidió registrar el CIL del
 * 10/08/2026 y lo que seguía pasando después de agregar el `capture`.
 *
 * Acá el stream se abre y se dispara dentro de la página, así que no hay
 * intermediario que decida por nosotros. Si el navegador no da cámara (permiso
 * denegado, sin HTTPS, sin dispositivo) se avisa y el que llama ofrece el input
 * de archivo como salida — nunca se deja al usuario sin forma de cargar.
 */

type Estado = "iniciando" | "filmando" | "revisando" | "error"

export function CamaraFoto({
  onFoto,
  onCerrar,
  nombreBase = "foto",
}: {
  /** La foto sacada, ya como File JPEG. */
  onFoto: (file: File) => void
  onCerrar: () => void
  /** Prefijo del nombre del archivo (termina en .jpg). */
  nombreBase?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [estado, setEstado] = useState<Estado>("iniciando")
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null)
  // Arranca en la trasera: es la que apunta al camión.
  const [camara, setCamara] = useState<"environment" | "user">("environment")

  const cortar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelado = false

    async function abrir() {
      setEstado("iniciando")
      setError(null)
      cortar()
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este navegador no permite abrir la cámara.")
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: camara } },
          audio: false,
        })
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // En iOS el play() puede rechazar si la pestaña perdió el gesto; no es
          // fatal, el video igual arranca con autoPlay.
          await videoRef.current.play().catch(() => {})
        }
        setEstado("filmando")
      } catch (e) {
        if (cancelado) return
        const msg =
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "No diste permiso para usar la cámara. Habilitalo en el candado de la barra de direcciones."
            : e instanceof DOMException && e.name === "NotFoundError"
              ? "No se encontró ninguna cámara en este dispositivo."
              : e instanceof Error
                ? e.message
                : "No se pudo abrir la cámara."
        setError(msg)
        setEstado("error")
      }
    }

    void abrir()
    return () => {
      cancelado = true
      cortar()
    }
  }, [camara, cortar])

  // La preview vive en un object URL: hay que soltarlo o queda en memoria.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  async function disparar() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    // Se reescala acá mismo: la foto de una cámara de celular pesa varios MB y
    // desde el depósito, con la señal que hay, eso es una subida que no termina.
    const maxLado = 1600
    const escala = Math.min(1, maxLado / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(video.videoWidth * escala)
    canvas.height = Math.round(video.videoHeight * escala)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.85),
    )
    if (!blob) return

    const file = new File([blob], `${nombreBase}.jpg`, { type: "image/jpeg" })
    setPreview({ url: URL.createObjectURL(blob), file })
    setEstado("revisando")
  }

  function repetir() {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setEstado("filmando")
  }

  function usar() {
    if (!preview) return
    onFoto(preview.file)
    cortar()
    onCerrar()
  }

  return (
    /*
      🚨 Va por el Dialog del design system y no por un `<div fixed>` suelto: la
      cámara también se abre DESDE otro diálogo (el «Registrar tarea CIL» del
      supervisor), y ahí un `position: fixed` propio se posiciona contra el
      cuadro del diálogo —que está trasladado— en vez de contra la pantalla,
      además de quedar por debajo de su modalidad. El Dialog sale por portal al
      body y se apila encima del que lo abrió.
    */
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) {
          cortar()
          onCerrar()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        showExpandButton={false}
        className="flex h-dvh max-h-none w-screen max-w-none flex-col gap-0 rounded-none bg-black p-0 sm:max-w-none"
      >
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-medium text-white">
            {estado === "revisando" ? "¿Se ve bien?" : "Sacar foto"}
          </span>
          <div className="flex items-center gap-1">
            {estado === "filmando" && (
              <button
                type="button"
                onClick={() => setCamara((c) => (c === "environment" ? "user" : "environment"))}
                aria-label="Cambiar de cámara"
                className="rounded-full p-2 text-white/90 hover:bg-white/10"
              >
                <RefreshCw className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                cortar()
                onCerrar()
              }}
              aria-label="Cerrar la cámara"
              className="rounded-full p-2 text-white/90 hover:bg-white/10"
            >
              <X className="size-6" />
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {estado === "error" ? (
            <p className="max-w-sm px-6 text-center text-sm text-white/90">{error}</p>
          ) : (
            <>
              {/* El video se mantiene montado aunque estemos revisando: volver a
                  "filmando" no tiene que reabrir el stream. */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`max-h-full max-w-full ${estado === "revisando" ? "invisible absolute" : ""}`}
              />
              {estado === "iniciando" && (
                <p className="absolute text-sm text-white/80">Abriendo la cámara…</p>
              )}
              {estado === "revisando" && preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt="Foto recién sacada"
                  className="max-h-full max-w-full"
                />
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 p-6">
          {estado === "revisando" ? (
            <>
              <button
                type="button"
                onClick={repetir}
                className="flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 text-sm font-medium text-white"
              >
                <RotateCcw className="size-4" /> Repetir
              </button>
              <button
                type="button"
                onClick={usar}
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black"
              >
                Usar esta foto
              </button>
            </>
          ) : estado === "error" ? (
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg border border-white/40 px-5 py-3 text-sm font-medium text-white"
            >
              Cerrar
            </button>
          ) : (
            <button
              type="button"
              onClick={disparar}
              disabled={estado !== "filmando"}
              aria-label="Sacar la foto"
              className="flex size-18 items-center justify-center rounded-full border-4 border-white/70 bg-white/20 disabled:opacity-40"
            >
              <Camera className="size-8 text-white" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
