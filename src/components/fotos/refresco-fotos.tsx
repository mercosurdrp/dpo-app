"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { refrescarFotos } from "@/actions/fotos"

/**
 * Refresco en segundo plano de las fotos vencidas (Cuadro mensual, KPI de
 * combustible). La página ya mostró la última foto; este componente pide el
 * recálculo al montar y, cuando termina, refresca la página para que entren
 * los datos nuevos. Si no hay claves vencidas no hace nada ni dibuja nada.
 *
 * Una sola corrida por montaje (ref) y sin reintentos: si el recálculo
 * falla, la foto vieja sigue siendo la mejor información disponible.
 */
export function RefrescoFotos({ claves }: { claves: string[] }) {
  const router = useRouter()
  const lanzado = useRef(false)
  // Arranca "corriendo" si hay algo que refrescar: el estado inicial sale de
  // las props, así el efecto no necesita setState sincrónico.
  const [estado, setEstado] = useState<"idle" | "corriendo" | "listo" | "error">(
    claves.length > 0 ? "corriendo" : "idle",
  )

  useEffect(() => {
    if (claves.length === 0 || lanzado.current) return
    lanzado.current = true
    let vivo = true
    refrescarFotos(claves)
      .then((r) => {
        if (!vivo) return
        if (r.renovadas.length > 0) {
          setEstado("listo")
          router.refresh()
        } else {
          setEstado("error")
          if (r.errores.length) console.warn("[fotos]", r.errores.join(" · "))
        }
      })
      .catch((err) => {
        if (!vivo) return
        setEstado("error")
        console.warn("[fotos]", err)
      })
    return () => {
      vivo = false
    }
  }, [claves, router])

  if (estado !== "corriendo") return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <RefreshCw className="size-3 animate-spin" />
      Actualizando indicadores en segundo plano… los datos que ves son la última
      foto; se refrescan solos al terminar.
    </p>
  )
}
