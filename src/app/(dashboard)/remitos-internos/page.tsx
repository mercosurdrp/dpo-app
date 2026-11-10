import { listOperaciones, listRemitos, puedeEditarRemitos } from "@/actions/remitos-internos"
import { RemitosClient } from "./remitos-client"

export const dynamic = "force-dynamic"

export default async function RemitosInternosPage({
  searchParams,
}: {
  searchParams: Promise<{ op?: string }>
}) {
  const { op } = await searchParams
  const [opsRes, puedeEditar] = await Promise.all([listOperaciones(), puedeEditarRemitos()])

  const encabezado = (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Remitos internos</h1>
      <p className="text-sm text-muted-foreground">
        Traslados entre depósitos propios. Cada viaje lleva su remito impreso con QR; en destino se confirma la
        descarga desde acá o escaneando el QR.
      </p>
    </div>
  )

  if ("error" in opsRes) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {encabezado}
        <p className="text-red-500">{opsRes.error}</p>
      </div>
    )
  }

  const operaciones = opsRes.data
  const actual = operaciones.find((o) => o.id === op) ?? operaciones[0] ?? null
  const remitosRes = actual ? await listRemitos(actual.id) : { data: [] }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {encabezado}
      {"error" in remitosRes ? (
        <p className="text-red-500">Error: {remitosRes.error}</p>
      ) : (
        <RemitosClient
          operaciones={operaciones}
          operacionActual={actual}
          remitos={remitosRes.data}
          puedeEditar={puedeEditar}
        />
      )}
    </div>
  )
}
