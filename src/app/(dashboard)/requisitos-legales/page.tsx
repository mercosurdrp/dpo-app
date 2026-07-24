import {
  getRaci,
  getUsuarioActualId,
  listCategorias,
  listGestionesAbiertas,
  listRequisitos,
  listResponsablesPosibles,
  puedeEditarRequisitos,
} from "@/actions/requisitos-legales"
import { RequisitosLegalesClient } from "./requisitos-legales-client"

export default async function RequisitosLegalesPage() {
  const [catRes, reqRes, respRes, puedeEditar, raciRes, gestRes, usuarioId] =
    await Promise.all([
      listCategorias(),
      listRequisitos(),
      listResponsablesPosibles(),
      puedeEditarRequisitos(),
      getRaci(),
      listGestionesAbiertas(),
      getUsuarioActualId(),
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
      // Si las tablas de gestión no existen en el tenant, la solapa se oculta
      // sola (mismo criterio que la RACI).
      gestiones={"data" in gestRes ? gestRes.data : null}
      usuarioId={usuarioId}
    />
  )
}
