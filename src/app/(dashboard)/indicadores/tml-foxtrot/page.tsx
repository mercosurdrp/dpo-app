import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getTmlFoxtrotDia } from "@/actions/tml-foxtrot"
import { IS_MISIONES } from "@/lib/empresa"
import { TmlFoxtrotClient } from "./tml-foxtrot-client"

interface PageProps {
  searchParams: Promise<{ fecha?: string }>
}

export default async function TmlFoxtrotPage({ searchParams }: PageProps) {
  if (!IS_MISIONES) redirect("/indicadores/tml")

  const { fecha } = await searchParams
  const res = await getTmlFoxtrotDia(fecha)

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      {"error" in res ? (
        <div>
          <h1 className="text-2xl font-bold text-slate-900">TML — Foxtrot</h1>
          <p className="mt-2 text-red-500">Error: {res.error}</p>
        </div>
      ) : (
        <TmlFoxtrotClient initial={res.data} />
      )}
    </div>
  )
}
