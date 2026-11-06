import { Star } from "lucide-react"
import { HERRAMIENTA_LABEL } from "@/lib/reuniones-herramientas"

/** Estrella con las herramientas de gestión (5XQ, Espina, PDCA) de una acción. */
export function HerramientasChip({
  herramientas,
}: {
  herramientas?: { id: string; tipo: string }[]
}) {
  if (!herramientas || herramientas.length === 0) return null
  const tipos = Array.from(
    new Set(herramientas.map((h) => HERRAMIENTA_LABEL[h.tipo] ?? h.tipo)),
  )
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 text-xs font-semibold text-amber-800"
      title={`Tiene herramienta de gestión: ${tipos.join(", ")} (ver en el detalle)`}
    >
      <Star className="size-3 fill-amber-400 text-amber-500" />
      {tipos.join(" · ")}
    </span>
  )
}
