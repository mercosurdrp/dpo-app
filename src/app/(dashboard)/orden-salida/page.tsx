import { requireRole } from "@/lib/session"
import {
  listarEmpleadosOrdenSalida,
  listarFlota,
  obtenerAsignacionesEnRango,
  obtenerNoSaleEnRango,
} from "@/actions/orden-salida"
import { OrdenSalidaClient } from "./orden-salida-client"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}
// Rango precargado: últimos 45 días + 7 hacia adelante.
// Cubre el ciclo operativo Iguazú (24→23) + acumulado del mes corriente +
// edición a corto plazo. Si el usuario navega más atrás, el cliente hace fetch.
function rangoPrecarga(hoy: string): { desde: string; hasta: string } {
  const d = new Date(hoy + "T12:00:00Z")
  const desde = new Date(d); desde.setUTCDate(desde.getUTCDate() - 45)
  const hasta = new Date(d); hasta.setUTCDate(hasta.getUTCDate() + 7)
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
  }
}

export default async function OrdenSalidaPage() {
  await requireRole(["admin", "admin_rrhh", "supervisor"])

  const fecha = hoyISO()
  const { desde, hasta } = rangoPrecarga(fecha)
  const [empRes, flotaRes, asigRes, noSaleRes] = await Promise.all([
    listarEmpleadosOrdenSalida(),
    listarFlota(),
    obtenerAsignacionesEnRango(desde, hasta),
    obtenerNoSaleEnRango(desde, hasta),
  ])

  const empleados = "data" in empRes ? empRes.data : []
  const flota = "data" in flotaRes ? flotaRes.data : []
  const asignaciones = "data" in asigRes ? asigRes.data : []
  const noSale = "data" in noSaleRes ? noSaleRes.data : []

  // Adaptar al shape que espera el cliente.
  const empleadosCliente = empleados.map((e) => ({
    id: e.id,
    legajo: e.legajo,
    numero: null,
    nombre: e.nombre,
    sucursal: (e.sucursal ?? "ELDORADO") as "ELDORADO" | "IGUAZU",
    puesto: (e.puesto as "Chofer" | "Ayudante" | "Depósito") ?? "Ayudante",
    camion_fijo: e.camion_fijo_patente,
    activo: e.activo,
  }))

  const camionesCliente = flota.map((c) => ({
    id: c.id,
    numero: c.numero_unidad,
    patente: c.patente,
    sucursal: c.sucursal,
    capacidad: c.capacidad_kg,
  }))

  return (
    <OrdenSalidaClient
      empleados={empleadosCliente}
      camiones={camionesCliente}
      asignacionesIniciales={asignaciones}
      noSaleIniciales={noSale}
      fechaInicial={fecha}
    />
  )
}
