import {
  listAcciones,
  listResponsablesPosibles,
  puedeEditarRiesgosExternos,
} from "@/actions/riesgos-externos"
import {
  listConfigRiesgos,
  listContactos,
} from "@/actions/riesgos-externos-contactos"
import { listEscalamiento } from "@/actions/riesgos-externos-plan"
import { RiesgosExternosTabs } from "./riesgos-externos-tabs"

export default async function RiesgosExternosPage() {
  const [accRes, respRes, contRes, confRes, escRes, puedeEditar] =
    await Promise.all([
      listAcciones(),
      listResponsablesPosibles(),
      listContactos(),
      listConfigRiesgos(),
      listEscalamiento(),
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
    <RiesgosExternosTabs
      acciones={accRes.data}
      responsables={"data" in respRes ? respRes.data : []}
      contactos={"data" in contRes ? contRes.data : []}
      config={"data" in confRes ? confRes.data : []}
      escalamiento={"data" in escRes ? escRes.data : []}
      puedeEditar={puedeEditar}
    />
  )
}
