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
  CalendarCheck,
  Boxes,
  PackageCheck,
  Megaphone,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { IS_MISIONES } from "@/lib/empresa"

const items = [
  // Orden de salida del día: módulo de distribución (solo Misiones).
  ...(IS_MISIONES
    ? [{ label: "Orden de salida", href: "/mi-orden-del-dia", icon: CalendarCheck }]
    : []),
  { label: "Inicio", href: "/mis-capacitaciones", icon: GraduationCap },
  { label: "Comunicaciones", href: "/portal/comunicaciones", icon: Megaphone },
  { label: "Servicios", href: "/portal/servicios", icon: Wrench },
  { label: "Reportar", href: "/reportar-seguridad", icon: ShieldAlert },
  // Clasificar envases: solo Pampeana (Depósito Esteban).
  ...(IS_MISIONES
    ? []
    : [{ label: "Clasificar envases", href: "/clasificacion-envases", icon: Boxes }]),
  { label: "Mis vacaciones", href: "/rrhh/mis-solicitudes", icon: CalendarRange },
  { label: "Vehículos", href: "/vehiculos/checklist", icon: Truck },
  // "Mis tareas" al final del menú (preferencia del usuario).
  { label: "Mis tareas", href: "/mis-tareas", icon: ClipboardList },
]

export function EmpleadoNav({ puedeRecepcion = false }: { puedeRecepcion?: boolean }) {
  const pathname = usePathname()
  // Solo maquinistas/almacén habilitados ven la Recepción de acarreos.
  const navItems = puedeRecepcion
    ? [...items, { label: "Recepción", href: "/recepcion", icon: PackageCheck }]
    : items

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <nav className="sticky top-0 z-10 border-b bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-2 md:px-6">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {navItems.map((it) => {
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
