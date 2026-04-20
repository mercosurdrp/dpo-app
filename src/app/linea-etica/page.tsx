import { LineaEticaFormClient } from "./linea-etica-form-client"

const EMPRESA = process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Región Pampeana"
const EMPRESA_CORTO = process.env.NEXT_PUBLIC_EMPRESA_NOMBRE_CORTO ?? "Mercosur"

export const metadata = {
  title: `Línea Ética - ${EMPRESA_CORTO}`,
  description: `Canal de denuncias anónimo de ${EMPRESA}`,
}

export default function LineaEticaPublicPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <LineaEticaFormClient />
      </div>
    </div>
  )
}
