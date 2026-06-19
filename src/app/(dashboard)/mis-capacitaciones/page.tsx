import { getMisCapacitaciones } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { getEstadoReunionHoy } from "@/actions/reunion-preruta"
import { getMiAsistenciaReunionHoy } from "@/actions/reuniones"
import { getMiDashboard } from "@/actions/mi-asistencia"
import { getMiEntrega } from "@/actions/mi-entrega"
import { getMisSobrecargas } from "@/actions/sobrecargas"
import { IS_MISIONES } from "@/lib/empresa"
import { SuenoSection } from "@/components/sueno/sueno-section"
import { MisCapacitacionesClient } from "./mis-capacitaciones-client"

export default async function MisCapacitacionesPage() {
  const [result, profile, reunionRes, warehouseRes, logisticaRes, dashRes, entregaRes, sobreRes] = await Promise.all([
    getMisCapacitaciones(),
    getProfile(),
    getEstadoReunionHoy(),
    getMiAsistenciaReunionHoy("warehouse"),
    getMiAsistenciaReunionHoy("logistica"),
    getMiDashboard(),
    getMiEntrega(),
    IS_MISIONES ? getMisSobrecargas() : Promise.resolve(null),
  ])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi Panel</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const reunion = "data" in reunionRes ? reunionRes.data : { marcado: false, hora_checkin: null, minutos: null }
  const reunionWarehouse = "data" in warehouseRes ? warehouseRes.data : null
  const reunionLogistica = "data" in logisticaRes ? logisticaRes.data : null
  const dashboard = "data" in dashRes ? dashRes.data : null
  const entrega = "data" in entregaRes ? entregaRes.data : null
  const sobrecargas = sobreRes && "data" in sobreRes ? sobreRes.data : null

  return (
    <>
      <SuenoSection />
      <MisCapacitacionesClient
        capacitaciones={result.data}
        nombre={profile?.nombre ?? ""}
        reunion={reunion}
        reunionWarehouse={reunionWarehouse}
        reunionLogistica={reunionLogistica}
        dashboard={dashboard}
        entrega={entrega}
        sobrecargas={sobrecargas}
      />
    </>
  )
}
