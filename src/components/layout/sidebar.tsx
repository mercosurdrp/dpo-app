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
  Sparkles,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Brain,
  Target,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  LogOut,
  CalendarRange,
  CalendarDays,
  UserCog,
  Briefcase,
  ClockAlert,
  CalendarCheck,
  Wallet,
  Presentation,
  Boxes,
  Wrench,
  Route,
  Handshake,
  HeartHandshake,
  PackageCheck,
  Megaphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { IS_MISIONES } from "@/lib/empresa"
import { puedeOperarAcarreo } from "@/lib/acarreo-operadores"
import { NotificacionesBell } from "@/components/layout/notificaciones-bell"
import type { UserRole } from "@/types/database"

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  adminOnly?: boolean
  hideForEmpleado?: boolean
  /** Solo se muestra en el tenant Pampeana (se oculta si IS_MISIONES). */
  pampeanaOnly?: boolean
  /** Solo se muestra en el tenant Misiones (se oculta si !IS_MISIONES). */
  misionesOnly?: boolean
  /**
   * Si está presente, sólo se muestra a estos roles. Tiene prioridad sobre
   * adminOnly y hideForEmpleado.
   */
  roles?: UserRole[]
  /**
   * Visible solo para operadores de Recepción de acarreos (admin/supervisor +
   * lista blanca de emails). Tiene prioridad sobre roles/hideForEmpleado.
   */
  operadorAcarreo?: boolean
  /** Enlace externo (otra app): abre en pestaña nueva, nunca se marca activo. */
  external?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
  /**
   * Si se setea, la sección entera sólo se muestra si el rol está en esta lista.
   */
  visibleFor?: UserRole[]
}

export const navItems: NavItem[] = [
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
    label: "Herramientas de Gestión",
    href: "/herramientas-gestion",
    icon: <Wrench className="size-5" />,
    pampeanaOnly: true,
  },
  {
    label: "Buenas Prácticas",
    href: "/buenas-practicas",
    icon: <Sparkles className="size-5" />,
    pampeanaOnly: true,
    hideForEmpleado: true,
  },
  {
    label: "Mis tareas",
    href: "/mis-tareas",
    icon: <ClipboardList className="size-5" />,
  },
  {
    label: "Registro de tareas",
    href: "/registro-tareas",
    icon: <ListTodo className="size-5" />,
  },
  {
    label: "Indicadores",
    href: "/indicadores",
    icon: <BarChart3 className="size-5" />,
  },
  {
    label: "NPS",
    href: "/nps",
    icon: <HeartHandshake className="size-5" />,
    pampeanaOnly: true,
    hideForEmpleado: true,
  },
  {
    label: "RMD",
    href: "/rmd",
    icon: <Truck className="size-5" />,
    pampeanaOnly: true,
    hideForEmpleado: true,
  },
  {
    label: "OWD",
    href: "/owd",
    icon: <ClipboardCheck className="size-5" />,
    hideForEmpleado: true,
  },
  {
    label: "Clasificar envases",
    href: "/clasificacion-envases",
    icon: <Boxes className="size-5" />,
    pampeanaOnly: true,
  },
  {
    label: "Ruteo",
    href: "/ruteo",
    icon: <Route className="size-5" />,
    pampeanaOnly: true,
    roles: ["admin", "supervisor"],
  },
  {
    label: "Acarreo (detalle)",
    href: "https://acarreo-rdf.vercel.app/historico",
    icon: <PackageCheck className="size-5" />,
    pampeanaOnly: true,
    roles: ["admin", "supervisor"],
    hideForEmpleado: true,
    external: true,
  },
  {
    label: "Recepción",
    href: "/recepcion",
    icon: <Truck className="size-5" />,
    pampeanaOnly: true,
    operadorAcarreo: true,
  },
  {
    label: "Presupuesto",
    href: "/presupuesto",
    icon: <Wallet className="size-5" />,
    hideForEmpleado: true,
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
    label: "Mantenimiento",
    href: "/vehiculos/mantenimiento",
    icon: <Wrench className="size-5" />,
    pampeanaOnly: true,
  },
  {
    label: "Orden de salida",
    href: "/orden-salida",
    icon: <CalendarCheck className="size-5" />,
    hideForEmpleado: true,
  },
  {
    label: "Capacitaciones",
    href: "/capacitaciones",
    icon: <GraduationCap className="size-5" />,
  },
  {
    label: "Mis Capacitaciones",
    href: "/mis-capacitaciones",
    icon: <GraduationCap className="size-5" />,
    roles: ["auditor"],
  },
  {
    label: "Trivia",
    href: "/trivia/ranking",
    icon: <Brain className="size-5" />,
  },
  {
    label: "Reuniones",
    href: "/reuniones",
    icon: <Presentation className="size-5" />,
  },
  {
    label: "Agenda",
    href: "/agenda",
    icon: <CalendarDays className="size-5" />,
    misionesOnly: true,
    roles: ["admin", "supervisor"],
  },
  {
    label: "Reportes de Seguridad",
    href: "/reportes-seguridad",
    icon: <ShieldAlert className="size-5" />,
  },
  {
    label: "SLA",
    href: "/sla",
    icon: <Handshake className="size-5" />,
    pampeanaOnly: true,
    hideForEmpleado: true,
  },
  {
    label: "Línea Ética",
    href: "/compliance/linea-etica",
    icon: <ShieldCheck className="size-5" />,
    hideForEmpleado: true,
  },
  {
    label: "5S",
    href: "/5s",
    icon: <Target className="size-5" />,
    hideForEmpleado: true,
  },
  {
    label: "Requisitos Legales",
    href: "/requisitos-legales",
    icon: <ScrollText className="size-5" />,
    hideForEmpleado: true,
  },
  {
    label: "Riesgos Externos",
    href: "/riesgos-externos",
    icon: <ShieldAlert className="size-5" />,
    hideForEmpleado: true,
  },
  {
    label: "Sugerencias",
    href: "/sugerencias",
    icon: <Lightbulb className="size-5" />,
  },
]

