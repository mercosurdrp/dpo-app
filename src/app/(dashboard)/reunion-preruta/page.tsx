import { getReunionKpis, getReunionResumenMensual } from "@/actions/reunion-preruta"
import { ReunionPrerutaClient } from "./reunion-preruta-client"

export default async function ReunionPrerutaPage() {
  const hoy = new Date().toISOString().slice(0, 10)
  const mes = new Date().getMonth() + 1
  const anio = new Date().getFullYear()

  const [kpisRes, mensualRes] = await Promise.all([
    getReunionKpis(hoy),
    getReunionResumenMensual(mes, anio),
  ])

  return (
    <ReunionPrerutaClient
      kpis={"data" in kpisRes ? kpisRes.data : null}
      mensual={"data" in mensualRes ? mensualRes.data : []}
      fechaInicial={hoy}
      mesInicial={mes}
      anioInicial={anio}
    />
  )
}
