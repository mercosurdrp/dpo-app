"use client"

// Tabla ancha con barra de scroll horizontal ARRIBA además de la de abajo:
// sin ella hay que bajar hasta el pie de la tabla para descubrir que seguía
// a la derecha. Vivía dentro de checklists-mtto.tsx; se comparte desde que el
// bloque de CIL / artículos de limpieza se separó a su propia solapa.

import { useEffect, useRef, useState, type ReactNode } from "react"

export function ScrollX({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [hayOverflow, setHayOverflow] = useState(false)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const medir = () => {
      setAncho(el.scrollWidth)
      setHayOverflow(el.scrollWidth > el.clientWidth + 1)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener("resize", medir)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", medir)
    }
  }, [children])

  const desdeArriba = () => {
    if (topRef.current && bodyRef.current) bodyRef.current.scrollLeft = topRef.current.scrollLeft
  }
  const desdeTabla = () => {
    if (topRef.current && bodyRef.current) topRef.current.scrollLeft = bodyRef.current.scrollLeft
  }

  return (
    <div>
      {/* Barra de scroll ARRIBA (siempre visible mientras la tabla desborde). */}
      <div
        ref={topRef}
        onScroll={desdeArriba}
        className="scrollbar-x-visible overflow-x-scroll overflow-y-hidden"
        style={{ height: hayOverflow ? 12 : 0 }}
        aria-hidden
      >
        <div style={{ width: ancho, height: 1 }} />
      </div>
      {/* La tabla: scrollea acá (no en el wrapper interno del <Table> de shadcn,
          que neutralizamos con [&>div]:overflow-x-visible) y sin barra propia,
          sincronizada con la de arriba. */}
      <div
        ref={bodyRef}
        onScroll={desdeTabla}
        className="overflow-x-auto scrollbar-none [&>div]:overflow-x-visible"
      >
        {children}
      </div>
    </div>
  )
}
