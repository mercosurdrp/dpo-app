"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
  ClipboardCheck,
  ListTodo,
  ClipboardList,
  BarChart3,
  Fingerprint,
  GraduationCap,
  Truck,
  Users,
  Link2,
  Settings,
  Lightbulb,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { NotificacionesBell } from "@/components/layout/notificaciones-bell"
import type { UserRole } from "@/types/database"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  {
    label: "Inicio",
    href: "/",
    icon: <LayoutDashboard className="size-5" />,
  },
  {
    label: "Auditorias",
    href: "/auditorias",
    icon: <ClipboardCheck className="size-5" />,
  },
  {
    label: "Acciones",
    href: "/acciones",
    icon: <ListTodo className="size-5" />,
  },
  {
    label: "Planes",
    href: "/planes",
    icon: <ClipboardList className="size-5" />,
  },
  {
    label: "Indicadores",
    href: "/indicadores",
    icon: <BarChart3 className="size-5" />,
  },
  {
    label: "Asistencia",
    href: "/asistencia",
    icon: <Fingerprint className="size-5" />,
  },
  {
    label: "Vehículos",
    href: "/vehiculos",
    icon: <Truck className="size-5" />,
  },
  {
    label: "Capacitaciones",
    href: "/capacitaciones",
    icon: <GraduationCap className="size-5" />,
  },
  {
    label: "Reportes de Seguridad",
    href: "/reportes-seguridad",
    icon: <ShieldAlert className="size-5" />,
  },
  {
    label: "Sugerencias",
    href: "/sugerencias",
    icon: <Lightbulb className="size-5" />,
  },
]

const adminItems: NavItem[] = [
  {
    label: "Usuarios",
    href: "/admin/usuarios",
    icon: <Users className="size-5" />,
    adminOnly: true,
  },
  {
    label: "Mapeo Empleados",
    href: "/admin/mapeo-empleados",
    icon: <Link2 className="size-5" />,
    adminOnly: true,
  },
]

export interface PilarNav {
  id: string
  nombre: string
  color: string
}

interface SidebarProps {
  role: UserRole
  pilares?: PilarNav[]
}

export function Sidebar({ role, pilares = [] }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
      style={{ backgroundColor: "#0a1628" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        {collapsed ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            D
          </div>
        ) : (
          <div className="overflow-hidden">
            <Image
              src="/logo-mercosur-blanco.png"
              alt="Mercosur Region Pampeana"
              width={140}
              height={24}
              className="h-6 w-auto"
              priority
            />
            <p className="mt-1 truncate text-[11px] text-slate-400">
              DPO
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {/* Main nav items */}
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </div>

        {/* Pilares section */}
        {pilares.length > 0 && (
          <div className="mt-5">
            {!collapsed && (
              <div className="px-3 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pilares
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {pilares.map((pilar) => {
                const pilarPath = `/pilares/${pilar.id}`
                const isActive = pathname.startsWith(pilarPath)

                return (
                  <Link
                    key={pilar.id}
                    href={pilarPath}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: pilar.color }}
                    />
                    {!collapsed && (
                      <span className="truncate text-[13px]">{pilar.nombre}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Admin section */}
        {role === "admin" && (
          <div className="mt-5">
            {!collapsed && (
              <div className="px-3 pb-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Settings className="size-3" />
                  Admin
                </p>
              </div>
            )}
            <div className="space-y-1">
              {adminItems.map((item) => {
                const isActive = pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Notificaciones + Logout + Collapse */}
      <div className="border-t border-white/10">
        <NotificacionesBell collapsed={collapsed} />
        <button
          onClick={async () => {
            const supabase = createClient()
            await supabase.auth.signOut()
            window.location.href = "/login"
          }}
          className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Cerrar sesion</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center border-t border-white/10 py-3 text-slate-400 hover:text-white transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>
    </aside>
  )
}
