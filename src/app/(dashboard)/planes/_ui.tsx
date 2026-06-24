/**
 * Tokens y mini-componentes visuales del rediseño de Planes de acción
 * (handoff Claude Design). Reusados por el detalle y los diálogos.
 */
import type { CSSProperties } from "react"
import type { EstadoPlan, PrioridadPlan } from "@/types/database"

export const MONO: CSSProperties = {
  fontFamily: "var(--font-plex-mono), ui-monospace, SFMono-Regular, monospace",
}

export const ESTADO_UI: Record<
  EstadoPlan,
  { label: string; fg: string; bg: string; border: string; dot: string }
> = {
  pendiente: { label: "No comenzada", fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", dot: "#EF4444" },
  en_progreso: { label: "En curso", fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A", dot: "#F59E0B" },
  completado: { label: "Cerrada", fg: "#15803D", bg: "#F0FDF4", border: "#BBF7D0", dot: "#22C55E" },
}

export const PRIORIDAD_UI: Record<PrioridadPlan, { label: string; fg: string; bg: string; border: string }> = {
  alta: { label: "Alta", fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  media: { label: "Media", fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  baja: { label: "Baja", fg: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE" },
}

const AVATAR_PALETTE = ["#475569", "#2563EB", "#0891B2", "#7C3AED", "#0D9488", "#B45309", "#BE123C", "#4338CA"]

export function initials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "—"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < (name ?? "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

export function daysUntil(fechaLimite: string | null): number | null {
  if (!fechaLimite) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(fechaLimite.length === 10 ? `${fechaLimite}T00:00:00` : fechaLimite)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

export function progresoColor(progreso: number, cerrada: boolean): string {
  if (cerrada || progreso >= 100) return "#16A34A"
  if (progreso > 0) return "#3B82F6"
  return "#CBD5E1"
}

export function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

/** Color de la franja de urgencia y label del chip, para fecha límite. */
export function urgencia(fechaLimite: string | null, cerrada: boolean, prioridad: PrioridadPlan) {
  const dias = daysUntil(fechaLimite)
  const vencido = !cerrada && dias != null && dias < 0
  const porVencer = !cerrada && dias != null && dias >= 0 && dias <= 7
  const stripe = vencido ? "#EF4444" : porVencer ? "#F59E0B" : cerrada ? "#22C55E" : prioridad === "alta" ? "#FB923C" : "#E2E8F0"
  let chip: { label: string; fg: string; bg: string; border: string } | null = null
  if (vencido && dias != null) chip = { label: dias === -1 ? "Venció ayer" : `Vencido ${-dias}d`, fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" }
  else if (porVencer && dias != null) chip = { label: dias === 0 ? "Vence hoy" : `Vence en ${dias}d`, fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" }
  return { dias, vencido, porVencer, stripe, chip }
}

/* --------------------------------------------------------------- componentes */

export function Pill({ ui, dot }: { ui: { label: string; fg: string; bg: string; border: string; dot?: string }; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: ui.fg, backgroundColor: ui.bg, borderColor: ui.border }}
    >
      {dot && ui.dot && <span className="size-1.5 rounded-full" style={{ backgroundColor: ui.dot }} />}
      {ui.label}
    </span>
  )
}

export function CategoriaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: "#64748B", backgroundColor: "#F1F5F9", borderColor: "#E8EDF3" }}>
      {children}
    </span>
  )
}

export function CodigoChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={MONO} className="inline-flex items-center rounded-[5px] border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
      {children}
    </span>
  )
}

export function UrgenciaChip({ chip }: { chip: { label: string; fg: string; bg: string; border: string } | null }) {
  if (!chip) return null
  return (
    <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold"
      style={{ ...MONO, color: chip.fg, backgroundColor: chip.bg, borderColor: chip.border }}>
      {chip.label}
    </span>
  )
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ ...MONO, width: size, height: size, fontSize: size * 0.36, backgroundColor: avatarColor(name || "—") }}
      title={name || undefined}
    >
      {initials(name)}
    </span>
  )
}

export function Progreso({ value, cerrada, width = 64 }: { value: number; cerrada: boolean; width?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 overflow-hidden rounded-full" style={{ width, backgroundColor: "#EEF1F6" }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: progresoColor(value, cerrada) }} />
      </div>
      <span style={MONO} className="text-xs font-medium text-slate-600">{value}%</span>
    </div>
  )
}
