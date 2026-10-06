import { getEstadoVehiculosHoy, getChecklists } from "@/actions/checklist-vehiculos"
import { getRegistrosCombustible } from "@/actions/combustible"
import { getVehiculos, getChoferes } from "@/actions/registros-vehiculos"
import { getKmFlotaResumen, getAlertasVehiculos } from "@/actions/vehiculos-analytics"
import { getMaestroFlota } from "@/actions/maestro-flota"
// La disponibilidad de flota se mira también desde acá: es la pantalla de
// Vehículos, no un detalle del módulo de mantenimiento.
import {
  getDiasRuteo,
  getIndisponibilidades,
  getMantenimientos,
} from "@/actions/mantenimiento-vehiculos"
import { ventanaOtDesde, ventanaRuteoDesde } from "@/lib/vehiculos/ventanas"
import { IS_MISIONES } from "@/lib/empresa"
import { getProfile } from "@/lib/session"
import { VehiculosClient } from "./vehiculos-client"

export default async function VehiculosPage() {
  const [
    estadoRes,
    checklistsRes,
    combustibleRes,
    vehiculosRes,
    choferesRes,
    kmResumenRes,
    alertasRes,
    maestroRes,
    profile,
    mantenimientosRes,
    diasRuteoRes,
    indispRes,
  ] = await Promise.all([
    getEstadoVehiculosHoy(),
    getChecklists({ limit: 50 }),
    getRegistrosCombustible({ limit: 50 }),
    getVehiculos(),
    getChoferes(),
    getKmFlotaResumen(),
    getAlertasVehiculos(),
    getMaestroFlota(),
    getProfile(),
    // Disponibilidad de flota. En Misiones la flota se gestiona en Cloudfleet y
    // estas tablas están vacías: no se paga la consulta.
    IS_MISIONES
      ? Promise.resolve({ data: [] as never[] })
      : getMantenimientos({ fechaDesde: ventanaOtDesde() }),
    IS_MISIONES
      ? Promise.resolve({ data: [] as never[] })
      : getDiasRuteo(ventanaRuteoDesde()),
    IS_MISIONES ? Promise.resolve({ data: [] as never[] }) : getIndisponibilidades(),
  ])

  if ("error" in estadoRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vehículos</h1>
        <p className="mt-2 text-red-500">Error: {estadoRes.error}</p>
      </div>
    )
  }

  const checklists = "data" in checklistsRes ? checklistsRes.data : []
  const combustible = "data" in combustibleRes ? combustibleRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []
  const choferes = "data" in choferesRes ? choferesRes.data : []
  const kmFlotaResumen = "data" in kmResumenRes ? kmResumenRes.data : null
  const alertas = "data" in alertasRes ? alertasRes.data : []
  const maestro = "data" in maestroRes ? maestroRes.data : null
  // Los mismos roles que acepta `actualizarFichaVehiculo`: si no, el lápiz
  // abriría un formulario que la acción va a rechazar al guardar.
  const canEdit = profile?.role === "admin" || profile?.role === "supervisor"
  const mantenimientos = "data" in mantenimientosRes ? mantenimientosRes.data : []
  const diasRuteo = "data" in diasRuteoRes ? diasRuteoRes.data : []
  const indisponibilidades = "data" in indispRes ? indispRes.data : []

  return (
    <VehiculosClient
      estadoVehiculos={estadoRes.data}
      checklists={checklists}
      combustible={combustible}
      vehiculos={vehiculos}
      choferes={choferes}
      kmFlotaResumen={kmFlotaResumen}
      alertas={alertas}
      maestro={maestro}
      canEdit={canEdit}
      mantenimientos={mantenimientos}
      diasRuteo={diasRuteo}
      indisponibilidades={indisponibilidades}
      conDisponibilidad={!IS_MISIONES}
    />
  )
}
