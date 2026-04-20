import { LineaEticaFormClient } from "./linea-etica-form-client"

export const metadata = {
  title: "Línea Ética - Mercosur",
  description: "Canal de denuncias anónimo de Mercosur Región Pampeana",
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
