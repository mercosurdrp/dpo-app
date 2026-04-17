"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

const ALLOWED_PATHS = ["/mis-capacitaciones", "/vehiculos/checklist", "/vehiculos/combustible", "/reportes-seguridad"]

function isAllowed(pathname: string) {
  return ALLOWED_PATHS.some((p) => pathname.startsWith(p))
}

export function EmpleadoGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isAllowed(pathname)) {
      router.replace("/mis-capacitaciones")
    }
  }, [pathname, router])

  if (!isAllowed(pathname)) {
    return null
  }

  return <>{children}</>
}
