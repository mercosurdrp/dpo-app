import {
  getRaci,
  listCategorias,
  listRequisitos,
  listResponsablesPosibles,
  puedeEditarRequisitos,
} from "@/actions/requisitos-legales"
import { RequisitosLegalesClient } from "./requisitos-legales-client"

export default async function RequisitosLegalesPage() {
  const [catRes, reqRes, respRes, puedeEditar, raciRes] = await Promise.all([
    listCategorias(),
    listRequisitos(),
    listResponsablesPosibles(),
    puedeEditarRequisitos(),
    getRaci(),
  ])

  if ("error" in catRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Requisitos Legales</h1>
        <p className="mt-2 text-red-500">Error: {catRes.error}</p>
      </div>
    )
  }
  if ("error" in reqRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Requisitos Legales</h1>
        <p className="mt-2 text-red-500">Error: {reqRes.error}</p>
      </div>
    )
  }

  return (
    <RequisitosLegalesClient
      categorias={catRes.data}
      requisitos={reqRes.data}
      responsables={"data" in respRes ? respRes.data : []}
      puedeEditar={puedeEditar}
      raci={"data" in raciRes ? raciRes.data : null}
    />
  )
}
