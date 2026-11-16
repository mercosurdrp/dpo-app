import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPospuestos } from "@/actions/comunicacion-cliente"
import { ComunicacionClienteClient } from "./comunicacion-cliente-client"

// Mes actual en hora Argentina (el server corre en UTC).
function mesAr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
}

export default async function ComunicacionClientePage() {
  const mes = mesAr()
  const res = await getPospuestos(mes, 1)

  return (
    <div className="space-y-4 p-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Indicadores
      </Link>
      {"error" in res ? (
        <p className="text-red-500">Error: {res.error}</p>
      ) : (
        <ComunicacionClienteClient mesInicial={mes} inicial={res.data} />
      )}
    </div>
  )
}
