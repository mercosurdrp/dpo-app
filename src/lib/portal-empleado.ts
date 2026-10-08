import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  BookOpenCheck,
  Boxes,
  Brain,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  GraduationCap,
  Megaphone,
  MessageSquare,
  PackageCheck,
  PackageX,
  Recycle,
  Refrigerator,
  ShieldAlert,
  Shirt,
  Sparkles,
  TrendingUp,
  Lightbulb,
  Wrench,
} from "lucide-react"
import { IS_MISIONES } from "@/lib/empresa"

/**
 * Portal del empleado: UNA sola lista de lo que existe, en qué empresa y para
 * quién. De acá salen el menú (desktop y celular), las rutas que deja pasar
 * `EmpleadoGuard` y el corte de cada página (`moduloHabilitado`).
 *
 * Antes eran tres listas que se desincronizaban: el menú filtraba por
 * `IS_MISIONES`, el guard no filtraba por empresa y cada página hacía su
 * propio `redirect("/")` — que para un empleado era un doble salto pasando
 * por el tablero de admin. Mudar un módulo a Distribuciones ahora es agregar
 * "misiones" en `empresas`.
 *
 * Este archivo lo importan componentes de cliente: nada de server-only acá.
 */

export type Empresa = "pampeana" | "misiones"

export const EMPRESA_ACTUAL: Empresa = IS_MISIONES ? "misiones" : "pampeana"

export type GrupoPortal = "hoy" | "trabajo" | "aprender" | "participar" | "yo"

export const GRUPOS_PORTAL: { id: GrupoPortal; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "trabajo", label: "Mi trabajo" },
  { id: "aprender", label: "Aprender" },
  { id: "participar", label: "Participar" },
  { id: "yo", label: "Lo mío" },
]

/** Lo que se sabe del usuario para decidir qué ve. */
export interface ContextoPortal {
  /** Admin/supervisor o lista blanca de acarreo (`puedeOperarAcarreo`). */
  puedeRecepcion: boolean
  /** Admin/supervisor o maquinistas habilitados (`puedeOperarVehiculos`). */
  puedeVehiculos: boolean
}

export interface ModuloPortal {
  id: string
  label: string
  href: string
  icon: LucideIcon
  empresas: Empresa[]
  /** null = no va en el menú (se entra desde el Inicio o desde otra pantalla). */
  grupo: GrupoPortal | null
  /** Filtro por usuario, además de la empresa: decide si va en el MENÚ. */
  visible?: (ctx: ContextoPortal) => boolean
  /**
   * Decide si el empleado puede ABRIR la ruta (`EmpleadoGuard`). Si falta,
   * vale `visible`. Combustible los separa: en el menú sólo para maquinistas,
   * pero la ruta abierta a todos, porque el chofer vinculado a un camión
   * entra por la tarjeta «Carga Combustible» del Inicio (Cerbin, 02/10/2026:
   * tocaba el botón y el guard lo devolvía al Inicio).
   */
  acceso?: (ctx: ContextoPortal) => boolean
  /**
   * false = sólo la ruta exacta. Combustible lo necesita: bajo
   * /vehiculos/combustible cuelga /analisis, que es de gestión.
   */
  subrutas?: boolean
}

const AMBAS: Empresa[] = ["pampeana", "misiones"]
const PAMPEANA: Empresa[] = ["pampeana"]
const MISIONES: Empresa[] = ["misiones"]

