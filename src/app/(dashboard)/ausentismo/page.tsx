import { requireRole } from "@/lib/session"
import {
  listarEmpleadosOpciones,
  listarEventos,
  resumenMes,
} from "@/actions/ausentismo"
import { AusentismoClient } from "./ausentismo-client"

export const dynamic = "force-dynamic"

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default async function AusentismoPage() {
  await requireRole(["admin", "admin_rrhh"])

  const ym = currentYearMonth()
  const [empleadosRes, eventosRes, resumenRes] = await Promise.all([
    listarEmpleadosOpciones(),
    listarEventos(),
    resumenMes(ym),
  ])

  return (
    <AusentismoClient
      empleados={"data" in empleadosRes ? empleadosRes.data : []}
      eventosIniciales={"data" in eventosRes ? eventosRes.data : []}
      resumenInicial={"data" in resumenRes ? resumenRes.data : null}
      yearMonthInicial={ym}
    />
  )
}
