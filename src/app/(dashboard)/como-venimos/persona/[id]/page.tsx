import Link from "next/link"
import { ArrowLeft, Eye } from "lucide-react"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getVistaPersona } from "@/actions/como-venimos"
import { IncentivoCard, MisCapacitacionesCard, MisNumerosCard } from "../../como-venimos-client"

// La pantalla de una persona tal como la ve ella — sólo supervisión. El corte
// de rol lo hace `getVistaPersona` en el servidor.

export const dynamic = "force-dynamic"

export default async function VistaPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuloPortal("como-venimos")
  const { id } = await params
  const res = await getVistaPersona(id)

  return (
    <div className="space-y-4">
      <Link
        href="/como-venimos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Volver a Cómo venimos
      </Link>

      {"error" in res ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{res.error}</div>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
            <Eye className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <p>
              <strong className="text-slate-900">{res.data.persona.nombre}</strong> · {res.data.persona.rol}
              {res.data.persona.legajo != null && ` · legajo ${res.data.persona.legajo}`} — Esto es lo que ve esta
              persona en su «Cómo venimos».
            </p>
          </div>
          <MisNumerosCard
            persona={res.data.persona}
            pis={res.data.pis}
            mesDesde={res.data.mes_desde}
            esPropia={false}
          />
          {res.data.capacitaciones && <MisCapacitacionesCard cap={res.data.capacitaciones} esPropia={false} />}
          {res.data.incentivo && <IncentivoCard inc={res.data.incentivo} esPropia={false} />}
        </>
      )}
    </div>
  )
}
