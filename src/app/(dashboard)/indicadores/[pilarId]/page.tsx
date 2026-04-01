import { getIndicadoresPorPilar } from "@/actions/indicadores"
import { PilarIndicadoresClient } from "./pilar-indicadores-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface Props {
  params: Promise<{ pilarId: string }>
}

export default async function PilarIndicadoresPage({ params }: Props) {
  const { pilarId } = await params
  const res = await getIndicadoresPorPilar(pilarId)

  if ("error" in res) {
    return (
      <div>
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Error</h1>
        <p className="mt-2 text-red-500">{res.error}</p>
      </div>
    )
  }

  return <PilarIndicadoresClient pilar={res.data.pilar} bloques={res.data.bloques} />
}
