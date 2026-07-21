import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getOnTime } from "@/actions/on-time"
import { OnTimeClient } from "./on-time-client"

// "Hoy" en hora Argentina (el server corre en UTC).
function anioAr(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
    }).format(new Date()),
  )
}

export default async function OnTimePage() {
  const anio = anioAr()
  const res = await getOnTime(anio)

  if ("error" in res) {
    return (
      <div className="p-4">
        <Link
          href="/indicadores"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Indicadores
        </Link>
        <p className="text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Indicadores
      </Link>
      <OnTimeClient
        anio={anio}
        onTime={res.data.onTime}
        vh={res.data.vh}
        vhError={res.data.vhError}
      />
    </div>
  )
}
