import { redirect } from "next/navigation"
import {
  getChecklistsMtto,
  getCostosMantenimiento,
  getDiasRuteo,
  getEstadoPlanFlota,
  getGestionMtto,
  getIndisponibilidades,
  getMantenimientos,
  getSiguienteNumeroOt,
  getTableroOperativo,
  getTareasCil,
} from "@/actions/mantenimiento-vehiculos"
import {
  getNeumaticos,
  getAlineaciones,
  getKmFlota,
  getRotaciones,
  getMantenimientoConfig,
} from "@/actions/neumaticos"
import { getGastos, getProveedores } from "@/actions/mantenimiento-gastos"
import {
  getFlotaKpiSeriesExtra,
  getFlotaKpiSnapshots,
  getFlotaMetas,
  getFlotaPlanes,
} from "@/actions/flota-indicadores"
import { IS_MISIONES } from "@/lib/empresa"
import { getProfile } from "@/lib/session"
import { MantenimientoClient } from "./mantenimiento-client"

// Ventana de días ruteados a traer (~13 meses) para la utilización de flota.
function ventanaRuteoDesde() {
  const d = new Date()
  d.setMonth(d.getMonth() - 13)
  return d.toISOString().slice(0, 10)
}

export default async function MantenimientoPage() {
  // Módulo solo Pampeana (la flota de Misiones se gestiona en Cloudfleet).
  if (IS_MISIONES) redirect("/")

  const [
    estadoRes,
    mantenimientosRes,
    costosRes,
    tableroRes,
    checklistsRes,
    neumaticosRes,
    alineacionesRes,
    kmFlotaRes,
    rotacionesRes,
    diasRuteoRes,
    indispRes,
    gastosRes,
    proveedoresRes,
    configRes,
    siguienteNumeroOtRes,
    gestionRes,
    metasRes,
    planesFlotaRes,
    kpiSnapshotsRes,
    kpiExtraRes,
    tareasCilRes,
    profile,
  ] = await Promise.all([
    getEstadoPlanFlota(),
    getMantenimientos({ limit: 200 }),
    getCostosMantenimiento(),
    getTableroOperativo(),
    getChecklistsMtto(),
    getNeumaticos(),
    getAlineaciones(),
    getKmFlota(),
    getRotaciones(),
    getDiasRuteo(ventanaRuteoDesde()),
    getIndisponibilidades(),
    getGastos({ limit: 500 }),
    getProveedores(),
    getMantenimientoConfig(),
    getSiguienteNumeroOt(),
    getGestionMtto(),
    getFlotaMetas(),
    getFlotaPlanes(),
    getFlotaKpiSnapshots(),
    getFlotaKpiSeriesExtra(),
    getTareasCil(),
    getProfile(),
  ])

  if ("error" in estadoRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mantenimiento de camiones</h1>
        <p className="mt-2 text-red-500">Error: {estadoRes.error}</p>
      </div>
    )
  }

  const mantenimientos = "data" in mantenimientosRes ? mantenimientosRes.data : []
  const costos =
    "data" in costosRes ? costosRes.data : { costoMes: 0, costoYTD: 0, porMes: [] }
  const tablero =
    "data" in tableroRes
      ? tableroRes.data
      : {
          programacion: [],
          documentos: [],
          resumen: {
            pendientes: {
              otAbiertas: 0,
              trabajosPendientes: 0,
              novedadesSinResolver: 0,
              ocSinCompra: 0,
            },
            hoy: {
              vehiculosChecklist: 0,
              novedadesCreadas: 0,
              otCreadas: 0,
              otCerradasTecnica: 0,
              otCerradasCompleta: 0,
              llantasInspeccionadas: 0,
            },
            alertas: {
              mantenimiento: { vencidas: 0, hoy: 0, proximas: 0 },
              docsVehiculos: { vencidas: 0, hoy: 0, proximas: 0 },
              docsPersonal: { vencidas: 0, hoy: 0, proximas: 0 },
              docsProveedores: { vencidas: 0, hoy: 0, proximas: 0 },
              proximoChecklist: { vencidas: 0, hoy: 0, proximas: 0 },
              llantas: { profundidadBaja: 0, presionBaja: 0, presionAlta: 0 },
              inventario: { minimaSuperada: 0, maximaSuperada: 0 },
            },
          },
          unidadesBaja: [],
        }
  const checklists =
    "data" in checklistsRes ? checklistsRes.data : { itemsNoOk: [], comentarios: [] }
  const neumaticos = "data" in neumaticosRes ? neumaticosRes.data : []
  const alineaciones = "data" in alineacionesRes ? alineacionesRes.data : []
  const kmFlota = kmFlotaRes.data
  const rotaciones = "data" in rotacionesRes ? rotacionesRes.data : []
  const diasRuteo = "data" in diasRuteoRes ? diasRuteoRes.data : []
  const indisponibilidades = "data" in indispRes ? indispRes.data : []
  const gastos = "data" in gastosRes ? gastosRes.data : []
  const proveedores = "data" in proveedoresRes ? proveedoresRes.data : []
  const siguienteNumeroOt =
    "data" in siguienteNumeroOtRes ? siguienteNumeroOtRes.data : ""
  const gestion =
    "data" in gestionRes
      ? gestionRes.data
      : { novedades: [], repuestos: [], ordenesCompra: [], residuos: [], conteos: [] }
  const flotaMetas = "data" in metasRes ? metasRes.data : []
  const flotaPlanes = "data" in planesFlotaRes ? planesFlotaRes.data : []
  const kpiSnapshots = "data" in kpiSnapshotsRes ? kpiSnapshotsRes.data : []
  const kpiExtraSeries = "data" in kpiExtraRes ? kpiExtraRes.data : {}
  const tareasCil = "data" in tareasCilRes ? tareasCilRes.data : []
  const role = profile?.role ?? "viewer"

  return (
    <MantenimientoClient
      estados={estadoRes.data.estados}
      tareas={estadoRes.data.tareas}
      overrides={estadoRes.data.overrides}
      ultimasLecturas={estadoRes.data.ultimasLecturas}
      historialLecturas={estadoRes.data.historialLecturas}
      mantenimientos={mantenimientos}
      siguienteNumeroOt={siguienteNumeroOt}
      costos={costos}
      tablero={tablero}
      checklists={checklists}
      neumaticos={neumaticos}
      alineaciones={alineaciones}
      kmFlota={kmFlota}
      rotaciones={rotaciones}
      diasRuteo={diasRuteo}
      indisponibilidades={indisponibilidades}
      gastos={gastos}
      proveedores={proveedores}
      gestion={gestion}
      flotaMetas={flotaMetas}
      flotaPlanes={flotaPlanes}
      kpiSnapshots={kpiSnapshots}
      kpiExtraSeries={kpiExtraSeries}
      tareasCil={tareasCil}
      rotacionKm={configRes.rotacion_km}
      puedeEditar={role === "admin" || role === "supervisor"}
      esAdmin={role === "admin"}
    />
  )
}
