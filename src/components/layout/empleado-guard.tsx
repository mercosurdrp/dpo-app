"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

export function EmpleadoGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!pathname.startsWith("/mis-capacitaciones")) {
      router.replace("/mis-capacitaciones")
    }
  }, [pathname, router])

  if (!pathname.startsWith("/mis-capacitaciones")) {
    return null
  }

  return <>{children}</>
}