export const adminItems: NavItem[] = [
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

// ===== Portal del Empleado (Buzón de Comunicaciones + Servicios Generales) =====
// Visible para todos los roles que usan el sidebar. El "Dashboard" sólo lo ve
// admin; el empleado accede al portal desde su nav horizontal (empleado-nav).
export const portalSections: NavSection[] = [
  {
    title: "Portal del Empleado",
    items: [
      {
        label: "Dashboard",
        href: "/portal",
        icon: <LayoutDashboard className="size-5" />,
        roles: ["admin"],
      },
      {
        label: "Comunicaciones",
        href: "/portal/comunicaciones",
        icon: <Megaphone className="size-5" />,
      },
      {
        label: "Servicios Generales",
        href: "/portal/servicios",
        icon: <Wrench className="size-5" />,
      },
    ],
  },
]

// ===== Secciones RRHH (visibles según rol) =====
export const rrhhSections: NavSection[] = [
  {
    title: "Mi área",
    visibleFor: ["empleado", "supervisor", "admin", "admin_rrhh"],
    items: [
      {
        label: "Mi orden del día",
        href: "/mi-orden-del-dia",
        icon: <CalendarCheck className="size-5" />,
      },
      {
        label: "Mis vacaciones",
        href: "/rrhh/mis-solicitudes",
        icon: <CalendarRange className="size-5" />,
      },
    ],
  },
  {
    title: "Personal a cargo",
    visibleFor: ["supervisor", "admin", "admin_rrhh"],
    items: [
      {
        label: "Mi equipo",
        href: "/rrhh/mi-equipo",
        icon: <Briefcase className="size-5" />,
      },
    ],
  },
  {
    title: "Admin RRHH",
    visibleFor: ["admin", "admin_rrhh"],
    items: [
      {
        label: "Personal",
        href: "/rrhh/personal",
        icon: <UserCog className="size-5" />,
      },
      {
        label: "Licencias y vacaciones",
        href: "/rrhh/licencias",
        icon: <CalendarRange className="size-5" />,
      },
      {
        label: "Ausentismo",
        href: "/ausentismo",
        icon: <ClockAlert className="size-5" />,
        pampeanaOnly: true,
      },
      {
        label: "Jornadas",
        href: "/rrhh/jornadas",
        icon: <ClockAlert className="size-5" />,
      },
      {
        label: "Configuración RRHH",
        href: "/rrhh/configuracion",
        icon: <Settings className="size-5" />,
      },
    ],
  },
]

export interface PilarNav {
  id: string
  nombre: string
  color: string
}

interface SidebarProps {
  role: UserRole
  email?: string | null
  pilares?: PilarNav[]
}

export function Sidebar({ role, email = null, pilares = [] }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  // Ocultar por completo la columna (estilo app de depósito).
  const [hidden, setHidden] = useState(false)
  // Búsqueda de pestañas (hay muchas).
  const [query, setQuery] = useState("")
  // Con el menú angosto no hay lugar para la búsqueda: no se filtra.
  const q = collapsed ? "" : query.trim().toLowerCase()
  const matchQ = (label: string) => !q || label.toLowerCase().includes(q)
  const buscando = q.length > 0

  // Columna oculta: solo queda un botón flotante para volver a mostrarla.
  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        aria-label="Mostrar menú"
        title="Mostrar menú"
        className="fixed left-3 top-3 z-50 hidden rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-md transition-colors hover:bg-slate-100 md:block"
      >
        <Menu className="size-5" />
      </button>
    )
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 z-40 transition-all duration-200",
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
        {!collapsed && (
          <button
            onClick={() => setHidden(true)}
            aria-label="Ocultar menú"
            title="Ocultar menú"
            className="ml-auto rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      {/* Buscador de pestañas */}
      {!collapsed && (
        <div className="border-b border-white/10 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pestaña…"
              className="w-full rounded-lg bg-white/5 py-2 pl-8 pr-2 text-sm text-white placeholder:text-slate-500 outline-none focus:bg-white/10 focus:ring-1 focus:ring-white/20"
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {/* Main nav items */}
        <div className="space-y-1">
          {navItems
            .filter((item) => {
              if (!matchQ(item.label)) return false
              if (item.pampeanaOnly && IS_MISIONES) return false
              if (item.misionesOnly && !IS_MISIONES) return false
              if (item.operadorAcarreo) return puedeOperarAcarreo(role, email)
              return (
                !(item.hideForEmpleado && role === "empleado") &&
                (!item.roles || item.roles.includes(role))
              )
            })
            .map((item) => {
            const isActive =
              item.external
                ? false
                : item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
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
        {pilares.some((p) => matchQ(p.nombre)) && (
          <div className="mt-5">
            {!collapsed && (
              <div className="px-3 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pilares
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {pilares.filter((p) => matchQ(p.nombre)).map((pilar) => {
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

        {/* Portal del Empleado + secciones RRHH (filtran por rol) */}
        {[...portalSections, ...rrhhSections]
          .filter((sec) => !sec.visibleFor || sec.visibleFor.includes(role))
          .filter((sec) =>
            sec.items.some(
              (item) => !(item.pampeanaOnly && IS_MISIONES) && matchQ(item.label),
            ),
          )
          .map((sec) => (
            <div key={sec.title} className="mt-5">
              {!collapsed && (
                <div className="px-3 pb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {sec.title}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                {sec.items
                  .filter(
                    (item) =>
                      !(item.pampeanaOnly && IS_MISIONES) &&
                      (!item.roles || item.roles.includes(role)) &&
                      matchQ(item.label),
                  )
                  .map((item) => {
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
          ))}

        {/* Admin section */}
        {role === "admin" && adminItems.some((item) => matchQ(item.label)) && (
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
              {adminItems.filter((item) => matchQ(item.label)).map((item) => {
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

        {/* Sin resultados de búsqueda */}
        {buscando &&
          !navItems.some((i) => matchQ(i.label)) &&
          !pilares.some((p) => matchQ(p.nombre)) &&
          !rrhhSections.some((s) => s.items.some((i) => matchQ(i.label))) &&
          !adminItems.some((i) => matchQ(i.label)) && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              Sin resultados para “{query.trim()}”
            </p>
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
