import { cn } from "@/lib/utils"
import type { RemitoInterno, RemitoItem } from "@/types/remitos-internos"

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function fmtCantidad(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)
}

/** "12 pallets, 40 bultos · 5 renglones" */
export function resumenItems(items: RemitoItem[]): string {
  const porUnidad = new Map<string, number>()
  for (const i of items) porUnidad.set(i.unidad, (porUnidad.get(i.unidad) ?? 0) + i.cantidad)
  const tot = [...porUnidad].map(([u, c]) => `${fmtCantidad(c)} ${u}`).join(", ")
  return `${tot} · ${items.length} ${items.length === 1 ? "renglón" : "renglones"}`
}

export function EstadoRemitoBadge({ remito, className }: { remito: RemitoInterno; className?: string }) {
  const [texto, estilo] = remito.anulado
    ? ["Anulado", "bg-slate-100 text-slate-600"]
    : remito.descarga_estado === "ok"
      ? ["Descargado OK", "bg-emerald-100 text-emerald-800"]
      : remito.descarga_estado === "con_novedad"
        ? ["Con novedad", "bg-red-100 text-red-800"]
        : ["En viaje", "bg-amber-100 text-amber-800"]
  return (
    <span className={cn("inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold", estilo, className)}>
      {texto}
    </span>
  )
}
