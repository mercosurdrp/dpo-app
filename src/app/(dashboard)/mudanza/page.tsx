import {
  getConfig,
  getUsuarioActualId,
  listAvances,
  listEquipo,
  listGastos,
  listPartidas,
  listPerfilesActivos,
  listTareas,
  puedeEditarMudanza,
} from "@/actions/mudanza"
import { MudanzaClient } from "./mudanza-client"

export const dynamic = "force-dynamic"

export default async function MudanzaPage() {
  const [cfgRes, tareasRes, equipoRes, avancesRes, partidasRes, gastosRes, perfilesRes, puedeEditar, usuarioId] =
    await Promise.all([
      getConfig(),
      listTareas(),
      listEquipo(),
      listAvances(),
      listPartidas(),
      listGastos(),
      listPerfilesActivos(),
      puedeEditarMudanza(),
      getUsuarioActualId(),
    ])

  if ("error" in cfgRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mudanza</h1>
        <p className="mt-2 text-red-500">Error: {cfgRes.error}</p>
      </div>
    )
  }
  if (cfgRes.data === null) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mudanza</h1>
        <p className="mt-2 text-slate-600">
          El módulo todavía no está habilitado en esta base: falta aplicar la migración{" "}
          <code>20260929150000_mudanza.sql</code>.
        </p>
      </div>
    )
  }
  if ("error" in tareasRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mudanza</h1>
        <p className="mt-2 text-red-500">Error: {tareasRes.error}</p>
      </div>
    )
  }

  return (
    <MudanzaClient
      config={cfgRes.data}
      tareas={tareasRes.data}
      equipo={"data" in equipoRes ? equipoRes.data : []}
      avances={"data" in avancesRes ? avancesRes.data : []}
      partidas={"data" in partidasRes ? partidasRes.data : []}
      gastos={"data" in gastosRes ? gastosRes.data : []}
      perfiles={"data" in perfilesRes ? perfilesRes.data : []}
      puedeEditar={puedeEditar}
      usuarioId={usuarioId}
    />
  )
}
