"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  GraduationCap,
  ClipboardList,
  ShieldAlert,
  Truck,
  Fuel,
  LogOut,
  CalendarRange,
  CalendarCheck,
  Boxes,
  PackageCheck,
  Megaphone,
  MessageSquare,
  Wrench,
  PackageX,
  Refrigerator,
  Droplets,
  Sparkles,
  Brain,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  TrendingUp,
  Shirt,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { IS_MISIONES } from "@/lib/empresa"
import { NotificacionesBell } from "@/components/layout/notificaciones-bell"

/**
 * Menú lateral del EMPLEADO. Reutiliza el chrome del Sidebar de admin
 * (columna oscura izquierda, logo, colapsable, notificaciones, logout) pero
 * con los ítems curados del empleado — sin las secciones de admin/pilares.
 */

interface EmpItem {
  label: string
  href: string
  icon: React.ReactNode
}

function empleadoItems(puedeRecepcion: boolean, puedeCombustible: boolean): EmpItem[] {
  const items: EmpItem[] = [
    // Orden de salida del día (solo Misiones).
    ...(IS_MISIONES
      ? [{ label: "Orden de salida", href: "/mi-orden-del-dia", icon: <CalendarCheck className="size-5" /> }]
      : []),
    { label: "Inicio", href: "/mis-capacitaciones", icon: <GraduationCap className="size-5" /> },
    // Mis Resultados (DPO Entrega 2.1): HHEE + bultos propios, solo Pampeana.
    ...(IS_MISIONES
      ? []
      : [{ label: "Mis Resultados", href: "/visibilidad-resultados", icon: <TrendingUp className="size-5" /> }]),
    // ── Lo que el chofer hace sobre SU unidad, los tres juntos y ARRIBA ──
    // 🚨 Estaban repartidos: Mi CIL sexto y Vehículos/Combustible al fondo, detrás
    // de Comunicaciones, Servicios, Reportar, Buenas Prácticas y Mis vacaciones.
    // Juntarlos abajo no alcanzaba: en el celular hay que scrollear y el maquinista
    // no los encontraba (Francisco, 07/08/2026). Si se agregan ítems nuevos al
    // menú, van DESPUÉS de este bloque.
    { label: "Vehículos", href: "/vehiculos/checklist", icon: <Truck className="size-5" /> },
    // Combustible: los choferes de distribución entran por las tarjetas del
    // Inicio (piden legajo vinculado); los maquinistas cargan los autoelevadores
    // y no tienen ese vínculo, así que este ítem es su única puerta de entrada.
    ...(puedeCombustible
      ? [{ label: "Combustible", href: "/vehiculos/combustible", icon: <Fuel className="size-5" /> }]
      : []),
    // Mi CIL: el chofer registra su propia limpieza, control de fluidos o
    // lubricación (DPO Flota 4.1). Solo Pampeana, que es donde corre el programa.
    ...(IS_MISIONES
      ? []
      : [{ label: "Mi CIL", href: "/mi-cil", icon: <Droplets className="size-5" /> }]),
    // Trivia MERCOSUR: desafío de conocimiento diario (ambos tenants).
    { label: "Trivia", href: "/trivia", icon: <Brain className="size-5" /> },
    // Mi sector 5S: el responsable sorteado del mes carga sus tareas con foto.
    // Solo Pampeana, que es donde corre el sorteo mensual de sectores.
    ...(IS_MISIONES
      ? []
      : [{ label: "Mi sector 5S", href: "/mi-5s", icon: <Sparkles className="size-5" /> }]),
    // Rechazos: solo Pampeana (fuente de datos).
    ...(IS_MISIONES ? [] : [{ label: "Rechazos", href: "/rechazos", icon: <PackageX className="size-5" /> }]),
    // Roturas en la calle: solo Pampeana (fuente de datos / DQI).
    ...(IS_MISIONES
      ? []
      : [{ label: "Roturas en calle", href: "/mis-roturas", icon: <PackageX className="size-5" /> }]),
    // Feedback: canal ascendente que se trata en la matinal siguiente
    // (punto DPO Entrega 2.2). Solo Pampeana, que es donde corre la matinal.
    ...(IS_MISIONES
      ? []
      : [{ label: "Feedback", href: "/mi-feedback", icon: <MessageSquare className="size-5" /> }]),
    // Heladeras: el chofer registra la que dejó en el cliente o levantó al
    // camión, con foto. Solo Pampeana.
    ...(IS_MISIONES
      ? []
      : [{ label: "Heladeras", href: "/mis-heladeras", icon: <Refrigerator className="size-5" /> }]),
    { label: "Comunicaciones", href: "/portal/comunicaciones", icon: <Megaphone className="size-5" /> },
    { label: "Servicios", href: "/portal/servicios", icon: <Wrench className="size-5" /> },
    { label: "Reportar", href: "/reportar-seguridad", icon: <ShieldAlert className="size-5" /> },
    // Buenas Prácticas: enviar ideas de mejora (solo Pampeana — punto 4.4 Gestión).
    ...(IS_MISIONES
      ? []
      : [{ label: "Buenas Prácticas", href: "/mis-buenas-practicas", icon: <Sparkles className="size-5" /> }]),
    // Clasificar envases: solo Pampeana.
    ...(IS_MISIONES
      ? []
      : [{ label: "Clasificar envases", href: "/clasificacion-envases", icon: <Boxes className="size-5" /> }]),
    { label: "Mis vacaciones", href: "/rrhh/mis-solicitudes", icon: <CalendarRange className="size-5" /> },
    // Ropa y EPP: talles propios + confirmación de entregas (ambos tenants).
    { label: "Mi ropa", href: "/mi-ropa", icon: <Shirt className="size-5" /> },
    { label: "Mis tareas", href: "/mis-tareas", icon: <ClipboardList className="size-5" /> },
  ]
  if (puedeRecepcion) {
    items.push({ label: "Recepción", href: "/recepcion", icon: <PackageCheck className="size-5" /> })
  }
  return items
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href)
}

async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = "/login"
}

// ───────────────────────── Desktop ─────────────────────────

export function EmpleadoSidebar({ puedeRecepcion = false, puedeCombustible = false }: { puedeRecepcion?: boolean; puedeCombustible?: boolean }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const items = empleadoItems(puedeRecepcion, puedeCombustible)

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
              alt="Mercosur Region Pampeana"
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
        <div className="space-y-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </div>
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

export function EmpleadoMobileNav({ puedeRecepcion = false, puedeCombustible = false }: { puedeRecepcion?: boolean; puedeCombustible?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = empleadoItems(puedeRecepcion, puedeCombustible)

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
          alt="Mercosur Region Pampeana"
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
            <Image
              src="/logo-mercosur-blanco.png"
              alt="Mercosur Region Pampeana"
              width={120}
              height={20}
              className="h-5 w-auto"
            />
            <p className="mt-1 text-[10px] text-slate-400">Portal del Empleado</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>

        <nav className="px-2 py-4">
          <div className="space-y-1">
            {items.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

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