export const MODULOS_PORTAL: ModuloPortal[] = [
  // ── Hoy ──
  {
    id: "orden-salida",
    label: "Orden de salida",
    href: "/mi-orden-del-dia",
    icon: CalendarCheck,
    empresas: MISIONES,
    grupo: "hoy",
  },
  {
    id: "inicio",
    label: "Inicio",
    href: "/mis-capacitaciones",
    icon: GraduationCap,
    empresas: AMBAS,
    grupo: "hoy",
  },
  // Cómo venimos: indicadores del equipo + tus números + incentivo + SKAP.
  // Absorbe «Mis Resultados» y «Mis Rechazos» (siguen vivas por links viejos).
  {
    id: "como-venimos",
    label: "Cómo venimos",
    href: "/como-venimos",
    icon: TrendingUp,
    empresas: PAMPEANA,
    grupo: "hoy",
  },

  // ── Mi trabajo ──
  // Vehículos (checklist), CIL, neumáticos y urea NO van en el menú: se entra
  // por el bloque «Mi camión» del Inicio. Combustible sí, pero sólo para los
  // maquinistas, que no tienen legajo vinculado a un camión y por eso no ven
  // ese bloque (Francisco, 07/08/2026).
  {
    id: "combustible",
    label: "Combustible",
    href: "/vehiculos/combustible",
    icon: Fuel,
    empresas: AMBAS,
    grupo: "trabajo",
    visible: (ctx) => ctx.puedeVehiculos,
    acceso: () => true,
    subrutas: false,
  },
  {
    id: "mi-productividad",
    label: "Mi productividad",
    href: "/mi-productividad",
    icon: Gauge,
    empresas: PAMPEANA,
    grupo: "trabajo",
  },
  {
    id: "mi-5s",
    label: "Mi sector 5S",
    href: "/mi-5s",
    icon: Sparkles,
    empresas: PAMPEANA,
    grupo: "trabajo",
  },
  {
    id: "heladeras",
    label: "Heladeras",
    href: "/mis-heladeras",
    icon: Refrigerator,
    empresas: PAMPEANA,
    grupo: "trabajo",
  },
  {
    id: "roturas",
    label: "Roturas en calle",
    href: "/mis-roturas",
    icon: PackageX,
    empresas: AMBAS,
    grupo: "trabajo",
  },
  {
    id: "envases",
    label: "Clasificar envases",
    href: "/clasificacion-envases",
    icon: Recycle,
    empresas: PAMPEANA,
    grupo: "trabajo",
  },
  {
    id: "recepcion",
    label: "Recepción",
    href: "/recepcion",
    icon: PackageCheck,
    empresas: PAMPEANA,
    grupo: "trabajo",
    visible: (ctx) => ctx.puedeRecepcion,
  },

  // ── Aprender ──
  {
    id: "campus",
    label: "Campus",
    href: "/campus",
    icon: BookOpen,
    empresas: AMBAS,
    grupo: "aprender",
  },
  {
    id: "trivia",
    label: "Trivia",
    href: "/trivia",
    icon: Brain,
    empresas: AMBAS,
    grupo: "aprender",
  },
  {
    id: "instructivos",
    label: "Cómo se hace",
    href: "/instructivos",
    icon: BookOpenCheck,
    empresas: PAMPEANA,
    grupo: "aprender",
  },
  // Biblioteca con los SOPs vigentes de todos los pilares, abierta a todos.
  {
    id: "sops",
    label: "SOPs",
    href: "/sops",
    icon: FileText,
    empresas: AMBAS,
    grupo: "aprender",
  },

  // ── Participar ──
  {
    id: "reportar",
    label: "Reportar",
    href: "/reportar-seguridad",
    icon: ShieldAlert,
    empresas: AMBAS,
    grupo: "participar",
  },
  {
    id: "buenas-practicas",
    label: "Buenas Prácticas",
    href: "/mis-buenas-practicas",
    icon: Lightbulb,
    empresas: PAMPEANA,
    grupo: "participar",
  },
  {
    id: "feedback",
    label: "Feedback",
    href: "/mi-feedback",
    icon: MessageSquare,
    empresas: PAMPEANA,
    grupo: "participar",
  },
  {
    id: "mis-tareas",
    label: "Mis tareas",
    href: "/mis-tareas",
    icon: ClipboardList,
    empresas: AMBAS,
    grupo: "participar",
  },

  // ── Lo mío ──
  {
    id: "vacaciones",
    label: "Mis vacaciones",
    href: "/rrhh/mis-solicitudes",
    icon: CalendarRange,
    empresas: AMBAS,
    grupo: "yo",
  },
  {
    id: "mi-ropa",
    label: "Mi ropa",
    href: "/mi-ropa",
    icon: Shirt,
    empresas: AMBAS,
    grupo: "yo",
  },
  {
    id: "comunicaciones",
    label: "Comunicaciones",
    href: "/portal/comunicaciones",
    icon: Megaphone,
    empresas: AMBAS,
    grupo: "yo",
  },
  {
    id: "servicios",
    label: "Servicios",
    href: "/portal/servicios",
    icon: Wrench,
    empresas: AMBAS,
    grupo: "yo",
  },

  // ── Fuera del menú ──
  {
    id: "checklist",
    label: "Checklist",
    href: "/vehiculos/checklist",
    icon: ClipboardList,
    empresas: AMBAS,
    grupo: null,
  },
  {
    id: "mi-cil",
    label: "Mi CIL",
    href: "/mi-cil",
    icon: Wrench,
    empresas: AMBAS,
    grupo: null,
  },
  {
    id: "neumaticos",
    label: "Neumáticos",
    href: "/mis-neumaticos",
    icon: Wrench,
    empresas: AMBAS,
    grupo: null,
  },
  {
    id: "urea",
    label: "Urea",
    href: "/mi-urea",
    icon: Fuel,
    empresas: AMBAS,
    grupo: null,
  },
  {
    id: "mis-resultados",
    label: "Mis Resultados",
    href: "/visibilidad-resultados",
    icon: TrendingUp,
    empresas: PAMPEANA,
    grupo: null,
  },
  {
    id: "mis-rechazos",
    label: "Mis Rechazos",
    href: "/mis-rechazos",
    icon: PackageX,
    empresas: PAMPEANA,
    grupo: null,
  },
  {
    id: "rechazos",
    label: "Rechazos",
    href: "/rechazos",
    icon: Boxes,
    empresas: PAMPEANA,
    grupo: null,
  },
]

