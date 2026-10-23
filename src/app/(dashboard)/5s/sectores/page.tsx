import { redirect } from "next/navigation"
import { getProfile } from "@/lib/session"
import { getPanelSectores5S, getPeriodosSectores5S } from "@/actions/s5-mi-sector"
import { SectoresClient } from "./sectores-client"

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`
}

/** Acepta "2026-09" o "2026-09-01"; cualquier otra cosa cae al mes en curso. */
function normalizarPeriodo(p: string | undefined): string {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(p ?? "")
  if (!m) return periodoActual()
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return periodoActual()
  return `${m[1]}-${m[2]}-01`
}

export default async function SectoresPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const { periodo: periodoParam } = await searchParams
  const periodo = normalizarPeriodo(periodoParam)
  const hoy = periodoActual()

  const [res, periodos] = await Promise.all([
    getPanelSectores5S(periodo),
    getPeriodosSectores5S(),
  ])

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tareas por sector</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  // Si piden un mes que no está en la lista (p. ej. un futuro), igual se
  // ofrece para que el selector no quede sin valor.
  const opciones = periodos.includes(periodo)
    ? periodos
    : [periodo, ...periodos].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  return (
    <SectoresClient
      sectores={res.data}
      periodo={periodo}
      periodos={opciones}
      esMesActual={periodo === hoy}
      puedeEditar={profile.role === "admin" || profile.role === "auditor"}
    />
  )
}
