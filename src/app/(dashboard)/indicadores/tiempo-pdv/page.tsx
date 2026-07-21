import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { IS_MISIONES } from "@/lib/empresa"
import { requireAuth } from "@/lib/session"
import { getTiempoRutaClientes } from "@/actions/tiempo-ruta-cliente"
import { listarPlanesTiempoPdv } from "@/actions/tiempo-pdv-planes"
import { TiempoPdvClient } from "./tiempo-pdv-client"

export const dynamic = "force-dynamic"

// Tiempo por Punto de Venta.
//
// Es el componente más grande del tiempo en ruta y el único que se puede atacar
// cliente por cliente. Vive como indicador propio (y no solo como pestaña de
// Tiempo en Ruta) porque se gestiona distinto: acá el foco es el PDV, no el viaje.
//
// 🚨 Solo Pampeana: depende de `foxtrot_waypoints_visita` + `ventas_diarias_cliente`
// + `dim_localidad_ciudad`, que son tablas del tenant Pampeana. Misiones tiene su
// propio circuito de Foxtrot.
export default async function TiempoPdvPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  if (IS_MISIONES) redirect("/indicadores")
  await requireAuth()

  const sp = await searchParams
  const hoy = new Date().toISOString().slice(0, 10)
  // Por defecto el año corrido: con menos historia la mediana por cliente se arma
  // con 4-5 visitas y no aguanta una discusión con el supervisor.
  const desde = sp.desde ?? `${hoy.slice(0, 4)}-01-01`
  const hasta = sp.hasta ?? hoy

  const [res, planesRes] = await Promise.all([
    getTiempoRutaClientes(desde, hasta),
    listarPlanesTiempoPdv(),
  ])
  const planes = "data" in planesRes ? planesRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tiempo por Punto de Venta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuánto tiempo consume cada cliente y dónde se puede recuperar. Pilar Entrega.
        </p>
      </div>

      {"error" in res ? (
        <p className="text-red-500">Error: {res.error}</p>
      ) : res.data.sinDatos ? (
        <p className="text-sm text-muted-foreground">
          No hay paradas cargadas para el período {desde} a {hasta}.
        </p>
      ) : (
        <TiempoPdvClient datos={res.data} planesIniciales={planes} />
      )}
    </div>
  )
}
