import { Suspense } from "react"
import { getMisCapacitaciones } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { getEstadoReunionHoy } from "@/actions/reunion-preruta"
import { getMiAsistenciaReunionHoy } from "@/actions/reuniones"
import { getMiDashboard } from "@/actions/mi-asistencia"
import { getMiEntrega } from "@/actions/mi-entrega"
import { getMisSobrecargas } from "@/actions/sobrecargas"
import { getMiSector5S } from "@/actions/s5-mi-sector"
import { IS_MISIONES } from "@/lib/empresa"
import { puedeOperarVehiculos, puedeCargarCil } from "@/lib/acarreo-operadores"
import { SuenoSection, SuenoSkeleton } from "@/components/sueno/sueno-section"
import { MisCapacitacionesClient } from "./mis-capacitaciones-client"

export default async function MisCapacitacionesPage() {
  const [result, profile, reunionRes, warehouseRes, logisticaRes, dashRes, entregaRes, sobreRes, mi5sRes] = await Promise.all([
    getMisCapacitaciones(),
    getProfile(),
    getEstadoReunionHoy(),
    getMiAsistenciaReunionHoy("warehouse"),
    getMiAsistenciaReunionHoy("logistica"),
    getMiDashboard(),
    getMiEntrega(),
    IS_MISIONES ? getMisSobrecargas() : Promise.resolve(null),
    // El sorteo mensual de 5S corre solo en Pampeana.
    IS_MISIONES ? Promise.resolve(null) : getMiSector5S(),
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
  const mi5s = mi5sRes && "data" in mi5sRes ? mi5sRes.data : null
  // Maquinistas y demás habilitados por lista: ven las tarjetas de vehículo
  // aunque no estén vinculados a un legajo de chofer/ayudante de entrega.
  const puedeVehiculos = puedeOperarVehiculos(profile?.role, profile?.email)
  // El CIL tiene su propia lista: hay gente habilitada a registrarlo que no
  // carga combustible ni sale a ruta.
  const puedeCil = puedeCargarCil(profile?.role, profile?.email)

  return (
    <>
      <Suspense fallback={<SuenoSkeleton />}>
        <SuenoSection />
      </Suspense>
      <MisCapacitacionesClient
        capacitaciones={result.data}
        nombre={profile?.nombre ?? ""}
        reunion={reunion}
        reunionWarehouse={reunionWarehouse}
        reunionLogistica={reunionLogistica}
        dashboard={dashboard}
        entrega={entrega}
        sobrecargas={sobrecargas}
        puedeVehiculos={puedeVehiculos}
        puedeCil={puedeCil}
        mi5s={mi5s}
      />
    </>
  )
}
