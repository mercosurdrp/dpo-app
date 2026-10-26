import { getBotsData } from "@/actions/bots"
import { requireRole } from "@/lib/session"
import { BotsClient } from "./bots-client"

// La ronda de prueba corre los indicadores del mes + el modelo (~20-40 s).
export const maxDuration = 120

export default async function BotsPage() {
  await requireRole(["admin", "supervisor"])
  const res = await getBotsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bots por pilar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada mañana el bot de cada pilar revisa sus indicadores, le escribe al encargado por
          WhatsApp y deja planes de acción propuestos para los rojos. Acá se aprueban o se descartan.
        </p>
      </div>
      {"error" in res ? (
        <p className="text-red-500">{res.error}</p>
      ) : (
        <BotsClient data={res.data} />
      )}
    </div>
  )
}
