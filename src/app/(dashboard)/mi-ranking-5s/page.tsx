import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getMiRanking5S } from "@/actions/s5-deposito"
import { MiRanking5SClient } from "./mi-ranking-5s-client"

// "Ranking 3R" — el ranking de ayudantes del bimestre EN CURSO, para que el
// personal de Depósito vea cómo va. La gestión (podio, premios, fórmula)
// sigue en /5s/ayudantes.

export const dynamic = "force-dynamic"

export default async function MiRanking5SPage() {
  await requireModuloPortal("ranking-5s")
  const res = await getMiRanking5S()

  if ("error" in res) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">Ranking 3R</p>
        <p className="mt-2 text-sm text-muted-foreground">{res.error}</p>
      </div>
    )
  }

  return <MiRanking5SClient data={res.data} />
}
