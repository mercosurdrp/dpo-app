"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ClipboardCheck,
  ListTodo,
  Users,
  Settings,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
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
        <span className="text-base font-bold text-white">DPO</span>
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
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              D
            </div>
            <div>
              <h1 className="text-base font-bold text-white">DPO</h1>
              <p className="text-[10px] text-slate-400">
                Mercosur Region Pampeana
              </p>
            </div>
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
        </nav>
      </div>
    </>
  )
}
