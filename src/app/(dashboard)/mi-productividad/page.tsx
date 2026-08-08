import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getMiProductividad } from "@/actions/mi-productividad"
import { MiProductividadClient } from "./mi-productividad-client"

// "Mi productividad" — lo que la persona hizo en el depósito, para la persona.
// Sólo Pampeana: las fuentes (WMS de Ramallo + clasificación de envases) son
// de ese tenant.

export const dynamic = "force-dynamic"

export default async function MiProductividadPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  if (IS_MISIONES) notFound()
  await requireAuth()
  const { mes } = await searchParams

  const res = await getMiProductividad(mes)
  if ("error" in res) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">Mi productividad</p>
        <p className="mt-2 text-sm text-muted-foreground">{res.error}</p>
      </div>
    )
  }

  return <MiProductividadClient data={res.data} />
}
