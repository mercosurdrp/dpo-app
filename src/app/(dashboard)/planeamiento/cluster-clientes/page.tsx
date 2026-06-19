import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { ClusterClientesClient } from "./cluster-clientes-client"

export const dynamic = "force-dynamic"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Períodos por defecto: trimestre en curso (P2) vs. trimestre anterior (P1),
// igual que el modelo Excel (Q1 vs Q2). Se recalculan según la fecha actual y
// son editables desde la pantalla.
function periodosDefault() {
  const hoy = new Date()
  const y = hoy.getUTCFullYear()
  const qStartMonth = Math.floor(hoy.getUTCMonth() / 3) * 3 // 0,3,6,9
  const p2Desde = new Date(Date.UTC(y, qStartMonth, 1))
  const p1Desde = new Date(Date.UTC(y, qStartMonth - 3, 1))
  const p1Hasta = new Date(Date.UTC(y, qStartMonth, 0)) // último día del trim. anterior
  return {
    p1d: ymd(p1Desde),
    p1h: ymd(p1Hasta),
    p2d: ymd(p2Desde),
    p2h: ymd(hoy),
  }
}

export default async function ClusterClientesPage() {
  if (!IS_MISIONES) notFound()
  await requireAuth()

  return <ClusterClientesClient periodos={periodosDefault()} />
}
