import {
  listAcciones,
  listResponsablesPosibles,
  puedeEditarRiesgosExternos,
} from "@/actions/riesgos-externos"
import { RiesgosExternosClient } from "./riesgos-externos-client"

export default async function RiesgosExternosPage() {
  const [accRes, respRes, puedeEditar] = await Promise.all([
    listAcciones(),
    listResponsablesPosibles(),
    puedeEditarRiesgosExternos(),
  ])

  if ("error" in accRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Riesgos Externos — Plan de Acción
        </h1>
        <p className="mt-2 text-red-500">Error: {accRes.error}</p>
      </div>
    )
  }

  return (
    <RiesgosExternosClient
      acciones={accRes.data}
      responsables={"data" in respRes ? respRes.data : []}
      puedeEditar={puedeEditar}
    />
  )
}
