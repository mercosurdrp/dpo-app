import { notFound } from "next/navigation"
import { getSlas } from "@/actions/sla"
import { SLA_PILAR_LABELS } from "@/types/database"
import { SLA_PLANTILLAS, type SlaPlantilla } from "@/lib/sla-plantillas"
import { ImprimirBoton } from "./imprimir-boton"

export default async function ImprimirAcuerdoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const r = await getSlas()
  if ("error" in r) {
    return <div className="p-6 text-sm text-red-600">Error: {r.error}</div>
  }
  const sla = r.data.find((s) => s.id === id)
  if (!sla) notFound()

  // Plantilla específica o cuerpo genérico armado con los datos del SLA.
  const plantilla: SlaPlantilla = SLA_PLANTILLAS[sla.codigo] ?? {
    objeto: sla.descripcion || "—",
    nivelServicio: [],
    medicion: [],
    roles: [],
    gestionIncumplimiento:
      "Ante un incumplimiento se acuerda generar el plan de acción correspondiente y darle seguimiento.",
    vigencia: "Vigente desde la fecha de firma. Revisión anual.",
    firmantes: [sla.parte_cliente, sla.parte_proveedor].filter(
      (x): x is string => !!x,
    ),
  }

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-[18mm] text-slate-900 print:p-0">
      <style>{`@page { size: A4; margin: 16mm; }`}</style>

      <ImprimirBoton />

      {/* Encabezado */}
      <header className="border-b-2 border-slate-800 pb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Acuerdo de Nivel de Servicio (SLA)
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{sla.nombre}</h1>
      </header>

      {/* Metadatos */}
      <table className="mt-4 w-full border-collapse text-sm">
        <tbody>
          <Fila label="Pilar" valor={SLA_PILAR_LABELS[sla.pilar]} />
          <Fila label="Requisito del manual" valor={sla.requisito_manual || "—"} />
          <Fila label="Parte cliente" valor={sla.parte_cliente || "—"} />
          <Fila label="Parte proveedor" valor={sla.parte_proveedor || "—"} />
        </tbody>
      </table>

      {/* Cuerpo */}
      <Seccion titulo="1. Objeto del acuerdo">
        <p>{plantilla.objeto}</p>
      </Seccion>

      {plantilla.nivelServicio.length > 0 && (
        <Seccion titulo="2. Nivel de servicio comprometido">
          <Lista items={plantilla.nivelServicio} />
        </Seccion>
      )}

      {plantilla.medicion.length > 0 && (
        <Seccion titulo="3. Medición">
          <Lista items={plantilla.medicion} />
        </Seccion>
      )}

      {plantilla.roles.length > 0 && (
        <Seccion titulo="4. Roles">
          <ul className="space-y-1">
            {plantilla.roles.map((r) => (
              <li key={r.label}>
                <span className="font-semibold">{r.label}:</span> {r.valor}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="5. Gestión de incumplimientos">
        <p>{plantilla.gestionIncumplimiento}</p>
      </Seccion>

      <Seccion titulo="6. Vigencia y revisión">
        <p>{plantilla.vigencia}</p>
      </Seccion>

      {/* Secciones adicionales (premisas / condiciones operativas) */}
      {plantilla.secciones && plantilla.secciones.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
            7. Premisas y condiciones operativas
          </h2>
          <div className="space-y-4">
            {plantilla.secciones.map((s) => (
              <div key={s.titulo} className="break-inside-avoid text-sm leading-relaxed">
                <h3 className="font-semibold text-slate-800">{s.titulo}</h3>
                {s.parrafos?.map((p, i) => (
                  <p key={i} className="mt-1 text-slate-700">
                    {p}
                  </p>
                ))}
                {s.bullets && s.bullets.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
                    {s.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Firmas */}
      <section className="mt-12 break-inside-avoid">
        <h2 className="mb-8 text-sm font-bold uppercase tracking-wide text-slate-700">
          {plantilla.secciones && plantilla.secciones.length > 0 ? "8" : "7"}.
          Firmas
        </h2>
        <div className="grid grid-cols-2 gap-x-12 gap-y-12">
          {(plantilla.firmantes.length > 0
            ? plantilla.firmantes
            : ["", ""]
          ).map((firmante, i) => (
            <Firma key={`${firmante}-${i}`} rol={firmante} />
          ))}
        </div>
      </section>
    </main>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-[40%] py-1.5 pr-3 font-medium text-slate-500">{label}</td>
      <td className="py-1.5 text-slate-900">{valor}</td>
    </tr>
  )
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-5 break-inside-avoid text-sm leading-relaxed">
      <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-slate-700">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  )
}

function Firma({ rol }: { rol: string }) {
  return (
    <div className="text-sm">
      <div className="h-10 border-b border-slate-800" />
      <p className="mt-1 font-semibold">{rol || " "}</p>
      <p className="text-xs text-slate-500">Aclaración: _______________________</p>
      <p className="text-xs text-slate-500">Fecha: ____ / ____ / ______</p>
    </div>
  )
}
