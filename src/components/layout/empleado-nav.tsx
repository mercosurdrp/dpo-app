"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  GraduationCap,
  ClipboardList,
  ShieldAlert,
  Truck,
  LogOut,
  CalendarRange,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

const items = [
  { label: "Capacitaciones", href: "/mis-capacitaciones", icon: GraduationCap },
  { label: "Mis tareas", href: "/mis-tareas", icon: ClipboardList },
  { label: "Mis vacaciones", href: "/rrhh/mis-solicitudes", icon: CalendarRange },
  { label: "Reportar", href: "/reportar-seguridad", icon: ShieldAlert },
  { label: "Vehículos", href: "/vehiculos/checklist", icon: Truck },
]

export function EmpleadoNav() {
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <nav className="sticky top-0 z-10 border-b bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-2 md:px-6">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {items.map((it) => {
            const active =
              pathname === it.href ||
              (it.href !== "/" && pathname.startsWith(it.href))
            const Icon = it.icon
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                )}
              >
                <Icon className="size-4" />
                {it.label}
              </Link>
            )
          })}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex shrink-0 items-center gap-1 rounded-md p-2 text-sm text-slate-600 hover:bg-slate-100"
          aria-label="Cerrar sesión"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  )
}
