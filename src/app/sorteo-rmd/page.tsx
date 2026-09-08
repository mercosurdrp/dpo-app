import { Gift, Star, Smartphone } from "lucide-react"
import { SorteoFormClient } from "./sorteo-form-client"

export const dynamic = "force-dynamic"

const EMPRESA_CORTO =
  process.env.NEXT_PUBLIC_EMPRESA_NOMBRE_CORTO ?? "Mercosur"

export const metadata = {
  title: `Calificá tu entrega y participá del sorteo - ${EMPRESA_CORTO}`,
  description:
    "Calificá tu entrega en BEES (Rate My Delivery), inscribí tu punto de venta y participá del sorteo.",
}

const PASOS = [
  {
    icon: Star,
    titulo: "Calificá tu entrega en BEES",
    texto:
      "Cuando te llega el pedido, la app BEES te pide puntuar la entrega de 1 a 5 estrellas. Esa puntuación es el RMD (Rate My Delivery) y nos dice cómo llegó tu pedido.",
  },
  {
    icon: Smartphone,
    titulo: "Inscribí tu negocio acá abajo",
    texto: "Nombre del negocio, dirección y un teléfono de contacto. Lleva un minuto.",
  },
  {
    icon: Gift,
    titulo: "Participás del sorteo",
    texto:
      "Entran en el sorteo los puntos de venta inscriptos que calificaron al menos una entrega en BEES desde que se inscribieron.",
  },
]

export default function SorteoRmdPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        <header className="rounded-xl bg-slate-900 px-5 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            {EMPRESA_CORTO} · Distribución
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">
            Calificando tu entrega nos ayudás a mejorar
          </h1>
          <p className="mt-2 text-sm text-slate-200">
            Votá el RMD en BEES cada vez que te llega el pedido, inscribí tu
            punto de venta y participá del sorteo.
          </p>
        </header>

        <ol className="mt-4 space-y-2">
          {PASOS.map((p, i) => (
            <li
              key={p.titulo}
              className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <p.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {i + 1}. {p.titulo}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4">
          <SorteoFormClient />
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Los datos se usan sólo para el sorteo y para mejorar la entrega. No
          se comparten con terceros.
        </p>
      </div>
    </div>
  )
}
