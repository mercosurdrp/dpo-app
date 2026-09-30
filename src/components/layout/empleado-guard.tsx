"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { rutaPermitida, type ContextoPortal } from "@/lib/portal-empleado"

/**
 * Deja al empleado sólo en las rutas del portal (`@/lib/portal-empleado`),
 * con el mismo criterio de empresa y permisos que el menú. Cualquier otra lo
 * devuelve al Inicio.
 */
export function EmpleadoGuard({ ctx, children }: { ctx: ContextoPortal; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const permitida = rutaPermitida(pathname, ctx)

  useEffect(() => {
    if (!permitida) {
      router.replace("/mis-capacitaciones")
    }
  }, [permitida, router])

  if (!permitida) {
    return null
  }

  return <>{children}</>
}
