"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LogOut, ChevronLeft, ChevronRight, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { EMPRESA_NOMBRE } from "@/lib/empresa"
import { NotificacionesBell } from "@/components/layout/notificaciones-bell"
import { itemActivo, menuPortal, type ContextoPortal, type ModuloPortal } from "@/lib/portal-empleado"

/**
 * Menú lateral del EMPLEADO. Reutiliza el chrome del Sidebar de admin
 * (columna oscura izquierda, logo, colapsable, notificaciones, logout) pero
 * con los ítems del portal, agrupados. Qué ítems hay y en qué empresa sale de
 * `@/lib/portal-empleado` — no agregar ítems acá.
 */

async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = "/login"
}

function ItemsAgrupados({
  ctx,
  collapsed = false,
  onNavigate,
}: {
  ctx: ContextoPortal
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const grupos = menuPortal(ctx)
  const activo = itemActivo(
    pathname,
    grupos.flatMap((g) => g.items),
  )

  return (
    <div className="space-y-4">
      {grupos.map(({ grupo, items }) => (
        <div key={grupo.id}>
          {collapsed ? (
            <div className="mx-3 mb-1 border-t border-white/10" />
          ) : (
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{grupo.label}</p>
          )}
          <div className="space-y-0.5">
            {items.map((item: ModuloPortal) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    activo === item.id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ───────────────────────── Desktop ─────────────────────────

export function EmpleadoSidebar({ ctx }: { ctx: ContextoPortal }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 z-40 transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
      style={{ backgroundColor: "#0a1628" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
        {collapsed ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            D
          </div>
        ) : (
          <div className="overflow-hidden">
            <Image
              src="/logo-mercosur-blanco.png"
              alt={EMPRESA_NOMBRE}
              width={140}
              height={24}
              className="h-6 w-auto"
              priority
            />
            <p className="mt-1 truncate text-[11px] text-slate-400">Portal del Empleado</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ItemsAgrupados ctx={ctx} collapsed={collapsed} />
      </nav>

      {/* Notificaciones + Logout + Collapse */}
      <div className="border-t border-white/10">
        <NotificacionesBell collapsed={collapsed} />
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center border-t border-white/10 py-3 text-slate-400 transition-colors hover:text-white"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
    </aside>
  )
}

// ───────────────────────── Mobile ─────────────────────────

export function EmpleadoMobileNav({ ctx }: { ctx: ContextoPortal }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Top bar */}
      <div
        className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 px-4 md:hidden"
        style={{ backgroundColor: "#0a1628" }}
      >
        <button onClick={() => setOpen(true)} className="text-slate-300 hover:text-white" aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <Image
          src="/logo-mercosur-blanco.png"
          alt={EMPRESA_NOMBRE}
          width={100}
          height={17}
          className="h-4 w-auto"
          priority
        />
      </div>

      {/* Overlay */}
      {open && <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ backgroundColor: "#0a1628" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div>
            <Image src="/logo-mercosur-blanco.png" alt={EMPRESA_NOMBRE} width={120} height={20} className="h-5 w-auto" />
            <p className="mt-1 text-[10px] text-slate-400">Portal del Empleado</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>

        <nav className="px-2 py-4">
          <ItemsAgrupados ctx={ctx} onNavigate={() => setOpen(false)} />

          <div className="mt-5 border-t border-white/10 pt-3">
            <NotificacionesBell />
            <button
              onClick={logout}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </nav>
      </div>
    </>
  )
}