/**
 * Rutas que el empleado puede abrir aunque no sean un módulo: el detalle de
 * una tarea (/planes/<id>, desde «Mis tareas») y el de una reunión
 * (/reuniones/<id>, donde marca su presente). Sólo el detalle: la barra final
 * deja afuera los listados de gestión.
 */
const RUTAS_DETALLE = ["/planes/", "/reuniones/"]

const porId = new Map(MODULOS_PORTAL.map((m) => [m.id, m]))

function enEmpresa(m: ModuloPortal): boolean {
  return m.empresas.includes(EMPRESA_ACTUAL)
}

/** El módulo existe en esta empresa (no mira permisos del usuario). */
export function moduloHabilitado(id: string): boolean {
  const m = porId.get(id)
  return !!m && enEmpresa(m)
}

/** Menú agrupado para este usuario, en el orden del catálogo. */
export function menuPortal(ctx: ContextoPortal): { grupo: (typeof GRUPOS_PORTAL)[number]; items: ModuloPortal[] }[] {
  return GRUPOS_PORTAL.map((grupo) => ({
    grupo,
    items: MODULOS_PORTAL.filter((m) => m.grupo === grupo.id && enEmpresa(m) && (m.visible ? m.visible(ctx) : true)),
  })).filter((g) => g.items.length > 0)
}

function coincide(pathname: string, m: ModuloPortal): boolean {
  if (pathname === m.href) return true
  return m.subrutas !== false && pathname.startsWith(m.href + "/")
}

/** ¿El empleado puede estar en esta ruta? (lo usa `EmpleadoGuard`). */
export function rutaPermitida(pathname: string, ctx: ContextoPortal): boolean {
  if (RUTAS_DETALLE.some((p) => pathname.startsWith(p))) return true
  return MODULOS_PORTAL.some((m) => enEmpresa(m) && puedeAbrir(m, ctx) && coincide(pathname, m))
}

function puedeAbrir(m: ModuloPortal, ctx: ContextoPortal): boolean {
  const regla = m.acceso ?? m.visible
  return regla ? regla(ctx) : true
}

/** Ítem del menú activo: el de href más largo que coincide. */
export function itemActivo(pathname: string, items: ModuloPortal[]): string | null {
  let mejor: ModuloPortal | null = null
  for (const m of items) {
    if ((pathname === m.href || pathname.startsWith(m.href + "/")) && (!mejor || m.href.length > mejor.href.length)) {
      mejor = m
    }
  }
  return mejor?.id ?? null
}
