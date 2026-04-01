"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ClipboardCheck,
  ListTodo,
  ClipboardList,
  BarChart3,
  Fingerprint,
  Hand,
  GraduationCap,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { UserRole } from "@/types/database"
import type { PilarNav } from "./sidebar"

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
    label: "Reunión Pre-Ruta",
    href: "/reunion-preruta",
    icon: <Hand className="size-5" />,
  },
  {
    label: "Capacitaciones",
    href: "/capacitaciones",
    icon: <GraduationCap className="size-5" />,
  },
]

const adminItems: NavItem[] = [
  {
    label: "Usuarios",
    href: "/admin/usuarios",
    icon: <Users className="size-5" />,
    adminOnly: true,
  },
]

interface MobileNavProps {
  role: UserRole
  pilares?: PilarNav[]
}

export function MobileNav({ role, pilares = [] }: MobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Top bar */}
      <div
        className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 px-4 md:hidden"
        style={{ backgroundColor: "#0a1628" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="text-slate-300 hover:text-white"
        >
          <Menu className="size-5" />
        </button>
        <Image
          src="/logo-mercosur-blanco.png"
          alt="Mercosur Region Pampeana"
          width={100}
          height={17}
          className="h-4 w-auto"
          priority
        />
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 md:hidden overflow-y-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ backgroundColor: "#0a1628" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div>
            <Image
              src="/logo-mercosur-blanco.png"
              alt="Mercosur Region Pampeana"
              width={120}
              height={20}
              className="h-5 w-auto"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              DPO
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="px-2 py-4">
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
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Pilares section */}
          {pilares.length > 0 && (
            <div className="mt-5">
              <div className="px-3 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pilares
                </p>
              </div>
              <div className="space-y-0.5">
                {pilares.map((pilar) => {
                  const pilarPath = `/pilares/${pilar.id}`
                  const isActive = pathname.startsWith(pilarPath)

                  return (
                    <Link
                      key={pilar.id}
                      href={pilarPath}
                      onClick={() => setOpen(false)}
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
                      <span className="truncate text-[13px]">{pilar.nombre}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Admin section */}
          {role === "admin" && (
            <div className="mt-5">
              <div className="px-3 pb-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Settings className="size-3" />
                  Admin
                </p>
              </div>
              <div className="space-y-1">
                {adminItems.map((item) => {
                  const isActive = pathname.startsWith(item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Logout */}
          <div className="mt-5 border-t border-white/10 pt-3">
            <button
              onClick={async () => {
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.href = "/login"
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              <LogOut className="size-5" />
              <span>Cerrar sesion</span>
            </button>
          </div>
        </nav>
      </div>
    </>
  )
}
