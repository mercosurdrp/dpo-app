import { getMarcasDiarias, getResumenMensual, getUltimasMarcas } from "@/actions/asistencia"
import { AsistenciaClient } from "./asistencia-client"

export default async function AsistenciaPage() {
  const hoy = new Date().toISOString().slice(0, 10)
  const mes = new Date().getMonth() + 1
  const anio = new Date().getFullYear()

  const [diariaRes, mensualRes, ultimasRes] = await Promise.all([
    getMarcasDiarias(hoy),
    getResumenMensual(mes, anio),
    getUltimasMarcas(50),
  ])

  return (
    <AsistenciaClient
      diaria={"data" in diariaRes ? diariaRes.data : []}
      mensual={"data" in mensualRes ? mensualRes.data : []}
      ultimas={"data" in ultimasRes ? ultimasRes.data : []}
      fechaInicial={hoy}
      mesInicial={mes}
      anioInicial={anio}
    />
  )
}
