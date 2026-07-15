"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"

/**
 * En el dashboard el scroll NO vive en el window sino en el
 * `<main className="... overflow-auto">` del layout (ver
 * `app/(dashboard)/layout.tsx`). `router.refresh()` solo preserva la posición
 * de scroll del documento, así que al re-renderizar el árbol del server el
 * contenido del <main> se reemplaza y su `scrollTop` salta al tope: la página
 * "se reinicia" cada vez que se guarda/carga algo.
 *
 * Este hook captura el `scrollTop` del contenedor antes de refrescar y lo
 * restaura una vez que el contenido vuelve a montarse. El refresh es
 * asíncrono (nueva request al server), por eso restauramos frame a frame hasta
 * alcanzar la posición, con un tope de tiempo por si la página encogió de
 * verdad.
 */
export function useRefrescarConScroll() {
  const router = useRouter()

  return useCallback(() => {
    if (typeof document === "undefined") {
      router.refresh()
      return
    }

    // El <main> visible es el único con overflow-auto que realmente scrollea.
    const mains = Array.from(document.querySelectorAll("main"))
    const scroller =
      mains.find((m) => m.scrollHeight > m.clientHeight) ?? mains[0] ?? null
    const y = scroller?.scrollTop ?? 0

    router.refresh()

    if (!scroller || y <= 0) return

    const start = performance.now()
    const restore = () => {
      scroller.scrollTop = y
      const llego = Math.abs(scroller.scrollTop - y) <= 1
      if (!llego && performance.now() - start < 2000) {
        requestAnimationFrame(restore)
      }
    }
    requestAnimationFrame(restore)
  }, [router])
}
